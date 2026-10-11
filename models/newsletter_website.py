from odoo import fields, models


class NewsletterWebsite(models.Model):
    _inherit = 'website'

    newsletter_banner_image = fields.Image(string='Newsletter banner photo', max_width=2400, max_height=1600, attachment=False)
    newsletter_banner_title = fields.Char(string='Banner heading', default='Newsletter Depot', translate=True)
    newsletter_banner_subtitle = fields.Char(string='Banner subtitle', default='Lodge news. Shared service. Community spirit.', translate=True)
