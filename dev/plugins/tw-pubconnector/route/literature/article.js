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

	function getConfigText(title, fallback) {
		const tiddler = $tw.wiki.getTiddler(title);
		if (!tiddler || !tiddler.fields || typeof tiddler.fields.text !== "string") {
			return fallback;
		}
		return tiddler.fields.text;
	}

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
			const domainLinkEnabled = getConfigText("$:/config/tw-pubconnector/article/domain-link/enable", "enable") === "enable";
			const domainFilter = getConfigText("$:/config/tw-pubconnector/article/domain-link/filter", "[tag[Domain]]").trim();
			const ignoreField = getConfigText("$:/config/tw-pubconnector/article/domain-link/ignore-field", "link-ignore").trim();
			const akaField = getConfigText("$:/config/tw-pubconnector/article/domain-link/aka-field", "aka").trim();
			const paragraphFirstOnly = getConfigText("$:/config/tw-pubconnector/article/domain-link/paragraph-first", "enable") === "enable";
			let domainTitles = [];

			if (domainLinkEnabled && domainFilter) {
				domainTitles = $tw.wiki.filterTiddlers(domainFilter) || [];
				if (ignoreField) {
					domainTitles = domainTitles.filter(function (title) {
						const domainTiddler = $tw.wiki.getTiddler(title);
						const fields = domainTiddler && domainTiddler.fields;
						return !(fields && Object.prototype.hasOwnProperty.call(fields, ignoreField));
					});
				}
			}
			const domainLinks = domainTitles.map(function (title) {
				const domainTiddler = $tw.wiki.getTiddler(title);
				const rawAliases = akaField && domainTiddler && domainTiddler.fields ? domainTiddler.fields[akaField] : "";
				const aliases = rawAliases ? $tw.utils.parseStringArray(rawAliases) : [];
				const seenTerms = Object.create(null);
				const terms = [title].concat(aliases).filter(function (term) {
					if (typeof term !== "string") return false;
					term = term.trim();
					if (!term) return false;
					const key = term.toLowerCase();
					if (seenTerms[key]) return false;
					seenTerms[key] = true;
					return true;
				});
				return {
					title: title,
					terms: terms
				};
			});
			document = utils.getArticle(document, siteConfig);

			// Relax the CSP from the saved HTML so that injected scripts can call
			// back to the TiddlyWiki server (connect-src, script-src, style-src).
			document.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]').forEach(function (el) {
				el.parentNode.removeChild(el);
			});
			// Inject a permissive CSP that is still reasonably locked down.
			const cspMeta = document.createElement('meta');
			cspMeta.setAttribute('http-equiv', 'Content-Security-Policy');
			cspMeta.setAttribute('content',
				"default-src 'none'; " +
				"script-src 'unsafe-inline'; " +
				"style-src 'unsafe-inline'; " +
				"img-src data: blob: *; " +
				"font-src data: *; " +
				"connect-src 'self' ws: wss:;"
			);
			const head = document.querySelector('head') || document.documentElement;
			head.insertBefore(cspMeta, head.firstChild);

			// Inject script tag before </body>
			const hightlightScript = document.createElement('script');
			const scriptText = $tw.wiki.getTiddler("$:/plugins/bangyou/tw-pubconnector/script/highlight.js", "");
			const domainLinkScript = document.createElement('script');
			const domainLinkText = $tw.wiki.getTiddler("$:/plugins/bangyou/tw-pubconnector/script/domain-link.js", "");
			const bootstrapScript = document.createElement('script');
			bootstrapScript.textContent =
				"window.__TW_PUBCONNECTOR_DOMAIN_LINKS = " + JSON.stringify(domainLinks) + ";" +
				"window.__TW_PUBCONNECTOR_DOMAIN_TITLES = " + JSON.stringify(domainTitles) + ";" +
				"window.__TW_PUBCONNECTOR_DOMAIN_LINK_OPTIONS = " + JSON.stringify({ firstOccurrencePerScope: paragraphFirstOnly }) + ";";
			document.body.appendChild(bootstrapScript);


			if (scriptText) {
				hightlightScript.textContent = scriptText.fields.text || "";
				document.body.appendChild(hightlightScript);
			}

			if (domainLinkEnabled && domainLinkText) {
				domainLinkScript.textContent = domainLinkText.fields.text || "";
				document.body.appendChild(domainLinkScript);
			}


			// Inject shared literature reader styles.
			const styleTiddler =
				$tw.wiki.getTiddler("$:/plugins/bangyou/tw-pubconnector/style/literature") ||
				$tw.wiki.getTiddler("$:/plugins/bangyou/tw-pubconnector/style/style.js");
			if (styleTiddler) {
				const styleTag = document.createElement('style');
				styleTag.textContent = styleTiddler.fields.text || "";
				(document.head || document.body).appendChild(styleTag);
			}

			// Inject livebridge WebSocket client
			const livebridgeTiddler = $tw.wiki.getTiddler("$:/plugins/bangyou/tw-pubconnector/script/livebridge.js");
			if (livebridgeTiddler) {
				const livebridgeScript = document.createElement('script');
				livebridgeScript.textContent = livebridgeTiddler.fields.text || "";
				document.body.appendChild(livebridgeScript);
			}
			

			// const inject = `<script src="/files/inject.js"></script>`;
			// const modifiedHtml = html.replace(/<\/body>/i, `${inject}</body>`);
			const modifiedHTML = dom.serialize();
			response.writeHead(200, { "Content-Type": "text/html" });
			response.end(modifiedHTML);
		});

	};


}());

