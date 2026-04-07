const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const scriptPath = path.join(__dirname, '../../../dev/plugins/tw-pubconnector/script/domain-link.js');
const domainLinkScript = fs.readFileSync(scriptPath, 'utf8');

function waitForDomainLinks(window) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, 50);
    });
}

test('domain-link prefers the longer overlapping domain term', async () => {
    const dom = new JSDOM(`<!doctype html><html><body>
        <article>
            <p>The multi-stress resilience framework extends multi-stress analysis.</p>
        </article>
    </body></html>`, {
        runScripts: 'dangerously',
        url: 'https://example.test/literature/article/Test%20Article'
    });

    dom.window.__TW_PUBCONNECTOR_DOMAIN_LINKS = [
        { title: 'multi-stress', terms: ['multi-stress'] },
        { title: 'multi-stress resilience', terms: ['multi-stress resilience'] }
    ];
    dom.window.__TW_PUBCONNECTOR_DOMAIN_LINK_OPTIONS = {
        firstOccurrencePerScope: true
    };

    dom.window.eval(domainLinkScript);
    await waitForDomainLinks(dom.window);

    const links = Array.from(dom.window.document.querySelectorAll('a.tw-domain-link'));
    assert.equal(links.length, 2);
    assert.deepEqual(
        links.map(function (link) { return link.textContent; }),
        ['multi-stress resilience', 'multi-stress']
    );
    assert.deepEqual(
        links.map(function (link) { return link.getAttribute('data-tw-domain-title'); }),
        ['multi-stress resilience', 'multi-stress']
    );
    assert.match(
        dom.window.document.body.textContent,
        /The multi-stress resilience framework extends multi-stress analysis\./
    );
});

test('domain-link prefers the longer overlapping alias term', async () => {
    const dom = new JSDOM(`<!doctype html><html><body>
        <article>
            <p>MSR improves on MS in this paragraph.</p>
        </article>
    </body></html>`, {
        runScripts: 'dangerously',
        url: 'https://example.test/literature/article/Test%20Article'
    });

    dom.window.__TW_PUBCONNECTOR_DOMAIN_LINKS = [
        { title: 'multi-stress', terms: ['multi-stress', 'MS'] },
        { title: 'multi-stress resilience', terms: ['multi-stress resilience', 'MSR'] }
    ];
    dom.window.__TW_PUBCONNECTOR_DOMAIN_LINK_OPTIONS = {
        firstOccurrencePerScope: true
    };

    dom.window.eval(domainLinkScript);
    await waitForDomainLinks(dom.window);

    const links = Array.from(dom.window.document.querySelectorAll('a.tw-domain-link'));
    assert.equal(links.length, 2);
    assert.deepEqual(
        links.map(function (link) { return link.textContent; }),
        ['MSR', 'MS']
    );
    assert.deepEqual(
        links.map(function (link) { return link.getAttribute('data-tw-domain-title'); }),
        ['multi-stress resilience', 'multi-stress']
    );
    assert.match(
        dom.window.document.body.textContent,
        /MSR improves on MS in this paragraph\./
    );
});