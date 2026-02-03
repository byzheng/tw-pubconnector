/*\
title: $:/plugins/bangyou/tw-pubconnector/utils/openalex.js
type: application/javascript
module-type: library

OpenAlex API utility for TiddlyWiki with timestamped caching

\*/

(function (exports) {
    'use strict';
    if (!$tw.node) {
        return;
    }
    const fetch = require('node-fetch');

    // use cache


    
    const openalex_daily_request_count_key = "__openalex_daily_request_count";
    const platform_field = "openalex"; // Field in tiddler that contains the ORCID ID
    const cacheHelper = require('$:/plugins/bangyou/tw-pubconnector/api/cachehelper.js').cacheHelper('openalex', 9999999);


    function OpenAlex(host = "https://api.openalex.org/") {
        const this_host = host.replace(/\/+$/, "");
        const BATCH_SIZE = 50;

        function isEnabled() {
            let tiddler = $tw.wiki.getTiddler("$:/config/tw-pubconnector/authoring/openalex/enable");
            if (!tiddler) {
                return true; // default to enabled ("yes")
            }
            return tiddler && tiddler.fields.text === "enable";
        }
        function getOpenAlexDailyLimit() {
            if (typeof $tw !== "undefined" && $tw.wiki) {
                const limitText = $tw.wiki.getTiddlerText("$:/config/tw-pubconnector/authoring/openalex/daily-limit", "").trim();
                const limit = parseInt(limitText, 10);
                return isNaN(limit) ? 10000 : limit;
            }
            return 10000;
        }

        function getDailyRequestCount() {
            const today = new Date().toISOString().slice(0, 10);
            let countObj = cacheHelper.getCacheByKey(openalex_daily_request_count_key);
            if (!countObj || !countObj.item || countObj.item.day !== today) {
                countObj = { count: 0, day: today };
                cacheHelper.addEntry(openalex_daily_request_count_key, countObj, undefined, false);
                return 0;
            }
            return typeof countObj.item.count === "number" ? countObj.item.count : 0;
        }

        async function getAllPaginatedResults(path, baseQuery = {}, options = {}) {
            const { 
                perPage = 200, 
                maxPages = null, 
                delay = 500,
                logProgress = true 
            } = options;
            
            let allResults = [];
            let page = 1;
            let totalCount = 0;
            let hasMorePages = true;

            if (logProgress) {
                console.log(`Starting paginated request to ${path}...`);
            }

            while (hasMorePages && (maxPages === null || page <= maxPages)) {
                const query = {
                    ...baseQuery,
                    per_page: perPage,
                    page: page
                };

                const url = buildOpenAlexApiUrl(path, query);

                if (logProgress) {
                    console.log(`Fetching page ${page} with ${perPage} items per page...`);
                }
                
                try {
                    const data = await openalexRequest(url);
                    
                    if (data && Array.isArray(data.results)) {
                        allResults.push(...data.results);
                        
                        // Get total count from first page
                        if (page === 1 && data.meta) {
                            totalCount = data.meta.count;
                            if (logProgress) {
                                console.log(`Total items available: ${totalCount}`);
                            }
                        }
                        
                        // Check if we have more pages using meta.count
                        hasMorePages = allResults.length < totalCount;
                        
                        if (logProgress) {
                            console.log(`Retrieved ${data.results.length} items from page ${page}. Total so far: ${allResults.length}${totalCount > 0 ? `/${totalCount}` : ''}`);
                        }
                        
                        if (hasMorePages) {
                            page++;
                            // Add delay between requests to be respectful to the API
                            if (delay > 0) {
                                await new Promise(resolve => setTimeout(resolve, delay));
                            }
                        }
                    } else {
                        if (logProgress) {
                            console.warn(`No results found on page ${page}`);
                        }
                        hasMorePages = false;
                    }
                } catch (error) {
                    console.error(`Error fetching page ${page}: ${error.message}`);
                    hasMorePages = false;
                }
            }

            if (logProgress) {
                console.log(`Retrieved ${allResults.length} total items from ${path}`);
            }
            return allResults;
        }

        async function getAuthorWorks(openalexId) {
            console.log(`Starting to retrieve works for OpenAlex ID: ${openalexId}`);
            
            const works = await getAllPaginatedResults('/works', {
                filter: `authorships.author.id:${openalexId}`
            });
            // Filter each work to only keep specified properties
            const filteredWorks = works.map(work => ({
                id: work.id,
                doi: work.doi,
                title: work.title,
                publication_year: work.publication_year,
                publication_date: work.publication_date,
                primary_location: work.primary_location,
                ids: work.ids,
                authorships: work.authorships?.map(authorship => ({
                    author_position: authorship.author_position,
                    author: authorship.author
                }))
            }));
            
            return filteredWorks;

        }

        async function cacheWorks(openalexId) {
            if (!isEnabled()) {
                return;
            }
            openalexId = decodeURIComponent(openalexId);
            
            if (!openalexId || openalexId.length === 0) {
                throw new Error("Invalid OpenAlex ID provided");
            }
            openalexId = extractOpenAlexId(openalexId);
            if (!openalexId || openalexId.length === 0) {
                throw new Error(`Tiddler has no valid openalex field`);
            }
            const cacheResult = cacheHelper.getCacheByKey(openalexId);
            if (cacheResult) {
                return cacheResult.item;
            }
            const works = await getAuthorWorks(openalexId);
            console.log(`Caching ${works.length} works for OpenAlex ID: ${openalexId}`);
            await cacheHelper.addEntry(openalexId, works);
            return works;
        }


        function extractOpenAlexId(url) {
            if (typeof url !== "string") return null;
            url = url.toLowerCase();
            // Handle filter URL format: openalex.org/works?filter=authorships.author.id:
            if (url.includes('openalex.org/works?filter=authorships.author.id:')) {
                const match = url.match(/authorships\.author\.id:(a\d+)/i);
                return match ? match[1] : null;
            }
            
            // Handle direct OpenAlex URLs with author IDs (A) or work IDs (W)
            const match = url.match(/openalex\.org\/([aw]\d+)/i);
            return match ? match[1] : null;
        }

        function buildOpenAlexApiUrl(path, query = {}) {
            const normalizedPath = path.startsWith("/") ? path : `/${path}`;
            const queryString = Object.keys(query)
                .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(query[key]))
                .join('&');
            return `${this_host}${normalizedPath}${queryString ? `?${queryString}` : ""}`;
        }

        async function openalexRequest(url) {
            const currentCount = getDailyRequestCount();
            const openalex_daily_limit = getOpenAlexDailyLimit();
            if (currentCount >= openalex_daily_limit) {
                throw new Error(`Daily request limit of ${openalex_daily_limit} for OpenAlex API has been reached.`);
            }
            const headers = {
                "Accept": "application/json"
            };
            const response = await fetch(url, { headers });
            const today = new Date().toISOString().slice(0, 10);
            const countObj = { count: currentCount + 1, day: today };
            //console.log(`OpenAlex API request count for today (${today}): ${countObj.count}`);
            cacheHelper.addEntry(openalex_daily_request_count_key, countObj, undefined, false);
            await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        }
        function getFromCache(openalexId, doi) {
            return cacheHelper.getCacheByKey([openalexId, doi]);
        }

        async function works_doi(doi) {
            doi = decodeURIComponent(doi);
            if (!/^https:\/\/doi\.org\//.test(doi)) {
                doi = `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}`;
            }
            const cacheResult = getFromCache(null, doi);
            if (cacheResult) {
                return cacheResult;
            }

            const url = buildOpenAlexApiUrl(`/works/${encodeURIComponent(doi)}`);
            const result = await openalexRequest(url);
            const openalexId = result.id;
            // Update cache with timestamp
            cacheHelper.addEntry([openalexId, result.doi], result);
            return result;
        }

        async function cites(doi) {
            var results = [];
            const workData = await works_doi(doi);
            if (!workData) {
                console.warn(`No work data found for DOI: ${doi}`);
                return results;
            }
            const openalexId = extractOpenAlexId(workData.id);
            if (!openalexId) {
                console.warn(`No OpenAlex ID found for DOI: ${doi}`);
                return results;
            }
            const url = `https://api.openalex.org/works?filter=cites:${encodeURIComponent(openalexId)}`;
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    console.warn(`Failed to fetch citing works: ${response.status} ${response.statusText}`);
                    return results;
                }
                const data = await response.json();

                for (const result of data.results || []) {
                    const openalexId = result.id;
                    cacheHelper.addEntry([openalexId, result.doi], result, undefined, false);
                }
                if (data.results) {
                    results = data.results;
                }
            } catch (error) {
                console.error(`Error fetching citing works: ${error.message}`);
            }
            return results;

        }
        async function references(doi) {
            const results = [];
            const workData = await works_doi(doi);

            const ids = (workData.referenced_works || []);
            if (ids.length === 0) {
                console.warn(`No references found for DOI: ${doi}`);
                return results;
            }
            const uncachedIds = [];
            for (const id of ids) {
                const resultCache = getFromCache(id, null);
                if (resultCache) {
                    results.push(resultCache);
                } else {
                    uncachedIds.push(id);
                }
            }
            if (uncachedIds.length === 0) {
                return results;
            }
            // Helper function to divide the array into chunks of specified size
            const chunkArray = (array, size) => {
                const chunks = [];
                for (let i = 0; i < array.length; i += size) {
                    chunks.push(array.slice(i, i + size));
                }
                return chunks;
            };
            // Divide the IDs into batches
            const batches = chunkArray(uncachedIds, BATCH_SIZE);
            for (const batch of batches) {
                // Construct the filter parameter with pipe-separated IDs
                const filterParam = batch.join('|');
                const url = `https://api.openalex.org/works?filter=openalex:${encodeURIComponent(filterParam)}`;
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        console.warn(`Failed to fetch batch: ${response.status} ${response.statusText}`);
                        continue;
                    }

                    const data = await response.json();
                    for (const result of data.results || []) {
                        const openalexId = result.id;
                        cacheHelper.addEntry([openalexId, result.doi], result, undefined, false);
                    }
                    if (data.results) {
                        results.push(...data.results);
                    }
                } catch (error) {
                    console.error(`Error fetching batch: ${error.message}`);
                }
            }

            return results;
        }

        function getWorks(openalexId) {
            if (!isEnabled()) {
                return [];
            }
            if (!openalexId) {
                throw new Error("Invalid OpenAlex ID");
            }
            openalexId = extractOpenAlexId(openalexId);
            if (!openalexId) {
                throw new Error("Invalid OpenAlex ID format");
            }
            const cached = cacheHelper.getCacheByKey(openalexId);
            return cached?.item || [];
        }

        
        // Get latest works within the past 'days' days
        function getLatest(days = 90) {
            if (!isEnabled()) {
                return [];
            }
            
            const works = cacheHelper.getCaches();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            const recentWorks = [];

            for (const colleagueId in works) {
                if (colleagueId === openalex_daily_request_count_key) {
                    continue;
                }
                
                if (!Object.prototype.hasOwnProperty.call(works, colleagueId)) {
                    continue;
                }
                const colleagueWorks = works[colleagueId];
                if (!Array.isArray(colleagueWorks.item)) {
                    continue;
                }
            
                for (const work of colleagueWorks.item) {
                    if (!work || !work['publication_date']) {
                        continue;
                    }
                    const pubDate = work['publication_date'];
                    // Parse month and year from strings (e.g., "AUG 25" and "2025")
                    const workDate = new Date(pubDate);
                    
                    if (workDate < cutoffDate) {
                        continue;
                    }
                    
                    if (!work.doi || work.doi === "") {
                        continue;
                    }
                    const doi = work.doi;

                    // Extract and format authors
                    const authors = [];
                    if (work.authorships && Array.isArray(work.authorships)) {
                        work.authorships.forEach(author => {
                            authors.push({
                                given: author.author['display_name']|| "",
                                family: " ",
                                openalexId: extractOpenAlexId(author.author['id']) || undefined,
                                ORCID: author.author['orcid'] || undefined
                            });
                        });
                    }
                    recentWorks.push({
                        colleagueId: colleagueId,
                        // work: work,
                        doi: doi,
                        title: work.title ? work.title : "",
                        publicationDate: workDate,
                        platform: "OpenAlex",
                        author: authors.length > 0 ? authors : undefined,
                        'container-title': work.primary_location.source && work.primary_location.source && work.primary_location.source.display_name ? [work.primary_location.source.display_name] : undefined,
                        'reference-count': undefined,
                        'is-referenced-by-count': undefined
                    });
                }
            }

            return recentWorks;
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
            const caches = cacheHelper.getCaches();
            
            if (!caches || caches.length === 0) {
                return [];
            }
            const result = [];
            for (const key in caches) {
                if (key === openalex_daily_request_count_key) {
                    continue;
                }
                if (Object.prototype.hasOwnProperty.call(caches, key)) {
                    const cache = caches[key];
                    if (!cache.item || !Array.isArray(cache.item)) {
                        continue;
                    }
                    for (const item of cache.item) {
                        if (item && item.identifiers && item.identifiers.doi &&
                            item.identifiers.doi.toLowerCase() === doi.toLowerCase()) {
                            result.push(key);
                            break;
                        }
                    }
                }
            }
            if (result.length === 0) {
                return [];
            }
            const filter = `[tag[Colleague]search:openalex:regexp[${result.join("|")}]]`;
            const matchingTiddlers = $tw.wiki.filterTiddlers(filter);
            return matchingTiddlers;
        }

        function removeExpiredEntries() {
            cacheHelper.removeExpiredEntries();
        }
        return {
            isEnabled: isEnabled,
            cacheWorks: cacheWorks,
            getWorks: getWorks,
            getLatest: getLatest,
            getAuthorByDOI: getAuthorByDOI,
            removeExpiredEntries: removeExpiredEntries,
            references: references,
            cites: cites,
            getPlatformField: function () {
                return platform_field;
            },
        };
    }


    exports.OpenAlex = OpenAlex;
})(exports);
