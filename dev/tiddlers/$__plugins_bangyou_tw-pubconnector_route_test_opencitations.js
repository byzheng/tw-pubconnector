/*\
title: $:/plugins/bangyou/tw-pubconnector/route/test/opencitations.js
type: application/javascript
module-type: route

GET /^\/test\/opencitations\/([^\/]+)\/(.+)$/

Test route for OpenCitations API

\*/
(function () {

	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";
	var openCitationsAPI = require("$:/plugins/bangyou/tw-pubconnector/api/opencitations.js").OpenCitations();

	exports.method = "GET";
	exports.platforms = ["node"];
	exports.path = /^\/test\/opencitations\/(.+?)\/(.+)$/;

	exports.handler = function (request, response, state) {

		try {
			const action = decodeURIComponent(state.params[0]);
			const doi = decodeURIComponent(state.params[1]);
			const options = request.url.includes('?') ? Object.fromEntries(new URL(request.url, 'http://localhost').searchParams) : {};

			if (!action || !doi) {
				response.writeHead(400, { "Content-Type": "application/json" });
				response.end(JSON.stringify({ error: "Missing action or DOI parameter" }));
				console.log("Missing action or DOI parameter");
				return;
			}

			// Route different actions
			let promise;
			switch (action.toLowerCase()) {
				case "citations":
					promise = openCitationsAPI.getCitationByDOI(doi, options);
					break;
				default:
					response.writeHead(400, { "Content-Type": "application/json" });
					response.end(JSON.stringify({ error: `Unknown action: ${action}. Supported: metadata, citing, references, all-citations` }));
					return;
			}

			promise.then((data) => {
				response.writeHead(200, { "Content-Type": "application/json" });
				response.end(JSON.stringify({
					action: action,
					doi: doi,
					data: data
				}));
			}).catch((err) => {
				console.error(`Error fetching ${action} for ${doi}:`, err);
				response.writeHead(500, { "Content-Type": "application/json" });
				response.end(JSON.stringify({
					error: `Error fetching ${action}`,
					message: err.message
				}));
			});
		} catch (err) {
			console.error("Error processing request:", err.message);
			response.writeHead(400, { "Content-Type": "application/json" });
			response.end(JSON.stringify({
				error: "Error processing request",
				message: err.message
			}));
		}
	};

}());
