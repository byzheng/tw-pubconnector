const path = require('path');
const Module = require('module');

const updateRouteModulePath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'dev',
    'plugins',
    'tw-pubconnector',
    'route',
    'authors',
    'scholar',
    'update.js'
);

function loadScholarUpdateRouteWithMocks({ scholarMock }) {
    const originalLoad = Module._load;
    delete require.cache[updateRouteModulePath];

    Module._load = function (request, parent, isMain) {
        if (request === '$:/plugins/bangyou/tw-pubconnector/api/scholar.js') {
            return {
                Scholar: () => scholarMock
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    try {
        return require(updateRouteModulePath);
    } finally {
        Module._load = originalLoad;
    }
}

module.exports = {
    loadScholarUpdateRouteWithMocks
};
