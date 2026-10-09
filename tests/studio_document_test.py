"""Paper Studio schema/security checks, independent of an Odoo installation."""
import importlib.util
from pathlib import Path
import unittest

MODULE = Path(__file__).resolve().parents[1] / 'models/paper_document.py'
spec = importlib.util.spec_from_file_location('paper_document', MODULE)
paper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(paper)


class PaperDocumentTests(unittest.TestCase):
    def document(self, **block):
        return {'version': 1, 'pages': [{'id': 'page', 'blocks': [{'id': 'block', 'kind': 'text', 'html': '<p>Article</p>', **block}]}]}

    def test_officer_photo_side_survives_save(self):
        for side in ('left', 'right'):
            doc = paper.normalise_document(self.document(kind='widget', source='message', side=side))
            self.assertEqual(doc['pages'][0]['blocks'][0]['side'], side)
        with self.assertRaises(ValueError):
            paper.normalise_document(self.document(kind='widget', source='message', side='middle'))

    def test_continuation_title_survives_save(self):
        doc = paper.normalise_document(self.document(storyTitle='Officer Message (Exalted Ruler)', continuation=True, flowGroup='story'))
        self.assertEqual(doc['pages'][0]['blocks'][0]['storyTitle'], 'Officer Message (Exalted Ruler)')

    def test_rich_text_keeps_formatting_without_executable_markup(self):
        html = paper.clean_text('<p onclick="attack()">Hello <strong>world</strong><script>attack()</script><img src="/private"/><a href="javascript:attack()">link</a></p>')
        self.assertIn('<strong>world</strong>', html)
        for value in ('onclick', '<script', '<img', 'javascript:'):
            self.assertNotIn(value, html)

    def test_escaped_text_cannot_become_executable_markup(self):
        value = paper.clean_text('&lt;script&gt;attack()&lt;/script&gt;')
        self.assertNotIn('<script>', value)
        self.assertIn('&lt;script&gt;', value)

    def test_dynamic_snapshots_are_resolved_on_server(self):
        document = paper.normalise_document(self.document(kind='dynamic', source='calendar', resolvedHTML='<script>attack()</script>'), lambda key: '<p>Saved lodge calendar</p>')
        self.assertEqual(document['pages'][0]['blocks'][0]['resolvedHTML'], '<p>Saved lodge calendar</p>')
        self.assertNotIn('attack', str(document))

    def test_widget_slots_are_cleaned_and_officer_is_validated(self):
        calls = []
        doc = paper.normalise_document(self.document(kind='widget', source='message', officer='secretary', html='<p>Article<script>bad()</script></p>'), lambda key: calls.append(key) or '<p>Officer</p>')
        self.assertEqual(calls, ['message:secretary'])
        self.assertNotIn('script', doc['pages'][0]['blocks'][0]['html'])
        with self.assertRaises(ValueError): paper.normalise_document(self.document(kind='widget', source='message', officer='unknown'))

    def test_photo_and_text_layout_retains_text_and_validates_photo(self):
        doc = paper.normalise_document(self.document(kind='photo_text', src='', side='right', ratio='wide-left', html='<p>Story</p>', caption='<p>Caption</p>'))
        block = doc['pages'][0]['blocks'][0]
        self.assertEqual(block['side'], 'right')
        self.assertEqual(block['html'], '<p>Story</p>')
        with self.assertRaises(ValueError): paper.normalise_document(self.document(kind='photo_text', src='https://private/photo'))

    def test_framing_and_wrap_settings_are_validated_and_retained(self):
        block = paper.normalise_document(self.document(padding=12, border=2, photoBorder=3, radius=8, layout='wrap'))['pages'][0]['blocks'][0]
        self.assertEqual(block['padding'], 12)
        self.assertEqual(block['layout'], 'wrap')
        for values in [{'padding': -1}, {'border': 100}, {'layout': 'script'}, {'photoWidth': 101}]:
            with self.assertRaises(ValueError): paper.normalise_document(self.document(**values))

    def test_widget_width_alignment_and_month_validation(self):
        calls = []
        block = paper.normalise_document(self.document(kind='dynamic', source='calendar', month='2026-09', span=1, horizontal='right', vertical='bottom', boxHeight=200), lambda key: calls.append(key) or '<p>Calendar</p>')['pages'][0]['blocks'][0]
        self.assertEqual(calls, ['calendar:2026-09'])
        self.assertEqual(block['span'], 1)
        for values in [{'span': 1.5}, {'vertical': 'unknown'}, {'month': '2026-13'}, {'month': 'bad'}]:
            with self.assertRaises(ValueError): paper.normalise_document(self.document(kind='dynamic', source='calendar', **values))

    def test_compact_typography_is_preserved_and_bounded(self):
        block = paper.normalise_document(self.document(compact=True, lineHeight=1.15, paragraphGap=4))['pages'][0]['blocks'][0]
        self.assertTrue(block['compact'])
        self.assertEqual(block['lineHeight'], 1.15)
        for values in [{'lineHeight': 0.5}, {'paragraphGap': -1}, {'compact': 'yes'}]:
            with self.assertRaises(ValueError): paper.normalise_document(self.document(**values))

    def test_linked_event_slices_remain_server_resolved_and_validate_ranges(self):
        doc = self.document(kind='dynamic', source='upcoming_events', flowRange=[0, 5], flowGroup='story')
        duplicate = dict(doc['pages'][0]['blocks'][0], id='next', flowRange=[5, 10])
        doc['pages'][0]['blocks'].append(duplicate)
        calls=[]
        result=paper.normalise_document(doc,lambda key:calls.append(key) or '<p>Server snapshot</p>')
        self.assertEqual(calls,['upcoming_events'])
        self.assertEqual(result['pages'][0]['blocks'][1]['flowRange'],[5,10])
        for bounds in [[5,5],[-1,5],[0,1.5],[0,True]]:
            with self.assertRaises(ValueError): paper.normalise_document(self.document(kind='dynamic',source='events',flowRange=bounds))

    def test_gallery_rejects_external_photos(self):
        with self.assertRaises(ValueError): paper.normalise_document(self.document(kind='gallery', photos=[{'src': 'https://private/photo'}]))
        self.assertEqual(len(paper.normalise_document(self.document(kind='gallery', photos=[{'src': '', 'caption': '<p>Member</p>'}]))['pages'][0]['blocks'][0]['photos']), 1)

    def test_duplicate_ids_and_unknown_block_types_are_rejected(self):
        for document in [self.document(id='page'), self.document(kind='script')]:
            with self.assertRaises(ValueError): paper.normalise_document(document)

    def test_nonfinite_and_oversized_layout_values_are_rejected(self):
        for size in [float('nan'), float('inf'), 1000, -5, True]:
            with self.assertRaises(ValueError): paper.normalise_document(self.document(fontSize=size))

    def test_external_and_svg_image_resources_are_rejected(self):
        for src in ['file:///private/secret.png', '/web/image/42', 'https://example.com/a.png', 'data:image/svg+xml;base64,AAAA']:
            with self.assertRaises(ValueError): paper.normalise_document(self.document(kind='image', src=src))

    def test_blank_photos_can_be_saved_for_later_editing(self):
        document = paper.normalise_document(self.document(kind='image', src=''))
        self.assertEqual(document['pages'][0]['blocks'][0]['src'], '')

    def test_two_and_three_column_arrangements_are_valid(self):
        for columns in [['<p>Left</p>', '<p>Right</p>'], ['One', 'Two', 'Three']]:
            block = paper.normalise_document(self.document(kind='columns', columns=columns))['pages'][0]['blocks'][0]
            self.assertEqual(len(block['columns']), len(columns))

    def test_page_lock_survives_validation(self):
        doc=self.document();doc['pages'][0]['locked']=True
        self.assertTrue(paper.normalise_document(doc)['pages'][0]['locked'])
        doc['pages'][0]['locked']='yes'
        with self.assertRaises(ValueError):paper.normalise_document(doc)

    def test_initial_document_is_one_blank_page(self):
        document = paper.normalise_document(paper.initial_document('Issue <script>attack()</script>'))
        self.assertEqual(len(document['pages']), 1)
        self.assertEqual(document['pages'][0]['blocks'], [])


    def test_standard_elks_widgets_resolve_on_server(self):
        keys = []
        for source in ('birthdays', 'anniversaries', 'applications', 'committees'):
            paper.normalise_document(self.document(kind='dynamic', source=source), lambda key: keys.append(key) or '<p>Lodge data</p>')
        for source in ('eleven_oclock', 'mission', 'enf', 'veterans', 'youth', 'sick_distressed', 'lodge_info'):
            doc = paper.normalise_document(self.document(kind='widget', source=source, html='<p>Edited <script>x</script></p>'), lambda key: keys.append(key) or '<p>Widget</p>')
            self.assertNotIn('<script', doc['pages'][0]['blocks'][0]['html'])
        self.assertIn('birthdays', keys)
        doc = paper.normalise_document(self.document(kind='dynamic', source='birthdays', month='2026-11'), lambda key: key)
        self.assertEqual(doc['pages'][0]['blocks'][0]['resolvedHTML'], 'birthdays:2026-11')
        with self.assertRaises(ValueError):
            paper.normalise_document(self.document(kind='widget', source='birthdays'))


if __name__ == '__main__': unittest.main()
