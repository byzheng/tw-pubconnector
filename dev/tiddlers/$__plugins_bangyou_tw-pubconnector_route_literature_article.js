const { Console } = require('console');

/*\
title: $:/plugins/bangyou/tw-pubconnector/route/literature/article.js
type: application/javascript
module-type: route

GET /^\/literature/article\/(.+)$/

Get literature article for a tiddler


\*/
(function () {
	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";
	if ($tw.node) {
		var utils = require("$:/plugins/bangyou/tw-pubconnector/utils/utils.js");
	}
	const fs = require('fs'); // Use promise-based fs API for async/await
	const path = require('path');
	const { JSDOM, VirtualConsole } = require("jsdom"); // For DOM parsing of HTML content

	exports.method = "GET";
	exports.platforms = ["node"];
	exports.path = /^\/literature\/article\/(.+)$/;

	exports.handler = function (request, response, state) {
		const match = request.url.match(exports.path);
		if (!match || match.length < 2) {
			response.writeHead(400, { "Content-Type": "text/plain" });
			response.end("Bad Request");
			return;
		}
		const tiddlerName = decodeURIComponent(match[1]);
		// Basic sanitization
		if (tiddlerName.includes("..") || tiddlerName.includes("/") || tiddlerName.includes("\\")) {
			response.writeHead(400, { "Content-Type": "text/plain" });
			response.end("Invalid tiddler name");
			return;
		}
		const tiddler = $tw.wiki.getTiddler(tiddlerName);

		// Check tiddler validity
		if (!(tiddler && tiddler.fields && tiddler.fields.title)) {
			response.writeHead(500, { "Content-Type": "application/json" });
			response.end("Tiddler not found or invalid");
			console.log("Tiddler not found or invalid");
			return;
		}


		// Get literature path from config tiddler, fallback to "literature" if not set
		var pathLiterature = ($tw.wiki.getTiddler("$:/config/tw-pubconnector/path/literature/html") || {}).fields?.text || "literature";

		// Resolve absolute path for literature directory under files folder
		var fullPathLIterature = path.resolve($tw.boot.wikiTiddlersPath, "../files", pathLiterature);

		// Compose full path for HTML file using tiddler title
		const fullPathLiteratureHtml = path.join(fullPathLIterature, "html", tiddlerName + ".html");

		const virtualConsole = new VirtualConsole();
		virtualConsole.on("error", (error) => {
			if (error.message.includes("Could not parse CSS stylesheet")) {
				// Ignore this specific error
			} else {
				console.error("Other jsdom error:", error);
			}
		});


		fs.readFile(fullPathLiteratureHtml, "utf8", (err, html) => {
			if (err) {
				response.writeHead(404, { "Content-Type": "text/plain" });
				response.end("File not found");
				return;
			}
			let dom, document;
			try {
				// Parse the HTML content into a DOM using JSDOM
				dom = new JSDOM(html, {
					virtualConsole,
				});
				document = dom.window.document;
			} catch (e) {
				// Fail gracefully if HTML parsing fails
				console.error("Cheerio parsing failed:", e);
				response.writeHead(500);
				response.end("Failed to parse HTML content");
				console.log("Failed to parse HTML content", e);
				return;
			}



			const siteConfigTiddler = $tw.wiki.getTiddler("$:/plugins/bangyou/tw-pubconnector/config/article", "");

			if (!siteConfigTiddler || !siteConfigTiddler.fields || !siteConfigTiddler.fields.text) {
				response.writeHead(500, { "Content-Type": "text/plain" });
				response.end("Site configuration not found");
				console.log("Site configuration not found");
				return;
			}

			const siteConfig = JSON.parse(siteConfigTiddler.fields.text);
			if (!siteConfig) {
				response.writeHead(500, { "Content-Type": "text/plain" });
				response.end("Invalid site configuration");
				console.log("Invalid site configuration");
				return;
			}
			document = utils.getArticle(document, siteConfig);

			// // Inject script tag before </body>
			// const hightlightScript = document.createElement('script');
			// const scriptText = $tw.wiki.getTiddler("$:/plugins/bangyou/tw-pubconnector/script/highlight.js", "");


			// if (!scriptText) {
			// 	response.writeHead(500, { "Content-Type": "text/plain" });
			// 	response.end("Script content not found");
			// 	console.log("Script content not found");
			// 	return;
			// }
			// hightlightScript.textContent = scriptText.fields.text || "";
			// document.body.appendChild(hightlightScript);

			// // Inject style tag before </body>
			// const styleTiddler = $tw.wiki.getTiddler("$:/plugins/bangyou/tw-pubconnector/style/style.js");
			// if (!styleTiddler) {
			// 	response.writeHead(500, { "Content-Type": "text/plain" });
			// 	response.end("Style content not found");
			// 	console.log("Style content not found");
			// 	return;
			// }
			// const styleTag = document.createElement('style');
			// styleTag.textContent = styleTiddler.fields.text || "";
			// document.body.appendChild(styleTag);

			//const inject = `<script src="/files/inject.js"></script>`;
			//const modifiedHtml = html.replace(/<\/body>/i, `${inject}</body>`);
			const modifiedHTML = dom.serialize();
			response.writeHead(200, { "Content-Type": "text/html" });
			response.end(modifiedHTML);
		});

	};


}());

