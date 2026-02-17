/*\
title: $:/plugins/bangyou/tw-pubconnector/route/authoring/bibtex.js
type: application/javascript
module-type: route
\*/



/**
 * TiddlyWiki Route Module: /literature/:entry/authors
 * 
 * Handles GET requests to fetch authors associated with a specific literature entry.
 * 
 * @module $:/plugins/bangyou/tw-pubconnector/route/authoring/bibtex.js
 * @type {application/javascript}
 * @route GET /literature/:entry/authors
 * @platforms ["node"]
 * 
 * @requires $:/plugins/bangyou/tw-pubconnector/api/authoring.js
 * 
 * @exports {string} method - The HTTP method supported by this route ("GET").
 * @exports {Array<string>} platforms - Supported platforms for this route (["node"]).
 * @exports {RegExp} path - The route path regex for matching requests.
 * @exports {Function} handler - The request handler function.
 * 
 * @function handler
 * @description Handles incoming GET requests to fetch authors for a given literature entry.
 * 
 * @param {Object} request - The HTTP request object.
 * @param {Object} response - The HTTP response object.
 * @param {Object} state - The state object containing route parameters.
 * @param {Array<string>} state.params - Array of route parameters, where params[0] is the encoded entry.
 * 
 * @returns {void}
 * 
 * @example
 * // Request: GET /literature/SomeEntry/authors
 * // Response: 200 OK
 * // {
 * //   "status": "success",
 * //   "code": 200,
 * //   "message": "Authors fetched successfully",
 * //   "data": [...]
 * // }
 * 
 * // Error Response: 400 Bad Request
 * // {
 * //   "status": "error",
 * //   "code": 400,
 * //   "message": "Invalid entry provided"
 * // }
 */


(function () {

	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";
	var authoring = require("$:/plugins/bangyou/tw-pubconnector/api/authoring.js").Authoring();

	exports.method = "GET";
	exports.platforms = ["node"];
	exports.path = /^\/literature\/([^/]+)\/authors$/;

	exports.handler = async function (request, response, state) {

		try {
			const entry = decodeURIComponent(state.params[0]);
			if (!entry || entry.length === 0) {
				response.writeHead(400, { "Content-Type": "application/json" });
				response.end(JSON.stringify({
					"status": "error",
					"code": 400,
					"message": "Invalid entry provided"
				}));
				console.log("Invalid entry provided");
				return;
			}
			try {
				const data = await authoring.getAuthorByTiddler(entry);

				response.writeHead(200, { "Content-Type": "application/json" });
				response.end(JSON.stringify({
					"status": "success",
					"code": 200,
					"message": "Authors fetched successfully",
					"data": data
				}));
			} catch (err) {
				console.error("Error fetching authors:", err);
				response.writeHead(400, { "Content-Type": "application/json" });
				response.end(JSON.stringify({
					"status": "error",
					"code": 400,
					"message": "Error fetching authors"
				}));
			}
		} catch (err) {
			console.error("Error processing request:", err.message);
			response.writeHead(500, { "Content-Type": "application/json" });
			response.end(JSON.stringify({
				"status": "error",
				"code": 500,
				"message": "Error processing request: " + err.message
			}));
		}
	};

}());

