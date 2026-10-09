# Original editor paper layout fixes

For the new page-based editor in 19.0.1.33.0, see [Paper Studio](PAPER_STUDIO.md).
The notes below describe the retained original editor.

The issue's **Paper Size** chooses US Letter (8.5 × 11 inches) or US Legal
(8.5 × 14 inches). Both use the same width and margins. Letter's printable
height is 10 inches; Legal's is 13 inches.

The editor and report now share `static/src/css/newsletter_layout.css`.
The former report-only rules shrank paragraphs to 11.5px, compressed headings,
removed paragraph spacing, and changed section padding. Those overrides have
been removed. Authored inline font sizes, spacing, alignment and image dimensions
are preserved. Desktop columns apply at paper width in both views.

Margins are 40 CSS pixels at the top and sides, and 56 at the bottom (about
0.42 and 0.58 inches). Whole pixel values matter: Chromium rounds fractional
print margins, which otherwise can alter line wrapping. Negative column gutters
have also been removed to prevent automatic print scaling.

## Install on the Odoo server

1. Deploy the updated module, including `static/fonts` and `static/src/css`.
2. Upgrade the module using its existing technical name, `elksbulletin`, and
   restart all Odoo workers. The XML views, report paperformats, Python code,
   and editor assets all changed.
3. In Settings → Technical → Parameters → System Parameters, use
   `elksbulletin.pdf_engine = chromium`. An unset parameter now defaults to
   Chromium, but previously saved values are respected.
4. Provide Playwright and its Chromium browser in the Python environment used
   by Odoo, or keep an existing working `elksbulletin.chromium_path` setting.
   Chromium errors now stop printing with a clear message. They do not quietly
   switch to wkhtmltopdf and change the layout.
5. Refresh the browser assets, open an existing issue, switch Paper Size between
   Letter and Legal, and compare Preview PDF with the canvas. Save the issue
   before exporting.

The bundled open-license Gelasio faces supply the Georgia/Times New Roman
choices, Arimo supplies Arial, and Great Vibes supplies the masthead. Their
licenses are included. Other selected font families still require that font to
exist on both the user's computer and the print server.

## Pagination and dynamic blocks

The editor is a continuous paper-width canvas with printable-height guides.
Manual page breaks push the next block to the selected size's next guide without
saving artificial spacer margins into the newsletter. It is not a fully paginated
word processor: natural page breaks can move headings or whole images, and
placeholder blocks change height when populated with lodge data. **Preview PDF**
is the exact final pagination and uses the same report path as Print / Download.

Automatic WeasyPrint continuation bars and pin-to-bottom fillers remain part of
that explicitly selected legacy engine. They are not simulated by Chromium's
editor guides.

## Verification

`tests/paper_layout_model.py` checks that switching sizes preserves content,
both reports default to Chromium, a Chromium failure cannot silently switch
engines, and unrelated reports retain their normal renderer. It uses Python
with lxml and does not require an Odoo database.

`tests/paper_layout.mjs` uses Playwright, pdf-lib and pdfjs-dist to check both
paper dimensions, authored typography, two paragraphs' exact PDF line wrapping,
manual page breaks, and the page-guide observer becoming idle. Set
`ELKS_CHROMIUM` to a system Chrome executable if needed. Test screenshots and
PDFs go to `/tmp/elks-paper-layout` by default.

These checks passed locally. Full Odoo integration with the saved September
issue still needs verification on the server; its HTML and lodge database are
not included in this repository.
