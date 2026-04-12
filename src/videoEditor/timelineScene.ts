import type { AnnotationObject } from '../types';
import { AudioSegment, ClipTransition, ImageClip, OverlayImage, Segment, SmartEffect, TextOverlay, TransitionType } from './types';
import {
    getImageClipEnd,
    getSegmentTimelineEnd,
    shiftSegmentsAfterDisplayTime,
    shiftTimedItemsAfterDisplayTime,
    splitSegmentAtDisplayTime,
    TIMELINE_EPSILON,
} from './timelineClips';

export interface TimelineSceneCollections {
    segments: Segment[];
    imageClips: ImageClip[];
    audioSegments: AudioSegment[];
    smartEffects: SmartEffect[];
    overlayImages: OverlayImage[];
    textOverlays: TextOverlay[];
    annotationOverlays: AnnotationObject[];
}

export const getClipTransitionKey = (fromItemId: string, toItemId: string) => `${fromItemId}::${toItemId}`;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const VISUAL_TRANSITION_PREFERRED_DURATION = 0.24;
export const VISUAL_TRANSITION_MIN_DURATION = 0.06;
export const VISUAL_TRANSITION_GAP_TOLERANCE = 0.04;

export const resolveClipTransitionType = (
    clipTransitions: ClipTransition[],
    fromItemId: string,
    toItemId: string,
    fallbackType: TransitionType = 'cut',
): TransitionType => (
    clipTransitions.find((transition) => (
        transition.fromItemId === fromItemId
        && transition.toItemId === toItemId
    ))?.type ?? fallbackType
);

export const upsertClipTransition = (
    clipTransitions: ClipTransition[],
    fromItemId: string,
    toItemId: string,
    type: TransitionType,
    fallbackType?: TransitionType,
): ClipTransition[] => {
    const nextTransitions = clipTransitions.filter((transition) => !(
        transition.fromItemId === fromItemId
        && transition.toItemId === toItemId
    ));

    if (fallbackType && type === fallbackType) {
        return nextTransitions;
    }

    return [
        ...nextTransitions,
        { fromItemId, toItemId, type },
    ];
};

export const pruneClipTransitions = (
    clipTransitions: ClipTransition[],
    validItemIds: Iterable<string>,
): ClipTransition[] => {
    const validIds = new Set(validItemIds);
    return clipTransitions.filter((transition) => (
        validIds.has(transition.fromItemId)
        && validIds.has(transition.toItemId)
    ));
};

type TimelineGap = {
    startTime: number;
    endTime: number;
};

export type VisualSceneItem =
    | {
        kind: 'video';
        id: string;
        startTime: number;
        endTime: number;
        duration: number;
        segment: Segment;
    }
    | {
        kind: 'imageClip';
        id: string;
        startTime: number;
        endTime: number;
        duration: number;
        clip: ImageClip;
    };

export interface ActivePreviewTransition {
    key: string;
    type: TransitionType;
    fromItem: VisualSceneItem;
    toItem: VisualSceneItem;
    boundaryTime: number;
    duration: number;
    progress: number;
    blackOverlayOpacity: number;
}

export interface ResolvedTimelineTransition {
    fromItemId: string;
    toItemId: string;
    type: TransitionType;
    requestedType: TransitionType;
    duration: number;
    boundaryTime: number;
}

const sortSegmentsByTimeline = (segments: Segment[]) => (
    [...segments].sort((a, b) => a.timelineStart - b.timelineStart)
);

const sortItemsByStartTime = <T extends { startTime: number; id?: string }>(items: T[]) => (
    [...items].sort((a, b) => {
        if (Math.abs(a.startTime - b.startTime) > TIMELINE_EPSILON) {
            return a.startTime - b.startTime;
        }
        return String(a.id ?? '').localeCompare(String(b.id ?? ''));
    })
);

const sortAnnotationsByStartTime = (annotations: AnnotationObject[]) => (
    [...annotations].sort((a, b) => {
        const aStart = typeof a.startTime === 'number' ? a.startTime : 0;
        const bStart = typeof b.startTime === 'number' ? b.startTime : 0;
        if (Math.abs(aStart - bStart) > TIMELINE_EPSILON) {
            return aStart - bStart;
        }
        return a.id.localeCompare(b.id);
    })
);

const shiftAnnotationOverlaysAfterDisplayTime = (
    annotations: AnnotationObject[],
    displayTime: number,
    delta: number,
) => {
    if (!delta) return [...annotations];
    return annotations.map((annotation) => {
        if (typeof annotation.startTime !== 'number') {
            return annotation;
        }
        return annotation.startTime >= displayTime - TIMELINE_EPSILON
            ? { ...annotation, startTime: Math.max(0, annotation.startTime + delta) }
            : annotation;
    });
};

const remapAnnotationOverlayTimes = (
    annotations: AnnotationObject[],
    mapDisplayTime: (time: number) => number,
) => (
    annotations.map((annotation) => {
        if (typeof annotation.startTime !== 'number') {
            return annotation;
        }
        return {
            ...annotation,
            startTime: mapDisplayTime(annotation.startTime),
        };
    })
);

export const buildVisualTimelineSceneItems = (
    segments: Segment[],
    imageClips: ImageClip[],
): VisualSceneItem[] => {
    const items: VisualSceneItem[] = [
        ...sortSegmentsByTimeline(segments).map((segment) => ({
            kind: 'video' as const,
            id: segment.id,
            startTime: segment.timelineStart,
            endTime: getSegmentTimelineEnd(segment),
            duration: Math.max(0, segment.endTime - segment.startTime),
            segment,
        })),
        ...sortItemsByStartTime(imageClips).map((clip) => ({
            kind: 'imageClip' as const,
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
        return a.kind === 'imageClip' ? -1 : 1;
    });
};

export const getActivePreviewTransition = (
    items: VisualSceneItem[],
    clipTransitions: ClipTransition[],
    fallbackType: TransitionType,
    displayTime: number,
    preferredDuration = VISUAL_TRANSITION_PREFERRED_DURATION,
): ActivePreviewTransition | null => {
    if (!Number.isFinite(displayTime) || items.length < 2) {
        return null;
    }

    for (let index = 0; index < items.length - 1; index += 1) {
        const fromItem = items[index];
        const toItem = items[index + 1];
        const gap = toItem.startTime - fromItem.endTime;

        if (Math.abs(gap) > 0.04) {
            continue;
        }

        const type = resolveClipTransitionType(
            clipTransitions,
            fromItem.id,
            toItem.id,
            fallbackType,
        );

        if (type === 'cut') {
            continue;
        }

        const duration = Math.min(
            preferredDuration,
            Math.max(TIMELINE_EPSILON, fromItem.duration * 0.5),
            Math.max(TIMELINE_EPSILON, toItem.duration * 0.5),
        );

        if (duration < 0.06) {
            continue;
        }

        const halfWindow = duration / 2;
        const boundaryTime = toItem.startTime;
        if (displayTime < boundaryTime - halfWindow || displayTime > boundaryTime + halfWindow) {
            continue;
        }

        const progress = clamp01((displayTime - (boundaryTime - halfWindow)) / duration);
        const centerWeight = 1 - Math.min(1, Math.abs(progress - 0.5) / 0.5);

        return {
            key: getClipTransitionKey(fromItem.id, toItem.id),
            type,
            fromItem,
            toItem,
            boundaryTime,
            duration,
            progress,
            blackOverlayOpacity: type === 'dip_to_black'
                ? Math.pow(centerWeight, 1.35) * 0.92
                : 0,
        };
    }

    return null;
};

export const buildResolvedTimelineTransitions = (
    items: VisualSceneItem[],
    clipTransitions: ClipTransition[],
    fallbackType: TransitionType,
    preferredDuration = VISUAL_TRANSITION_PREFERRED_DURATION,
): ResolvedTimelineTransition[] => items.slice(0, -1).map((item, index) => {
    const nextItem = items[index + 1];
    const requestedType = resolveClipTransitionType(
        clipTransitions,
        item.id,
        nextItem.id,
        fallbackType,
    );
    const gap = nextItem.startTime - item.endTime;
    const duration = Math.min(
        preferredDuration,
        Math.max(TIMELINE_EPSILON, item.duration * 0.5),
        Math.max(TIMELINE_EPSILON, nextItem.duration * 0.5),
    );
    const canApplyTransition = Math.abs(gap) <= VISUAL_TRANSITION_GAP_TOLERANCE
        && requestedType !== 'cut'
        && duration >= VISUAL_TRANSITION_MIN_DURATION;

    return {
        fromItemId: item.id,
        toItemId: nextItem.id,
        type: canApplyTransition ? requestedType : 'cut',
        requestedType,
        duration: canApplyTransition ? duration : 0,
        boundaryTime: nextItem.startTime,
    };
});

export const mapDisplayTimeAfterCrossfadeCompaction = (
    items: VisualSceneItem[],
    clipTransitions: ClipTransition[],
    fallbackType: TransitionType,
    displayTime: number,
    preferredDuration = VISUAL_TRANSITION_PREFERRED_DURATION,
) => {
    const compacted = buildResolvedTimelineTransitions(
        items,
        clipTransitions,
        fallbackType,
        preferredDuration,
    ).reduce((time, transition) => (
        transition.type === 'crossfade' && displayTime >= transition.boundaryTime - TIMELINE_EPSILON
            ? time - transition.duration
            : time
    ), displayTime);

    return Math.max(0, compacted);
};

export const remapTimedRangeAfterCrossfadeCompaction = (
    items: VisualSceneItem[],
    clipTransitions: ClipTransition[],
    fallbackType: TransitionType,
    startTime: number,
    duration: number,
    preferredDuration = VISUAL_TRANSITION_PREFERRED_DURATION,
) => {
    const remappedStart = mapDisplayTimeAfterCrossfadeCompaction(
        items,
        clipTransitions,
        fallbackType,
        startTime,
        preferredDuration,
    );
    const remappedEnd = mapDisplayTimeAfterCrossfadeCompaction(
        items,
        clipTransitions,
        fallbackType,
        startTime + duration,
        preferredDuration,
    );

    return {
        startTime: remappedStart,
        duration: Math.max(0, remappedEnd - remappedStart),
    };
};

export const shiftTimelineSceneAfter = (
    collections: TimelineSceneCollections,
    displayTime: number,
    delta: number,
    options?: {
        excludeImageClipId?: string | null;
    },
): TimelineSceneCollections => {
    return {
        segments: sortSegmentsByTimeline(
            shiftSegmentsAfterDisplayTime(collections.segments, displayTime, delta),
        ),
        imageClips: sortItemsByStartTime(
            shiftTimedItemsAfterDisplayTime(collections.imageClips, displayTime, delta, options?.excludeImageClipId),
        ),
        audioSegments: sortItemsByStartTime(
            shiftTimedItemsAfterDisplayTime(collections.audioSegments, displayTime, delta),
        ),
        smartEffects: sortItemsByStartTime(
            shiftTimedItemsAfterDisplayTime(collections.smartEffects, displayTime, delta),
        ),
        overlayImages: sortItemsByStartTime(
            shiftTimedItemsAfterDisplayTime(collections.overlayImages, displayTime, delta),
        ),
        textOverlays: sortItemsByStartTime(
            shiftTimedItemsAfterDisplayTime(collections.textOverlays, displayTime, delta),
        ),
        annotationOverlays: sortAnnotationsByStartTime(
            shiftAnnotationOverlaysAfterDisplayTime(collections.annotationOverlays, displayTime, delta),
        ),
    };
};

export const insertImageClipIntoTimelineScene = (
    collections: TimelineSceneCollections,
    clip: ImageClip,
): TimelineSceneCollections => {
    const clipDuration = Math.max(0, clip.duration);
    const insertionTime = clip.startTime;
    const nextSegments = shiftSegmentsAfterDisplayTime(
        splitSegmentAtDisplayTime(collections.segments, insertionTime),
        insertionTime,
        clipDuration,
    );

    return {
        segments: sortSegmentsByTimeline(nextSegments),
        imageClips: sortItemsByStartTime([
            ...shiftTimedItemsAfterDisplayTime(collections.imageClips, insertionTime, clipDuration),
            clip,
        ]),
        audioSegments: sortItemsByStartTime(
            shiftTimedItemsAfterDisplayTime(collections.audioSegments, insertionTime, clipDuration),
        ),
        smartEffects: sortItemsByStartTime(
            shiftTimedItemsAfterDisplayTime(collections.smartEffects, insertionTime, clipDuration),
        ),
        overlayImages: sortItemsByStartTime(
            shiftTimedItemsAfterDisplayTime(collections.overlayImages, insertionTime, clipDuration),
        ),
        textOverlays: sortItemsByStartTime(
            shiftTimedItemsAfterDisplayTime(collections.textOverlays, insertionTime, clipDuration),
        ),
        annotationOverlays: sortAnnotationsByStartTime(
            shiftAnnotationOverlaysAfterDisplayTime(collections.annotationOverlays, insertionTime, clipDuration),
        ),
    };
};

export const removeImageClipFromTimelineScene = (
    collections: TimelineSceneCollections,
    clipId: string,
): (TimelineSceneCollections & { removedClip: ImageClip }) | null => {
    const removedClip = collections.imageClips.find((clip) => clip.id === clipId);
    if (!removedClip) return null;

    const nextCollections = shiftTimelineSceneAfter(
        {
            ...collections,
            imageClips: collections.imageClips.filter((clip) => clip.id !== clipId),
        },
        getImageClipEnd(removedClip),
        -Math.max(0, removedClip.duration),
    );

    return {
        ...nextCollections,
        removedClip,
    };
};

export const reorderVisualTimelineSceneItems = (
    collections: TimelineSceneCollections,
    itemId: string,
    targetIndex: number,
): TimelineSceneCollections | null => {
    const visualItems = buildVisualTimelineSceneItems(collections.segments, collections.imageClips);
    if (visualItems.length <= 1) return null;

    const currentIndex = visualItems.findIndex((item) => item.id === itemId);
    if (currentIndex < 0) return null;

    const nextIndex = Math.max(0, Math.min(visualItems.length - 1, targetIndex));
    if (nextIndex === currentIndex) return null;

    const itemToMove = visualItems[currentIndex];
    const reorderedItems = visualItems.filter((item) => item.id !== itemId);
    reorderedItems.splice(nextIndex, 0, itemToMove);

    const nextPlacementById = new Map<string, { startTime: number; endTime: number }>();
    const nextSegments: Segment[] = [];
    const nextImageClips: ImageClip[] = [];
    let cursor = 0;

    reorderedItems.forEach((item) => {
        const duration = Math.max(0, item.duration);
        const startTime = cursor;
        const endTime = cursor + duration;
        nextPlacementById.set(item.id, { startTime, endTime });

        if (item.kind === 'video') {
            nextSegments.push({
                ...item.segment,
                timelineStart: startTime,
            });
        } else {
            nextImageClips.push({
                ...item.clip,
                startTime,
            });
        }

        cursor = endTime;
    });

    const mapDisplayTime = (displayTime: number) => {
        const containingItem = visualItems.find((item) => (
            displayTime >= item.startTime - TIMELINE_EPSILON
            && displayTime <= item.endTime + TIMELINE_EPSILON
        ));
        if (containingItem) {
            const placement = nextPlacementById.get(containingItem.id);
            if (!placement) return Math.max(0, displayTime);
            const relativeOffset = Math.max(0, Math.min(
                containingItem.duration,
                displayTime - containingItem.startTime,
            ));
            return Math.max(0, placement.startTime + relativeOffset);
        }

        const nextOldItem = visualItems.find((item) => item.startTime > displayTime + TIMELINE_EPSILON);
        if (nextOldItem) {
            const placement = nextPlacementById.get(nextOldItem.id);
            if (!placement) return Math.max(0, displayTime);
            return Math.max(0, placement.startTime + (displayTime - nextOldItem.startTime));
        }

        const previousOldItem = [...visualItems]
            .reverse()
            .find((item) => item.endTime < displayTime - TIMELINE_EPSILON);
        if (previousOldItem) {
            const placement = nextPlacementById.get(previousOldItem.id);
            if (!placement) return Math.max(0, displayTime);
            return Math.max(0, placement.endTime + (displayTime - previousOldItem.endTime));
        }

        return Math.max(0, displayTime);
    };

    return {
        segments: sortSegmentsByTimeline(nextSegments),
        imageClips: sortItemsByStartTime(nextImageClips),
        audioSegments: sortItemsByStartTime(
            collections.audioSegments.map((segment) => ({
                ...segment,
                startTime: mapDisplayTime(segment.startTime),
            })),
        ),
        smartEffects: sortItemsByStartTime(
            collections.smartEffects.map((effect) => ({
                ...effect,
                startTime: mapDisplayTime(effect.startTime),
            })),
        ),
        overlayImages: sortItemsByStartTime(
            collections.overlayImages.map((overlay) => ({
                ...overlay,
                startTime: mapDisplayTime(overlay.startTime),
            })),
        ),
        textOverlays: sortItemsByStartTime(
            collections.textOverlays.map((overlay) => ({
                ...overlay,
                startTime: mapDisplayTime(overlay.startTime),
            })),
        ),
        annotationOverlays: sortAnnotationsByStartTime(
            remapAnnotationOverlayTimes(collections.annotationOverlays, mapDisplayTime),
        ),
    };
};

const buildTimelineGaps = (visualItems: VisualSceneItem[]): TimelineGap[] => {
    if (visualItems.length === 0) return [];

    const gaps: TimelineGap[] = [];
    let cursor = 0;

    visualItems.forEach((item) => {
        if (item.startTime > cursor + TIMELINE_EPSILON) {
            gaps.push({
                startTime: cursor,
                endTime: item.startTime,
            });
        }
        cursor = Math.max(cursor, item.endTime);
    });

    return gaps;
};

const compressDisplayTime = (displayTime: number, gaps: TimelineGap[]) => {
    let compressed = displayTime;

    for (const gap of gaps) {
        const gapDuration = gap.endTime - gap.startTime;
        if (gapDuration <= TIMELINE_EPSILON) continue;

        if (displayTime >= gap.endTime - TIMELINE_EPSILON) {
            compressed -= gapDuration;
            continue;
        }

        if (displayTime > gap.startTime + TIMELINE_EPSILON) {
            compressed -= displayTime - gap.startTime;
        }
        break;
    }

    return Math.max(0, compressed);
};

export const mapDisplayTimeAfterClosingVisualGaps = (
    collections: TimelineSceneCollections,
    displayTime: number,
) => {
    const visualItems = buildVisualTimelineSceneItems(collections.segments, collections.imageClips);
    const gaps = buildTimelineGaps(visualItems);
    if (gaps.length === 0) {
        return Math.max(0, displayTime);
    }
    return compressDisplayTime(displayTime, gaps);
};

export const remapTimedRangeAfterClosingVisualGaps = (
    collections: TimelineSceneCollections,
    startTime: number,
    duration: number,
) => {
    const visualItems = buildVisualTimelineSceneItems(collections.segments, collections.imageClips);
    const gaps = buildTimelineGaps(visualItems);
    if (gaps.length === 0) {
        return {
            startTime: Math.max(0, startTime),
            duration: Math.max(0, duration),
        };
    }

    const remappedStart = compressDisplayTime(startTime, gaps);
    const remappedEnd = compressDisplayTime(startTime + duration, gaps);

    return {
        startTime: remappedStart,
        duration: Math.max(0, remappedEnd - remappedStart),
    };
};

export const closeVisualGapsInTimelineScene = (
    collections: TimelineSceneCollections,
): TimelineSceneCollections => {
    const visualItems = buildVisualTimelineSceneItems(collections.segments, collections.imageClips);
    const gaps = buildTimelineGaps(visualItems);
    if (gaps.length === 0) {
        return {
            segments: sortSegmentsByTimeline(collections.segments),
            imageClips: sortItemsByStartTime(collections.imageClips),
            audioSegments: sortItemsByStartTime(collections.audioSegments),
            smartEffects: sortItemsByStartTime(collections.smartEffects),
            overlayImages: sortItemsByStartTime(collections.overlayImages),
            textOverlays: sortItemsByStartTime(collections.textOverlays),
            annotationOverlays: sortAnnotationsByStartTime(collections.annotationOverlays),
        };
    }

    const mapDisplayTime = (time: number) => compressDisplayTime(time, gaps);
    const remapTimedRange = (startTime: number, duration: number) => {
        const remappedStart = mapDisplayTime(startTime);
        const remappedEnd = mapDisplayTime(startTime + duration);

        return {
            startTime: remappedStart,
            duration: Math.max(0, remappedEnd - remappedStart),
        };
    };

    return {
        segments: sortSegmentsByTimeline(
            collections.segments.map((segment) => ({
                ...segment,
                timelineStart: mapDisplayTime(segment.timelineStart),
            })),
        ),
        imageClips: sortItemsByStartTime(
            collections.imageClips.map((clip) => ({
                ...clip,
                startTime: mapDisplayTime(clip.startTime),
            })),
        ),
        audioSegments: sortItemsByStartTime(
            collections.audioSegments.map((segment) => ({
                ...segment,
                ...remapTimedRange(segment.startTime, segment.duration),
            })),
        ),
        smartEffects: sortItemsByStartTime(
            collections.smartEffects.map((effect) => ({
                ...effect,
                ...remapTimedRange(effect.startTime, effect.duration),
            })),
        ),
        overlayImages: sortItemsByStartTime(
            collections.overlayImages.map((overlay) => ({
                ...overlay,
                ...remapTimedRange(overlay.startTime, overlay.duration),
            })),
        ),
        textOverlays: sortItemsByStartTime(
            collections.textOverlays.map((overlay) => ({
                ...overlay,
                ...remapTimedRange(overlay.startTime, overlay.duration),
            })),
        ),
        annotationOverlays: sortAnnotationsByStartTime(
            collections.annotationOverlays.map((annotation) => {
                if (typeof annotation.startTime !== 'number') {
                    return annotation;
                }

                if (typeof annotation.duration === 'number') {
                    return {
                        ...annotation,
                        ...remapTimedRange(annotation.startTime, annotation.duration),
                    };
                }

                return {
                    ...annotation,
                    startTime: mapDisplayTime(annotation.startTime),
                };
            }),
        ),
    };
};
