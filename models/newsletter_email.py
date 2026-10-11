"""Email-safe HTML digest assembled from the newsletter's saved content."""
from html import escape
from lxml import html

PLACEHOLDERS = ('replace this with your message', 'write your newsletter here', 'write here', 'use the officer dropdown', 'write the story beside your photo', 'write your text here')

def tree(markup):
    return html.fragment_fromstring(str(markup or '<div></div>'), create_parent='div')

def excerpt(markup, limit=700):
    root=tree(markup)
    for node in root.xpath('.//script|.//style|.//img'):
        node.drop_tree()
    # Remove editor instructions paragraph by paragraph, keeping real authored paragraphs.
    for node in list(root.xpath('.//p')):
        value=' '.join(node.text_content().split()).lower()
        if any(marker in value for marker in PLACEHOLDERS):node.drop_tree()
    text=' '.join(root.text_content().split())
    if not text or any(value in text.lower() for value in PLACEHOLDERS):return ''
    if len(text)>limit:
        return '<p style="margin:0 0 14px;line-height:1.65;">%s…</p>' % escape(text[:limit].rsplit(' ',1)[0])
    for node in list(root.iterdescendants()):
        if node.tag not in ('p','div','br','strong','b','em','i','u','ul','ol','li'):
            node.drop_tag();continue
        node.attrib.clear()
        if node.tag in ('p','div'):node.set('style','margin:0 0 14px;line-height:1.65;')
    return ''.join(html.tostring(child,encoding='unicode') for child in root) or '<p>%s</p>' % escape(text)

def build_digest(document, month, lodge, url, logo_url="", contact=None):
    blocks=[block for page in document.get('pages',[]) for block in page.get('blocks',[])]
    officer='';byline='';events=[];news=[];heading='Lodge news';seen=set()
    for block in blocks:
        source=block.get('source')
        if source=='message':
            if block.get('officer','exalted_ruler')=='exalted_ruler' and not officer:
                parts=[block.get('html','')]
                if block.get('flowGroup'):
                    parts.extend(tail.get('html','') for tail in blocks if tail.get('continuation') and tail.get('flowGroup')==block['flowGroup'])
                # Same authored slots/linked continuations used by the PDF renderer.
                authored=''.join(parts)
                officer=excerpt(authored,450)
                if not officer:
                    stories=tree(block.get('resolvedHTML')).xpath('.//*[@data-paper-slot="html"]|.//*[contains(concat(" ", normalize-space(@class), " "), " s_elks_story_flow ")]')
                    officer=excerpt(''.join(html.tostring(node,encoding='unicode') for node in stories),450)
                names=tree(block.get('resolvedHTML')).xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " s_elks_msg_byline ")]//b|.//*[contains(concat(" ", normalize-space(@class), " "), " s_elks_msg_byline ")]//strong')
                byline=' '.join(names[0].text_content().split()) if names else ''
            continue
        if source in ('events','upcoming_events'):
            root=tree(block.get('resolvedHTML'))
            # Both Odoo event widgets render title/date together in a row.
            for date in root.xpath('.//div/span[contains(@style,"float:right")]'):
                title_node=date.getparent()
                title_parts=[title_node.text or '']
                title_parts.extend(child.text_content() for child in title_node if child is not date)
                title=' '.join(' '.join(title_parts).split());when=' '.join(date.text_content().split())
                key=(title,when)
                if not title or key in seen:continue
                seen.add(key)
                siblings=title_node.xpath('following-sibling::div[1]')
                description=' '.join(siblings[0].text_content().split()) if siblings else ''
                events.append((title,when,description[:180]))
            continue
        if source or block.get('continuation'):continue
        if block.get('kind')=='heading':
            heading=' '.join(tree(block.get('html')).text_content().split()) or 'Lodge news';continue
        chunks=block.get('columns',[]) if block.get('kind')=='columns' else [block.get('html','')]
        for chunk in chunks:
            content=excerpt(chunk,450)
            if content and len(news)<2:news.append((heading,content))
    def section(title,body):
        return '<tr><td style="padding:26px 30px;border-bottom:1px solid #e8e1ee;background:#ffffff;"><h2 style="font-family:Georgia,serif;font-size:24px;line-height:1.25;color:#624492;margin:0 0 16px;">%s</h2>%s</td></tr>' % (escape(title),body)
    content=''
    if officer:
        content+=section("Exalted Ruler’s Message",('<p style="color:#766a7f;margin:0 0 16px;">From %s</p>' % escape(byline) if byline else '')+officer+'<p><a href="%s" style="color:#624492;">Read the complete message →</a></p>' % escape(url,quote=True))
    if events:
        rows=''.join('<tr><td style="padding:16px;background:#f7f4fa;border-bottom:8px solid white;"><strong style="font-size:17px;color:#30243a;">%s</strong><p style="color:#624492;margin:8px 0;font-weight:bold;font-size:13px;">%s</p><p style="margin:0;line-height:1.5;color:#655b6c;">%s</p></td></tr>' % tuple(escape(value) for value in item) for item in events[:5])
        content+=section('Coming up at the Lodge','<table role="presentation" width="100%%" cellspacing="0" cellpadding="0">%s</table>' % rows)
    for title,body in news:content+=section(title,body)
    logo = '<img src="%s" alt="Lodge logo" width="80" style="display:block;width:80px;height:auto;margin:0 0 20px;"/>' % escape(logo_url,quote=True) if logo_url else ''
    contact = contact or {}
    contact_lines = ' · '.join(escape(value) for value in [contact.get('phone',''), contact.get('email','')] if value)
    footer = '<p style="margin:0 0 12px;line-height:1.5;">%s</p>' % contact_lines if contact_lines else ''
    return '''<div class="o_layout oe_unremovable oe_unmovable"><div class="container o_mail_wrapper"><div class="o_mail_wrapper_td">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:#f3f0f6;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="max-width:640px;background:white;border:1px solid #e8e1ee;font-family:Arial,sans-serif;color:#30243a;font-size:16px;">
<tr><td style="background:#624492;padding:32px 30px;">%s<p style="color:#eee5fa;letter-spacing:2px;font-size:12px;margin:0 0 16px;">ELKS CARE — ELKS SHARE</p><h1 style="color:white;font-size:32px;line-height:1.2;margin:0 0 12px;">%s Newsletter</h1><p style="color:#eee5fa;margin:0;">%s</p><p style="margin:22px 0 0;"><a href="%s" style="color:white;text-decoration:underline;font-weight:bold;font-size:14px;">Read this month’s edition →</a></p></td></tr>
<tr><td style="padding:26px 30px 0;"><p style="line-height:1.6;margin:0;">A look inside this month’s lodge newsletter — the people, service, and events bringing our community together.</p></td></tr>%s
<tr><td align="center" style="padding:30px;"><a href="%s" style="display:inline-block;background:#624492;color:#ffffff;padding:14px 24px;text-decoration:none;border-radius:5px;font-weight:bold;">Get the full newsletter</a><p style="color:#766a7f;font-size:13px;line-height:1.5;">Read this edition and browse previous newsletters online.</p></td></tr>
<tr><td align="center" style="background:#eee8f4;padding:22px;color:#766a7f;font-size:13px;"><p style="margin:0 0 12px;font-weight:bold;">Elks Care — Elks Share</p>%s<a href="/unsubscribe_from_list" class="o_unsubscribe" style="color:#624492;">Unsubscribe</a></td></tr>
</table></td></tr></table></div></div></div>''' % (logo,escape(month),escape(lodge),escape(url,quote=True),content,escape(url,quote=True),footer)
