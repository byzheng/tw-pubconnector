const test = require('node:test');
const assert = require('node:assert/strict');

const { loadScholarUpdateRouteWithMocks } = require('./helpers/load-update-route');

function createResponseMock() {
    return {
        statusCode: null,
        headers: null,
        body: '',
        writeHead(code, headers) {
            this.statusCode = code;
            this.headers = headers;
        },
        end(chunk) {
            this.body = chunk;
        }
    };
}

test('POST /authors/scholar/update caches works for provided scholar id', async () => {
    const calls = [];
    const scholarMock = {
        performCacheWorks(id, works) {
            calls.push({ id, works });
        }
    };
    const route = loadScholarUpdateRouteWithMocks({ scholarMock });
    const response = createResponseMock();

    const works = [
        {
            title: 'Pheno-Copter: A Low-Altitude, Autonomous Remote-Sensing Robotic Helicopter for High-Throughput Field-Based Phenotyping',
            author: 'SC Chapman, T Merz, A Chan, P Jackway, S Hrabar, MF Dreccer, ...',
            publisher: 'Agronomy 4 (2), 279-301, 2014',
            link: '/citations?view_op=view_citation&hl=en&user=MfZ-QtEAAAAJ&citation_for_view=MfZ-QtEAAAAJ:LkGwnXOMwfcC',
            year: '2014',
            cites: '13830443136847729789'
        }
    ];

    const state = {
        data: JSON.stringify({
            id: 'MfZ-QtEAAAAJ',
            works
        })
    };

    await route.handler({}, response, state);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, 'MfZ-QtEAAAAJ');
    assert.deepEqual(calls[0].works, works);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, { 'Content-Type': 'application/json' });
    assert.deepEqual(JSON.parse(response.body), {
        status: 'success',
        code: 200,
        message: 'Data saved'
    });
});
