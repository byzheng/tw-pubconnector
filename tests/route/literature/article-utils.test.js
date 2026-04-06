const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const { getArticle } = require('../../../dev/plugins/tw-pubconnector/utils/utils.js');

test('getArticle removes configured classes from the cloned root element', () => {
    const dom = new JSDOM(`<!doctype html><html><head>
        <meta property="og:url" content="https://www.sciencedirect.com/science/article/pii/test" />
    </head><body>
        <article class="col-md-16 col-lg-12 keep-me"><div>Body</div></article>
    </body></html>`);

    const result = getArticle(dom.window.document, {
        'sciencedirect.com': {
            articleSelector: 'article',
            classRemovals: [
                {
                    selector: 'article',
                    classes: ['col-md-16', 'col-lg-12']
                }
            ]
        }
    });

    const article = result.querySelector('article');
    assert.ok(article);
    assert.equal(article.classList.contains('col-md-16'), false);
    assert.equal(article.classList.contains('col-lg-12'), false);
    assert.equal(article.classList.contains('keep-me'), true);
});

test('getArticle wraps extracted content with shared article reader classes', () => {
    const dom = new JSDOM(`<!doctype html><html><head>
        <meta property="og:url" content="https://onlinelibrary.wiley.com/doi/full/test" />
    </head><body>
        <style>.source-style { color: red; }</style>
        <div id="article__content" class="col-sm-12 col-md-8 col-lg-8">
            <p>Body</p>
        </div>
    </body></html>`);

    const result = getArticle(dom.window.document, {
        'wiley.com': {
            articleSelector: 'div#article__content',
            classRemovals: [
                {
                    selector: 'div#article__content',
                    classes: ['col-sm-12', 'col-md-8', 'col-lg-8']
                }
            ]
        }
    });

    const wrapper = result.body.firstElementChild;
    assert.ok(wrapper);
    assert.equal(wrapper.classList.contains('tw-pubconnector-article-mode'), true);
    assert.equal(wrapper.classList.contains('tw-pubconnector-article-site-wiley-com'), true);
    assert.equal(result.body.classList.contains('tw-pubconnector-article-page'), true);
    assert.equal(result.body.classList.contains('tw-pubconnector-article-site-wiley-com'), true);
    assert.equal(result.head.querySelectorAll('style').length, 1);

    const article = wrapper.querySelector('#article__content');
    assert.ok(article);
    assert.equal(article.classList.contains('col-md-8'), false);
});