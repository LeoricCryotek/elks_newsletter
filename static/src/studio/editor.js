/* Standalone paper workspace. Odoo communication is confined to the host bridge. */
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const Renderer = window.ElksPaperRenderer;
    let payload, selectedId, activePage, dirty = false, pending = false;
    let lastSelection = null;
    const undo = [];
    const uid = () => crypto.randomUUID().replaceAll('-', '');
    const sources = { new_members: 'New members', in_memoriam: 'In memoriam', officers: 'Lodge officers', calendar: 'Lodge calendar', charity: 'Charity totals', leaderboard: 'Volunteer leaderboard', events: 'Events', upcoming_events: 'Upcoming events', project_dollars: 'Project dollars', delinquents: 'Dues reminder', birthdays: 'Member birthdays', anniversaries: 'Membership milestones', applications: 'Applications for membership', committees: 'Committee chairs' };
    const monthSources = ['calendar','new_members','leaderboard','birthdays','anniversaries'];
    const labels = { text: 'Text', heading: 'Heading', columns: 'Columns', image: 'Photo', dynamic: 'Lodge data', widget: 'Bulletin widget', spacer: 'Spacer', gallery: 'Member photo grid', photo_text: 'Photo and text' };
    const officers = {'exalted_ruler': 'Exalted Ruler', 'leading_knight': 'Leading Knight', 'loyal_knight': 'Loyal Knight', 'lecturing_knight': 'Lecturing Knight', 'secretary': 'Secretary', 'treasurer': 'Treasurer', 'tiler': 'Tiler', 'esquire': 'Esquire', 'chaplain': 'Chaplain', 'inner_guard': 'Inner Guard', 'organist': 'Organist', 'pianist': 'Pianist', 'sergeant_at_arms': 'Sergeant At Arms', 'presiding_justice': 'Presiding Justice', 'boardchair': 'Boardchair', 'trustee1y': 'Trustee1Y', 'trustee2y': 'Trustee2Y', 'trustee3y': 'Trustee3Y', 'trustee4y': 'Trustee4Y', 'trustee5y': 'Trustee5Y', 'assistant_secretary': 'Assistant Secretary', 'assistant_treasurer': 'Assistant Treasurer', 'house_chair': 'House Chair', 'activities_chair': 'Activities Chair', 'membership_chair': 'Membership Chair', 'lodge_advisor': 'Lodge Advisor'};
    let galleryPhoto = 0;
    let resolveId = null;
    function capturePosition() {
        const desk=document.querySelector('.paper-desk');
        const top=desk.getBoundingClientRect().top;
        const anchor=[...$('sheets').querySelectorAll('[data-block-id]')].find(node=>node.getBoundingClientRect().bottom>top);
        return {desk,top:desk.scrollTop,left:desk.scrollLeft,id:anchor?.dataset.blockId,offset:anchor?.getBoundingClientRect().top-top};
    }
    function restorePosition(position) {
        position.desk.scrollTop=position.top; position.desk.scrollLeft=position.left;
        const anchor=position.id && [...$('sheets').querySelectorAll('[data-block-id]')].find(node=>node.dataset.blockId===position.id);
        if(anchor)position.desk.scrollTop+=anchor.getBoundingClientRect().top-position.desk.getBoundingClientRect().top-position.offset;
    }
    async function runFlow(compact=false) {
        if (!editable() || $('sheets').contains(document.activeElement)) return;
        pending=true; setDisabled();
        await Promise.all([document.fonts.ready,...[...$('sheets').querySelectorAll('img')].map(image=>image.decode().catch(()=>{}))]);
        pending=false; const position=capturePosition(); remember();
        const before=structuredClone(payload.document);
        const shape=doc=>JSON.stringify(doc.pages.map(page=>page.blocks.map(block=>Object.fromEntries(Object.entries(block).filter(([key])=>key!=='id').sort(([a],[b])=>a.localeCompare(b))))));
        try {
            const result=window.ElksPaperPagination.paginate(payload,$('sheets'),{compact});
            if(shape(before)===shape(payload.document)){payload.document=before;undo.pop();render();return;}
            activePage=(payload.document.pages.find(page=>page.blocks.some(block=>block.id===selectedId)) || payload.document.pages.find(page=>page.id===activePage) || payload.document.pages[0]).id; change(); render();
            showNotice(`${result.pages} page(s), ${result.continuations} continuation(s). Undo restores the previous layout.`);
        } catch (error) { undo.pop(); render(); showNotice(error.message); } finally { restorePosition(position); }
    }
    function fitSelected() {
        if(!editable())return;
        const {page,block}=selected();if(!block)return;
        remember();
        Object.assign(block,{compact:true,boxHeight:0,gap:2,padding:Math.min(block.padding || 0,2),lineHeight:1.15,paragraphGap:2});
        for(let font=Math.min(block.fontSize || 16,24);font>=12;font--) {
            block.fitFont=font;render();
            const sheet=$('sheets').querySelector(`[data-page-id="${page.id}"]`);
            const content=sheet.querySelector('.paper-content');
            if(content.scrollHeight<=content.clientHeight+1 && content.scrollWidth<=content.clientWidth+1)break;
        }
        change();render();
        showNotice(`Selected widget fitted at ${block.fitFont}px. If it still overflows, use Flow pages for continuation. Undo restores its previous settings.`);
    }
    function fitPages() { return runFlow(false); }
    function compactPages() { return runFlow(true); }
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
        $('auto-flow').checked = payload.document.flowMode === 'auto';
        $('save-status').textContent = payload.readonly ? 'Final edition' : 'Saved';
        showNotice(payload.readonly ? (payload.mode === 'legacy' ? 'This issue is a final edition in the original editor. Reset it to Draft to create a separate paper layout.' : 'This is a final edition. Reset it to Draft in Odoo to edit its pages.')
            : payload.mode === 'legacy' ? 'This is a separate paper layout. Your existing newsletter stays available in the original editor. Saving here selects Paper Studio for the PDF.' : '');
        render();
        send('dirty', { dirty: false });
        refreshData();
    }
    function setDisabled() {
        const disabled = !editable();
        document.querySelectorAll('[data-add],#save,#add-page,#paper-size,#lock-page,#page-up,#page-down,#delete-page,[data-format],#split-text,#undo,#widget-picker,#refresh-data,#fit-pages,#auto-flow,#compact-pages,#browse-widgets').forEach(node => node.disabled = disabled);
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
            const sheet=$('sheets').querySelector(`[data-page-id="${thumb.dataset.pageId}"]`);
            const content=sheet?.querySelector('.paper-content');
            if (content) {
                const used=content.classList.contains('paper-align-page')
                    ? [...content.children].reduce((sum,row)=>sum+Math.max(0,...[...row.children].map(block=>block.getBoundingClientRect().height+parseFloat(getComputedStyle(block).marginBottom || 0))),0)
                    : content.lastElementChild ? content.lastElementChild.getBoundingClientRect().bottom-content.getBoundingClientRect().top : 0;
                let usage=thumb.querySelector('.page-usage');
                if(!usage){usage=document.createElement('span');usage.className='page-usage';thumb.append(usage);}
                usage.textContent=`${Math.round(100*used/content.clientHeight)}% used · ${Math.max(0,Math.round(content.clientHeight-used))}px free`;
            }
        });
        return issues;
    }
    function render() {
        const position=capturePosition();
        const sidebar=document.querySelector('.properties-sidebar'), sidebarTop=sidebar.scrollTop;
        Renderer.render($('sheets'), payload);
        $('sheets').querySelectorAll('.paper-richtext').forEach(node => {
            node.contentEditable = String(editable() && !payload.document.pages.find(page=>page.blocks.some(block=>block.id===node.dataset.owner))?.locked);
            node.spellcheck = true;
        });
        attachHandles(); renderPages(); highlight(); renderProperties(); setDisabled();
        restorePosition(position); sidebar.scrollTop=sidebarTop;
        requestAnimationFrame(measure);
        document.fonts.ready.then(measure);
    }
    let dragging = null;
    function beginPointerDrag(event, move) {
        if (!editable() || event.button !== 0) return;
        event.preventDefault();
        const x = event.clientX, y = event.clientY; let started = false;
        const motion = event => {
            if (!started && Math.hypot(event.clientX - x, event.clientY - y) < 5) return;
            started = true; dragging = move;
            if ($('widget-gallery').open) $('widget-gallery').close();
            document.querySelectorAll('.drop-before').forEach(n=>n.classList.remove('drop-before'));
            document.elementFromPoint(event.clientX,event.clientY)?.closest('#sheets [data-block-id]')?.classList.add('drop-before');
        };
        const release = event => {
            document.removeEventListener('pointermove',motion); document.removeEventListener('pointerup',release);
            if (started) {
                const target = document.elementFromPoint(event.clientX,event.clientY);
                if (target?.closest('#sheets .elks-paper-sheet')) target.dispatchEvent(new Event('drop',{bubbles:true,cancelable:true}));
            }
            dragging = null; document.querySelectorAll('.drop-before').forEach(n=>n.classList.remove('drop-before'));
        };
        document.addEventListener('pointermove',motion); document.addEventListener('pointerup',release,{once:true});
    }
    function attachHandles() {
        $('sheets').querySelectorAll('[data-block-id]').forEach(node => {
            if(payload.document.pages.some(page=>page.locked && page.blocks.some(block=>block.id===node.dataset.blockId)))return;
            const handle = document.createElement('span'); handle.tabIndex = 0; handle.className = 'block-drag-handle';
            handle.textContent = '⠿ Drag'; handle.title = 'Drag to reorder or move to another page';
            handle.draggable = false;
            handle.addEventListener('pointerdown',event=>beginPointerDrag(event,{blockId:node.dataset.blockId})); handle.contentEditable = 'false'; handle.disabled = !editable();
            handle.addEventListener('dragstart', event => {
                if (!editable()) return event.preventDefault();
                dragging = { blockId: node.dataset.blockId }; event.dataTransfer.setData('text/plain', 'newsletter-block'); event.dataTransfer.effectAllowed = 'move';
            });
            handle.addEventListener('dragend', () => { dragging = null; document.querySelectorAll('.drop-before').forEach(n => n.classList.remove('drop-before')); });
            node.prepend(handle);
        });
    }
    $('sheets').addEventListener('dragover', event => {
        if (!editable() || !dragging) return;
        event.preventDefault();
        document.querySelectorAll('.drop-before').forEach(n => n.classList.remove('drop-before'));
        event.target.closest('[data-block-id]')?.classList.add('drop-before');
    });
    $('sheets').addEventListener('drop', event => {
        if (!editable() || !dragging) return;
        event.preventDefault();
        const sheet = event.target.closest('.elks-paper-sheet'); if (!sheet) return;
        const targetId = event.target.closest('[data-block-id]')?.dataset.blockId;
        const targetPage = payload.document.pages.find(p => p.id === sheet.dataset.pageId);
        if(targetPage.locked){dragging=null;return showNotice('Unlock the destination page before moving widgets into it.');}
        const move = dragging; dragging = null;
        if (move.widget) {
            activePage = targetPage.id; insertWidget(move.widget);
            const added = targetPage.blocks.pop(); const index = targetPage.blocks.findIndex(b => b.id === targetId);
            targetPage.blocks.splice(index < 0 ? targetPage.blocks.length : index, 0, added); render(); return;
        }
        if (targetId === move.blockId) return;
        const from = payload.document.pages.find(p => p.blocks.some(b => b.id === move.blockId));
        if (!from) return;
        remember(); const index = from.blocks.findIndex(b => b.id === move.blockId); const [block] = from.blocks.splice(index, 1);
        const dest = targetPage.blocks.findIndex(b => b.id === targetId);
        targetPage.blocks.splice(dest < 0 ? targetPage.blocks.length : dest, 0, block);
        activePage = targetPage.id; selectedId = block.id; change(); render();
    });
    function highlight() {
        $('lock-page').textContent=payload.document.pages.find(page=>page.id===activePage)?.locked ? 'Unlock page' : 'Lock page';
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
            const title = document.createElement('span'); title.textContent = `Page ${index + 1}${page.locked ? ' · Locked' : ''}`;
            button.draggable=editable();button.title='Drag to reorder this page';
            button.addEventListener('dragstart',event=>{dragging={pageId:page.id};event.dataTransfer.setData('text/plain',page.id);});
            button.addEventListener('dragover',event=>{if(dragging?.pageId){event.preventDefault();button.classList.add('drop-before');}});
            button.addEventListener('dragleave',()=>button.classList.remove('drop-before'));
            button.addEventListener('drop',event=>{
                if(!editable() || !dragging?.pageId)return;
                event.preventDefault();const id=dragging.pageId;dragging=null;
                if(id===page.id)return;
                remember();const from=payload.document.pages.findIndex(item=>item.id===id);
                const [moved]=payload.document.pages.splice(from,1);
                const target=payload.document.pages.findIndex(item=>item.id===page.id);
                payload.document.pages.splice(target,0,moved);activePage=id;change();render();
            });
            button.addEventListener('dragend',()=>{dragging=null;document.querySelectorAll('.drop-before').forEach(node=>node.classList.remove('drop-before'));});
            const badge = document.createElement('span'); badge.className = 'overflow-badge'; badge.textContent = 'Needs attention'; badge.hidden = true;
            button.append(paper, title, badge);
            button.addEventListener('click', () => {
                activePage = page.id; selectedId = null; highlight(); renderProperties();
                $('sheets').querySelector(`[data-page-id="${page.id}"]`).scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            $('page-list').append(button);
            const scale = (paper.clientWidth) / 816;
            miniature.style.transform = `scale(${scale})`;
            paper.style.height = `${(payload.paperSize === 'legal' ? 1344 : 1056) * scale + 2}px`;
        });
    }
    function field(title, key, options) {
        const wrap = document.createElement('div'); wrap.className = 'property-field';
        const label = document.createElement('label'); label.textContent = title; label.htmlFor = `property-${key}`;
        const input = document.createElement(options ? 'select' : 'input'); input.id = `property-${key}`;
        if (options) Object.entries(options).forEach(([value, text]) => {
            const option = document.createElement('option'); option.value = value; option.textContent = text; input.append(option);
        });
        else if (key === 'month') {
            input.type = 'month';
            const month=payload.defaultMonth || '';
            const parts=month.split('-').map(Number);
            const display=month ? new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(parts[0],parts[1]-1,1))) : payload.month;
            input.title=`Enter YYYY-MM (for example, 2026-11). Leave blank to use ${selected().block.source === 'new_members' ? 'the issue’s New Members Source setting' : display || 'the issue month'}.`;
            if(month) input.placeholder=month;
            label.title=input.title;
        }
        else { input.type = 'number'; if (key === 'lineHeight') input.step = '0.05'; input.min = key === 'fontSize' ? '8' : '0'; input.max = key === 'fontSize' ? '72' : ['height','boxHeight'].includes(key) ? '900' : '100'; }
        if (key === 'lineHeight') { input.min = '1'; input.max = '2.4'; }
        if (key === 'paragraphGap') input.max = '32';
        input.value = selected().block[key] ?? ({ side: selected().block.source === 'message' ? 'right' : 'left', gap: 12, fontSize: 16, font: 'sans', align: 'left', ratio: 'equal', source: 'new_members', width: 100, height: 240, fit: 'contain', layout: 'columns', photoWidth: 33, padding: 0, border: 0, radius: 0, photoBorder: 0, photoRadius: 0, lineHeight: 1.4, paragraphGap: 8, month: '', keepTogether: false, span: 3, horizontal: 'left', vertical: 'top', boxHeight: 0 }[key]);
        input.addEventListener('change', () => {
            if (!editable()) return;
            remember(); selected().block[key] = key === 'keepTogether' ? input.value === 'true' : options || key === 'month' ? input.value : Number(input.value);
            if(key==='fontSize')delete selected().block.fitFont;
            if (['source','officer','month'].includes(key)) { delete selected().block.resolvedHTML; refreshData(); }
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
        const { block, page } = selected();
        if(page?.locked){const text=document.createElement('p');text.textContent='Page locked. Unlock it to edit widgets or refresh their data.';panel.append(text);return;}
        if (!block) {
            const text = document.createElement('p'); text.className = 'muted'; text.textContent = 'Select a block on the page to change its appearance or position.'; panel.append(text); return;
        }
        const title = document.createElement('h2'); title.textContent = labels[block.kind]; panel.append(title);
        panel.append(field('Widget width (columns out of 3)', 'span', {1:'1 column · one third',2:'2 columns · two thirds',3:'3 columns · full width'}),
                     field('Widget position', 'horizontal', {left:'Left',center:'Center',right:'Right'}),
                     field('Vertical alignment', 'vertical', {top:'Top',middle:'Middle',bottom:'Bottom'}), field('Minimum frame height (px)', 'boxHeight'));
        if (['dynamic','widget'].includes(block.kind) && monthSources.includes(block.source)) {
            panel.append(field(block.source === 'calendar' ? `Calendar month (blank = ${payload.defaultMonth || payload.month || 'issue month'})` : 'Month shown (blank = issue settings)', 'month'));
        }
        if (block.kind === 'dynamic' && ['new_members','in_memoriam'].includes(block.source)) {
            panel.append(actionButton('Choose members…',()=>send('manage-members',{source:block.source,month:block.month || ''})));
            const note = document.createElement('p'); note.className = 'muted'; note.textContent = block.source === 'new_members' ? 'Automatic list uses initiation dates. A curated selection overrides month filtering.' : 'Automatic list uses deaths in the month before the issue, including archived members. Choose members to override it.'; panel.append(note);
        }
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
        if (block.kind === 'widget' && block.source === 'message') panel.append(field('Photo position', 'side', {left:'Left',right:'Right'}));
        if (block.kind === 'photo_text' || (block.kind === 'widget' && block.source === 'message')) panel.append(field('Text around photo', 'layout', { columns: 'Separate columns', wrap: 'Wrap around photo' }), field('Photo area width (%)', 'photoWidth'));
        if (['text','photo_text','dynamic','widget'].includes(block.kind)) panel.append(field('Page flow', 'keepTogether', {false:'Allow continuation',true:'Keep whole widget together'}));
        panel.append(field('Inside padding (px)', 'padding'), field('Block border (px; 0 = none)', 'border'), field('Block corners (px)', 'radius'), field('Picture border (px)', 'photoBorder'), field('Picture corners (px)', 'photoRadius'));
        if (['text','photo_text','dynamic'].includes(block.kind) && block.source !== 'calendar' || block.kind==='widget' && block.source==='message') panel.append(actionButton('Fit selected widget',fitSelected));
        panel.append(field('Line height (1 = tight)', 'lineHeight'),field('Paragraph spacing (px)', 'paragraphGap'));
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
        if (index === payload.document.pages.length - 1 || payload.document.pages[index+1].locked)
            payload.document.pages.splice(index+1,0,{id:uid(),blocks:[]});
        return payload.document.pages[index + 1];
    }
    function nextPage() {
        const { page, block } = selected(); remember();
        const next = followingPage(page); page.blocks = page.blocks.filter(item => item !== block); next.blocks.unshift(block);
        activePage = next.id; change(); render();
        $('sheets').querySelector(`[data-page-id="${next.id}"]`).scrollIntoView({ block: 'start' });
    }
    function duplicate() {
        const { page, block } = selected(); remember(); const copy = structuredClone(block); copy.id = uid(); delete copy.flowGroup; copy.continuation = false;
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
        if (preset === 'elk_of_month') { block.html = '<h2>Elk of the Month</h2><p>Tell members why this Elk was chosen and what they do for the lodge and community.</p>'; block.caption = '<p><b>Member name</b></p>'; }
        let target=payload.document.pages.find(page=>page.id===activePage);
        if(target.locked){target={id:uid(),blocks:[]};payload.document.pages.push(target);activePage=target.id;}
        target.blocks.push(block); selectedId = block.id; change(); render(); refreshData();
    }
    const picker = $('widget-picker');
    const widgets = { masthead: 'Lodge masthead', message: 'Officer message', section_bar: 'Section bar', mailing: 'Mailing panel', ...sources,
        eleven_oclock: "Eleven O'Clock Toast", mission: 'Elks mission', enf: 'Elks National Foundation', veterans: 'Veterans service', youth: 'Youth programs', sick_distressed: 'Sickness & distress', lodge_info: 'Lodge meetings & hours', elk_of_month: 'Elk of the Month',
        photo_text: 'Photo + text (two columns)', photo_grid: 'Member photo grid', two_thirds: 'Two-thirds + one-third', three_columns: 'Three columns', continued: 'Continued on page', spacer: 'Spacer', page_break: 'Page break' };
    for (const [key, title] of Object.entries(widgets)) { const option = document.createElement('option'); option.value = key; option.textContent = title; picker.append(option); }
    function insertWidget(source) {
        if (!source || !editable()) return;
        if (source === 'page_break') return $('add-page').click();
        const kind = sources[source] ? 'dynamic' : ['two_thirds', 'three_columns'].includes(source) ? 'columns'
            : ['photo_text','elk_of_month'].includes(source) ? 'photo_text' : source === 'photo_grid' ? 'gallery' : source === 'continued' ? 'text' : source === 'spacer' ? 'spacer' : 'widget';
        add(kind, source, source);
    }
    picker.addEventListener('change', () => { const source = picker.value; picker.value = ''; insertWidget(source); });
    function demo(source) {
        const photo = '<rect x="120" y="38" width="55" height="65" rx="4" fill="#d8cee5"/><circle cx="147" cy="57" r="10" fill="#927ba8"/><path d="M131 93v-10q16-24 32 0v10" fill="#927ba8"/>';
        const lines = '<path d="M14 48h90M14 60h90M14 72h90M14 84h90M14 96h70" stroke="#a7a0b2" stroke-width="5"/>';
        let body = '<rect x="10" y="13" width="170" height="17" rx="3" fill="#725198"/>' + lines;
        if (['message','photo_text','masthead','elk_of_month'].includes(source)) body += photo;
        if (source === 'calendar') body = '<rect x="10" y="13" width="170" height="17" fill="#725198"/><path d="M10 38h170M10 62h170M10 86h170M10 110h170M10 38v72M44 38v72M78 38v72M112 38v72M146 38v72M180 38v72" stroke="#a7a0b2" fill="none"/>';
        if (['photo_grid','officers','new_members','in_memoriam','birthdays','anniversaries','applications','committees'].includes(source)) body = '<rect x="10" y="13" width="170" height="17" fill="#725198"/>' + [35,95,155].map(x => `<circle cx="${x}" cy="64" r="17" fill="#d8cee5"/><path d="M${x-20} 93h40M${x-20} 105h40" stroke="#a7a0b2" stroke-width="4"/>`).join('');
        if (['three_columns','two_thirds'].includes(source)) body = '<path d="M10 20h170" stroke="#725198" stroke-width="14"/>' + [15,75,135].map(x=>`<path d="M${x} 45h40M${x} 58h40M${x} 71h40M${x} 84h40M${x} 97h40" stroke="#a7a0b2" stroke-width="5"/>`).join('');
        return `<svg viewBox="0 0 190 125" aria-hidden="true"><rect width="190" height="125" fill="white"/>${body}</svg>`;
    }
    for (const [source, title] of Object.entries(widgets)) {
        const card = document.createElement('button'); card.className = 'widget-card'; card.dataset.widget = source; card.draggable = false; card.addEventListener('pointerdown',event=>beginPointerDrag(event,{widget:source}));
        card.innerHTML = demo(source); const label = document.createElement('span'); label.textContent = title; card.append(label);
        card.addEventListener('click', () => { $('widget-gallery').close(); insertWidget(source); });
        card.addEventListener('dragstart', event => { if (!editable()) return event.preventDefault(); dragging = { widget: source }; event.dataTransfer.setData('text/plain', 'newsletter-widget'); $('widget-gallery').close(); });
        card.addEventListener('dragend', () => dragging = null);
        $('widget-cards').append(card);
    }
    $('browse-widgets').addEventListener('click', () => $('widget-gallery').showModal());
    $('close-gallery').addEventListener('click', () => $('widget-gallery').close());
    $('refresh-data').addEventListener('click', refreshData);
    $('fit-pages').addEventListener('click', fitPages);
    $('auto-flow').addEventListener('change',()=>{if(!editable())return;remember();payload.document.flowMode=$('auto-flow').checked?'auto':'manual';change();if($('auto-flow').checked)fitPages();});
    $('compact-pages').addEventListener('click', compactPages);
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
    $('sheets').addEventListener('focusout',()=>setTimeout(()=>{if(payload?.document.flowMode==='auto' && !$('sheets').contains(document.activeElement)) fitPages();},0));
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
        if (!editable() || !block || !['text','photo_text','widget'].includes(block.kind) || (block.kind === 'widget' && block.source !== 'message') || !lastSelection) return showNotice('Place the cursor in a text block where the next page should begin.');
        const rich = $('sheets').querySelector(`[data-block-id="${block.id}"] .paper-richtext[data-field="html"]`);
        if (!rich.contains(lastSelection.startContainer)) return showNotice('Place the cursor in the selected text block first.');
        const before = document.createRange(); before.selectNodeContents(rich); before.setEnd(lastSelection.startContainer, lastSelection.startOffset);
        const after = document.createRange(); after.selectNodeContents(rich); after.setStart(lastSelection.startContainer, lastSelection.startOffset);
        const left = document.createElement('div'), right = document.createElement('div'); left.append(before.cloneContents()); right.append(after.cloneContents());
        if (!left.textContent.trim() || !right.textContent.trim()) return showNotice('Choose a position inside the text, with content on both sides.');
        remember(); block.html = left.innerHTML; block.flowGroup ||= block.id;
        const continuation = { ...block, kind:'text', id: uid(), html: right.innerHTML, continuation:true, storyTitle:window.ElksPaperRenderer.storyTitle(block), boxHeight:0 };
        for (const key of ['source','officer','resolvedHTML','src','caption','html2']) delete continuation[key];
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
    $('paper-size').addEventListener('change', () => { if (editable()) { remember(); payload.paperSize = $('paper-size').value; change(); render(); if(payload.document.flowMode==='auto')fitPages(); } });
    $('add-page').addEventListener('click', () => { if (editable()) { remember(); const page = { id: uid(), blocks: [] }; payload.document.pages.push(page); activePage = page.id; selectedId = null; change(); render(); $('sheets').lastElementChild.scrollIntoView({ block: 'start' }); } });
    function movePage(direction) {
        if (!editable()) return; const index = payload.document.pages.findIndex(page => page.id === activePage); const other = index + direction;
        if (other < 0 || other >= payload.document.pages.length) return;
        remember(); [payload.document.pages[index], payload.document.pages[other]] = [payload.document.pages[other], payload.document.pages[index]]; change(); render();
    }
    $('lock-page').addEventListener('click',()=>{
        if(!editable())return;remember();const page=payload.document.pages.find(page=>page.id===activePage);
        page.locked=!page.locked;change();render();
    });
    $('page-up').addEventListener('click', () => movePage(-1)); $('page-down').addEventListener('click', () => movePage(1));
    $('delete-page').addEventListener('click', () => {
        if (!editable()) return;
        if(payload.document.pages.find(page=>page.id===activePage)?.locked)return showNotice('Unlock this page before deleting it.');
        if (payload.document.pages.length === 1) return showNotice('Keep at least one page in the newsletter.');
        remember(); payload.document.pages = payload.document.pages.filter(page => page.id !== activePage); activePage = payload.document.pages[0].id; selectedId = null; change(); render();
    });
    $('undo').addEventListener('click', () => { if (editable() && undo.length) { const previous = undo.pop(); payload.document = previous.document; payload.paperSize = previous.paperSize; activePage = payload.document.pages[0].id; selectedId = null; $('paper-size').value = payload.paperSize; change(); render(); } });
    async function save(preview) {
        if (!payload || pending) return;
        if (payload.document.flowMode === 'auto' && !payload.readonly) await runFlow();
        if(pending)return;
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
                if (!block || payload.document.pages.some(page=>page.locked && page.blocks.includes(block))) continue;
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
            Promise.all([document.fonts.ready, ...[...$('sheets').querySelectorAll('img')].map(image => image.decode().catch(() => {}))]).then(() => { if (!pending && payload.document.flowMode === 'auto') fitPages(); });
        }
        if (event.data.type === 'resolve-error' && event.data.requestId === resolveId) {
            resolveId = null; $('data-status').textContent = 'Data refresh failed'; showNotice(event.data.message);
        }
        if (event.data.type === 'refresh-data') refreshData();
        if (['load','saved'].includes(event.data.type)) load(event.data.payload);
        if (event.data.type === 'error') { pending = false; showNotice(event.data.message); $('save-status').textContent = dirty ? 'Unsaved changes' : 'Saved'; setDisabled(); }
    });
    // Exposed only for isolated renderer/editor tests, with no server access.
    window.ElksPaperEditor = { load, measure, getPayload: () => structuredClone(payload) };
    send('ready');
})();
