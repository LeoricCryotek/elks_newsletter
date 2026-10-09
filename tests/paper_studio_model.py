"""Run the actual Studio model methods against an in-memory ORM boundary."""
import json
import ast
import re
from datetime import date
from lxml import etree
from pathlib import Path
import unittest

from lxml import html as lxml_html
from paper_layout_model import load_methods, ROOT
from studio_document_test import paper


class StudioError(Exception): pass


class MemoryIssue:
    def ensure_one(self): pass
    def check_access(self, operation):
        if getattr(self, 'denied', False): raise PermissionError(operation)
    def sorted(self, key): return [self]
    def _studio_lock(self): pass
    def write(self, values):
        for key, value in values.items(): setattr(self, key, value)
        return True


Issue = load_methods('models/elks_newsletter_studio.py', 'ElksBulletinIssueStudio',
                     {'write', 'action_studio_load', 'action_studio_save', '_studio_print_markup', '_studio_resolve_dynamic', 'action_studio_resolve', 'action_new_paper_newsletter'},
                     {'normalise_document': paper.normalise_document, 'initial_document': paper.initial_document,
                      'UserError': StudioError, '_': lambda value: value, 'Markup': str, 'json': json,
                      'lxml_html': lxml_html, 'ASSETS': ROOT / 'static/src/studio'}, MemoryIssue)


class StudioModelTests(unittest.TestCase):
    def issue(self):
        issue = Issue()
        issue.name = 'October issue'; issue.lodge_name = 'Lodge 896'; issue.issue_date = None
        issue.studio_document = None; issue.studio_revision = 0
        issue.page_size = 'letter'; issue.editor_mode = 'legacy'; issue.state = 'draft'
        class QWeb:
            def _render(self, template, values): return '<div class="page elks-cal"><p>Saved calendar</p></div>'
        issue.env = {'ir.qweb': QWeb()}
        issue._render_print_body_inner = lambda markup: markup
        issue._dynamic_block_html = lambda source: '<div class="page elks-cal"><p>Saved calendar</p></div>'
        return issue

    def test_new_paper_list_button_uses_recordset_dispatch_and_creates_one_issue(self):
        source = ast.parse((ROOT / 'models/elks_newsletter_studio.py').read_text())
        method = next(node for node in ast.walk(source) if isinstance(node, ast.FunctionDef) and node.name == 'action_new_paper_newsletter')
        self.assertFalse(method.decorator_list, 'Object-button RPC must consume ids as a recordset, not pass them to an @api.model method')
        for selected_ids in [[], [42], [42, 43]]:
            button_records = self.issue()
            created = self.issue()
            calls = []
            def create(values):
                calls.append(values)
                return created
            button_records.create = create
            created.action_open_paper_studio = lambda: {'type': 'ir.actions.client', 'params': {'issue_id': 99}}
            action = button_records.action_new_paper_newsletter()
            self.assertEqual(calls, [{}])
            self.assertEqual(action['params']['issue_id'], 99)
            self.assertEqual(created.editor_mode, 'paper')
            self.assertIsNotNone(created.studio_document)
            self.assertIsNone(button_records.studio_document)

    def test_saving_selects_paper_and_conflicting_revision_cannot_overwrite(self):
        issue = self.issue()
        saved = issue.action_studio_save(paper.initial_document('Issue'), 'legal', 0)
        self.assertEqual(saved['revision'], 1)
        self.assertEqual(issue.page_size, 'legal')
        self.assertEqual(issue.editor_mode, 'paper')
        with self.assertRaises(StudioError): issue.action_studio_save(paper.initial_document('Other'), 'letter', 0)
        self.assertEqual(issue.studio_document['pages'][0]['blocks'][0]['html'], '<p>Issue</p>')

    def test_load_and_save_enforce_permissions(self):
        issue = self.issue(); issue.denied = True
        with self.assertRaises(PermissionError): issue.action_studio_load()
        with self.assertRaises(PermissionError): issue.action_studio_save(paper.initial_document('Issue'), 'letter', 0)

    def test_saved_snapshot_does_not_follow_lodge_name_changes(self):
        issue = self.issue(); issue.action_studio_save(paper.initial_document('Issue'), 'letter', 0)
        issue.lodge_name = 'Changed lodge'
        self.assertEqual(issue.action_studio_load()['lodge'], 'Lodge 896')

    def test_final_paper_edition_is_locked(self):
        issue = self.issue(); issue.action_studio_save(paper.initial_document('Issue'), 'letter', 0); issue.state = 'final'
        for change in [{'page_size': 'legal'}, {'editor_mode': 'legacy'}, {'studio_document': paper.initial_document('Replacement')}]:
            with self.assertRaises(StudioError): issue.write(change)
        self.assertTrue(issue.action_studio_load()['readonly'])

    def test_print_uses_shared_renderer_without_re_resolving_data(self):
        issue = self.issue()
        document = paper.initial_document('Issue')
        document['pages'][0]['blocks'].append({'id': 'calendar', 'kind': 'dynamic', 'source': 'calendar'})
        issue.action_studio_save(document, 'letter', 0)
        issue._dynamic_block_html = lambda source: (_ for _ in ()).throw(AssertionError('Export must not refresh saved data'))
        markup = str(issue._studio_print_markup())
        self.assertIn('Saved calendar', markup)
        self.assertIn('window.ElksPaperRenderer.mountAll()', markup)
        self.assertIn('elks-paper-sheet', markup)
        self.assertNotIn('class=\\"page ', markup)

    def test_masthead_uses_real_template_and_resolves_lodge_images(self):
        issue = self.issue()
        Legacy = load_methods('models/elks_newsletter_issue.py', 'ElksBulletinIssue',
                              {'_render_print_body_inner'}, {'lxml_html': lxml_html, 'etree': etree, 're': re, 'Markup': str})
        issue._render_print_body_inner = Legacy._render_print_body_inner.__get__(issue)
        issue._wrap_emoji_fonts = lambda root: None
        issue._bake_box_border = lambda root: None
        tree = etree.parse(str(ROOT / 'views/snippets/elks_newsletter_snippets.xml'))
        class QWeb:
            def _render(self, template, values):
                node = tree.xpath('//template[@id="s_elks_masthead"]')[0]
                return ''.join(etree.tostring(child, encoding='unicode') for child in node)
        issue.env = {'ir.qweb': QWeb()}
        issue.lodge_logo_bw = b'BWLOGO'; issue.lodge_logo = b'COLORLOGO'; issue.lodge_building = b'BUILDING'
        issue.lodge_website = 'https://lodge.example'; issue.lodge_number = '896'
        issue.city_state = 'Lewiston, Idaho'; issue.issue_ref = 'Volume 120, No. 10'; issue.issue_date = date(2026, 10, 1)
        root = lxml_html.fromstring(issue._studio_resolve_dynamic('masthead'))
        self.assertEqual(root.xpath('.//*[@data-elks-field="logo_lodge_bw"]')[0].get('src'), 'data:image/png;base64,BWLOGO')
        self.assertEqual(root.xpath('.//*[@data-elks-field="lodge_building_entry"]')[0].get('src'), 'data:image/png;base64,BUILDING')
        self.assertIn('October 2026', root.text_content())
        self.assertIn('https://lodge.example', root.text_content())
        self.assertIn('Lodge 896', root.text_content())
        issue.lodge_logo_bw = False
        self.assertIn('data:image/png;base64,COLORLOGO', issue._studio_resolve_dynamic('masthead'))
        issue.lodge_logo = False; issue.lodge_building = False
        markup = issue._studio_resolve_dynamic('masthead')
        self.assertNotIn('placeholder.png', markup)
        self.assertNotIn('<img', markup)

    def test_live_resolution_does_not_save_and_enforces_access_and_final_lock(self):
        issue = self.issue()
        doc = paper.initial_document('Issue')
        doc['pages'][0]['blocks'].append({'id': 'live', 'kind': 'dynamic', 'source': 'calendar'})
        blocks = issue.action_studio_resolve(doc)
        self.assertIn('Saved calendar', blocks[0]['resolvedHTML'])
        self.assertIsNone(issue.studio_document)
        self.assertEqual(issue.studio_revision, 0)
        issue.denied = True
        with self.assertRaises(PermissionError): issue.action_studio_resolve(doc)
        issue.denied = False; issue.state = 'final'
        with self.assertRaises(StudioError): issue.action_studio_resolve(doc)

    def test_print_rejects_unsaved_paper_document(self):
        with self.assertRaises(StudioError): self.issue()._studio_print_markup()


if __name__ == '__main__': unittest.main()
