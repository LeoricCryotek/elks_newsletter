/* The single page renderer used by the editor and the Chromium report. */
(function () {
    'use strict';
    const fonts = { sans: 'Arial,sans-serif', serif: "Georgia,'Times New Roman',serif", script: "'Great Vibes',cursive" };
    function element(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function richText(html, field, block) {
        const node = element('div', 'paper-richtext');
        node.innerHTML = html || '';
        node.dataset.field = field;
        node.dataset.owner = block.id;
        return node;
    }
    function flowRows(block) {
        const root=document.createElement('div');root.innerHTML=block.resolvedHTML || '';
        const container=root.querySelector(`[data-elks-block="${block.source}"]`);
        return container ? [...container.children].filter(n=>!['STYLE','SCRIPT'].includes(n.tagName)) : [];
    }
    function storyTitle(block) {
        if (block.storyTitle) return block.storyTitle.replace(/^Officer Message \((.+)\)$/, 'Officer Message $1');
        if (block.kind === 'widget' && block.source === 'message') {
            const source = document.createElement('div'); source.innerHTML = block.resolvedHTML || '';
            const title = source.querySelector('.s_elks_msg_byline')?.querySelector('i,em,span')?.textContent.trim()
                || (block.officer || 'exalted_ruler').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
            return `Officer Message ${title}`;
        }
        return '';
    }
    function blockNode(block, nextPage) {
        const node = element('section', `paper-block paper-${block.kind}`);
        node.dataset.blockId = block.id;
        node.classList.toggle('paper-fit', Boolean(block.fitFont));
        if(block.fitFont) node.style.setProperty('--paper-fit-font',`${block.fitFont}px`);
        node.classList.toggle('paper-compact', Boolean(block.compact));
        node.style.setProperty('--paper-line-height', block.lineHeight ?? 1.4);
        node.style.setProperty('--paper-paragraph-gap', `${block.paragraphGap ?? 8}px`);
        node.style.fontSize = `${block.fontSize || 16}px`;
        node.style.fontFamily = fonts[block.font || 'sans'];
        node.style.textAlign = block.align || 'left';
        node.style.padding = `${block.padding || 0}px`;
        node.style.border = block.border ? `${block.border}px solid #75559a` : '';
        node.style.borderRadius = `${block.radius || 0}px`;
        node.style.marginBottom = `${block.gap ?? 12}px`;
        if (block.kind === 'text' || block.kind === 'heading') {
            node.append(richText(block.html, 'html', block));
        } else if (block.kind === 'columns') {
            const columns = element('div', 'paper-columns');
            const ratio = block.ratio || 'equal';
            columns.style.gridTemplateColumns = block.columns.length === 1 ? '1fr' : block.columns.length === 3 ? '1fr 1fr 1fr'
                : ratio === 'wide-left' ? '2fr 1fr' : ratio === 'wide-right' ? '1fr 2fr' : '1fr 1fr';
            block.columns.forEach((html, i) => columns.append(richText(html, `columns.${i}`, block)));
            node.append(columns);
        } else if (block.kind === 'photo_text') {
            const columns = element('div', 'paper-columns');
            columns.style.gridTemplateColumns = block.ratio === 'wide-left' ? '2fr 1fr' : block.ratio === 'wide-right' ? '1fr 2fr' : '1fr 1fr';
            const photo = blockNode({ ...block, kind: 'image', gap: 0, padding: 0, border: 0, radius: 0 });
            // Only the outer block owns selection and movement.
            delete photo.dataset.blockId;
            const text = richText(block.html, 'html', block);
            if (block.layout === 'wrap') {
                columns.className = 'paper-wrap';
                photo.style.cssFloat = block.side || 'left'; photo.style.width = `${block.photoWidth || 33}%`;
                photo.style.margin = block.side === 'right' ? '0 0 12px 20px' : '0 20px 12px 0';
                columns.append(photo, text);
            } else columns.append(...(block.side === 'right' ? [text, photo] : [photo, text]));
            node.append(columns);
        } else if (block.kind === 'image') {
            if (block.src) {
                const image = element('img', 'paper-photo');
                image.src = block.src;
                image.alt = '';
                image.style.width = `${block.width || 100}%`;
                image.style.height = `${block.height || 240}px`;
                image.style.objectFit = block.fit || 'contain';
                node.append(image);
            } else {
                node.append(element('div', 'paper-missing-photo', 'Choose a photo'));
            }
            node.append(richText(block.caption, 'caption', block));
        } else if (block.kind === 'gallery') {
            const grid = element('div', 'paper-columns');
            grid.style.gridTemplateColumns = 'repeat(3,1fr)';
            block.photos.forEach((photo, i) => {
                const card = element('div', 'paper-member-card');
                if (photo.src) { const image = element('img', 'paper-photo'); image.src = photo.src; image.style.width = block.galleryMode === 'photos' ? '100%' : '88px'; image.style.height = block.galleryMode === 'photos' ? '160px' : '88px'; image.style.objectFit = 'cover'; image.style.borderRadius = block.galleryMode === 'photos' ? '0' : '50%'; card.append(image); }
                else card.append(element('div', 'paper-missing-photo', 'Choose member photo'));
                card.append(richText(photo.caption, `photos.${i}.caption`, block)); grid.append(card);
            }); node.append(grid);
        } else if (block.kind === 'spacer') {
            node.style.height = `${block.height ?? 48}px`;
        } else if (block.kind === 'dynamic' || block.kind === 'widget') {
            const data = element('div', 'paper-lodge-data');
            data.innerHTML = block.resolvedHTML || '<p>Save to fill this block with lodge data.</p>';
            if (block.flowRange) {
                const container=data.querySelector(`[data-elks-block="${block.source}"]`);
                if (container) [...container.children].filter(n=>!['STYLE','SCRIPT'].includes(n.tagName)).forEach((row,i)=>{if(i<block.flowRange[0] || i>=block.flowRange[1]) row.remove();});
            }
            if (!block.resolvedHTML) data.dataset.unresolved = 'true';
            // Calendar CSS uses the legacy snippet scope; keep it in both views.
            data.classList.add(`s_elks_${block.source}`);
            if (block.kind === 'widget') {
                for (const slot of data.querySelectorAll('[data-paper-slot]')) {
                    const field = slot.dataset.paperSlot;
                    // Company contact details stay linked to Settings, including older saved widgets.
                    if (block.source === 'mailing' && field === 'html') continue;
                    if (block[field]) slot.innerHTML = block[field];
                    slot.classList.add('paper-richtext'); slot.dataset.field = field; slot.dataset.owner = block.id;
                }
            }
            node.append(data);
        }
        for (const image of node.querySelectorAll('img')) {
            if (block.photoBorder) image.style.border = `${block.photoBorder}px solid #75559a`;
            if (block.photoRadius) image.style.borderRadius = `${block.photoRadius}px`;
            image.style.boxSizing = 'border-box';
        }
        if (block.kind === 'widget' && block.source === 'message') {
            const row = node.querySelector('.s_elks_msg_byline')?.parentElement;
            const byline = row?.querySelector('.s_elks_msg_byline');
            const story = row?.querySelector('.s_elks_story_flow');
            if (byline && story) {
                const side = block.side || 'right';
                if (block.layout !== 'wrap') {
                    row.style.display = 'flex'; row.style.flexWrap = 'nowrap';
                    byline.style.width = `${block.photoWidth || 33}%`; byline.style.flex = `0 0 ${block.photoWidth || 33}%`;
                    story.style.flex = '1'; story.style.width = 'auto'; story.style.maxWidth = 'none';
                    if (side === 'left') row.prepend(byline); else row.append(byline);
                } else {
                row.classList.add('paper-officer-wrap'); row.prepend(byline);
                byline.style.cssFloat = side; byline.style.width = `${block.photoWidth || 33}%`;
                byline.style.margin = side === 'left' ? '0 20px 12px 0' : '0 0 12px 20px';
                story.style.width = 'auto'; story.style.maxWidth = 'none'; story.style.flex = 'none';
                }
            }
        }
        if (block.continuation) node.prepend(element('h3','paper-continuation', storyTitle(block) ? `${storyTitle(block)} Continued....` : 'Continued'));
        if (nextPage || block.reserveContinuation) node.append(element('div','paper-continuation-link',`Continued on page ${nextPage || 'XX'}`));
        const body = element('div', 'paper-block-body');
        while (node.firstChild) body.append(node.firstChild);
        node.append(body); node.style.display = 'flex'; node.style.flexDirection = 'column';
        node.style.minHeight = `${block.boxHeight || 0}px`;
        node.style.justifyContent = {top:'flex-start',middle:'center',bottom:'flex-end'}[block.vertical || 'top'];
        node.style.alignSelf = {top:'flex-start',middle:'center',bottom:'flex-end'}[block.vertical || 'top'];
        return node;
    }
    function render(root, payload) {
        root.replaceChildren();
        root.classList.add('elks-paper-root', 'o_elks_newsletter');
        root.dataset.paperSize = payload.paperSize;
        const positions = payload.document.pages.flatMap((page, i) => page.blocks.map(block => ({block, page: i + 1})));
        payload.document.pages.forEach((page, i) => {
            const sheet = element('article', 'elks-paper-sheet');
            sheet.dataset.pageId = page.id;
            sheet.dataset.allowOverflow=String(!!page.allowOverflow);
            sheet.style.backgroundColor=page.background || '#ffffff';
            if(page.decoration && page.decoration!=='none' && !page.fullPage){
                const border=element('div','paper-decoration paper-decoration-'+page.decoration);
                border.setAttribute('aria-hidden','true');
                if(page.decoration==='filigree')for(const corner of ['tl','tr','bl','br'])border.append(element('span','paper-corner '+corner,'❦'));
                sheet.append(border);
            }

            if(page.fullPage)sheet.classList.add('paper-full-page');
            sheet.style.height = payload.paperSize === 'legal' ? '1344px' : '1056px';
            const content = element('div', 'paper-content');
            let row, used = 3, rowVertical;
            // Stable groups: normal flow at the top, page anchors at the bottom.
            const ordered = ['top','middle','bottom'].flatMap(vertical=>page.blocks.filter(block=>(block.vertical || 'top')===vertical));
            let firstBottom;
            ordered.forEach(block => {
                const span = Number(block.span || 3);
                const vertical=block.vertical || 'top';
                if (used + span > 3 || rowVertical !== vertical) {
                    row = element('div', 'paper-row'); content.append(row); used = 0; rowVertical=vertical;
                    if(vertical==='bottom' && !firstBottom)firstBottom=row;
                    if(vertical==='middle'){content.classList.add('paper-align-page');row.classList.add('paper-fill-remainder');}
                }
                const index = positions.findIndex(entry => entry.block === block);
                const next = block.flowGroup && positions.slice(index + 1).find(entry => entry.block.flowGroup === block.flowGroup && entry.block.continuation);
                const origin = block.continuation && block.flowGroup && positions.find(entry => entry.block.flowGroup === block.flowGroup && !entry.block.continuation);
                const displayBlock = origin && !block.storyTitle ? {...block,storyTitle:storyTitle(origin.block)} : block;
                const node = blockNode(displayBlock, next?.page);
                if(page.fullPage){node.style.marginBottom='0';node.style.padding='0';node.style.border='0';
                    const image=node.querySelector('img');if(image){image.style.width='100%';image.style.height=sheet.style.height;image.style.objectFit='contain';}
                    node.querySelectorAll('.paper-richtext').forEach(caption=>caption.remove());
                }
                node.style.width = `calc((100% - 40px) * ${span} / 3 + ${(span - 1) * 20}px)`;
                row.append(node); used += span;
                row.style.justifyContent = row.children.length === 1 ? {left:'flex-start',center:'center',right:'flex-end'}[block.horizontal || 'left'] : 'flex-start';
            });
            if (firstBottom) {
                content.classList.add('paper-align-page');
                firstBottom.classList.add('paper-bottom-anchor');
            }
            const footer = element('footer', 'paper-footer');
            footer.append(element('span', '', payload.lodge || payload.title),
                element('span', '', `Page ${i + 1} of ${payload.document.pages.length}`),
                element('span', '', payload.month || ''));
            sheet.append(content);if(!page.fullPage)sheet.append(footer);
            root.append(sheet);
        });
    }
    function problems(root) {
        return [...root.querySelectorAll('.elks-paper-sheet')].flatMap((sheet, i) => {
            const content = sheet.querySelector('.paper-content');
            const results = [];
            if (sheet.dataset.allowOverflow !== 'true' && (content.scrollHeight > content.clientHeight + 1 || content.scrollWidth > content.clientWidth + 1)) {
                results.push({ page: i + 1, id: sheet.dataset.pageId, message: 'Content extends past the page margins.' });
            }
            if (content.querySelector('.paper-missing-photo')) results.push({ page: i + 1, id: sheet.dataset.pageId, message: 'Choose a photo or remove the empty photo block.' });
            if ([...content.querySelectorAll('img')].some(image => image.complete && !image.naturalWidth)) results.push({ page: i + 1, id: sheet.dataset.pageId, message: 'A photo could not be loaded. Replace it before printing.' });
            if (content.querySelector('[data-unresolved]')) results.push({ page: i + 1, id: sheet.dataset.pageId, message: 'Save to fill the lodge data block.' });
            return results;
        });
    }
    function mountAll() {
        document.querySelectorAll('.elks-paper-mount').forEach(root => {
            const data = root.querySelector('.elks-paper-data');
            if (data) render(root, JSON.parse(data.textContent));
        });
    }
    window.ElksPaperRenderer = { render, problems, blockNode, mountAll, flowRows, storyTitle };
})();
