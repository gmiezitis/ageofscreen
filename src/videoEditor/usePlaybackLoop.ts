import { useEffect, useRef } from 'react';
import { getInterpolatedValue } from './utils';
import {
    buildTimelinePlaybackItems,
    findImageClipAtDisplayTime,
    findNextVideoSegment,
    getSeekTargetForDisplayTime,
    findTimelineItemAtDisplayTime,
    getImageClipEnd,
} from './timelineClips';

/**
 * RAF-driven playback loop that syncs video.currentTime → displayTime
 * and interpolates keyframe transforms during playback.
 * 
 * Extracted from videoEditor.tsx to keep the orchestrator lean.
 */
export function usePlaybackLoop(state: any, handlers: any) {
    const { isPlaying, videoRef, segments, imageClips, keyframes, transform, displayTime, playbackSpeed } = state;

    const getDisplayTimeRef = useRef(handlers.getDisplayTimeFromVideoTime);
    const getPendingPlaybackTargetRef = useRef(handlers.getPendingPlaybackTarget);
    const clearPendingPlaybackTargetRef = useRef(handlers.clearPendingPlaybackTarget);
    const isSeekInFlightRef = useRef(handlers.isSeekInFlight);
    const startPlaybackFromTargetRef = useRef(handlers.startPlaybackFromTarget);
    const imageClipPlaybackRef = useRef<{ clipId: string; startedAt: number; clipStart: number } | null>(null);
    const pausedPlaybackRetryKeyRef = useRef<string | null>(null);
    const pausedPlaybackRetryAtRef = useRef<number>(0);

    useEffect(() => {
        getDisplayTimeRef.current = handlers.getDisplayTimeFromVideoTime;
    }, [handlers.getDisplayTimeFromVideoTime]);

    useEffect(() => {
        getPendingPlaybackTargetRef.current = handlers.getPendingPlaybackTarget;
        clearPendingPlaybackTargetRef.current = handlers.clearPendingPlaybackTarget;
        isSeekInFlightRef.current = handlers.isSeekInFlight;
        startPlaybackFromTargetRef.current = handlers.startPlaybackFromTarget;
    }, [handlers.clearPendingPlaybackTarget, handlers.getPendingPlaybackTarget, handlers.isSeekInFlight, handlers.startPlaybackFromTarget]);

    const segmentsRef = useRef(segments);
    const imageClipsRef = useRef(imageClips);
    const lastSegmentEndRef = useRef<number>(0);
    const keyframesRef = useRef(keyframes);
    const transformRef = useRef(transform);
    const displayTimeRef = useRef(displayTime);
    const playbackSpeedRef = useRef(playbackSpeed);
    const lastRenderedTime = useRef<number>(-1);
    const activeSegmentIndexRef = useRef<number>(-1);

    useEffect(() => {
        const sortedSegments = [...segments].sort((a: any, b: any) => a.timelineStart - b.timelineStart);
        segmentsRef.current = sortedSegments;
        lastSegmentEndRef.current = buildTimelinePlaybackItems(sortedSegments, imageClips).reduce(
            (max, item) => Math.max(max, item.endTime),
            0,
        );
        activeSegmentIndexRef.current = -1;
    }, [segments, imageClips]);

    useEffect(() => { imageClipsRef.current = imageClips; }, [imageClips]);
    useEffect(() => { keyframesRef.current = keyframes; }, [keyframes]);
    useEffect(() => { transformRef.current = transform; }, [transform]);
    useEffect(() => { displayTimeRef.current = displayTime; }, [displayTime]);
    useEffect(() => { playbackSpeedRef.current = playbackSpeed; }, [playbackSpeed]);

    useEffect(() => {
        if (!isPlaying) {
            imageClipPlaybackRef.current = null;
            pausedPlaybackRetryKeyRef.current = null;
            pausedPlaybackRetryAtRef.current = 0;
        }
    }, [isPlaying]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !isPlaying) return;

        let frameId: number;
        const SEGMENT_TOLERANCE = 0.15; // Increased for better seek settlement tolerance
        const TRANSFORM_EPSILON = 0.0005;

        const updateDisplayTime = (nextDisplayTime: number) => {
            if (!Number.isFinite(nextDisplayTime)) return;
            displayTimeRef.current = nextDisplayTime;
            state.setDisplayTime(nextDisplayTime);
        };

        const updateInterpolatedTransform = (nextDisplayTime: number) => {
            const frames = keyframesRef.current;
            const currentTransform = transformRef.current;
            const hasAnimatedTransform = Boolean(
                (Array.isArray(frames?.x) && frames.x.length > 0)
                || (Array.isArray(frames?.y) && frames.y.length > 0)
                || (Array.isArray(frames?.scale) && frames.scale.length > 0)
                || (Array.isArray(frames?.rotate) && frames.rotate.length > 0),
            );

            if (!hasAnimatedTransform) {
                const needsReset = (
                    Math.abs(currentTransform.x) > TRANSFORM_EPSILON
                    || Math.abs(currentTransform.y) > TRANSFORM_EPSILON
                    || Math.abs(currentTransform.scale - 1) > TRANSFORM_EPSILON
                    || Math.abs(currentTransform.rotation) > TRANSFORM_EPSILON
                );
                if (!needsReset) {
                    return;
                }

                const resetTransform = { x: 0, y: 0, scale: 1, rotation: 0 };
                transformRef.current = resetTransform;
                state.setTransform(resetTransform);
                return;
            }

            const nextTransform = {
                x: getInterpolatedValue(frames.x, nextDisplayTime, currentTransform.x),
                y: getInterpolatedValue(frames.y, nextDisplayTime, currentTransform.y),
                scale: getInterpolatedValue(frames.scale, nextDisplayTime, currentTransform.scale),
                rotation: getInterpolatedValue(frames.rotate, nextDisplayTime, currentTransform.rotation),
            };

            const isUnchanged = (
                Math.abs(nextTransform.x - currentTransform.x) <= TRANSFORM_EPSILON
                && Math.abs(nextTransform.y - currentTransform.y) <= TRANSFORM_EPSILON
                && Math.abs(nextTransform.scale - currentTransform.scale) <= TRANSFORM_EPSILON
                && Math.abs(nextTransform.rotation - currentTransform.rotation) <= TRANSFORM_EPSILON
            );

            if (isUnchanged) {
                return;
            }

            transformRef.current = nextTransform;
            state.setTransform(nextTransform);
        };

        const snapPlaybackToEnd = () => {
            pausedPlaybackRetryKeyRef.current = null;
            imageClipPlaybackRef.current = null;
            clearPendingPlaybackTargetRef.current?.();

            const finalDisplayTime = Math.max(0, lastSegmentEndRef.current);
            if (
                Math.abs(finalDisplayTime - lastRenderedTime.current) > 0.008
                || Math.abs(displayTimeRef.current - finalDisplayTime) > 0.008
            ) {
                lastRenderedTime.current = finalDisplayTime;
                updateInterpolatedTransform(finalDisplayTime);
                updateDisplayTime(finalDisplayTime);
            }

            state.setIsPlaying(false);
        };

        const findSegmentIndexForDisplayTime = (items: any[], time: number) => items.findIndex((seg) => {
            const segEnd = seg.timelineStart + Math.max(0, seg.endTime - seg.startTime);
            return time >= seg.timelineStart - 0.05 && time <= segEnd + 0.05;
        });

        const findSegmentIndexForVideoTime = (items: any[], time: number) => items.findIndex((seg) => (
            time >= seg.startTime - SEGMENT_TOLERANCE && time <= seg.endTime + SEGMENT_TOLERANCE
        ));
        const getPlaybackTargetKey = (target: { segmentId?: string; displayTime: number; videoTime: number } | null) => (
            target
                ? `${target.segmentId ?? 'video'}:${target.displayTime.toFixed(3)}:${target.videoTime.toFixed(3)}`
                : null
        );
        const requestVideoResume = (target: { kind: 'video'; segmentId: string; displayTime: number; videoTime: number }) => {
            const nextKey = getPlaybackTargetKey(target);
            const now = performance.now();
            if (!nextKey) {
                return false;
            }

            if (pausedPlaybackRetryKeyRef.current === nextKey && now - pausedPlaybackRetryAtRef.current < 420) {
                return false;
            }

            pausedPlaybackRetryKeyRef.current = nextKey;
            pausedPlaybackRetryAtRef.current = now;
            void startPlaybackFromTargetRef.current?.(target);
            return true;
        };

        // Initialize active segment index carefully based on current pin position
        const initialIndex = findSegmentIndexForDisplayTime(segmentsRef.current, displayTimeRef.current);
        if (initialIndex >= 0) {
            activeSegmentIndexRef.current = initialIndex;
        } else {
            activeSegmentIndexRef.current = findSegmentIndexForVideoTime(segmentsRef.current, video.currentTime);
        }

        const loop = () => {
            if (!video.paused) {
                pausedPlaybackRetryKeyRef.current = null;
            }

            const currentImageClip = findImageClipAtDisplayTime(imageClipsRef.current, displayTimeRef.current);
            if (currentImageClip) {
                pausedPlaybackRetryKeyRef.current = null;
                const clipEnd = getImageClipEnd(currentImageClip);
                const playbackAnchor = imageClipPlaybackRef.current;
                
                if (!playbackAnchor || playbackAnchor.clipId !== currentImageClip.id) {
                    clearPendingPlaybackTargetRef.current?.();
                    imageClipPlaybackRef.current = {
                        clipId: currentImageClip.id,
                        startedAt: performance.now(),
                        clipStart: Math.max(currentImageClip.startTime, Math.min(displayTimeRef.current, clipEnd)),
                    };
                }

                if (!video.paused) {
                    video.pause();
                }

                const imageAnchor = imageClipPlaybackRef.current!;
                const elapsedSeconds = ((performance.now() - imageAnchor.startedAt) / 1000) * Math.max(0.1, playbackSpeedRef.current || 1);
                const nextDisplayTime = Math.min(clipEnd, imageAnchor.clipStart + elapsedSeconds);

                if (Math.abs(nextDisplayTime - lastRenderedTime.current) > 0.008) {
                    lastRenderedTime.current = nextDisplayTime;
                    updateInterpolatedTransform(nextDisplayTime);
                    updateDisplayTime(nextDisplayTime);
                }

                if (nextDisplayTime >= clipEnd - 0.01) {
                    const timelineItems = buildTimelinePlaybackItems(segmentsRef.current, imageClipsRef.current);
                    const currentItemIndex = timelineItems.findIndex((item) => item.id === currentImageClip.id);
                    const nextItem = currentItemIndex >= 0
                        ? timelineItems[currentItemIndex + 1] ?? null
                        : timelineItems.find((item) => (
                            item.id !== currentImageClip.id
                            && item.endTime > clipEnd + 0.001
                        )) ?? null;
                    imageClipPlaybackRef.current = null;

                    if (!nextItem) {
                        updateDisplayTime(Math.max(lastSegmentEndRef.current, clipEnd));
                        state.setIsPlaying(false);
                        frameId = requestAnimationFrame(loop);
                        return;
                    }

                    if (nextItem.kind === 'image') {
                        clearPendingPlaybackTargetRef.current?.();
                        lastRenderedTime.current = nextItem.startTime;
                        updateDisplayTime(nextItem.startTime);
                        frameId = requestAnimationFrame(loop);
                        return;
                    }

                    const nextSegment = nextItem.segment ?? findNextVideoSegment(segmentsRef.current, clipEnd);
                    if (nextSegment) {
                        activeSegmentIndexRef.current = segmentsRef.current.findIndex((segment: any) => segment.id === nextSegment.id);
                        lastRenderedTime.current = nextSegment.timelineStart;
                        const nextTarget = {
                            kind: 'video' as const,
                            segmentId: nextSegment.id,
                            displayTime: nextSegment.timelineStart,
                            videoTime: nextSegment.startTime,
                        };
                        updateDisplayTime(nextSegment.timelineStart);
                        requestVideoResume(nextTarget);
                    } else {
                        updateDisplayTime(Math.max(lastSegmentEndRef.current, clipEnd));
                        state.setIsPlaying(false);
                    }
                    frameId = requestAnimationFrame(loop);
                    return;
                }

                frameId = requestAnimationFrame(loop);
                return;
            }

            imageClipPlaybackRef.current = null;
            if (video?.ended) {
                snapPlaybackToEnd();
                return;
            }

            if (video) {
                const currentSegments = segmentsRef.current;
                const pendingPlaybackTarget = getPendingPlaybackTargetRef.current?.() ?? null;
                const seekInFlight = isSeekInFlightRef.current?.() ?? false;

                if (video.paused && !video.ended && !video.seeking && !seekInFlight) {
                    const visibleTarget = getSeekTargetForDisplayTime(
                        currentSegments,
                        imageClipsRef.current,
                        displayTimeRef.current,
                    );
                    const pausedVideoTarget = pendingPlaybackTarget?.kind === 'video'
                        ? pendingPlaybackTarget
                        : visibleTarget?.kind === 'video'
                            ? visibleTarget
                            : null;

                    if (pausedVideoTarget) {
                        requestVideoResume(pausedVideoTarget);
                        frameId = requestAnimationFrame(loop);
                        return;
                    }
                }
            }
            if (video && !video.paused) {
                const currentTime = video.currentTime;
                const currentSegments = segmentsRef.current;
                
                if (currentSegments.length === 0) {
                    frameId = requestAnimationFrame(loop);
                    return;
                }

                const pendingPlaybackTarget = getPendingPlaybackTargetRef.current?.() ?? null;
                const seekInFlight = isSeekInFlightRef.current?.() ?? false;
                if (pendingPlaybackTarget?.kind === 'video') {
                    const pendingIndex = currentSegments.findIndex((segment: any) => segment.id === pendingPlaybackTarget.segmentId);
                    if (pendingIndex >= 0) {
                        activeSegmentIndexRef.current = pendingIndex;
                    }

                    const diff = Math.abs(currentTime - pendingPlaybackTarget.videoTime);
                    if (diff > SEGMENT_TOLERANCE) {
                        if (seekInFlight || video.seeking) {
                            if (Math.abs(displayTimeRef.current - pendingPlaybackTarget.displayTime) > 0.008) {
                                lastRenderedTime.current = pendingPlaybackTarget.displayTime;
                                updateDisplayTime(pendingPlaybackTarget.displayTime);
                            }
                            frameId = requestAnimationFrame(loop);
                            return;
                        }

                        // Resilient check: if we are already playing and passed the target, clear it for safety
                        const isMovingForward = (playbackSpeedRef.current || 1) > 0;
                        const isPassed = isMovingForward ? (currentTime > pendingPlaybackTarget.videoTime) : (currentTime < pendingPlaybackTarget.videoTime);
                        
                        if (!isPassed || diff > 0.5) {
                            if (Math.abs(displayTimeRef.current - pendingPlaybackTarget.displayTime) > 0.008) {
                                lastRenderedTime.current = pendingPlaybackTarget.displayTime;
                                updateDisplayTime(pendingPlaybackTarget.displayTime);
                            }
                            clearPendingPlaybackTargetRef.current?.(pendingPlaybackTarget);
                            frameId = requestAnimationFrame(loop);
                            return;
                        }
                    }

                    clearPendingPlaybackTargetRef.current?.(pendingPlaybackTarget);
                }

                let activeIndex = activeSegmentIndexRef.current;
                
                // Validate against display time if index is lost
                if (activeIndex < 0 || activeIndex >= currentSegments.length) {
                    activeIndex = findSegmentIndexForDisplayTime(currentSegments, displayTimeRef.current);
                    if (activeIndex < 0) {
                        activeIndex = findSegmentIndexForVideoTime(currentSegments, currentTime);
                    }
                    activeSegmentIndexRef.current = activeIndex;
                }

                let currentSegment = activeIndex >= 0 ? currentSegments[activeIndex] : null;
                
                // Avoid jumps to beginning if currentTime check finds a segment wildly far from current displayTime
                const directVideoIndex = findSegmentIndexForVideoTime(currentSegments, currentTime);
                if (directVideoIndex >= 0 && directVideoIndex !== activeIndex) {
                    const directSegment = currentSegments[directVideoIndex];
                    const mappedDisplayTime = directSegment.timelineStart + (currentTime - directSegment.startTime);
                    
                    if (activeIndex < 0 || Math.abs(mappedDisplayTime - displayTimeRef.current) < 1.0) {
                        activeIndex = directVideoIndex;
                        activeSegmentIndexRef.current = directVideoIndex;
                        currentSegment = directSegment;
                    }
                }

                const isWithinCurrentSegment = !!currentSegment
                    && currentTime >= currentSegment.startTime - SEGMENT_TOLERANCE
                    && currentTime <= currentSegment.endTime + SEGMENT_TOLERANCE;

                if (currentSegment && isWithinCurrentSegment) {
                    const clampedTime = Math.max(currentSegment.startTime, Math.min(currentSegment.endTime, currentTime));
                    const newDisplayTime = currentSegment.timelineStart + (clampedTime - currentSegment.startTime);
                    
                    if (Math.abs(newDisplayTime - lastRenderedTime.current) > 0.008) {
                        lastRenderedTime.current = newDisplayTime;
                        updateInterpolatedTransform(newDisplayTime);
                        updateDisplayTime(newDisplayTime);
                    }
                } else {
                    const timelineItems = buildTimelinePlaybackItems(currentSegments, imageClipsRef.current);
                    const currentTimelinePosition = displayTimeRef.current;
                    const currentSegmentEnd = currentSegment
                        ? currentSegment.timelineStart + Math.max(0, currentSegment.endTime - currentSegment.startTime)
                        : currentTimelinePosition;
                    // If the playhead is visually parked on a video item but the browser is still behind,
                    // reassert that exact source time instead of snapping to the next segment start.
                    const timelineItemAtDisplayTime = findTimelineItemAtDisplayTime(
                        currentSegments,
                        imageClipsRef.current,
                        currentTimelinePosition,
                    );
                    if (!seekInFlight && timelineItemAtDisplayTime?.kind === 'video') {
                        const expectedVideoTime = timelineItemAtDisplayTime.segment.startTime + (
                            currentTimelinePosition - timelineItemAtDisplayTime.segment.timelineStart
                        );
                        if (Math.abs(currentTime - expectedVideoTime) > SEGMENT_TOLERANCE) {
                            try {
                                video.currentTime = expectedVideoTime;
                            } catch {}
                            frameId = requestAnimationFrame(loop);
                            return;
                        }
                    }
                    const searchStart = Math.max(currentTimelinePosition, currentSegmentEnd);
                    const nextItem = timelineItems.find((item) => (
                        item.id !== currentSegment?.id
                        && item.startTime >= searchStart - 0.001
                    ));

                    if (nextItem?.kind === 'image') {
                        clearPendingPlaybackTargetRef.current?.();
                        imageClipPlaybackRef.current = {
                            clipId: nextItem.clip.id,
                            startedAt: performance.now(),
                            clipStart: nextItem.startTime,
                        };
                        lastRenderedTime.current = nextItem.startTime;
                        updateDisplayTime(nextItem.startTime);
                        video.pause();
                        frameId = requestAnimationFrame(loop);
                        return;
                    } else if (nextItem?.kind === 'video') {
                        activeSegmentIndexRef.current = currentSegments.findIndex((segment: any) => segment.id === nextItem.segment.id);
                        lastRenderedTime.current = nextItem.segment.timelineStart;
                        const nextTarget = {
                            kind: 'video' as const,
                            segmentId: nextItem.segment.id,
                            displayTime: nextItem.segment.timelineStart,
                            videoTime: nextItem.segment.startTime,
                        };
                        updateDisplayTime(nextItem.segment.timelineStart);
                        requestVideoResume(nextTarget);
                    } else {
                        video.pause();
                        snapPlaybackToEnd();
                    }
                }
            }
            frameId = requestAnimationFrame(loop);
        };

        frameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frameId);
    }, [isPlaying, videoRef, state.setIsPlaying, state.setTransform, state.setDisplayTime]);
}
