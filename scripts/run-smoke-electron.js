const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const ensureBundleScript = path.join(repoRoot, 'scripts', 'ensure-webpack-bundle.js');
const smokeScript = path.join(repoRoot, 'scripts', 'smoke-electron.js');

const runNodeScript = (scriptPath) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
        if (code === 0) {
            resolve();
            return;
        }
        reject(new Error(`${path.basename(scriptPath)} exited with code ${code}`));
    });
});

const run = async () => {
    await runNodeScript(ensureBundleScript);
    await runNodeScript(smokeScript);
};

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
