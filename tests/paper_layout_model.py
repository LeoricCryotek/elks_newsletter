"""Exercise paper-size onchange and report dispatch without an Odoo database.

Run with Python and lxml installed. Browser/PDF checks are in paper_layout.mjs.
"""
import ast
import logging
from pathlib import Path
from types import SimpleNamespace
import unittest

from lxml import html as lxml_html

ROOT = Path(__file__).resolve().parents[1]


def load_methods(file, model, methods, namespace, base=object):
    source = ast.parse((ROOT / file).read_text())
    original = next(node for node in source.body if isinstance(node, ast.ClassDef) and node.name == model)
    selected = [node for node in original.body if isinstance(node, ast.FunctionDef) and node.name in methods]
    for node in selected:
        node.decorator_list = []
    namespace['TestBase'] = base
    module = ast.Module(body=[ast.ClassDef(name=model, bases=[ast.Name(id='TestBase', ctx=ast.Load())], keywords=[], body=selected, decorator_list=[])], type_ignores=[])
    exec(compile(ast.fix_missing_locations(module), str(ROOT / file), 'exec'), namespace)
    return namespace[model]


Issue = load_methods('models/elks_newsletter_issue.py', 'ElksBulletinIssue',
                     {'_onchange_page_size_canvas'}, {'lxml_html': lxml_html})


class PrintError(Exception):
    pass


class LegacyReport:
    def _render_qweb_pdf(self, report_ref, res_ids=None, data=None):
        return b'legacy', 'pdf'


Report = load_methods('models/ir_actions_report.py', 'IrActionsReport',
                      {'_render_qweb_pdf'}, {'weasyprint': None,
                      'BULLETIN_REPORTS': ('elks_newsletter.report_bulletin_letter', 'elks_newsletter.report_bulletin_legal'),
                      'UserError': PrintError, '_logger': logging.getLogger('paper-layout-test')}, LegacyReport)


class PaperLayoutTests(unittest.TestCase):
    def test_switching_paper_size_preserves_content_and_other_classes(self):
        issue = Issue()
        issue.body_arch = '<div class="o_layout o_elks_newsletter custom"><p style="font-size:24px">Keep this text</p><img src="/web/image/42"/></div>'
        issue.page_size = 'legal'
        issue._onchange_page_size_canvas()
        root = lxml_html.fromstring(issue.body_arch)
        self.assertIn('o_elks_legal', root.get('class').split())
        self.assertEqual(root.find('p').get('style'), 'font-size:24px')
        self.assertEqual(root.find('img').get('src'), '/web/image/42')
        issue.page_size = 'letter'
        issue._onchange_page_size_canvas()
        root = lxml_html.fromstring(issue.body_arch)
        self.assertNotIn('o_elks_legal', root.get('class').split())
        self.assertIn('custom', root.get('class').split())
        self.assertEqual(root.text_content(), 'Keep this text')

    def report(self, setting=None, report_name='elks_newsletter.report_bulletin_letter'):
        report = Report()
        config = SimpleNamespace(sudo=lambda: config, get_param=lambda key, default=None: setting if setting is not None else default)
        report.env = {'ir.config_parameter': config, 'elks.newsletter.issue': SimpleNamespace(browse=lambda ids: SimpleNamespace(filtered=lambda fn: []))}
        report._get_report = lambda ref: SimpleNamespace(report_name=report_name)
        report._render_newsletter_chromium = lambda *args: (b'chromium', 'pdf')
        return report

    def test_both_paper_sizes_default_to_chromium(self):
        for name in ['elks_newsletter.report_bulletin_letter', 'elks_newsletter.report_bulletin_legal']:
            self.assertEqual(self.report(report_name=name)._render_qweb_pdf(name, [42]), (b'chromium', 'pdf'))

    def test_browser_failure_cannot_silently_change_layout(self):
        report = self.report()
        def fail(*args):
            raise RuntimeError('browser unavailable')
        report._render_newsletter_chromium = fail
        with self.assertLogs('paper-layout-test', level='ERROR'):
            with self.assertRaises(PrintError):
                report._render_qweb_pdf('newsletter', [42])

    def test_paper_studio_uses_chromium_with_an_explicit_legacy_setting(self):
        report = self.report(setting='wkhtmltopdf')
        report.env['elks.newsletter.issue'] = SimpleNamespace(
            browse=lambda ids: SimpleNamespace(filtered=lambda fn: [SimpleNamespace(editor_mode='paper')]))
        self.assertEqual(report._render_qweb_pdf('newsletter', [42]), (b'chromium', 'pdf'))

    def test_unrelated_reports_and_explicit_legacy_setting_are_unchanged(self):
        self.assertEqual(self.report(report_name='other.report')._render_qweb_pdf('other', [42]), (b'legacy', 'pdf'))
        self.assertEqual(self.report(setting='wkhtmltopdf')._render_qweb_pdf('newsletter', [42]), (b'legacy', 'pdf'))


if __name__ == '__main__':
    unittest.main()
