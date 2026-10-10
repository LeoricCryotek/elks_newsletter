"""Validation for the structured Paper Studio format (no Odoo dependency)."""
import base64
import json
import re
from uuid import uuid4
from datetime import date
from html import escape as escape_text

from lxml import etree, html

DYNAMIC_SOURCES = (
    'new_members', 'in_memoriam', 'officers', 'calendar', 'charity',
    'leaderboard', 'events', 'upcoming_events', 'project_dollars', 'delinquents',
    'birthdays', 'anniversaries', 'applications', 'committees',
)
WIDGET_SOURCES = ('masthead', 'message', 'section_bar', 'mailing',
                  'eleven_oclock', 'mission', 'enf', 'veterans', 'youth',
                  'sick_distressed', 'lodge_info')
# Lodge-data widgets whose Paper Studio block carries a "Month shown" override.
MONTH_SOURCES = ('calendar', 'new_members', 'leaderboard', 'birthdays', 'anniversaries')
OFFICERS = ('exalted_ruler', 'leading_knight', 'loyal_knight', 'lecturing_knight', 'secretary', 'treasurer', 'tiler', 'esquire', 'chaplain', 'inner_guard', 'organist', 'pianist', 'sergeant_at_arms', 'presiding_justice', 'boardchair', 'trustee1y', 'trustee2y', 'trustee3y', 'trustee4y', 'trustee5y', 'assistant_secretary', 'assistant_treasurer', 'house_chair', 'activities_chair', 'membership_chair', 'lodge_advisor')
KINDS = ('text', 'heading', 'columns', 'image', 'dynamic', 'widget', 'spacer', 'gallery', 'photo_text')
TAGS = {'p', 'div', 'span', 'br', 'b', 'strong', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'blockquote', 'img'}


def clean_text(value):
    """Keep rich text formatting without script, resource or positioning hooks."""
    if not isinstance(value, str) or len(value) > 7000000:
        raise ValueError('Text blocks must contain fewer than 150,000 characters.')
    root = html.fragment_fromstring(value or '<p></p>', create_parent='div')
    for element in list(root.iterdescendants()):
        if not isinstance(element.tag, str):
            parent = element.getparent()
            if parent is not None:
                parent.remove(element)
            continue
        if element.tag.lower() in {'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button'}:
            element.drop_tree()
            continue
        if element.tag.lower() not in TAGS:
            element.drop_tag()
            continue
        attrs = dict(element.attrib)
        element.attrib.clear()
        if element.tag == 'img':
            src = attrs.get('src', '')
            match = re.fullmatch(r'data:image/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)', src)
            if not match:
                element.drop_tree()
                continue
            try:
                data = base64.b64decode(match[2], validate=True)
            except ValueError:
                raise ValueError('The inline image data is invalid.') from None
            if len(data) > 5000000:
                raise ValueError('Each inline image must be smaller than 5 MB.')
            element.set('src', src)
            element.set('alt', attrs.get('alt', '')[:200])
        if element.tag == 'a':
            href = attrs.get('href', '').strip()
            if re.match(r'^(https?://|mailto:)', href, re.I):
                element.set('href', href)
        # Chromium rich-text commands sometimes produce inline spans.
        styles = []
        for declaration in attrs.get('style', '').split(';'):
            name, _, val = declaration.partition(':')
            name, val = name.strip().lower(), val.strip().lower()
            if element.tag == 'img' and name == 'width' and re.fullmatch(r'(?:[1-9][0-9]?|100)%', val):
                styles.append(f'width:{val}')
            elif name == 'font-weight' and val in ('bold', 'normal', '400', '700'):
                styles.append(f'{name}:{val}')
            elif name == 'font-style' and val in ('italic', 'normal'):
                styles.append(f'{name}:{val}')
            elif name == 'text-decoration' and val in ('underline', 'line-through', 'none'):
                styles.append(f'{name}:{val}')
        if styles:
            element.set('style', ';'.join(styles))
    if len(root.text_content()) > 150000:
        raise ValueError('Text blocks must contain fewer than 150,000 characters.')
    return escape_text(root.text or '') + ''.join(etree.tostring(child, encoding='unicode', method='html') for child in root)


def number(value, default, minimum, maximum):
    if isinstance(value, bool):
        raise ValueError('A numeric layout value was expected.')
    try:
        value = float(value if value is not None else default)
    except (TypeError, ValueError):
        raise ValueError('A numeric layout value was expected.') from None
    if not minimum <= value <= maximum:
        raise ValueError(f'Layout values must be between {minimum} and {maximum}.')
    return value


def normalise_document(document, resolve=None):
    """Do not accept client-supplied dynamic HTML. Resolve it on the server.

    Stored documents are rendered as saved snapshots; this validator is used on
    every write, not every export, so live data cannot alter a saved edition.
    """
    if not isinstance(document, dict) or document.get('version') != 1:
        raise ValueError('This paper document format is not supported.')
    if len(json.dumps(document)) > 24000000:
        raise ValueError('The newsletter is too large. Use smaller photos.')
    pages = document.get('pages')
    if not isinstance(pages, list) or not 1 <= len(pages) <= 60:
        raise ValueError('A newsletter must have between 1 and 60 pages.')
    identifiers = set()
    resolved_sources = {}

    def identifier(value):
        value = value or uuid4().hex
        if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', value) or value in identifiers:
            raise ValueError('Page and block identifiers must be unique.')
        identifiers.add(value)
        return value

    result = {'version': 1, 'pages': [], 'flowMode': document.get('flowMode', 'manual')}
    if result['flowMode'] not in ('manual', 'auto'):
        raise ValueError('Choose manual pages or automatic flow.')
    for page in pages:
        if not isinstance(page, dict) or not isinstance(page.get('blocks'), list) or len(page['blocks']) > 100:
            raise ValueError('Each page supports up to 100 content blocks.')
        if not isinstance(page.get('locked', False), bool):
            raise ValueError('Choose a supported page lock setting.')
        if not isinstance(page.get('fullPage', False), bool):
            raise ValueError('Choose a supported full-page insert setting.')
        if page.get('fullPage') and (len(page['blocks']) != 1 or page['blocks'][0].get('kind') != 'image'):
            raise ValueError('A full-page insert must contain exactly one image.')
        cleaned = {'id': identifier(page.get('id')), 'blocks': [], 'locked': page.get('locked', False), 'fullPage':page.get('fullPage',False)}
        if not isinstance(page.get('allowOverflow', False), bool):
            raise ValueError('Choose a supported overflow setting.')
        cleaned['allowOverflow'] = page.get('allowOverflow', False)
        background = page.get('background', '#ffffff')
        if not isinstance(background, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', background):
            raise ValueError('Choose a supported page background color.')
        cleaned['background'] = background
        cleaned['decoration'] = page.get('decoration', 'none')
        if cleaned['decoration'] not in ('none', 'line', 'double', 'filigree'):
            raise ValueError('Choose a supported decorative border.')
        for block in page['blocks']:
            if not isinstance(block, dict) or block.get('kind') not in KINDS:
                raise ValueError('This content block is not supported.')
            item = {'id': identifier(block.get('id')), 'kind': block['kind'],
                    'fontSize': number(block.get('fontSize'), 16, 8, 72),
                    'gap': number(block.get('gap'), 12, 0, 96),
                    'align': block.get('align', 'left'),
                    'font': block.get('font', 'sans')}
            item.update(padding=number(block.get('padding'), 0, 0, 64),
                        border=number(block.get('border'), 0, 0, 8),
                        radius=number(block.get('radius'), 0, 0, 40),
                        photoBorder=number(block.get('photoBorder'), 0, 0, 8),
                        photoRadius=number(block.get('photoRadius'), 0, 0, 100),
                        photoWidth=number(block.get('photoWidth'), 33, 15, 60),
                        layout=block.get('layout', 'columns'))
            if 'fitFont' in block:
                item['fitFont'] = number(block['fitFont'], 16, 12, 24)
            if 'flowGroup' in block:
                group = block['flowGroup']
                if not isinstance(group, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',group):
                    raise ValueError('The linked story identifier is invalid.')
                item['flowGroup'] = group
            if 'storyTitle' in block:
                if not isinstance(block['storyTitle'], str) or len(block['storyTitle']) > 160:
                    raise ValueError('The continuation title is invalid.')
                item['storyTitle'] = block['storyTitle']
            for key in ('keepTogether','continuation'):
                if not isinstance(block.get(key,False),bool): raise ValueError('Choose a supported flow option.')
                item[key] = block.get(key,False)
            if 'flowRange' in block:
                bounds = block['flowRange']
                if block['kind'] != 'dynamic' or block.get('source') not in ('events','upcoming_events') or not isinstance(bounds,list) or len(bounds)!=2 or any(isinstance(n,bool) or not isinstance(n,int) for n in bounds) or not 0<=bounds[0]<bounds[1]<=100000:
                    raise ValueError('The event continuation range is invalid.')
                item['flowRange'] = bounds
            if not isinstance(block.get('compact', False), bool):
                raise ValueError('Choose a supported compact layout setting.')
            item.update(compact=block.get('compact', False),
                        lineHeight=number(block.get('lineHeight'), 1.4, 1, 2.4),
                        paragraphGap=number(block.get('paragraphGap'), 8, 0, 32))
            item.update(span=number(block.get('span'), 3, 1, 3),
                        horizontal=block.get('horizontal', 'left'), vertical=block.get('vertical', 'top'),
                        boxHeight=number(block.get('boxHeight'), 0, 0, 900))
            if item['span'] not in (1, 2, 3) or item['horizontal'] not in ('left', 'center', 'right') or item['vertical'] not in ('top', 'middle', 'bottom'):
                raise ValueError('Choose a supported widget size and alignment.')
            if item['layout'] not in ('columns', 'wrap'):
                raise ValueError('Choose columns or text wrapping.')
            if item['align'] not in ('left', 'center', 'right', 'justify') or item['font'] not in ('sans', 'serif', 'script'):
                raise ValueError('This text appearance is not supported.')
            if block['kind'] in ('text', 'heading'):
                item['html'] = clean_text(block.get('html', ''))
            elif block['kind'] == 'columns':
                columns = block.get('columns')
                if not isinstance(columns, list) or not 1 <= len(columns) <= 3:
                    raise ValueError('A column block needs one, two or three columns.')
                item['columns'] = [clean_text(column) for column in columns]
                item['ratio'] = block.get('ratio', 'equal')
                if item['ratio'] not in ('equal', 'wide-left', 'wide-right'):
                    raise ValueError('This column arrangement is not supported.')
            elif block['kind'] == 'image':
                src = block.get('src', '')
                if not isinstance(src, str):
                    raise ValueError('Choose a photo file.')
                if src:
                    match = re.fullmatch(r'data:image/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\s]+)', src)
                    if not match:
                        raise ValueError('Photos must be uploaded PNG, JPEG, WebP or GIF files.')
                    try:
                        data = base64.b64decode(match[2], validate=True)
                    except ValueError:
                        raise ValueError('The photo data is invalid.') from None
                    if len(data) > 5000000:
                        raise ValueError('Each photo must be smaller than 5 MB.')
                item.update(src=src, caption=clean_text(block.get('caption', '')),
                            width=number(block.get('width'), 100, 10, 100),
                            height=number(block.get('height'), 240, 40, 900),
                            fit=block.get('fit', 'contain'))
                if item['fit'] not in ('contain', 'cover'):
                    raise ValueError('This photo fitting mode is not supported.')
            elif block['kind'] == 'photo_text':
                child = normalise_document({'version': 1, 'pages': [{'id': 'p', 'blocks': [dict(block, id='i', kind='image')]}]})
                photo = child['pages'][0]['blocks'][0]
                for key in ('src', 'caption', 'width', 'height', 'fit'): item[key] = photo[key]
                item['html'] = clean_text(block.get('html', ''))
                item['side'] = block.get('side', 'left')
                item['ratio'] = block.get('ratio', 'equal')
                if item['side'] not in ('left', 'right') or item['ratio'] not in ('equal', 'wide-left', 'wide-right'):
                    raise ValueError('Choose a supported photo and text layout.')
            elif block['kind'] == 'gallery':
                photos = block.get('photos', [])
                if not isinstance(photos, list) or not 1 <= len(photos) <= 12:
                    raise ValueError('An image gallery needs one to twelve photos.')
                item['galleryMode'] = block.get('galleryMode', 'members')
                if item['galleryMode'] not in ('members', 'photos'):
                    raise ValueError('Choose a supported gallery style.')
                item['photos'] = []
                for photo in photos:
                    if not isinstance(photo, dict):
                        raise ValueError('Choose a member photo.')
                    child = normalise_document({'version': 1, 'pages': [{'id': 'p', 'blocks': [dict(photo, id='i', kind='image')]}]})
                    item['photos'].append(child['pages'][0]['blocks'][0])
            elif block['kind'] == 'spacer':
                item['height'] = number(block.get('height'), 48, 0, 900)
            else:
                source = block.get('source', 'new_members')
                if source not in (WIDGET_SOURCES if block['kind'] == 'widget' else DYNAMIC_SOURCES):
                    raise ValueError('This lodge data source is not supported.')
                item['source'] = source
                if block['kind'] == 'widget':
                    item['html'] = clean_text(block.get('html', ''))
                    item['html2'] = clean_text(block.get('html2', ''))
                    if source == 'message':
                        item['side'] = block.get('side', 'right')
                        if item['side'] not in ('left', 'right'):
                            raise ValueError('Choose left or right for the officer photo.')
                        item['officer'] = block.get('officer', 'exalted_ruler')
                        if item['officer'] not in OFFICERS:
                            raise ValueError('Choose a lodge officer.')
                resolve_key = source + ':' + item['officer'] if source == 'message' else source
                if source in MONTH_SOURCES:
                    month = block.get('month', '')
                    if not isinstance(month, str) or (month and not re.fullmatch(r'\d{4}-\d{2}', month)):
                        raise ValueError('Choose a month in YYYY-MM format.')
                    if month:
                        try: date.fromisoformat(month + '-01')
                        except ValueError: raise ValueError('Choose a valid calendar month.') from None
                        resolve_key += ':' + month
                    item['month'] = month
                if resolve_key not in resolved_sources:
                    resolved_sources[resolve_key] = str(resolve(resolve_key)) if resolve else ''
                item['resolvedHTML'] = resolved_sources[resolve_key]
            cleaned['blocks'].append(item)
        result['pages'].append(cleaned)
    if len(json.dumps(result)) > 24000000:
        raise ValueError('The resolved newsletter is too large. Use smaller photos or fewer lodge-data blocks.')
    return result


def initial_document(name):
    return {'version': 1, 'flowMode': 'auto', 'pages': [{'id': uuid4().hex, 'blocks': []}]}
