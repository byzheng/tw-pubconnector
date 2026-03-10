
/*\
title: $:/plugins/bangyou/tw-livebridge/widget/opendoc.js
type: application/javascript
module-type: widget
opendoc for TiddlyWiki

\*/


'use strict';

(function () {

    /*jslint node: true, browser: true */
    /*global $tw: false */
    "use strict";
    //const fs = require('fs');
    var Widget = require("$:/core/modules/widgets/widget.js").widget;

    var OpenDocWidget = function (parseTreeNode, options) {
        this.initialise(parseTreeNode, options);
    };

    /*
    Inherit from the base widget class
    */
    OpenDocWidget.prototype = new Widget();


    /*
    Render this widget into the DOM
    */
    OpenDocWidget.prototype.render = function (parent, nextSibling) {
        var self = this;
        this.parentDomNode = parent;
        this.computeAttributes();

        // Get attributes
        var page = this.getAttribute("page") || "";
        var title = this.getAttribute("title") || page;

        // Create link element
        var linkDom = document.createElement('a');
        linkDom.href = "#";
        linkDom.textContent = title;
        linkDom.className = "tw-doclink";

        // Add click handler
        linkDom.addEventListener('click', function(event) {
            event.preventDefault();
            $tw.rootWidget.dispatchEvent({
                type: "tm-open-doc",
                param: page,
                paramObject: {page: page}
            });
        });

        parent.insertBefore(linkDom, nextSibling);
        this.domNodes.push(linkDom);
    };

    OpenDocWidget.prototype.refresh = function (changedTiddlers) {
        return false;
    };

    exports["open-doc"] = OpenDocWidget;
})();
