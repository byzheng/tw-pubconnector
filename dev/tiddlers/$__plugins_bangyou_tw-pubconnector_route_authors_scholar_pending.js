/*\
title: $:/plugins/bangyou/tw-pubconnector/route/authors/scholar/pending.js
type: application/javascript
module-type: route

GET /authoring/scholar/status
Returns list of pending scholar IDs for external agents to fetch.
\*/
exports.method = "GET";

exports.path = /^\/authors\/scholar\/pending$/;

exports.handler = function(request, response, state) {
    const scholar = require("$:/plugins/bangyou/tw-pubconnector/api/scholar.js").Scholar();
    if (!scholar.isEnabled()) {
        response.writeHead(403, {"Content-Type": "application/json"});
        response.end(JSON.stringify({
            status: "error",
            code: 403,
            message: "Google Scholar module not enabled."
        }));
        return;
    }

    const status = scholar.getStatus();

    response.writeHead(200, {"Content-Type": "application/json"});
    response.end(JSON.stringify({
        status: "success",
        data: status
    }));
};

