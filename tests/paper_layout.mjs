// Run with Node and playwright + pdf-lib installed. Set ELKS_CHROMIUM to a
// system Chrome executable, or install Playwright's Chromium. No Odoo required.
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
const output = process.env.ELKS_TEST_OUTPUT || '/tmp/elks-paper-layout';
mkdirSync(output, { recursive: true });
const layout = readFileSync(path.join(root, 'static/src/css/newsletter_layout.css'), 'utf8');
const canvas = readFileSync(path.join(root, 'static/src/scss/newsletter_paper_canvas.scss'), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');
const masthead = readFileSync(path.join(root, 'static/src/scss/elks_masthead_font.scss'), 'utf8');
const pluginSource = readFileSync(path.join(root, 'static/src/js/elks_builder_options.js'), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const browser = await chromium.launch({
    ...(process.env.ELKS_CHROMIUM ? { executablePath: process.env.ELKS_CHROMIUM } : {}),
    headless: true,
});
try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 1500 } });
    // Serve bundled resources locally without HTTP, an Odoo session, or internet.
    await page.route('https://newsletter.test/**', async route => {
        const resource = new URL(route.request().url()).pathname;
        if (!resource.startsWith('/elksbulletin/static/')) return route.abort();
        const file = path.join(root, resource.slice('/elksbulletin/'.length));
        await route.fulfill({ body: readFileSync(file), contentType: file.endsWith('.ttf') ? 'font/ttf' : 'text/css' });
    });
    const paragraph = `Big thanks to our Antlers, who stayed and pitched in with the Lodge officers to clean up after a large event. Nobody had to ask twice. That's how volunteerism takes hold — you teach the next generation what it means by giving them the chance to do it.`;
    for (const size of ['letter', 'legal']) {
        const inches = size === 'legal' ? 14 : 11;
        await page.setContent(`<html><head><base href="https://newsletter.test/"><style>${layout}\n${masthead}\n${canvas}</style></head><body>
            <main id="editable"><div class="o_layout o_elksbulletin">
            <section class="o_mail_snippet_general pt16 pb16">
            <h1 style="font:900 34px/1 Arial;margin-bottom:10px">Lodge News &amp; Updates</h1>
            <div class="row align-items-center"><div class="col-12 col-lg-5"><div style="background:#5b3b8c;color:white;height:220px;padding:16px">Photo column</div></div>
            <div class="col-12 col-lg-7"><p id="copy" style="font:18px/1.5 Arial">${paragraph}</p><p id="copy2" style="font:18px/1.5 Arial">Our Antlers program is open to young people ages 12 through 20.</p></div></div></section>
            <section class="s_elks_page_break o_mail_snippet_general"><div class="s_elks_page_break_line">PAGE BREAK</div></section>
            <section class="o_mail_snippet_general"><h2>Second page</h2><p style="font-size:24px">This authored size must survive printing.</p></section>
            </div></main></body></html>`, { waitUntil: 'load' });
        await page.evaluate(async () => document.fonts.ready);
        await page.evaluate(({ source, size }) => {
            window.record = { data: { page_size: size } };
            window.registry = { category: () => ({ add() { return this; } }) };
            window.BaseOptionComponent = class {};
            window.Plugin = class {
                constructor(context) { Object.assign(this, context); this._cleanups = []; }
                addDomListener(target, event, cb, capture) {
                    target.addEventListener(event, cb, capture);
                    this._cleanups.push(() => target.removeEventListener(event, cb, capture));
                }
                destroy() { this.isDestroyed = true; this._cleanups.forEach(fn => fn()); }
            };
            const Factory = new Function(source + '\nreturn ElksPageBreakPreviewPlugin;');
            const Preview = Factory();
            const preview = new Preview({ document, window, editable: document.querySelector('#editable'), config: { getRecordInfo: () => window.record } });
            let runs = 0;
            const recompute = preview._recompute.bind(preview);
            preview._recompute = () => { runs++; recompute(); };
            preview.setup();
            window.preview = preview;
            window.getRuns = () => runs;
        }, { source: pluginSource, size });
        await page.waitForTimeout(700);
        const initial = await page.evaluate(() => window.getRuns());
        await page.waitForTimeout(500);
        assert.equal(await page.evaluate(() => window.getRuns()), initial, 'page guides must become idle');
        const screen = await page.evaluate(() => {
            const sheet = document.querySelector('.o_elksbulletin');
            const copy = document.querySelector('#copy');
            const second = document.querySelector('h2');
            const style = getComputedStyle(sheet);
            const text = copy.firstChild;
            const lines = [];
            let previousTop = null;
            for (let i = 0; i < text.length; i++) {
                const range = document.createRange();
                range.setStart(text, i); range.setEnd(text, i + 1);
                const top = range.getBoundingClientRect().top;
                if (top !== previousTop) lines.push('');
                lines[lines.length - 1] += text.data[i];
                previousTop = top;
            }
            return {
                width: sheet.getBoundingClientRect().width,
                minimum: parseFloat(style.minHeight),
                fontSize: getComputedStyle(copy).fontSize,
                headingSize: getComputedStyle(document.querySelector('h1')).fontSize,
                copyWidth: copy.getBoundingClientRect().width,
                secondTop: second.getBoundingClientRect().top - sheet.getBoundingClientRect().top - parseFloat(style.paddingTop),
                sheetHTML: sheet.outerHTML,
                lines: lines.map(line => line.trim()).filter(Boolean),
                secondLines: (() => {
                    const text = document.querySelector('#copy2').firstChild;
                    const lines = []; let lastTop = null;
                    for (let i = 0; i < text.length; i++) {
                        const range = document.createRange();
                        range.setStart(text, i); range.setEnd(text, i + 1);
                        const top = range.getBoundingClientRect().top;
                        if (top !== lastTop) lines.push('');
                        lines[lines.length - 1] += text.data[i]; lastTop = top;
                    }
                    return lines.map(line => line.trim()).filter(Boolean);
                })(),
            };
        });
        assert.equal(screen.width, 816);
        assert.equal(screen.minimum, inches * 96);
        assert.equal(screen.fontSize, '18px');
        assert.equal(screen.headingSize, '34px');
        assert.ok(Math.abs(screen.secondTop - (inches - 1) * 96) < 1, 'manual break must line up with the selected page height');
        assert.equal(await page.locator('.s_elks_page_break').getAttribute('style'), null, 'preview spacers must not enter saved HTML');
        await page.screenshot({ path: path.join(output, `${size}-editor.png`), fullPage: true });
        // The report includes exactly this shared CSS, while @page provides its
        // record-dependent dimensions. Remove editor-only preview rules first.
        await page.evaluate(() => window.preview.destroy());
        await page.addStyleTag({ content: `@page { size: 8.5in ${inches}in; margin: 40px 40px 56px; }` });
        await page.emulateMedia({ media: 'print' });
        assert.equal(await page.locator('#copy').evaluate(el => getComputedStyle(el).fontSize), '18px');
        const bytes = await page.pdf({ path: path.join(output, `${size}.pdf`), preferCSSPageSize: true, printBackground: true });
        const pdf = await PDFDocument.load(bytes);
        const textPDF = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
        const content = await (await textPDF.getPage(1)).getTextContent();
        const paragraphLines = content.items.map(item => item.str.trim())
            .filter(text => text && (text.startsWith('Big thanks') || screen.lines.includes(text)));
        assert.deepEqual(paragraphLines, screen.lines, 'paragraph wrapping must match the editor');
        const secondLines = content.items.map(item => item.str.trim())
            .filter(text => text && (text.startsWith('Our Antlers') || screen.secondLines.includes(text)));
        assert.deepEqual(secondLines, screen.secondLines, 'second paragraph wrapping must match the editor');
        await textPDF.destroy();
        assert.equal(pdf.getPageCount(), 2, 'manual break must produce two pages');
        for (const sheet of pdf.getPages()) {
            assert.equal(sheet.getWidth(), 612);
            assert.equal(sheet.getHeight(), inches * 72);
        }
        await page.emulateMedia({ media: 'screen' });
        console.log(`${size}: correct paper dimensions, authored fonts, desktop columns, manual page break, and idle page-guide observer`);
    }
} finally {
    await browser.close();
}
