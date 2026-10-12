"""Newsletter calls to action use the public archive directly, without short links."""
from lxml import html
from urllib.parse import urlsplit, urlunsplit
import re
from odoo import api, fields, models


def newsletter_destination(base_url):
    parts = urlsplit(base_url)
    return urlunsplit((parts.scheme, parts.netloc, '/elks/newsletter', '', ''))


def direct_newsletter_links(markup, destination):
    if not markup:
        return markup
    root = html.fragment_fromstring(str(markup), create_parent='div')
    for anchor in root.xpath('.//a[@href]'):
        href = anchor.get('href', '')
        path = urlsplit(href).path
        classes = anchor.get('class', '').split()
        if ('o_unsubscribe' in classes or '/unsubscribe' in path or
                path.startswith(('/view', '/cards')) or
                href.lower().startswith(('mailto:', 'tel:', 'sms:'))):
            continue
        anchor.set('href', destination)
    return (root.text or '') + ''.join(html.tostring(child, encoding='unicode') for child in root)


def referenced_tracker_codes(markup):
    codes = set()
    root = html.fragment_fromstring(str(markup or '<div></div>'), create_parent='div')
    for anchor in root.xpath('.//a[@href]'):
        path = urlsplit(anchor.get('href')).path
        if path.startswith('/r/'):
            code = path[3:].strip('/')
            if code:
                codes.add(code)
                codes.add(re.sub(r'/m/\d+$', '', code))
    return sorted(codes)


class NewsletterDirectLinks(models.AbstractModel):
    _inherit = 'mail.render.mixin'

    @api.model
    def _shorten_links(self, html, link_tracker_vals, blacklist=None, base_url=None):
        mailing_id = link_tracker_vals.get('mass_mailing_id')
        issue = self.env['elks.newsletter.issue'].sudo().search([
            ('marketing_mailing_id', '=', mailing_id)], limit=1) if mailing_id else False
        if issue:
            website = self.env['website'].search([('company_id', '=', self.env.company.id)], limit=1)
            origin = website.get_base_url() if website else self.get_base_url()
            return direct_newsletter_links(html, newsletter_destination(origin))
        return super()._shorten_links(html, link_tracker_vals, blacklist=blacklist, base_url=base_url)


class NewsletterTrackerDestination(models.Model):
    _inherit = 'link.tracker'

    newsletter_redirect_url = fields.Char(string='Repaired newsletter destination', copy=False,
        help='Keeps existing tracking codes and clicks while redirecting newsletter readers to the archive.')

    @api.depends('url', 'newsletter_redirect_url')
    def _compute_redirected_url(self):
        super()._compute_redirected_url()
        for tracker in self:
            if tracker.newsletter_redirect_url:
                tracker.redirected_url = tracker.newsletter_redirect_url
