import type { InteractionEvent } from '../services/metadataRecorder';
import { getFollowCursorPoint, getPreviewCursorPoint, mapCursorPointToViewport } from './utils';

type CropRect = { x: number; y: number; width: number; height: number } | null | undefined;

const CURSOR_TRACK_SAMPLE_STEP = 1 / 45;
const CURSOR_TRACK_MOVE_THRESHOLD = 0.02;
const CURSOR_TRACK_TIME_THRESHOLD = 0.05;
export const FOLLOW_CURSOR_TRACK_MAX_POINTS = 128;

export type CursorTrackMode = 'smooth' | 'direct' | 'follow';

const sampleTimedTrack = <T extends { time: number }>(points: T[], maxPoints: number): T[] => {
    if (points.length <= maxPoints || maxPoints < 2) return points;

    const result: T[] = [];
    const lastIndex = points.length - 1;
    for (let i = 0; i < maxPoints; i += 1) {
        const index = i === maxPoints - 1
            ? lastIndex
            : Math.round((i * lastIndex) / (maxPoints - 1));
        const point = points[index];
        if (result[result.length - 1] !== point) {
            result.push(point);
        }
    }

    return result;
};

const compressTimedTrack = (
    points: Array<{ time: number; x: number; y: number }>
): Array<{ time: number; x: number; y: number }> => points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return Math.abs(point.x - previous.x) > CURSOR_TRACK_MOVE_THRESHOLD
        || Math.abs(point.y - previous.y) > CURSOR_TRACK_MOVE_THRESHOLD
        || point.time - previous.time > CURSOR_TRACK_TIME_THRESHOLD;
});

const appendTrackEndpoint = (
    points: Array<{ time: number; x: number; y: number }>,
    cursorData: InteractionEvent[] | undefined,
    endTime: number,
    cropRect?: CropRect,
    mode: CursorTrackMode = 'smooth',
) => {
    if (endTime <= 0) return points;

    const lastPoint = points[points.length - 1];
    if (lastPoint && Math.abs(lastPoint.time - endTime) < 0.001) {
        return points;
    }

    const previewPoint = mode === 'follow'
        ? getFollowCursorPoint(cursorData, endTime)
        : getPreviewCursorPoint(cursorData, endTime, mode);
    const viewportPoint = mapCursorPointToViewport(previewPoint, cropRect);
    if (!viewportPoint) return points;

    return [
        ...points,
        {
            time: Number(endTime.toFixed(3)),
            x: Number(viewportPoint.x.toFixed(3)),
            y: Number(viewportPoint.y.toFixed(3)),
        },
    ];
};

export const buildCursorTimedTrack = (
    cursorData: InteractionEvent[] | undefined,
    startTime: number,
    endTime: number,
    cropRect?: CropRect,
    maxPoints = FOLLOW_CURSOR_TRACK_MAX_POINTS,
    mode: CursorTrackMode = 'smooth',
    leadSeconds = 0,
): Array<{ time: number; x: number; y: number }> => {
    if (!Array.isArray(cursorData) || cursorData.length === 0 || endTime <= startTime) return [];

    const points: Array<{ time: number; x: number; y: number }> = [];
    for (let time = startTime; time <= endTime + 0.001; time += CURSOR_TRACK_SAMPLE_STEP) {
        const sampleTime = Math.max(startTime, Math.min(endTime, time + leadSeconds));
        const point = mode === 'follow'
            ? getFollowCursorPoint(cursorData, sampleTime)
            : getPreviewCursorPoint(cursorData, sampleTime, mode);
        const viewportPoint = mapCursorPointToViewport(point, cropRect);
        if (!viewportPoint) continue;
        points.push({
            time: Number(time.toFixed(3)),
            x: Number(viewportPoint.x.toFixed(3)),
            y: Number(viewportPoint.y.toFixed(3)),
        });
    }

    const withEndpoint = appendTrackEndpoint(points, cursorData, endTime, cropRect, mode);
    return sampleTimedTrack(compressTimedTrack(withEndpoint), maxPoints);
};

export const buildMappedCursorTimedTrack = (
    cursorData: InteractionEvent[] | undefined,
    startTime: number,
    endTime: number,
    resolveCursorTime: (time: number) => number | null,
    cropRect?: CropRect,
    maxPoints = FOLLOW_CURSOR_TRACK_MAX_POINTS,
    mode: CursorTrackMode = 'smooth',
    leadSeconds = 0,
): Array<{ time: number; x: number; y: number }> => {
    if (!Array.isArray(cursorData) || cursorData.length === 0 || endTime <= startTime) return [];

    const points: Array<{ time: number; x: number; y: number }> = [];
    for (let time = startTime; time <= endTime + 0.001; time += CURSOR_TRACK_SAMPLE_STEP) {
        const sampleTime = Math.max(startTime, Math.min(endTime, time + leadSeconds));
        const cursorTime = resolveCursorTime(sampleTime);
        if (cursorTime == null) continue;

        const point = mode === 'follow'
            ? getFollowCursorPoint(cursorData, cursorTime)
            : getPreviewCursorPoint(cursorData, cursorTime, mode);
        const viewportPoint = mapCursorPointToViewport(point, cropRect);
        if (!viewportPoint) continue;

        points.push({
            time: Number(time.toFixed(3)),
            x: Number(viewportPoint.x.toFixed(3)),
            y: Number(viewportPoint.y.toFixed(3)),
        });
    }

    const resolvedEndTime = resolveCursorTime(endTime);
    const previewEndpoint = resolvedEndTime == null
        ? null
        : mode === 'follow'
            ? getFollowCursorPoint(cursorData, resolvedEndTime)
            : getPreviewCursorPoint(cursorData, resolvedEndTime, mode);
    const viewportEndpoint = mapCursorPointToViewport(previewEndpoint, cropRect);
    const withEndpoint = viewportEndpoint
        ? [
            ...points,
            {
                time: Number(endTime.toFixed(3)),
                x: Number(viewportEndpoint.x.toFixed(3)),
                y: Number(viewportEndpoint.y.toFixed(3)),
            },
        ]
        : points;

    return sampleTimedTrack(compressTimedTrack(withEndpoint), maxPoints);
};
