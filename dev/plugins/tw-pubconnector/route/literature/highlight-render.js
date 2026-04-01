/*\
title: $:/plugins/bangyou/tw-pubconnector/route/literature/highlight-render.js
type: application/javascript
module-type: route

POST /literature/highlight-render
Body (JSON): { "text": "<wikitext>" }

Render a snippet of TiddlyWiki wikitext to HTML and return it.
Used by the highlight tooltip to display formatted notes.

\*/
(function () {
    /*jslint node: true, browser: true */
    /*global $tw: false */
    "use strict";

    if (!$tw.node) return;

    exports.method    = "POST";
    exports.platforms = ["node"];
    exports.path      = /^\/literature\/highlight-render$/;

    exports.handler = function (request, response, state) {
        var text;
        try {
            var parsed = JSON.parse(state.data);
            text = parsed.text;
        } catch (e) {
            response.writeHead(400, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ error: "Invalid JSON body" }));
            return;
        }

        if (typeof text !== "string") {
            response.writeHead(400, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ error: "Missing 'text' field" }));
            return;
        }

        if (text.length > 50000) {
            response.writeHead(413, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ error: "Text too long" }));
            return;
        }
        var html;
        try {
            html = $tw.wiki.renderText(
                "text/html",            // output type
                "text/vnd.tiddlywiki",  // input type
                text
            );
        } catch (e) {
            console.error("[highlight-render] renderText error:", e);
            response.writeHead(500, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ error: "Render failed" }));
            return;
        }

        response.writeHead(200, {
            "Content-Type":  "application/json",
            "Cache-Control": "no-store"
        });
        response.end(JSON.stringify({ html: html }));
    };

})();
