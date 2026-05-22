import assert from 'node:assert/strict';
import { buildVisualTimelineSceneItems, closeVisualGapsInTimelineScene, getActivePreviewTransition, insertImageClipIntoTimelineScene, mapDisplayTimeAfterClosingVisualGaps, mapDisplayTimeAfterCrossfadeCompaction, remapTimedRangeAfterClosingVisualGaps, remapTimedRangeAfterCrossfadeCompaction, reorderVisualTimelineSceneItems, resolveClipTransitionType, upsertClipTransition } from '../src/videoEditor/timelineScene';
import { run } from './run';

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
