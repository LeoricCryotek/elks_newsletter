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

## Wrapping, framing and moving blocks (19.0.1.36.0)

Select a photo-and-text or officer-message block and set **Text around photo** to
**Wrap around photo**. The article continues beneath the picture. Use **Photo
area width** to adjust the space reserved for the image; photo-and-text blocks
also offer left/right positioning. Keep the article in that same block to wrap
it around the photo; separate text blocks remain separate.

**Inside padding**, **Block border**, **Block corners**, **Picture border** and
**Picture corners** apply in both editor and PDF. A border of zero means no
printed border. The purple selection outline is an editor guide.

Open **Widget gallery** for sample illustrations of each widget. Click a card
or drag it onto a sheet. Hover or select a block and drag its **Move** handle to
reorder it or move it onto another page. Dropping on a block inserts before it;
dropping on empty page space appends. Moves support Undo. Layout stays in the
page's normal reading order rather than arbitrary overlapping positions.

## Widget sizes and data controls (19.0.1.37.0)

The header shows **Paper Studio · v37**. If it does not, the updated editor has
not loaded. Upgrade `elks_newsletter`, restart workers and reopen Paper Studio;
this release versions the iframe and its CSS/JavaScript asset URLs.

Select a block and set **Widget width (columns out of 3)** to one third, two
thirds or full width. Consecutive blocks fill the same row when their total width
fits. Drag the visible **Drag** handle to reorder or move between pages. Use
**Widget position** for a single narrow block's left/center/right placement.
**Vertical alignment** places a block top/middle/bottom beside its row's tallest
block; **Minimum frame height** also allows positioning its content within a
larger frame. This editor uses rows and blocks, not free overlapping coordinates.

Select a calendar and choose **Month shown**. Blank follows the issue month.
New Members and Volunteer Leaderboard have the same month override and update
live. **Choose members…** opens the existing Odoo selection wizard directly from
New Members or In Memoriam. Its curated list applies to the entire issue and
supersedes automatic month filtering. The New Members wizard initially uses the
selected block's month. Reset to Automatic in that wizard restores date filtering.
The memorial's automatic window remains the calendar month before the issue date.
The underlying Odoo initiation/death dates determine automatic membership lists;
the newsletter's member picker changes who appears, not those source records.

## Compact pages (19.0.1.38.0)

**Compact pages** repacks all blocks in reading order starting at page one,
removes empty sheets and minimum frame heights, tightens paragraph/line/block
spacing, reduces spacer heights, and trims excess officer-widget padding and
photo height. It changes the visible layout and saved PDF together. Undo restores
the prior pages and settings. It intentionally removes previous page boundaries;
use it when you want fewer pages. It does not drop articles or scale an entire
page. Content that still exceeds a whole sheet remains flagged.

Select a block to fine-tune **Line height**, **Paragraph spacing**, and **Space
after block**. Fitting all content onto one page depends on its actual length;
compaction reports the resulting number of pages rather than clipping text.

## Publisher-style flow (19.0.1.39.0)

The [publisher/platform review](PUBLISHER_RESEARCH.md) explains the design changes.
**Flow pages** now uses the available space in reading order, continuing text and
Events/Upcoming Events rather than moving every whole widget. Text is editable in
each continuation. The portrait stays in the first officer-message fragment.
Event fragments keep their Odoo source and select ranges of whole entries.

**Auto flow** runs after leaving text editing and after live Odoo data refresh.
New editions start with it enabled. Existing saved editions remain manual until
you enable it. Reflow merges adjacent linked fragments before calculating the
new layout, so shortening a story can reclaim earlier blank space. Manual page
boundaries are intentionally removed by Flow pages; use manual mode for deliberate
full-page calendars or mailing sections.

**Page flow** on a selected block can keep it together. Complex calendars,
photo grids and arbitrary column/table layouts remain indivisible in this release.
A single oversized object still needs manual adjustment and remains flagged.

**Fit selected widget** tightens its frame and paragraph spacing and reduces
supported text sizes only as far as 12px. **Compact pages** tightens the edition
then applies the continuation engine. Both are visible changes with Undo. Page
thumbnails show space usage. Save and PDF export retain the resulting fragments;
no separate printer-only shrink is applied.

### Linked continuation notices (v40)

Split stories show a framed “Continued on page X” notice at the end of each fragment. The destination follows the next linked fragment when pages are moved or inserted. Officer story continuations open with “Officer Message (officer title) Continued....”. Automatic flow reserves room for the notice; manual Continue on next page also links the fragments. Both editor and PDF use the same labels.

### Officer photos and member dialogs (v41)

Select an officer message and use Photo position → Left or Right. This applies to separate columns and wrapped text, including PDF output. Page thumbnail frames fit within their cards. Member chooser actions include explicit form views for the Odoo 19 action service.

### Page alignment and stable editing position (v42)

The last widget row uses remaining page space for Middle or Bottom vertical alignment without requiring a minimum frame height. Within earlier rows, widgets align relative to their neighbors; a taller minimum frame also aligns content inside that frame. Redraws preserve the center desk and settings panel scroll positions. Automatic flow keeps the visible block anchored and retains the selected page when possible.

### Blank starts and refresh identity (v43)

New Paper Newsletter starts with one empty page. The issue ID is retained in Odoo action navigation state so refreshing loads that same issue. A missing issue ID raises a clear error and never creates a replacement. Existing saved layouts remain intact; save authored changes before refreshing.

### Standard Elks widgets (v44)

The widget picker and gallery add the sections most Elks bulletins carry. These are also available in the original editor's Lodge block group.

- **Lodge data:** Member birthdays (grouped by day, no birth years), Membership milestones (members reaching a multiple of five years this month, less lost years), Applications for membership (Proposed, Under Investigation and Balloting applications with proposers), and Committee chairs (current lodge year). Birthdays and milestones accept **Month shown** like the calendar.
- **Fraternal text (editable):** Eleven O'Clock Toast, Elks mission, Elks National Foundation, Veterans service, Youth programs, Sickness & distress (prefilled from the latest lodge meeting minutes within 60 days of the issue date), and Lodge meetings & hours (lodge address, phone and website from Lodge Settings, with schedule lines to fill in).
- **Elk of the Month:** a photo-and-text preset.

Review the editable placeholder lines (meeting nights, office hours, youth program dates) before printing.

### Opening and continuation fit (v44)

The host passes only serializable state to Odoo’s bound updateActionState callback. Member-list header buttons are hidden in Paper Studio mode; use Choose members within widgets. Pagination validates the fully rendered document and remeasures linked continuations when later page-number notices add height.

### Shared top and bottom stacks (v46)

Vertical alignment Bottom anchors a widget to the printable bottom edge regardless of its insertion order. Multiple bottom widgets form a stable stack. Default Top widgets stack from the top of the same page, filling the space above bottom widgets. The groups share a page while their combined heights fit; overflow remains visible and Flow pages paginates when they collide. Thumbnail free-space counts exclude the flexible gap between stacks.

### Lock and reorder pages (v47)

Select a thumbnail, then Page settings → Lock page. Locked pages retain their saved widgets and data snapshots; flow and compaction only affect unlocked sections. Unlock before editing or refreshing the page. Adding a widget while a locked page is selected creates a new blank destination; moving content to a locked next page creates an unlocked page before it. Drag thumbnails to another thumbnail to place the dragged page before it, including locked pages. Page order updates printed page numbers and continuation links. Save persists locks and order; Undo restores either change.

### Review cleanup (v49)

Officer photo-side controls match the rendered default. Failed pagination restores its original structured layout and removes temporary styles. Saving locked snapshots checks final page/widget IDs to prevent accidental duplication when a locked widget is moved through an external client.
