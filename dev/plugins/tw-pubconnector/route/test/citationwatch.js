/*\
title: $:/plugins/bangyou/tw-pubconnector/route/test/citationwatch.js
type: application/javascript
module-type: route

GET /^\/test\/citationwatch\/(.+)$/

Test route for Citation Watch API

\*/
(function () {

	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";
	var CitationWatchAPI = require("$:/plugins/bangyou/tw-pubconnector/api/citationwatch.js").CitationWatch();

	exports.method = "GET";
	exports.platforms = ["node"];
	exports.path = /^\/test\/citationwatch$/;

	exports.handler = function (request, response, state) {

		try {
			
            let days = 90; // default value
			if (state && state.queryParameters && state.queryParameters.days) {
				const parsedDays = parseInt(state.queryParameters.days);
				if (!isNaN(parsedDays) && parsedDays > 0) {
					days = parsedDays;
				}
			}

			// Check if Citation Watch is enabled
			if (!CitationWatchAPI.isEnabled()) {
				response.writeHead(503, { "Content-Type": "application/json" });
				response.end(JSON.stringify({ error: "Citation Watch is disabled" }));
				return;
			}

			console.log(`Citation Watch: Fetching latest citations from last ${days} days`);

			CitationWatchAPI.getLatest(days).then((citations) => {
				response.writeHead(200, { "Content-Type": "application/json" });
				response.end(JSON.stringify({
					success: true,
					days: days,
					count: citations.length,
					data: citations
				}, null, 2));
				console.log(`Citation Watch: Found ${citations.length} recent citations`);
			}).catch((error) => {
				console.error("Citation Watch error:", error);
				response.writeHead(500, { "Content-Type": "application/json" });
				response.end(JSON.stringify({
					success: false,
					error: error.message || "An error occurred while fetching citations"
				}));
			});

		} catch (error) {
			console.error("Citation Watch route error:", error);
			response.writeHead(500, { "Content-Type": "application/json" });
			response.end(JSON.stringify({
				success: false,
				error: error.message || "Internal server error"
			}));
		}
	};
})();
