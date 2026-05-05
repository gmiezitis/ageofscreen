import assert from 'node:assert/strict';
import { findImageClipAtDisplayTime, getDisplayTimeForVideoTime, getSeekTargetForDisplayTime, getSegmentThumbnailSampleTimes, resolvePlaybackStartTarget } from '../src/videoEditor/timelineClips';
import { run } from './run';

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
