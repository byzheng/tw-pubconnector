const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JSDOM } = require('jsdom');

const { saveHtmlDocumentAsMD } = require('../../dev/plugins/tw-pubconnector/utils/html2md.js');

test('saveHtmlDocumentAsMD writes markdown for common article structures', async () => {
    const dom = new JSDOM(`<!doctype html><html><body>
        <article>
            <h1>Title</h1>
            <p>Hello <strong>world</strong> <a href="https://example.com/test path">link</a></p>
            <ul>
                <li>One</li>
                <li>Two</li>
            </ul>
        </article>
    </body></html>`);
    const outputPath = path.join(os.tmpdir(), `tw-pubconnector-${Date.now()}.md`);

    await saveHtmlDocumentAsMD(dom.window.document, outputPath);

    const markdown = fs.readFileSync(outputPath, 'utf8');
    fs.unlinkSync(outputPath);

    assert.equal(markdown, [
        '# Title',
        '',
        'Hello **world** [link](https://example.com/test%20path)',
        '',
        '- One',
        '- Two',
        ''
    ].join('\n'));
});