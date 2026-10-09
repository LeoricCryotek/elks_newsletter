# Paper Studio — 19.0.1.33.0

Paper Studio is the first paper-first newsletter workspace inside Odoo. It renders
actual US Letter (8.5 × 11 inch) or Legal (8.5 × 14 inch) sheets using the same
page renderer for editing and PDF export.

## Install

Deploy the complete module, including static assets and bundled fonts. Upgrade
**elks_newsletter** (the technical module name), restart all Odoo workers, and refresh
browser assets. The server needs the Python Playwright package and its Chromium
browser installed for the Odoo service account. Paper Studio requires this engine
so it can validate the rendered pages before export.

These changes are local and have not been deployed or tested against a running
Odoo database.

## Compose

Choose **New Paper Newsletter** in the newsletter list, or open an existing issue
and choose **Paper Studio**. Select Letter or Legal in the editor. Existing issue
HTML remains in the original editor; saving in Studio selects the new PDF layout.
There is no automatic conversion of legacy HTML into structured pages yet.

Add headings, rich text, two or three columns, uploaded photos, or lodge-data
blocks. Use page thumbnails to select sheets. Appearance controls set fonts,
sizes, spacing, alignment and photo dimensions. Add, reorder or delete pages;
move a block to the next page, or place the text cursor and use **Continue on next
page** to split an article. Undo can recover recent edits and deleted pages.

The **Bulletin widgets** picker includes the original masthead, section bar,
officer message (with officer selection), mailing panel, member photo grid,
column layouts, photo-and-text pairs (photo on either side with adjustable widths),
spacer, continuation label and page break, plus every lodge-data
widget: new members, memorials, officers, calendar, charity, volunteer leaderboard,
events, upcoming events, project dollars and dues reminders. Mailing contact details come from lodge settings. The editable postage permit
text starts from the existing bulletin template and must be checked for your lodge.

Draft widgets pull actual Odoo data immediately when inserted or changed, on
opening the editor, and every minute while the editor is visible. **Refresh Odoo
data** updates them on demand. Authored message text is retained. These refreshes
do not save your edition. Final editions keep their saved snapshots.

Resolved widgets automatically move trailing blocks to subsequent sheets when
needed. **Auto-format pages** also runs this fitting on demand; Undo reverses it.
A single block taller than a whole sheet remains visibly flagged and requires
splitting or reducing it. The renderer waits for fonts and images before fitting.

Save refreshes lodge-data snapshots using the issue's existing settings and
curated lists. Preview PDF saves first, then validates the resolved pages.
Overflow and missing or broken photos stop export rather than shrinking or
clipping the newsletter. Fix the marked page by moving or splitting content.

Final editions are read-only until reset to draft. Saved content and lodge-data
snapshots determine the PDF; subsequent changes to lodge records do not alter
that saved snapshot. Concurrent saves are rejected so one editor cannot silently
overwrite another editor's changes.

## Verification and current limits

Standalone Chromium checks cover both paper sizes, PDF dimensions and page
counts, matching paragraph line wrapping, columns, photos, lodge-data snapshots,
overflow blocking, text continuation, undo and final locking. Python checks cover
document sanitization, access boundaries, snapshots and save conflicts. The Odoo
message bridge is simulated in those browser tests; a live Odoo installation
still needs an integration check after upgrade.

This phase uses ordered page blocks and explicit continuation. Free-form drag
positioning, automatic legacy import, persistent revision history, and email or
website publishing remain future work.
