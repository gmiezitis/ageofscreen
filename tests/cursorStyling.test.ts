import assert from 'node:assert/strict';
import { buildMappedCursorTimedTrack } from '../src/videoEditor/cursorStyling';
import { buildCursorMotionActiveRanges, getInterpolatedValue, getPreviewCursorPoint, getEffectStyle, invertTimeRanges, isTimeWithinRanges, prepareCursorPreviewData } from '../src/videoEditor/utils';
import { run } from './run';

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

run('getInterpolatedValue interpolates correctly when keyframes are unsorted', () => {
    const keyframes = [
        { id: '1', time: 2, value: 20 },
        { id: '2', time: 0, value: 0 },
        { id: '3', time: 1, value: 10 },
    ];

    assert.equal(getInterpolatedValue(keyframes, 0.5, -1), 5);
    assert.equal(getInterpolatedValue(keyframes, 1.5, -1), 15);
});

run('mapped cursor tracks can sample source time while emitting export timeline points', () => {
    const cursorData = [
        { type: 'meta', x: 0, y: 0, t: 0 },
        { type: 'move', x: 10, y: 20, t: 5000 },
        { type: 'move', x: 90, y: 80, t: 6000 },
    ] as any;

    const track = buildMappedCursorTimedTrack(
        cursorData,
        0,
        1,
        (time) => time + 5,
        undefined,
        45,
        'follow',
    );

    assert.ok(track.length > 0);
    assert.equal(track[0].time, 0);
    assert.ok(track[0].x >= 10 && track[0].x <= 30);
    assert.ok(track[track.length - 1].x >= 70 && track[track.length - 1].x <= 90);
    assert.equal(track[track.length - 1].time, 1);
});
