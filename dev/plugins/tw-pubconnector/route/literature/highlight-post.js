/*\
title: $:/plugins/bangyou/tw-pubconnector/route/literature/highlight-post.js
type: application/javascript
module-type: route

POST /^\/literature\/highlight\/(.+)$/

Persist highlights for a literature tiddler.
Request body must be a JSON array of highlight objects.
Each highlight is validated and sanitised before writing.

Highlight object schema:
    Legacy offset format:
    {
        "id":    string,
        "start": number,
        "end":   number,
        "text":  string,
        "color": string,
        "note":  string
    }

    Anchor format:
    {
        "id":    string,
        "color": string,
        "note":  string,
        "anchor": {
            "exact":  string,
            "prefix": string,
            "suffix": string,
            "start":  number,
            "end":    number
        }
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

        // Sanitise each highlight entry (supports both text-anchor and legacy offset formats)
        var sanitised = body
            .map(function (h) {
                var parsedStart = parseInt(h.start, 10);
                var parsedEnd = parseInt(h.end, 10);
                var anchorStart = h.anchor ? parseInt(h.anchor.start, 10) : NaN;
                var anchorEnd = h.anchor ? parseInt(h.anchor.end, 10) : NaN;
                var entry = {
                    id:    String(h.id    || "").slice(0, 64),
                    color: HEX_COLOR_RE.test(h.color) ? h.color : "#fef08a",
                    note:  String(h.note  || "").slice(0, 10000)
                };
                if (h.anchor && typeof h.anchor.exact === 'string') {
                    // Current format: text-quote anchor
                    entry.anchor = {
                        exact:  String(h.anchor.exact  || "").slice(0, 10000),
                        prefix: String(h.anchor.prefix || "").slice(0, 256),
                        suffix: String(h.anchor.suffix || "").slice(0, 256)
                    };
                    if (isNaN(anchorStart) && !isNaN(parsedStart) && parsedStart >= 0) {
                        anchorStart = parsedStart;
                    }
                    if (isNaN(anchorEnd) && !isNaN(parsedEnd) && parsedEnd > parsedStart) {
                        anchorEnd = parsedEnd;
                    }
                    if (!isNaN(anchorStart) && anchorStart >= 0) {
                        entry.anchor.start = anchorStart;
                    }
                    if (!isNaN(anchorEnd) && anchorEnd > anchorStart) {
                        entry.anchor.end = anchorEnd;
                    }
                } else {
                    // Legacy format: absolute char offsets
                    entry.start = parsedStart;
                    entry.end   = parsedEnd;
                    entry.text  = String(h.text || "").slice(0, 4000);
                }
                return entry;
            })
            .filter(function (h) {
                if (!h.id) return false;
                if (h.anchor) {
                    if (!h.anchor.exact.length) return false;
                    if (typeof h.start === 'number' && typeof h.end === 'number') {
                        return h.start >= 0 && h.end > h.start;
                    }
                    if (typeof h.anchor.start === 'number' && typeof h.anchor.end === 'number') {
                        return h.anchor.start >= 0 && h.anchor.end > h.anchor.start;
                    }
                    return true;
                }
                return !isNaN(h.start) && h.start >= 0 && !isNaN(h.end) && h.end > h.start;
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
