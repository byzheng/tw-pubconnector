/*\
title: $:/plugins/bangyou/tw-pubconnector/script/livebridge.js
type: application/javascript

Client-side WebSocket bridge injected into literature article pages.

Features:
  - Connects to the TiddlyWiki WebSocket server (same host/port)
  - Reconnects automatically on disconnect
  - Clicking any element with class "tiddlywiki-link" and attribute
    "data-tw" sends an open-tiddler command to TiddlyWiki
  - Responds to open-doc commands from the server by navigating the page

\*/
(function () {
    'use strict';

    var ws = null;
    var reconnectTimer = null;
    var reconnectAttempts = 0;
    var MAX_RECONNECT_DELAY = 30000;
    var MAX_RECONNECT_ATTEMPTS = 10;

    // Derive WS URL from current page location (same host + port)
    var loc = window.location;
    var wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    var wsUrl = wsProtocol + '//' + loc.host + '/ws';

    // -----------------------------------------------------------------
    // WebSocket connection
    // -----------------------------------------------------------------

    function connect() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        ws = new WebSocket(wsUrl);

        ws.onopen = function () {
            console.log('[livebridge] Connected to TiddlyWiki at ' + wsUrl);
            reconnectAttempts = 0;
        };

        ws.onmessage = function (event) {
            var data;
            try { data = JSON.parse(event.data); } catch (e) { return; }

            if (data.type === 'open-doc' && data.page) {
                var pageUrl = data.page;
                if (!pageUrl.endsWith('.html')) pageUrl += '.html';
                if (!pageUrl.startsWith('/'))   pageUrl  = '/' + pageUrl;
                if (window.location.pathname !== pageUrl) {
                    window.location.href = pageUrl;
                }
            }
        };

        ws.onerror = function () {
            // onclose will handle reconnection
        };

        ws.onclose = function () {
            console.log('[livebridge] Disconnected');
            scheduleReconnect();
        };
    }

    function scheduleReconnect() {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.warn('[livebridge] Max reconnect attempts reached, giving up');
            return;
        }
        reconnectAttempts++;
        var delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
        console.log('[livebridge] Reconnecting in ' + (delay / 1000) + 's…');
        reconnectTimer = setTimeout(connect, delay);
    }

    // -----------------------------------------------------------------
    // Send helpers
    // -----------------------------------------------------------------

    function sendWhenReady(message) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
            return;
        }
        // Queue on the next open event
        var origOnOpen = ws ? ws.onopen : null;
        connect();
        ws.onopen = function () {
            if (origOnOpen) origOnOpen.call(ws);
            ws.send(JSON.stringify(message));
        };
    }

    function openTiddler(title) {
        sendWhenReady({ type: 'open-tiddler', title: title });
    }

    // Expose so other scripts injected on the same page can call it
    window.twLiveBridge = { openTiddler: openTiddler };

    // -----------------------------------------------------------------
    // Init
    // -----------------------------------------------------------------

    connect();

})();
