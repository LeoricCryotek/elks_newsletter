"""Mailing contact email comes from the active Odoo company, not FRS credentials."""
from types import SimpleNamespace
import unittest
from lxml import html as lxml_html
from paper_layout_model import load_methods

Issue = load_methods('models/elks_newsletter_studio.py', 'ElksBulletinIssueStudio',
                     {'_studio_resolve_dynamic'}, {'lxml_html':lxml_html,'MONTH_SOURCES':(),
                     'UserError':ValueError,'_':lambda value:value})

class Env(dict):
    pass

class MailingTests(unittest.TestCase):
    def render(self, email):
        issue=Issue()
        markup='<div class="col-md-8"><div>Old contact</div></div><div class="col-md-4"><div>Postage</div></div>'
        issue.env=Env({'ir.qweb':SimpleNamespace(_render=lambda *args:markup)})
        issue.env.company=SimpleNamespace(email=email,name='Company Lodge',street='Company Street',street2='Suite 2',city='Lewiston',state_id=SimpleNamespace(name='Idaho'),zip='83501',phone='+1 208-743-5591')
        issue._render_print_body_inner=lambda value:value
        issue.lodge_settings_id=SimpleNamespace(frs_email='private-login@example.com',lodge_phone='123')
        issue.lodge_name='Lodge';issue.lodge_number='896';issue.city_state='Lewiston'
        return issue._studio_resolve_dynamic('mailing')

    def test_company_email_replaces_frs_login(self):
        result=self.render('Office@LewistonElks896.com')
        self.assertIn('Office@LewistonElks896.com',result)
        for value in ['Company Lodge','Company Street','Suite 2','Lewiston, Idaho 83501','+1 208-743-5591']:
            self.assertIn(value,result)
        self.assertNotIn('>123<',result)
        self.assertNotIn('private-login@example.com',result)

    def test_blank_company_email_does_not_expose_frs_login(self):
        self.assertNotIn('private-login@example.com',self.render(False))

if __name__=='__main__':unittest.main()
