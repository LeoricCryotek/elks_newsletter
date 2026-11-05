"""Exercise the real report markup and resource parser with a >10 MB JSON node."""
import base64
import json
import os
import re
from pathlib import Path
from lxml import html as lxml_html
import unittest
from paper_layout_model import load_methods,ROOT

Report=load_methods('models/ir_actions_report.py','IrActionsReport',{'_newsletter_inline_resources'},{'lxml_html':lxml_html,'base64':base64,'re':re})
Issue=load_methods('models/elks_newsletter_studio.py','ElksBulletinIssueStudio',{'_studio_print_markup'},{'json':json,'Markup':str,'ASSETS':ROOT/'static/src/studio'})

class LargeExportTests(unittest.TestCase):
    def test_large_embedded_document_survives_actual_report_pipeline(self):
        payload={'paperSize':'letter','lodge':'Lodge','document':{'version':1,'pages':[{'id':'large-export-page','blocks':[{'id':'story','kind':'text','html':'<p>Large export: &lt;safe&gt; content.</p>'}]}]},'large_metadata':'x'*17000000}
        issue=Issue();issue.ensure_one=lambda:None;issue.studio_document=payload['document'];issue.action_studio_load=lambda:payload
        markup=issue._studio_print_markup()
        source='<html><head></head><body>'+markup+'</body></html>'
        result=Report()._newsletter_inline_resources(source,'https://example.com',lambda url:None)
        root=lxml_html.fromstring(result,parser=lxml_html.HTMLParser(huge_tree=True))
        data=root.xpath('//script[@class="elks-paper-data"]')[0]
        restored=json.loads(data.text)
        self.assertEqual(restored,payload)
        self.assertTrue(root.xpath('//script[contains(text(),"window.ElksPaperRenderer.mountAll()")]'))
        if os.environ.get('ELKS_LARGE_EXPORT_HTML'):
            Path(os.environ['ELKS_LARGE_EXPORT_HTML']).write_text(result)

if __name__=='__main__':unittest.main()
