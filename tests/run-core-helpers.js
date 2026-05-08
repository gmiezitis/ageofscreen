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

[
    './shared.test.ts',
    './cursorStyling.test.ts',
    './editorExport.test.ts',
    './exportHelpers.test.ts',
    './autoPolishPlan.test.ts',
    './timelineScene.test.ts',
    './timelineClips.test.ts',
    './playgroundEngine.test.ts',
].forEach((file) => {
    require(file);
});
