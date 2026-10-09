/* Standalone paper workspace. Odoo communication is confined to the host bridge. */
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const Renderer = window.ElksPaperRenderer;
    let payload, selectedId, activePage, dirty = false, pending = false;
    let lastSelection = null;
    const undo = [];
    const uid = () => crypto.randomUUID().replaceAll('-', '');
    const sources = { new_members: 'New members', in_memoriam: 'In memoriam', officers: 'Lodge officers', calendar: 'Lodge calendar', charity: 'Charity totals', leaderboard: 'Volunteer leaderboard', events: 'Events', upcoming_events: 'Upcoming events', project_dollars: 'Project dollars', delinquents: 'Dues reminder' };
    const labels = { text: 'Text', heading: 'Heading', columns: 'Columns', image: 'Photo', dynamic: 'Lodge data', widget: 'Bulletin widget', spacer: 'Spacer', gallery: 'Member photo grid', photo_text: 'Photo and text' };
    const officers = {'exalted_ruler': 'Exalted Ruler', 'leading_knight': 'Leading Knight', 'loyal_knight': 'Loyal Knight', 'lecturing_knight': 'Lecturing Knight', 'secretary': 'Secretary', 'treasurer': 'Treasurer', 'tiler': 'Tiler', 'esquire': 'Esquire', 'chaplain': 'Chaplain', 'inner_guard': 'Inner Guard', 'organist': 'Organist', 'pianist': 'Pianist', 'sergeant_at_arms': 'Sergeant At Arms', 'presiding_justice': 'Presiding Justice', 'boardchair': 'Boardchair', 'trustee1y': 'Trustee1Y', 'trustee2y': 'Trustee2Y', 'trustee3y': 'Trustee3Y', 'trustee4y': 'Trustee4Y', 'trustee5y': 'Trustee5Y', 'assistant_secretary': 'Assistant Secretary', 'assistant_treasurer': 'Assistant Treasurer', 'house_chair': 'House Chair', 'activities_chair': 'Activities Chair', 'membership_chair': 'Membership Chair', 'lodge_advisor': 'Lodge Advisor'};
    let galleryPhoto = 0;
    let resolveId = null;
    function fitPages() {
        if (!editable() || $('sheets').contains(document.activeElement)) return;
        let moved = false;
        for (let pass = 0; pass < 300; pass++) {
            const sheet = [...$('sheets').querySelectorAll('.elks-paper-sheet')].find(sheet => {
                const content = sheet.querySelector('.paper-content');
                return content.scrollHeight > content.clientHeight + 1 && payload.document.pages.find(p => p.id === sheet.dataset.pageId).blocks.length > 1;
            });
            if (!sheet || payload.document.pages.length >= 60) break;
            if (!moved) remember();
            const page = payload.document.pages.find(p => p.id === sheet.dataset.pageId);
            const next = followingPage(page);
            next.blocks.unshift(page.blocks.pop()); moved = true; render();
        }
        if (moved) change();
        measure();
    }
    function refreshData() {
        if (!editable()) return;
        if (!payload.document.pages.some(page => page.blocks.some(block => ['dynamic', 'widget'].includes(block.kind)))) return;
        resolveId = uid();
        $('data-status').textContent = 'Loading Odoo content…';
        send('resolve', { requestId: resolveId, document: payload.document });
    }
    function send(type, extras = {}) {
        if (window.parent === window) return showNotice('Open this editor from the newsletter’s Paper Studio button in Odoo.');
        window.parent.postMessage({ channel: 'elks-paper', type, ...extras }, window.location.origin);
    }
    function showNotice(text) { $('notice').textContent = text; $('notice').hidden = !text; }
    function selected() {
        for (const page of payload.document.pages) {
            const block = page.blocks.find(block => block.id === selectedId);
            if (block) return { page, block };
        }
        return {};
    }
    function remember() {
        undo.push({ document: structuredClone(payload.document), paperSize: payload.paperSize });
        if (undo.length > 12) undo.shift();
        $('undo').disabled = false;
    }
    function change() {
        dirty = true;
        $('save-status').textContent = 'Unsaved changes';
        send('dirty', { dirty: true });
    }
    function editable() { return payload && !payload.readonly && !pending; }
    function load(data) {
        payload = structuredClone(data);
        activePage = payload.document.pages.some(page => page.id === activePage) ? activePage : payload.document.pages[0].id;
        if (!payload.document.pages.some(page => page.blocks.some(block => block.id === selectedId))) selectedId = null;
        dirty = false; pending = false;
        $('issue-title').textContent = payload.title;
        $('paper-size').value = payload.paperSize;
        $('save-status').textContent = payload.readonly ? 'Final edition' : 'Saved';
        showNotice(payload.readonly ? (payload.mode === 'legacy' ? 'This issue is a final edition in the original editor. Reset it to Draft to create a separate paper layout.' : 'This is a final edition. Reset it to Draft in Odoo to edit its pages.')
            : payload.mode === 'legacy' ? 'This is a separate paper layout. Your existing newsletter stays available in the original editor. Saving here selects Paper Studio for the PDF.' : '');
        render();
        send('dirty', { dirty: false });
        refreshData();
    }
    function setDisabled() {
        const disabled = !editable();
        document.querySelectorAll('[data-add],#save,#add-page,#paper-size,#page-up,#page-down,#delete-page,[data-format],#split-text,#undo,#widget-picker,#refresh-data,#fit-pages').forEach(node => node.disabled = disabled);
        $('undo').disabled = disabled || !undo.length;
        $('preview').disabled = pending || (payload?.readonly && payload?.mode === 'legacy');
        $('reload').disabled = pending;
        document.querySelectorAll('#sheets .paper-richtext').forEach(node => node.contentEditable = String(!disabled));
        document.querySelectorAll('#properties button,#properties input,#properties select').forEach(node => node.disabled = disabled);
    }
    function measure() {
        if (!payload) return [];
        const issues = Renderer.problems($('sheets'));
        const bad = new Set(issues.map(issue => issue.id));
        document.querySelectorAll('#sheets .elks-paper-sheet').forEach(sheet => sheet.classList.toggle('has-problem', bad.has(sheet.dataset.pageId)));
        $('page-problems').textContent = issues.map(issue => `Page ${issue.page}: ${issue.message}`).join(' ');
        $('page-problems').hidden = !issues.length;
        document.querySelectorAll('.page-thumb').forEach(thumb => {
            thumb.querySelector('.overflow-badge').hidden = !bad.has(thumb.dataset.pageId);
        });
        return issues;
    }
    function render() {
        Renderer.render($('sheets'), payload);
        $('sheets').querySelectorAll('.paper-richtext').forEach(node => {
            node.contentEditable = String(editable());
            node.spellcheck = true;
        });
        renderPages(); highlight(); renderProperties(); setDisabled();
        requestAnimationFrame(measure);
        document.fonts.ready.then(measure);
    }
    function highlight() {
        $('sheets').querySelectorAll('.paper-block').forEach(node => node.classList.toggle('selected', node.dataset.blockId === selectedId));
        document.querySelectorAll('.page-thumb').forEach(node => node.classList.toggle('active', node.dataset.pageId === activePage));
    }
    function renderPages() {
        $('page-list').replaceChildren();
        payload.document.pages.forEach((page, index) => {
            const button = document.createElement('button'); button.className = 'page-thumb'; button.dataset.pageId = page.id;
            const paper = document.createElement('span'); paper.className = 'thumb-paper';
            paper.style.height = `${(payload.paperSize === 'legal' ? 1344 : 1056) * .13}px`;
            const miniature = $('sheets').querySelector(`[data-page-id="${page.id}"]`).cloneNode(true);
            miniature.classList.add('o_elks_newsletter');
            miniature.inert = true; miniature.setAttribute('aria-hidden', 'true');
            miniature.querySelectorAll('.paper-richtext').forEach(node => node.removeAttribute('contenteditable'));
            paper.append(miniature);
            const title = document.createElement('span'); title.textContent = `Page ${index + 1}`;
            const badge = document.createElement('span'); badge.className = 'overflow-badge'; badge.textContent = 'Needs attention'; badge.hidden = true;
            button.append(paper, title, badge);
            button.addEventListener('click', () => {
                activePage = page.id; selectedId = null; highlight(); renderProperties();
                $('sheets').querySelector(`[data-page-id="${page.id}"]`).scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            $('page-list').append(button);
        });
    }
    function field(title, key, options) {
        const wrap = document.createElement('div'); wrap.className = 'property-field';
        const label = document.createElement('label'); label.textContent = title; label.htmlFor = `property-${key}`;
        const input = document.createElement(options ? 'select' : 'input'); input.id = `property-${key}`;
        if (options) Object.entries(options).forEach(([value, text]) => {
            const option = document.createElement('option'); option.value = value; option.textContent = text; input.append(option);
        });
        else { input.type = 'number'; input.min = key === 'fontSize' ? '8' : '0'; input.max = key === 'fontSize' ? '72' : key === 'height' ? '900' : '100'; }
        input.value = selected().block[key] ?? ({ gap: 12, fontSize: 16, font: 'sans', align: 'left', ratio: 'equal', source: 'new_members', width: 100, height: 240, fit: 'contain' }[key]);
        input.addEventListener('change', () => {
            if (!editable()) return;
            remember(); selected().block[key] = options ? input.value : Number(input.value);
            if (key === 'source' || key === 'officer') { delete selected().block.resolvedHTML; refreshData(); }
            change(); render();
        });
        wrap.append(label, input); return wrap;
    }
    function actionButton(title, fn, danger) {
        const button = document.createElement('button'); button.textContent = title;
        if (danger) button.className = 'danger';
        button.addEventListener('click', () => { if (editable()) fn(); }); return button;
    }
    function renderProperties() {
        const panel = $('properties'); panel.replaceChildren();
        const { block } = selected();
        if (!block) {
            const text = document.createElement('p'); text.className = 'muted'; text.textContent = 'Select a block on the page to change its appearance or position.'; panel.append(text); return;
        }
        const title = document.createElement('h2'); title.textContent = labels[block.kind]; panel.append(title);
        if (block.kind === 'spacer') panel.append(field('Height (px)', 'height'));
        else if (block.kind === 'dynamic') panel.append(field('Lodge data', 'source', sources));
        else {
            panel.append(field('Font', 'font', { sans: 'Sans serif', serif: 'Serif', script: 'Masthead script' }), field('Text size (px)', 'fontSize'), field('Alignment', 'align', { left: 'Left', center: 'Centre', right: 'Right', justify: 'Justify' }));
        }
        if (block.kind === 'widget' && block.source === 'message') panel.append(field('Officer', 'officer', officers));
        if (block.kind === 'gallery') {
            const select = document.createElement('select');
            block.photos.forEach((photo, i) => { const option = document.createElement('option'); option.value = i; option.textContent = `Member photo ${i + 1}`; select.append(option); });
            galleryPhoto = 0; select.addEventListener('change', () => galleryPhoto = Number(select.value));
            panel.append(select, actionButton('Choose member photo', () => $('photo-file').click()));
        }
        if (block.kind === 'columns' && block.columns.length === 2) panel.append(field('Column widths', 'ratio', { equal: 'Half / half', 'wide-left': 'Two thirds / one third', 'wide-right': 'One third / two thirds' }));
        if (block.kind === 'photo_text') panel.append(field('Photo position', 'side', { left: 'Left', right: 'Right' }), field('Column widths', 'ratio', { equal: 'Half / half', 'wide-left': 'Two thirds / one third', 'wide-right': 'One third / two thirds' }));
        if (block.kind === 'image' || block.kind === 'photo_text') panel.append(actionButton(block.src ? 'Replace photo' : 'Choose photo', () => $('photo-file').click()), field('Photo width (%)', 'width'), field('Photo height (px)', 'height'), field('Photo fitting', 'fit', { contain: 'Show whole photo', cover: 'Fill and crop' }));
        panel.append(field('Space after block (px)', 'gap'));
        const actions = document.createElement('div'); actions.className = 'block-actions';
        actions.append(actionButton('Move up', () => moveBlock(-1)), actionButton('Move down', () => moveBlock(1)), actionButton('Next page', nextPage), actionButton('Duplicate', duplicate), actionButton('Delete', () => {
            remember(); const { page } = selected(); page.blocks = page.blocks.filter(item => item.id !== selectedId); selectedId = null; change(); render();
        }, true)); panel.append(actions);
        setDisabled();
    }
    function moveBlock(direction) {
        const { page, block } = selected(); const index = page.blocks.indexOf(block); const other = index + direction;
        if (other < 0 || other >= page.blocks.length) return;
        remember(); [page.blocks[index], page.blocks[other]] = [page.blocks[other], page.blocks[index]]; change(); render();
    }
    function followingPage(page) {
        const index = payload.document.pages.indexOf(page);
        if (index === payload.document.pages.length - 1) payload.document.pages.push({ id: uid(), blocks: [] });
        return payload.document.pages[index + 1];
    }
    function nextPage() {
        const { page, block } = selected(); remember();
        const next = followingPage(page); page.blocks = page.blocks.filter(item => item !== block); next.blocks.unshift(block);
        activePage = next.id; change(); render();
        $('sheets').querySelector(`[data-page-id="${next.id}"]`).scrollIntoView({ block: 'start' });
    }
    function duplicate() {
        const { page, block } = selected(); remember(); const copy = structuredClone(block); copy.id = uid();
        page.blocks.splice(page.blocks.indexOf(block) + 1, 0, copy); selectedId = copy.id; change(); render();
    }
    function add(kind, source, preset) {
        if (!editable()) return;
        remember();
        const block = { id: uid(), kind, fontSize: kind === 'heading' ? 32 : 16, font: 'sans', align: 'left', gap: 12 };
        if (kind === 'heading') block.html = '<p>New heading</p>';
        if (kind === 'text') block.html = '<p>Write here.</p>';
        if (kind === 'columns') { block.columns = ['<p>First column.</p>', '<p>Second column.</p>']; block.ratio = 'equal'; }
        if (kind === 'photo_text') Object.assign(block, { html: '<p>Write the story beside your photo.</p>', side: 'left', ratio: 'equal' });
        if (kind === 'image' || kind === 'photo_text') Object.assign(block, { src: '', caption: '<p>Photo caption.</p>', width: 100, height: 240, fit: 'contain' });
        if (kind === 'dynamic' || kind === 'widget') block.source = source || 'new_members';
        if (kind === 'widget') { block.html = ''; if (source === 'message') block.officer = 'exalted_ruler'; }
        if (kind === 'gallery') block.photos = Array.from({ length: 3 }, () => ({ src: '', caption: '<p><b>Member name</b><br>Initiated — date</p>' }));
        if (kind === 'spacer') block.height = 48;
        if (preset === 'three_columns') block.columns.push('<p>Third column.</p>');
        if (preset === 'two_thirds') block.ratio = 'wide-left';
        if (preset === 'continued') block.html = '<p><i>Continued on page …</i></p>';
        payload.document.pages.find(page => page.id === activePage).blocks.push(block); selectedId = block.id; change(); render(); refreshData();
    }
    const picker = $('widget-picker');
    const widgets = { masthead: 'Lodge masthead', message: 'Officer message', section_bar: 'Section bar', mailing: 'Mailing panel', ...sources,
        photo_text: 'Photo + text (two columns)', photo_grid: 'Member photo grid', two_thirds: 'Two-thirds + one-third', three_columns: 'Three columns', continued: 'Continued on page', spacer: 'Spacer', page_break: 'Page break' };
    for (const [key, title] of Object.entries(widgets)) { const option = document.createElement('option'); option.value = key; option.textContent = title; picker.append(option); }
    picker.addEventListener('change', () => {
        const source = picker.value; picker.value = ''; if (!source || !editable()) return;
        if (source === 'page_break') return $('add-page').click();
        const kind = sources[source] ? 'dynamic' : ['two_thirds', 'three_columns'].includes(source) ? 'columns'
            : source === 'photo_text' ? 'photo_text' : source === 'photo_grid' ? 'gallery' : source === 'continued' ? 'text' : source === 'spacer' ? 'spacer' : 'widget';
        add(kind, source, source);
    });
    $('refresh-data').addEventListener('click', refreshData);
    $('fit-pages').addEventListener('click', fitPages);
    // Refresh draft data periodically and on return to the editor. Final editions
    // keep their saved snapshots. Text edits are never replaced by a data refresh.
    setInterval(() => { if (!document.hidden) refreshData(); }, 60000);
    window.addEventListener('focus', refreshData);
    $('sheets').addEventListener('click', event => {
        const block = event.target.closest('[data-block-id]'); const page = event.target.closest('[data-page-id]');
        if (page) activePage = page.dataset.pageId;
        if (block) { selectedId = block.dataset.blockId; highlight(); renderProperties(); }
    });
    $('sheets').addEventListener('focusin', event => { if (event.target.matches('.paper-richtext') && editable()) remember(); });
    $('sheets').addEventListener('input', event => {
        if (!editable()) return;
        const node = event.target.closest('.paper-richtext'); if (!node) return;
        selectedId = node.dataset.owner; const { block } = selected();
        if (node.dataset.field.startsWith('columns.')) block.columns[Number(node.dataset.field.split('.')[1])] = node.innerHTML;
        else if (node.dataset.field.startsWith('photos.')) block.photos[Number(node.dataset.field.split('.')[1])].caption = node.innerHTML;
        else block[node.dataset.field] = node.innerHTML;
        change(); requestAnimationFrame(measure);
    });
    $('sheets').addEventListener('load', measure, true);
    $('sheets').addEventListener('error', measure, true);
    document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();
        if (selection.rangeCount && $('sheets').contains(selection.anchorNode)) lastSelection = selection.getRangeAt(0).cloneRange();
    });
    document.querySelectorAll('[data-format]').forEach(button => {
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', () => {
            if (editable() && lastSelection) { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(lastSelection); document.execCommand(button.dataset.format); }
        });
    });
    $('split-text').addEventListener('mousedown', event => event.preventDefault());
    $('split-text').addEventListener('click', () => {
        const { page, block } = selected();
        if (!editable() || !block || block.kind !== 'text' || !lastSelection) return showNotice('Place the cursor in a text block where the next page should begin.');
        const rich = $('sheets').querySelector(`[data-block-id="${block.id}"] .paper-richtext`);
        if (!rich.contains(lastSelection.startContainer)) return showNotice('Place the cursor in the selected text block first.');
        const before = document.createRange(); before.selectNodeContents(rich); before.setEnd(lastSelection.startContainer, lastSelection.startOffset);
        const after = document.createRange(); after.selectNodeContents(rich); after.setStart(lastSelection.startContainer, lastSelection.startOffset);
        const left = document.createElement('div'), right = document.createElement('div'); left.append(before.cloneContents()); right.append(after.cloneContents());
        if (!left.textContent.trim() || !right.textContent.trim()) return showNotice('Choose a position inside the text, with content on both sides.');
        remember(); block.html = left.innerHTML; const continuation = { ...block, id: uid(), html: right.innerHTML };
        const next = followingPage(page); next.blocks.unshift(continuation); selectedId = continuation.id; activePage = next.id; change(); render();
        $('sheets').querySelector(`[data-page-id="${next.id}"]`).scrollIntoView({ block: 'start' });
    });
    document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => add(button.dataset.add)));
    $('photo-file').addEventListener('change', async event => {
        const file = event.target.files[0]; const { block } = selected(); event.target.value = '';
        if (!file || !block || !['image', 'gallery', 'photo_text'].includes(block.kind) || !editable()) return;
        if (file.size > 5000000 || !['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)) return showNotice('Choose a PNG, JPEG, WebP or GIF photo smaller than 5 MB.');
        const photoIndex = galleryPhoto;
        const reader = new FileReader();
        reader.onload = () => {
            if (!editable()) return;
            const current = payload.document.pages.flatMap(page => page.blocks).find(item => item.id === block.id);
            if (!current) return;
            remember(); if (current.kind === 'gallery') current.photos[photoIndex].src = reader.result; else current.src = reader.result; change(); render();
        };
        reader.readAsDataURL(file);
    });
    $('paper-size').addEventListener('change', () => { if (editable()) { remember(); payload.paperSize = $('paper-size').value; change(); render(); } });
    $('add-page').addEventListener('click', () => { if (editable()) { remember(); const page = { id: uid(), blocks: [] }; payload.document.pages.push(page); activePage = page.id; selectedId = null; change(); render(); $('sheets').lastElementChild.scrollIntoView({ block: 'start' }); } });
    function movePage(direction) {
        if (!editable()) return; const index = payload.document.pages.findIndex(page => page.id === activePage); const other = index + direction;
        if (other < 0 || other >= payload.document.pages.length) return;
        remember(); [payload.document.pages[index], payload.document.pages[other]] = [payload.document.pages[other], payload.document.pages[index]]; change(); render();
    }
    $('page-up').addEventListener('click', () => movePage(-1)); $('page-down').addEventListener('click', () => movePage(1));
    $('delete-page').addEventListener('click', () => {
        if (!editable()) return;
        if (payload.document.pages.length === 1) return showNotice('Keep at least one page in the newsletter.');
        remember(); payload.document.pages = payload.document.pages.filter(page => page.id !== activePage); activePage = payload.document.pages[0].id; selectedId = null; change(); render();
    });
    $('undo').addEventListener('click', () => { if (editable() && undo.length) { const previous = undo.pop(); payload.document = previous.document; payload.paperSize = previous.paperSize; activePage = payload.document.pages[0].id; selectedId = null; $('paper-size').value = payload.paperSize; change(); render(); } });
    function save(preview) {
        if (!payload || pending) return;
        // New data blocks are filled during saving, then checked again by the
        // PDF renderer. Never pretend a placeholder is the final lodge data.
        const issues = measure().filter(issue => !issue.message.startsWith('Save to fill'));
        if (preview && issues.length) return showNotice('Resolve the highlighted page issues before exporting the PDF.');
        pending = true; setDisabled(); $('save-status').textContent = preview ? 'Preparing PDF…' : 'Saving…';
        send(preview ? 'preview' : 'save', { requestId: uid(), document: payload.document, paperSize: payload.paperSize, revision: payload.revision });
    }
    $('save').addEventListener('click', () => save(false)); $('preview').addEventListener('click', () => save(true));
    $('reload').addEventListener('click', () => { if (!dirty || window.confirm('Reload the saved edition and discard unsaved changes?')) { pending = true; setDisabled(); send('reload'); } });
    $('back').addEventListener('click', () => { if (!dirty || window.confirm('Leave without saving your paper changes?')) send('back'); });
    window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
    window.addEventListener('message', event => {
        if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.channel !== 'elks-paper') return;
        if (event.data.type === 'resolved' && event.data.requestId === resolveId) {
            let changed = false;
            for (const item of event.data.blocks) {
                const block = payload.document.pages.flatMap(page => page.blocks).find(block => block.id === item.id && block.source === item.source);
                if (!block) continue;
                changed ||= block.resolvedHTML !== item.resolvedHTML;
                block.resolvedHTML = item.resolvedHTML;
                const replacement = Renderer.blockNode(block).querySelector('.paper-lodge-data');
                if (block.kind === 'widget') for (const slot of replacement.querySelectorAll('[data-paper-slot]')) { const field = slot.dataset.paperSlot; if (!block[field]) block[field] = slot.innerHTML; }
                const current = $('sheets').querySelector(`[data-block-id="${block.id}"] .paper-lodge-data`);
                // Do not disturb a cursor in a message currently being edited.
                if (current && !current.contains(document.activeElement)) current.replaceWith(replacement);
            }
            resolveId = null;
            $('data-status').textContent = 'Odoo content updated ' + new Date().toLocaleTimeString();
            if (changed) change();
            renderPages(); setDisabled(); measure();
            Promise.all([document.fonts.ready, ...[...$('sheets').querySelectorAll('img')].map(image => image.decode().catch(() => {}))]).then(() => { if (!pending) fitPages(); });
        }
        if (event.data.type === 'resolve-error' && event.data.requestId === resolveId) {
            resolveId = null; $('data-status').textContent = 'Data refresh failed'; showNotice(event.data.message);
        }
        if (['load','saved'].includes(event.data.type)) load(event.data.payload);
        if (event.data.type === 'error') { pending = false; showNotice(event.data.message); $('save-status').textContent = dirty ? 'Unsaved changes' : 'Saved'; setDisabled(); }
    });
    // Exposed only for isolated renderer/editor tests, with no server access.
    window.ElksPaperEditor = { load, measure, getPayload: () => structuredClone(payload) };
    send('ready');
})();
