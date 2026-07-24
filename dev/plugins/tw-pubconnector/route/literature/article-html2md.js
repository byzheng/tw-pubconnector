/*\
title: $:/plugins/bangyou/tw-pubconnector/route/literature/article-html2md.js
type: application/javascript
module-type: route
\*/

(function () {
"use strict";

const fs = require('fs').promises;
const path = require('path');
const { getArticle, loadSiteConfig } = require("../../utils/utils.js");
const { saveHtmlDocumentAsDocx, saveHtmlDocumentAsMD } = require("../../utils/html2md.js");
const { JSDOM } = require("jsdom");

exports.method = "PUT";
exports.platforms = ["node"];
exports.path = /^\/literature\/article\/(.+)\/html2md$/;

exports.handler = async function(request, response, state) {
	try {
		const match = request.url.match(exports.path);
		if (!match || match.length < 2) {
			response.writeHead(400, { "Content-Type": "text/plain" });
			response.end("Bad Request");
			return;
		}
		const tiddlerTitle = decodeURIComponent(match[1]);
        console.log(`Received request to convert ${tiddlerTitle} from HTML to Markdown`);
		const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
        console.log(`Received request to convert ${tiddlerTitle} from HTML to Markdown`);
		if (!tiddler) {
			console.log(`Tiddler ${tiddlerTitle} not found`);
			response.writeHead(404, { "Content-Type": "application/json" });
			response.end(JSON.stringify({ status: "error", message: "Tiddler not found", code: 404 }));
			return;
		}
		// Get literature path from config tiddler, fallback to "literature" if not set
		var pathLiterature = ($tw.wiki.getTiddler("$:/config/tw-pubconnector/path/literature/html") || {}).fields?.text || "literature";
		var fullPathLiterature = path.resolve($tw.boot.wikiTiddlersPath, "../files", pathLiterature);
		const htmlPath = path.join(fullPathLiterature, "html", tiddlerTitle + ".html");
		// const wordPath = path.join(fullPathLiterature, "word", tiddlerTitle + ".docx");
		const markdownPath = path.join(fullPathLiterature, "markdown", tiddlerTitle + ".md");

		// Skip if markdown file already exists
		try {
			await fs.access(markdownPath);
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(JSON.stringify({ status: "success", message: "Markdown file already exists", code: 200 }));
			return;
		} catch {
			// File doesn't exist, continue processing
		}
		
		try {
			await fs.access(htmlPath);
		} catch {
			response.writeHead(404, { "Content-Type": "application/json" });
			response.end(JSON.stringify({ status: "error", message: "HTML file not found", code: 404 }));
			return;
		}
		const htmlContent = await fs.readFile(htmlPath, 'utf-8');
		// Suppress jsdom warnings/errors during parsing
		const originalWarn = console.warn;
		const originalError = console.error;
		console.warn = () => {};
		console.error = () => {};
		let dom;
		try {
			dom = new JSDOM(htmlContent);
		} finally {
			console.warn = originalWarn;
			console.error = originalError;
		}
		const html_doc = dom.window.document;
		const siteConfig = loadSiteConfig($tw);
		if (!siteConfig) {
			response.writeHead(500, { "Content-Type": "application/json" });
			response.end(JSON.stringify({ status: "error", message: "Site config not found", code: 500 }));
			return;
		}
		const articleDoc = getArticle(html_doc, siteConfig);
		// await saveHtmlDocumentAsDocx(articleDoc, wordPath);
		await fs.mkdir(path.dirname(markdownPath), { recursive: true });
		await saveHtmlDocumentAsMD(articleDoc, markdownPath);
		response.writeHead(200, { "Content-Type": "application/json" });
		response.end(JSON.stringify({ status: "success", message: "Converted to Markdown", code: 200 }));
	} catch (err) {
		response.writeHead(500, { "Content-Type": "application/json" });
		response.end(JSON.stringify({ status: "error", message: err.toString(), code: 500 }));
	}
};

})();
