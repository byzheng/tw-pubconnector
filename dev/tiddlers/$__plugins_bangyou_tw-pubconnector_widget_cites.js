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
    var literature = require("$:/plugins/bangyou/tw-pubconnector/utils/literature.js").Literature();

    var CitesWidget = function (parseTreeNode, options) {
        this.initialise(parseTreeNode, options);
    };

    /*
    Inherit from the base widget class
    */
    CitesWidget.prototype = new Widget();


    /*
    Render this widget into the DOM
    */
    CitesWidget.prototype.render = function (parent, nextSibling) {
        this.parentDomNode = parent;
        this.computeAttributes();

        var containerDom = document.createElement('div');
        containerDom.className = "tw-pubconnector-list";
        parent.insertBefore(containerDom, nextSibling);

        var tiddlerTitle = this.getAttribute("tiddler") || this.getVariable("currentTiddler");
        if (!tiddlerTitle) {
            containerDom.innerHTML = "CitesWidget: No tiddler title provided";
            return;
        }

        // Check if the tiddler exists
        if (!$tw.wiki.tiddlerExists(tiddlerTitle)) {
            containerDom.innerHTML = "CitesWidget: Tiddler '" + tiddlerTitle + "' does not exist";
            return;
        }
        // Check if the tiddler has the "bibtex-doi" field and get a valid DOI
        var tiddler = $tw.wiki.getTiddler(tiddlerTitle);
        var doi = tiddler && tiddler.fields["bibtex-doi"];
        if (!doi || typeof doi !== "string" || !/^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(doi)) {
            containerDom.innerHTML = "CitesWidget: Tiddler '" + tiddlerTitle + "' does not have a valid bibtex-doi field";
            return;
        }
        // Fetch the references using the DOI
        fetch(`/literature/cites/${encodeURIComponent(doi)}`)
            .then(response => {
                if (!response.ok) {
                    containerDom.innerHTML = "Error fetching references: " + response.statusText;
                    return Promise.reject(); // stop further processing
                }
                return response.json(); // parse the response body
            })
            .then(results => {
                var innerHTML = literature.card(results);
                containerDom.appendChild(innerHTML);
            })
            .catch(err => {
                if (err) { // only show message if not already handled
                    containerDom.innerHTML = "Exception fetching references: " + err.message;
                }
            });

    };




    exports.cites = CitesWidget;



})();
