/*\
title: $:/plugins/bangyou/tw-pubconnector/api/opencitations.js
type: application/javascript
module-type: library

OpenCitations API utility for TiddlyWiki
Provides free access to citation data via OpenCitations REST API

\*/

(function (exports) {
    'use strict';
    if (!$tw.node) {
        return;
    }

    const fetch = require('node-fetch');
    const { URLSearchParams } = require('url');
    
    const platform_field = "opencitations"; // Field in tiddler that contains the OpenCitations ID
    const cacheHelper = require('$:/plugins/bangyou/tw-pubconnector/api/cachehelper.js').cacheHelper('opencitations', 9999999);
    const helper = require('$:/plugins/bangyou/tw-pubconnector/utils/helper.js').Helper();
    
    // Rate limiting: OpenCitations allows generous requests
    const MIN_REQUEST_INTERVAL = 100; // 100ms = ~10 requests/sec
    const MAX_RETRIES = 3;
    const INITIAL_RETRY_DELAY = 1000;

    function OpenCitations(host = "https://api.opencitations.net/") {
        const this_host = host.replace(/\/+$/, "");
        
        // Request queue to ensure sequential processing
        let requestQueue = Promise.resolve();
        let lastRequestTime = 0;

        function isEnabled() {
            return true;
        }

        function buildOpenCitationsUrl(endpoint, doi = null, query = {}) {
            const normalizedPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
            const queryParams = new URLSearchParams();
            
            Object.keys(query).forEach(key => {
                queryParams.append(key, query[key]);
            });

            const queryString = queryParams.toString();
            return `${this_host}/index/v2${normalizedPath}${queryString ? `?${queryString}` : ""}`;
        }

        async function makeRequest(url, retryCount = 0) {
            // Enforce rate limiting
            const now = Date.now();
            const timeSinceLastRequest = now - lastRequestTime;
            if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
                const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

            lastRequestTime = Date.now();
            
            try {
                const response = await fetch(url);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    
                    // Handle rate limit errors with exponential backoff
                    if (response.status === 429 && retryCount < MAX_RETRIES) {
                        const retryDelay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
                        console.log(`OpenCitations 429 error (attempt ${retryCount + 1}/${MAX_RETRIES}): retrying after ${retryDelay}ms`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        return makeRequest(url, retryCount + 1);
                    }
                    
                    if (response.status === 404) {
                        return null; // DOI not found in OpenCitations
                    }
                    
                    console.error(`OpenCitations API Error ${response.status}: ${errorText}`);
                    throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
                }

                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    return await response.json();
                } else {
                    // Try to parse as JSON anyway
                    const text = await response.text();
                    return text ? JSON.parse(text) : null;
                }
            } catch (error) {
                if (error instanceof SyntaxError) {
                    console.error('OpenCitations API returned non-JSON response:', error);
                    return null;
                }
                throw error;
            }
        }

        async function opencitationsRequest(url, retryCount = 0) {
            // Add request to queue to ensure sequential processing
            return new Promise((resolve, reject) => {
                requestQueue = requestQueue
                    .then(() => makeRequest(url, retryCount))
                    .then(resolve)
                    .catch(reject);
            });
        }
        /**
         * Get all citations (citing papers) for a given DOI
         * @param {string} doi - The DOI to find citations for
         * @param {Object} options - Optional parameters
         * @param {number} options.limit - Maximum number of results (default: 100)
         * @param {number} options.offset - Offset for pagination (default: 0)
         * @returns {Promise<Array>} - Array of citing papers
         */
        async function getCitationByDOI(doi) {
            if (!isEnabled()) {
                throw new Error("OpenCitations API is disabled");
            }

            doi = decodeURIComponent(doi);
            const cleanDoi = helper.extractDOIs(doi);
            const cacheKey = `citations_${cleanDoi}`;

            // Check cache first
            const cached = cacheHelper.getCacheByKey(cacheKey);
            if (cached) {
                return cached.item;
            }

            const url = buildOpenCitationsUrl(`/citations/doi:${encodeURIComponent(cleanDoi)}`, null);

            console.log(`OpenCitations citations request for DOI: ${cleanDoi}`);
            
            try {
                const result = await opencitationsRequest(url);
                
                if (!result) {
                    console.warn(`No citations found for DOI: ${cleanDoi}`);
                    return [];
                }

                // Result is typically an array or object with results array
                const citationsList = Array.isArray(result) ? result : (result.results || []);

                // Cache the result
                cacheHelper.addEntry(cacheKey, citationsList);
                return citationsList;
            } catch (error) {
                console.error(`Error getting citations for ${cleanDoi}:`, error);
                return [];
            }
        }

        async function getLatestCitationsByDOI(doi, days) {
            if (!isEnabled()) {
                throw new Error("OpenCitations API is disabled");
            }
            
            doi = decodeURIComponent(doi);
            const cleanDoi = helper.extractDOIs(doi);
            
            const allCitations = await getCitationByDOI(cleanDoi);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            
            const filteredCitations = allCitations.filter(citation => {
                const citationDate = new Date(citation.creation);
                return citationDate >= cutoffDate;
            });

            // Extract DOI from citing field for each citation
            const citationsWithDoi = filteredCitations.map(citation => {
                const parsed = parseCitingField(citation.citing);
                return parsed.doi;
            });
            return citationsWithDoi;
        }

        /**
         * Parse citing field and extract all identifiers and DOI
         * @param {string} citingField - The citing field value (e.g., "omid:br/061402001255 doi:10.1038/leu.2016.153 openalex:W2413032717 pmid:27282255")
         * @returns {Object} - Object containing all identifiers and extracted DOI
         */
        function parseCitingField(citingField) {
            if (!citingField) {
                return { identifiers: [], doi: null };
            }

            const identifiers = citingField.split(/\s+/).filter(id => id.length > 0);
            let doi = null;

            // Extract DOI from identifiers
            for (const identifier of identifiers) {
                if (identifier.startsWith('doi:')) {
                    doi = identifier.replace('doi:', '');
                    break;
                }
            }

            return {
                identifiers: identifiers,
                doi: doi
            };
        }

        function removeExpiredEntries() {
            cacheHelper.removeExpiredEntries();
        }

        function getPlatformField() {
            return platform_field;
        }

        return {
            isEnabled: isEnabled,
            getCitationByDOI: getCitationByDOI,
            getLatestCitationsByDOI: getLatestCitationsByDOI,
            removeExpiredEntries: removeExpiredEntries,
            getPlatformField: getPlatformField
        };
    }

    exports.OpenCitations = OpenCitations;
})(exports);
