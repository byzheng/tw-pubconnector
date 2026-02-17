/*\
title: $:/plugins/bangyou/tw-pubconnector/route/literature/find-doi.js
type: application/javascript
module-type: route

TiddlyWiki Route: POST /^\/literature\/find-doi$/

Finds DOI based on metadata (title, author, publisher, year).

Request:
  - Method: POST
  - Path: /literature/find-doi
  - Content-Type: application/json
  - Body: 
    {
      "title": "Article title",
      "author": "Author names",
      "publisher": "Publisher/journal citation string"
    }

Response:
  - 200: DOI found successfully
  - 404: No DOI found matching the metadata
  - 400: Bad Request (missing required fields)
  - 500: Server error

Response Format:
  Success:
  {
    "status": "success",
    "code": 200,
    "message": "DOI found successfully",
    "doi": "10.1111/gcb.12003"
  }

  Not Found:
  {
    "status": "not_found",
    "code": 404,
    "message": "No DOI found for the provided metadata"
  }

  Error:
  {
    "status": "error",
    "code": 400|500,
    "message": "Error description"
  }

Usage Example:
  POST /literature/find-doi
  Content-Type: application/json
  
  {
    "title": "Breeding for the future: what are the potential impacts of future frost and heat events on sowing and flowering time requirements for Australian bread wheat (Triticum aestivium …",
    "author": "B Zheng, K Chenu, M Fernanda Dreccer, SC Chapman",
    "publisher": "Global Change Biology 18 (9), 2899-2914, 2012"
  }

Dependencies:
  - $:/plugins/bangyou/tw-pubconnector/api/crossref.js (Crossref API)

@module $:/plugins/bangyou/tw-pubconnector/route/literature/find-doi.js
@method POST
@route /^\/literature\/find-doi$/
@platforms ["node"]
@param {Object} request - HTTP request object
@param {Object} response - HTTP response object  
@param {Object} state - State object with request body data
@returns {void}

\*/
(function () {
	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";

	if (!$tw.node) {
		return;
	}

	var Crossref = require("$:/plugins/bangyou/tw-pubconnector/api/crossref.js").Crossref;

	exports.method = "POST";
	exports.platforms = ["node"];
	exports.path = /^\/literature\/find-doi$/;

	exports.handler = function (request, response, state) {
		// Parse request body
		let body;
		try {
			body = JSON.parse(state.data);
		} catch (e) {
			response.writeHead(400, { "Content-Type": "application/json" });
			response.end(JSON.stringify({
				status: "error",
				code: 400,
				message: "Bad Request: Invalid JSON in request body"
			}));
			return;
		}

		// Validate required fields
		if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
			response.writeHead(400, { "Content-Type": "application/json" });
			response.end(JSON.stringify({
				status: "error",
				code: 400,
				message: "Bad Request: 'title' field is required and must be a non-empty string"
			}));
			return;
		}

		// Optional fields
		const title = body.title.trim();
		const author = body.author ? body.author.trim() : '';
		const publisher = body.publisher ? body.publisher.trim() : '';

		// Initialize Crossref API
		const crossrefApi = Crossref();

		// Find DOI using the new function
		crossrefApi.findDOI(title, author, publisher)
			.then(data => {
				if (data && data.doi) {
					// DOI found
					response.writeHead(200, { "Content-Type": "application/json" });
					response.end(JSON.stringify({
						status: "success",
						code: 200,
						message: "DOI found successfully",
						results: data,
						metadata: {
							title: title,
							author: author || null,
							publisher: publisher || null
						}
					}));
				} else {
					// No DOI found
					response.writeHead(404, { "Content-Type": "application/json" });
					response.end(JSON.stringify({
						status: "not_found",
						code: 404,
						message: "No DOI found for the provided metadata",
						metadata: {
							title: title,
							author: author || null,
							publisher: publisher || null
						}
					}));
				}
			})
			.catch(error => {
				// Server error
				console.error("Error finding DOI:", error);
				response.writeHead(500, { "Content-Type": "application/json" });
				response.end(JSON.stringify({
					status: "error",
					code: 500,
					message: "Internal Server Error: " + error.message
				}));
			});
	};

})();

