/*\
title: $:/plugins/bangyou/tw-pubconnector/route/literature/highlight-get.js
type: application/javascript
module-type: route

GET /^\/literature\/highlight\/(.+)$/

Return saved highlights for a literature tiddler as a JSON array.
Returns [] when no highlights have been saved yet.

\*/
(function () {
    /*jslint node: true, browser: true */
    /*global $tw: false */
    "use strict";

    if (!$tw.node) return;

    var fs   = require("fs");
    var path = require("path");

    exports.method    = "GET";
    exports.platforms = ["node"];
    exports.path      = /^\/literature\/highlight\/(.+)$/;

    exports.handler = function (request, response) {
        var match = request.url.match(exports.path);
        if (!match) {
            response.writeHead(400, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ error: "Bad Request" }));
            return;
        }

        var tiddlerName = decodeURIComponent(match[1]);
        if (tiddlerName.indexOf("..") !== -1 ||
            tiddlerName.indexOf("/")  !== -1 ||
            tiddlerName.indexOf("\\") !== -1) {
            response.writeHead(400, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ error: "Invalid tiddler name" }));
            return;
        }

        var pathLiterature = ($tw.wiki.getTiddler("$:/config/tw-pubconnector/path/literature/html") || {}).fields && 
                             ($tw.wiki.getTiddler("$:/config/tw-pubconnector/path/literature/html") || {}).fields.text ||
                             "literature";
        var highlightsDir  = path.resolve($tw.boot.wikiTiddlersPath, "../files", pathLiterature, "highlights");
        var highlightFile  = path.join(highlightsDir, tiddlerName + ".json");

        fs.readFile(highlightFile, "utf8", function (err, data) {
            if (err) {
                // No file yet – return empty array
                response.writeHead(200, { "Content-Type": "application/json" });
                response.end("[]");
                return;
            }
            try {
                JSON.parse(data); // validate
                response.writeHead(200, { "Content-Type": "application/json" });
                response.end(data);
            } catch (e) {
                response.writeHead(200, { "Content-Type": "application/json" });
                response.end("[]");
            }
        });
    };

}());
