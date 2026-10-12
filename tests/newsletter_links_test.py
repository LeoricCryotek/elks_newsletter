import ast
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from lxml import html
import unittest
from types import SimpleNamespace
from archive_test import methods

namespace={'html':html,'urlsplit':urlsplit,'urlunsplit':urlunsplit}
tree=ast.parse((Path(__file__).resolve().parents[1]/'models/newsletter_links.py').read_text())
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)],type_ignores=[]),'newsletter_links','exec'),namespace)
newsletter_destination=namespace['newsletter_destination']
direct_newsletter_links=namespace['direct_newsletter_links']

class NewsletterLinksTests(unittest.TestCase):
    def test_canonical_url_discards_path_and_trailing_slashes(self):
        self.assertEqual(newsletter_destination('https://lewistonelks896.com/newsletter/?a=1'),'https://lewistonelks896.com/elks/newsletter')

    def test_newsletter_ctas_are_direct_but_unsubscribe_is_preserved(self):
        markup='<div><a href="https://example.com/r//m/4368">Read</a><a href="/old">Full issue</a><a class="o_unsubscribe" href="/unsubscribe_from_list">Unsubscribe</a><a href="mailto:office@example.com">Office</a></div>'
        result=html.fromstring(direct_newsletter_links(markup,'https://example.com/elks/newsletter'))
        self.assertEqual(result.xpath('.//a/@href'),['https://example.com/elks/newsletter','https://example.com/elks/newsletter','/unsubscribe_from_list','mailto:office@example.com'])

    def test_outgoing_newsletter_bypasses_shortener(self):
        cls=methods('models/newsletter_links.py','NewsletterDirectLinks',
                    {'direct_newsletter_links':direct_newsletter_links,'newsletter_destination':newsletter_destination})
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

    def test_missing_href_is_not_rewritten(self):
        self.assertEqual(direct_newsletter_links('', 'https://example.com/elks/newsletter'),'')

if __name__=='__main__':unittest.main()
