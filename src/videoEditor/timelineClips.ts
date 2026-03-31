import { ImageClip, Segment } from './types';

export const TIMELINE_EPSILON = 0.001;

export type TimelinePlaybackItem =
    | {
        kind: 'video';
        id: string;
        startTime: number;
        endTime: number;
        duration: number;
        segment: Segment;
    }
    | {
        kind: 'image';
        id: string;
        startTime: number;
        endTime: number;
        duration: number;
        clip: ImageClip;
    };

export type TimelineSeekTarget = {
    kind: 'video' | 'image';
    segmentId?: string;
    imageClipId?: string;
    displayTime: number;
    videoTime: number;
};

export const getSegmentTimelineEnd = (segment: Segment): number => (
    segment.timelineStart + Math.max(0, segment.endTime - segment.startTime)
);

export const getImageClipEnd = (clip: ImageClip): number => (
    clip.startTime + Math.max(0, clip.duration)
);

export const getDisplayTimeForVideoTime = (videoTime: number, segments: Segment[]): number => {
    const sorted = sortSegmentsByTimeline(segments);
    if (sorted.length === 0 || !Number.isFinite(videoTime)) {
        return 0;
    }

    let previousSegment: Segment | null = null;
    for (const segment of sorted) {
        if (videoTime < segment.startTime - TIMELINE_EPSILON) {
            return previousSegment ? getSegmentTimelineEnd(previousSegment) : segment.timelineStart;
        }

        if (videoTime <= segment.endTime + TIMELINE_EPSILON) {
            const clampedVideoTime = Math.max(segment.startTime, Math.min(segment.endTime, videoTime));
            return segment.timelineStart + (clampedVideoTime - segment.startTime);
        }

        previousSegment = segment;
    }

    return previousSegment ? getSegmentTimelineEnd(previousSegment) : 0;
};

export const sortSegmentsByTimeline = (segments: Segment[]): Segment[] => (
    [...segments].sort((a, b) => a.timelineStart - b.timelineStart)
);

export const sortImageClipsByTimeline = (clips: ImageClip[]): ImageClip[] => (
    [...clips].sort((a, b) => a.startTime - b.startTime)
);

export const getTimelineDuration = (segments: Segment[], imageClips: ImageClip[]): number => {
    const segmentEnd = segments.reduce((max, segment) => Math.max(max, getSegmentTimelineEnd(segment)), 0);
    const clipEnd = imageClips.reduce((max, clip) => Math.max(max, getImageClipEnd(clip)), 0);
    return Math.max(segmentEnd, clipEnd);
};

export const getSegmentThumbnailSampleTimes = (
    segment: Segment,
    options?: {
        minFrames?: number;
        maxFrames?: number;
        secondsPerFrame?: number;
    },
): number[] => {
    const duration = Math.max(0, segment.endTime - segment.startTime);
    if (duration <= TIMELINE_EPSILON) {
        return [];
    }

    const minFrames = Math.max(1, options?.minFrames ?? 2);
    const maxFrames = Math.max(minFrames, options?.maxFrames ?? 8);
    const secondsPerFrame = Math.max(0.2, options?.secondsPerFrame ?? 1.4);
    const estimatedFrames = Math.round(duration / secondsPerFrame);
    const frameCount = Math.max(minFrames, Math.min(maxFrames, estimatedFrames));

    if (frameCount === 1) {
        return [segment.startTime + duration / 2];
    }

    const inset = Math.min(0.08, duration / Math.max(frameCount * 2, 4));
    const safeStart = segment.startTime + inset;
    const safeEnd = segment.endTime - inset;
    if (safeEnd <= safeStart + TIMELINE_EPSILON) {
        return [segment.startTime + duration / 2];
    }

    return Array.from({ length: frameCount }, (_, index) => {
        const progress = (index + 0.5) / frameCount;
        return safeStart + (safeEnd - safeStart) * progress;
    });
};

export const findImageClipAtDisplayTime = (
    imageClips: ImageClip[],
    displayTime: number,
    tolerance = TIMELINE_EPSILON,
): ImageClip | null => {
    for (const clip of sortImageClipsByTimeline(imageClips)) {
        const clipEnd = getImageClipEnd(clip);
        if (displayTime >= clip.startTime - tolerance && displayTime < clipEnd) {
            return clip;
        }
    }
    return null;
};

export const buildTimelinePlaybackItems = (
    segments: Segment[],
    imageClips: ImageClip[],
): TimelinePlaybackItem[] => {
    const items: TimelinePlaybackItem[] = [
        ...sortSegmentsByTimeline(segments).map((segment) => ({
            kind: 'video' as const,
            id: segment.id,
            startTime: segment.timelineStart,
            endTime: getSegmentTimelineEnd(segment),
            duration: Math.max(0, segment.endTime - segment.startTime),
            segment,
        })),
        ...sortImageClipsByTimeline(imageClips).map((clip) => ({
            kind: 'image' as const,
            id: clip.id,
            startTime: clip.startTime,
            endTime: getImageClipEnd(clip),
            duration: Math.max(0, clip.duration),
            clip,
        })),
    ];

    return items.sort((a, b) => {
        if (Math.abs(a.startTime - b.startTime) > TIMELINE_EPSILON) {
            return a.startTime - b.startTime;
        }
        if (a.kind === b.kind) return a.id.localeCompare(b.id);
        return a.kind === 'image' ? -1 : 1;
    });
};

const isPlaybackItemActiveAtDisplayTime = (
    items: TimelinePlaybackItem[],
    index: number,
    displayTime: number,
    tolerance = TIMELINE_EPSILON,
) => {
    const item = items[index];
    const nextItem = items[index + 1] ?? null;
    const hasContiguousSuccessor = !!nextItem && nextItem.startTime <= item.endTime + tolerance;

    return displayTime >= item.startTime - tolerance
        && (
            displayTime < item.endTime
            || (!hasContiguousSuccessor && displayTime <= item.endTime + tolerance)
        );
};

export const getSeekTargetForDisplayTime = (
    segments: Segment[],
    imageClips: ImageClip[],
    displayTime: number,
): TimelineSeekTarget | null => {
    const items = buildTimelinePlaybackItems(segments, imageClips);
    if (items.length === 0) return null;

    for (const [index, item] of items.entries()) {
        if (isPlaybackItemActiveAtDisplayTime(items, index, displayTime)) {
            const clampedDisplayTime = Math.max(item.startTime, Math.min(item.endTime, displayTime));
            if (item.kind === 'video') {
                return {
                    kind: 'video',
                    segmentId: item.segment.id,
                    displayTime: clampedDisplayTime,
                    videoTime: item.segment.startTime + (clampedDisplayTime - item.segment.timelineStart),
                };
            }

            return {
                kind: 'image',
                imageClipId: item.clip.id,
                displayTime: clampedDisplayTime,
                videoTime: getAnchorVideoTimeForImageClip(item.clip, segments),
            };
        }

        if (displayTime < item.startTime) {
            if (item.kind === 'video') {
                return {
                    kind: 'video',
                    segmentId: item.segment.id,
                    displayTime: item.startTime,
                    videoTime: item.segment.startTime,
                };
            }

            return {
                kind: 'image',
                imageClipId: item.clip.id,
                displayTime: item.startTime,
                videoTime: getAnchorVideoTimeForImageClip(item.clip, segments),
            };
        }
    }

    const lastItem = items[items.length - 1];
    if (lastItem.kind === 'video') {
        return {
            kind: 'video',
            segmentId: lastItem.segment.id,
            displayTime: lastItem.endTime,
            videoTime: lastItem.segment.endTime,
        };
    }

    return {
        kind: 'image',
        imageClipId: lastItem.clip.id,
        displayTime: lastItem.endTime,
        videoTime: getAnchorVideoTimeForImageClip(lastItem.clip, segments),
    };
};

export const getSeekTargetForVideoTime = (
    segments: Segment[],
    videoTime: number,
): TimelineSeekTarget | null => {
    const sorted = sortSegmentsByTimeline(segments);
    if (sorted.length === 0 || !Number.isFinite(videoTime)) {
        return null;
    }

    for (const segment of sorted) {
        if (videoTime >= segment.startTime - TIMELINE_EPSILON && videoTime <= segment.endTime + TIMELINE_EPSILON) {
            const clampedVideoTime = Math.max(segment.startTime, Math.min(segment.endTime, videoTime));
            return {
                kind: 'video',
                segmentId: segment.id,
                displayTime: segment.timelineStart + (clampedVideoTime - segment.startTime),
                videoTime: clampedVideoTime,
            };
        }
    }

    return null;
};

export const resolvePlaybackStartTarget = (
    segments: Segment[],
    imageClips: ImageClip[],
    displayTime: number,
    currentVideoTime?: number | null,
    options?: {
        pendingTarget?: TimelineSeekTarget | null;
        pinnedTarget?: TimelineSeekTarget | null;
    },
): TimelineSeekTarget | null => {
    const totalDuration = getTimelineDuration(segments, imageClips);
    if (totalDuration > 0) {
        const clampedDisplayTime = Math.max(0, Math.min(displayTime, totalDuration));
        const displayTarget = getSeekTargetForDisplayTime(segments, imageClips, clampedDisplayTime);
        if (displayTarget) {
            return displayTarget;
        }
    }

    if (options?.pendingTarget) {
        return options.pendingTarget;
    }

    if (options?.pinnedTarget) {
        return options.pinnedTarget;
    }

    if (typeof currentVideoTime === 'number' && Number.isFinite(currentVideoTime)) {
        return getSeekTargetForVideoTime(segments, currentVideoTime);
    }

    return null;
};

export const findTimelineItemAtDisplayTime = (
    segments: Segment[],
    imageClips: ImageClip[],
    displayTime: number,
    tolerance = TIMELINE_EPSILON,
): TimelinePlaybackItem | null => {
    const items = buildTimelinePlaybackItems(segments, imageClips);
    for (const [index, item] of items.entries()) {
        if (isPlaybackItemActiveAtDisplayTime(items, index, displayTime, tolerance)) {
            return item;
        }
    }
    return null;
};

export const findPreviousVideoSegment = (segments: Segment[], displayTime: number): Segment | null => {
    const sorted = sortSegmentsByTimeline(segments);
    let previous: Segment | null = null;
    for (const segment of sorted) {
        if (getSegmentTimelineEnd(segment) <= displayTime + TIMELINE_EPSILON) {
            previous = segment;
            continue;
        }
        break;
    }
    return previous;
};

export const findNextVideoSegment = (segments: Segment[], displayTime: number): Segment | null => {
    for (const segment of sortSegmentsByTimeline(segments)) {
        if (segment.timelineStart >= displayTime - TIMELINE_EPSILON) {
            return segment;
        }
    }
    return null;
};

export const getAnchorVideoTimeForImageClip = (clip: ImageClip, segments: Segment[]): number => {
    const nextSegment = findNextVideoSegment(segments, getImageClipEnd(clip));
    if (nextSegment) return nextSegment.startTime;

    const previousSegment = findPreviousVideoSegment(segments, clip.startTime);
    if (previousSegment) return previousSegment.endTime;

    return Math.max(0, sortSegmentsByTimeline(segments)[0]?.startTime ?? 0);
};

export const splitSegmentAtDisplayTime = (segments: Segment[], displayTime: number): Segment[] => {
    const nextSegments = [...segments];
    const hostIndex = nextSegments.findIndex((segment) => {
        const segmentEnd = getSegmentTimelineEnd(segment);
        return displayTime > segment.timelineStart + 0.01 && displayTime < segmentEnd - 0.01;
    });

    if (hostIndex === -1) {
        return nextSegments;
    }

    const segment = nextSegments[hostIndex];
    const splitOffset = displayTime - segment.timelineStart;
    const splitVideoTime = segment.startTime + splitOffset;
    const firstDuration = splitVideoTime - segment.startTime;

    const before: Segment = {
        ...segment,
        id: `${segment.id}-img-a-${Date.now()}`,
        endTime: splitVideoTime,
    };
    const after: Segment = {
        ...segment,
        id: `${segment.id}-img-b-${Date.now()}`,
        startTime: splitVideoTime,
        timelineStart: segment.timelineStart + firstDuration,
    };

    nextSegments.splice(hostIndex, 1, before, after);
    return nextSegments;
};

export const shiftSegmentsAfterDisplayTime = (
    segments: Segment[],
    displayTime: number,
    delta: number,
): Segment[] => {
    if (!delta) return [...segments];
    return segments.map((segment) => (
        segment.timelineStart >= displayTime - TIMELINE_EPSILON
            ? { ...segment, timelineStart: Math.max(0, segment.timelineStart + delta) }
            : segment
    ));
};

export const shiftTimedItemsAfterDisplayTime = <T extends { startTime: number; id?: string }>(
    items: T[],
    displayTime: number,
    delta: number,
    excludeId?: string | null,
): T[] => {
    if (!delta) return [...items];
    return items.map((item) => (
        item.startTime >= displayTime - TIMELINE_EPSILON && item.id !== excludeId
            ? { ...item, startTime: Math.max(0, item.startTime + delta) }
            : item
    ));
};

export const findGapAtDisplayTime = (
    segments: Segment[],
    imageClips: ImageClip[],
    displayTime: number,
    tolerance = 0.1,
): { startTime: number; endTime: number; duration: number } | null => {
    const items = buildTimelinePlaybackItems(segments, imageClips);
    let cursor = 0;

    for (const item of items) {
        if (item.startTime > cursor + tolerance) {
            // Found a gap
            if (displayTime >= cursor - tolerance && displayTime <= item.startTime + tolerance) {
                return {
                    startTime: cursor,
                    endTime: item.startTime,
                    duration: item.startTime - cursor,
                };
            }
        }
        cursor = Math.max(cursor, item.endTime);
    }

    return null;
};
