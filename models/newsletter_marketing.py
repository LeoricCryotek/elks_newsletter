"""Prepare a reviewable marketing draft when a newsletter is finalized."""
from html import escape
from email.utils import formataddr
from lxml import html
from odoo import fields, models, _
from odoo.exceptions import UserError
from .newsletter_email import build_digest


class NewsletterMarketing(models.Model):
    _inherit = 'elks.newsletter.issue'

    marketing_mailing_id = fields.Many2one('mailing.mailing', string='Newsletter marketing email', copy=False, readonly=True, ondelete='set null')

    def _newsletter_email_body(self, base_url):
        self.ensure_one()
        url = base_url.rstrip('/') + '/elks/newsletter'
        month = self.issue_date.strftime('%B %Y')
        document = self.studio_document if self.editor_mode == 'paper' else None
        if not document:
            root = html.fragment_fromstring(str(self._render_print_body_inner(self.body_arch or self.body_html or '<p></p>')), create_parent='div')
            blocks = []
            for node in root.xpath('.//*[contains(@class,"o_elks_officer_exalted_ruler")]'):
                story = node.xpath('.//*[contains(@class,"s_elks_story_flow")]')
                blocks.append({'source':'message','officer':'exalted_ruler','html': ''.join(html.tostring(child,encoding='unicode') for child in story), 'resolvedHTML':html.tostring(node,encoding='unicode')})
            for node in root.xpath('.//*[@data-elks-block="events" or @data-elks-block="upcoming_events"]'):
                blocks.append({'source':node.get('data-elks-block'),'resolvedHTML':html.tostring(node,encoding='unicode')})
            document={'pages':[{'blocks':blocks}]}
        return build_digest(document, month, self.lodge_name or self.env.company.name or '', url,
                            base_url.rstrip('/') + '/web/image/res.company/%s/logo' % self.env.company.id,
                            {'phone': self.env.company.phone or '', 'email': self.env.company.email or ''})

    def action_refresh_marketing_email(self):
        self.ensure_one()
        self.check_access('write')
        mailing = self.marketing_mailing_id
        if not mailing or mailing.state != 'draft':
            raise UserError(_('Only a draft marketing email can be rebuilt.'))
        website = self.env['website'].search([('company_id', '=', self.env.company.id)], limit=1)
        body = self._newsletter_email_body(website.get_base_url() if website else self.get_base_url())
        mailing.write({'body_arch':body,'body_html':body})
        return self.action_open_marketing_email()

    def _newsletter_mailing_defaults(self):
        self.ensure_one()
        previous = self.env['mailing.mailing'].search([
            ('mailing_type', '=', 'mail'), ('state', '=', 'done'),
            ('user_id', '=', self.env.user.id), '|',
            ('subject', 'ilike', 'newsletter'), ('subject', 'ilike', 'news letter')],
            order='sent_date desc, id desc', limit=1)
        values = {'preview': '%s Newsletter' % self.issue_date.strftime('%B %Y'),
                  'user_id': self.env.user.id, 'reply_to_mode': 'new'}
        company_email = self.env.company.email
        sender = formataddr((self.env.company.name or '', company_email)) if company_email else self.env.user.email_formatted
        values['email_from'] = previous.email_from if previous and previous.email_from else sender
        values['reply_to'] = previous.reply_to if previous and previous.reply_to else sender
        if previous:
            values.update(mailing_model_id=previous.mailing_model_id.id,
                          mailing_domain=previous.mailing_domain or "[('id', '=', 0)]")
            if previous.contact_list_ids:
                values['contact_list_ids'] = [(6, 0, previous.contact_list_ids.ids)]
        else:
            lists = self.env['mailing.list'].search([('name', '=ilike', 'Newsletter Mailing List')], limit=2)
            if len(lists) == 1:
                values.update(mailing_model_id=self.env['ir.model']._get_id('mailing.list'),
                              mailing_domain='[]', contact_list_ids=[(6, 0, lists.ids)])
        return values

    def action_mark_final(self):
        self.check_access('write')
        if not self:
            return super().action_mark_final()
        # Prevent duplicate marketing drafts on concurrent/repeated Final clicks.
        self.env.cr.execute('SELECT id FROM elks_newsletter_issue WHERE id IN %s FOR UPDATE', [tuple(self.ids)])
        self.invalidate_recordset(['marketing_mailing_id'])
        result = super().action_mark_final()
        for issue in self:
            if issue.marketing_mailing_id:
                continue
            website = self.env['website'].search([('company_id', '=', self.env.company.id)], limit=1)
            base_url = website.get_base_url() if website else issue.get_base_url()
            body = issue._newsletter_email_body(base_url)
            values = {
                'subject': '%s Newsletter' % issue.issue_date.strftime('%B %Y'),
                'mailing_type': 'mail', 'body_arch': body, 'body_html': body,
                'mailing_model_id': self.env['ir.model']._get_id('res.partner'),
                'mailing_domain': "[('id', '=', 0)]", 'user_id': self.env.user.id,
            }
            values.update(issue._newsletter_mailing_defaults())
            mailing = self.env['mailing.mailing'].create(values)
            issue.marketing_mailing_id = mailing
        return result

    def action_open_marketing_email(self):
        self.ensure_one()
        return {'type':'ir.actions.act_window', 'res_model':'mailing.mailing',
                'res_id':self.marketing_mailing_id.id, 'view_mode':'form', 'views':[(False,'form')], 'target':'current'}
