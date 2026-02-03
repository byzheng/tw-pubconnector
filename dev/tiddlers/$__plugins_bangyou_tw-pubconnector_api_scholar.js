/*\
title: $:/plugins/bangyou/tw-pubconnector/utils/scholar.js
type: application/javascript
module-type: library

Google Scholar utility for TiddlyWiki (via external Chrome extension)
\*/
(function (exports) {
    'use strict';
    if (!$tw.node) return;

    const cacheHelper = require('$:/plugins/bangyou/tw-pubconnector/api/cachehelper.js').cacheHelper("scholar", 9999999);
    const crossref = require('$:/plugins/bangyou/tw-pubconnector/api/crossref.js').Crossref();
    const platform_field = "google-scholar"; // This should be a Google Scholar ID or URL

    // Keys to track
    const pendingKey = "__scholar_pending_status";

    function Scholar() {
        function extractUserFromUrl(urlOrId) {
            if (typeof urlOrId !== "string") return null;
            // If it's just an ID (alphanumeric, _, or -), return as is
            if (/^[a-zA-Z0-9_-]+$/.test(urlOrId)) {
                return urlOrId;
            }
            // Otherwise, try to extract from a Google Scholar URL
            let match = urlOrId.match(/[?&]user=([a-zA-Z0-9_-]+)/);
            if (!match) {
                return null;
            }
            if (match[1] === "http" || match[1] === "https") {
                return null;
            }
            return match[1];
        }
        function isEnabled() {
            let tiddler = $tw.wiki.getTiddler("$:/config/tw-pubconnector/authoring/scholar/enable");
            if (!tiddler) {
                return false; // default to disabled
            }
            return tiddler && tiddler.fields.text === "enable";
        }

        function getPending() {
            const pending = cacheHelper.getCacheByKey(pendingKey);
            return pending?.item || [];
        }

        function addPending(id) {
            if (!isEnabled()) {
                return;
            }
            if (!id) {
                throw new Error("Invalid ID");
            }
            id = extractUserFromUrl(id);
            if (!id) {
                throw new Error("Invalid ID format");
            }
            const current = getPending();
            if (!current.includes(id)) {
                current.push(id);
                cacheHelper.addEntry(pendingKey, current);
            }
        }
        function clearAllPending() {
            if (!isEnabled()) {
                return;
            }
            cacheHelper.addEntry(pendingKey, []);
        }
        function clearPending(id) {
            if (!isEnabled()) {
                return;
            }
            if (!id) {
                throw new Error("Invalid ID");
            }
            id = extractUserFromUrl(id);
            if (!id) {
                throw new Error("Invalid ID format");
            }
            let current = getPending();
            current = current.filter(entry => entry !== id);
            cacheHelper.addEntry(pendingKey, current);
        }

        function getStatus() {
            return {
                pending: getPending()
            };
        }

        function incrementCheckHits(old) {
            if (old === undefined) {
                return 1;
            } 
            return old + 1;
        }

        function shouldSkipDOILookup(workItem, maxHits = 10) {
            return workItem['check-hits'] !== undefined && workItem['check-hits'] >= maxHits;
        }
        
        function getWorkByCites(cites) {
            if (!cites) {
                return;
            }
            
            const caches = cacheHelper.getCaches();
            if (!caches || Object.keys(caches).length === 0) {
                return;
            }
            for (const authorId in caches) {
                if (authorId === pendingKey) {
                    continue;
                }
                if (!Object.prototype.hasOwnProperty.call(caches, authorId)) {
                    continue;
                }
                
                const cache = caches[authorId];
                if (!cache.item || !Array.isArray(cache.item)) {
                    continue;
                }
                
                
                // Find works with matching cites value
                for (const work of cache.item) {
                    if (work && work.cites === cites) {
                        return work;
                    }
                }
            }
        }
        async function cacheWorks(id) {
            
            if (!isEnabled()) {
                return Promise.resolve();
            }
            if (!id) {
                throw new Error("Invalid ID");
            }
            id = extractUserFromUrl(id);
            if (!id) {
                throw new Error("Invalid ID format");
            }
            // console.log("Adding pending for ID:", id);
            const cached = getWorks(id);
            // Get today's date in YYYY-MM-DD format
            if (cached &&
                Array.isArray(cached) && 
                cached.length > 0) {
                console.log("Cached works found, skipping adding pending for ID:", id);
                return;
            }
            // console.log("No cached works found, proceeding to add pending for ID:", id);
            addPending(id);
            return;
        }
        async function performCacheWorks(id, works) {
            if (!isEnabled()) {
                return Promise.resolve();
            }
            if (!id) {
                throw new Error("Invalid ID");
            }
            id = extractUserFromUrl(id);
            if (!id) {
                throw new Error("Invalid ID format");
            }
            
            if (!works || !Array.isArray(works)) {
                throw new Error("Invalid works array");
            }

            const today = new Date().toISOString().split('T')[0];
            const cached = getWorks(id);
            // Clear pending status at the start
            clearPending(id);
            // Get cached works for this ID
            for (let i = 0; i < works.length; i++) {
                let work = works[i];
                if (!work) {
                    continue;
                }
                if (!work.year) {
                    continue;
                }
                if (parseInt(work.year) < 2025) {
                    continue;
                }
                // Only search for cached match if work has identifying fields
                let cachedMatch = null;
                if (work.cites) {
                    cachedMatch = getWorkByCites(work.cites);
                }
                if (work.cites || work.title || !cachedMatch) {
                    cachedMatch = cached && Array.isArray(cached) 
                        ? cached.find(cachedItem => {
                            if (!cachedItem) return false;
                            
                            // Match on cites if both have it
                            if (work.cites && cachedItem.cites) {
                                return cachedItem.cites === work.cites;
                            }
                            
                            // Otherwise match on combination of other fields
                            return cachedItem.title === work.title &&
                                    cachedItem.author === work.author &&
                                    cachedItem.publisher === work.publisher &&
                                    cachedItem.year === work.year;
                        })
                        : null;
                }
                // Assign access date
                if (cachedMatch && cachedMatch['access-date']) {
                    work['access-date'] = cachedMatch['access-date'];
                } else if (work.year) {
                    // Use work.year with January 1st
                    work['access-date'] = `${work.year}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
                } else {
                    work['access-date'] = today;
                }
                if (cachedMatch && cachedMatch['doi'] && cachedMatch['doi-similarity'] &&
                    cachedMatch['publicationDate']) {
                    Object.assign(work, JSON.parse(JSON.stringify(cachedMatch)));
                    console.log('Using cached meta data for:', work.title);
                } else if (cachedMatch && shouldSkipDOILookup(cachedMatch)) {
                    console.log('Skipping DOI lookup after max hits for:', work.title);
                } else {
                    // DOI lookup is async, wait for it to complete
                    let workCF = await crossref.findDOI(work.title, work.author, work.publisher);
                    work['check-hits'] = incrementCheckHits(cachedMatch?.['check-hits'] || work['check-hits'] || 0);
                    console.log("Check hits:", work["check-hits"])
                    if (!workCF || !workCF.doi) {
                        // Cache progress even if DOI lookup fails
                        cacheHelper.addEntry(id, works, Date.now(), false);
                        continue;
                    }
                    work['doi'] = workCF.doi;
                    work['doi-similarity'] = workCF.similarity;
                    // Get additional metadata from CrossRef
                    const workCF2 = await crossref.getWorksByDOI(work.doi, true);
                        
                    if (!workCF2 || !workCF2.message) {
                        // Cache progress even if metadata fetch fails
                        cacheHelper.addEntry(id, works, Date.now(), false);
                        continue;
                    }
                    
                    if (!workCF2.message.publicationDate) {
                        // Cache progress even if publication date is missing
                        cacheHelper.addEntry(id, works, Date.now(), false);
                        continue;
                    }
                    work.crossref = workCF2.message;
                    work.publicationDate = workCF2.message.publicationDate;
                }
                
                // Cache after processing each item to preserve progress
                cacheHelper.addEntry(id, works, Date.now(), false);
            }
            // Final cache update after all works processed
            cacheHelper.addEntry(id, works);
        }
        function getWorks(id) {
            if (!isEnabled()) {
                return [];
            }
            if (!id) {
                throw new Error("Invalid ID");
            }
            id = extractUserFromUrl(id);
            if (!id) {
                throw new Error("Invalid ID format");
            }
            const cached = cacheHelper.getCacheByKey(id);
            return cached?.item || [];
        }
        function removeExpiredEntries() {
            cacheHelper.removeExpiredEntries();
        }

        function getCitesByDOI(doi) {
            if (!doi || doi.length === 0) {
                throw new Error("Invalid DOI provided");
            }
            if (typeof doi !== "string") {
                throw new Error("DOI must be a string");
            }
            const filter = `[tag[bibtex-entry]search:bibtex-doi:regexp[${doi}]]`;
            const tiddlers = $tw.wiki.filterTiddlers(filter);
            if (tiddlers.length === 0) {
                return;
            } 
            if (tiddlers.length > 1) {
                return;
            }
            return tiddlers[0]['scholar-cites'];
        }
        function getAuthorByDOI(doi) {
            if (!isEnabled()) {
                return [];
            }
            if (!doi || doi.length === 0) {
                throw new Error("Invalid DOI provided");
            }
            if (typeof doi !== "string") {
                throw new Error("DOI must be a string");
            }
            const cites = getCitesByDOI(doi);
            if (!cites || cites.length === 0) {
                return [];
            }
            const caches = cacheHelper.getCaches();

            if (!caches || caches.length === 0) {
                return [];
            }
            const result = [];
            for (const key in caches) {
                if (key === pendingKey) {
                    continue;
                }
                if (Object.prototype.hasOwnProperty.call(caches, key)) {
                    const cache = caches[key];
                    if (!cache.item || !Array.isArray(cache.item)) {
                        continue;
                    }
                    if (cache.item.some(item => item && item === cites)) {
                        result.push(key);
                        continue;
                    }
                }
            }
            if (result.length === 0) {
                return [];
            }
            const filter = `[tag[Colleague]search:google-scholar:regexp[${result.join("|")}]]`;
            const matchingTiddlers = $tw.wiki.filterTiddlers(filter);
            return matchingTiddlers;
        }

        // Get latest works within the past 'days' days
        async function getLatest(days = 90) {
            if (!isEnabled()) {
                return [];
            }
            
            // Get cached map of authorId -> colleague name for fast lookup
            //const authoridToColleague = getAuthorIdToColleagueMap();
            
            const works = cacheHelper.getCaches();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            const recentWorks = [];

            for (const authorId in works) {
                if (authorId === pendingKey) {
                    continue;
                }
                
                if (!Object.prototype.hasOwnProperty.call(works, authorId)) {
                    continue;
                }
                const authorWorks = works[authorId];
                if (!Array.isArray(authorWorks.item)) {
                    continue;
                }
                for (const work of authorWorks.item) {
                    if (!work || !work.doi) {
                        continue;
                    }
                    let work2 = work.crossref
                    if (!work2) {
                        continue;
                    }
                    if (!work2.publicationDate) {
                        continue;
                    }
                    // console.log(JSON.stringify(work, null, 2));
                    const workDate = work2.publicationDate instanceof Date 
                        ? work2.publicationDate 
                        : new Date(work2.publicationDate);
                    if (!workDate) {
                        continue;
                    }
                    if (isNaN(workDate.getTime()) || workDate < cutoffDate) {
                        continue;
                    }
                    work2.platform = "Google Scholar";
                    recentWorks.push(work2);
                }
            }
            
            console.log("Recent works from Google Scholar:", recentWorks.length);
            return recentWorks;
        }

        return {
            isEnabled,
            getStatus,
            clearAllPending,
            cacheWorks,
            performCacheWorks,
            getWorks,
            addPending,
            getAuthorByDOI,
            getLatest,
            getPlatformField: () => platform_field,
            removeExpiredEntries: removeExpiredEntries
        };
    }

    exports.Scholar = Scholar;
})(exports);

