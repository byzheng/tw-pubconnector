
/*\
title: $:/plugins/bangyou/tw-pubconnector/utils/html2docx.js
type: application/javascript
module-type: library
Utils functions

\*/


'use strict';

// This file is required for docx generation
const { JSDOM } = require('jsdom');
const fs = require('fs');
const htmlToDocx = require('html-to-docx');

/**
 * Converts an HTML document object to a Word (.docx) file and saves it.
 * @param {Document} htmlDocument - The HTML document object (e.g., from JSDOM or browser DOM).
 * @param {string} outputPath - The path to save the .docx file.
 */
async function saveHtmlDocumentAsDocx(htmlDocument, outputPath) {
    // Save the HTML content for debugging
    // Use html-to-docx to convert HTML to DOCX, preserving formatting, images, tables, etc.
    const htmlString = htmlDocument.documentElement.outerHTML;
    const buffer = await htmlToDocx(htmlString, null, {
        table: { row: { cantSplit: true } },
        footer: true,
        pageNumber: false
    });
    fs.writeFileSync(outputPath, buffer);
}

exports.saveHtmlDocumentAsDocx = saveHtmlDocumentAsDocx;