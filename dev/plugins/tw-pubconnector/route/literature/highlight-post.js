/*\
title: $:/plugins/bangyou/tw-pubconnector/route/literature/highlight-post.js
type: application/javascript
module-type: route

POST /^\/literature\/highlight\/(.+)$/

Persist highlights for a literature tiddler.
Request body must be a JSON array of highlight objects.
Each highlight is validated and sanitised before writing.

Highlight object schema:
  {
    "id":    string,
    "start": number,  // absolute character offset in document.body
    "end":   number,
    "text":  string,  // the highlighted text (for reference)
    "color": string,  // CSS hex colour, e.g. "#fef08a"
    "note":  string   // optional annotation
  }

\*/
(function () {
    /*jslint node: true, browser: true */
    /*global $tw: false */
    "use strict";

    if (!$tw.node) return;

    var fs   = require("fs");
    var path = require("path");

    exports.method    = "POST";
    exports.platforms = ["node"];
    exports.path      = /^\/literature\/highlight\/(.+)$/;

    var HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

    exports.handler = function (request, response, state) {
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

        var body;
        try {
            body = JSON.parse(state.data);
        } catch (e) {
            response.writeHead(400, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ error: "Invalid JSON body" }));
            return;
        }

        if (!Array.isArray(body)) {
            response.writeHead(400, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ error: "Body must be a JSON array" }));
            return;
        }

        // Sanitise each highlight entry
        var sanitised = body
            .map(function (h) {
                return {
                    id:    String(h.id    || "").slice(0, 64),
                    start: parseInt(h.start, 10),
                    end:   parseInt(h.end,   10),
                    text:  String(h.text  || "").slice(0, 4000),
                    color: HEX_COLOR_RE.test(h.color) ? h.color : "#fef08a",
                    note:  String(h.note  || "").slice(0, 10000)
                };
            })
            .filter(function (h) {
                return h.id &&
                       !isNaN(h.start) && h.start >= 0 &&
                       !isNaN(h.end)   && h.end > h.start;
            });

        var pathLiterature = ($tw.wiki.getTiddler("$:/config/tw-pubconnector/path/literature/html") || {}).fields &&
                             ($tw.wiki.getTiddler("$:/config/tw-pubconnector/path/literature/html") || {}).fields.text ||
                             "literature";
        var highlightsDir  = path.resolve($tw.boot.wikiTiddlersPath, "../files", pathLiterature, "highlights");

        fs.mkdir(highlightsDir, { recursive: true }, function (mkdirErr) {
            if (mkdirErr) {
                response.writeHead(500, { "Content-Type": "application/json" });
                response.end(JSON.stringify({ error: "Could not create highlights directory" }));
                return;
            }

            var highlightFile = path.join(highlightsDir, tiddlerName + ".json");
            fs.writeFile(highlightFile, JSON.stringify(sanitised, null, 2), "utf8", function (writeErr) {
                if (writeErr) {
                    response.writeHead(500, { "Content-Type": "application/json" });
                    response.end(JSON.stringify({ error: "Could not write highlights file" }));
                    return;
                }
                response.writeHead(200, { "Content-Type": "application/json" });
                response.end(JSON.stringify({ ok: true, count: sanitised.length }));
            });
        });
    };

}());
