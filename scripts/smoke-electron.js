const fs = require('fs');
const http = require('http');
const path = require('path');
const { _electron: electron } = require('playwright');

const repoRoot = path.resolve(__dirname, '..');
const webpackMainEntry = path.join(repoRoot, '.webpack', 'main', 'index.js');
const rendererRoot = path.join(repoRoot, '.webpack', 'renderer');
const sampleVideoPath = path.join(repoRoot, 'test-breath.mp4');
const smokeExportDir = path.join(repoRoot, '.tmp', 'smoke-exports', 'dev');
const smokeArtifactDir = path.join(repoRoot, '.tmp', 'smoke-artifacts', 'dev');
const smokeLogFile = path.join(smokeArtifactDir, 'main-process.log');
const smokePort = 3030;

const getContentType = (filePath) => {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.html') return 'text/html; charset=utf-8';
    if (extension === '.js') return 'application/javascript; charset=utf-8';
    if (extension === '.css') return 'text/css; charset=utf-8';
    if (extension === '.json') return 'application/json; charset=utf-8';
    if (extension === '.png') return 'image/png';
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
    if (extension === '.svg') return 'image/svg+xml';
    if (extension === '.mp3') return 'audio/mpeg';
    return 'application/octet-stream';
};

const ensureWebpackBundle = () => {
    if (!fs.existsSync(webpackMainEntry)) {
        throw new Error(
            'Missing .webpack bundle. Run `npm start` once or build the Electron bundle before running `npm run test:smoke`.'
        );
    }
    if (!fs.existsSync(sampleVideoPath)) {
        throw new Error(`Missing sample video for smoke testing: ${sampleVideoPath}`);
    }
};

const resetExportDir = () => {
    fs.rmSync(smokeExportDir, { recursive: true, force: true });
    fs.mkdirSync(smokeExportDir, { recursive: true });
};

const resetArtifactDir = () => {
    fs.rmSync(smokeArtifactDir, { recursive: true, force: true });
    fs.mkdirSync(smokeArtifactDir, { recursive: true });
    fs.writeFileSync(smokeLogFile, '');
};

const listExportFiles = () => (
    fs.readdirSync(smokeExportDir)
        .map((name) => path.join(smokeExportDir, name))
        .filter((filePath) => fs.statSync(filePath).isFile())
        .filter((filePath) => path.basename(filePath).startsWith('ageofscreen-'))
);

const waitForExportFile = async (knownFiles = []) => {
    const deadline = Date.now() + 90000;
    const knownFileSet = new Set(knownFiles);

    while (Date.now() < deadline) {
        const exportedFile = listExportFiles().find((filePath) => !knownFileSet.has(filePath));
        if (exportedFile) {
            return exportedFile;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error('Timed out waiting for the smoke export file to be created.');
};

const waitForToastMessage = async (page, matcher = null) => {
    await page.waitForFunction((expectedPattern) => {
        const toast = document.querySelector('.toast-container');
        if (!toast) {
            return false;
        }
        const text = (toast.textContent || '').trim();
        if (!text) {
            return false;
        }
        return expectedPattern ? new RegExp(expectedPattern, 'i').test(text) : true;
    }, matcher, { timeout: 90000 });
    return (await page.locator('.toast-container').innerText()).trim();
};

const dismissExistingToast = async (page) => {
    const toast = page.locator('.toast-container');
    if (await toast.count()) {
        const closeButton = toast.locator('button').last();
        if (await closeButton.count()) {
            await closeButton.click().catch(() => {});
        }
        await toast.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
};

const waitForLoadedVideo = async (page, clipName) => {
    await page.waitForFunction((expectedName) => {
        const bodyText = document.body?.innerText || '';
        return bodyText.includes(expectedName);
    }, clipName, { timeout: 15000 });
    await page.waitForFunction(() => {
        const video = document.querySelector('video');
        return !!video
            && typeof video.currentSrc === 'string'
            && video.currentSrc.length > 0
            && Number.isFinite(video.duration)
            && video.duration > 0
            && video.videoWidth > 0
            && video.videoHeight > 0;
    }, { timeout: 15000 });
    return page.evaluate(() => {
        const video = document.querySelector('video');
        return {
            currentSrc: typeof video?.currentSrc === 'string' ? video.currentSrc : '',
            duration: Number.isFinite(video?.duration) ? video.duration : 0,
            videoWidth: video?.videoWidth ?? 0,
            videoHeight: video?.videoHeight ?? 0,
        };
    });
};

const createStaticServer = () => {
    const server = http.createServer((request, response) => {
        const requestUrl = new URL(request.url || '/', `http://127.0.0.1:${smokePort}`);
        const relativePath = decodeURIComponent(requestUrl.pathname.replace(/^\/+/, ''));
        const requestedPath = path.resolve(rendererRoot, relativePath || 'index.html');

        if (!requestedPath.startsWith(rendererRoot)) {
            response.writeHead(403);
            response.end('Forbidden');
            return;
        }

        let filePath = requestedPath;
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            response.writeHead(404);
            response.end('Not found');
            return;
        }

        response.writeHead(200, {
            'Content-Type': getContentType(filePath),
        });
        fs.createReadStream(filePath).pipe(response);
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(smokePort, '127.0.0.1', () => resolve(server));
    });
};

const findWindowByUrl = async (app, expectedFragment) => {
    const deadline = Date.now() + 15000;

    while (Date.now() < deadline) {
        const windows = app.windows();
        for (const page of windows) {
            try {
                const url = page.url();
                if (url.includes(expectedFragment)) {
                    return page;
                }
            } catch {
                // Ignore transient window access errors while the app initializes.
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error(`Window containing "${expectedFragment}" did not appear within 15s.`);
};

const captureFailureArtifacts = async (app, windows, error) => {
    try {
        const snapshot = {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : null,
            exportedFiles: listExportFiles().map((filePath) => ({
                filePath,
                size: fs.existsSync(filePath) ? fs.statSync(filePath).size : null,
            })),
            logFile: fs.existsSync(smokeLogFile) ? smokeLogFile : null,
            windows: [],
            browserWindows: null,
        };

        for (const [index, page] of windows.entries()) {
            try {
                const screenshotPath = path.join(smokeArtifactDir, `window-${index + 1}.png`);
                await page.screenshot({ path: screenshotPath }).catch(() => {});
                snapshot.windows.push({
                    index,
                    title: await page.title().catch(() => null),
                    url: page.url(),
                    screenshotPath,
                });
            } catch {
                snapshot.windows.push({ index, title: null, url: null, screenshotPath: null });
            }
        }

        if (app) {
            snapshot.browserWindows = await app.evaluate(async ({ BrowserWindow }) => (
                BrowserWindow.getAllWindows().map((win) => ({
                    title: win.getTitle(),
                    visible: win.isVisible(),
                    focused: win.isFocused(),
                    destroyed: win.isDestroyed(),
                    url: win.webContents.getURL(),
                }))
            )).catch(() => null);
        }

        fs.writeFileSync(path.join(smokeArtifactDir, 'failure.json'), JSON.stringify(snapshot, null, 2));
    } catch {
        // Keep the original smoke failure primary.
    }
};

const run = async () => {
    ensureWebpackBundle();
    resetExportDir();
    resetArtifactDir();
    const staticServer = await createStaticServer();
    let app = null;
    let trackedWindows = [];

    try {
        app = await electron.launch({
            args: ['.'],
            cwd: repoRoot,
            env: {
                ...process.env,
                NODE_ENV: 'test',
                AGEOFSCREEN_RELEASE_PROFILE: process.env.AGEOFSCREEN_RELEASE_PROFILE || 'dev',
                AGEOFSCREEN_DEV_TIER: 'pro',
                AGEOFSCREEN_SMOKE_EXPORT_DIR: smokeExportDir,
                AGEOFSCREEN_SMOKE_LOG_FILE: smokeLogFile,
            },
        });

        try {
            const menuWindow = await findWindowByUrl(app, '/menu_window/');
            const triggerWindow = await findWindowByUrl(app, '/trigger_window/');
            trackedWindows = [menuWindow, triggerWindow];

            await menuWindow.waitForLoadState('domcontentloaded');
            await triggerWindow.waitForLoadState('domcontentloaded');

            await app.evaluate(async ({ BrowserWindow }) => {
                const menu = BrowserWindow.getAllWindows().find((win) => win.getTitle() === 'Menu');
                if (!menu) {
                    throw new Error('Menu window was not found in BrowserWindow registry.');
                }
                menu.show();
                menu.focus();
            });

            const menuTitle = await menuWindow.title();
            const triggerTitle = await triggerWindow.title();
            const menuBodyText = await menuWindow.locator('body').textContent({ timeout: 15000 });

            if (menuTitle !== 'Menu') {
                throw new Error(`Unexpected menu window title: ${menuTitle}`);
            }
            if (triggerTitle !== 'Trigger') {
                throw new Error(`Unexpected trigger window title: ${triggerTitle}`);
            }
            if (!menuBodyText || menuBodyText.trim().length < 50) {
                throw new Error('Menu window did not render enough startup content.');
            }

            const radialMenu = menuWindow.locator('svg').first();
            await radialMenu.waitFor({ state: 'attached', timeout: 15000 });
            const radialMenuBox = await radialMenu.boundingBox();
            if (!radialMenuBox) {
                throw new Error('Radial menu SVG did not expose a bounding box.');
            }

            await menuWindow.mouse.click(
                radialMenuBox.x + (radialMenuBox.width / 2),
                radialMenuBox.y + (radialMenuBox.height / 2),
            );

            await menuWindow.waitForSelector('text=Capture Area', { timeout: 15000 });
            await menuWindow.waitForSelector('text=Start Recording', { timeout: 15000 });

            await menuWindow.evaluate(() => {
                (window).menuAPI.openMediaEditor();
            });

            const mediaEditorWindow = await findWindowByUrl(app, '/video_editor_window/');
            trackedWindows = [menuWindow, triggerWindow, mediaEditorWindow];
            await mediaEditorWindow.waitForLoadState('domcontentloaded');
            await mediaEditorWindow.waitForSelector('text=ageofscreen Editor', { timeout: 15000 });

            const mediaEditorTitle = await mediaEditorWindow.title();
            if (mediaEditorTitle !== 'Media Editor') {
                throw new Error(`Unexpected media editor title: ${mediaEditorTitle}`);
            }

            await menuWindow.evaluate((videoPath) => {
                (window).menuAPI.showVideoEditor(videoPath, 'Smoke Test Clip');
            }, sampleVideoPath);

            const initialVideo = await waitForLoadedVideo(mediaEditorWindow, 'Smoke Test Clip');
            await mediaEditorWindow.waitForFunction(() => {
                const bodyText = document.body?.innerText || '';
                return bodyText.includes('IMPORTED VIDEO');
            }, { timeout: 15000 });
            await dismissExistingToast(mediaEditorWindow);

            await mediaEditorWindow.getByRole('button', { name: 'Export' }).click();
            await mediaEditorWindow.getByText('Select Format').waitFor({ timeout: 15000 });
            await mediaEditorWindow.getByRole('button', { name: /Original/i }).click();

            const toastMessage = await waitForToastMessage(mediaEditorWindow, 'Export Successful|Export Complete \\(with limitations\\)|Export Failed|Export Error');
            if (!/Export Successful|Export Complete \(with limitations\)|Export Failed|Export Error/i.test(toastMessage)) {
                throw new Error(`Unexpected export toast in dev smoke: ${toastMessage}`);
            }
            if (!/Export Successful|Export Complete \(with limitations\)/i.test(toastMessage)) {
                throw new Error(`Unexpected export toast in dev smoke: ${toastMessage}`);
            }

            const exportedFile = await waitForExportFile();
            if (!fs.existsSync(exportedFile) || fs.statSync(exportedFile).size <= 0) {
                throw new Error(`Smoke export did not produce a readable output file: ${exportedFile}`);
            }

            await dismissExistingToast(mediaEditorWindow);
            await menuWindow.evaluate((videoPath) => {
                (window).menuAPI.showVideoEditor(videoPath, 'Exported Smoke Clip');
            }, exportedFile);

            const reopenedVideo = await waitForLoadedVideo(mediaEditorWindow, 'Exported Smoke Clip');
            if (!reopenedVideo.currentSrc || reopenedVideo.currentSrc === initialVideo.currentSrc) {
                throw new Error(`Expected exported media to replace the loaded clip, but currentSrc stayed at ${reopenedVideo.currentSrc || '<empty>'}`);
            }
            if (!decodeURIComponent(reopenedVideo.currentSrc).toLowerCase().includes(path.basename(exportedFile).toLowerCase())) {
                throw new Error(`Reopened export did not point at the exported file. currentSrc=${reopenedVideo.currentSrc}`);
            }
            if (reopenedVideo.videoWidth !== initialVideo.videoWidth || reopenedVideo.videoHeight !== initialVideo.videoHeight) {
                throw new Error(`Expected reopened export to preserve frame size ${initialVideo.videoWidth}x${initialVideo.videoHeight}, got ${reopenedVideo.videoWidth}x${reopenedVideo.videoHeight}`);
            }
            if (Math.abs(reopenedVideo.duration - initialVideo.duration) > 0.35) {
                throw new Error(`Expected reopened export duration to stay close to source (${initialVideo.duration}s), got ${reopenedVideo.duration}s`);
            }

            const knownExports = listExportFiles();
            await dismissExistingToast(mediaEditorWindow);
            await mediaEditorWindow.getByRole('button', { name: 'Export' }).click();
            await mediaEditorWindow.getByText('Select Format').waitFor({ timeout: 15000 });
            await mediaEditorWindow.getByRole('button', { name: /Vertical/i }).click();

            const verticalToastMessage = await waitForToastMessage(mediaEditorWindow, 'Export Successful|Export Complete \\(with limitations\\)|Export Failed|Export Error');
            if (!/Export Successful|Export Complete \(with limitations\)/i.test(verticalToastMessage)) {
                throw new Error(`Unexpected vertical export toast in dev smoke: ${verticalToastMessage}`);
            }

            const verticalExportedFile = await waitForExportFile(knownExports);
            if (!fs.existsSync(verticalExportedFile) || fs.statSync(verticalExportedFile).size <= 0) {
                throw new Error(`Vertical smoke export did not produce a readable output file: ${verticalExportedFile}`);
            }

            await dismissExistingToast(mediaEditorWindow);
            await menuWindow.evaluate((videoPath) => {
                (window).menuAPI.showVideoEditor(videoPath, 'Vertical Exported Clip');
            }, verticalExportedFile);

            const reopenedVerticalVideo = await waitForLoadedVideo(mediaEditorWindow, 'Vertical Exported Clip');
            if (/with limitations/i.test(verticalToastMessage)) {
                if (!/ffmpeg/i.test(verticalToastMessage)) {
                    throw new Error(`Expected limitations toast to mention FFmpeg, got: ${verticalToastMessage}`);
                }
                if (
                    reopenedVerticalVideo.videoWidth !== initialVideo.videoWidth
                    || reopenedVerticalVideo.videoHeight !== initialVideo.videoHeight
                ) {
                    throw new Error(`Expected fallback vertical export to keep source size ${initialVideo.videoWidth}x${initialVideo.videoHeight}, got ${reopenedVerticalVideo.videoWidth}x${reopenedVerticalVideo.videoHeight}`);
                }
            } else {
                if (reopenedVerticalVideo.videoWidth !== 1080 || reopenedVerticalVideo.videoHeight !== 1920) {
                    throw new Error(`Expected vertical export to reopen at 1080x1920, got ${reopenedVerticalVideo.videoWidth}x${reopenedVerticalVideo.videoHeight}`);
                }
                if (reopenedVerticalVideo.videoHeight <= reopenedVerticalVideo.videoWidth) {
                    throw new Error(`Expected vertical export to reopen in portrait orientation, got ${reopenedVerticalVideo.videoWidth}x${reopenedVerticalVideo.videoHeight}`);
                }
            }

            console.log('PASS Electron smoke launch round-trips sample media through original and vertical exports, then reloads both files');
        } finally {
            await app.evaluate(async ({ BrowserWindow }) => {
                BrowserWindow.getAllWindows().forEach((win) => {
                    try {
                        win.destroy();
                    } catch {
                        // Ignore teardown errors during smoke cleanup.
                    }
                });
            }).catch(() => {});
            await app.close().catch(() => {});
        }
    } catch (error) {
        await captureFailureArtifacts(app, trackedWindows, error);
        throw error;
    } finally {
        await new Promise((resolve, reject) => {
            staticServer.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
};

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
