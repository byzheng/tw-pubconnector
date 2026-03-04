const path = require('path');

const cacheHelperModulePath = path.resolve(
    __dirname,
    '..',
    '..',
    'dev',
    'plugins',
    'tw-pubconnector',
    'api',
    'cachehelper.js'
);

function loadCacheHelperWithTw(twMock) {
    global.$tw = twMock;
    delete require.cache[cacheHelperModulePath];
    return require(cacheHelperModulePath).cacheHelper;
}

module.exports = {
    loadCacheHelperWithTw
};
