const https = require("https");

/*\
title: $:/plugins/bangyou/tw-pubconnector/route/literature/cites.js
type: application/javascript
module-type: route

GET /^\/literature/cites\/(.+)$/

Get reference list for a tiddler

\*/
(function () {

	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";
	var openalex = require("$:/plugins/bangyou/tw-pubconnector/api/openalex.js").OpenAlex();
	exports.method = "GET";
	exports.platforms = ["node"];
	exports.path = /^\/literature\/(.+)\/cites$/;

	exports.handler = function (request, response, state) {

		try {
			const doi = state.params[0];
			console.log("Fetching references for DOI:", doi);	
			openalex.getCitesByDOI(doi).then((data) => {
				response.writeHead(200, { "Content-Type": "application/json" });
				response.end(JSON.stringify({
					"status": "success",
					"code": 200,
					"message": "References fetched successfully",
					"count": data.length,
					"data": data
				}));
			}).catch((err) => {
				console.error("Error fetching references:", err);
				response.writeHead(400, { "Content-Type": "application/json" });
				response.end(JSON.stringify({
					"status": "error",
					"code": 400,
					"message": "Error fetching references"
				}));
			});
			
			// response.writeHead(200, { "Content-Type": "application/json" });
			// response.end(JSON.stringify({ "a": "b" }));
		} catch (err) {
			console.error("Error processing request:", err);
			response.writeHead(400, { "Content-Type": "application/json" });
			response.end(JSON.stringify({
				"status": "error",
				"code": 400,
				"message": "Error processing request: " + err.message
			}));
		}
	};

}());

