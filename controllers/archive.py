import base64
from odoo import http
from odoo.http import request, content_disposition


class NewsletterArchive(http.Controller):
    @http.route(['/r//m/<int:trace_id>', '/r/m/<int:trace_id>'], type='http', auth='public', website=True, methods=['GET'], sitemap=False)
    def broken_newsletter_tracking_link(self, trace_id, **kw):
        # Only repair malformed links associated with newsletter mailings.
        trace = request.env['mailing.trace'].sudo().browse(trace_id).exists()
        subject = (trace.mass_mailing_id.subject or '').lower() if trace else ''
        if not trace or not ('newsletter' in subject or 'news letter' in subject):
            return request.not_found()
        return request.redirect('/elks/newsletter', code=302)

    @http.route(['/elk/newsletter', '/elks/newsletter'], type='http', auth='public', website=True, methods=['GET'], sitemap=False)
    def newsletter_legacy_link(self, **kw):
        return request.redirect('/newsletter', code=301)

    @http.route(['/newsletter', '/elks/newsletters'], type='http', auth='public', website=True, methods=['GET'], sitemap=True)
    def newsletter_archive(self, **kw):
        releases = request.env['elks.newsletter.archive'].sudo().search([
            ('published', '=', True), ('website_id', '=', request.website.id)], order='issue_month desc, id desc')
        return request.render('elks_newsletter.newsletter_archive_page', {'releases': releases, 'newsletter_website': request.website.sudo()})

    @http.route('/elks/newsletters/<int:release_id>/pdf', type='http', auth='public', website=True, methods=['GET'], sitemap=False)
    def newsletter_pdf(self, release_id, download=False, **kw):
        release = request.env['elks.newsletter.archive'].sudo().search([
            ('id', '=', release_id), ('published', '=', True), ('website_id', '=', request.website.id)], limit=1)
        if not release:
            return request.not_found()
        headers = [('Content-Type', 'application/pdf'), ('X-Content-Type-Options', 'nosniff'), ('Cache-Control', 'no-store')]
        if download:
            headers.append(('Content-Disposition', content_disposition(release.filename or 'newsletter.pdf')))
        return request.make_response(base64.b64decode(release.with_context(bin_size=False).pdf), headers=headers)
