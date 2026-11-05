"""Newsletter calls to action use the public archive directly, without short links."""
from lxml import html
from markupsafe import Markup, escape as escape_html
from urllib.parse import urlsplit, urlunsplit
import re
from odoo import api, fields, models, _
from odoo.exceptions import UserError


def newsletter_destination(base_url):
    parts = urlsplit(base_url)
    return urlunsplit((parts.scheme, parts.netloc, '/elks/newsletter', '', ''))


def direct_newsletter_links(markup, destination):
    if not markup:
        return markup
    root = html.fragment_fromstring(str(markup), create_parent='div')
    # Bootstrap alert/flex layouts and icon fonts are unreliable in mail clients.
    # Preserve the author's text/links, but use one stable presentation cell.
    alerts=root.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " alert-info ") or contains(concat(" ", normalize-space(@class), " "), " s_alert ")]')
    outer_alerts=[node for node in alerts if not any(parent in alerts for parent in node.iterancestors())]
    for alert in outer_alerts:
        for icon in list(alert.xpath('.//img|.//*[contains(concat(" ", normalize-space(@class), " "), " fa ")]')):
            icon.drop_tree()
        table=html.Element('table',role='presentation',width='100%',cellpadding='0',cellspacing='0',border='0')
        table.set('style','width:100%;border-collapse:separate;margin:16px 0;')
        row=html.Element('tr');cell=html.Element('td',align='center',bgcolor='#d8eef2')
        cell.set('style','padding:18px 20px;border:1px solid #b9dfe6;border-radius:6px;color:#234953;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;text-align:center;')
        content=alert.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " s_alert_content ")]')
        original=content[0] if content else alert
        cell.text=original.text
        for child in list(original):cell.append(child)
        # Paragraphs get explicit typography instead of inheriting web-editor styles.
        for node in cell.xpath('.//p|.//div|.//span'):
            node.attrib.pop('class',None)
            node.set('style','margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#234953;text-align:center;')
        row.append(cell);table.append(row)
        if alert.tag in ('td','th'):
            alert.clear();alert.append(table)
        else:
            table.tail=alert.tail;alert.getparent().replace(alert,table)
    for anchor in root.xpath('.//a[@href]'):
        href = anchor.get('href', '')
        path = urlsplit(href).path
        classes = anchor.get('class', '').split()
        if ('o_unsubscribe' in classes or '/unsubscribe' in path or
                path.startswith(('/view', '/cards')) or
                href.lower().startswith(('mailto:', 'tel:', 'sms:'))):
            continue
        anchor.set('href', destination)
    result = str(escape_html(root.text or '')) + ''.join(html.tostring(child, encoding='unicode') for child in root)
    # Odoo wraps this result in its outgoing mail layout. Losing Markup makes
    # that wrapper escape every tag, so recipients see the HTML source.
    return Markup(result) if isinstance(markup, Markup) else result


def is_newsletter_digest(markup):
    if not markup:
        return False
    root=html.fragment_fromstring(str(markup),create_parent='div')
    return any(urlsplit(anchor.get('href','')).path.rstrip('/') == '/elks/newsletter'
               and 'newsletter' in anchor.text_content().lower()
               for anchor in root.xpath('.//a[@href]'))


def referenced_tracker_codes(markup):
    codes = set()
    root = html.fragment_fromstring(str(markup or '<div></div>'), create_parent='div')
    for anchor in root.xpath('.//a[@href]'):
        path = urlsplit(anchor.get('href')).path
        if path.startswith('/r/'):
            code = path[3:].strip('/')
            if code:
                codes.add(code)
                codes.add(re.sub(r'/m/\d+$', '', code))
    return sorted(codes)


class NewsletterDirectLinks(models.AbstractModel):
    _inherit = 'mail.render.mixin'

    @api.model
    def _shorten_links(self, html, link_tracker_vals, blacklist=None, base_url=None):
        mailing_id = link_tracker_vals.get('mass_mailing_id')
        issue = self.env['elks.newsletter.issue'].sudo().search([
            ('marketing_mailing_id', '=', mailing_id)], limit=1) if mailing_id else False
        if issue or is_newsletter_digest(html):
            website = self.env['website'].search([('company_id', '=', self.env.company.id)], limit=1)
            origin = website.get_base_url() if website else self.get_base_url()
            return direct_newsletter_links(html, newsletter_destination(origin))
        return super()._shorten_links(html, link_tracker_vals, blacklist=blacklist, base_url=base_url)


class NewsletterTrackerDestination(models.Model):
    _inherit = 'link.tracker'

    newsletter_redirect_url = fields.Char(string='Repaired newsletter destination', copy=False,
        help='Keeps existing tracking codes and clicks while redirecting newsletter readers to the archive.')

    @api.depends('url', 'newsletter_redirect_url')
    def _compute_redirected_url(self):
        super()._compute_redirected_url()
        for tracker in self:
            if tracker.newsletter_redirect_url:
                tracker.redirected_url = tracker.newsletter_redirect_url


class NewsletterMailingFormatting(models.Model):
    _inherit = 'mailing.mailing'

    is_elks_newsletter_digest = fields.Boolean(compute='_compute_is_elks_newsletter_digest')

    @api.depends('body_html', 'body_arch')
    def _compute_is_elks_newsletter_digest(self):
        for mailing in self:
            mailing.is_elks_newsletter_digest = is_newsletter_digest(mailing.body_html or mailing.body_arch)


    def action_fix_newsletter_formatting(self):
        self.ensure_one()
        self.check_access('write')
        if self.state != 'draft':
            raise UserError(_('Only draft emails can have their formatting updated. Duplicate a sent mailing to prepare a corrected draft.'))
        if not is_newsletter_digest(self.body_html or self.body_arch):
            raise UserError(_('This action is for newsletter emails containing a link to /elks/newsletter.'))
        website=self.env['website'].search([('company_id','=',self.env.company.id)],limit=1)
        destination=newsletter_destination(website.get_base_url() if website else self.get_base_url())
        self.write({'body_arch':direct_newsletter_links(self.body_arch,destination),
                    'body_html':direct_newsletter_links(self.body_html,destination)})
        return {'type':'ir.actions.client','tag':'reload'}
