"""Paper Studio: optional structured editions alongside the legacy layout."""
import json
from pathlib import Path

from markupsafe import Markup
from lxml import html as lxml_html
from odoo import api, fields, models, _
from odoo.exceptions import UserError

from .paper_document import initial_document, normalise_document

ASSETS = Path(__file__).resolve().parent.parent / 'static/src/studio'


class ElksBulletinIssueStudio(models.Model):
    _inherit = 'elks.newsletter.issue'

    editor_mode = fields.Selection([('legacy', 'Original editor'), ('paper', 'Paper Studio')],
                                   default='legacy', required=True, string='PDF Layout')
    studio_document = fields.Json(copy=True)
    studio_revision = fields.Integer(default=0, copy=False)

    def copy(self, default=None):
        self.ensure_one()
        defaults = dict(default or {})
        if self.editor_mode == 'paper':
            defaults.setdefault('state', 'draft')
        return super().copy(defaults)

    @api.model_create_multi
    def create(self, vals_list):
        documents = [vals.pop('studio_document', None) for vals in vals_list]
        records = super().create(vals_list)
        for record, document in zip(records, documents):
            if document is not None:
                record.write({'studio_document': document})
        return records

    def write(self, vals):
        if not {'studio_document', 'page_size', 'editor_mode'} & vals.keys():
            return super().write(vals)
        self.check_access('write')
        for issue in self.sorted('id'):
            issue._studio_lock()
            values = dict(vals)
            if issue.state == 'final' and issue.editor_mode == 'paper' and values.get('state') != 'draft':
                raise UserError(_('Reset this issue to Draft before changing its paper edition.'))
            if 'studio_document' in values:
                if issue.state == 'final':
                    raise UserError(_('Reset this issue to Draft before editing its paper pages.'))
                try:
                    values['studio_document'] = normalise_document(values['studio_document'], issue._studio_resolve_dynamic)
                    values['studio_document']['metadata'] = {
                        'title': issue.name, 'lodge': issue.lodge_name or '',
                        'month': issue.issue_date.strftime('%B %Y') if issue.issue_date else '',
                    }
                except (ValueError, TypeError) as error:
                    raise UserError(str(error)) from error
            values['studio_revision'] = issue.studio_revision + 1
            super(ElksBulletinIssueStudio, issue).write(values)
        return True

    def _studio_lock(self):
        self.ensure_one()
        self.env.cr.execute('SELECT id FROM elks_newsletter_issue WHERE id = %s FOR UPDATE', [self.id])
        self.invalidate_recordset(['studio_revision', 'studio_document', 'editor_mode', 'page_size', 'state'])

    def _studio_resolve_dynamic(self, source):
        source, _, officer = source.partition(':')
        templates = {'masthead': 'masthead', 'message': 'message', 'section_bar': 'section_bar',
                     'mailing': 'mailing', 'new_members': 'new_members', 'in_memoriam': 'in_memoriam',
                     'officers': 'officers', 'calendar': 'calendar', 'charity': 'charity',
                     'leaderboard': 'leaderboard_full', 'events': 'events',
                     'upcoming_events': 'upcoming_events', 'project_dollars': 'project_dollars',
                     'delinquents': 'delinquents'}
        template = templates.get(source)
        if not template:
            raise UserError(_('This bulletin widget is not supported.'))
        markup = self.env['ir.qweb']._render('elks_newsletter.s_elks_' + template, {})
        markup = str(markup)
        if source == 'message' and officer:
            markup = markup.replace('o_elks_officer_exalted_ruler', 'o_elks_officer_' + officer)
        rendered = self._render_print_body_inner(markup)
        fragment = lxml_html.fragment_fromstring(str(rendered), create_parent='div')
        # Preserve the legacy widget's design, with editable content slots.
        slots = {'masthead': './/*[@data-elks-field="lodge_name"]',
                 'message': './/*[contains(concat(" ", @class, " "), " s_elks_story_flow ")]',
                 'section_bar': './/*[contains(concat(" ", @class, " "), " container ")]/div',
                 'mailing': './/*[contains(concat(" ", @class, " "), " col-md-8 ")]/div'}
        for node in fragment.xpath(slots.get(source, './/*[@data-no-slot]')):
            node.set('data-paper-slot', 'html')
            if source == 'masthead':
                node.text = self.lodge_name or ''
        if source == 'mailing':
            settings = self.lodge_settings_id
            contacts = [self.lodge_name or '', 'B.P.O.E. #' + (self.lodge_number or ''),
                        getattr(settings, 'lodge_address', '') or '',
                        ' '.join(filter(None, [self.city_state or '', getattr(settings, 'lodge_zip', '') or ''])),
                        getattr(settings, 'lodge_phone', '') or '', getattr(settings, 'frs_email', '') or '']
            for node in fragment.xpath('.//*[@data-paper-slot="html"]'):
                for child in list(node): node.remove(child)
                node.text = None
                for line in filter(None, contacts):
                    child = lxml_html.Element('div'); child.text = line; node.append(child)
            for node in fragment.xpath('.//*[contains(concat(" ", @class, " "), " col-md-4 ")]/div'):
                node.set('data-paper-slot', 'html2')
        # Publisher fragments can carry Odoo's generic report-page class. Only
        # the Studio sheets own pagination; an inner calendar is not a page.
        for node in fragment.xpath('.//*[@class]'):
            node.set('class', ' '.join(cls for cls in node.get('class').split() if cls != 'page'))
        return ''.join(lxml_html.tostring(child, encoding='unicode') for child in fragment)

    def action_open_paper_studio(self):
        self.ensure_one()
        self.check_access('read')
        return {'type': 'ir.actions.client', 'tag': 'elks_newsletter.paper_studio',
                'name': _('Paper Studio'), 'params': {'issue_id': self.id}}

    @api.model
    def action_new_paper_newsletter(self):
        issue = self.create({})
        issue.write({'studio_document': initial_document(issue.name), 'editor_mode': 'paper'})
        return issue.action_open_paper_studio()

    def action_studio_load(self):
        self.ensure_one()
        self.check_access('read')
        metadata = (self.studio_document or {}).get('metadata', {})
        return {'document': self.studio_document or normalise_document(initial_document(self.name)),
                'revision': self.studio_revision, 'paperSize': self.page_size,
                'mode': self.editor_mode, 'readonly': self.state == 'final',
                'title': metadata.get('title', self.name), 'lodge': metadata.get('lodge', self.lodge_name or ''),
                'month': metadata.get('month', self.issue_date.strftime('%B %Y') if self.issue_date else '')}

    def action_studio_resolve(self, document):
        """Read live Odoo content without saving or discarding the editor's text."""
        self.ensure_one()
        self.check_access('read')
        if self.state == 'final':
            raise UserError(_('Reset this edition to Draft before refreshing its data.'))
        try:
            resolved = normalise_document(document, self._studio_resolve_dynamic)
        except ValueError as error:
            raise UserError(str(error)) from error
        return [{'id': block['id'], 'source': block['source'], 'resolvedHTML': block['resolvedHTML']}
                for page in resolved['pages'] for block in page['blocks']
                if block['kind'] in ('dynamic', 'widget')]

    def action_studio_save(self, document, paper_size, revision):
        self.ensure_one()
        self.check_access('write')
        self._studio_lock()
        if revision != self.studio_revision:
            raise UserError(_('This issue changed in another window. Reload it before saving to avoid overwriting those changes.'))
        if paper_size not in ('letter', 'legal'):
            raise UserError(_('Choose US Letter or US Legal.'))
        self.write({'studio_document': document, 'page_size': paper_size, 'editor_mode': 'paper'})
        return self.action_studio_load()

    def _studio_print_markup(self):
        self.ensure_one()
        if not self.studio_document:
            raise UserError(_('Open Paper Studio and save its pages before printing this edition.'))
        payload = self.action_studio_load()
        # JSON is data, never executable markup, even if an article contains a
        # literal closing script tag. Both contexts use this same JS renderer.
        serialised = json.dumps(payload, ensure_ascii=True).replace('<', '\\u003c')
        css = (ASSETS / 'paper.css').read_text(encoding='utf-8')
        renderer = (ASSETS / 'renderer.js').read_text(encoding='utf-8')
        return Markup('<style>' + css + '</style><div class="elks-paper-mount">'
                      '<script type="application/json" class="elks-paper-data">'
                      + serialised + '</script></div><script>' + renderer
                      + '\nwindow.ElksPaperRenderer.mountAll();</script>')

    def _render_print_body(self):
        self.ensure_one()
        if self.editor_mode == 'paper':
            return self._studio_print_markup()
        return super()._render_print_body()
