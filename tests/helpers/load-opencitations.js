const path = require('path');
const Module = require('module');

const opencitationsModulePath = path.resolve(
    __dirname,
    '..',
    '..',
    'dev',
    'plugins',
    'tw-pubconnector',
    'api',
    'opencitations.js'
);

function loadOpenCitationsWithMocks({ fetchMock, cacheMock, helperMock }) {
    const originalLoad = Module._load;
    global.$tw = { node: true };
    delete require.cache[opencitationsModulePath];

    Module._load = function (request, parent, isMain) {
        if (request === 'node-fetch') {
            return fetchMock;
        }
        if (request === '$:/plugins/bangyou/tw-pubconnector/api/cachehelper.js') {
            return { cacheHelper: () => cacheMock };
        }
        if (request === '$:/plugins/bangyou/tw-pubconnector/utils/helper.js') {
            return { Helper: () => helperMock };
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    try {
        return require(opencitationsModulePath).OpenCitations;
    } finally {
        Module._load = originalLoad;
    }
}

module.exports = {
    loadOpenCitationsWithMocks
};
