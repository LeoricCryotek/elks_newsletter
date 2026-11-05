from datetime import date
from types import SimpleNamespace
import unittest
from paper_layout_model import load_methods
from studio_document_test import paper

Issue=load_methods('models/elks_newsletter_issue.py','ElksBulletinIssue',{'_html_project_dollars','_html_meeting_fund'}, {})
class MeetingFundTests(unittest.TestCase):
    def test_each_fund_uses_its_own_meeting_amount(self):
        rows=[{'project_dollars_amount':10,'enf_funds_amount':20,'fines_amount':3},{'project_dollars_amount':5,'enf_funds_amount':7,'fines_amount':4}]
        class Records(list):
            def mapped(self,key):return [row[key] for row in self]
        class Money:
            def sudo(self):return self
            def search(self,domain):self.domain=domain;return Records(rows)
        money=Money();issue=Issue();issue.env={'elks.meeting.money':money};issue._PURPLE_DEEP='#333'
        issue._fiscal_year_range=lambda:(date(2026,4,1),date(2027,3,31))
        for key,label,total in [('project','Project Dollars','$15.00'),('enf','ENF Funds','$27.00'),('fines','Meeting Fines','$7.00')]:
            result=issue._html_meeting_fund(key)
            self.assertIn(label,result);self.assertIn(total,result);self.assertIn('across 2 meetings',result)
        self.assertEqual(issue._html_project_dollars(),issue._html_meeting_fund('project'))
        self.assertIn(('meeting_date','>=',date(2026,4,1)),money.domain)

    def test_selection_survives_schema_and_uses_distinct_resolver_key(self):
        for fund in ['project','enf','fines']:
            keys=[]
            doc={'version':1,'pages':[{'id':'p','blocks':[{'id':'fund','kind':'dynamic','source':'meeting_fund','fund':fund}]}]}
            result=paper.normalise_document(doc,lambda key:(keys.append(key) or '<p>Total</p>'))
            self.assertEqual(keys,['meeting_fund:'+fund]);self.assertEqual(result['pages'][0]['blocks'][0]['fund'],fund)
        doc['pages'][0]['blocks'][0]['fund']='unknown'
        with self.assertRaises(ValueError):paper.normalise_document(doc)
