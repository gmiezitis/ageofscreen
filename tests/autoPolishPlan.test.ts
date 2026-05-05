import assert from 'node:assert/strict';
import { applyKeepRangesToSegments, buildAutoPolishFocusEffects, getBaseTimelineSegments, getTimelineDurationFromSegments, sourceTimeToTimelineTime, stripAutoPolishEffects, timelineTimeToSourceTime } from '../src/videoEditor/autoPolishPlan';
import { hasPendingEditorWork } from '../src/videoEditor/useEditorLibrary';
import { run } from './run';

run('timeline and source time helpers round-trip across edited segments', () => {
    const segments = [
        { id: 'seg-a', startTime: 5, endTime: 8, timelineStart: 0 },
        { id: 'seg-b', startTime: 12, endTime: 14, timelineStart: 3 },
    ] as any;

    assert.equal(sourceTimeToTimelineTime(6.25, segments), 1.25);
    assert.equal(sourceTimeToTimelineTime(12.5, segments), 3.5);
    assert.equal(timelineTimeToSourceTime(1.25, segments), 6.25);
    assert.equal(timelineTimeToSourceTime(3.5, segments), 12.5);
    assert.equal(timelineTimeToSourceTime(9, segments), null);
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

run('timeline duration helper sums kept ranges on the packed timeline', () => {
    assert.equal(getTimelineDurationFromSegments([]), 0);
    assert.equal(getTimelineDurationFromSegments([
        { startSeconds: 1, endSeconds: 3 },
        { startSeconds: 5, endSeconds: 6.5 },
    ]), 3.5);
});

run('stripAutoPolishEffects removes generated auto-polish effects only', () => {
    const stripped = stripAutoPolishEffects([
        { id: 'a', type: 'zoom', startTime: 0, duration: 1, generatedBy: 'auto_polish', label: 'Auto-Polish Focus' } as any,
        { id: 'b', type: 'zoom', startTime: 0, duration: 1, label: 'Manual Focus' } as any,
    ]);

    assert.equal(stripped.length, 1);
    assert.equal(stripped[0].id, 'b');
});

run('auto-polish focus zooms use longer smooth focus timing', () => {
    const effects = buildAutoPolishFocusEffects(
        [
            { type: 'meta', t: 0, x: 0, y: 0, bounds: { x: 0, y: 0, width: 1000, height: 1000 } },
            { type: 'move', t: 1500, x: 430, y: 460 },
            { type: 'click', t: 2000, x: 440, y: 470 },
        ] as any,
        10,
        [{ id: 'seg-1', startTime: 0, endTime: 10, timelineStart: 0 }],
        'smooth_focus',
    );
    const zoom = effects.find((effect) => effect.type === 'zoom');

    assert.ok(zoom);
    assert.equal(zoom?.label, 'Auto-Polish Focus');
    assert.ok((zoom?.duration ?? 0) >= 4.4);
    assert.ok((zoom?.startTime ?? 10) <= 1.65);
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
