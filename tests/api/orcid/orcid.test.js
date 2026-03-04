const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { loadORCIDWithMocks } = require('./helpers/load-orcid');

const fixturePath = path.resolve(__dirname, 'fixtures', 'works-sample.json');
const fixtureWorks = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function createTwMock({ dailyLimit = '25000', enabled = true } = {}) {
    return {
        node: true,
        wiki: {
            getTiddler(title) {
                if (title === '$:/config/tw-pubconnector/authoring/orcid/enable') {
                    return enabled ? { fields: { text: 'enable' } } : { fields: { text: 'disable' } };
                }
                return null;
            },
            getTiddlerText(title, fallback) {
                if (title === '$:/config/tw-pubconnector/authoring/orcid/daily-limit') {
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

test('cacheAuthorPublications parses real ORCID fixture and extracts DOI', async () => {
    const fetchMock = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
            group: fixtureWorks.map(work => ({
                'work-summary': [work]
            }))
        })
    });

    const twMock = createTwMock({ dailyLimit: '10', enabled: true });
    const cacheMock = createInMemoryCache();
    const ORCID = loadORCIDWithMocks({ twMock, fetchMock, cacheMock });
    const api = ORCID('https://pub.orcid.org');

    const works = await api.cacheAuthorPublications('https://orcid.org/0000-0001-6762-2902');

    assert.equal(works.length, 1);
    assert.equal(works[0].identifiers.doi, fixtureWorks[0].identifiers.doi);
    assert.equal(works[0].title.title.value, fixtureWorks[0].title.title.value);
});

test('cacheAuthorPublications normalizes DOI from both ORCID response formats', async () => {
    const fetchMock = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
            group: [
                {
                    'work-summary': [
                        {
                            title: { title: { value: 'Paper A' } },
                            externalIds: {
                                externalId: [
                                    { externalIdType: 'doi', externalIdValue: '10.1000/a' }
                                ]
                            }
                        }
                    ]
                },
                {
                    'work-summary': [
                        {
                            title: { title: { value: 'Paper B' } },
                            'external-ids': {
                                'external-id': [
                                    { 'external-id-type': 'doi', 'external-id-value': '10.1000/b' }
                                ]
                            }
                        }
                    ]
                }
            ]
        })
    });

    const twMock = createTwMock({ dailyLimit: '10', enabled: true });
    const cacheMock = createInMemoryCache();
    const ORCID = loadORCIDWithMocks({ twMock, fetchMock, cacheMock });
    const api = ORCID('https://pub.orcid.org');

    const works = await api.cacheAuthorPublications('https://orcid.org/0000-0002-1825-0097');

    assert.equal(works.length, 2);
    assert.equal(works[0].identifiers.doi, '10.1000/a');
    assert.equal(works[1].identifiers.doi, '10.1000/b');
    assert.equal(works[0].title.title.value, 'Paper A');
    assert.equal(works[1].title.title.value, 'Paper B');
});

test('cacheAuthorPublications enforces ORCID daily limit before fetch', async () => {
    let fetchCalls = 0;
    const fetchMock = async () => {
        fetchCalls += 1;
        return {
            ok: true,
            status: 200,
            json: async () => ({ group: [] })
        };
    };

    const today = new Date().toISOString().slice(0, 10);
    const twMock = createTwMock({ dailyLimit: '1', enabled: true });
    const cacheMock = createInMemoryCache({
        __orcid_daily_request_count: {
            item: { count: 1, day: today }
        }
    });

    const ORCID = loadORCIDWithMocks({ twMock, fetchMock, cacheMock });
    const api = ORCID('https://pub.orcid.org');

    await assert.rejects(
        () => api.cacheAuthorPublications('0000-0002-1825-0097'),
        /Daily request limit/
    );
    assert.equal(fetchCalls, 0);
});

test('getAuthorByDOI returns matched tiddlers and includes ORCID ids in filter', () => {
    let capturedFilter = '';
    const twMock = createTwMock({ enabled: true });
    twMock.wiki.filterTiddlers = (filter) => {
        capturedFilter = filter;
        return ['Bangyou Zheng', 'Another Colleague'];
    };

    const cacheMock = createInMemoryCache({
        '0000-0001-1111-1111': {
            item: [{ identifiers: { doi: '10.1000/x' } }]
        },
        '0000-0002-2222-2222': {
            item: [{ identifiers: { doi: '10.1000/X' } }]
        },
        '__orcid_daily_request_count': {
            item: { count: 1, day: '2099-01-01' }
        }
    });

    const fetchMock = async () => ({ ok: true, status: 200, json: async () => ({ group: [] }) });
    const ORCID = loadORCIDWithMocks({ twMock, fetchMock, cacheMock });
    const api = ORCID('https://pub.orcid.org');

    const result = api.getAuthorByDOI('10.1000/x');

    assert.deepEqual(result, ['Bangyou Zheng', 'Another Colleague']);
    assert.match(capturedFilter, /0000-0001-1111-1111\|0000-0002-2222-2222/);
});

test('getAuthorByDOI returns empty array when no DOI match found', () => {
    const twMock = createTwMock({ enabled: true });
    const cacheMock = createInMemoryCache({
        '0000-0001-1111-1111': {
            item: [{ identifiers: { doi: '10.1000/other' } }]
        }
    });

    const fetchMock = async () => ({ ok: true, status: 200, json: async () => ({ group: [] }) });
    const ORCID = loadORCIDWithMocks({ twMock, fetchMock, cacheMock });
    const api = ORCID('https://pub.orcid.org');

    assert.deepEqual(api.getAuthorByDOI('10.1000/x'), []);
});

test('getAuthorByDOI validates DOI input', () => {
    const twMock = createTwMock({ enabled: true });
    const cacheMock = createInMemoryCache();

    const fetchMock = async () => ({ ok: true, status: 200, json: async () => ({ group: [] }) });
    const ORCID = loadORCIDWithMocks({ twMock, fetchMock, cacheMock });
    const api = ORCID('https://pub.orcid.org');

    assert.throws(() => api.getAuthorByDOI(''), /Invalid DOI provided/);
    assert.throws(() => api.getAuthorByDOI(42), /DOI must be a string/);
});

test('getAuthorByDOI returns empty array when ORCID integration is disabled', () => {
    const twMock = createTwMock({ enabled: false });
    const cacheMock = createInMemoryCache({
        '0000-0001-1111-1111': {
            item: [{ identifiers: { doi: '10.1000/x' } }]
        }
    });

    const fetchMock = async () => ({ ok: true, status: 200, json: async () => ({ group: [] }) });
    const ORCID = loadORCIDWithMocks({ twMock, fetchMock, cacheMock });
    const api = ORCID('https://pub.orcid.org');

    assert.deepEqual(api.getAuthorByDOI('10.1000/x'), []);
});

test('getLatest returns only recent works with complete publication date and DOI', () => {
    const twMock = createTwMock({ enabled: true });
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 120);

    const cacheMock = createInMemoryCache({
        '0000-0001-1111-1111': {
            item: [
                {
                    title: { title: { value: 'Recent Paper' } },
                    identifiers: { doi: '10.1000/recent' },
                    'journal-title': { value: 'Recent Journal' },
                    'publication-date': {
                        year: { value: String(recentDate.getFullYear()) },
                        month: { value: String(recentDate.getMonth() + 1).padStart(2, '0') },
                        day: { value: String(recentDate.getDate()).padStart(2, '0') }
                    }
                },
                {
                    title: { title: { value: 'Old Paper' } },
                    identifiers: { doi: '10.1000/old' },
                    'journal-title': { value: 'Old Journal' },
                    'publication-date': {
                        year: { value: String(oldDate.getFullYear()) },
                        month: { value: String(oldDate.getMonth() + 1).padStart(2, '0') },
                        day: { value: String(oldDate.getDate()).padStart(2, '0') }
                    }
                }
            ]
        },
        '__orcid_daily_request_count': {
            item: { count: 1, day: '2099-01-01' }
        }
    });

    const fetchMock = async () => ({ ok: true, status: 200, json: async () => ({ group: [] }) });
    const ORCID = loadORCIDWithMocks({ twMock, fetchMock, cacheMock });
    const api = ORCID('https://pub.orcid.org');

    const latest = api.getLatest(90);

    assert.equal(latest.length, 1);
    assert.equal(latest[0].doi, '10.1000/recent');
    assert.equal(latest[0].title, 'Recent Paper');
    assert.equal(latest[0].journalTitle, 'Recent Journal');
    assert.equal(latest[0].platform, 'ORCID');
});

test('getLatest skips works with incomplete date or missing DOI and returns [] when disabled', () => {
    const enabledTwMock = createTwMock({ enabled: true });
    const cacheMock = createInMemoryCache({
        '0000-0001-1111-1111': {
            item: [
                {
                    title: { title: { value: 'Missing day' } },
                    identifiers: { doi: '10.1000/missing-day' },
                    'publication-date': {
                        year: { value: '2025' },
                        month: { value: '11' },
                        day: null
                    }
                },
                {
                    title: { title: { value: 'Missing DOI' } },
                    identifiers: { doi: '' },
                    'publication-date': {
                        year: { value: '2025' },
                        month: { value: '11' },
                        day: { value: '01' }
                    }
                },
                {
                    title: { title: { value: 'Missing date' } },
                    identifiers: { doi: '10.1000/missing-date' }
                }
            ]
        }
    });

    const fetchMock = async () => ({ ok: true, status: 200, json: async () => ({ group: [] }) });
    const ORCIDEnabled = loadORCIDWithMocks({ twMock: enabledTwMock, fetchMock, cacheMock });
    const apiEnabled = ORCIDEnabled('https://pub.orcid.org');
    assert.deepEqual(apiEnabled.getLatest(365), []);

    const disabledTwMock = createTwMock({ enabled: false });
    const ORCIDDisabled = loadORCIDWithMocks({ twMock: disabledTwMock, fetchMock, cacheMock });
    const apiDisabled = ORCIDDisabled('https://pub.orcid.org');
    assert.deepEqual(apiDisabled.getLatest(365), []);
});
