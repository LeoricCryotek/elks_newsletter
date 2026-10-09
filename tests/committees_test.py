"""Committee newsletter rendering: vacancies, safe names, and service invitation."""
from datetime import date
from html import escape
from types import SimpleNamespace
import unittest
from paper_layout_model import load_methods

Issue = load_methods('models/elks_newsletter_issue.py', 'ElksBulletinIssue', {'_html_committees'}, {})

class Records:
    def __init__(self, items): self.items=items;self.domain=None
    def sudo(self): return self
    def search(self, domain, **kwargs): self.domain=domain;return self.items

class CommitteeTests(unittest.TestCase):
    def fixture(self, assigned=True):
        committee=SimpleNamespace(name='Veterans & Support')
        # ORM records are hashable, unlike SimpleNamespace.
        committee=type('Committee',(),{'name':committee.name})()
        vacancy=type('Committee',(),{'name':'Youth Outreach'})()
        assignments=Records([SimpleNamespace(committee_id=committee,partner_id=SimpleNamespace(name='Member <One>'))] if assigned else [])
        committees=Records([committee,vacancy]);issue=Issue()
        issue.env={'elks.committee.assignment':assignments,'elks.committee':committees}
        issue.issue_date=date(2026,10,9);issue._lodge_year_label=lambda:'2026-2027'
        issue._e=lambda value:escape(value or '');issue._empty_note=lambda text:f'<p>{escape(text)}</p>'
        return issue,assignments,committees

    def test_filled_and_vacant_chairs_render_with_invitation(self):
        issue,assignments,committees=self.fixture();markup=issue._html_committees()
        self.assertIn('Veterans &amp; Support',markup)
        self.assertIn('Member &lt;One&gt;',markup)
        self.assertIn('Youth Outreach',markup)
        self.assertIn('Vacant — volunteers welcome',markup)
        self.assertIn('Elks Care — Elks Share',markup)
        self.assertIn('Exalted Ruler or Lodge Secretary',markup)
        self.assertIn(('date_appointed','<=',issue.issue_date),assignments.domain)
        self.assertEqual(committees.domain,[('active','=',True)])

    def test_all_unfilled_committees_still_render(self):
        issue,_,_=self.fixture(False)
        self.assertEqual(issue._html_committees().count('Vacant — volunteers welcome'),2)

if __name__=='__main__':unittest.main()
