import ast
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from lxml import html
from markupsafe import Markup, escape as escape_html
import unittest
from types import SimpleNamespace
from archive_test import methods

import re
namespace={'Markup':Markup,'escape_html':escape_html,'re':re,'html':html,'urlsplit':urlsplit,'urlunsplit':urlunsplit}
tree=ast.parse((Path(__file__).resolve().parents[1]/'models/newsletter_links.py').read_text())
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)],type_ignores=[]),'newsletter_links','exec'),namespace)
newsletter_destination=namespace['newsletter_destination']
direct_newsletter_links=namespace['direct_newsletter_links']
referenced_tracker_codes=namespace['referenced_tracker_codes']
is_newsletter_digest=namespace['is_newsletter_digest']

class NewsletterLinksTests(unittest.TestCase):
    def test_canonical_url_discards_path_and_trailing_slashes(self):
        self.assertEqual(newsletter_destination('https://lewistonelks896.com/newsletter/?a=1'),'https://lewistonelks896.com/elks/newsletter')

    def test_newsletter_ctas_are_direct_but_unsubscribe_is_preserved(self):
        markup='<div><a href="https://example.com/r//m/4368">Read</a><a href="/old">Full issue</a><a class="o_unsubscribe" href="/unsubscribe_from_list">Unsubscribe</a><a href="mailto:office@example.com">Office</a></div>'
        result=html.fromstring(direct_newsletter_links(markup,'https://example.com/elks/newsletter'))
        self.assertEqual(result.xpath('.//a/@href'),['https://example.com/elks/newsletter','https://example.com/elks/newsletter','/unsubscribe_from_list','mailto:office@example.com'])

    def test_outgoing_newsletter_bypasses_shortener(self):
        cls=methods('models/newsletter_links.py','NewsletterDirectLinks',
                    {'direct_newsletter_links':direct_newsletter_links,'newsletter_destination':newsletter_destination,'is_newsletter_digest':is_newsletter_digest})
        class IssueModel:
            def sudo(self):return self
            def search(self,*args,**kwargs):return True
        class Env(dict):pass
        record=cls();record.env=Env({'elks.newsletter.issue':IssueModel(),
            'website':SimpleNamespace(search=lambda *args,**kwargs:SimpleNamespace(get_base_url=lambda:'https://example.com/'))})
        record.env.company=SimpleNamespace(id=1)
        result=record._shorten_links('<a href="https://example.com/r//m/4368">Read</a>',{'mass_mailing_id':8})
        self.assertIn('href="https://example.com/elks/newsletter"',result)
        self.assertNotIn('/r/',result)

    def test_outgoing_html_keeps_markup_type_through_mail_wrapper(self):
        source=Markup('<div><h1>November Newsletter</h1><a href="/old">Read</a><a href="/unsubscribe_from_list">Unsubscribe</a></div>')
        result=direct_newsletter_links(source,'https://example.com/elks/newsletter')
        self.assertIsInstance(result,Markup)
        # Same safe-string interpolation contract used by Odoo mail layouts.
        wrapped=Markup('<main>%s</main>') % result
        self.assertIn('<h1>November Newsletter</h1>',wrapped)
        self.assertNotIn('&lt;div',wrapped)
        self.assertIn('href="https://example.com/elks/newsletter"',wrapped)
        self.assertIn('href="/unsubscribe_from_list"',wrapped)

    def test_plain_string_stays_plain_and_root_text_is_escaped(self):
        result=direct_newsletter_links('&lt;note&gt;<p>News</p>','https://example.com/elks/newsletter')
        self.assertNotIsInstance(result,Markup)
        self.assertTrue(result.startswith('&lt;note&gt;'))

    def test_info_alert_becomes_stable_table_without_stretched_icon(self):
        source=Markup('<div><div class="alert alert-info d-flex"><img src="info.png"/><div class="s_alert_content"><p>Bookmark <a href="/old">this page</a> for the next issue.</p></div></div><a class="o_unsubscribe" href="/unsubscribe_from_list">Unsubscribe</a></div>')
        result=direct_newsletter_links(source,'https://example.com/elks/newsletter')
        root=html.fromstring(result)
        self.assertIsInstance(result,Markup)
        self.assertFalse(root.xpath('.//img'))
        self.assertFalse(root.xpath('.//*[contains(@class,"alert-info")]'))
        self.assertTrue(root.xpath('.//table[@role="presentation"]//td[@bgcolor="#d8eef2"]'))
        self.assertIn('Bookmark this page for the next issue.',root.text_content())
        self.assertEqual(root.xpath('.//td//a/@href'),['https://example.com/elks/newsletter'])

    def test_duplicated_newsletter_is_normalized_without_issue_link(self):
        cls=methods('models/newsletter_links.py','NewsletterDirectLinks',{'direct_newsletter_links':direct_newsletter_links,'newsletter_destination':newsletter_destination,'is_newsletter_digest':is_newsletter_digest})
        class Model:
            def sudo(self):return self
            def search(self,*args,**kwargs):return False
        class Env(dict):pass
        record=cls();record.env=Env({'elks.newsletter.issue':Model(),'website':SimpleNamespace(search=lambda *a,**k:SimpleNamespace(get_base_url=lambda:'https://example.com'))})
        record.env.company=SimpleNamespace(id=1)
        source=Markup('<div><a href="https://example.com/elks/newsletter">Get the full newsletter</a><section class="s_alert"><div class="alert alert-info"><img src="info.png"/><p>Bookmark this newsletter.</p></div></section></div>')
        result=record._shorten_links(source,{'mass_mailing_id':99})
        self.assertIsInstance(result,Markup)
        self.assertNotIn('info.png',result)
        self.assertIn('Bookmark this newsletter.',result)
        self.assertEqual(len(html.fromstring(result).xpath('.//table[@role="presentation"]')),1)
        self.assertFalse(is_newsletter_digest('<p>Ordinary campaign</p>'))

    def test_missing_href_is_not_rewritten(self):
        self.assertEqual(direct_newsletter_links('', 'https://example.com/elks/newsletter'),'')

if __name__=='__main__':unittest.main()
