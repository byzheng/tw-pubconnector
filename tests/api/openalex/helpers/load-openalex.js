const path = require('path');
const Module = require('module');

const openalexModulePath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'dev',
    'plugins',
    'tw-pubconnector',
    'api',
    'openalex.js'
);

function loadOpenAlexWithMocks({ twMock, fetchMock, cacheMock }) {
    const originalLoad = Module._load;
    global.$tw = twMock;
    delete require.cache[openalexModulePath];

    Module._load = function (request, parent, isMain) {
        if (request === 'node-fetch') {
            return fetchMock;
        }
        if (request === '$:/plugins/bangyou/tw-pubconnector/api/cachehelper.js') {
            return { cacheHelper: () => cacheMock };
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    try {
        return require(openalexModulePath).OpenAlex;
    } finally {
        Module._load = originalLoad;
    }
}

module.exports = {
    loadOpenAlexWithMocks
};
