const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const { loadCacheHelperWithTw } = require('./helpers/load-cachehelper');

function createTwMock({ configText = null } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-pubconnector-test-'));
    const wikiTiddlersPath = path.join(root, 'wiki', 'tiddlers');
    fs.mkdirSync(wikiTiddlersPath, { recursive: true });

    const twMock = {
        node: true,
        boot: {
            wikiTiddlersPath
        },
        wiki: {
            getTiddlerText(title, fallback) {
                if (title === '$:/config/tw-pubconnector/cache-config') {
                    return configText;
                }
                if (title === '$:/config/tw-pubconnector/authoring/expired-days') {
                    return '30';
                }
                return fallback;
            }
        }
    };

    return {
        root,
        twMock
    };
}

test('addEntry and getCacheByKey return expected metadata', () => {
    const { twMock } = createTwMock();
    const cacheHelper = loadCacheHelperWithTw(twMock);
    const cache = cacheHelper('openalex-test');

    cache.addEntry('author-1', { name: 'Alice' }, {
        dataType: 'openalex.author-profile',
        forceSave: false
    });

    const entry = cache.getCacheByKey('author-1');

    assert.ok(entry);
    assert.deepEqual(entry.item, { name: 'Alice' });
    assert.equal(entry.dataType, 'openalex.author-profile');
    assert.equal(entry.accessCount, 1);
    assert.equal(typeof entry.lastAccessed, 'number');
});

test('removeExpiredEntries removes entries based on ttl', () => {
    const shortTtlConfig = JSON.stringify({
        openalex: {
            metadata: { ttl: 50, maxItems: 100 }
        }
    });
    const { twMock } = createTwMock({ configText: shortTtlConfig });
    const cacheHelper = loadCacheHelperWithTw(twMock);
    const cache = cacheHelper('ttl-test');

    cache.addEntry('work-1', { title: 'Old data' }, {
        dataType: 'openalex.metadata',
        timestamp: Date.now() - 500,
        forceSave: false
    });
    cache.addEntry('work-2', { title: 'Fresh data' }, {
        dataType: 'openalex.metadata',
        timestamp: Date.now(),
        forceSave: false
    });

    const removed = cache.removeExpiredEntries();
    const all = cache.getCaches();

    assert.equal(removed.expired, 1);
    assert.equal(all['work-1'], undefined);
    assert.ok(all['work-2']);
});

test('removeExpiredEntries applies LRU eviction when max items exceeded', () => {
    const smallBucketConfig = JSON.stringify({
        openalex: {
            metadata: { ttl: 60 * 60 * 1000, maxItems: 2 }
        }
    });
    const { twMock } = createTwMock({ configText: smallBucketConfig });
    const cacheHelper = loadCacheHelperWithTw(twMock);
    const cache = cacheHelper('lru-test');

    cache.addEntry('k1', { value: 1 }, { dataType: 'openalex.metadata', forceSave: false });
    cache.addEntry('k2', { value: 2 }, { dataType: 'openalex.metadata', forceSave: false });
    cache.addEntry('k3', { value: 3 }, { dataType: 'openalex.metadata', forceSave: false });

    cache.getCacheByKey('k2');
    cache.getCacheByKey('k2');
    cache.getCacheByKey('k3');

    const removed = cache.removeExpiredEntries();
    const all = cache.getCaches();

    assert.equal(removed.lru, 1);
    assert.equal(all.k1, undefined);
    assert.ok(all.k2);
    assert.ok(all.k3);
});

test('cacheName validation rejects path traversal or special characters', () => {
    const { twMock } = createTwMock();
    const cacheHelper = loadCacheHelperWithTw(twMock);

    assert.throws(() => cacheHelper('../unsafe'), /Invalid cacheName/);
    assert.throws(() => cacheHelper('bad:name'), /Invalid cacheName/);
});

test('saveCache persists gzip cache file and reloads entries', async () => {
    const { twMock, root } = createTwMock();
    const cacheHelper = loadCacheHelperWithTw(twMock);
    const cacheName = 'persist-test';

    const cache = cacheHelper(cacheName);
    cache.addEntry('persist-key', { value: 42 }, {
        dataType: 'openalex.metadata'
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    const cacheFile = path.join(root, 'wiki', 'cache', `${cacheName}-cache.json.gz`);
    assert.equal(fs.existsSync(cacheFile), true);

    const compressed = fs.readFileSync(cacheFile);
    const raw = zlib.gunzipSync(compressed).toString('utf8');
    const parsed = JSON.parse(raw);
    assert.ok(parsed['persist-key']);
    assert.deepEqual(parsed['persist-key'].item, { value: 42 });

    const reloaded = cacheHelper(cacheName);
    const entry = reloaded.getCacheByKey('persist-key');
    assert.ok(entry);
    assert.deepEqual(entry.item, { value: 42 });
});

test('custom config takes precedence over tiddler config and default config', () => {
    const tiddlerConfig = JSON.stringify({
        openalex: {
            metadata: { ttl: 10, maxItems: 1 }
        }
    });
    const { twMock } = createTwMock({ configText: tiddlerConfig });
    const cacheHelper = loadCacheHelperWithTw(twMock);

    const cache = cacheHelper('precedence-test', {
        openalex: {
            metadata: { ttl: 999, maxItems: 77 }
        }
    });

    const config = cache.getConfig();
    assert.equal(config.openalex.metadata.ttl, 999);
    assert.equal(config.openalex.metadata.maxItems, 77);
});

test('unknown dataType falls back to default ttl for expiration', () => {
    const { twMock } = createTwMock();
    const cacheHelper = loadCacheHelperWithTw(twMock);
    const cache = cacheHelper('default-ttl-test');

    const thirtyOneDays = 31 * 24 * 60 * 60 * 1000;
    cache.addEntry('old-unknown', { a: 1 }, {
        dataType: 'some.unknown-type',
        timestamp: Date.now() - thirtyOneDays,
        forceSave: false
    });
    cache.addEntry('fresh-unknown', { a: 2 }, {
        dataType: 'some.unknown-type',
        timestamp: Date.now(),
        forceSave: false
    });

    const removed = cache.removeExpiredEntries();
    const all = cache.getCaches();

    assert.equal(removed.expired, 1);
    assert.equal(all['old-unknown'], undefined);
    assert.ok(all['fresh-unknown']);
});

test('invalid tiddler cache config falls back to defaults safely', () => {
    const { twMock } = createTwMock({ configText: '{invalid-json' });
    const cacheHelper = loadCacheHelperWithTw(twMock);

    const cache = cacheHelper('invalid-config-test');
    const config = cache.getConfig();

    assert.ok(config.default);
    assert.equal(typeof config.default.ttl, 'number');
    assert.equal(typeof config.default.maxItems, 'number');
});
