# Print publishing and newsletter-builder review

Reviewed 9 October 2026 against official vendor documentation. The implementation
following this review is Paper Studio 19.0.1.39.0. Product observations below are
sourced; the design choices and code assessment are our own conclusions.

## The problem in this module

Earlier Paper Studio editions stored ordered blocks on explicit sheets. The
fitting routine moved an entire overflowing block forward, even when half of it
could have occupied the preceding sheet. A tall event widget or officer article
therefore created large holes. Changing its outer margin could not solve that
structural problem. Compaction helped spacing but still treated the widget as an
indivisible object.

The editor must distinguish a story from its visible page fragments. An article
can remain logically one story while appearing in several frames. A linked Odoo
widget must retain its source rather than become copied, stale HTML when split.
PDF export must reproduce the measured visible fragments instead of deciding
page breaks independently.

## Platform comparisons

| Platform | Documented capability | Relevant lesson for this module |
| --- | --- | --- |
| Microsoft Publisher | Linked text boxes carry a story across pages; text-fit commands can shrink overflow or choose best fit. | Provide continuation first and explicit, bounded fitting separately. |
| Adobe InDesign | Threaded frames carry text continuously; Smart Text Reflow adds/removes pages; fitting commands distinguish proportional fill, proportional contain, and frame/content sizing. | Store linked stories, remove unnecessary empty sheets, and keep image fitting distinct from text fitting. |
| beehiiv | Columns are blocks with width and vertical-position controls; block menus provide spacing, borders and grouping. | Make composition controls contextual and keep repeatable blocks easy to select. |
| Mailchimp | The email builder offers layouts, drag-and-drop blocks and styling; columns can be adjusted in layout settings. | Borrow the approachable block workflow, but do not rely on email layout for physical pagination. |
| Odoo Website | Building blocks support drag-and-drop; grid and column modes have different positioning behavior. | Row/column ordering and free positioning are separate design modes. A print editor needs an explicit physical constraint layer. |
| Canva | Margin/safe-zone guides and print checks distinguish visible design from production boundaries. | Keep physical margins and overset feedback visible; diagnose layout before export. |

Sources supporting those observations:

- [Microsoft: Fit text in a text box](https://support.microsoft.com/en-us/publisher/fit-text-in-a-text-box).
- [Adobe: Thread text frames](https://helpx.adobe.com/indesign/desktop/add-and-manage-text/add-and-import-text/thread-text-frames.html).
- [Adobe: Smart Text Reflow](https://helpx.adobe.com/indesign/desktop/add-and-manage-text/add-and-import-text/set-up-smart-text-reflow.html).
- [Adobe: Object fitting](https://helpx.adobe.com/indesign/desktop/add-graphics-and-media/manage-frames-and-objects/fit-object-to-frame.html).
- [beehiiv: Columns and spacing](https://www.beehiiv.com/support/article/14998315019159-how-to-add-and-customize-columns).
- [Mailchimp: New email builder](https://mailchimp.com/help/design-an-email-new-builder/).
- [Odoo 19: Building blocks](https://www.odoo.com/documentation/19.0/applications/websites/website/web_design/building_blocks.html).
- [Canva: Margins, bleed and crop marks](https://www.canva.com/help/margins-bleed-crop-marks/).

Affinity's indexed documentation also described linked frames, but the current
help-page fetch returned navigation without the article body. It was not used as
an implementation authority. This review does not infer feature support from
third-party reviews or marketing claims.

## Chosen architecture

Keep the module inside Odoo. Existing lodge models remain the content sources;
there is no second contact database or publishing service. Keep one physical
sheet renderer for both the editor and PDF. Add a browser-measured pagination
layer that changes structured pages, so its results are editable and persist.

A document has a manual/automatic flow policy. Blocks have a keep-together policy
and optional linked-story identifiers. Automatically generated continuations are
merged back into a logical story before a subsequent reflow. This lets text move
backward when its length shrinks instead of accumulating arbitrary page breaks.

Text continuation uses DOM ranges at word boundaries, preserving the authored
inline formatting and complete text. Officer and photo-and-text stories keep the
portrait in the first fragment; following fragments are ordinary editable text.
Event widgets keep whole entries and repeat their existing heading. Their stored
ranges select entries from a server-resolved snapshot, never client-supplied
HTML. Every refresh/save resolves a source once per document so fragments share
one consistent snapshot.

Automatic flow runs after editing focus leaves a story and after live data has
resolved. It avoids destroying the typing cursor. Existing editions retain manual
mode until the user opts in; new editions start with automatic flow. The explicit
Flow pages command repacks a manual edition too. Manual mode is useful when a
calendar or mailing page intentionally occupies its own sheet.

## Implemented changes

1. **Flow pages:** repack in reading order; continue supported text and event
   widgets into remaining space, create necessary sheets, and remove empty ones.
2. **Auto flow:** perform that operation on data refresh and after leaving text
   editing, with manual mode available.
3. **Page flow policy:** allow continuation or keep a widget together.
4. **Linked snapshots:** persist event ranges and story identifiers, validate
   their schema, and keep final editions frozen.
5. **Fit selected widget:** explicitly tighten local spacing and lower supported
   text sizes down to a 12px floor. It is an editing operation, visible before
   printing, with Undo. It does not squeeze the calendar or masthead.
6. **Page usage feedback:** show occupied proportion and remaining pixel space.
7. **Shared output:** persist the actual fragments used by both editor and PDF;
   no independent PDF-only shrink or hidden crop.

## Verification and boundaries

Browser checks cover Letter/Legal dimensions and previous paragraph wrapping,
photo framing, row widths, drag/drop, live widget resolution, undo and final locks.
New fixtures verify event entries filling the remaining first-page space,
continuation counts, a matching two-page PDF, complete long-paragraph text,
formatting retention, and repeated flow without duplication or loss. Python
checks validate ranges, linked identifiers, policies and one snapshot resolution
per source. They do not replace a running Odoo/database integration check.

This is a purpose-built print workflow, not full InDesign parity. Calendars,
photo grids, arbitrary multi-column blocks and other complex tables stay intact.
Individual oversized event entries can still require shorter copy or a smaller
frame/font. Full widow/orphan composition, continued numbered-list numbering,
free-form overlapping frames, parent-page templates, PDF/X/CMYK production,
bleed and crop marks remain separate future work. These limitations are visible;
unsupported large objects are flagged rather than silently omitted.

## Follow-on priorities

First validate the new flow against real lodge editions and save/reopen/export
cycles. Then expand row-aware continuation to member and officer tables, add
reusable typographic presets and explicit page-break/parent-page controls, and
improve image focal-point and resolution feedback. Website/email publishing can
reuse the content sources later, but needs its own responsive renderer and
approval workflow; it should not compromise the print canvas.
