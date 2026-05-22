import assert from 'node:assert/strict';
import path from 'node:path';
import { PRINT_SCREEN_SLEEP_GRACE_MS, getMenuSleepSuppressedUntil, isMenuSleepSuppressed } from '../src/menu/menuLifecycle';
import { normalizeCameraShape } from '../src/shared/cameraShapes';
import { fromMediaFileUrl, toMediaFileUrl } from '../src/shared/mediaPaths';
import { isPathInsideDirectory, isSupportedCaptureInvokeType, isSupportedMediaDialogType, isSupportedMediaFilePath } from '../src/shared/pathSecurity';
import { parseWindowHandleFromSourceId } from '../src/shared/windowBounds';
import { run } from './run';

run('parseWindowHandleFromSourceId accepts valid Electron window source ids', () => {
    assert.equal(parseWindowHandleFromSourceId('window:12345:0'), '12345');
    assert.equal(parseWindowHandleFromSourceId('window:987654321'), '987654321');
});

run('parseWindowHandleFromSourceId rejects malformed or unsafe ids', () => {
    assert.equal(parseWindowHandleFromSourceId('window:1;Start-Process calc:0'), null);
    assert.equal(parseWindowHandleFromSourceId('window:not-a-number:0'), null);
    assert.equal(parseWindowHandleFromSourceId('screen:123:0'), null);
    assert.equal(parseWindowHandleFromSourceId(''), null);
});

run('path and IPC validation helpers accept only supported values', () => {
    const tempDir = path.join('C:', 'Temp', 'ageofscreen');
    assert.equal(isPathInsideDirectory(path.join(tempDir, 'clip.webm'), tempDir), true);
    assert.equal(isPathInsideDirectory(path.join(tempDir, '..', 'elsewhere', 'clip.webm'), tempDir), false);
    assert.equal(isSupportedMediaDialogType('video'), true);
    assert.equal(isSupportedMediaDialogType('folder'), false);
    assert.equal(isSupportedCaptureInvokeType('get-displays'), true);
    assert.equal(isSupportedCaptureInvokeType('open-everything'), false);
    assert.equal(isSupportedMediaFilePath(path.join(tempDir, 'clip.webm')), true);
    assert.equal(isSupportedMediaFilePath(path.join(tempDir, 'script.ps1')), false);
});

run('legacy camera shapes normalize to the supported webcam set', () => {
    assert.equal(normalizeCameraShape('arrow'), 'hexagon');
    assert.equal(normalizeCameraShape('wand'), 'hexagon');
    assert.equal(normalizeCameraShape('rounded'), 'square');
    assert.equal(normalizeCameraShape('hexagon'), 'hexagon');
});

run('media paths round-trip through the app media protocol', () => {
    const physicalPath = path.join('C:', 'Temp', 'ageofscreen', 'clip.webm');
    const mediaUrl = toMediaFileUrl(physicalPath);

    assert.ok(mediaUrl.startsWith('ageofscreen-media://local/'));
    assert.equal(fromMediaFileUrl(mediaUrl).replace(/\\/g, '/'), physicalPath.replace(/\\/g, '/'));
});

run('manual menu open suppresses sleep only for a short grace window', () => {
    const openedAt = 1_000;
    const suppressedUntil = getMenuSleepSuppressedUntil({ reason: 'manual', openedAt } as any);

    assert.equal(suppressedUntil, openedAt + PRINT_SCREEN_SLEEP_GRACE_MS);
    assert.equal(isMenuSleepSuppressed(suppressedUntil, openedAt + 120), true);
    assert.equal(isMenuSleepSuppressed(suppressedUntil, suppressedUntil), false);
});
