
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
const { Document, Packer, Paragraph } = require('docx');

/**
 * Converts an HTML document object to a Word (.docx) file and saves it.
 * @param {Document} htmlDocument - The HTML document object (e.g., from JSDOM or browser DOM).
 * @param {string} outputPath - The path to save the .docx file.
 */
async function saveHtmlDocumentAsDocx(htmlDocument, outputPath) {
    // Extract text content from the HTML document
    const body = htmlDocument.body || htmlDocument.documentElement;
    const textContent = body.textContent || '';

    // Create a docx document
    const doc = new Document({
        sections: [
            {
                properties: {},
                children: [
                    new Paragraph(textContent)
                ],
            },
        ],
    });

    // Generate the .docx file and save
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buffer);
}

exports.saveHtmlDocumentAsDocx = saveHtmlDocumentAsDocx;