from datetime import date
from html import escape
from email.utils import formataddr
from types import SimpleNamespace
from lxml import html
import unittest
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location("email_digest",Path(__file__).resolve().parents[1]/"models/newsletter_email.py")
digest=importlib.util.module_from_spec(spec);spec.loader.exec_module(digest)
from archive_test import methods

class MarketingTests(unittest.TestCase):
    def test_email_uses_issue_content_and_requested_absolute_link(self):
        cls=methods('models/newsletter_marketing.py','NewsletterMarketing',{'html':html,'escape':escape,'build_digest':digest.build_digest})
        issue=cls();issue.ensure_one=lambda:None;issue.issue_date=date(2026,10,1)
        issue.env=SimpleNamespace(company=SimpleNamespace(name='Lodge & Community',id=1,phone='123',email='office@example.com'))
        issue.lodge_name='Lodge';issue.editor_mode='paper';issue.studio_document={'pages':[{'blocks':[{'kind':'text','html':'<p>Our volunteers served &amp; shared.</p>'},{'kind':'columns','columns':['<p>Coming events</p>','<p>Youth program</p>']}]}]}
        result=issue._newsletter_email_body('https://lewistonelks896.com/')
        self.assertIn('October 2026 Newsletter',result)
        self.assertIn('Our volunteers served &amp; shared.',result)
        self.assertIn('Coming events',result)
        self.assertIn('https://lewistonelks896.com/elks/newsletter',result)
        self.assertIn('o_unsubscribe',result)

    def test_digest_prioritizes_er_and_dated_events_without_placeholders(self):
        document={'pages':[{'blocks':[
            {'kind':'widget','source':'message','officer':'exalted_ruler','html':'<p>We <strong>honor our veterans</strong> through service.</p>'},
            {'kind':'text','html':'<p>Replace this with your message. Use the Officer dropdown.</p>'},
            {'kind':'dynamic','source':'upcoming_events','resolvedHTML':'<div><div><div><b>Community Dinner</b><span style="float:right">Oct 18, 2026</span></div><div>Join our neighbors.</div></div></div>'}
        ]}]}
        result=digest.build_digest(document,'October 2026','Lodge','https://example.com/elks/newsletter')
        self.assertIn('Exalted Ruler’s Message',result)
        self.assertIn('<strong>honor our veterans</strong>',result)
        self.assertIn('Community Dinner',result)
        self.assertIn('Oct 18, 2026',result)
        self.assertNotIn('Replace this',result)
        self.assertIn('role="presentation"',result)

    def test_real_continuation_survives_placeholder_and_photo_instructions_are_excluded(self):
        doc={'pages':[{'blocks':[
            {'source':'message','officer':'exalted_ruler','flowGroup':'er','html':'<p>Replace this with your message.</p>'},
            {'kind':'text','continuation':True,'flowGroup':'er','html':'<p>We served veterans together this month.</p>'},
            {'kind':'photo_text','html':'<p>Write the story beside your photo.</p>'}
        ]}]}
        result=digest.build_digest(doc,'October 2026','Lodge','https://example.com')
        self.assertIn('We served veterans together this month.',result)
        self.assertIn('Exalted Ruler’s Message',result)
        self.assertNotIn('Write the story',result)
        self.assertNotIn('Replace this',result)

    def test_defaults_copy_sent_newsletter_settings(self):
        cls=methods('models/newsletter_marketing.py','NewsletterMarketing',{'formataddr':formataddr})
        previous=SimpleNamespace(email_from='Lodge <noreply@example.com>',reply_to='office@example.com',
            mailing_model_id=SimpleNamespace(id=9),mailing_domain='[]',contact_list_ids=SimpleNamespace(ids=[4]))
        class Env(dict):pass
        issue=cls();issue.ensure_one=lambda:None;issue.issue_date=date(2026,10,1)
        issue.env=Env({'mailing.mailing':SimpleNamespace(search=lambda *args,**kwargs:previous)})
        issue.env.user=SimpleNamespace(id=7,email_formatted='Admin <admin@example.com>')
        issue.env.company=SimpleNamespace(name='Lodge',email='company@example.com')
        values=issue._newsletter_mailing_defaults()
        self.assertEqual(values['contact_list_ids'],[(6,0,[4])])
        self.assertEqual(values['email_from'],previous.email_from)
        self.assertEqual(values['reply_to'],previous.reply_to)
        self.assertEqual(values['preview'],'October 2026 Newsletter')
        self.assertNotIn('state',values)

    def test_excerpt_does_not_copy_executable_markup(self):
        cls=methods('models/newsletter_marketing.py','NewsletterMarketing',{'html':html,'escape':escape,'build_digest':digest.build_digest})
        issue=cls();issue.ensure_one=lambda:None;issue.issue_date=date(2026,10,1)
        issue.env=SimpleNamespace(company=SimpleNamespace(name='Lodge',id=1,phone='',email=''))
        issue.lodge_name='Lodge';issue.editor_mode='paper';issue.studio_document={'pages':[{'blocks':[{'kind':'text','html':'<p>&lt;img onerror=bad()&gt;</p>'}]}]}
        result=issue._newsletter_email_body('https://example.com')
        self.assertNotIn('<img onerror',result)

if __name__=='__main__':unittest.main()
