
/*\
title: $:/plugins/bangyou/tw-pubconnector/utils/html2md.js
type: application/javascript
module-type: library
Utils functions

\*/


'use strict';

const fs = require('fs');

const BLOCK_TAGS = new Set([
    'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'figcaption',
    'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr',
    'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'td', 'tfoot',
    'th', 'thead', 'tr', 'ul'
]);

function normalizeWhitespace(text) {
    return text.replace(/\s+/g, ' ').trim();
}

function escapeMarkdownText(text) {
    // Avoid escaping '.' and '-' and parentheses so natural text like
    // '(Pandey & Senthil-...' or sentence-ending periods remain readable.
    return text.replace(/[\\`*_{}\[\]#+.!|>]/g, '\\$&');
}

function escapeMarkdownUrl(url) {
    return url.replace(/[()\s]/g, match => encodeURIComponent(match));
}

function ensureBlockSpacing(text) {
    return text
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
}

function mergeInlineFragments(fragments) {
    return fragments
        .join('')
        .replace(/[ \t]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .trim();
}

function serializeChildren(node, context) {
    const fragments = [];
    for (const child of node.childNodes) {
        fragments.push(serializeNode(child, context));
    }
    return fragments.join('');
}

function serializeList(listNode, context) {
    const items = [];
    let index = 1;

    for (const child of listNode.children) {
        if (child.tagName && child.tagName.toLowerCase() === 'li') {
            const marker = listNode.tagName.toLowerCase() === 'ol' ? `${index}. ` : '- ';
            const itemContent = serializeChildren(child, { ...context, indent: context.indent + 1 }).trim();
            const lines = itemContent.split('\n');
            const paddedLines = lines.map((line, lineIndex) => {
                if (lineIndex === 0) {
                    return `${'  '.repeat(context.indent)}${marker}${line}`;
                }
                return `${'  '.repeat(context.indent + 1)}${line}`;
            });
            items.push(paddedLines.join('\n'));
            index += 1;
        }
    }

    return `${items.join('\n')}\n\n`;
}

function serializeTable(tableNode) {
    const rows = [];
    for (const row of tableNode.querySelectorAll('tr')) {
        const cells = [];
        for (const cell of row.children) {
            const tagName = cell.tagName.toLowerCase();
            if (tagName !== 'th' && tagName !== 'td') {
                continue;
            }
            const value = mergeInlineFragments([serializeChildren(cell, { indent: 0 })])
                .replace(/\|/g, '\\|');
            cells.push(value);
        }
        if (cells.length > 0) {
            rows.push(cells);
        }
    }

    if (rows.length === 0) {
        return '';
    }

    const header = rows[0];
    const separator = header.map(() => '---');
    const body = rows.slice(1);
    const markdownRows = [header, separator, ...body]
        .map(cells => `| ${cells.join(' | ')} |`)
        .join('\n');

    return `${markdownRows}\n\n`;
}

function serializeNode(node, context) {
    if (node.nodeType === node.TEXT_NODE) {
        if (context.preserveWhitespace) {
            return node.textContent;
        }
        const hasBlockSibling = (node.previousSibling && node.previousSibling.nodeType === node.ELEMENT_NODE && BLOCK_TAGS.has(node.previousSibling.tagName.toLowerCase()))
            || (node.nextSibling && node.nextSibling.nodeType === node.ELEMENT_NODE && BLOCK_TAGS.has(node.nextSibling.tagName.toLowerCase()));
        const text = hasBlockSibling ? normalizeWhitespace(node.textContent) : node.textContent.replace(/\s+/g, ' ');
        return escapeMarkdownText(text);
    }

    if (node.nodeType !== node.ELEMENT_NODE) {
        return '';
    }

    const tagName = node.tagName.toLowerCase();

    if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') {
        return '';
    }

    if (tagName === 'br') {
        return '  \n';
    }

    if (tagName === 'hr') {
        return '\n---\n\n';
    }

    if (tagName === 'pre') {
        const code = node.textContent.replace(/\n+$/, '');
        return `\n\`\`\`\n${code}\n\`\`\`\n\n`;
    }

    if (tagName === 'code') {
        return `\`${node.textContent.replace(/`/g, '\\`')}\``;
    }

    if (tagName === 'strong' || tagName === 'b') {
        return `**${mergeInlineFragments([serializeChildren(node, context)])}**`;
    }

    if (tagName === 'em' || tagName === 'i') {
        return `*${mergeInlineFragments([serializeChildren(node, context)])}*`;
    }

    if (tagName === 'a') {
        // Keep the anchor's visible text but drop the href so the result is plain text
        return mergeInlineFragments([serializeChildren(node, context)]);
    }

    if (tagName === 'img') {
        // Remove images entirely
        return '';
    }

    if (/^h[1-6]$/.test(tagName)) {
        const level = Number(tagName.charAt(1));
        const text = mergeInlineFragments([serializeChildren(node, context)]);
        return `${'#'.repeat(level)} ${text}\n\n`;
    }

    if (tagName === 'blockquote') {
        const text = ensureBlockSpacing(serializeChildren(node, context));
        const quoted = text.split('\n').map(line => line ? `> ${line}` : '>').join('\n');
        return `${quoted}\n\n`;
    }

    if (tagName === 'ul' || tagName === 'ol') {
        return serializeList(node, context);
    }

    if (tagName === 'table') {
        return serializeTable(node);
    }

    if (tagName === 'p') {
        const text = mergeInlineFragments([serializeChildren(node, context)]);
        return text ? `${text}\n\n` : '';
    }

    if (tagName === 'li') {
        return ensureBlockSpacing(serializeChildren(node, context));
    }

    const childContent = serializeChildren(node, context);
    if (BLOCK_TAGS.has(tagName)) {
        const text = ensureBlockSpacing(childContent);
        return text ? `${text}\n\n` : '';
    }

    return childContent;
}

function convertHtmlDocumentToMarkdown(htmlDocument) {
    const docClone = htmlDocument.cloneNode(true);
    const root = docClone.querySelector('article') || docClone.body || docClone.documentElement;
    const markdown = serializeChildren(root, { indent: 0, preserveWhitespace: false });
    const body = ensureBlockSpacing(markdown) + '\n';

    // Extract title and authors from document head or fallback to in-document elements
    function getMetaContent(doc, selectors) {
        for (const sel of selectors) {
            const el = doc.querySelector(sel);
            if (el) {
                const attr = el.getAttribute('content') || el.textContent || el.getAttribute('href') || '';
                if (attr && String(attr).trim()) return String(attr).trim();
            }
        }
        return null;
    }

    const titleSelectors = [
        "meta[name='citation_title' i]",
        "meta[property='og:title' i]",
        "meta[name='dc.title' i]",
        'title'
    ];
    let title = getMetaContent(docClone, titleSelectors);
    if (!title) {
        const h1 = root.querySelector('h1');
        if (h1) title = mergeInlineFragments([serializeChildren(h1, { indent: 0 })]).trim();
    }

    // Authors: allow multiple citation_author meta tags
    const authors = [];
    docClone.querySelectorAll("meta[name='citation_author' i]").forEach(a => {
        const v = a.getAttribute('content');
        if (v) authors.push(String(v).trim());
    });
    if (!authors.length) {
        const authorMeta = getMetaContent(docClone, ["meta[name='author' i]", "meta[name='dc.creator' i]"]);
        if (authorMeta) authors.push(authorMeta);
    }
    if (!authors.length) {
        // look for typical author elements
        const auEl = root.querySelector('.author, .byline, [rel=author]');
        if (auEl) {
            authors.push(mergeInlineFragments([serializeChildren(auEl, { indent: 0 })]).trim());
        }
    }

    let header = '';
    if (title) {
        // avoid duplicating if body already begins with same h1/title line
        const firstLine = body.split('\n', 1)[0] || '';
        const normalizedFirst = firstLine.replace(/^#\s*/, '').trim();
        if (normalizedFirst.toLowerCase() !== String(title).trim().toLowerCase()) {
            header += `# ${String(title).trim()}\n\n`;
        }
    }
    if (authors && authors.length) {
        header += `${authors.join(', ')}\n\n`;
    }

    return (header + body).replace(/\n{3,}/g, '\n\n');
}


/**
 * Converts an HTML document object to a Markdown (.md) file and saves it.
 * @param {Document} htmlDocument - The HTML document object (e.g., from JSDOM or browser DOM).
 * @param {string} outputPath - The path to save the .md file.
 */
async function saveHtmlDocumentAsMD(htmlDocument, outputPath) {
    const markdown = convertHtmlDocumentToMarkdown(htmlDocument);
    // Post-process: remove any remaining unnecessary backslash escapes
    // for dots, hyphens, or parentheses that may have come from input text.
    const cleaned = markdown.replace(/\\([.\-()])/g, '$1');
    fs.writeFileSync(outputPath, cleaned, 'utf8');
}

exports.saveHtmlDocumentAsMD = saveHtmlDocumentAsMD;