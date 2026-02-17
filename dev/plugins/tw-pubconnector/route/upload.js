/*\
title: $:/plugins/sq/node-files-PUT-support/server-route-upload.js
type: application/javascript
module-type: route

POST /^\/files\/(.+)$/

Upload base64-encoded image files

* Based on https://github.com/saqimtiaz/tw5-file-uploads-PUT/blob/main/node-files-PUT-support/node-put-files.js
* Copyright © 2024 saqimtiaz
* Licensed under the MIT License

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const fs = require('fs');
const path = require('path');

//https://github.com/Jermolene/TiddlyWiki5/blob/master/core/modules/server/routes/put-tiddler.js


exports.method = "PUT";
exports.platforms = ["node"];
exports.path = /^\/files\/(.+)$/;
exports.bodyFormat = "stream";

exports.handler = function(request, response, state) {
	
	
	try {
		let body = Buffer.from([]);
		request.on("data", function(data) {
			body = Buffer.concat([body, data]);
			if (body.length > 1e7) {  // 10 MB limit
				response.writeHead(413, { 'Content-Type': 'text/plain' }).end();
				request.connection.destroy();
			}
		});
		
		request.on("end", function() {
			let title = state.params[0];
			try {
				title = decodeURIComponent(title);
			} catch(e) {
				console.log("Error decoding title", e);
			}

			// Convert base64 data to binary
			let base64Data = body.toString();
			// Optional: check and strip data URL prefix
			const base64Prefix = "data:image/png;base64,";
			if (base64Data.startsWith(base64Prefix)) {
				base64Data = base64Data.replace(base64Prefix, "");
			}
			const binaryData = Buffer.from(base64Data, 'base64');

			// Define the file path to save the binary data
			const filesPath = path.resolve($tw.boot.wikiTiddlersPath, "../files", title);
			$tw.utils.createDirectory(path.dirname(filesPath));

			// Write the decoded binary data to the file
			fs.writeFile(filesPath, binaryData, function(err) {
				if (err) {
					console.log("Error saving file", err);
					response.writeHead(500);
					response.end("Failed to save file");
				} else {
					console.log(`Base64 image saved: ${title}`);
					response.setHeader("Content-Type", "application/json");
					response.end(JSON.stringify({
						"status": "204",
						"title": title,
						"_canonical_uri": request.url
					}));
				}
			});
		});
	} catch (err) {
		console.log("Error parsing or writing uploaded file", err);
		response.writeHead(400);
		response.end("Error processing upload");
	}
};

}());

