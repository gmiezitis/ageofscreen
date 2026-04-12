import { Keyframe, SmartEffect } from './types';
import { DEFAULT_ZOOM_INTENSITY, getEffectIntensity } from './effectIntensity';

export const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const lerp = (a: number, b: number, t: number): number => {
    return a + (b - a) * t;
};

const sortedKeyframeCache = new WeakMap<Keyframe[], Keyframe[]>();

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const clampPreviewPoint = (point: { x: number; y: number }): { x: number; y: number } => ({
    x: clampPercent(point.x),
    y: clampPercent(point.y),
});

export const getInterpolatedValue = (keyframes: Keyframe[] | undefined, time: number, defaultValue: number): number => {
    if (!keyframes || keyframes.length === 0) return defaultValue;
    if (keyframes.length === 1) return keyframes[0].value;

    const cachedSorted = sortedKeyframeCache.get(keyframes);
    const sorted = cachedSorted ?? [...keyframes].sort((a, b) => a.time - b.time);
    if (!cachedSorted) {
        sortedKeyframeCache.set(keyframes, sorted);
    }

    if (time <= sorted[0].time) return sorted[0].value;
    if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;

    for (let i = 0; i < sorted.length - 1; i++) {
        const k1 = sorted[i];
        const k2 = sorted[i + 1];
        if (time >= k1.time && time <= k2.time) {
            const t = (time - k1.time) / (k2.time - k1.time);
            return lerp(k1.value, k2.value, t);
        }
    }

    return defaultValue;
};

import {
    normalizeArea,
    computeBaseZoom,
    computeZoomFactor,
    computeEffectiveCx,
    computeFollowCursorCoord,
    computeSafeFocusCoord,
    computeFocusCenteringOffset,
    computeZoomEdgeDamping,
    computeTilt,
    computeEffectFadeRatio,
    effectEnvelope,
    PREVIEW_ZOOM_CENTER_STRENGTH,
} from './effectMath';


const SMART_EFFECT_LABELS: Record<SmartEffect['type'], string> = {
    zoom: 'Focus Zoom',
    slow_zoom: 'Camera Drift',
    breathing: 'Ambient Pulse',
    blur_area: 'Blur Area',
    exposure: 'Flash Accent',
    '3d_tilt': 'Legacy Depth Tilt',
    card_flip: 'Legacy Flip',
};

const AUTO_GENERATED_EFFECT_LABELS = new Set(
    Object.keys(SMART_EFFECT_LABELS).flatMap((type) => [
        type,
        type.replace(/_/g, ' '),
        type.replace(/_/g, ' ').toUpperCase(),
    ])
);

export const getSmartEffectLabel = (type: SmartEffect['type'], label?: string | null): string => {
    const preferred = SMART_EFFECT_LABELS[type] ?? type.replace(/_/g, ' ');
    const trimmed = label?.trim();
    if (!trimmed) return preferred;
    const normalized = trimmed.toLowerCase();
    if (AUTO_GENERATED_EFFECT_LABELS.has(normalized) || AUTO_GENERATED_EFFECT_LABELS.has(trimmed)) {
        return preferred;
    }
    return trimmed;
};
export interface EffectStyleSet {
    windowStyle: React.CSSProperties;
    contentStyle: React.CSSProperties;
    filter: string;
    boxShadow: string;
}

export interface PreviewEffectFrame {
    left: number;
    top: number;
    width: number;
    height: number;
    containerWidth: number;
    containerHeight: number;
}

const toPreviewCursorPoint = (event: any, bounds: any): { x: number; y: number } | null => {
    if (!event || typeof event.x !== 'number' || typeof event.y !== 'number') return null;

    if (bounds && typeof bounds.width === 'number' && typeof bounds.height === 'number' && bounds.width > 0 && bounds.height > 0) {
        return {
            x: ((event.x - (bounds.x ?? 0)) / bounds.width) * 100,
            y: ((event.y - (bounds.y ?? 0)) / bounds.height) * 100,
        };
    }

    return { x: event.x, y: event.y };
};

type PreparedCursorPreviewData = {
    bounds: any;
    cursorEvents: Array<{ t: number; x: number; y: number; type: 'move' | 'click' }>;
    smoothedCursorEvents: Array<{ t: number; x: number; y: number; type: 'move' | 'click' }>;
    clickEvents: Array<{ t: number; x: number; y: number; type: 'click' }>;
};

const cursorPreviewDataCache = new WeakMap<any[], PreparedCursorPreviewData>();

const CURSOR_CLICK_ACTIVE_MS = 130;
const CURSOR_SMOOTHING_MIN_ALPHA = 0.16;
const CURSOR_SMOOTHING_MAX_ALPHA = 0.5;
const CURSOR_SMOOTHING_SPEED_REF = 180;
const CURSOR_MOTION_DISTANCE_THRESHOLD_PX = 0.5;

const catmullRomInterpolate = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
        (2 * p1)
        + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
};

const findLastEventIndexAtOrBeforeTime = <T extends { t: number }>(
    events: T[],
    targetTime: number,
): number => {
    let low = 0;
    let high = events.length - 1;
    let result = -1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (events[mid].t <= targetTime) {
            result = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return result;
};

const findNearestClickTimestamp = (
    clickEvents: Array<{ t: number }>,
    targetTime: number,
): number | null => {
    if (clickEvents.length === 0) {
        return null;
    }

    const previousIndex = findLastEventIndexAtOrBeforeTime(clickEvents, targetTime);
    const candidates = [
        previousIndex >= 0 ? clickEvents[previousIndex] : null,
        previousIndex + 1 < clickEvents.length ? clickEvents[previousIndex + 1] : null,
    ].filter((event): event is { t: number } => !!event);

    if (candidates.length === 0) {
        return null;
    }

    const nearest = candidates.reduce((closest, event) => (
        Math.abs(event.t - targetTime) < Math.abs(closest.t - targetTime) ? event : closest
    ));

    return Math.abs(nearest.t - targetTime) <= CURSOR_CLICK_ACTIVE_MS ? nearest.t : null;
};

const buildAdaptiveSmoothedCursorEvents = (
    cursorEvents: Array<{ t: number; x: number; y: number; type: 'move' | 'click' }>
): Array<{ t: number; x: number; y: number; type: 'move' | 'click' }> => {
    if (cursorEvents.length <= 2) return cursorEvents;

    const forwardPass = cursorEvents.map((event) => ({ ...event }));
    for (let i = 1; i < cursorEvents.length; i += 1) {
        const previous = forwardPass[i - 1];
        const current = cursorEvents[i];
        const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
        const deltaMs = Math.max(1, current.t - cursorEvents[i - 1].t);
        const speedPerSecond = (distance * 1000) / deltaMs;
        const normalizedSpeed = Math.max(0, Math.min(1, speedPerSecond / CURSOR_SMOOTHING_SPEED_REF));
        const alpha = current.type === 'click'
            ? CURSOR_SMOOTHING_MAX_ALPHA
            : lerp(CURSOR_SMOOTHING_MIN_ALPHA, CURSOR_SMOOTHING_MAX_ALPHA, normalizedSpeed);

        forwardPass[i] = {
            ...current,
            x: clampPercent(lerp(previous.x, current.x, alpha)),
            y: clampPercent(lerp(previous.y, current.y, alpha)),
        };
    }

    const backwardPass = forwardPass.map((event) => ({ ...event }));
    for (let i = forwardPass.length - 2; i >= 0; i -= 1) {
        const next = backwardPass[i + 1];
        const current = forwardPass[i];
        const distance = Math.hypot(next.x - current.x, next.y - current.y);
        const deltaMs = Math.max(1, cursorEvents[i + 1].t - cursorEvents[i].t);
        const speedPerSecond = (distance * 1000) / deltaMs;
        const normalizedSpeed = Math.max(0, Math.min(1, speedPerSecond / CURSOR_SMOOTHING_SPEED_REF));
        const alpha = current.type === 'click'
            ? CURSOR_SMOOTHING_MAX_ALPHA * 0.82
            : lerp(CURSOR_SMOOTHING_MIN_ALPHA * 0.95, CURSOR_SMOOTHING_MAX_ALPHA * 0.82, normalizedSpeed);

        backwardPass[i] = {
            ...current,
            x: clampPercent(lerp(next.x, current.x, alpha)),
            y: clampPercent(lerp(next.y, current.y, alpha)),
        };
    }

    return cursorEvents.map((event, index) => {
        if (event.type === 'click') {
            return { ...event };
        }

        const forwardPoint = forwardPass[index];
        const backwardPoint = backwardPass[index];
        return {
            ...event,
            x: clampPercent((forwardPoint.x + backwardPoint.x) / 2),
            y: clampPercent((forwardPoint.y + backwardPoint.y) / 2),
        };
    });
};

export const prepareCursorPreviewData = (recordedCursorData: any[] | undefined): PreparedCursorPreviewData | null => {
    if (!Array.isArray(recordedCursorData) || recordedCursorData.length === 0) return null;

    const cached = cursorPreviewDataCache.get(recordedCursorData);
    if (cached) return cached;

    const bounds = recordedCursorData.find((event) => event?.type === 'meta' && event?.bounds)?.bounds;
    const cursorEvents = recordedCursorData
        .filter((event) =>
            event
            && typeof event.t === 'number'
            && (event.type === 'move' || event.type === 'click')
            && typeof event.x === 'number'
            && typeof event.y === 'number'
        )
        .map((event) => {
            const point = toPreviewCursorPoint(event, bounds);
            if (!point) return null;
            return {
                type: event.type as 'move' | 'click',
                t: event.t,
                x: clampPercent(point.x),
                y: clampPercent(point.y),
            };
        })
        .filter((event): event is { t: number; x: number; y: number; type: 'move' | 'click' } => !!event);
    const clickEvents = cursorEvents
        .filter((event) => event.type === 'click')
        .map((event) => ({ ...event, type: 'click' as const }));

    const prepared = {
        bounds,
        cursorEvents,
        smoothedCursorEvents: buildAdaptiveSmoothedCursorEvents(cursorEvents),
        clickEvents,
    };
    cursorPreviewDataCache.set(recordedCursorData, prepared);
    return prepared;
};

export const getNativeCursorSuppressionState = (recordedCursorData: any[] | undefined): boolean | null => {
    if (!Array.isArray(recordedCursorData) || recordedCursorData.length === 0) return null;

    const metaEvent = recordedCursorData.find((event) => event?.type === 'meta');
    return typeof metaEvent?.nativeCursorSuppressed === 'boolean'
        ? metaEvent.nativeCursorSuppressed
        : null;
};

export const isCursorReplacementSafe = (recordedCursorData: any[] | undefined): boolean => {
    if (!Array.isArray(recordedCursorData) || recordedCursorData.length === 0) return false;

    const hasCursorTimeline = recordedCursorData.some((event) => event?.type === 'move' || event?.type === 'click');
    if (!hasCursorTimeline) return false;

    const nativeCursorSuppressed = getNativeCursorSuppressionState(recordedCursorData);
    if (nativeCursorSuppressed != null) {
        return nativeCursorSuppressed;
    }

    // Legacy ageofscreen recordings can have cursor metadata without the newer
    // nativeCursorSuppressed flag. Keep cursor tools available for that data.
    return true;
};

export type TimeRange = {
    startTime: number;
    endTime: number;
};

const mergeTimeRanges = (ranges: TimeRange[]): TimeRange[] => {
    const normalized = ranges
        .map((range) => ({
            startTime: Math.max(0, Number.isFinite(range.startTime) ? Number(range.startTime.toFixed(3)) : 0),
            endTime: Math.max(0, Number.isFinite(range.endTime) ? Number(range.endTime.toFixed(3)) : 0),
        }))
        .filter((range) => range.endTime > range.startTime)
        .sort((a, b) => a.startTime - b.startTime);

    if (normalized.length === 0) {
        return [];
    }

    return normalized.reduce<TimeRange[]>((merged, range) => {
        const previous = merged[merged.length - 1];
        if (!previous || range.startTime > previous.endTime) {
            merged.push({ ...range });
            return merged;
        }

        previous.endTime = Math.max(previous.endTime, range.endTime);
        return merged;
    }, []);
};

const getCursorPositionEvents = (
    recordedCursorData: any[] | undefined,
): Array<{ type: 'move' | 'click'; x: number; y: number; t: number }> => (
    Array.isArray(recordedCursorData)
        ? recordedCursorData
            .filter((event) =>
                event
                && typeof event.t === 'number'
                && (event.type === 'move' || event.type === 'click')
                && typeof event.x === 'number'
                && typeof event.y === 'number'
            )
            .map((event) => ({
                type: event.type as 'move' | 'click',
                x: event.x,
                y: event.y,
                t: event.t,
            }))
            .sort((a, b) => a.t - b.t)
        : []
);

export const buildCursorMotionActiveRanges = (
    recordedCursorData: any[] | undefined,
    holdSeconds: number,
    totalDuration = Number.POSITIVE_INFINITY,
): TimeRange[] => {
    const cursorEvents = getCursorPositionEvents(recordedCursorData);
    if (cursorEvents.length < 2) {
        return [];
    }

    const safeHoldSeconds = Math.max(0, Number.isFinite(holdSeconds) ? holdSeconds : 0);
    const activeRanges: TimeRange[] = [];

    let previousEvent = cursorEvents[0];
    for (let index = 1; index < cursorEvents.length; index += 1) {
        const currentEvent = cursorEvents[index];
        const movementDistance = Math.hypot(currentEvent.x - previousEvent.x, currentEvent.y - previousEvent.y);

        if (currentEvent.type === 'move' && movementDistance >= CURSOR_MOTION_DISTANCE_THRESHOLD_PX) {
            const startTime = Math.max(0, currentEvent.t / 1000);
            const unclampedEndTime = startTime + safeHoldSeconds;
            const endTime = Number.isFinite(totalDuration)
                ? Math.min(totalDuration, unclampedEndTime)
                : unclampedEndTime;

            if (endTime > startTime) {
                activeRanges.push({
                    startTime,
                    endTime,
                });
            }
        }

        previousEvent = currentEvent;
    }

    return mergeTimeRanges(activeRanges);
};

export const invertTimeRanges = (
    ranges: TimeRange[],
    totalDuration: number,
): TimeRange[] => {
    if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
        return [];
    }

    const normalizedRanges = mergeTimeRanges(
        ranges.map((range) => ({
            startTime: Math.max(0, Math.min(totalDuration, range.startTime)),
            endTime: Math.max(0, Math.min(totalDuration, range.endTime)),
        })),
    );

    if (normalizedRanges.length === 0) {
        return [{ startTime: 0, endTime: Number(totalDuration.toFixed(3)) }];
    }

    const invertedRanges: TimeRange[] = [];
    let cursor = 0;

    for (const range of normalizedRanges) {
        if (range.startTime > cursor) {
            invertedRanges.push({
                startTime: Number(cursor.toFixed(3)),
                endTime: Number(range.startTime.toFixed(3)),
            });
        }
        cursor = Math.max(cursor, range.endTime);
    }

    if (cursor < totalDuration) {
        invertedRanges.push({
            startTime: Number(cursor.toFixed(3)),
            endTime: Number(totalDuration.toFixed(3)),
        });
    }

    return invertedRanges.filter((range) => range.endTime > range.startTime);
};

export const isTimeWithinRanges = (
    time: number,
    ranges: TimeRange[],
): boolean => {
    if (!Number.isFinite(time) || ranges.length === 0) {
        return false;
    }

    let low = 0;
    let high = ranges.length - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const range = ranges[mid];

        if (time < range.startTime) {
            high = mid - 1;
            continue;
        }
        if (time > range.endTime) {
            low = mid + 1;
            continue;
        }
        return true;
    }

    return false;
};

export type PreviewCursorState = {
    x: number;
    y: number;
    isClicking: boolean;
    clickTimestamp: number | null;
};

export const mapCursorPointToViewport = (
    point: { x: number; y: number } | null,
    crop: { x: number; y: number; width: number; height: number } | null | undefined
): { x: number; y: number } | null => {
    if (!point) return null;
    if (!crop || (crop.x <= 0.5 && crop.y <= 0.5 && crop.width >= 99 && crop.height >= 99)) {
        return clampPreviewPoint(point);
    }

    const safeWidth = Math.max(0.0001, crop.width);
    const safeHeight = Math.max(0.0001, crop.height);

    return clampPreviewPoint({
        x: ((point.x - crop.x) / safeWidth) * 100,
        y: ((point.y - crop.y) / safeHeight) * 100,
    });
};

export const mapCursorStateToViewport = (
    state: PreviewCursorState | null,
    crop: { x: number; y: number; width: number; height: number } | null | undefined
): PreviewCursorState | null => {
    if (!state) return null;
    const point = mapCursorPointToViewport({ x: state.x, y: state.y }, crop);
    if (!point) return null;
    return {
        ...state,
        x: point.x,
        y: point.y,
    };
};

export const getPreviewCursorState = (
    recordedCursorData: any[] | undefined,
    displayTime: number,
    mode: 'smooth' | 'direct' = 'smooth'
): PreviewCursorState | null => {
    const prepared = prepareCursorPreviewData(recordedCursorData);
    if (!prepared) return null;

    const cursorEvents = mode === 'smooth' ? prepared.smoothedCursorEvents : prepared.cursorEvents;
    const { clickEvents } = prepared;
    const targetTime = Math.round(displayTime * 1000);

    if (cursorEvents.length === 0) return null;

    const previousIndex = findLastEventIndexAtOrBeforeTime(cursorEvents, targetTime);
    const safePreviousIndex = previousIndex >= 0 ? previousIndex : 0;
    const previousEvent = cursorEvents[safePreviousIndex];
    const nextIndex = previousIndex >= 0 ? previousIndex + 1 : -1;
    const nextEvent = nextIndex >= 0 && nextIndex < cursorEvents.length ? cursorEvents[nextIndex] : null;

    let interpolatedPoint = { x: previousEvent.x, y: previousEvent.y };
    if (nextEvent) {
        if (nextEvent.t > previousEvent.t) {
            const t = Math.max(0, Math.min(1, (targetTime - previousEvent.t) / (nextEvent.t - previousEvent.t)));
            if (mode === 'smooth') {
                const beforeEvent = cursorEvents[Math.max(0, safePreviousIndex - 1)] ?? previousEvent;
                const afterEvent = cursorEvents[Math.min(cursorEvents.length - 1, nextIndex + 1)] ?? nextEvent;
                interpolatedPoint = clampPreviewPoint({
                    x: catmullRomInterpolate(beforeEvent.x, previousEvent.x, nextEvent.x, afterEvent.x, t),
                    y: catmullRomInterpolate(beforeEvent.y, previousEvent.y, nextEvent.y, afterEvent.y, t),
                });
            } else {
                interpolatedPoint = {
                    x: lerp(previousEvent.x, nextEvent.x, t),
                    y: lerp(previousEvent.y, nextEvent.y, t),
                };
            }
        }
    }

    const nearestClickTimestamp = findNearestClickTimestamp(clickEvents, targetTime);

    if (mode === 'direct') {
        const directPoint = clampPreviewPoint(interpolatedPoint);
        return {
            ...directPoint,
            isClicking: nearestClickTimestamp !== null,
            clickTimestamp: nearestClickTimestamp,
        };
    }

    return {
        ...clampPreviewPoint(interpolatedPoint),
        isClicking: nearestClickTimestamp !== null,
        clickTimestamp: nearestClickTimestamp,
    };
};

export const getPreviewCursorPoint = (
    recordedCursorData: any[] | undefined,
    displayTime: number,
    mode: 'smooth' | 'direct' = 'smooth'
): { x: number; y: number } | null => {
    const state = getPreviewCursorState(recordedCursorData, displayTime, mode);
    if (!state) return null;
    return { x: state.x, y: state.y };
};

export const getFollowCursorPoint = (
    recordedCursorData: any[] | undefined,
    displayTime: number,
): { x: number; y: number } | null => {
    const weightedSamples = [
        { offset: -0.18, weight: 0.18 },
        { offset: -0.12, weight: 0.22 },
        { offset: -0.07, weight: 0.20 },
        { offset: -0.03, weight: 0.16 },
        { offset: 0, weight: 0.12 },
        { offset: 0.03, weight: 0.08 },
        { offset: 0.07, weight: 0.04 },
    ];

    let sumX = 0;
    let sumY = 0;
    let totalWeight = 0;

    for (const sample of weightedSamples) {
        const point = getPreviewCursorPoint(recordedCursorData, Math.max(0, displayTime + sample.offset), 'smooth');
        if (!point) continue;
        sumX += point.x * sample.weight;
        sumY += point.y * sample.weight;
        totalWeight += sample.weight;
    }

    if (totalWeight <= 0) {
        return getPreviewCursorPoint(recordedCursorData, displayTime, 'smooth');
    }

    return clampPreviewPoint({
        x: sumX / totalWeight,
        y: sumY / totalWeight,
    });
};

export const getEffectStyle = (
    activeEffects: SmartEffect[],
    displayTime: number,
    cursorPoint?: { x: number; y: number } | null,
    previewFrame?: PreviewEffectFrame | null,
): EffectStyleSet => {
    let windowTransform = '';
    let contentTransform = '';
    let boxShadow = '';
    let filter = '';
    let zoomOrigin = '';
    const primaryZoomEffectId = [...activeEffects].reverse().find((effect) => effect.type === 'zoom')?.id ?? null;

    const intensityMult = (effect: SmartEffect, progress: number) => {
        // Enforce a minimum 0.5s fade for a true premium feel
        const fadeRatio = computeEffectFadeRatio(effect.duration);
        return (getEffectIntensity(effect) / 100) * effectEnvelope(progress, fadeRatio, fadeRatio);
    };

    for (const effect of activeEffects) {
        const progress = Math.max(0, Math.min(1, (displayTime - effect.startTime) / effect.duration));
        const fadeRatio = computeEffectFadeRatio(effect.duration);
        const mult = (getEffectIntensity(effect) / 100) * effectEnvelope(progress, fadeRatio, fadeRatio);

        if (effect.type === 'zoom' && primaryZoomEffectId && effect.id !== primaryZoomEffectId) {
            continue;
        }

        if (effect.type === '3d_tilt') {
            const dir = effect.tiltDirection ?? 'orbital';
            const snap = effect.tiltSnap ?? 50;
            const { translateX, translateY, rotate, scale } = computeTilt(progress, dir, mult * 100, snap);
            const depth = Math.min(
                1,
                Math.abs(translateX) / 18 + Math.abs(translateY) / 16 + Math.abs(rotate) / 4
            );
            const shadowX = -translateX * 0.7;
            const shadowY = 14 + Math.abs(translateY) * 0.35 + depth * 10;
            const shadowBlur = 26 + depth * 18;
            const shadowSpread = -10 + depth * 3;
            const ambientAlpha = 0.16 + depth * 0.18;
            const rimAlpha = 0.04 + depth * 0.04;
            const depthFilter = `contrast(${(1 + depth * 0.08).toFixed(3)}) saturate(${(1 + depth * 0.06).toFixed(3)})`;

            windowTransform += ` translateX(${translateX.toFixed(2)}px) translateY(${translateY.toFixed(2)}px) rotate(${rotate.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
            boxShadow = `${shadowX.toFixed(1)}px ${shadowY.toFixed(1)}px ${shadowBlur.toFixed(1)}px ${shadowSpread.toFixed(1)}px rgba(6, 10, 18, ${ambientAlpha.toFixed(3)}), inset 0 1px 0 rgba(255, 255, 255, ${rimAlpha.toFixed(3)})`;
            filter = filter ? `${filter} ${depthFilter}` : depthFilter;
        }

        if (effect.type === 'zoom') {
            const area = normalizeArea(effect.zoomArea ?? { x: 25, y: 25, width: 50, height: 50 });
            const areaCx = area.x + area.width / 2;
            const areaCy = area.y + area.height / 2;
            const followStrength = effect.followCursorIntensity ?? DEFAULT_ZOOM_INTENSITY;
            const targetCx = effect.followCursor && cursorPoint
                ? computeFollowCursorCoord(areaCx, cursorPoint.x, followStrength)
                : areaCx;
            const targetCy = effect.followCursor && cursorPoint
                ? computeFollowCursorCoord(areaCy, cursorPoint.y, followStrength)
                : areaCy;
            const cx = computeSafeFocusCoord(targetCx, area.width);
            const cy = computeSafeFocusCoord(targetCy, area.height);
            const tiltNorm = Math.max(-100, Math.min(100, effect.tilt ?? 0)) / 100;
            const effectiveCx = computeSafeFocusCoord(computeEffectiveCx(cx, tiltNorm), area.width);
            const effectiveCy = computeSafeFocusCoord(cy, area.height);
            const baseZoom = computeBaseZoom(area);
            const centerProgress = computeZoomFactor(progress) * effectEnvelope(progress, fadeRatio, fadeRatio);
            const zoomFactor = computeZoomFactor(progress);
            const zoomAmount = 1 + (baseZoom - 1) * zoomFactor * mult;
            if (previewFrame) {
                const focusX = previewFrame.left + (previewFrame.width * effectiveCx) / 100;
                const focusY = previewFrame.top + (previewFrame.height * effectiveCy) / 100;
                const frameCenterX = previewFrame.left + previewFrame.width / 2;
                const frameCenterY = previewFrame.top + previewFrame.height / 2;
                const edgeDamping = computeZoomEdgeDamping(effectiveCx, effectiveCy);
                const previewCenterStrength = PREVIEW_ZOOM_CENTER_STRENGTH * edgeDamping;
                const translateX = (frameCenterX - focusX) * centerProgress * previewCenterStrength;
                const translateY = (frameCenterY - focusY) * centerProgress * previewCenterStrength;
                contentTransform += ` translate3d(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px, 0) scale(${zoomAmount.toFixed(4)})`;
                zoomOrigin = `${focusX.toFixed(2)}px ${focusY.toFixed(2)}px`;
            } else {
                const translateX = computeFocusCenteringOffset(effectiveCx) * centerProgress;
                const translateY = computeFocusCenteringOffset(effectiveCy) * centerProgress;
                contentTransform += ` translate(${translateX.toFixed(3)}%, ${translateY.toFixed(3)}%) scale(${zoomAmount.toFixed(4)})`;
                zoomOrigin = `${effectiveCx}% ${effectiveCy}%`;
            }
        }

        if (effect.type === 'exposure') {
            const flash = Math.max(0, 1 - progress * 2) * 0.8 * mult + 1;
            filter = filter ? `${filter} brightness(${flash})` : `brightness(${flash})`;
        }

        if (effect.type === 'card_flip') {
            const eased = 0.5 - 0.5 * Math.cos(Math.PI * progress);
            const angle = eased * 180 * effectEnvelope(progress, fadeRatio, fadeRatio);
            const isMirrored = angle > 90;
            const mirrorFix = isMirrored ? ' scaleX(-1)' : '';
            windowTransform += ` perspective(1200px) rotateY(${angle}deg)${mirrorFix}`;
        }

        if (effect.type === 'breathing') {
            const breathEased = 0.5 - 0.5 * Math.cos(progress * Math.PI * 2 * (effect.duration / 3)); // Breathes every 3s
            const breathScale = 1 + breathEased * 0.04 * mult;
            contentTransform += ` scale(${breathScale.toFixed(4)})`;
        }

        if (effect.type === 'slow_zoom') {
            const easedProgress = 0.5 - 0.5 * Math.cos(Math.PI * progress);
            const zoomAmount = 1 + (0.15 * mult * easedProgress);
            contentTransform += ` scale(${zoomAmount.toFixed(4)})`;
        }
    }

    return {
        windowStyle: {
            transform: windowTransform.trim() || 'none',
            willChange: 'transform',
        },
        contentStyle: {
            transform: contentTransform.trim() || 'none',
            transformOrigin: zoomOrigin || 'center center',
            willChange: 'transform',
        },
        filter: filter.trim(),
        boxShadow: boxShadow.trim()
    };
};
