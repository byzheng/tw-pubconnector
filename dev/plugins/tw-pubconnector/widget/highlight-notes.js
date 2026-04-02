/*\
title: $:/plugins/bangyou/tw-pubconnector/widget/highlight-notes.js
type: application/javascript
module-type: widget
Highlight notes widget for TiddlyWiki

\*/

'use strict';

(function () {

    /*jslint node: true, browser: true */
    /*global $tw: false */
    "use strict";

    var Widget = require("$:/core/modules/widgets/widget.js").widget;

    var COLORS = [
        { name: "Note", value: "#fef08a" },
        { name: "Evidence", value: "#bbf7d0" },
        { name: "Idea", value: "#bae6fd" },
        { name: "Critique", value: "#fecdd3" },
        { name: "Action", value: "#fed7aa" }
    ];

    var HighlightNotesWidget = function (parseTreeNode, options) {
        this.initialise(parseTreeNode, options);
    };

    HighlightNotesWidget.prototype = new Widget();

    function getColorInfo(colorValue) {
        var fallback = COLORS[0];
        var normalized = (colorValue || "").toLowerCase();
        for (var i = 0; i < COLORS.length; i++) {
            if (COLORS[i].value.toLowerCase() === normalized) {
                return COLORS[i];
            }
        }
        return fallback;
    }

    function clearNode(node) {
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }

    function createMessage(text) {
        var message = document.createElement("div");
        message.textContent = text;
        message.style.color = "#64748b";
        message.style.fontStyle = "italic";
        return message;
    }

    function createField(label, value, isExact, accentColor) {
        var field = document.createElement("div");
        field.style.display = "grid";
        field.style.gap = "4px";

        var fieldLabel = document.createElement("div");
        fieldLabel.textContent = label;
        fieldLabel.style.fontSize = "0.75rem";
        fieldLabel.style.fontWeight = "600";
        fieldLabel.style.letterSpacing = "0.04em";
        fieldLabel.style.textTransform = "uppercase";
        fieldLabel.style.color = "#475569";
        field.appendChild(fieldLabel);

        var fieldValue = document.createElement("div");
        fieldValue.textContent = value || "";
        fieldValue.style.whiteSpace = "pre-wrap";
        fieldValue.style.wordBreak = "break-word";
        fieldValue.style.color = "#0f172a";
        fieldValue.style.fontSize = "0.95rem";
        if (isExact) {
            fieldValue.style.padding = "10px 12px";
            fieldValue.style.borderRadius = "10px";
            fieldValue.style.backgroundColor = accentColor;
            fieldValue.style.boxShadow = "inset 0 0 0 1px rgba(15,23,42,0.08)";
        }
        field.appendChild(fieldValue);

        return field;
    }

    function createNoteBox(value) {
        var box = document.createElement("div");
        box.textContent = value || "";
        box.style.padding = "12px 14px";
        box.style.borderRadius = "10px";
        box.style.backgroundColor = "#f8fafc";
        box.style.boxShadow = "inset 0 0 0 1px rgba(148,163,184,0.22)";
        box.style.whiteSpace = "pre-wrap";
        box.style.wordBreak = "break-word";
        box.style.color = "#0f172a";
        box.style.fontSize = "0.95rem";
        box.style.lineHeight = "1.6";
        return box;
    }

    function createArticleLink(tiddlerTitle) {
        var link = document.createElement("a");
        link.href = "/literature/article/" + encodeURIComponent(tiddlerTitle);
        link.target = "_blank";
        link.textContent = "Open Full Article";

        return link;
    }

    function createExcerpt(anchor, fallbackText, accentColor) {
        var excerpt = document.createElement("div");
        excerpt.style.display = "grid";
        excerpt.style.gap = "4px";

        var label = document.createElement("div");
        label.textContent = "Excerpt";
        label.style.fontSize = "0.75rem";
        label.style.fontWeight = "600";
        label.style.letterSpacing = "0.04em";
        label.style.textTransform = "uppercase";
        label.style.color = "#475569";
        excerpt.appendChild(label);

        var content = document.createElement("div");
        content.style.whiteSpace = "pre-wrap";
        content.style.wordBreak = "break-word";
        content.style.color = "#0f172a";
        content.style.fontSize = "0.95rem";
        content.style.lineHeight = "1.6";

        var prefix = document.createTextNode("..." + (anchor.prefix || ""));
        content.appendChild(prefix);

        var exact = document.createElement("span");
        exact.textContent = anchor.exact || fallbackText || "";
        exact.style.backgroundColor = accentColor;
        exact.style.borderRadius = "6px";
        exact.style.padding = "0";
        exact.style.boxShadow = "inset 0 0 0 1px rgba(15,23,42,0.08)";
        content.appendChild(exact);

        var suffix = document.createTextNode((anchor.suffix || "") + "...");
        content.appendChild(suffix);

        excerpt.appendChild(content);
        return excerpt;
    }

    function createNoteCard(noteItem) {
        var colorInfo = getColorInfo(noteItem.color);
        var anchor = noteItem.anchor || {};

        var card = document.createElement("article");
        card.style.display = "grid";
        card.style.gap = "14px";
        card.style.padding = "16px";
        card.style.borderRadius = "14px";
        card.style.border = "1px solid rgba(148,163,184,0.28)";
        card.style.borderLeft = "8px solid " + colorInfo.value;
        card.style.background = "#ffffff";
        card.style.boxShadow = "0 8px 20px rgba(15,23,42,0.05)";

        var header = document.createElement("div");
        header.style.display = "flex";
        header.style.alignItems = "center";
        header.style.justifyContent = "space-between";
        header.style.gap = "12px";
        header.style.flexWrap = "wrap";

        var badge = document.createElement("span");
        badge.textContent = colorInfo.name;
        badge.style.display = "inline-flex";
        badge.style.alignItems = "center";
        badge.style.padding = "4px 10px";
        badge.style.borderRadius = "999px";
        badge.style.fontSize = "0.78rem";
        badge.style.fontWeight = "700";
        badge.style.color = "#1e293b";
        badge.style.backgroundColor = colorInfo.value;
        header.appendChild(badge);

        card.appendChild(header);
        card.appendChild(createNoteBox(noteItem.note || ""));
        card.appendChild(createExcerpt(anchor, noteItem.text || "", colorInfo.value));

        return card;
    }

    function renderNotes(listDom, tiddlerTitle, emptyMessage) {
        clearNode(listDom);
        listDom.appendChild(createMessage("Loading highlight notes..."));

        fetch("/literature/highlight/" + encodeURIComponent(tiddlerTitle))
            .then(function (response) {
                if (!response.ok) {
                    listDom.innerHTML = "Error fetching highlight notes: " + response.statusText;
                    return Promise.reject();
                }
                return response.json();
            })
            .then(function (results) {
                clearNode(listDom);

                var items = Array.isArray(results) ? results.filter(function (item) {
                    return item && item.note;
                }) : [];

                if (!items.length) {
                    listDom.appendChild(createMessage(emptyMessage));
                    return;
                }

                for (var i = 0; i < items.length; i++) {
                    listDom.appendChild(createNoteCard(items[i]));
                }
            })
            .catch(function (err) {
                if (err) {
                    listDom.innerHTML = "Exception fetching highlight notes: " + err.message;
                }
            });
    }

    HighlightNotesWidget.prototype.render = function (parent, nextSibling) {
        this.parentDomNode = parent;
        this.computeAttributes();

        var containerDom = document.createElement("div");
        containerDom.className = "tw-pubconnector-highlight-notes";
        containerDom.style.display = "grid";
        containerDom.style.gap = "16px";
        containerDom.style.margin = "12px 0";
        parent.insertBefore(containerDom, nextSibling);
        this.domNodes.push(containerDom);

        var tiddlerTitle = this.getAttribute("tiddler") || this.getVariable("currentTiddler");
        var emptyMessage = this.getAttribute("emptyMessage") || "No highlight notes found.";

        if (!tiddlerTitle) {
            containerDom.innerHTML = "HighlightNotesWidget: No tiddler title provided";
            return;
        }

        if (!$tw.wiki.tiddlerExists(tiddlerTitle)) {
            containerDom.innerHTML = "HighlightNotesWidget: Tiddler '" + tiddlerTitle + "' does not exist";
            return;
        }

        var listDom = document.createElement("div");
        listDom.style.display = "grid";
        listDom.style.gap = "16px";

        containerDom.appendChild(createArticleLink(tiddlerTitle));
        containerDom.appendChild(listDom);
        renderNotes(listDom, tiddlerTitle, emptyMessage);
    };

    HighlightNotesWidget.prototype.refresh = function (changedTiddlers) {
        var changedAttributes = this.computeAttributes();
        if (changedAttributes.tiddler || changedAttributes.emptyMessage) {
            this.refreshSelf();
            return true;
        }

        var currentTiddler = this.getAttribute("tiddler") || this.getVariable("currentTiddler");
        if (currentTiddler && changedTiddlers[currentTiddler]) {
            this.refreshSelf();
            return true;
        }

        return false;
    };

    exports["highlight-notes"] = HighlightNotesWidget;

})();