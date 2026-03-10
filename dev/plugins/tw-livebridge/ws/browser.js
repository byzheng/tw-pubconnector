/*\
title: $:/plugins/bangyou/tw-livebridge/ws/browser.js
type: application/javascript
module-type: startup
\*/
(function () {
    "use strict";

    exports.name = "ws-client";
    exports.platforms = ["browser"];
    exports.after = ["startup"];
    exports.synchronous = true;

    exports.startup = function () {

        async function isNodeServerWiki() {
            try {
                const response = await fetch("/status", { method: "GET" });
                if (response.ok) {
                    const data = await response.json();
                    return !!data.space; // or check for other server-only properties
                }
                return false;
            } catch (err) {
                return false;
            }
        }
        if (!$tw.browser) {
            console.warn("WS client disabled: not running in browser");
            return;
        }
        const loc = window.location;
        if (loc.protocol === "file:") {
            console.warn("WS client disabled: running from local file");
            return;
        }

        // Validate hostname and port
        if (!loc.hostname) {
            console.warn("WS client disabled: hostname is empty");
            return;
        }
        let ws;
        async function initWSClient() {
            const isServer = await isNodeServerWiki();
            if (!isServer) {
                console.log("WS Client disabled: not running with Node.js server");
                return;
            }
            // Use default port 80 if loc.port is empty
            const port = loc.port ? loc.port : (loc.protocol === "https:" ? "443" : "80");

            const wsUrl = `ws://${loc.hostname}:${port}/ws`;

            if (ws && ws.readyState === WebSocket.OPEN) {
                return;
            }

            ws = new WebSocket(wsUrl);

            ws.addEventListener("open", () => {
                console.log("Connected to WS server");
            });

            ws.addEventListener("message", (event) => {
                let data;
                try {
                    data = JSON.parse(event.data);
                } catch (e) {
                    console.error("Invalid WS data", event.data);
                    return;
                }
                // console.log("WS message in browser:", data);

                if (data.type === "open-tiddler" && data.title) {
                    openTiddlerInStoryRiver(data.title, data.offset);
                }
            });

            // Reconnect logic
            let reconnectAttempts = 0;
            const maxReconnectDelay = 30000; // 3 seconds
            const MAX_RECONNECT_ATTEMPTS = 10;
            // Limit reconnect attempts to 10
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                console.error(`WS reconnect failed after ${MAX_RECONNECT_ATTEMPTS} attempts. Giving up.`);
                return;
            }
            function reconnectWS() {
                reconnectAttempts++;
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), maxReconnectDelay);
                console.warn(`WS disconnected. Reconnecting in ${delay / 1000}s...`);
                setTimeout(() => {
                    initWSClient();
                }, delay);
            }

            ws.addEventListener("close", reconnectWS);
            ws.addEventListener("error", (e) => {
                console.error("WS error:", e);
                ws.close();
            });
            // console.log($tw.rootWidget);
            $tw.rootWidget.addEventListener("tm-open-in-vscode", function (event) {
                const title = event.param;
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "edit-tiddler", title }));
                } else {
                    console.warn("WebSocket not connected");
                }
                return true; // stops bubbling
            });

            $tw.rootWidget.addEventListener("tm-open-doc", function (event) {
                const page = event.paramObject && event.paramObject.page ? event.paramObject.page : event.param;
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "open-doc", page }));
                } else {
                    console.warn("WebSocket not connected");
                }
                return true; // stops bubbling
            });
        };

        initWSClient();

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (!ws || ws.readyState === WebSocket.CLOSED) {
                    console.log("Page visible again - attempting WS reconnect");
                    initWSClient();
                }
            }
        });

    };

    // Track the current highlight timeout to prevent overlapping animations
    let highlightTimeout = null;

    async function openTiddlerInStoryRiver(title, offset) {
        // Force sync from server and wait for completion
        if ($tw.syncer) {
            $tw.syncer.syncFromServer();
            // Additional small delay to ensure rendering is complete
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        const openLinkFromInsideRiver = $tw.wiki.getTiddler("$:/config/Navigation/openLinkFromInsideRiver").fields.text;
        const openLinkFromOutsideRiver = $tw.wiki.getTiddler("$:/config/Navigation/openLinkFromOutsideRiver").fields.text;

        const story = new $tw.Story({ wiki: $tw.wiki });

        if (!$tw.wiki.tiddlerExists(title)) {
            console.warn("Tiddler does not exist:", title);
            return;
        }

        // Get the currently selected tiddler in the river
        let currentTiddler = null;
        const historyList = $tw.wiki.getTiddler("$:/HistoryList");
        if (historyList && historyList.fields && historyList.fields["current-tiddler"]) {
            currentTiddler = historyList.fields["current-tiddler"];
        }
        
        const tiddlersInStoryRiver = $tw.wiki.getTiddlerList("$:/StoryList");
        // Check if tiddler is already open in the story river or complete out of view
        if (!(tiddlersInStoryRiver.includes(title) && !isTiddlerElementOutView(title))) {
            story.addToStory(title, currentTiddler, {
                openLinkFromInsideRiver,
                openLinkFromOutsideRiver
            });
            story.addToHistory(title);
            
            // Wait for the UI to render the new tiddler
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Scroll to offset if provided (non-blocking)
        if (offset !== undefined && offset >= 0) {
            // Use setTimeout to make scroll non-blocking
            setTimeout(async () => {
                await scrollToElementByOffset(title, offset);
            }, 100);
        }

    }

    function isTiddlerElementOutView(title) {
        // Find the tiddler div in the StoryRiver by data-tiddler-title
        const selector = `div[data-tiddler-title="${title.replace(/"/g, '\\"')}"]`;
        const el = document.querySelector(selector);

        if (!el) {
            // Not even rendered
            return false;
        }

        // Check if element is within the viewport
        const rect = el.getBoundingClientRect();
        // Check if any part of the element is in the viewport
        const isCompletelyOutOfViewport = (
            rect.bottom <= 0 ||
            rect.top >= window.innerHeight ||
            rect.right <= 0 ||
            rect.left >= window.innerWidth
        );

        return isCompletelyOutOfViewport;
    }

    /**
     * Recursively find the deepest element containing the offset and track the path
     * @param {Object|Array} node - The node or array to search
     * @param {number} offset - The offset in the raw text
     * @param {Array} path - The path of parent elements
     * @returns {Object|null} Object with { element, topLevelParent } or null
     */
    function findDeepestElementWithPath(node, offset, path = []) {
        // If it's an array, search each item
        if (Array.isArray(node)) {
            for (const item of node) {
                const result = findDeepestElementWithPath(item, offset, path);
                if (result) return result;
            }
            return null;
        }

        // Must be an object with start and end
        if (!node || typeof node !== 'object' || node.start === undefined || node.end === undefined) {
            return null;
        }

        // Check if offset is within this element's range
        if (node.start <= offset && offset <= node.end) {
            // Add current node to the path
            const currentPath = [...path, node];
            
            // Check children first to find the deepest match
            if (node.children && Array.isArray(node.children)) {
                const childResult = findDeepestElementWithPath(node.children, offset, currentPath);
                if (childResult) return childResult;
            }
            
            // If no deeper child found, this is the deepest element
            // Return the element and its top-level parent (first in path)
            return {
                element: node,
                topLevelParent: currentPath[0] || node
            };
        }

        return null;
    }

    /**
     * Find the element in the parsed tree that contains the given offset
     * @param {Array} parsedTree - The parsed tree array from $tw.wiki.parseTiddler().tree
     * @param {number} offset - The offset in the raw text
     * @returns {Object|null} The matching top-level element or null if not found
     */
    function findElementByOffset(parsedTree, offset) {
        if (!parsedTree || !Array.isArray(parsedTree)) {
            return null;
        }

        // Find the deepest element containing the offset and its top-level parent
        const result = findDeepestElementWithPath(parsedTree, offset);
        
        if (result && result.topLevelParent) {
            return result.topLevelParent;
        }

        // If no exact match, find the nearest top-level element
        // This handles empty lines that aren't in the parsed tree
        let nearestElement = null;
        let minDistance = Infinity;

        for (const element of parsedTree) {
            let distance;
            if (offset < element.start) {
                // Offset is before this element
                distance = element.start - offset;
            } else if (offset > element.end) {
                // Offset is after this element
                distance = offset - element.end;
            } else {
                // Should have been caught above, but just in case
                return element;
            }

            if (distance < minDistance) {
                minDistance = distance;
                nearestElement = element;
            }
        }

        return nearestElement;
    }

    /**
     * Get all content elements from the tiddler body that correspond to parsed tree elements
     * @param {Element} bodyElement - The tiddler body DOM element
     * @returns {Array} Array of DOM elements matching parsed tree structure
     */
    function getContentElements(bodyElement) {
        const elements = [];
        
        // Check if this is a section-editor tiddler
        if (bodyElement.querySelector('.se-tc-tiddler-body')) {
            // Section-editor structure
            // Headers: header > button > h*
            const allElements = Array.from(bodyElement.querySelectorAll('header.se-sectionheader > button > h1, header.se-sectionheader > button > h2, header.se-sectionheader > button > h3, header.se-sectionheader > button > h4, header.se-sectionheader > button > h5, header.se-sectionheader > button > h6, div.se-sectionbody > div.se-section-view > p > *'));
            
            // Filter out <p style="">&nbsp;</p> elements
            const filtered = allElements.filter(el => {
                if (el.tagName === 'P' && el.innerHTML.trim() === '&nbsp;') {
                    return false;
                }
                return true;
            });
            
            elements.push(...filtered);
        } else {
            // Normal tiddler - direct children
            elements.push(...bodyElement.children);
        }
        
        return elements;
    }

    /**
     * Scroll to the HTML element that corresponds to an offset in the raw text
     * @param {string} title - The tiddler title
     * @param {number} offset - The offset in the raw text
     */
    async function scrollToElementByOffset(title, offset) {
        // Retry logic in case DOM isn't ready yet
        let attempts = 0;
        const maxAttempts = 5;
        
        while (attempts < maxAttempts) {
            // Get the tiddler's parse tree
            const parseResult = $tw.wiki.parseTiddler(title);
            if (!parseResult || !parseResult.tree) {
                console.warn("Cannot parse tiddler:", title);
                return;
            }

            const parsedTree = parseResult.tree;

            // Find the element in the parsed tree
            const element = findElementByOffset(parsedTree, offset);
            if (!element) {
                console.warn("No element found at offset:", offset);
                return;
            }

            // Find the index of this element in the parsed tree
            const elementIndex = parsedTree.indexOf(element);
            if (elementIndex === -1) {
                console.warn("Element not found in tree");
                return;
            }

            // Find the tiddler container in the DOM
            const tiddlerSelector = `div[data-tiddler-title="${title.replace(/"/g, '\\"')}"]`;
            const tiddlerContainer = document.querySelector(tiddlerSelector);

            if (!tiddlerContainer) {
                attempts++;
                if (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    continue;
                }
                console.warn("Tiddler element not found after retries:", title);
                return;
            }

            // Find the tiddler body element (support both normal and section-editor)
            let bodyElement = tiddlerContainer.querySelector('.tc-tiddler-body.tc-clearfix.tc-reveal');
            if (!bodyElement) {
                bodyElement = tiddlerContainer.querySelector('.se-tc-tiddler-body.tc-reveal');
            }
            
            if (!bodyElement) {
                attempts++;
                if (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    continue;
                }
                console.warn("Tiddler body element not found after retries");
                return;
            }

            // Get content elements that match the parsed tree structure
            const contentElements = getContentElements(bodyElement);

            // The element at the same index should correspond to the parsed tree element
            if (elementIndex < contentElements.length) {
                const targetElement = contentElements[elementIndex];
                
                // Scroll the element into view
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });

                // Clear any existing highlight timeout
                if (highlightTimeout) {
                    clearTimeout(highlightTimeout);
                    highlightTimeout = null;
                }

                // Reset any existing highlight before applying new one
                const existingHighlights = document.querySelectorAll('[data-tw-highlight="true"]');
                existingHighlights.forEach(el => {
                    el.style.backgroundColor = '';
                    el.style.transition = '';
                    el.removeAttribute('data-tw-highlight');
                });

                // Highlight the element temporarily
                targetElement.setAttribute('data-tw-highlight', 'true');
                targetElement.style.transition = 'background-color 0.5s';
                const originalBackground = targetElement.style.backgroundColor;
                targetElement.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
                
                highlightTimeout = setTimeout(() => {
                    targetElement.style.backgroundColor = originalBackground;
                    setTimeout(() => {
                        targetElement.style.transition = '';
                        targetElement.removeAttribute('data-tw-highlight');
                    }, 500);
                    highlightTimeout = null;
                }, 1000);
                
                return; // Success
            } else {
                attempts++;
                if (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    continue;
                }
                console.warn("Element index out of range:", elementIndex, "content elements count:", contentElements.length);
                return;
            }
        }
    }


})();
