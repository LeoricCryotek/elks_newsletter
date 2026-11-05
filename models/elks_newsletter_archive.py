"""Public newsletter releases hold a PDF snapshot, never a live draft report."""
import base64
import binascii
from odoo import api, fields, models, _
from odoo.exceptions import ValidationError, UserError


class NewsletterArchive(models.Model):
    _name = 'elks.newsletter.archive'
    _description = 'Published Newsletter Archive'
    _order = 'issue_month desc, id desc'

    name = fields.Char(required=True)
    issue_month = fields.Date(required=True, help='Select any day in the issue month. Stored as the first day of that month.')
    website_id = fields.Many2one('website', required=True, default=lambda self: self.env['website'].search([('company_id', '=', self.env.company.id)], limit=1))
    company_id = fields.Many2one(related='website_id.company_id', store=True)
    issue_id = fields.Many2one('elks.newsletter.issue', ondelete='set null', readonly=True)
    pdf = fields.Binary(required=True, attachment=False)
    filename = fields.Char(default='newsletter.pdf')
    published = fields.Boolean(default=False, copy=False)
    large_pdf_approved = fields.Boolean(string='Approve large PDF download', copy=False,
        help='Allow publishing a PDF above the recommended 24 MB. Large downloads can be slower on mobile connections. The safety limit is 64 MB.')
    pdf_size_mb = fields.Float(string='PDF size (MB)', compute='_compute_pdf_size_mb', digits=(10, 2))

    @api.depends('pdf')
    def _compute_pdf_size_mb(self):
        for record in self.with_context(bin_size=False):
            encoded = record.pdf or b''
            padding = len(encoded) - len(encoded.rstrip(b'=' if isinstance(encoded, bytes) else '='))
            record.pdf_size_mb = max(0, len(encoded) * 3 // 4 - padding) / 1000000


    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('issue_month'):
                vals['issue_month'] = fields.Date.to_date(vals['issue_month']).replace(day=1)
        return super().create(vals_list)

    def write(self, vals):
        if vals.get('issue_month'):
            vals = dict(vals, issue_month=fields.Date.to_date(vals['issue_month']).replace(day=1))
        return super().write(vals)

    @api.constrains('pdf', 'published', 'large_pdf_approved')
    def _check_pdf(self):
        for record in self.with_context(bin_size=False):
            try:
                data = base64.b64decode(record.pdf or b'', validate=True)
            except (ValueError, binascii.Error):
                raise ValidationError(_('Upload a valid PDF.'))
            if not data.startswith(b'%PDF-') or b'%%EOF' not in data[-2048:]:
                raise ValidationError(_('Upload a PDF file, not an image or another document.'))
            if len(data) > 64000000:
                raise ValidationError(_('The PDF exceeds the 64 MB website safety limit. Optimize images or publish separate volumes.'))
            if len(data) > 24000000 and getattr(record, 'published', False) and not getattr(record, 'large_pdf_approved', False):
                raise ValidationError(_('This PDF exceeds the recommended 24 MB. Select Approve large PDF download before publishing.'))

    def action_publish(self):
        self.check_access('write')
        self._check_pdf()
        # Keep the user's saved approval; the write constraint validates size.
        self.write({'published': True})

    def action_unpublish(self):
        self.write({'published': False})


class NewsletterIssuePublication(models.Model):
    _inherit = 'elks.newsletter.issue'

    def action_publish_website(self):
        self.ensure_one()
        self.check_access('write')
        if self.state != 'final':
            raise UserError(_('Mark the newsletter Final before publishing it.'))
        website = self.env['website'].search([('company_id', '=', self.env.company.id)], limit=1)
        if not website:
            raise UserError(_('Configure a website for this company first.'))
        # Serialize repeated Publish clicks on this issue.
        self.env.cr.execute('SELECT id FROM elks_newsletter_issue WHERE id = %s FOR UPDATE', [self.id])
        xmlid = 'elks_newsletter.action_report_bulletin_' + ('legal' if self.page_size == 'legal' else 'letter')
        report = self.env.ref(xmlid)
        pdf, _kind = report._render_qweb_pdf(report.report_name, self.ids)
        archive = self.env['elks.newsletter.archive']
        release = archive.search([('issue_id', '=', self.id), ('website_id', '=', website.id)], limit=1)
        approved = bool((self.studio_document or {}).get('largeSizeApprovedBytes'))
        vals = {'name': self.name, 'issue_month': self.issue_date, 'website_id': website.id,
                'issue_id': self.id, 'pdf': base64.b64encode(pdf), 'filename': 'newsletter-%s.pdf' % self.issue_date.strftime('%Y-%m'), 'large_pdf_approved': approved, 'published': len(pdf) <= 24000000 or approved}
        if release:
            release.write(vals)
        else:
            release = archive.create(vals)
        return {'type': 'ir.actions.act_window', 'res_model': archive._name, 'res_id': release.id,
                'view_mode': 'form', 'views': [(False, 'form')], 'target': 'current'}
