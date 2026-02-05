/*\
title: $__plugins_bangyou_tw-pubconnector_route_authoring_status.js
type: application/javascript
module-type: route
\*/

/**
 * TiddlyWiki Route: GET /api/authoring/status
 * 
 * Checks if there are any pending background requests across all platforms
 * 
 * Request:
 *   - Method: GET
 *   - Path: /api/authoring/status
 * 
 * Response:
 *   {
 *     "hasPendingRequests": boolean,
 *     "message": "Description of status"
 *   }
 */

(function () {
	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";

	var authoring = require("$:/plugins/bangyou/tw-pubconnector/api/authoring.js").Authoring();

	exports.method = "GET";
	exports.platforms = ["node"];
	exports.path = /^\/authoring\/status$/;

	exports.handler = async function (request, response, state) {
		try {
			var hasPendingRequests = authoring.hasPendingRequests();
			
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(JSON.stringify({
				"hasPendingRequests": hasPendingRequests,
				"message": hasPendingRequests ? 
					"Background data retrieval in progress" : 
					"No pending requests"
			}));
			return;

		} catch (err) {
			console.error("Error checking authoring status", err);
			response.writeHead(400);
			response.end(JSON.stringify({
				"status": "error",
				"message": "Error checking status: " + err.message
			}));
			return;
		}
	};

}());
