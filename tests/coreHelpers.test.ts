import assert from 'node:assert/strict';
import path from 'node:path';
import { normalizeCameraShape } from '../src/shared/cameraShapes';
import { isPathInsideDirectory, isSupportedCaptureInvokeType, isSupportedMediaDialogType, isSupportedMediaFilePath } from '../src/shared/pathSecurity';
import { fromMediaFileUrl, toMediaFileUrl } from '../src/shared/mediaPaths';
import { parseWindowHandleFromSourceId } from '../src/shared/windowBounds';
import { PRINT_SCREEN_SLEEP_GRACE_MS, getMenuSleepSuppressedUntil, isMenuSleepSuppressed } from '../src/menu/menuLifecycle';
import { applyKeepRangesToSegments, getBaseTimelineSegments, sourceTimeToTimelineTime, stripAutoPolishEffects } from '../src/videoEditor/autoPolishPlan';
import { DEFAULT_ZOOM_INTENSITY, getDefaultEffectIntensity, getEffectIntensity } from '../src/videoEditor/effectIntensity';
import { computeZoomCropStartOffset } from '../src/videoEditor/effectMath';
import { getPreviewOverlayFrameSize, getRenderedVideoFrameSize, resolveExportFrameStyle, resolveExportOutputFrameSize, resolveRenderExportFrameStyle, scaleTextOverlayForExport } from '../src/videoEditor/exportOverlayMath';
import { buildVisualTimelineSceneItems, closeVisualGapsInTimelineScene, getActivePreviewTransition, insertImageClipIntoTimelineScene, mapDisplayTimeAfterClosingVisualGaps, mapDisplayTimeAfterCrossfadeCompaction, remapTimedRangeAfterClosingVisualGaps, remapTimedRangeAfterCrossfadeCompaction, reorderVisualTimelineSceneItems, resolveClipTransitionType, upsertClipTransition } from '../src/videoEditor/timelineScene';
import { getCursorHighlightAnchor, getCursorHighlightOverlayOpacity, getCursorHighlightPixelSize, resolveCursorHighlightPlaybackConfig } from '../src/videoEditor/cursorStyling';
import { findImageClipAtDisplayTime, getDisplayTimeForVideoTime, getSeekTargetForDisplayTime, getSegmentThumbnailSampleTimes, resolvePlaybackStartTarget } from '../src/videoEditor/timelineClips';
import { normalizeCursorHighlightSettings } from '../src/videoEditor/types';
import { getPreviewCropForDisplay, isNoOpCrop, normalizeAppliedCrop } from '../src/videoEditor/useCrop';
import { hasPendingEditorWork } from '../src/videoEditor/useEditorLibrary';
import { buildCursorMotionActiveRanges, invertTimeRanges, isTimeWithinRanges, prepareCursorPreviewData, getEffectStyle, getPreviewCursorPoint, getInterpolatedValue, isCursorReplacementSafe } from '../src/videoEditor/utils';
import { buildSmartTrackingEffects } from '../src/videoEditor/smartTracking';

const run = (name: string, fn: () => void) => {
    fn();
    console.log(`PASS ${name}`);
};

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

run('cursor replacement safety respects recorded suppression metadata', () => {
    assert.equal(isCursorReplacementSafe([]), false);
    assert.equal(isCursorReplacementSafe([{ type: 'meta', nativeCursorSuppressed: true }, { type: 'move', x: 10, y: 10, t: 0 }]), true);
    assert.equal(isCursorReplacementSafe([{ type: 'meta', nativeCursorSuppressed: false }, { type: 'move', x: 10, y: 10, t: 0 }]), false);
    assert.equal(isCursorReplacementSafe([{ type: 'meta' }, { type: 'move', x: 10, y: 10, t: 0 }]), true);
    assert.equal(isCursorReplacementSafe([{ type: 'meta' }]), false);
});

run('cursor playback config keeps smooth tracking without reintroducing a second cursor layer', () => {
    const suppressed = resolveCursorHighlightPlaybackConfig([
        { type: 'meta', nativeCursorSuppressed: true },
        { type: 'move', x: 10, y: 10, t: 0 },
    ] as any);
    const direct = resolveCursorHighlightPlaybackConfig([
        { type: 'meta', nativeCursorSuppressed: true },
        { type: 'move', x: 10, y: 10, t: 0 },
    ] as any, {
        enabled: true,
        smoothMotion: false,
    });
    const unsuppressed = resolveCursorHighlightPlaybackConfig([
        { type: 'meta', nativeCursorSuppressed: false },
        { type: 'move', x: 10, y: 10, t: 0 },
    ] as any);
    const legacy = resolveCursorHighlightPlaybackConfig([
        { type: 'meta' },
        { type: 'move', x: 10, y: 10, t: 0 },
    ] as any);

    assert.equal(suppressed.trackMode, 'smooth');
    assert.equal(suppressed.nativeCursorSuppressed, true);
    assert.equal(direct.trackMode, 'direct');
    assert.equal(direct.nativeCursorSuppressed, true);
    assert.equal(unsuppressed.trackMode, 'smooth');
    assert.equal(unsuppressed.nativeCursorSuppressed, false);
    assert.equal(legacy.trackMode, 'smooth');
    assert.equal(legacy.nativeCursorSuppressed, false);
});

run('cursor highlight anchor biases the halo around the visible pointer body', () => {
    const anchor = getCursorHighlightAnchor(64);

    assert.ok(anchor.centerOffsetX > 0);
    assert.ok(anchor.centerOffsetY > 0);
    assert.ok(anchor.hotspotX < 32);
    assert.ok(anchor.hotspotY < 32);
});

run('cursor highlight settings keep new shapes and migrate legacy rounded shape', () => {
    assert.equal(normalizeCursorHighlightSettings({ shape: 'heart' as any }).shape, 'heart');
    assert.equal(normalizeCursorHighlightSettings({ shape: 'arrow' as any }).shape, 'arrow');
    assert.equal(normalizeCursorHighlightSettings({ shape: 'text_cursor' as any }).shape, 'text_cursor');
    assert.equal(normalizeCursorHighlightSettings({ shape: 'rounded_square' as any }).shape, 'circle');
});

run('cursor highlight settings default to smooth motion and preserve explicit opt-out', () => {
    assert.equal(normalizeCursorHighlightSettings().smoothMotion, true);
    assert.equal(normalizeCursorHighlightSettings({ smoothMotion: false }).smoothMotion, false);
});

run('cursor highlight size and opacity controls map to visibly different overlay output', () => {
    const frameSize = { width: 1920, height: 1080 };
    const smaller = normalizeCursorHighlightSettings({ size: 1, opacity: 0.18 });
    const larger = normalizeCursorHighlightSettings({ size: 8, opacity: 0.8 });

    assert.ok(getCursorHighlightPixelSize(larger, frameSize) > getCursorHighlightPixelSize(smaller, frameSize));
    assert.ok(getCursorHighlightOverlayOpacity(larger) > getCursorHighlightOverlayOpacity(smaller));
});

run('zoom precedence follows editor effect order when overlaps exist', () => {
    const leftZoom = {
        id: 'zoom-left',
        type: 'zoom',
        label: 'Left',
        startTime: 0,
        duration: 2,
        zoomArea: { x: 0, y: 30, width: 20, height: 20 },
    } as any;
    const rightZoom = {
        id: 'zoom-right',
        type: 'zoom',
        label: 'Right',
        startTime: 0,
        duration: 2,
        zoomArea: { x: 80, y: 30, width: 20, height: 20 },
    } as any;

    const leftThenRight = getEffectStyle([leftZoom, rightZoom], 1);
    const rightThenLeft = getEffectStyle([rightZoom, leftZoom], 1);

    assert.equal(leftThenRight.contentStyle.transformOrigin, '90% 40%');
    assert.equal(rightThenLeft.contentStyle.transformOrigin, '10% 40%');
});

run('export overlay helpers scale text styling into the real render frame', () => {
    assert.deepEqual(
        getRenderedVideoFrameSize({ width: 1920, height: 1080 }, { x: 10, y: 5, width: 50, height: 50 }),
        { width: 960, height: 540 },
    );
    assert.deepEqual(
        getPreviewOverlayFrameSize(
            { width: 1440, height: 810 },
            { width: 1600, height: 900 },
            { x: 10, y: 5, width: 50, height: 50 },
        ),
        { width: 1600, height: 900 },
    );

    const scaled = scaleTextOverlayForExport({
        id: 'text-1',
        text: 'Hello',
        startTime: 0,
        duration: 3,
        x: 50,
        y: 50,
        fontSize: 24,
        color: '#ffffff',
        padding: 10,
        borderWidth: 2,
        shadowOffsetX: 3,
        shadowOffsetY: 4,
    }, { width: 960, height: 540 }, { width: 1920, height: 1080 });

    assert.equal(scaled.fontSize, 48);
    assert.equal(scaled.padding, 20);
    assert.equal(scaled.borderWidth, 4);
    assert.equal(scaled.shadowOffsetX, 6);
    assert.equal(scaled.shadowOffsetY, 8);
});

run('original export stays edge-to-edge only when no framing was requested', () => {
    assert.deepEqual(
        resolveExportFrameStyle({
            selectedPlatform: 'original',
            backgroundColor: '#000000',
            videoPadding: 18,
        }),
        { backgroundColor: '#000000', videoPadding: 18 },
    );

    assert.deepEqual(
        resolveExportFrameStyle({
            selectedPlatform: 'original',
            backgroundColor: '#0f172a',
            videoPadding: 18,
        }),
        { backgroundColor: '#0f172a', videoPadding: 18 },
    );

    assert.deepEqual(
        resolveExportFrameStyle({
            selectedPlatform: 'vertical',
            backgroundColor: '#000000',
            videoPadding: 4,
        }),
        { backgroundColor: '#000000', videoPadding: 4 },
    );
});

run('render export collapses the untouched original default frame but preserves intentional styling', () => {
    assert.deepEqual(
        resolveRenderExportFrameStyle({
            selectedPlatform: 'original',
            backgroundColor: '#000000',
            videoPadding: 4,
        }),
        { backgroundColor: 'transparent', videoPadding: 0 },
    );

    assert.deepEqual(
        resolveRenderExportFrameStyle({
            selectedPlatform: 'original',
            backgroundColor: '#0f172a',
            videoPadding: 2,
        }),
        { backgroundColor: 'transparent', videoPadding: 0 },
    );

    assert.deepEqual(
        resolveRenderExportFrameStyle({
            selectedPlatform: 'original',
            backgroundColor: '#ff6600',
            videoPadding: 4,
        }),
        { backgroundColor: '#ff6600', videoPadding: 4 },
    );

    assert.deepEqual(
        resolveRenderExportFrameStyle({
            selectedPlatform: 'original',
            backgroundColor: '#000000',
            videoPadding: 12,
        }),
        { backgroundColor: '#000000', videoPadding: 12 },
    );
});

run('export output frame size follows the selected platform preset', () => {
    assert.deepEqual(
        resolveExportOutputFrameSize({
            selectedPlatform: 'vertical',
            sourceFrameSize: { width: 1920, height: 1080 },
        }),
        { width: 1080, height: 1920 },
    );

    assert.deepEqual(
        resolveExportOutputFrameSize({
            selectedPlatform: 'square',
            sourceFrameSize: { width: 1280, height: 720 },
        }),
        { width: 1080, height: 1080 },
    );

    assert.deepEqual(
        resolveExportOutputFrameSize({
            selectedPlatform: 'original',
            sourceFrameSize: { width: 1280, height: 720 },
        }),
        { width: 1280, height: 720 },
    );
});

run('prepareCursorPreviewData caches prepared cursor metadata for stable arrays', () => {
    const cursorData = [
        { type: 'meta', bounds: { x: 0, y: 0, width: 200, height: 100 } },
        { type: 'move', x: 10, y: 10, t: 0 },
        { type: 'move', x: 30, y: 20, t: 20 },
        { type: 'click', x: 40, y: 25, t: 40 },
    ];

    const first = prepareCursorPreviewData(cursorData);
    const second = prepareCursorPreviewData(cursorData);

    assert.ok(first);
    assert.equal(first, second);
    assert.equal(first.cursorEvents.length, 3);
});

run('getPreviewCursorPoint returns normalized direct and smooth preview points', () => {
    const cursorData = [
        { type: 'meta', bounds: { x: 0, y: 0, width: 100, height: 100 } },
        { type: 'move', x: 10, y: 10, t: 0 },
        { type: 'move', x: 30, y: 30, t: 100 },
        { type: 'move', x: 60, y: 60, t: 200 },
        { type: 'click', x: 90, y: 90, t: 300 },
    ];

    const direct = getPreviewCursorPoint(cursorData, 0.15, 'direct');
    const smooth = getPreviewCursorPoint(cursorData, 0.15, 'smooth');

    assert.ok(direct);
    assert.ok(smooth);
    assert.ok(direct.x > 30 && direct.x < 60);
    assert.ok(direct.y > 30 && direct.y < 60);
    assert.ok(smooth.x >= 0 && smooth.x <= 100);
    assert.ok(smooth.y >= 0 && smooth.y <= 100);
});

run('cursor motion ranges ignore the synthetic start sample and stay active after movement', () => {
    const cursorData = [
        { type: 'meta', bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
        { type: 'move', x: 100, y: 200, t: 0 },
        { type: 'click', x: 100, y: 200, t: 400 },
        { type: 'move', x: 132, y: 220, t: 1000 },
        { type: 'move', x: 172, y: 260, t: 1200 },
    ];

    const activeRanges = buildCursorMotionActiveRanges(cursorData, 1, 3);
    const inactiveRanges = invertTimeRanges(activeRanges, 3);

    assert.deepEqual(activeRanges, [{ startTime: 1, endTime: 2.2 }]);
    assert.deepEqual(inactiveRanges, [{ startTime: 0, endTime: 1 }, { startTime: 2.2, endTime: 3 }]);
    assert.equal(isTimeWithinRanges(0.5, activeRanges), false);
    assert.equal(isTimeWithinRanges(1.6, activeRanges), true);
    assert.equal(isTimeWithinRanges(2.25, activeRanges), false);
});

run('smart tracking emits focus zooms from move-only Store metadata', () => {
    const events = [
        { type: 'meta', t: 0, x: 0, y: 0, bounds: { x: 0, y: 0, width: 1000, height: 800 } },
        { type: 'move', t: 0, x: 420, y: 280 },
        { type: 'move', t: 220, x: 424, y: 282 },
        { type: 'move', t: 440, x: 427, y: 283 },
        { type: 'move', t: 660, x: 425, y: 281 },
        { type: 'move', t: 880, x: 426, y: 284 },
        { type: 'move', t: 1100, x: 428, y: 282 },
        { type: 'move', t: 1320, x: 430, y: 283 },
        { type: 'move', t: 1540, x: 429, y: 282 },
    ] as any[];
    const effects = buildSmartTrackingEffects(events, { durationHint: 6, profile: 'smooth_focus' });
    const zoom = effects.find((effect) => effect.type === 'zoom');
    const exposure = effects.find((effect) => effect.type === 'exposure');

    assert.ok(zoom);
    assert.equal(zoom?.label, 'SMART FOCUS');
    assert.ok(exposure);
});

run('getInterpolatedValue interpolates correctly when keyframes are unsorted', () => {
    const keyframes = [
        { id: '1', time: 2, value: 20 },
        { id: '2', time: 0, value: 0 },
        { id: '3', time: 1, value: 10 },
    ];

    assert.equal(getInterpolatedValue(keyframes, 0.5, -1), 5);
    assert.equal(getInterpolatedValue(keyframes, 1.5, -1), 15);
});

run('zoom effects use the shared lighter default intensity', () => {
    assert.equal(DEFAULT_ZOOM_INTENSITY, 15);
    assert.equal(getDefaultEffectIntensity('zoom'), 15);
    assert.equal(getDefaultEffectIntensity('slow_zoom'), 15);
    assert.equal(getDefaultEffectIntensity('blur_area'), 100);
    assert.equal(getEffectIntensity({ type: 'zoom', intensity: undefined } as any), 15);
    assert.equal(getEffectIntensity({ type: 'slow_zoom', intensity: undefined } as any), 15);
    assert.equal(getEffectIntensity({ type: 'zoom', intensity: 48 } as any), 48);
});

run('zoom crop math preserves off-center focus before centering blend', () => {
    const centered = computeZoomCropStartOffset(240, 200, 0.5, 0);
    const leftBiased = computeZoomCropStartOffset(240, 200, 0.1, 0);
    const rightBiased = computeZoomCropStartOffset(240, 200, 0.9, 0);
    const fullyCentered = computeZoomCropStartOffset(240, 200, 0.9, 1);

    assert.equal(centered, 20);
    assert.equal(leftBiased, 4);
    assert.equal(rightBiased, 36);
    assert.equal(fullyCentered, 116);
});

run('crop preview reopens on the uncropped source frame', () => {
    const appliedCrop = { x: 58, y: 4, width: 34, height: 76 };

    assert.equal(getPreviewCropForDisplay(true, appliedCrop), null);
    assert.deepEqual(getPreviewCropForDisplay(false, appliedCrop), appliedCrop);
});

run('no-op crop helper clears near-full selections', () => {
    assert.equal(isNoOpCrop(null), true);
    assert.equal(isNoOpCrop({ x: 0.2, y: 0.4, width: 99.4, height: 99.1 }), true);
    assert.equal(isNoOpCrop({ x: 0.8, y: 0.4, width: 99.4, height: 99.1 }), false);
    assert.equal(normalizeAppliedCrop({ x: 0.2, y: 0.4, width: 99.4, height: 99.1 }), null);
    assert.deepEqual(normalizeAppliedCrop({ x: 12, y: 8, width: 60, height: 72 }), { x: 12, y: 8, width: 60, height: 72 });
});

run('media replacement guard only prompts when real editor work exists', () => {
    assert.equal(hasPendingEditorWork({
        mediaPath: null,
        historyLength: 4,
        smartEffectCount: 1,
        audioSegmentCount: 0,
        overlayImageCount: 0,
        imageClipCount: 0,
        textOverlayCount: 0,
        annotationOverlayCount: 0,
        clipTransitionCount: 0,
        hasCrop: false,
    }), false);

    assert.equal(hasPendingEditorWork({
        mediaPath: 'C:/Temp/clip.webm',
        historyLength: 0,
        smartEffectCount: 0,
        audioSegmentCount: 0,
        overlayImageCount: 0,
        imageClipCount: 0,
        textOverlayCount: 0,
        annotationOverlayCount: 0,
        clipTransitionCount: 0,
        hasCrop: false,
    }), false);

    assert.equal(hasPendingEditorWork({
        mediaPath: 'C:/Temp/clip.webm',
        historyLength: 0,
        smartEffectCount: 0,
        audioSegmentCount: 0,
        overlayImageCount: 0,
        imageClipCount: 0,
        textOverlayCount: 0,
        annotationOverlayCount: 0,
        clipTransitionCount: 1,
        hasCrop: false,
    }), true);
});

run('clip transition helpers resolve overrides and drop default duplicates', () => {
    const transitions = upsertClipTransition([], 'clip-a', 'clip-b', 'crossfade', 'cut');
    const resetToDefault = upsertClipTransition(transitions, 'clip-a', 'clip-b', 'cut', 'cut');

    assert.equal(resolveClipTransitionType(transitions, 'clip-a', 'clip-b', 'cut'), 'crossfade');
    assert.equal(resolveClipTransitionType(resetToDefault, 'clip-a', 'clip-b', 'cut'), 'cut');
    assert.equal(resetToDefault.length, 0);
});

run('preview transition helper activates around adjacent image and video joins', () => {
    const items = buildVisualTimelineSceneItems([
        { id: 'seg-1', startTime: 0, endTime: 4, timelineStart: 0 },
        { id: 'seg-2', startTime: 4, endTime: 8, timelineStart: 6 },
    ], [
        { id: 'clip-1', file: 'still.png', startTime: 4, duration: 2, name: 'Still' },
    ]);

    const fadeTransition = getActivePreviewTransition(items, [
        { fromItemId: 'seg-1', toItemId: 'clip-1', type: 'crossfade' },
        { fromItemId: 'clip-1', toItemId: 'seg-2', type: 'dip_to_black' },
    ], 'cut', 3.94);
    const dipTransition = getActivePreviewTransition(items, [
        { fromItemId: 'seg-1', toItemId: 'clip-1', type: 'crossfade' },
        { fromItemId: 'clip-1', toItemId: 'seg-2', type: 'dip_to_black' },
    ], 'cut', 5.98);

    assert.ok(fadeTransition);
    assert.equal(fadeTransition?.fromItem.id, 'seg-1');
    assert.equal(fadeTransition?.toItem.id, 'clip-1');
    assert.equal(fadeTransition?.type, 'crossfade');
    assert.ok((fadeTransition?.progress ?? 0) > 0);
    assert.ok(dipTransition);
    assert.equal(dipTransition?.type, 'dip_to_black');
    assert.ok((dipTransition?.blackOverlayOpacity ?? 0) > 0);
});

run('image clip lookup drops the clip exactly at its end boundary', () => {
    const clip = { id: 'clip-1', file: 'still.png', startTime: 4, duration: 2, name: 'Still' };

    assert.equal(findImageClipAtDisplayTime([clip], 5.999), clip);
    assert.equal(findImageClipAtDisplayTime([clip], 6), null);
});

run('timeline seek target hands off from image end to the next video', () => {
    const target = getSeekTargetForDisplayTime([
        { id: 'seg-1', startTime: 0, endTime: 4, timelineStart: 0 },
        { id: 'seg-2', startTime: 4, endTime: 8, timelineStart: 6 },
    ], [
        { id: 'clip-1', file: 'still.png', startTime: 4, duration: 2, name: 'Still' },
    ], 6);

    assert.equal(target?.kind, 'video');
    assert.equal(target?.segmentId, 'seg-2');
    assert.equal(target?.displayTime, 6);
    assert.equal(target?.videoTime, 4);
});

run('auto-polish segment helpers preserve and remap kept ranges correctly', () => {
    const baseSegments = getBaseTimelineSegments([], 10);
    assert.equal(baseSegments.length, 1);
    assert.equal(baseSegments[0].startTime, 0);
    assert.equal(baseSegments[0].endTime, 10);

    const remapped = applyKeepRangesToSegments(baseSegments, [
        { startSeconds: 1, endSeconds: 3 },
        { startSeconds: 5, endSeconds: 7 },
    ]);

    assert.equal(remapped.length, 2);
    assert.equal(remapped[0].timelineStart, 0);
    assert.equal(remapped[1].timelineStart, 2);
    assert.equal(sourceTimeToTimelineTime(6, remapped), 3);
});

run('stripAutoPolishEffects removes generated auto-polish effects only', () => {
    const stripped = stripAutoPolishEffects([
        { id: 'a', type: 'zoom', startTime: 0, duration: 1, generatedBy: 'auto_polish', label: 'Auto-Polish Focus' } as any,
        { id: 'b', type: 'zoom', startTime: 0, duration: 1, label: 'Manual Focus' } as any,
    ]);

    assert.equal(stripped.length, 1);
    assert.equal(stripped[0].id, 'b');
});

run('timeline scene insert image clip keeps timeline items in sync', () => {
    const nextScene = insertImageClipIntoTimelineScene({
        segments: [
            { id: 'seg-1', startTime: 0, endTime: 10, timelineStart: 0 },
        ],
        imageClips: [],
        audioSegments: [
            { id: 'audio-1', file: 'track.mp3', name: 'Track', startTime: 6, duration: 2, volume: 1 },
        ],
        smartEffects: [
            { id: 'fx-1', type: 'zoom', label: 'Zoom', startTime: 7, duration: 1 } as any,
        ],
        overlayImages: [
            { id: 'overlay-1', file: 'overlay.png', startTime: 8, duration: 1, x: 10, y: 10, width: 100, height: 100 },
        ],
        textOverlays: [
            { id: 'text-1', text: 'Hello', startTime: 9, duration: 1, x: 50, y: 50, fontSize: 24, color: '#fff' },
        ],
        annotationOverlays: [
            { id: 'ann-1', type: 'rectangle', startTime: 5.5, duration: 1, x: 10, y: 10, width: 40, height: 20, color: '#f00', lineWidth: 2, size: 'm' } as any,
        ],
    }, {
        id: 'clip-1',
        file: 'still.png',
        startTime: 4,
        duration: 2,
        name: 'Still',
    });

    assert.equal(nextScene.segments.length, 2);
    assert.equal(nextScene.segments[0].endTime, 4);
    assert.equal(nextScene.segments[1].startTime, 4);
    assert.equal(nextScene.segments[1].timelineStart, 6);
    assert.equal(nextScene.imageClips[0].startTime, 4);
    assert.equal(nextScene.audioSegments[0].startTime, 8);
    assert.equal(nextScene.smartEffects[0].startTime, 9);
    assert.equal(nextScene.overlayImages[0].startTime, 10);
    assert.equal(nextScene.textOverlays[0].startTime, 11);
    assert.equal(nextScene.annotationOverlays[0].startTime, 7.5);
});

run('timeline scene close gaps compresses visual and timed items consistently', () => {
    const nextScene = closeVisualGapsInTimelineScene({
        segments: [
            { id: 'seg-1', startTime: 0, endTime: 4, timelineStart: 0 },
            { id: 'seg-2', startTime: 4, endTime: 8, timelineStart: 10 },
        ],
        imageClips: [
            { id: 'clip-1', file: 'still.png', startTime: 6, duration: 2, name: 'Still' },
        ],
        audioSegments: [
            { id: 'audio-gap', file: 'gap.mp3', name: 'Gap audio', startTime: 5, duration: 1, volume: 1 },
            { id: 'audio-late', file: 'late.mp3', name: 'Late audio', startTime: 11, duration: 1, volume: 1 },
        ],
        smartEffects: [
            { id: 'fx-gap', type: 'zoom', label: 'Gap Zoom', startTime: 9, duration: 1 } as any,
        ],
        overlayImages: [
            { id: 'overlay-1', file: 'overlay.png', startTime: 9, duration: 1, x: 10, y: 10, width: 100, height: 100 },
        ],
        textOverlays: [
            { id: 'text-1', text: 'Hello', startTime: 11, duration: 1, x: 50, y: 50, fontSize: 24, color: '#fff' },
        ],
        annotationOverlays: [
            { id: 'ann-1', type: 'rectangle', startTime: 10, duration: 1, x: 10, y: 10, width: 40, height: 20, color: '#f00', lineWidth: 2, size: 'm' } as any,
        ],
    });

    assert.equal(nextScene.imageClips[0].startTime, 4);
    assert.equal(nextScene.segments[1].timelineStart, 6);
    assert.equal(nextScene.audioSegments.find((item) => item.id === 'audio-gap')?.startTime, 4);
    assert.equal(nextScene.audioSegments.find((item) => item.id === 'audio-late')?.startTime, 7);
    assert.equal(nextScene.smartEffects[0].startTime, 6);
    assert.equal(nextScene.overlayImages[0].startTime, 6);
    assert.equal(nextScene.textOverlays[0].startTime, 7);
    assert.equal(nextScene.annotationOverlays[0].startTime, 6);
});

run('timeline scene gap closure remaps playhead time onto the packed timeline', () => {
    const remappedTime = mapDisplayTimeAfterClosingVisualGaps({
        segments: [
            { id: 'seg-1', startTime: 0, endTime: 4, timelineStart: 0 },
            { id: 'seg-2', startTime: 4, endTime: 8, timelineStart: 10 },
        ],
        imageClips: [
            { id: 'clip-1', file: 'still.png', startTime: 6, duration: 2, name: 'Still' },
        ],
        audioSegments: [],
        smartEffects: [],
        overlayImages: [],
        textOverlays: [],
        annotationOverlays: [],
    }, 11.5);

    assert.equal(remappedTime, 7.5);
});

run('timeline scene gap closure shortens timed ranges that span removed gaps', () => {
    const scene = {
        segments: [
            { id: 'seg-1', startTime: 0, endTime: 4, timelineStart: 0 },
            { id: 'seg-2', startTime: 4, endTime: 8, timelineStart: 6 },
        ],
        imageClips: [],
        audioSegments: [],
        smartEffects: [],
        overlayImages: [],
        textOverlays: [],
        annotationOverlays: [],
    };

    const remappedRange = remapTimedRangeAfterClosingVisualGaps(scene, 3, 4);
    const packedScene = closeVisualGapsInTimelineScene({
        ...scene,
        smartEffects: [
            { id: 'fx-span', type: 'zoom', label: 'Span', startTime: 3, duration: 4 } as any,
        ],
    });

    assert.equal(remappedRange.startTime, 3);
    assert.equal(remappedRange.duration, 2);
    assert.equal(packedScene.smartEffects[0].startTime, 3);
    assert.equal(packedScene.smartEffects[0].duration, 2);
});

run('crossfade compaction remaps export time after the transition boundary', () => {
    const items = buildVisualTimelineSceneItems(
        [
            { id: 'seg-1', startTime: 0, endTime: 4, timelineStart: 0 },
            { id: 'seg-2', startTime: 4, endTime: 8, timelineStart: 4 },
        ],
        [],
    );

    const remappedTime = mapDisplayTimeAfterCrossfadeCompaction(
        items,
        [{ fromItemId: 'seg-1', toItemId: 'seg-2', type: 'crossfade' }],
        'cut',
        5,
    );

    assert.equal(remappedTime, 4.76);
});

run('crossfade compaction shortens timed ranges that span the transition boundary', () => {
    const items = buildVisualTimelineSceneItems(
        [
            { id: 'seg-1', startTime: 0, endTime: 4, timelineStart: 0 },
            { id: 'seg-2', startTime: 4, endTime: 8, timelineStart: 4 },
        ],
        [],
    );

    const remappedRange = remapTimedRangeAfterCrossfadeCompaction(
        items,
        [{ fromItemId: 'seg-1', toItemId: 'seg-2', type: 'crossfade' }],
        'cut',
        3.5,
        1,
    );

    assert.equal(remappedRange.startTime, 3.5);
    assert.ok(Math.abs(remappedRange.duration - 0.76) < 0.0001);
});

run('timeline scene reorder moves image clips between split videos and keeps timed items aligned', () => {
    const nextScene = reorderVisualTimelineSceneItems({
        segments: [
            { id: 'seg-1', startTime: 0, endTime: 4, timelineStart: 0 },
            { id: 'seg-2', startTime: 4, endTime: 8, timelineStart: 4 },
        ],
        imageClips: [
            { id: 'clip-1', file: 'still.png', startTime: 8, duration: 2, name: 'Still' },
        ],
        audioSegments: [
            { id: 'audio-clip', file: 'clip.mp3', name: 'Clip audio', startTime: 8.5, duration: 0.8, volume: 1 },
            { id: 'audio-seg', file: 'seg.mp3', name: 'Seg audio', startTime: 4.5, duration: 0.8, volume: 1 },
        ],
        smartEffects: [
            { id: 'fx-clip', type: 'zoom', label: 'Clip zoom', startTime: 9, duration: 0.5 } as any,
            { id: 'fx-seg', type: 'zoom', label: 'Seg zoom', startTime: 5, duration: 0.5 } as any,
        ],
        overlayImages: [
            { id: 'overlay-clip', file: 'overlay.png', startTime: 8.25, duration: 0.5, x: 10, y: 10, width: 100, height: 100 },
        ],
        textOverlays: [
            { id: 'text-seg', text: 'Hello', startTime: 4.25, duration: 0.5, x: 50, y: 50, fontSize: 24, color: '#fff' },
        ],
        annotationOverlays: [
            { id: 'ann-clip', type: 'rectangle', startTime: 8.75, duration: 0.5, x: 10, y: 10, width: 40, height: 20, color: '#f00', lineWidth: 2, size: 'm' } as any,
        ],
    }, 'clip-1', 1);

    assert.ok(nextScene);
    assert.equal(nextScene?.segments[0].timelineStart, 0);
    assert.equal(nextScene?.imageClips[0].startTime, 4);
    assert.equal(nextScene?.segments[1].timelineStart, 6);
    assert.equal(nextScene?.audioSegments.find((item) => item.id === 'audio-clip')?.startTime, 4.5);
    assert.equal(nextScene?.audioSegments.find((item) => item.id === 'audio-seg')?.startTime, 6.5);
    assert.equal(nextScene?.smartEffects.find((item) => item.id === 'fx-clip')?.startTime, 5);
    assert.equal(nextScene?.smartEffects.find((item) => item.id === 'fx-seg')?.startTime, 7);
    assert.equal(nextScene?.overlayImages[0].startTime, 4.25);
    assert.equal(nextScene?.textOverlays[0].startTime, 6.25);
    assert.equal(nextScene?.annotationOverlays[0].startTime, 4.75);
});

run('video time mapping stays pinned to video segments and skips gaps cleanly', () => {
    const segments = [
        { id: 'seg-1', startTime: 0, endTime: 5, timelineStart: 0 },
        { id: 'seg-2', startTime: 10, endTime: 15, timelineStart: 7 },
    ];

    assert.equal(getDisplayTimeForVideoTime(2, segments), 2);
    assert.equal(getDisplayTimeForVideoTime(12, segments), 9);
    assert.equal(getDisplayTimeForVideoTime(6, segments), 5);
    assert.equal(getDisplayTimeForVideoTime(99, segments), 12);
});

run('timeline seek target snaps gap clicks to the next playable item', () => {
    const target = getSeekTargetForDisplayTime([
        { id: 'seg-1', startTime: 0, endTime: 5, timelineStart: 0 },
        { id: 'seg-2', startTime: 10, endTime: 15, timelineStart: 7 },
    ], [], 6);

    assert.equal(target?.kind, 'video');
    assert.equal(target?.displayTime, 7);
    assert.equal(target?.videoTime, 10);
});

run('segment thumbnail sampling stays inside the trimmed source span', () => {
    const sampleTimes = getSegmentThumbnailSampleTimes({
        id: 'seg-1',
        startTime: 5,
        endTime: 11,
        timelineStart: 0,
    });

    assert.ok(sampleTimes.length >= 2);
    assert.ok(sampleTimes.every((time) => time > 5 && time < 11));
    assert.ok(sampleTimes[0] < sampleTimes[sampleTimes.length - 1]);
});

run('playback target resolution prefers the visible playhead over stale stored targets', () => {
    const target = resolvePlaybackStartTarget(
        [
            { id: 'seg-1', startTime: 0, endTime: 5, timelineStart: 0 },
            { id: 'seg-2', startTime: 10, endTime: 15, timelineStart: 7 },
        ],
        [],
        9,
        0,
        {
            pendingTarget: { kind: 'video', segmentId: 'seg-1', displayTime: 0, videoTime: 0 },
            pinnedTarget: { kind: 'video', segmentId: 'seg-1', displayTime: 0, videoTime: 0 },
        },
    );

    assert.equal(target?.kind, 'video');
    assert.equal(target?.segmentId, 'seg-2');
    assert.equal(target?.displayTime, 9);
    assert.equal(target?.videoTime, 12);
});
