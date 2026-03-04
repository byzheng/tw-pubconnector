const path = require('path');
const Module = require('module');

const orcidModulePath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'dev',
    'plugins',
    'tw-pubconnector',
    'api',
    'orcid.js'
);

function loadORCIDWithMocks({ twMock, fetchMock, cacheMock }) {
    const originalLoad = Module._load;
    global.$tw = twMock;
    delete require.cache[orcidModulePath];

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
        return require(orcidModulePath).ORCID;
    } finally {
        Module._load = originalLoad;
    }
}

module.exports = {
    loadORCIDWithMocks
};
