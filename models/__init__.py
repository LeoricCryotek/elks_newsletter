# -*- coding: utf-8 -*-
# =============================================================================
# === HUMAN ===
# Loads the module's models: the newsletter Issue and its Template, plus the
# report override that prints the newsletter with WeasyPrint.
# === AI AGENT ===
# Import order is not significant here (no load-time cross refs). ir_actions_report
# inherits ir.actions.report to swap the PDF engine for the two bulletin reports.
# =============================================================================
from . import elks_newsletter_template
from . import elks_newsletter_issue
from . import elks_newsletter_in_memoriam_wizard
from . import ir_actions_report

from . import elks_newsletter_studio
from . import elks_newsletter_archive
from . import newsletter_website
from . import newsletter_marketing
