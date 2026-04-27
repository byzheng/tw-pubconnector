/*\
title: $:/plugins/bangyou/tw-pubconnector/script/highlight.js
type: application/javascript
module-type: library
Utils functions

\*/


'use strict';



function querySelectorAllIncludingRoot(root, selector) {
    const matches = [];
    if (root.matches && root.matches(selector)) {
        matches.push(root);
    }
    root.querySelectorAll(selector).forEach(el => {
        matches.push(el);
    });
    return matches;
}

function removeElementsIncludingRoot(root, selector) {
    querySelectorAllIncludingRoot(root, selector).forEach(el => {
        el.remove();
    });
}

function shouldKeepScript(scriptEl) {
    if (!scriptEl || !scriptEl.getAttribute) {
        return false;
    }
    const type = String(scriptEl.getAttribute("type") || "").toLowerCase();
    if (!type) {
        return false;
    }
    // Keep non-executable math payload scripts so equation sources survive extraction.
    if (type.indexOf("math/tex") !== -1 || type.indexOf("math/mml") !== -1) {
        return true;
    }
    return false;
}

function collectMathJaxSupportNodes(document) {
    const nodes = [];
    const pushClone = function (node) {
        if (node) {
            nodes.push(node.cloneNode(true));
        }
    };

    // MathJax v2 SVG output stores shared glyph paths here.
    pushClone(document.querySelector('#MathJax_SVG_Hidden'));

    const glyphDefs = document.querySelector('defs#MathJax_SVG_glyphs');
    if (glyphDefs && glyphDefs.parentNode && glyphDefs.parentNode.nodeName && glyphDefs.parentNode.nodeName.toLowerCase() === 'svg') {
        pushClone(glyphDefs.parentNode);
    }

    pushClone(document.querySelector('#MathJax_Message'));
    return nodes;
}

function removeSingleFileMetadataComments(document) {
    const root = document.documentElement || document;
    const NodeFilterRef = document.defaultView && document.defaultView.NodeFilter
        ? document.defaultView.NodeFilter
        : { SHOW_COMMENT: 128 };
    const walker = document.createTreeWalker(root, NodeFilterRef.SHOW_COMMENT);
    const commentsToRemove = [];
    let currentNode = walker.nextNode();

    while (currentNode) {
        if (/Page saved with SingleFile|saved date:/i.test(currentNode.nodeValue || '')) {
            commentsToRemove.push(currentNode);
        }
        currentNode = walker.nextNode();
    }

    commentsToRemove.forEach(comment => {
        if (comment.parentNode) {
            comment.parentNode.removeChild(comment);
        }
    });
}

function getArticleSiteClass(siteKey) {
    return 'tw-pubconnector-article-site-' + String(siteKey || 'unknown')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}



function getURL(document) {
    // Get entire document as string (if not already in a string)
    const htmlString = document.documentElement.outerHTML;

    // Match the URL inside the comment
    const match = htmlString.match(/<!--\s*Page saved with SingleFile\s*url:\s*(.*?)\s*saved date:/);
    if (match && match[1]) {
        const savedUrl = match[1].trim();
        return savedUrl;
    }
    var urlSelt = [
        "meta[name='prism.url' i]",
        "meta[property='og:url' i]",
        "link[rel='canonical' i]"
    ]
    var url;
    for (let i = 0; i < urlSelt.length; i++) {

        var ele = document.querySelector(urlSelt[i]);
        if (ele === undefined || ele === null) {
            continue;
        }
        var attributes = ["content", "href"];
        for (let j = 0; j < attributes.length; j++) {
            url = ele.getAttribute(attributes[j]);
            if (url) {
                break;
            }
        }
        break;
    }
    return url;
}


// Function to get article content for a literature
function getArticle(document, siteConfig) {
    const url = getURL(document);
    if (!url) {
        response.writeHead(500, { "Content-Type": "text/plain" });
        response.end("No valid URL found in the HTML content");
        console.log("No valid URL found in the HTML content");
        return document;
    }
    

    removeSingleFileMetadataComments(document);
    ["single-file-infobar", ".single-file-infobar", "#single-file-infobar", "form.infobar"].forEach(selector => {
        removeElementsIncludingRoot(document.documentElement || document, selector);
    });

    //console.log("Found URL:", url);
    // Remove executable script tags, but preserve non-executable math payload tags.
    const scripts = document.querySelectorAll('script');
    //console.log("Filtering script tags:", scripts.length);
    scripts.forEach(script => {
        if (!shouldKeepScript(script)) {
            script.remove();
        }
    });
    let siteKey = Object.keys(siteConfig).find(site => url.includes(site));
    if (!siteKey) {
        console.log("No matching site configuration found for URL. Returning original document.");
        return document;
    }
    let { articleSelector, removeSelectors, classRemovals } = siteConfig[siteKey];
    if (!Array.isArray(articleSelector)) {
        articleSelector = [articleSelector];
    }
    const articleClones = [];
    articleSelector.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            articleClones.push(el.cloneNode(true)); // true = deep clone
        });
    });

    const styleClones = [];
    document.querySelectorAll('style').forEach(el => {
        styleClones.push(el.cloneNode(true));
    });

    const mathJaxSupportClones = collectMathJaxSupportNodes(document);

    if (!articleClones.length) {
        return document;
    }

    const siteClass = getArticleSiteClass(siteKey);

    styleClones.forEach(styleClone => {
        if (document.head) {
            document.head.appendChild(styleClone);
        } else {
            document.documentElement.insertBefore(styleClone, document.body || null);
        }
    });

    document.body.classList.add('tw-pubconnector-article-page', siteClass);
    document.documentElement.classList.add('tw-pubconnector-article-document');

    const articleWrapper = document.createElement('div');
    articleWrapper.className = 'tw-pubconnector-article-mode ' + siteClass;
    articleWrapper.setAttribute('data-tw-pubconnector-site', siteKey);

    articleClones.forEach(clone => {
        articleWrapper.appendChild(clone);
    });

    const clones = [articleWrapper].concat(mathJaxSupportClones);

    querySelectorAllIncludingRoot(articleWrapper, 'script').forEach(script => {
        if (!shouldKeepScript(script)) {
            script.remove();
        }
    });

    querySelectorAllIncludingRoot(articleWrapper, 'style').forEach(style => {
        style.remove();
    });

    querySelectorAllIncludingRoot(articleWrapper, 'noscript').forEach(node => {
        node.remove();
    });

    var mergedRemoveSelectors = Array.isArray(removeSelectors) ? removeSelectors.slice() : [];
    mergedRemoveSelectors.push(".tw-icon");
    mergedRemoveSelectors.push(".tw-icon-tiny");
    mergedRemoveSelectors.push(".tw-tag");
    mergedRemoveSelectors.push("#tw-banner");
    mergedRemoveSelectors.push("single-file-infobar");
    if (mergedRemoveSelectors.length) {
        mergedRemoveSelectors.forEach(selector => {
            clones.forEach(clone => {
                removeElementsIncludingRoot(clone, selector);
            });
        });
    }
    
    if (Array.isArray(classRemovals)) {
        classRemovals.forEach(rule => {
            if (!rule || !rule.selector || !Array.isArray(rule.classes) || !rule.classes.length) {
                return;
            }
            clones.forEach(clone => {
                querySelectorAllIncludingRoot(clone, rule.selector).forEach(el => {
                    rule.classes.forEach(className => {
                        if (className) {
                            el.classList.remove(className);
                        }
                    });
                });
            });
        });
    }

    document.body.innerHTML = '';
    clones.forEach(clone => {
        document.body.appendChild(clone);
    });

    return document

}
exports.getArticle = getArticle;

