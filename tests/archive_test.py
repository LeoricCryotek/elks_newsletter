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

    def test_old_newsletter_link_redirects_to_archive(self):
        request=SimpleNamespace(redirect=lambda url,code:(url,code))
        cls=methods('controllers/archive.py','NewsletterArchive',{'request':request})
        self.assertEqual(cls().newsletter_legacy_link(),('/newsletter',301))

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
