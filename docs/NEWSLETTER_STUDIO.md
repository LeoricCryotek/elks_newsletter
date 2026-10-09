# Proposed Odoo Newsletter Studio

Status: the first Letter/Legal Paper Studio implementation is available locally in
19.0.1.33.0. See [Paper Studio installation and use](PAPER_STUDIO.md). This document
describes the broader product direction; later publishing and revision-history
features below are proposals, not completed features.

## Product direction

Build a dedicated newsletter workspace inside the existing Odoo module, inspired
by beehiiv's simple writing, design and publishing workflow. Keep lodge contacts,
officers, calendar and charity data connected to their existing Odoo records.

The print requirement adds something distinct: editable, individual US Letter
or Legal sheets, with page thumbnails, visible margins, and an exact final PDF
preview. The current continuous email-marketing canvas cannot provide that full
page-editing experience through additional CSS alone.

## First phase: compose and print

- Issue dashboard with draft/final status, month, template and paper size.
- Dedicated full-screen editor: pages on the left, selected sheet in the centre,
  content and appearance controls on the right.
- Real page records with explicit ordered blocks, rather than arbitrary email
  HTML as the sole source of truth. Blocks include text, images, columns,
  officer messages, new members, memorials, calendar and charity figures.
- Letter is 8.5 × 11 inches; Legal is 8.5 × 14 inches. Changing size recomputes
  available space and reports any overflow; it never scales text silently.
- Use one block renderer and bundled typography for the editor and Chromium
  export. Keep editing controls outside the printable page.
- Resolve lodge-data blocks before measuring layout, and offer explicit refresh
  of those blocks. Finalising stores a rendered snapshot so later database
  changes do not alter a previously finalised issue.
- Show overflow and provide move-to-next-page controls. Long article blocks
  need a defined continuation policy; never silently clip content to a page.
- Save revisions and retain the prior final PDF for recovery.

A proof of concept should first demonstrate a two-column page, text/image
editing, a lodge-data block, Letter/Legal switching, overflow handling and
matching PDF output. This is the gate before replacing the current editor.

## Later phase: publish and distribute

Derive separate email and website layouts from the same issue's content. Email
and mobile web require responsive layouts; they do not use the paper's page
coordinates. Reuse Odoo's mailing infrastructure where appropriate for contact
selection, delivery and unsubscribes, after checking its installed configuration.
Add a website archive, scheduling and delivery/readership reporting as separate
features. Sending and public publishing remain explicit user actions.

## Existing issues and rollout

Keep legacy issues editable with the current editor during rollout. Importing
free-form HTML into structured blocks needs a preview and preservation of the
original; do not automatically replace saved July or September layouts. Start
new issues in the Studio only after the prototype passes acceptance tests.

## Acceptance checks

1. Letter and Legal sheet and PDF dimensions agree.
2. Entered font sizes, line wrapping, column widths and image positions agree
   between the resolved editor page and exported PDF within a stated tolerance.
3. No printed text or image disappears on overflow or a page transition.
4. A finalised issue exports identically after underlying lodge data changes.
5. Editing and migration preserve access permissions and original issue content.
6. Public website output excludes member-only content unless explicitly selected.

Reference: https://www.beehiiv.com/ (reviewed October 8, 2026).
