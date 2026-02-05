/*\
title: $:/plugins/bangyou/tw-pubconnector/api/citationwatch.js
type: application/javascript
module-type: library

Citation Watch module for TiddlyWiki - tracks latest citations for key papers and colleagues

\*/

(function (exports) {
    'use strict';
    if (!$tw.node) {
        return;
    }

    const cacheHelper = require('$:/plugins/bangyou/tw-pubconnector/api/cachehelper.js').cacheHelper('citationwatch', 9999999);
    const helper = require('$:/plugins/bangyou/tw-pubconnector/utils/helper.js').Helper();
    const opencitations = require('$:/plugins/bangyou/tw-pubconnector/api/opencitations.js').OpenCitations();
    
    const options = {
        fromDate : null,
        rows : 20,
        platform : "opencitations"
    };
    /**
     * Citation Watch API
     * Monitors citations for papers and people tagged with "Citation Watch" (or custom tag)
     */
    function CitationWatch() {

        /**
         * Check if Citation Watch is enabled via config
         * @returns {boolean} - True if enabled
         */
        function isEnabled() {
            const tiddler = $tw.wiki.getTiddler("$:/config/tw-pubconnector/citationwatch/enable");
            if (!tiddler) {
                return false; // default to disabled
            }
            return tiddler.fields.text === "enable";
        }

        /**
         * Get the configured tag for citation watching
         * @returns {string} - Tag name (default: "Citation Watch")
         */
        function getWatchTag() {
            const tagText = $tw.wiki.getTiddlerText("$:/config/tw-pubconnector/citationwatch/tag", "Citation Watch");
            return tagText.trim();
        }

        /**
         * Get the configured scope (paper, person, or both)
         * @returns {string} - Scope value
         */
        function getScope() {
            const scopeText = $tw.wiki.getTiddlerText("$:/config/tw-pubconnector/citationwatch/scope", "both");
            return scopeText.trim();
        }

        function getWatchedPapersColleagues() {
            const tiddlersPapers = getWatchedPapers();
            console.log("Citation Watch: Watched papers:", tiddlersPapers.length);
            const tiddlersColleague = getWatchedColleagues();
            console.log("Citation Watch: Watched colleagues:", tiddlersColleague.length);
            const allTiddlers = [...new Set([...tiddlersPapers.flat(), ...tiddlersColleague.flat()])];
            return allTiddlers.map(title => {
                const tiddler = $tw.wiki.getTiddler(title);
                const doi = tiddler.fields['bibtex-doi'];
                // Clean DOI (remove https://doi.org/ prefix if present)
                const cleanDoi = doi ? helper.extractDOIs(doi) : null;
                return {
                    title: title,
                    doi: cleanDoi
                };
            }).filter(item => item.doi); // Only return items with valid DOI
        }
        /**
         * Get list of papers to watch (tiddlers with bibtex-doi and watch tag)
         * @returns {Array} - Array of objects with {title, doi}
         */
        function getWatchedPapers() {
            const watchTag = getWatchTag();
            const scope = getScope();
            
            if (scope === "colleague") {
                return []; // Only watching people, not papers
            }

            // Find tiddlers tagged with watch tag that have a DOI
            const filter = `[tag[${watchTag}]has[bibtex-doi]!has[draft.of]]`;
            const tiddlers = $tw.wiki.filterTiddlers(filter);
            return tiddlers;
        }
            

        /**
         * Get list of colleagues to watch (tiddlers with platform IDs and watch tag)
         * @returns {Array} - Array of objects with {title, orcid, scholar, openalex, etc.}
         */
        function getWatchedColleagues() {
            const watchTag = getWatchTag();
            const scope = getScope();
            
            if (scope === "paper") {
                return []; // Only watching papers, not people
            }

            // Find tiddlers tagged with both Colleague and watch tag
            const filter = `[tag[Colleague]tag[${watchTag}]!has[draft.of]]`;
            const tiddlers = $tw.wiki.filterTiddlers(filter);

            return tiddlers.map(colleague  => {
                const filter = `[tag[${colleague}]has[bibtex-doi]!has[draft.of]]`;
                const tiddler = $tw.wiki.filterTiddlers(filter);
                return tiddler;
            });
        }

        /**
         * Get latest citations for a specific paper DOI
         * Supports multiple platforms: opencitations (recommended), crossref (fallback)
         * @param {string} doi - The DOI to check
         * @param {Object} options - Options for citation retrieval
         * @param {string} options.platform - Platform to use (default: "opencitations")
         * @param {number} options.limit - Max results (default: 100)
         * @param {boolean} options.fetchAll - Fetch all pages (default: false)
         * @returns {Promise<Object>} - Citation results
         */
        async function getLatestCitationsByDOI(doi, days) {
            if (!isEnabled()) {
                throw new Error("Citation Watch is disabled");
            }
            // OpenCitations: Free, no API key required, provides direct citation data
            if (options.platform === "opencitations") {
                return await opencitations.getLatestCitationsByDOI(doi, days);
            }
            throw new Error(`Platform "${options.platform}" is not yet supported for citation watching`);
        }

        async function getLatest(days = 90) {
            const watchedItems = getWatchedPapersColleagues();
            const results = [];
            for (const item of watchedItems) {
                const doi = item.doi;
                if (!doi) {
                    continue; // Skip items without DOI
                }
                const citationData = await getLatestCitationsByDOI(doi, days);
                // Push each citation into results array
                if (!citationData || !Array.isArray(citationData)) {
                    continue;
                }
                citationData.forEach(citation => {
                        results.push({
                            doi: citation,
                            platform: "Citation Watch" 
                        });
                    });
            }
            console.log("Recent works from Citation Watch: ", results.length);
            return results;
        }
        return {
            isEnabled: isEnabled,
            getLatest: getLatest
        };
    }

    exports.CitationWatch = CitationWatch;
})(exports);
