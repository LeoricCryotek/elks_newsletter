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
    function blockNode(block) {
        const node = element('section', `paper-block paper-${block.kind}`);
        node.dataset.blockId = block.id;
        node.style.fontSize = `${block.fontSize || 16}px`;
        node.style.fontFamily = fonts[block.font || 'sans'];
        node.style.textAlign = block.align || 'left';
        node.style.marginBottom = `${block.gap ?? 12}px`;
        if (block.kind === 'text' || block.kind === 'heading') {
            node.append(richText(block.html, 'html', block));
        } else if (block.kind === 'columns') {
            const columns = element('div', 'paper-columns');
            const ratio = block.ratio || 'equal';
            columns.style.gridTemplateColumns = block.columns.length === 3 ? '1fr 1fr 1fr'
                : ratio === 'wide-left' ? '2fr 1fr' : ratio === 'wide-right' ? '1fr 2fr' : '1fr 1fr';
            block.columns.forEach((html, i) => columns.append(richText(html, `columns.${i}`, block)));
            node.append(columns);
        } else if (block.kind === 'photo_text') {
            const columns = element('div', 'paper-columns');
            columns.style.gridTemplateColumns = block.ratio === 'wide-left' ? '2fr 1fr' : block.ratio === 'wide-right' ? '1fr 2fr' : '1fr 1fr';
            const photo = blockNode({ ...block, kind: 'image', gap: 0 });
            // Only the outer block owns selection and movement.
            delete photo.dataset.blockId;
            const text = richText(block.html, 'html', block);
            columns.append(...(block.side === 'right' ? [text, photo] : [photo, text])); node.append(columns);
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
                if (photo.src) { const image = element('img', 'paper-photo'); image.src = photo.src; image.style.width = '88px'; image.style.height = '88px'; image.style.objectFit = 'cover'; image.style.borderRadius = '50%'; card.append(image); }
                else card.append(element('div', 'paper-missing-photo', 'Choose member photo'));
                card.append(richText(photo.caption, `photos.${i}.caption`, block)); grid.append(card);
            }); node.append(grid);
        } else if (block.kind === 'spacer') {
            node.style.height = `${block.height ?? 48}px`;
        } else if (block.kind === 'dynamic' || block.kind === 'widget') {
            const data = element('div', 'paper-lodge-data');
            data.innerHTML = block.resolvedHTML || '<p>Save to fill this block with lodge data.</p>';
            if (!block.resolvedHTML) data.dataset.unresolved = 'true';
            // Calendar CSS uses the legacy snippet scope; keep it in both views.
            data.classList.add(`s_elks_${block.source}`);
            if (block.kind === 'widget') {
                for (const slot of data.querySelectorAll('[data-paper-slot]')) {
                    const field = slot.dataset.paperSlot;
                    if (block[field]) slot.innerHTML = block[field];
                    slot.classList.add('paper-richtext'); slot.dataset.field = field; slot.dataset.owner = block.id;
                }
            }
            node.append(data);
        }
        return node;
    }
    function render(root, payload) {
        root.replaceChildren();
        root.classList.add('elks-paper-root', 'o_elks_newsletter');
        root.dataset.paperSize = payload.paperSize;
        payload.document.pages.forEach((page, i) => {
            const sheet = element('article', 'elks-paper-sheet');
            sheet.dataset.pageId = page.id;
            sheet.style.height = payload.paperSize === 'legal' ? '1344px' : '1056px';
            const content = element('div', 'paper-content');
            page.blocks.forEach(block => content.append(blockNode(block)));
            const footer = element('footer', 'paper-footer');
            footer.append(element('span', '', payload.lodge || payload.title),
                element('span', '', `Page ${i + 1} of ${payload.document.pages.length}`),
                element('span', '', payload.month || ''));
            sheet.append(content, footer);
            root.append(sheet);
        });
    }
    function problems(root) {
        return [...root.querySelectorAll('.elks-paper-sheet')].flatMap((sheet, i) => {
            const content = sheet.querySelector('.paper-content');
            const results = [];
            if (content.scrollHeight > content.clientHeight + 1 || content.scrollWidth > content.clientWidth + 1) {
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
    window.ElksPaperRenderer = { render, problems, blockNode, mountAll };
})();
