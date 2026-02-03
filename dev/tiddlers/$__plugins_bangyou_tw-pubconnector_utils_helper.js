/*\
title: $:/plugins/bangyou/tw-pubconnector/utils/helper.js
type: application/javascript
module-type: library
Helper functions

\*/


'use strict';

(function (exports) {
    'use strict';

    // use cache


    function Helper() {
        function extractDOIs(text) {
            const doiPattern = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi;
            const matches = text.match(doiPattern) || [];
            // Remove trailing .pdf if present
            //console.log(matches)
            const cleaned = matches.map(doi => doi.replace(/([/.]?(full\.pdf|pdf|full|abstract|meta))$/i, ''));
            return [...new Set(cleaned)];
        }
        return {
            extractDOIs: extractDOIs
        };

    }


    exports.Helper = Helper;
})(exports);



