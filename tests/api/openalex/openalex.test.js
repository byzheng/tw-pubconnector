// openalex.test.js
// Tests for OpenAlex API utility

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { loadOpenAlexWithMocks } = require('./helpers/load-openalex');

const fixturePath = path.resolve(__dirname, 'fixtures', 'works-sample.json');
const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const fixtureWorks = fixtureData.results;

function createTwMock({ dailyLimit = '25000', enabled = true } = {}) {
    return {
        node: true,
        wiki: {
            getTiddler(title) {
                if (title === '$:/config/tw-pubconnector/authoring/openalex/enable') {
                    return enabled ? { fields: { text: 'enable' } } : { fields: { text: 'disable' } };
                }
                return null;
            },
            getTiddlerText(title, fallback) {
                if (title === '$:/config/tw-pubconnector/authoring/openalex/daily-limit') {
                    return dailyLimit;
                }
                return fallback;
            },
            filterTiddlers() {
                return [];
            }
        }
    };
}

function createInMemoryCache(initial = {}) {
    const store = Object.assign(Object.create(null), initial);
    return {
        getCacheByKey(key) {
            return store[key];
        },
        addEntry(key, item) {
            store[key] = { item };
        },
        getCaches() {
            return store;
        },
        removeExpiredEntries() {
            return { expired: 0, lru: 0 };
        },
        getStore() {
            return store;
        }
    };
}

test('cacheAuthorPublications and getAuthorWorks save and return works for a5011534124', async () => {
    // Use sanitized fake data from fixture
    const fetchMock = async () => ({
        ok: true,
        status: 200,
        json: async () => fixtureData
    });
    const cacheMock = createInMemoryCache();
    const twMock = createTwMock();
    const OpenAlex = loadOpenAlexWithMocks({ twMock, fetchMock, cacheMock });
    const openalex = OpenAlex();

    // Should fetch and cache works for author a5011534124
    const works = await openalex.cacheAuthorPublications('https://openalex.org/A5011534124');
    assert.ok(Array.isArray(works));
    assert.equal(works.length, 1);
    assert.equal(works[0].doi, 'https://doi.org/10.0000/fake.doi.2026.00001');
    // Should now be cached (key is lowercased by extractOpenAlexId)
    const cached = cacheMock.getCacheByKey('a5011534124');
    assert.ok(cached);
    assert.equal(cached.item[0].doi, 'https://doi.org/10.0000/fake.doi.2026.00001');

    // getWorks should return from cache
    const worksFromCache = openalex.getWorks('https://openalex.org/A5011534124');
    assert.ok(Array.isArray(worksFromCache));
    assert.equal(worksFromCache.length, 1);
    assert.equal(worksFromCache[0].doi, 'https://doi.org/10.0000/fake.doi.2026.00001');
});

test('cacheAuthorPublications and getWorks use fake OpenAlex data for a5011534124', async () => {
    // Fake OpenAlex API response (single publication for a5011534124)
    const fakeApiResponse = {
        meta: { count: 1 },
        results: [
            {
                id: 'https://openalex.org/W1234567890',
                doi: 'https://doi.org/10.1234/fake.doi.2026.00001',
                title: 'Fake Publication for Testing',
                publication_year: 2026,
                publication_date: '2026-03-13',
                primary_location: {
                    id: 'doi:10.1234/fake.doi.2026.00001',
                    is_oa: true,
                    landing_page_url: 'https://doi.org/10.1234/fake.doi.2026.00001',
                    pdf_url: null,
                    source: {
                        id: 'https://openalex.org/S123456789',
                        display_name: 'Fake Journal'
                    }
                },
                ids: {
                    openalex: 'https://openalex.org/W1234567890',
                    doi: 'https://doi.org/10.1234/fake.doi.2026.00001'
                },
                authorships: [
                    {
                        author_position: 'first',
                        author: {
                            id: 'https://openalex.org/A5011534124',
                            display_name: 'Bangyou Zheng',
                            orcid: 'https://orcid.org/0000-0003-1551-0970'
                        }
                    }
                ]
            }
        ]
    };
    const fetchMock = async () => ({
        ok: true,
        status: 200,
        json: async () => fakeApiResponse
    });
    const cacheMock = createInMemoryCache();
    const twMock = createTwMock();
    const OpenAlex = loadOpenAlexWithMocks({ twMock, fetchMock, cacheMock });
    const openalex = OpenAlex();

    // Should fetch and cache works for author a5011534124
    const works = await openalex.cacheAuthorPublications('https://openalex.org/A5011534124');
    assert.ok(Array.isArray(works));
    assert.equal(works.length, 1);
    assert.equal(works[0].doi, 'https://doi.org/10.1234/fake.doi.2026.00001');
    // Should now be cached (key is lowercased by extractOpenAlexId)
    const cached = cacheMock.getCacheByKey('a5011534124');
    assert.ok(cached);
    assert.equal(cached.item[0].doi, 'https://doi.org/10.1234/fake.doi.2026.00001');

    // getWorks should return from cache
    const worksFromCache = openalex.getWorks('https://openalex.org/A5011534124');
    assert.ok(Array.isArray(worksFromCache));
    assert.equal(worksFromCache.length, 1);
    assert.equal(worksFromCache[0].doi, 'https://doi.org/10.1234/fake.doi.2026.00001');
});

test('cacheAuthorPublications and getWorks use sanitized fake OpenAlex data for a5011534124', async () => {
    // Sanitized fake OpenAlex API response (single publication for a5011534124)
    const fakeApiResponse = {
        meta: { count: 1 },
        results: [
            {
                id: 'https://openalex.org/W0000000001',
                doi: 'https://doi.org/10.0000/fake.doi.2026.00001',
                title: 'A Test Publication for Unit Testing',
                publication_year: 2026,
                publication_date: '2026-03-13',
                primary_location: {
                    id: 'doi:10.0000/fake.doi.2026.00001',
                    is_oa: true,
                    landing_page_url: 'https://doi.org/10.0000/fake.doi.2026.00001',
                    pdf_url: null,
                    source: {
                        id: 'https://openalex.org/S000000001',
                        display_name: 'Test Journal'
                    }
                },
                ids: {
                    openalex: 'https://openalex.org/W0000000001',
                    doi: 'https://doi.org/10.0000/fake.doi.2026.00001'
                },
                authorships: [
                    {
                        author_position: 'first',
                        author: {
                            id: 'https://openalex.org/A5011534124',
                            display_name: 'Test Author',
                            orcid: 'https://orcid.org/0000-0000-0000-0000'
                        }
                    }
                ]
            }
        ]
    };
    const fetchMock = async () => ({
        ok: true,
        status: 200,
        json: async () => fakeApiResponse
    });
    const cacheMock = createInMemoryCache();
    const twMock = createTwMock();
    const OpenAlex = loadOpenAlexWithMocks({ twMock, fetchMock, cacheMock });
    const openalex = OpenAlex();

    // Should fetch and cache works for author a5011534124
    const works = await openalex.cacheAuthorPublications('https://openalex.org/A5011534124');
    assert.ok(Array.isArray(works));
    assert.equal(works.length, 1);
    assert.equal(works[0].doi, 'https://doi.org/10.0000/fake.doi.2026.00001');
    // Should now be cached (key is lowercased by extractOpenAlexId)
    const cached = cacheMock.getCacheByKey('a5011534124');
    assert.ok(cached);
    assert.equal(cached.item[0].doi, 'https://doi.org/10.0000/fake.doi.2026.00001');

    // getWorks should return from cache
    const worksFromCache = openalex.getWorks('https://openalex.org/A5011534124');
    assert.ok(Array.isArray(worksFromCache));
    assert.equal(worksFromCache.length, 1);
    assert.equal(worksFromCache[0].doi, 'https://doi.org/10.0000/fake.doi.2026.00001');
});
