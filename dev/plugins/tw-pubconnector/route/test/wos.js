/*\
title: $:/plugins/bangyou/tw-pubconnector/route/test/wos.js
type: application/javascript
module-type: route

GET /^\/literature/reference\/(.+)$/

Get reference list for a tiddler

\*/
(function () {

	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";
	var platform = require("$:/plugins/bangyou/tw-pubconnector/api/orcid.js").ORCID();

	exports.method = "GET";
	exports.platforms = ["node"];
	exports.path = /^\/test\/orcid\/(.+)$/;

	exports.handler = function (request, response, state) {

		try {
			const id = decodeURIComponent(state.params[0]);
			if (!id || id.length === 0) {
				response.writeHead(400, { "Content-Type": "text/plain" });
				response.end("Invalid id provided");
				console.log("Invalid id provided");
				return;
			}
			platform.cacheWorks(id).then((data) => {
				response.writeHead(200, { "Content-Type": "application/json" });
				response.end(JSON.stringify(data));
			}).catch((err) => {
				console.error("Error fetching works:", err);
				response.writeHead(500, { "Content-Type": "text/plain" });
				response.end("Error fetching works");
			});
		} catch (err) {
			console.error("Error processing request:", err.message);
			response.writeHead(400);
			response.end("Error processing request: " + err.message);
		}
	};

}());

