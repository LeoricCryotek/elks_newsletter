"""Exercise public archive access boundaries and PDF upload validation."""
import ast
import base64
from pathlib import Path
from types import SimpleNamespace
import unittest

ROOT=Path(__file__).resolve().parents[1]
def methods(path, name, globals):
    tree=ast.parse((ROOT/path).read_text());cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name==name)
    functions=[]
    for node in cls.body:
        if isinstance(node,ast.FunctionDef):node.decorator_list=[];functions.append(node)
    namespace={**globals};exec(compile(ast.fix_missing_locations(ast.Module(body=functions,type_ignores=[])),path,'exec'),namespace)
    return type(name,(),{n.name:namespace[n.name] for n in functions})

class ArchiveTests(unittest.TestCase):
    def test_pdf_validation_rejects_wrong_type_and_incomplete_files(self):
        import binascii
        cls=methods('models/elks_newsletter_archive.py','NewsletterArchive',{'base64':base64,'binascii':binascii,'ValidationError':ValueError,'_':lambda s:s})
        class RecordList(list):
            def with_context(self, **kwargs):return self
        for data in [b'not a PDF',b'%PDF-1.7 incomplete']:
            with self.assertRaises(ValueError):cls._check_pdf(RecordList([SimpleNamespace(pdf=base64.b64encode(data))]))
        cls._check_pdf(RecordList([SimpleNamespace(pdf=base64.b64encode(b'%PDF-1.7\n%%EOF'))]))

    def test_large_archive_pdf_uses_approval_instead_of_old_30mb_limit(self):
        import binascii
        cls=methods('models/elks_newsletter_archive.py','NewsletterArchive',{'base64':base64,'binascii':binascii,'ValidationError':ValueError,'_':lambda s:s})
        class Records(list):
            def with_context(self,**kwargs):return self
        data=b'%PDF-1.7\n'+b'x'*31000000+b'\n%%EOF'
        record=SimpleNamespace(pdf=base64.b64encode(data),published=True,large_pdf_approved=False)
        with self.assertRaisesRegex(ValueError,'Approve large PDF'):
            cls._check_pdf(Records([record]))
        record.large_pdf_approved=True
        cls._check_pdf(Records([record]))
        record.published=False;record.large_pdf_approved=False
        cls._check_pdf(Records([record]))

    def test_archive_hard_limit_cannot_be_bypassed(self):
        import binascii
        cls=methods('models/elks_newsletter_archive.py','NewsletterArchive',{'base64':base64,'binascii':binascii,'ValidationError':ValueError,'_':lambda s:s})
        class Records(list):
            def with_context(self,**kwargs):return self
        record=SimpleNamespace(pdf=base64.b64encode(b'%PDF-1.7'+b'x'*64000000+b'%%EOF'),published=True,large_pdf_approved=True)
        with self.assertRaisesRegex(ValueError,'64 MB website safety limit'):
            cls._check_pdf(Records([record]))

    def test_publish_button_uses_saved_large_pdf_approval(self):
        import binascii
        cls=methods('models/elks_newsletter_archive.py','NewsletterArchive',{'base64':base64,'binascii':binascii,'ValidationError':ValueError,'_':lambda s:s})
        record=SimpleNamespace(pdf=base64.b64encode(b'%PDF-1.7\n'+b'x'*31000000+b'\n%%EOF'),published=False,large_pdf_approved=True)
        class Records(list):
            def with_context(self,**kwargs):return self
            def check_access(self,mode):self.access=mode
            def _check_pdf(self):cls._check_pdf(self)
            def write(self,values):
                self.values=values
                for item in self:
                    for key,value in values.items():setattr(item,key,value)
                cls._check_pdf(self)
        records=Records([record]);cls.action_publish(records)
        self.assertEqual(records.values,{'published':True})
        self.assertTrue(record.published)
        self.assertTrue(record.large_pdf_approved)
        record.published=False;record.large_pdf_approved=False
        with self.assertRaisesRegex(ValueError,'Approve large PDF'):
            cls.action_publish(records)

    def test_old_newsletter_link_redirects_to_archive(self):
        request=SimpleNamespace(redirect=lambda url,code:(url,code))
        cls=methods('controllers/archive.py','NewsletterArchive',{'request':request})
        self.assertEqual(cls().newsletter_legacy_link(),('/newsletter',301))

    def test_malformed_sent_newsletter_link_recovers_but_other_mail_does_not(self):
        class Trace:
            def __init__(self,subject):self.mass_mailing_id=SimpleNamespace(subject=subject)
            def exists(self):return self
        for subject,expected in [('October Newsletter',('/elks/newsletter',302)),('Unrelated campaign','404')]:
            request=SimpleNamespace(env={'mailing.trace':SimpleNamespace(sudo=lambda:SimpleNamespace(browse=lambda id:Trace(subject)))},redirect=lambda url,code:(url,code),not_found=lambda:'404')
            cls=methods('controllers/archive.py','NewsletterArchive',{'request':request})
            self.assertEqual(cls().broken_newsletter_tracking_link(4368),expected)

    def test_pdf_route_requires_publication_and_current_website(self):
        captured=[]
        class Records:
            def sudo(self):return self
            def search(self,domain,**kwargs):captured.extend(domain);return False
        request=SimpleNamespace(env={'elks.newsletter.archive':Records()},website=SimpleNamespace(id=8),not_found=lambda:'404')
        cls=methods('controllers/archive.py','NewsletterArchive',{'request':request,'base64':base64})
        self.assertEqual(cls().newsletter_pdf(99),'404')
        self.assertIn(('id','=',99),captured)
        self.assertIn(('published','=',True),captured)
        self.assertIn(('website_id','=',8),captured)

if __name__=='__main__':unittest.main()
