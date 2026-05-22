const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const webpackMainEntry = path.join(repoRoot, '.webpack', 'main', 'index.js');
const rendererRoot = path.join(repoRoot, '.webpack', 'renderer');
const electronForgeBin = path.join(
    repoRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron-forge.cmd' : 'electron-forge',
);

const bundleLooksReady = () => (
    fs.existsSync(webpackMainEntry)
    && fs.existsSync(path.join(rendererRoot, 'menu_window', 'index.html'))
    && fs.existsSync(path.join(rendererRoot, 'video_editor_window', 'index.html'))
);

const killChildTree = async (child) => {
    if (!child || child.killed) {
        return;
    }

    if (process.platform === 'win32' && child.pid) {
        await new Promise((resolve) => {
            const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
                stdio: 'ignore',
                windowsHide: true,
            });
            killer.on('error', () => resolve());
            killer.on('close', () => resolve());
        });
        return;
    }

    child.kill('SIGTERM');
};

const waitForBundle = async () => {
    if (bundleLooksReady()) {
        return;
    }

    if (!fs.existsSync(electronForgeBin)) {
        throw new Error(`Missing electron-forge binary at ${electronForgeBin}`);
    }

    const child = spawn(electronForgeBin, ['start'], {
        cwd: repoRoot,
        env: {
            ...process.env,
            NODE_ENV: 'development',
            AGEOFSCREEN_RELEASE_PROFILE: process.env.AGEOFSCREEN_RELEASE_PROFILE || 'dev',
        },
        stdio: 'ignore',
        windowsHide: true,
        shell: process.platform === 'win32',
    });

    try {
        const timeoutAt = Date.now() + 180000;
        while (Date.now() < timeoutAt) {
            if (bundleLooksReady()) {
                return;
            }

            if (child.exitCode != null) {
                throw new Error(`electron-forge start exited early with code ${child.exitCode}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 750));
        }

        throw new Error('Timed out waiting for Forge to produce the .webpack bundle.');
    } finally {
        await killChildTree(child);
    }
};

waitForBundle().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
