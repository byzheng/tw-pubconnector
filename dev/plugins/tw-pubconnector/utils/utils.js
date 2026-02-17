/*\
title: $:/plugins/bangyou/tw-pubconnector/script/highlight.js
type: application/javascript
module-type: library
Utils functions

\*/


'use strict';



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
    //console.log("Found URL:", url);
    // Remove existing script tags
    const scripts = document.querySelectorAll('script');
    //console.log("Removing existing script tags:", scripts.length);
    scripts.forEach(script => script.remove());

    let siteKey = Object.keys(siteConfig).find(site => url.includes(site));
    if (!siteKey) return document;
    let { articleSelector, removeSelectors } = siteConfig[siteKey];
    if (!Array.isArray(articleSelector)) {
        articleSelector = [articleSelector];
    }
    const keepDefaultSelectors = ["style"];
    const keepSelectors = [...articleSelector, ...keepDefaultSelectors];
    const clones = [];
    keepSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            clones.push(el.cloneNode(true)); // true = deep clone
        });
    });
    
    if (Array.isArray(removeSelectors)) {
        removeSelectors.forEach(selector => {
            clones.forEach(clone => {
                clone.querySelectorAll(selector).forEach(el => el.remove());
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

