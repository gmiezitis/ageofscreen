const fs = require('fs');
const path = require('path');
const { _electron: electron } = require('playwright');

const repoRoot = path.resolve(__dirname, '..');
const sampleVideoPath = path.join(repoRoot, 'test-breath.mp4');
const smokeExportDir = path.join(repoRoot, '.tmp', 'smoke-exports', 'packaged');
const smokeArtifactDir = path.join(repoRoot, '.tmp', 'smoke-artifacts', 'packaged');
const smokeLogFile = path.join(smokeArtifactDir, 'main-process.log');
const requestedPackagedArch = (process.env.AGEOFSCREEN_SMOKE_PACKAGED_ARCH || 'arm64').trim().toLowerCase();

const resolvePackagedExecutable = () => {
    const outRoot = path.join(repoRoot, 'out');
    if (!fs.existsSync(outRoot)) {
        return null;
    }

    const packageDirs = fs.readdirSync(outRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /win32-(x64|arm64)$/i.test(entry.name));
    const packageDir = packageDirs.find((entry) => new RegExp(`win32-${requestedPackagedArch}$`, 'i').test(entry.name))
        || packageDirs[0];
    if (!packageDir) {
        return null;
    }

    const packagedRoot = path.join(outRoot, packageDir.name);
    const packagedExe = fs.readdirSync(packagedRoot)
        .find((name) => /\.exe$/i.test(name) && !/ffmpeg|ffprobe/i.test(name));
    if (!packagedExe) {
        return null;
    }

    return {
        packagedRoot,
        packagedExe: path.join(packagedRoot, packagedExe),
    };
};

const ensurePackagedApp = () => {
    const packagedApp = resolvePackagedExecutable();
    if (!packagedApp || !fs.existsSync(packagedApp.packagedExe)) {
        throw new Error(
            `Missing packaged executable under out/*-win32-${requestedPackagedArch}/*.exe. Build a package before running \`npm run test:smoke:packaged\`.`
        );
    }
    if (!fs.existsSync(sampleVideoPath)) {
        throw new Error(`Missing sample video for packaged smoke testing: ${sampleVideoPath}`);
    }
    return packagedApp;
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

    throw new Error('Timed out waiting for the packaged smoke export file to be created.');
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

const waitForWindowState = async (app, predicate, description) => {
    const deadline = Date.now() + 20000;

    while (Date.now() < deadline) {
        const result = await app.evaluate(async ({ BrowserWindow }) => {
            return BrowserWindow.getAllWindows().map((win) => ({
                title: win.getTitle(),
                visible: win.isVisible(),
                destroyed: win.isDestroyed(),
                focused: win.isFocused(),
                url: win.webContents.getURL(),
            }));
        });

        const match = result.find(predicate);
        if (match) {
            return match;
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(`Timed out waiting for ${description}.`);
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
    const packagedApp = ensurePackagedApp();
    resetExportDir();
    resetArtifactDir();
    let trackedWindows = [];

    const app = await electron.launch({
        executablePath: packagedApp.packagedExe,
        cwd: packagedApp.packagedRoot,
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
        await waitForWindowState(
            app,
            (win) => win.title === 'Menu',
            'the packaged launcher window',
        );
        await waitForWindowState(
            app,
            (win) => win.title === 'Trigger' || (win.visible && /trigger_window|trigger/i.test(win.url || '')),
            'the packaged trigger window',
        );

        const windows = app.windows();
        const menuPage = windows.find((page) => {
            try {
                return page.url().includes('/menu_window/');
            } catch {
                return false;
            }
        });
        const triggerPage = windows.find((page) => {
            try {
                return page.url().includes('/trigger_window/');
            } catch {
                return false;
            }
        });

        if (!menuPage || !triggerPage) {
            throw new Error('Packaged app did not expose the expected menu and trigger pages.');
        }
        trackedWindows = [menuPage, triggerPage];

        await menuPage.waitForLoadState('domcontentloaded');
        await triggerPage.waitForLoadState('domcontentloaded');

        await app.evaluate(async ({ BrowserWindow }) => {
            const menu = BrowserWindow.getAllWindows().find((win) => win.getTitle() === 'Menu');
            if (!menu) {
                throw new Error('Packaged menu window was not found in BrowserWindow registry.');
            }
            menu.show();
            menu.focus();
        });

        const menuBodyText = await menuPage.locator('body').textContent({ timeout: 15000 });
        if (!menuBodyText || menuBodyText.trim().length < 50) {
            throw new Error('Packaged menu window did not render enough startup content.');
        }

        const radialMenu = menuPage.locator('svg').first();
        await radialMenu.waitFor({ state: 'attached', timeout: 15000 });
        const radialMenuBox = await radialMenu.boundingBox();
        if (!radialMenuBox) {
            throw new Error('Packaged radial menu SVG did not expose a bounding box.');
        }

        await menuPage.mouse.click(
            radialMenuBox.x + (radialMenuBox.width / 2),
            radialMenuBox.y + (radialMenuBox.height / 2),
        );

        await menuPage.waitForSelector('text=Capture Area', { timeout: 15000 });
        await menuPage.waitForSelector('text=Start Recording', { timeout: 15000 });

        await menuPage.evaluate(() => {
            (window).menuAPI.openMediaEditor();
        });

        const mediaEditorPage = await (async () => {
            const deadline = Date.now() + 15000;
            while (Date.now() < deadline) {
                const candidate = app.windows().find((page) => {
                    try {
                        return page.url().includes('/video_editor_window/');
                    } catch {
                        return false;
                    }
                });
                if (candidate) return candidate;
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
            throw new Error('Packaged media editor window did not appear within 15s.');
        })();
        trackedWindows = [menuPage, triggerPage, mediaEditorPage];

        await mediaEditorPage.waitForLoadState('domcontentloaded');
        await mediaEditorPage.waitForSelector('text=ageofscreen Editor', { timeout: 15000 });

        const mediaEditorTitle = await mediaEditorPage.title();
        if (mediaEditorTitle !== 'Media Editor') {
            throw new Error(`Unexpected packaged media editor title: ${mediaEditorTitle}`);
        }

        await menuPage.evaluate((videoPath) => {
            (window).menuAPI.showVideoEditor(videoPath, 'Smoke Test Clip');
        }, sampleVideoPath);

        const initialVideo = await waitForLoadedVideo(mediaEditorPage, 'Smoke Test Clip');
        await mediaEditorPage.waitForFunction(() => {
            const bodyText = document.body?.innerText || '';
            return bodyText.includes('IMPORTED VIDEO');
        }, { timeout: 15000 });
        await dismissExistingToast(mediaEditorPage);

        await mediaEditorPage.getByRole('button', { name: 'Export' }).click();
        await mediaEditorPage.getByText('Select Format').waitFor({ timeout: 15000 });
        await mediaEditorPage.getByRole('button', { name: /Original/i }).click();

        const toastMessage = await waitForToastMessage(mediaEditorPage, 'Export Successful|Export Complete \\(with limitations\\)|Export Failed|Export Error');
        if (!/Export Successful|Export Complete \(with limitations\)|Export Failed|Export Error/i.test(toastMessage)) {
            throw new Error(`Unexpected export toast in packaged smoke: ${toastMessage}`);
        }
        if (!/Export Successful|Export Complete \(with limitations\)/i.test(toastMessage)) {
            throw new Error(`Unexpected export toast in packaged smoke: ${toastMessage}`);
        }

        const exportedFile = await waitForExportFile();
        if (!fs.existsSync(exportedFile) || fs.statSync(exportedFile).size <= 0) {
            throw new Error(`Packaged smoke export did not produce a readable output file: ${exportedFile}`);
        }

        await dismissExistingToast(mediaEditorPage);
        await menuPage.evaluate((videoPath) => {
            (window).menuAPI.showVideoEditor(videoPath, 'Exported Smoke Clip');
        }, exportedFile);

        const reopenedVideo = await waitForLoadedVideo(mediaEditorPage, 'Exported Smoke Clip');
        if (!reopenedVideo.currentSrc || reopenedVideo.currentSrc === initialVideo.currentSrc) {
            throw new Error(`Expected exported media to replace the loaded clip, but currentSrc stayed at ${reopenedVideo.currentSrc || '<empty>'}`);
        }
        if (!decodeURIComponent(reopenedVideo.currentSrc).toLowerCase().includes(path.basename(exportedFile).toLowerCase())) {
            throw new Error(`Reopened packaged export did not point at the exported file. currentSrc=${reopenedVideo.currentSrc}`);
        }
        if (reopenedVideo.videoWidth !== initialVideo.videoWidth || reopenedVideo.videoHeight !== initialVideo.videoHeight) {
            throw new Error(`Expected reopened packaged export to preserve frame size ${initialVideo.videoWidth}x${initialVideo.videoHeight}, got ${reopenedVideo.videoWidth}x${reopenedVideo.videoHeight}`);
        }
        if (Math.abs(reopenedVideo.duration - initialVideo.duration) > 0.35) {
            throw new Error(`Expected reopened packaged export duration to stay close to source (${initialVideo.duration}s), got ${reopenedVideo.duration}s`);
        }

        const knownExports = listExportFiles();
        await dismissExistingToast(mediaEditorPage);
        await mediaEditorPage.getByRole('button', { name: 'Export' }).click();
        await mediaEditorPage.getByText('Select Format').waitFor({ timeout: 15000 });
        await mediaEditorPage.getByRole('button', { name: /Vertical/i }).click();

        const verticalToastMessage = await waitForToastMessage(mediaEditorPage, 'Export Successful|Export Complete \\(with limitations\\)|Export Failed|Export Error');
        if (!/Export Successful|Export Complete \(with limitations\)/i.test(verticalToastMessage)) {
            throw new Error(`Unexpected vertical export toast in packaged smoke: ${verticalToastMessage}`);
        }

        const verticalExportedFile = await waitForExportFile(knownExports);
        if (!fs.existsSync(verticalExportedFile) || fs.statSync(verticalExportedFile).size <= 0) {
            throw new Error(`Packaged vertical smoke export did not produce a readable output file: ${verticalExportedFile}`);
        }

        await dismissExistingToast(mediaEditorPage);
        await menuPage.evaluate((videoPath) => {
            (window).menuAPI.showVideoEditor(videoPath, 'Vertical Exported Clip');
        }, verticalExportedFile);

        const reopenedVerticalVideo = await waitForLoadedVideo(mediaEditorPage, 'Vertical Exported Clip');
        if (/with limitations/i.test(verticalToastMessage)) {
            if (!/ffmpeg/i.test(verticalToastMessage)) {
                throw new Error(`Expected packaged limitations toast to mention FFmpeg, got: ${verticalToastMessage}`);
            }
            if (
                reopenedVerticalVideo.videoWidth !== initialVideo.videoWidth
                || reopenedVerticalVideo.videoHeight !== initialVideo.videoHeight
            ) {
                throw new Error(`Expected packaged fallback vertical export to keep source size ${initialVideo.videoWidth}x${initialVideo.videoHeight}, got ${reopenedVerticalVideo.videoWidth}x${reopenedVerticalVideo.videoHeight}`);
            }
        } else {
            if (reopenedVerticalVideo.videoWidth !== 1080 || reopenedVerticalVideo.videoHeight !== 1920) {
                throw new Error(`Expected packaged vertical export to reopen at 1080x1920, got ${reopenedVerticalVideo.videoWidth}x${reopenedVerticalVideo.videoHeight}`);
            }
            if (reopenedVerticalVideo.videoHeight <= reopenedVerticalVideo.videoWidth) {
                throw new Error(`Expected packaged vertical export to reopen in portrait orientation, got ${reopenedVerticalVideo.videoWidth}x${reopenedVerticalVideo.videoHeight}`);
            }
        }

        console.log('PASS Packaged smoke launch round-trips sample media through original and vertical exports, then reloads both files');
    } catch (error) {
        await captureFailureArtifacts(app, trackedWindows, error);
        throw error;
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
};

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
