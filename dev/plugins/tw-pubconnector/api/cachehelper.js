/*\
title: $:/plugins/bangyou/tw-pubconnector/utils/cachehelper.js
type: application/javascript
module-type: library

Caching utility for TiddlyWiki with data type-specific TTL and LRU eviction

CONFIG TIDDLER:
  Create a tiddler named: $:/config/tw-pubconnector/cache-config
  Type: application/json
  Content example:
  {
    "openalex": {
      "author-profile": { "ttl": 5184000000, "maxItems": 5000 },
      "metadata": { "ttl": 15552000000, "maxItems": 10000 },
      "cited-recent": { "ttl": 604800000, "maxItems": 5000 },
      "cited-historical": { "ttl": 15552000000, "maxItems": 10000 }
    },
    "scholar": {
      "author-works": { "ttl": 604800000, "maxItems": 2000 }
    }
  }
  
  Note: Times in milliseconds (e.g., 7 days = 604800000)
  This tiddler is optional - defaults will be used if not present

USAGE EXAMPLES:
  // Config is loaded from tiddler ($:/config/tw-pubconnector/cache-config)
  // or use defaults if tiddler doesn't exist
  const openalex = cacheHelper('openalex');
  openalex.addEntry('author-O123', data, { dataType: 'openalex.author-profile' });
  openalex.addEntry('work-W456', data, { dataType: 'openalex.metadata' });
  
  // Or override with custom config parameter
  const custom = cacheHelper('sensor', {
    'sensor-data': {
      'real-time': { ttl: 60000, maxItems: 1000 },
      'historical': { ttl: 2592000000, maxItems: 10000 }
    }
  });
  custom.addEntry('sensor-01', data, { dataType: 'sensor-data.real-time' });
  
  // Get entry (auto-updates lastAccessed and accessCount)
  const entry = openalex.getCacheByKey('author-O123');
  const item = entry.item;
  const stats = { accessCount: entry.accessCount, lastAccessed: entry.lastAccessed };

DEFAULT CONFIGURATION STRUCTURE:
  {
    crossref: {
      metadata: { ttl: 180d, maxItems: 10000 }
    },
    openalex: {
            'daily-quota': { ttl: 2d, maxItems: 100 },
      'author-profile': { ttl: 60d, maxItems: 5000 },
      metadata: { ttl: 180d, maxItems: 10000 },
      'cited-recent': { ttl: 7d, maxItems: 5000 },
      'cited-historical': { ttl: 180d, maxItems: 10000 }
    },
    scopus: {
            'daily-quota': { ttl: 2d, maxItems: 100 },
      'author-profile': { ttl: 60d, maxItems: 5000 },
      metadata: { ttl: 180d, maxItems: 10000 },
      'cited-recent': { ttl: 7d, maxItems: 5000 },
      'cited-historical': { ttl: 180d, maxItems: 10000 }
    },
    wos: {
            'daily-quota': { ttl: 2d, maxItems: 100 },
      'author-profile': { ttl: 60d, maxItems: 5000 },
      metadata: { ttl: 180d, maxItems: 10000 },
      'cited-recent': { ttl: 7d, maxItems: 5000 },
      'cited-historical': { ttl: 180d, maxItems: 10000 }
    },
    scholar: {
      'author-profile': { ttl: 60d, maxItems: 5000 },
      'author-works': { ttl: 7d, maxItems: 2000 },
      metadata: { ttl: 180d, maxItems: 10000 }
        },
        orcid: {
            'daily-quota': { ttl: 2d, maxItems: 100 },
            metadata: { ttl: 180d, maxItems: 10000 }
    }
  }

FEATURES:
  - Load config from tiddler ($:/config/tw-pubconnector/cache-config) or use defaults
  - Override with custom config parameter
  - Hierarchical config: organized by platform, then by data type
  - Differentiated TTL per data type (dot notation: 'platform.type')
  - LRU eviction: removes least-used items when type limit exceeded
  - Per-entry metadata: timestamps, access count, data type
  - Supports pagination and date range metadata

\*/

(function (exports) {
    'use strict';
    if (!$tw.node) {
        return;
    }
    const fs = require('fs');
    const path = require('path');
    const zlib = require('zlib');

    // Configuration variables
    const MIN_SAVE_INTERVAL_MS = 10000; // Minimum interval between saves in milliseconds

    // Default TTL configuration (in milliseconds) per data type/source
    // Organized hierarchically for clarity
    const DEFAULT_CONFIG = {
        crossref: {
            metadata: { ttl: 180 * 24 * 60 * 60 * 1000, maxItems: 10000 }
        },
        openalex: {
            'daily-quota': { ttl: 2 * 24 * 60 * 60 * 1000, maxItems: 100 },
            'author-profile': { ttl: 60 * 24 * 60 * 60 * 1000, maxItems: 5000 },
            metadata: { ttl: 180 * 24 * 60 * 60 * 1000, maxItems: 10000 },
            'cited-recent': { ttl: 7 * 24 * 60 * 60 * 1000, maxItems: 5000 },
            'cited-historical': { ttl: 180 * 24 * 60 * 60 * 1000, maxItems: 10000 }
        },
        scopus: {
            'daily-quota': { ttl: 2 * 24 * 60 * 60 * 1000, maxItems: 100 },
            'author-profile': { ttl: 60 * 24 * 60 * 60 * 1000, maxItems: 5000 },
            metadata: { ttl: 180 * 24 * 60 * 60 * 1000, maxItems: 10000 },
            'cited-recent': { ttl: 7 * 24 * 60 * 60 * 1000, maxItems: 5000 },
            'cited-historical': { ttl: 180 * 24 * 60 * 60 * 1000, maxItems: 10000 }
        },
        wos: {
            'daily-quota': { ttl: 2 * 24 * 60 * 60 * 1000, maxItems: 100 },
            'author-profile': { ttl: 60 * 24 * 60 * 60 * 1000, maxItems: 5000 },
            metadata: { ttl: 180 * 24 * 60 * 60 * 1000, maxItems: 10000 },
            'cited-recent': { ttl: 7 * 24 * 60 * 60 * 1000, maxItems: 5000 },
            'cited-historical': { ttl: 180 * 24 * 60 * 60 * 1000, maxItems: 10000 }
        },
        scholar: {
            'author-profile': { ttl: 60 * 24 * 60 * 60 * 1000, maxItems: 5000 },
            'author-works': { ttl: 7 * 24 * 60 * 60 * 1000, maxItems: 2000 },
            metadata: { ttl: 180 * 24 * 60 * 60 * 1000, maxItems: 10000 }
        },
        orcid: {
            'daily-quota': { ttl: 2 * 24 * 60 * 60 * 1000, maxItems: 100 },
            metadata: { ttl: 180 * 24 * 60 * 60 * 1000, maxItems: 10000 }
        },
        homepage: {
            'author-works': { ttl: 90 * 24 * 60 * 60 * 1000, maxItems: 10000 }
        },
        default: { ttl: 30 * 24 * 60 * 60 * 1000, maxItems: 5000 }
    };

    /**
     * Helper to get config value by dot notation (e.g., "openalex.author-profile")
     * Falls back to flat key lookup for backward compatibility
     */
    function getConfigValue(config, key, field) {
        const parts = key.split('.');
        
        // Try nested lookup first
        let value = config;
        for (const part of parts) {
            value = value?.[part];
            if (!value) break;
        }
        
        if (value && value[field]) {
            return value[field];
        }
        
        // Fallback to flat key lookup
        if (config[key] && config[key][field]) {
            return config[key][field];
        }
        
        // Default fallback
        return config.default[field];
    }

    // Flatten config for iteration (convert nested to flat keys with dots)
    function flattenConfig(cfg) {
        const result = {};
        for (const [key, value] of Object.entries(cfg)) {
            if (typeof value === 'object' && value.ttl === undefined) {
                // Nested structure
                for (const [subKey, subValue] of Object.entries(value)) {
                    result[`${key}.${subKey}`] = subValue;
                }
            } else {
                // Already flat
                result[key] = value;
            }
        }
        return result;
    }

    function cacheHelper(cacheName, customConfig = {}) {
        let cache = {};
        const wikiTiddlersPath = $tw.boot.wikiTiddlersPath;
        
        // Try to load config from tiddler first
        let tiddlerConfig = {};
        try {
            const configTiddler = $tw.wiki.getTiddlerText('$:/config/tw-pubconnector/cache-config', null);
            if (configTiddler) {
                tiddlerConfig = JSON.parse(configTiddler);
            }
        } catch (err) {
            console.warn('Failed to parse cache-config tiddler:', err);
        }
        
        // Merge configs: tiddler > custom > default
        let config = {};
        for (const key of Object.keys(DEFAULT_CONFIG)) {
            if (customConfig[key]) {
                if (typeof DEFAULT_CONFIG[key] === 'object' && DEFAULT_CONFIG[key].ttl === undefined) {
                    // Nested structure - merge subkeys
                    config[key] = { ...DEFAULT_CONFIG[key], ...customConfig[key] };
                } else {
                    config[key] = customConfig[key];
                }
            } else if (tiddlerConfig[key]) {
                if (typeof DEFAULT_CONFIG[key] === 'object' && DEFAULT_CONFIG[key].ttl === undefined) {
                    // Nested structure - merge subkeys
                    config[key] = { ...DEFAULT_CONFIG[key], ...tiddlerConfig[key] };
                } else {
                    config[key] = tiddlerConfig[key];
                }
            } else {
                config[key] = DEFAULT_CONFIG[key];
            }
        }
        
        const flatConfig = flattenConfig(config);
        const getMaxItems = (dataType) => getConfigValue(config, dataType, 'maxItems');
        const getTTL = (dataType) => getConfigValue(config, dataType, 'ttl');

        // Validate cacheName: only allow alphanumeric characters, underscores, and dashes
        if (!/^[\w\-]+$/.test(cacheName)) {
            throw new Error("Invalid cacheName: only alphanumeric, underscore, and dash allowed.");
        }

        // Determine the wiki root directory
        const wikiRoot = path.resolve(wikiTiddlersPath, '..');

        // Construct the cache directory path
        const cacheDir = path.join(wikiRoot, 'cache');

        // Construct the full path to the cache file
        const resolvedCacheFile = path.resolve(cacheDir, `${cacheName}-cache.json.gz`);

        // Ensure the resolved path is within the cache directory to prevent path traversal
        const normalizedCacheDir = path.normalize(cacheDir + path.sep);
        if (!resolvedCacheFile.startsWith(normalizedCacheDir)) {
            throw new Error("Invalid cacheName: path traversal detected.");
        }

        // Create the cache directory if it doesn't exist
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        const CACHE_FILE = resolvedCacheFile;
        
        if (fs.existsSync(CACHE_FILE)) {
            try {
                const compressed = fs.readFileSync(CACHE_FILE);
                const decompressed = zlib.gunzipSync(compressed);
                cache = JSON.parse(decompressed.toString('utf8'));
            } catch (err) {
                console.warn(`Failed to read or parse compressed cache file for ${cacheName}:`, err);
            }
        }

        function getExpredDays() {
            const userExpiredDays = $tw.wiki.getTiddlerText('$:/config/tw-pubconnector/authoring/expired-days', '30');
            if (!userExpiredDays || isNaN(userExpiredDays) || parseInt(userExpiredDays, 10) <= 0) {
                return 30;
            }
            // Validate that userExpiredDays is a positive integer
            if (!/^\d+$/.test(userExpiredDays)) {
                console.warn(`Invalid expired days value: ${userExpiredDays}. Using default of 30 days.`);
                return 30;
            }
            // Convert userExpiredDays to an integer
            return parseInt(userExpiredDays, 10);
        }

        let saveTimeout = null;
        let lastSaveTime = 0;
        
        /**
         * Add entry to cache with support for multiple keys and metadata
         * @param {string|array} keys - Single key or array of keys to cache under
         * @param {*} item - Data to cache
         * @param {object} options - { timestamp, dataType, metadata, forceSave }
         */
        function addEntry(keys, item, options = {}) {
            if (!Array.isArray(keys)) {
                keys = [keys];
            }
            const now = Date.now();
            const {
                timestamp = now,
                dataType = 'default',
                metadata = {},
                forceSave = true
            } = options;
            
            const cacheEntry = {
                item,
                timestamp,
                lastAccessed: now,
                accessCount: 0,
                dataType,
                metadata // For pagination: { page, pageSize, totalResults, dateRange }
            };
            
            keys.forEach(key => {
                cache[key] = cacheEntry;
            });
            
            if (forceSave) {
                saveCache();
            }
        }
        /**
         * Remove expired entries based on data type TTL
         * Uses LRU (Least Recently Used) eviction when size limit exceeded
         * @param {object} options - { maxItemsOverride, dataTypeOverride, forceCleanup }
         */
        function removeExpiredEntries(options = {}) {
            const now = Date.now();
            const { maxItemsOverride, dataTypeOverride, forceCleanup = false } = options;
            const cacheKeys = Object.keys(cache);
            
            if (cacheKeys.length === 0) return;
            
            const removedCount = { expired: 0, lru: 0 };
            
            // Step 1: Remove entries expired based on their data type's TTL
            const entriesToProcess = [];
            
            for (const key of cacheKeys) {
                const entry = cache[key];
                const dataType = entry.dataType || 'default';
                const ttl = getTTL(dataType);
                const age = now - entry.timestamp;
                
                if (age > ttl) {
                    delete cache[key];
                    removedCount.expired++;
                } else {
                    entriesToProcess.push({ key, entry, age, dataType });
                }
            }
            
            // Step 2: LRU eviction - remove least recently used items if over size limit
            const updatedKeys = Object.keys(cache);
            for (const dataType of Object.keys(flatConfig)) {
                const maxItems = dataTypeOverride ? getMaxItems(dataTypeOverride) : getMaxItems(dataType);
                const typedEntries = updatedKeys
                    .filter(k => cache[k] && cache[k].dataType === dataType)
                    .map(k => ({ key: k, lastAccessed: cache[k].lastAccessed, accessCount: cache[k].accessCount }));
                
                if (typedEntries.length > maxItems) {
                    // Sort by: accessCount (ascending), then lastAccessed (ascending)
                    // This removes least-used and oldest-accessed items first
                    typedEntries.sort((a, b) => {
                        if (a.accessCount !== b.accessCount) {
                            return a.accessCount - b.accessCount;
                        }
                        return a.lastAccessed - b.lastAccessed;
                    });
                    
                    const toRemove = typedEntries.length - maxItems;
                    for (let i = 0; i < toRemove; i++) {
                        delete cache[typedEntries[i].key];
                        removedCount.lru++;
                    }
                }
            }
            
            return removedCount;
        }
        function saveCache() {
            const now = Date.now();
            const timeSinceLastSave = now - lastSaveTime;
            const delay = timeSinceLastSave >= MIN_SAVE_INTERVAL_MS ? 0 : MIN_SAVE_INTERVAL_MS - timeSinceLastSave;

            if (saveTimeout) return;

            saveTimeout = setTimeout(() => {
                try {
                    const json = JSON.stringify(cache, null, 2);
                    const compressed = zlib.gzipSync(Buffer.from(json, 'utf8'));
                    fs.writeFileSync(CACHE_FILE, compressed);
                    console.log(`Cache saved to ${CACHE_FILE}`);
                    lastSaveTime = Date.now();
                } catch (err) {
                    console.error(`Failed to save cache for ${cacheName}:`, err);
                } finally {
                    saveTimeout = null;
                }
            }, delay);
        }

        function getCacheByKey(key) {
            if (cache.hasOwnProperty(key)) {
                const entry = cache[key];
                // Update access metrics
                entry.lastAccessed = Date.now();
                entry.accessCount = (entry.accessCount || 0) + 1;
                return entry;
            }
            return;
        }
        
        /**
         * Get cache entry with full metadata
         * @returns object with { key, item, timestamp, lastAccessed, accessCount, dataType, metadata }
         */
        function getCacheWithMetadata(key) {
            if (cache.hasOwnProperty(key)) {
                const entry = cache[key];
                entry.lastAccessed = Date.now();
                entry.accessCount = (entry.accessCount || 0) + 1;
                return entry;
            }
            return null;
        }

        return {
            getCacheByKey, // Returns entry with .item, .metadata, .dataType, .accessCount, .lastAccessed
            getCacheWithMetadata, // Alias for getCacheByKey, returns full entry object
            addEntry,
            saveCache,
            removeExpiredEntries,
            getCaches: () => cache,
            getConfig: () => config
        };
    }
    exports.cacheHelper = cacheHelper;
})(exports);

