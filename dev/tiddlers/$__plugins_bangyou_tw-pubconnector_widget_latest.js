/*\
title: $:/plugins/bangyou/tw-pubconnector/widget/reference.js
type: application/javascript
module-type: widget
Reference widget for TiddlyWiki

\*/


'use strict';


(function () {

    /*jslint node: true, browser: true */
    /*global $tw: false */
    "use strict";
    //const fs = require('fs');
    var Widget = require("$:/core/modules/widgets/widget.js").widget;

    var ReferencesWidget = function (parseTreeNode, options) {
        this.initialise(parseTreeNode, options);
    };

    var literature = require("$:/plugins/bangyou/tw-pubconnector/utils/literature.js").Literature();

    /*
    Inherit from the base widget class
    */
    ReferencesWidget.prototype = new Widget();


    /*
    Render this widget into the DOM
    */
    ReferencesWidget.prototype.render = function (parent, nextSibling) {
        this.parentDomNode = parent;
        this.computeAttributes();
        this.uuid = (Math.random() + 1).toString(36).substring(3);
        var containerDom = document.createElement('div');
        containerDom.id = this.uuid;
        parent.insertBefore(containerDom, nextSibling);

        var current_tiddler = this.getAttribute("tiddler", this.getVariable("currentTiddler"));
        
        var days = this.getAttribute("days") || 90;
        const count = this.getAttribute("count") || false;
        fetch(`/literatures/latest?days=${days}`)
            .then(response => {
                if (!response.ok) {
                    containerDom.innerHTML = "Error fetching latest literatures: " + response.statusText;
                    return Promise.reject(); // stop further processing
                }
                return response.json(); // parse the response body
            })
            .then(results => {
                var innerHTML;
                if (count) {
                    const countDiv = document.createElement('span');
                    countDiv.textContent = results.items.length;
                    innerHTML = countDiv;
                } else {
                    innerHTML = literature.cardFromDOIs(results.items, current_tiddler);
                }
                if (innerHTML) {
                    containerDom.appendChild(innerHTML);
                }
            })
            .catch(err => {
                if (err) { // only show message if not already handled
                    containerDom.innerHTML = "Exception fetching latest literatures: " + err.message;
                }
            });

    };

    ReferencesWidget.prototype.refresh = function (changedTiddlers) {

        // Go through changedTiddlers to check if any has tag 'bibtex-entry' and is not a draft
        for (let tiddlerTitle in changedTiddlers) {
            // Skip system tiddlers
            if (tiddlerTitle.startsWith("$:/")) {
                continue;
            }
            // Skip draft tiddlers
            if (tiddlerTitle.startsWith("Draft of ")) {
                continue;
            }
            // Get the tiddler object
            let tiddler = $tw.wiki.getTiddler(tiddlerTitle);
            // If tiddler doesn't exist or has no fields, skip
            if (!tiddler || !tiddler.fields || !tiddler.fields.tags) {
                continue;
            }
            // Check if tiddler has the 'bibtex-entry' tag
            let tags = tiddler.fields.tags || "";
            let hasBibtexTag = tags.includes("bibtex-entry");
            
            if (hasBibtexTag) {
                if (this.uuid) {
                    var element = document.getElementById(this.uuid);
                    element.parentNode.removeChild(element);
                }
                this.refreshSelf();
                return true;
            }
        }
        
        return false;
    };

    exports["literatures-latest"] = ReferencesWidget;



})();
