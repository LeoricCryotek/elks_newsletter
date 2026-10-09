// Real browser editor + shared-renderer PDF checks. Run with Playwright,
// pdf-lib and pdfjs-dist; ELKS_CHROMIUM optionally selects system Chrome.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.ELKS_TEST_OUTPUT || '/tmp/elks-paper-studio'; mkdirSync(out, { recursive: true });
const paragraph = 'Big thanks to our Antlers, who stayed and pitched in with the Lodge officers to clean up after a large event. Nobody had to ask twice. This is how the next generation learns to serve our community.';
const fixture = {
    document: { version: 1, pages: [{ id: 'page1', blocks: [
        { id: 'heading', kind: 'heading', html: '<p>Lodge News &amp; Updates</p>', fontSize: 32, font: 'sans', gap: 16 },
        { id: 'article', kind: 'text', html: `<p>${paragraph}</p>`, fontSize: 18, font: 'sans', gap: 12 },
        { id: 'columns', kind: 'columns', columns: ['<p>First column.</p>', '<p>Second column.</p>'], fontSize: 16, font: 'serif', gap: 12 },
    ] }] },
    paperSize: 'letter', title: 'Lodge Newsletter — October 2026', lodge: 'Lewiston Elks Lodge 896', month: 'October 2026', revision: 0, mode: 'paper', readonly: false,
};
const browser = await chromium.launch({ ...(process.env.ELKS_CHROMIUM ? { executablePath: process.env.ELKS_CHROMIUM } : {}), headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1550, height: 1300 } });
    page.on('pageerror', error => { throw error; });
    await page.route('https://newsletter.test/**', async route => {
        const uri = new URL(route.request().url()).pathname;
        if (uri === '/host') return route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"><iframe id="studio" style="width:100vw;height:100vh;border:0" src="/elks_newsletter/static/src/studio/editor.html"></iframe></body></html>' });
        if (!uri.startsWith('/elks_newsletter/static/')) return route.abort();
        const file = path.join(root, uri.slice('/elks_newsletter/'.length));
        const ext = path.extname(file);
        await route.fulfill({ body: readFileSync(file), contentType: { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.ttf': 'font/ttf' }[ext] });
    });
    await page.goto('https://newsletter.test/host');
    const editor = page.frames().find(frame => frame.url().endsWith('/editor.html'));
    await editor.waitForFunction(() => window.ElksPaperEditor);
    await page.evaluate(payload => {
        window.fixture = payload; window.requests = [];
        window.addEventListener('message', event => {
            if (event.source !== document.querySelector('#studio').contentWindow || event.data?.channel !== 'elks-paper') return;
            window.requests.push(event.data);
            if (event.data.type === 'resolve') {
                const blocks = event.data.document.pages.flatMap(p => p.blocks).filter(b => ['dynamic', 'widget'].includes(b.kind)).map(b => ({ id: b.id, source: b.source,
                    resolvedHTML: b.kind === 'widget' ? '<div><h2>Message from the Exalted Ruler</h2><div data-paper-slot="html"><p>Write your officer message.</p></div></div>' : '<p>Two lodge members welcomed this month.</p>' }));
                event.source.postMessage({ channel: 'elks-paper', type: 'resolved', requestId: event.data.requestId, blocks }, location.origin);
            }
            if (event.data.type === 'save' || event.data.type === 'preview') {
                window.fixture = { ...window.fixture, document: event.data.document, paperSize: event.data.paperSize, revision: window.fixture.revision + 1 };
                for (const p of window.fixture.document.pages) for (const b of p.blocks) if (b.kind === 'dynamic') b.resolvedHTML = '<p>Two lodge members welcomed this month.</p>';
                event.source.postMessage({ channel: 'elks-paper', type: 'saved', payload: window.fixture }, location.origin);
            }
        });
        document.querySelector('#studio').contentWindow.postMessage({ channel: 'elks-paper', type: 'load', payload }, location.origin);
    }, fixture);
    await editor.waitForSelector('.elks-paper-sheet');
    assert.equal(await editor.locator('#sheets .elks-paper-sheet').evaluate(node => node.getBoundingClientRect().width), 816);
    assert.equal(await editor.locator('#sheets .paper-content').evaluate(node => node.clientHeight), 960);
    await editor.locator('#paper-size').selectOption('legal');
    assert.equal(await editor.locator('#sheets .elks-paper-sheet').evaluate(node => node.getBoundingClientRect().height), 1344);
    assert.equal(await editor.locator('#sheets .paper-content').evaluate(node => node.clientHeight), 1248);
    await editor.locator('#paper-size').selectOption('letter');
    await editor.locator('#sheets [data-block-id="columns"] .paper-richtext').first().fill('Edited first column.');
    assert.ok((await editor.evaluate(() => window.ElksPaperEditor.getPayload())).document.pages[0].blocks[2].columns[0].includes('Edited first column.'));
    await editor.locator('[data-add="image"]').click();
    const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 200; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#72509f'; ctx.fillRect(0,0,300,200); ctx.fillStyle = '#e0c978'; ctx.fillRect(30,30,240,140); return canvas.toDataURL().split(',')[1]; });
    await editor.locator('#photo-file').setInputFiles({ name: 'lodge.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await editor.waitForSelector('.paper-photo');
    await editor.locator('[data-add="dynamic"]').click();
    await editor.waitForFunction(() => window.ElksPaperEditor.getPayload().document.pages[0].blocks.at(-1).resolvedHTML?.includes('Two lodge members'));
    assert.equal((await editor.evaluate(() => window.ElksPaperEditor.measure())).some(p => p.message.includes('Save to fill')), false, 'live Odoo data is rendered before saving');
    await editor.locator('#save').click();
    await editor.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved');
    assert.ok((await editor.evaluate(() => window.ElksPaperEditor.getPayload())).document.pages[0].blocks.at(-1).resolvedHTML.includes('Two lodge members'));
    await editor.locator('[data-add="text"]').click();
    const lastText = editor.locator('#sheets .paper-text .paper-richtext').last();
    await lastText.fill('Overflow content '.repeat(1400));
    assert.ok((await editor.evaluate(() => window.ElksPaperEditor.measure())).some(problem => problem.message.includes('margins')));
    const before = await page.evaluate(() => window.requests.filter(request => request.type === 'preview').length);
    await editor.locator('#preview').click();
    assert.equal(await page.evaluate(() => window.requests.filter(request => request.type === 'preview').length), before, 'overflow must block export');
    await editor.locator('#undo').click();
    // Undo the typed overflow, then remove the short extra text block.
    await editor.locator('#sheets .paper-text').last().click();
    await editor.getByRole('button', { name: 'Delete', exact: true }).click();
    assert.equal((await editor.evaluate(() => window.ElksPaperEditor.measure())).length, 0);
    assert.equal(await editor.locator('.overflow-badge:visible').count(), 0);
    await editor.locator('#add-page').click();
    await editor.locator('[data-add="text"]').click();
    await editor.locator('#sheets .paper-text .paper-richtext').last().fill('Second printed page.');
    await editor.locator('#save').click();
    await editor.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved');
    await editor.locator('#sheets .elks-paper-sheet').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'workspace.png'), fullPage: true });
    const saved = await editor.evaluate(() => window.ElksPaperEditor.getPayload());
    // Verify the shared renderer prints exactly the editing sheet's paragraph
    // line wrapping, plus fixed paper dimensions and explicit page count.
    const screenLines = await editor.locator('#sheets [data-block-id="article"] .paper-richtext').evaluate(node => {
        const text = node.firstChild.firstChild; const lines = []; let last;
        for (let i=0;i<text.length;i++) { const r=document.createRange();r.setStart(text,i);r.setEnd(text,i+1);const top=r.getBoundingClientRect().top;if(top!==last)lines.push('');lines.at(-1);lines[lines.length-1]+=text.data[i];last=top; }
        return lines.map(line=>line.trim()).filter(Boolean);
    });
    const print = await browser.newPage();
    await print.route('https://newsletter.test/**', async route => {
        const resource = new URL(route.request().url()).pathname;
        await route.fulfill({ body: readFileSync(path.join(root, resource.slice('/elks_newsletter/'.length))), contentType: 'font/ttf' });
    });
    const shared = readFileSync(path.join(root,'static/src/css/newsletter_layout.css'),'utf8');
    const paperCSS = readFileSync(path.join(root,'static/src/studio/paper.css'),'utf8');
    const renderer = readFileSync(path.join(root,'static/src/studio/renderer.js'),'utf8');
    for (const size of ['letter','legal']) {
        const inches = size === 'legal' ? 14 : 11;
        await print.setContent(`<html><head><base href="https://newsletter.test/"><style>${shared}\n${paperCSS}\n@page{size:8.5in ${inches}in;margin:0}</style></head><body><div id="print"></div><script>${renderer}</script></body></html>`);
        await print.evaluate(data => window.ElksPaperRenderer.render(document.querySelector('#print'), data), { ...saved, paperSize: size });
        await print.emulateMedia({media:'print'});
        await print.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
        assert.equal(await print.evaluate(()=>window.ElksPaperRenderer.problems(document).length),0);
        const bytes = await print.pdf({path:path.join(out,`${size}.pdf`),preferCSSPageSize:true,printBackground:true});
        const pdf = await PDFDocument.load(bytes); assert.equal(pdf.getPageCount(),2);
        for (const p of pdf.getPages()) { assert.equal(p.getWidth(),612);assert.equal(p.getHeight(),inches*72); }
        const textPDF=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
        const content=await(await textPDF.getPage(1)).getTextContent();
        const lines=content.items.map(item=>item.str.trim()).filter(text=>text&&(text.startsWith('Big thanks')||screenLines.includes(text)));
        assert.deepEqual(lines,screenLines,`${size}: PDF text must wrap exactly like the editor`);
        await textPDF.destroy();
        console.log(`${size}: physical sheets, page count, paragraph wrapping, photo/column/lodge blocks passed`);
    }
    // Continue an article at an exact cursor boundary without losing text.
    await editor.evaluate(data => window.ElksPaperEditor.load({ ...data, document: { version: 1, pages: [{ id: 'splitpage', blocks: [{ id: 'splitarticle', kind: 'text', html: '<p>First paragraph.</p><p>Second paragraph.</p>', fontSize: 18 }] }] } }), saved);
    await editor.locator('#sheets [data-block-id="splitarticle"]').click();
    await editor.evaluate(() => {
        const rich = document.querySelector('#sheets .paper-richtext');
        rich.focus(); const range = document.createRange(); range.setStart(rich.children[1].firstChild, 0); range.collapse(true);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    await editor.waitForTimeout(50);
    await editor.locator('#split-text').click();
    let split = await editor.evaluate(() => window.ElksPaperEditor.getPayload());
    assert.equal(split.document.pages.length, 2);
    assert.ok(split.document.pages[0].blocks[0].html.includes('First paragraph.'));
    assert.ok(!split.document.pages[0].blocks[0].html.includes('Second paragraph.'));
    assert.ok(split.document.pages[1].blocks[0].html.includes('Second paragraph.'));
    await editor.getByRole('button', { name: 'Next page', exact: true }).click();
    assert.equal((await editor.evaluate(() => window.ElksPaperEditor.getPayload())).document.pages.length, 3);
    await editor.locator('#delete-page').click();
    await editor.locator('#undo').click();
    split = await editor.evaluate(() => window.ElksPaperEditor.getPayload());
    assert.equal(split.document.pages.length, 3);
    assert.ok(split.document.pages[2].blocks[0].html.includes('Second paragraph.'));
    await print.evaluate(data => {
        data.document.pages[0].blocks.push({ id: 'broken', kind: 'image', src: 'data:image/png;base64,AAAA', height: 100, width: 50 });
        window.ElksPaperRenderer.render(document.querySelector('#print'), data);
    }, { ...saved, paperSize: 'legal' });
    await print.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
    assert.ok((await print.evaluate(() => window.ElksPaperRenderer.problems(document))).some(problem => problem.message.includes('could not be loaded')));
    console.log('Continuation: exact cursor split, moving blocks, page-delete undo, and broken-photo detection passed');
    // A final edition must disable editing and retain preview of its snapshot.
    await editor.evaluate(data=>window.ElksPaperEditor.load({...data,readonly:true}),saved);
    assert.equal(await editor.locator('#save').isDisabled(),true);
    assert.equal(await editor.locator('#sheets [data-block-id="article"] .paper-richtext').getAttribute('contenteditable'),'false');
    await editor.evaluate(payload => window.ElksPaperEditor.load(payload), structuredClone(fixture));
    await editor.locator('#widget-picker').selectOption('message');
    await editor.waitForSelector('#sheets [data-paper-slot="html"]');
    await editor.locator('#sheets [data-paper-slot="html"]').fill('My authored officer message.');
    await editor.locator('#refresh-data').click();
    await editor.waitForFunction(() => !document.querySelector('#data-status').textContent.includes('Loading'));
    assert.ok((await editor.evaluate(() => window.ElksPaperEditor.getPayload())).document.pages[0].blocks.at(-1).html.includes('My authored officer message'), 'refresh preserves authored widget text');
    await editor.locator('#widget-picker').selectOption('photo_grid');
    await editor.locator('#photo-file').setInputFiles({ name: 'member.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await editor.waitForSelector('.paper-gallery img');
    assert.equal(await editor.locator('#sheets .paper-gallery img').count(), 1);
    await editor.locator('#widget-picker').selectOption('photo_text');
    await editor.locator('#photo-file').setInputFiles({ name: 'story.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await editor.waitForSelector('#sheets .paper-photo_text img');
    await editor.locator('#sheets .paper-photo_text [data-field="html"]').fill('A story alongside the lodge photograph.');
    await editor.locator('#property-side').selectOption('right');
    assert.equal(await editor.locator('#sheets .paper-photo_text .paper-columns').evaluate(node => node.firstElementChild.dataset.field), 'html');
    assert.ok((await editor.evaluate(() => window.ElksPaperEditor.getPayload())).document.pages.flatMap(p=>p.blocks).find(b=>b.kind==='photo_text').html.includes('A story alongside'));
    await editor.locator('#property-layout').selectOption('wrap');
    await editor.locator('#property-padding').fill('12'); await editor.locator('#property-padding').dispatchEvent('change');
    await editor.locator('#property-border').fill('2'); await editor.locator('#property-border').dispatchEvent('change');
    await editor.locator('#property-photoBorder').fill('3'); await editor.locator('#property-photoBorder').dispatchEvent('change');
    assert.equal(await editor.locator('#sheets .paper-photo_text .paper-image').evaluate(n=>getComputedStyle(n).float), 'right');
    assert.equal(await editor.locator('#sheets .paper-photo_text').evaluate(n=>getComputedStyle(n).paddingTop), '12px');
    assert.equal(await editor.locator('#sheets .paper-photo_text img').evaluate(n=>getComputedStyle(n).borderTopWidth), '3px');
    const framed = await editor.evaluate(()=>window.ElksPaperEditor.getPayload());
    await print.evaluate(data=>window.ElksPaperRenderer.render(document.querySelector('#print'),data), framed);
    assert.equal(await print.locator('.paper-photo_text .paper-image').evaluate(n=>getComputedStyle(n).float), 'right');
    assert.equal(await print.locator('.paper-photo_text').evaluate(n=>getComputedStyle(n).borderTopWidth), '2px');
    console.log('Wrapping/framing: editor and print renderer agree on photo float, padding and borders');
    console.log('Photo + text: uploaded picture, editable story, and left/right column switching passed');
    const fitFixture = structuredClone(fixture);
    fitFixture.document.pages[0].blocks = [
        { id: 'fit1', kind: 'spacer', height: 600, gap: 0 },
        { id: 'fit2', kind: 'spacer', height: 600, gap: 0 },
    ];
    await editor.evaluate(payload => window.ElksPaperEditor.load(payload), fitFixture);
    await editor.locator('#fit-pages').click();
    assert.equal(await editor.locator('#sheets .elks-paper-sheet').count(), 2, 'auto-format moves overflowing blocks to next sheet');
    assert.equal((await editor.evaluate(() => window.ElksPaperEditor.measure())).length, 0);
    await editor.locator('#undo').click();
    assert.equal(await editor.locator('#sheets .elks-paper-sheet').count(), 1, 'auto-format is undoable');
    await editor.evaluate(payload=>window.ElksPaperEditor.load(payload), structuredClone(fixture));
    await editor.locator('#sheets [data-block-id="columns"] > .block-drag-handle').dragTo(editor.locator('#sheets [data-block-id="heading"]'));
    assert.equal((await editor.evaluate(()=>window.ElksPaperEditor.getPayload())).document.pages[0].blocks[0].id, 'columns');
    await editor.locator('#add-page').click();
    await editor.locator('#sheets [data-block-id="columns"] > .block-drag-handle').dragTo(editor.locator('#sheets .paper-content').last());
    assert.equal((await editor.evaluate(()=>window.ElksPaperEditor.getPayload())).document.pages[1].blocks[0].id, 'columns');
    await editor.locator('#browse-widgets').click();
    assert.ok(await editor.locator('#widget-cards svg').count() >= 20);
    await editor.locator('[data-widget="photo_text"]').click();
    assert.equal((await editor.evaluate(()=>window.ElksPaperEditor.getPayload())).document.pages[1].blocks.at(-1).kind, 'photo_text');
    await editor.locator('#browse-widgets').click();
    await editor.locator('[data-widget="section_bar"]').dragTo(editor.locator('#sheets [data-block-id="heading"]'), { force: true });
    assert.equal((await editor.evaluate(()=>window.ElksPaperEditor.getPayload())).document.pages[0].blocks[0].source, 'section_bar');
    console.log('Drag/gallery: same-page reorder, cross-page move and demo-card insertion passed');
    console.log('Auto-format: overflowing blocks moved to next sheet with undo recovery passed');
    console.log('Widgets: live Odoo resolution before saving, editable officer message, refresh preserving authored text, and member photo grid upload passed');
    console.log('Editor: Letter/Legal switching, column editing, photo upload, data snapshot, undo, overflow blocking, and final locking passed');
} finally { await browser.close(); }
