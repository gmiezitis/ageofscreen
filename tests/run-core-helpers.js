require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
        module: 'commonjs',
    },
});

['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.mp3'].forEach((ext) => {
    require.extensions[ext] = (module, filename) => {
        module.exports = filename;
    };
});

require('./coreHelpers.test.ts');
