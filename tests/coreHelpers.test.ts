import assert from 'node:assert/strict';
import path from 'node:path';
import { isPathInsideDirectory, isSupportedCaptureInvokeType, isSupportedMediaDialogType, isSupportedMediaFilePath } from '../src/shared/pathSecurity';
import { fromMediaFileUrl, toMediaFileUrl } from '../src/shared/mediaPaths';
import { parseWindowHandleFromSourceId } from '../src/shared/windowBounds';
import { applyKeepRangesToSegments, getBaseTimelineSegments, sourceTimeToTimelineTime, stripAutoPolishEffects } from '../src/videoEditor/autoPolishPlan';
import { DEFAULT_ZOOM_INTENSITY, getDefaultEffectIntensity, getEffectIntensity } from '../src/videoEditor/effectIntensity';
import { buildVisualTimelineSceneItems, closeVisualGapsInTimelineScene, getActivePreviewTransition, insertImageClipIntoTimelineScene, mapDisplayTimeAfterClosingVisualGaps, reorderVisualTimelineSceneItems, resolveClipTransitionType, upsertClipTransition } from '../src/videoEditor/timelineScene';
import { findImageClipAtDisplayTime, getDisplayTimeForVideoTime, getSeekTargetForDisplayTime, getSegmentThumbnailSampleTimes, resolvePlaybackStartTarget } from '../src/videoEditor/timelineClips';
import { prepareCursorPreviewData, getPreviewCursorPoint, getInterpolatedValue } from '../src/videoEditor/utils';

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
    const tempDir = path.join('C:', 'Temp', 'snipfocus');
    assert.equal(isPathInsideDirectory(path.join(tempDir, 'clip.webm'), tempDir), true);
    assert.equal(isPathInsideDirectory(path.join(tempDir, '..', 'elsewhere', 'clip.webm'), tempDir), false);
    assert.equal(isSupportedMediaDialogType('video'), true);
    assert.equal(isSupportedMediaDialogType('folder'), false);
    assert.equal(isSupportedCaptureInvokeType('get-displays'), true);
    assert.equal(isSupportedCaptureInvokeType('open-everything'), false);
    assert.equal(isSupportedMediaFilePath(path.join(tempDir, 'clip.webm')), true);
    assert.equal(isSupportedMediaFilePath(path.join(tempDir, 'script.ps1')), false);
});

run('media paths round-trip through the app media protocol', () => {
    const physicalPath = path.join('C:', 'Temp', 'snipfocus', 'clip.webm');
    const mediaUrl = toMediaFileUrl(physicalPath);

    assert.ok(mediaUrl.startsWith('snipfocus-media://local/'));
    assert.equal(fromMediaFileUrl(mediaUrl).replace(/\\/g, '/'), physicalPath.replace(/\\/g, '/'));
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

run('getInterpolatedValue interpolates correctly when keyframes are unsorted', () => {
    const keyframes = [
        { time: 2, value: 20 },
        { time: 0, value: 0 },
        { time: 1, value: 10 },
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
