const test = require('node:test');
const assert = require('node:assert/strict');

const { loadOpenCitationsWithMocks } = require('./helpers/load-opencitations');

function createInMemoryCache() {
    const store = Object.create(null);
    return {
        getCacheByKey(key) {
            return store[key];
        },
        addEntry(key, item) {
            store[key] = { item };
        },
        removeExpiredEntries() {
            return { expired: 0, lru: 0 };
        },
        getStore() {
            return store;
        }
    };
}

test('getCitationByDOI caches response and avoids duplicate fetch calls', async () => {
    let fetchCalls = 0;
    const fetchMock = async () => {
        fetchCalls += 1;
        return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => [{ citing: 'doi:10.1000/cited-1', creation: '2026-02-20' }],
            text: async () => ''
        };
    };

    const cacheMock = createInMemoryCache();
    const helperMock = { extractDOIs: (doi) => doi };
    const OpenCitations = loadOpenCitationsWithMocks({ fetchMock, cacheMock, helperMock });
    const api = OpenCitations('https://api.opencitations.net/');

    const first = await api.getCitationByDOI('10.1000/xyz');
    const second = await api.getCitationByDOI('10.1000/xyz');

    assert.equal(fetchCalls, 1);
    assert.deepEqual(first, second);
    assert.equal(first.length, 1);
});

test('getLatestCitationsByDOI filters by days and extracts citing DOI', async () => {
    const recentDate = new Date().toISOString().slice(0, 10);
    const oldDate = '2001-01-01';

    const fetchMock = async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => [
            { citing: 'omid:br/123 doi:10.1000/recent openalex:W1', creation: recentDate },
            { citing: 'omid:br/456 doi:10.1000/old openalex:W2', creation: oldDate }
        ],
        text: async () => ''
    });

    const cacheMock = createInMemoryCache();
    const helperMock = { extractDOIs: (doi) => doi };
    const OpenCitations = loadOpenCitationsWithMocks({ fetchMock, cacheMock, helperMock });
    const api = OpenCitations('https://api.opencitations.net/');

    const latest = await api.getLatestCitationsByDOI('10.1000/xyz', 30);

    assert.deepEqual(latest, ['10.1000/recent']);
});

test('getCitationByDOI returns empty list on 404', async () => {
    const fetchMock = async () => ({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        text: async () => 'not found'
    });

    const cacheMock = createInMemoryCache();
    const helperMock = { extractDOIs: (doi) => doi };
    const OpenCitations = loadOpenCitationsWithMocks({ fetchMock, cacheMock, helperMock });
    const api = OpenCitations('https://api.opencitations.net/');

    const result = await api.getCitationByDOI('10.1000/missing');

    assert.deepEqual(result, []);
});
