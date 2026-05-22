import { buildSmartTrackingEffects } from './smartTracking';
import type { Segment, SmartEffect, SmartTrackingProfile } from './types';

export const AUTO_POLISH_BACKGROUND = 'bg_starlight_blur';
export const AUTO_POLISH_PADDING = 8;
export const AUTO_POLISH_COLOR_GRADE = 'studio_clean';
const AUTO_POLISH_MAX_FOCUS_MOMENTS = 4;
const MIN_EFFECT_DURATION = 0.45;

type TimeRange = {
    startSeconds: number;
    endSeconds: number;
};

const cloneSegment = (segment: Segment): Segment => ({ ...segment });

const sortSegments = (segments: Segment[]) => [...segments].sort((a, b) => a.timelineStart - b.timelineStart);

const getSegmentDuration = (segment: TimeRange) => Math.max(0, segment.endSeconds - segment.startSeconds);

export const getBaseTimelineSegments = (segments: Segment[], duration: number): Segment[] => {
    if (Array.isArray(segments) && segments.length > 0) {
        return sortSegments(segments).map(cloneSegment);
    }

    if (duration > 0) {
        return [{
            id: 'auto-polish-base',
            startTime: 0,
            endTime: duration,
            timelineStart: 0,
        }];
    }

    return [];
};

export const getTimelineDurationFromSegments = (segments: TimeRange[]): number => {
    if (!Array.isArray(segments) || segments.length === 0) return 0;
    return segments.reduce((total, segment) => total + getSegmentDuration(segment), 0);
};

const mergeRanges = (ranges: TimeRange[]): TimeRange[] => {
    const sorted = [...ranges]
        .filter((range) => getSegmentDuration(range) > 0.001)
        .sort((a, b) => a.startSeconds - b.startSeconds);

    if (sorted.length === 0) return [];

    const merged: TimeRange[] = [{ ...sorted[0] }];
    for (let i = 1; i < sorted.length; i += 1) {
        const current = sorted[i];
        const previous = merged[merged.length - 1];
        if (current.startSeconds <= previous.endSeconds + 0.001) {
            previous.endSeconds = Math.max(previous.endSeconds, current.endSeconds);
            continue;
        }
        merged.push({ ...current });
    }

    return merged;
};

export const applyKeepRangesToSegments = (segments: Segment[], keepRanges: TimeRange[]): Segment[] => {
    const mergedKeepRanges = mergeRanges(keepRanges);
    if (mergedKeepRanges.length === 0) return sortSegments(segments).map(cloneSegment);

    const nextSegments: Segment[] = [];
    let timelineStart = 0;
    let index = 0;

    for (const segment of sortSegments(segments)) {
        for (const keepRange of mergedKeepRanges) {
            const overlapStart = Math.max(segment.startTime, keepRange.startSeconds);
            const overlapEnd = Math.min(segment.endTime, keepRange.endSeconds);
            if (overlapEnd - overlapStart < 0.05) continue;

            const preservesOriginalBounds =
                Math.abs(overlapStart - segment.startTime) < 0.001 &&
                Math.abs(overlapEnd - segment.endTime) < 0.001 &&
                Math.abs(timelineStart - segment.timelineStart) < 0.001;

            nextSegments.push({
                ...segment,
                id: preservesOriginalBounds ? segment.id : `${segment.id}-auto-${index}`,
                startTime: overlapStart,
                endTime: overlapEnd,
                timelineStart,
            });
            timelineStart += overlapEnd - overlapStart;
            index += 1;
        }
    }

    if (nextSegments.length === 0) {
        return sortSegments(segments).map(cloneSegment);
    }

    return nextSegments;
};

export const sourceTimeToTimelineTime = (sourceTime: number, segments: Segment[]): number | null => {
    for (const segment of sortSegments(segments)) {
        if (sourceTime < segment.startTime || sourceTime > segment.endTime) continue;
        return segment.timelineStart + (sourceTime - segment.startTime);
    }
    return null;
};

export const timelineTimeToSourceTime = (timelineTime: number, segments: Segment[]): number | null => {
    for (const segment of sortSegments(segments)) {
        const segmentDuration = Math.max(0, segment.endTime - segment.startTime);
        const segmentEnd = segment.timelineStart + segmentDuration;
        if (timelineTime < segment.timelineStart || timelineTime > segmentEnd) continue;
        return segment.startTime + (timelineTime - segment.timelineStart);
    }
    return null;
};

const trimEffectToSegments = (effect: SmartEffect, segments: Segment[]): SmartEffect | null => {
    const effectStart = effect.startTime;
    const effectEnd = effect.startTime + effect.duration;
    const effectCenter = effect.startTime + effect.duration / 2;

    const hostSegment = sortSegments(segments).find((segment) =>
        effectCenter >= segment.startTime && effectCenter <= segment.endTime
    ) ?? sortSegments(segments).find((segment) =>
        effectStart < segment.endTime && effectEnd > segment.startTime
    );

    if (!hostSegment) return null;

    const clippedStart = Math.max(effectStart, hostSegment.startTime);
    const clippedEnd = Math.min(effectEnd, hostSegment.endTime);
    const timelineStart = sourceTimeToTimelineTime(clippedStart, segments);
    const timelineEnd = sourceTimeToTimelineTime(clippedEnd, segments);

    if (timelineStart == null || timelineEnd == null || timelineEnd - timelineStart < MIN_EFFECT_DURATION) {
        return null;
    }

    return {
        ...effect,
        startTime: timelineStart,
        duration: timelineEnd - timelineStart,
    };
};

const pickAutoPolishEffects = (effects: SmartEffect[]): SmartEffect[] => {
    const zooms = effects.filter((effect) => effect.type === 'zoom').slice(0, AUTO_POLISH_MAX_FOCUS_MOMENTS);
    const zoomIds = new Set(zooms.map((effect) => effect.id));
    const exposures = effects.filter((effect) =>
        effect.type === 'exposure' && Array.from(zoomIds).some((id) => effect.id.startsWith(`${id}-`))
    );
    return [...zooms, ...exposures].sort((a, b) => a.startTime - b.startTime);
};

export const buildAutoPolishFocusEffects = (
    recordedCursorData: any[],
    sourceDuration: number,
    appliedSegments: Segment[],
    profile: SmartTrackingProfile
): SmartEffect[] => {
    if (!Array.isArray(recordedCursorData) || recordedCursorData.length === 0 || sourceDuration <= 0 || appliedSegments.length === 0) {
        return [];
    }

    const sourceEffects = pickAutoPolishEffects(
        buildSmartTrackingEffects(recordedCursorData, { durationHint: sourceDuration, profile })
    );

    return sourceEffects
        .map((effect, index): SmartEffect | null => {
            const trimmed = trimEffectToSegments(effect, appliedSegments);
            if (!trimmed) return null;
            return {
                ...trimmed,
                id: `auto-polish-effect-${index}-${Math.round(trimmed.startTime * 1000)}`,
                label: trimmed.type === 'zoom' ? 'Auto-Polish Focus' : 'Auto-Polish Highlight',
                generatedBy: 'auto_polish',
            };
        })
        .filter((effect): effect is SmartEffect => !!effect);
};

export const stripAutoPolishEffects = (effects: SmartEffect[]): SmartEffect[] => {
    return effects.filter((effect) => effect.generatedBy !== 'auto_polish' && !effect.label?.toLowerCase().startsWith('auto-polish'));
};
