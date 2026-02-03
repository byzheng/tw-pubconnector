/*\
title: $:/plugins/bangyou/tw-pubconnector/api/reading.js
type: application/javascript
module-type: library
\*/

/**
 * Reading module for TiddlyWiki, providing utilities for managing read state of literature items
 * and tracking which DOIs have been marked as read by the user.
 *
 * @module $:/plugins/bangyou/tw-pubconnector/api/reading.js
 * @type {application/javascript}
 * @library
 *
 * @returns {Object} An object containing the following methods:
 *   - markAsRead(doi): Marks a DOI as read and stores it in cache
 *   - getReadDOIs(): Retrieves list of DOIs that have been marked as read
 *   - clearReadDOIs(): Clears all read DOI records from cache
 *
 * @example
 * const reading = require('$:/plugins/bangyou/tw-pubconnector/api/reading.js').Reading();
 * reading.markAsRead("10.1038/nature12373");
 * const readDOIs = reading.getReadDOIs();
 * reading.clearReadDOIs();
 */

(function (exports) {
    'use strict';
    if (!$tw.node) {
        return;
    }

    const cacheHelper = require('$:/plugins/bangyou/tw-pubconnector/api/cachehelper.js').cacheHelper('reading', 9999999);

    function Reading() {

        function markAsRead(doi) {
            if (!doi || typeof doi !== 'string') {
                throw new Error('Invalid DOI parameter');
            }
            
            try {
                // Clean the DOI
                const cleanDoi = doi.replace('https://doi.org/', '').replace('http://doi.org/', '');
                
                // Get current read DOIs
                const readDOIs = getReadDOIs();
                // Add new DOI if not already present
                if (!readDOIs.includes(cleanDoi)) {
                    readDOIs.push(cleanDoi);
                    
                    // Save back to cache with timestamp
                    const readData = {
                        dois: readDOIs,
                        lastUpdated: new Date().toISOString()
                    };
                    cacheHelper.addEntry('read-literature', readData);
                }
                
                return true;
            } catch (error) {
                console.error('Error marking DOI as read:', error);
                throw error;
            }
        }

        function getReadDOIs() {
            try {
                const cacheData = cacheHelper.getCacheByKey('read-literature');
                if (cacheData && cacheData.item && cacheData.item.dois && Array.isArray(cacheData.item.dois)) {
                    return cacheData.item.dois;
                }
                return [];
            } catch (error) {
                console.warn('Error loading read DOIs cache:', error);
                return [];
            }
        }

        function clearReadDOIs() {
            try {
                cacheHelper.removeCache('read-literature');
                return true;
            } catch (error) {
                console.error('Error clearing read DOIs cache:', error);
                throw error;
            }
        }

        return {
            markAsRead: markAsRead,
            getReadDOIs: getReadDOIs,
            clearReadDOIs: clearReadDOIs
        };
    }

    exports.Reading = Reading;
})(exports);
