import { useCallback, useEffect, useRef } from 'react';
import { ImageClip, OverlayImage, Segment, TextOverlay, TransitionType } from './types';
import { DEFAULT_TEXT_OVERLAY_FONT_STACK } from './textOverlayRendering';
import { useEditorHistory } from './useEditorHistory';
import { useEditorExport } from './useEditorExport';
import { useEditorLibrary } from './useEditorLibrary';
import { useTimelineDrag } from './useTimelineDrag';
import { toMediaFileUrl } from '../shared/mediaPaths';
import { createVideoElementThumbnail } from './mediaThumbnails';
import {
    getDisplayTimeForVideoTime,
    findTimelineItemAtDisplayTime,
    getAnchorVideoTimeForImageClip,
    getSeekTargetForVideoTime,
    getSegmentTimelineEnd,
    getSeekTargetForDisplayTime,
    getTimelineDuration as getTimelineDurationFromItems,
    resolvePlaybackStartTarget,
    TimelineSeekTarget,
} from './timelineClips';
import {
    closeVisualGapsInTimelineScene,
    mapDisplayTimeAfterClosingVisualGaps,
    normalizeVisualTimelineScene,
    removeImageClipFromTimelineScene,
    resolveClipTransitionType,
    shiftTimelineSceneAfter,
    TimelineSceneCollections,
    upsertClipTransition,
} from './timelineScene';

type SeekTarget = TimelineSeekTarget;

export const useVideoEditorHandlers = (state: any) => {
    const {
        mediaPath, setMediaPath, setMediaType, setMediaLoaded,
        segments, setSegments, setSelectedSegmentId,
        imageClips, setImageClips,
        clipTransitions, setClipTransitions,
        displayTime, setDisplayTime, videoRef, audioRefs, isPlaying, setIsPlaying,
        duration, setDuration, audioSegments, setAudioSegments,
        smartEffects, setSmartEffects,
        overlayImages, setOverlayImages,
        textOverlays, setTextOverlays, setSelectedTextOverlayId,
        annotationOverlays, setAnnotationOverlays,
        timelineRef, setIsDraggingPlayhead,
    } = state;

    const { saveHistory, undo, redo, canUndo, canRedo, showNotification } = useEditorHistory(state);
    const { handleExport, handleAutoPolish } = useEditorExport(state, showNotification, saveHistory);
    const { handleImportMedia, loadLibraryItem, deleteLibraryItem, clearLibrary } = useEditorLibrary(state, showNotification);
    const displayTimeRef = useRef(displayTime);
    const resumePlaybackAfterSeekRef = useRef(false);
    const pendingPlaybackTargetRef = useRef<SeekTarget | null>(null);
    const playbackRequestIdRef = useRef(0);
    const seekOperationIdRef = useRef(0);
    const seekPromiseRef = useRef<Promise<boolean> | null>(null);
    const roundDebugTime = useCallback((value: number | null | undefined) => (
        typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(3)) : null
    ), []);
    const getVideoDebugState = useCallback(() => {
        const video = videoRef.current;
        if (!video) {
            return { videoMissing: true };
        }

        return {
            currentTime: roundDebugTime(video.currentTime),
            paused: video.paused,
            seeking: video.seeking,
            ended: video.ended,
            readyState: video.readyState,
        };
    }, [roundDebugTime, videoRef]);
    const getSeekTargetDebugState = useCallback((seekTarget: SeekTarget | null | undefined) => {
        if (!seekTarget) return null;

        return {
            kind: seekTarget.kind,
            displayTime: roundDebugTime(seekTarget.displayTime),
            videoTime: roundDebugTime(seekTarget.videoTime),
            segmentId: 'segmentId' in seekTarget ? seekTarget.segmentId : undefined,
            imageClipId: 'imageClipId' in seekTarget ? seekTarget.imageClipId : undefined,
        };
    }, [roundDebugTime]);
    const logTimelineDebug = useCallback((_event: string, _payload?: Record<string, unknown>) => {}, []);

    useEffect(() => {
        resumePlaybackAfterSeekRef.current = false;
        pendingPlaybackTargetRef.current = null;
        playbackRequestIdRef.current = 0;
        seekOperationIdRef.current = 0;
        displayTimeRef.current = 0;
    }, [mediaPath]);

    const getMediaSrc = useCallback(() => {
        return toMediaFileUrl(mediaPath);
    }, [mediaPath]);

    const getTimelineDuration = useCallback(() => {
        return getTimelineDurationFromItems(segments, imageClips);
    }, [segments, imageClips]);

    const getVideoTimeFromDisplayTime = useCallback((dispTime: number) => {
        const timelineItem = findTimelineItemAtDisplayTime(segments, imageClips, dispTime);
        if (!timelineItem) return null;

        if (timelineItem.kind === 'video') {
            return {
                kind: 'video' as const,
                segmentId: timelineItem.segment.id,
                videoTime: timelineItem.segment.startTime + (dispTime - timelineItem.segment.timelineStart),
            };
        }

        return {
            kind: 'image' as const,
            imageClipId: timelineItem.clip.id,
            videoTime: getAnchorVideoTimeForImageClip(timelineItem.clip, segments),
        };
    }, [segments, imageClips]);

    const getSeekTargetFromDisplayTime = useCallback((dispTime: number): SeekTarget | null => (
        getSeekTargetForDisplayTime(segments, imageClips, dispTime)
    ), [segments, imageClips]);

    useEffect(() => {
        displayTimeRef.current = displayTime;
    }, [displayTime]);

    const getSeekTargetFromVideoTime = useCallback((videoTime: number) => (
        getSeekTargetForVideoTime(segments, videoTime)
    ), [segments]);

    const resolveVisiblePlaybackTarget = useCallback((displayTimeValue: number) => {
        return getSeekTargetFromDisplayTime(displayTimeValue)
            ?? resolvePlaybackStartTarget(
                segments,
                imageClips,
                displayTimeValue,
                null,
                {
                    pendingTarget: pendingPlaybackTargetRef.current,
                },
            );
    }, [getSeekTargetFromDisplayTime, imageClips, segments]);

    const getDisplayTimeFromVideoTime = useCallback((videoTime: number): number => {
        return getDisplayTimeForVideoTime(videoTime, segments);
    }, [segments]);

    const getTimelineSceneCollections = useCallback((overrides?: Partial<TimelineSceneCollections>): TimelineSceneCollections => ({
        segments: overrides?.segments ?? segments,
        imageClips: overrides?.imageClips ?? imageClips,
        audioSegments: overrides?.audioSegments ?? audioSegments,
        smartEffects: overrides?.smartEffects ?? smartEffects,
        overlayImages: overrides?.overlayImages ?? overlayImages,
        textOverlays: overrides?.textOverlays ?? textOverlays,
        annotationOverlays: overrides?.annotationOverlays ?? annotationOverlays,
    }), [segments, imageClips, audioSegments, smartEffects, overlayImages, textOverlays, annotationOverlays]);

    const applyTimelineSceneCollections = useCallback((nextScene: TimelineSceneCollections) => {
        setSegments(nextScene.segments);
        setImageClips(nextScene.imageClips);
        setAudioSegments(nextScene.audioSegments);
        setSmartEffects(nextScene.smartEffects);
        setOverlayImages(nextScene.overlayImages);
        setTextOverlays(nextScene.textOverlays);
        setAnnotationOverlays(nextScene.annotationOverlays);
    }, [setAnnotationOverlays, setAudioSegments, setImageClips, setOverlayImages, setSegments, setSmartEffects, setTextOverlays]);

    const getTimelineSeekRect = useCallback((target: EventTarget | null) => {
        const targetElement = target instanceof HTMLElement ? target : null;
        const contentElement = targetElement?.closest('.track-row, .ruler-content') as HTMLElement | null;
        if (contentElement) return contentElement.getBoundingClientRect();
        const fallbackElement = timelineRef.current?.querySelector('.track-row, .ruler-content') as HTMLElement | null;
        return (fallbackElement ?? timelineRef.current)?.getBoundingClientRect() ?? null;
    }, [timelineRef]);

    const rememberSeekTarget = useCallback((
        seekTarget: SeekTarget | null,
        fallbackDisplayTime?: number,
    ) => {
        const nextDisplayTime = seekTarget?.displayTime ?? fallbackDisplayTime;
        if (typeof nextDisplayTime !== 'number') {
            return null;
        }

        displayTimeRef.current = nextDisplayTime;
        setDisplayTime(nextDisplayTime);
        return nextDisplayTime ?? null;
    }, [setDisplayTime]);

    const clearPendingPlaybackTarget = useCallback((expectedTarget?: SeekTarget | null) => {
        if (!expectedTarget || pendingPlaybackTargetRef.current === expectedTarget) {
            pendingPlaybackTargetRef.current = null;
        }
    }, []);

    const getPendingPlaybackTarget = useCallback(() => pendingPlaybackTargetRef.current, []);

    const invalidatePlaybackRequest = useCallback(() => {
        playbackRequestIdRef.current += 1;
        resumePlaybackAfterSeekRef.current = false;
    }, []);

    const cancelPendingPlaybackRequest = useCallback(() => {
        invalidatePlaybackRequest();
        pendingPlaybackTargetRef.current = null;
    }, [invalidatePlaybackRequest]);

    const isSeekInFlight = useCallback(() => seekPromiseRef.current !== null, []);

    const awaitActiveSeek = useCallback(async () => {
        const pendingSeek = seekPromiseRef.current;
        if (!pendingSeek) {
            return true;
        }

        try {
            return await pendingSeek;
        } catch {
            return false;
        }
    }, []);

    const waitForVideoPaint = useCallback(() => (
        new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => resolve());
            });
        })
    ), []);

    const waitForVideoSeekSettlement = useCallback((
        video: HTMLVideoElement,
        targetTime: number,
        operationId: number,
        tolerance = 0.18,
        timeoutMs = 1200,
    ) => (
        new Promise<boolean>((resolve) => {
            let timeoutId: number | null = null;
            let finished = false;

            const cleanup = () => {
                if (timeoutId !== null) {
                    window.clearTimeout(timeoutId);
                }
                video.removeEventListener('seeked', handlePotentialSettlement);
                video.removeEventListener('timeupdate', handlePotentialSettlement);
                video.removeEventListener('loadeddata', handlePotentialSettlement);
            };

            const finish = (result: boolean) => {
                if (finished) {
                    return;
                }
                finished = true;
                cleanup();
                resolve(result);
            };

            const handlePotentialSettlement = () => {
                if (seekOperationIdRef.current !== operationId) {
                    finish(false);
                    return;
                }

                if (!video.seeking && Math.abs(video.currentTime - targetTime) <= tolerance) {
                    void waitForVideoPaint().then(() => {
                        finish(
                            seekOperationIdRef.current === operationId
                            && !video.seeking
                            && Math.abs(video.currentTime - targetTime) <= tolerance,
                        );
                    });
                }
            };

            video.addEventListener('seeked', handlePotentialSettlement);
            video.addEventListener('timeupdate', handlePotentialSettlement);
            video.addEventListener('loadeddata', handlePotentialSettlement);

            timeoutId = window.setTimeout(() => {
                finish(
                    seekOperationIdRef.current === operationId
                    && !video.seeking
                    && Math.abs(video.currentTime - targetTime) <= tolerance,
                );
            }, timeoutMs);

            handlePotentialSettlement();
        })
    ), [waitForVideoPaint]);

    const isVideoNearTime = useCallback((videoTime: number, tolerance = 0.12) => {
        const video = videoRef.current;
        if (!video || !Number.isFinite(videoTime)) {
            return false;
        }

        return Math.abs(video.currentTime - Math.max(0, videoTime)) <= tolerance;
    }, [videoRef]);

    const seekVideoToTime = useCallback((videoTime: number) => {
        let currentSeekPromise: Promise<boolean>;
        currentSeekPromise = (async () => {
        const video = videoRef.current;
        if (!video || !Number.isFinite(videoTime)) {
            return false;
        }

        const targetTime = Math.max(0, videoTime);
        const operationId = ++seekOperationIdRef.current;

        logTimelineDebug('seekVideoToTime:start', {
            operationId,
            targetTime: roundDebugTime(targetTime),
            ...getVideoDebugState(),
        });

        try {
            video.currentTime = targetTime;
        } catch (error) {
            console.warn('[VideoEditor] Failed to set video time:', error);
            logTimelineDebug('seekVideoToTime:setCurrentTimeFailed', {
                operationId,
                targetTime: roundDebugTime(targetTime),
                error: error instanceof Error ? error.message : String(error),
                ...getVideoDebugState(),
            });
            return false;
        }

        const didSettle = await waitForVideoSeekSettlement(video, targetTime, operationId);
        const didSeek = seekOperationIdRef.current === operationId && (didSettle || isVideoNearTime(targetTime, 0.18));
        logTimelineDebug('seekVideoToTime:finish', {
            operationId,
            targetTime: roundDebugTime(targetTime),
            didSettle,
            result: didSeek,
            ...getVideoDebugState(),
        });
        return didSeek;
        })().finally(() => {
            if (seekPromiseRef.current === currentSeekPromise) {
                seekPromiseRef.current = null;
            }
        });

        seekPromiseRef.current = currentSeekPromise;
        return currentSeekPromise;
    }, [getVideoDebugState, isVideoNearTime, logTimelineDebug, roundDebugTime, videoRef, waitForVideoSeekSettlement]);

    const previewSeekVideoToTime = useCallback((videoTime: number) => {
        const video = videoRef.current;
        if (!video || !Number.isFinite(videoTime)) {
            return false;
        }

        const targetTime = Math.max(0, videoTime);
        seekOperationIdRef.current += 1;

        try {
            video.currentTime = targetTime;
            logTimelineDebug('previewSeekVideoToTime', {
                targetTime: roundDebugTime(targetTime),
                ...getVideoDebugState(),
            });
            return true;
        } catch (error) {
            console.warn('[VideoEditor] Failed to preview-seek video time:', error);
            logTimelineDebug('previewSeekVideoToTime:failed', {
                targetTime: roundDebugTime(targetTime),
                error: error instanceof Error ? error.message : String(error),
                ...getVideoDebugState(),
            });
            return false;
        }
    }, [getVideoDebugState, logTimelineDebug, roundDebugTime, videoRef]);

    const pausePlaybackForSeek = useCallback(() => {
        logTimelineDebug('pausePlaybackForSeek', {
            wasPlaying: isPlaying,
            displayTime: roundDebugTime(displayTimeRef.current),
            ...getVideoDebugState(),
        });
        cancelPendingPlaybackRequest();
        videoRef.current?.pause();
        Object.values(audioRefs.current).forEach((el: any) => el?.pause());
        setIsPlaying(false);
        return isPlaying;
    }, [audioRefs, cancelPendingPlaybackRequest, getVideoDebugState, isPlaying, logTimelineDebug, roundDebugTime, setIsPlaying, videoRef]);

    const startPlaybackFromTarget = useCallback(async (playbackTarget: SeekTarget | null) => {
        const video = videoRef.current;
        if (!video) {
            resumePlaybackAfterSeekRef.current = false;
            pendingPlaybackTargetRef.current = null;
            return false;
        }

        const requestId = playbackRequestIdRef.current + 1;
        playbackRequestIdRef.current = requestId;

        if (playbackTarget) {
            rememberSeekTarget(playbackTarget, playbackTarget.displayTime);
        } else {
            pendingPlaybackTargetRef.current = null;
            displayTimeRef.current = 0;
            setDisplayTime(0);
        }

        const nextVideoTime = playbackTarget?.videoTime ?? 0;
        try {
            logTimelineDebug('startPlaybackFromTarget:start', {
                requestId,
                playbackTarget: getSeekTargetDebugState(playbackTarget),
                displayTime: roundDebugTime(displayTimeRef.current),
                ...getVideoDebugState(),
            });
            video.pause();
            Object.values(audioRefs.current).forEach((el: any) => el?.pause());

            if (playbackTarget?.kind === 'image') {
                if (playbackRequestIdRef.current !== requestId) {
                    return false;
                }
                pendingPlaybackTargetRef.current = null;
                resumePlaybackAfterSeekRef.current = false;
                setIsPlaying(true);
                return true;
            }

            if (seekPromiseRef.current) {
                const didCompletePendingSeek = await awaitActiveSeek();
                if (playbackRequestIdRef.current !== requestId) {
                    logTimelineDebug('startPlaybackFromTarget:cancelledAfterPendingSeek', {
                        requestId,
                        playbackTarget: getSeekTargetDebugState(playbackTarget),
                        didCompletePendingSeek,
                        ...getVideoDebugState(),
                    });
                    return false;
                }
            }

            const isReadyAtTarget = !video.ended
                && isVideoNearTime(nextVideoTime)
                && video.readyState >= 2
                && !video.seeking;
            const needsSeekBeforePlay = !isReadyAtTarget;
            logTimelineDebug('startPlaybackFromTarget:beforeSeek', {
                requestId,
                isReadyAtTarget,
                needsSeekBeforePlay,
                nextVideoTime: roundDebugTime(nextVideoTime),
                playbackTarget: getSeekTargetDebugState(playbackTarget),
                ...getVideoDebugState(),
            });
            if (needsSeekBeforePlay) {
                pendingPlaybackTargetRef.current = null;
                const didSeek = await seekVideoToTime(nextVideoTime);
                if (playbackRequestIdRef.current !== requestId) {
                    logTimelineDebug('startPlaybackFromTarget:cancelledAfterSeek', {
                        requestId,
                        nextVideoTime: roundDebugTime(nextVideoTime),
                        playbackTarget: getSeekTargetDebugState(playbackTarget),
                        ...getVideoDebugState(),
                    });
                    return false;
                }
                if (!didSeek && !isVideoNearTime(nextVideoTime, 0.18)) {
                    resumePlaybackAfterSeekRef.current = false;
                    logTimelineDebug('startPlaybackFromTarget:seekFailed', {
                        requestId,
                        nextVideoTime: roundDebugTime(nextVideoTime),
                        playbackTarget: getSeekTargetDebugState(playbackTarget),
                        ...getVideoDebugState(),
                    });
                    return false;
                }
                logTimelineDebug('startPlaybackFromTarget:seekSettled', {
                    requestId,
                    nextVideoTime: roundDebugTime(nextVideoTime),
                    playbackTarget: getSeekTargetDebugState(playbackTarget),
                    ...getVideoDebugState(),
                });
            }
            pendingPlaybackTargetRef.current = null;

            logTimelineDebug('startPlaybackFromTarget:beforePlay', {
                requestId,
                playbackTarget: getSeekTargetDebugState(playbackTarget),
                ...getVideoDebugState(),
            });
            const playPromise = video.play();
            await playPromise;
            if (playbackRequestIdRef.current !== requestId) {
                pendingPlaybackTargetRef.current = null;
                video.pause();
                logTimelineDebug('startPlaybackFromTarget:cancelledAfterPlay', {
                    requestId,
                    playbackTarget: getSeekTargetDebugState(playbackTarget),
                    ...getVideoDebugState(),
                });
                return false;
            }
            resumePlaybackAfterSeekRef.current = false;
            pendingPlaybackTargetRef.current = null;
            setIsPlaying(true);
            logTimelineDebug('startPlaybackFromTarget:success', {
                requestId,
                playbackTarget: getSeekTargetDebugState(playbackTarget),
                ...getVideoDebugState(),
            });
            return true;
        } catch (error) {
            if (playbackRequestIdRef.current !== requestId) {
                return false;
            }
            pendingPlaybackTargetRef.current = null;
            resumePlaybackAfterSeekRef.current = false;
            console.error('[VideoEditor] Playback start failed:', error);
            logTimelineDebug('startPlaybackFromTarget:error', {
                requestId,
                playbackTarget: getSeekTargetDebugState(playbackTarget),
                error: error instanceof Error ? error.message : String(error),
                ...getVideoDebugState(),
            });
            showNotification('error', 'Playback Error', 'Could not start playback.');
            return false;
        }
    }, [audioRefs, awaitActiveSeek, getSeekTargetDebugState, getVideoDebugState, isVideoNearTime, logTimelineDebug, rememberSeekTarget, roundDebugTime, seekVideoToTime, setDisplayTime, setIsPlaying, showNotification, videoRef]);

    const applySeekTarget = useCallback(async (
        seekTarget: SeekTarget | null,
        options?: {
            resume?: boolean;
            previewOnly?: boolean;
        },
    ) => {
        const video = videoRef.current;
        const shouldResume = options?.resume ?? false;
        const shouldPreviewOnly = options?.previewOnly ?? false;

        if (seekTarget) {
            rememberSeekTarget(seekTarget, seekTarget.displayTime);
        }

        logTimelineDebug('applySeekTarget', {
            seekTarget: getSeekTargetDebugState(seekTarget),
            shouldResume,
            ...getVideoDebugState(),
        });

        cancelPendingPlaybackRequest();
        Object.values(audioRefs.current).forEach((el: any) => el?.pause());
        video?.pause();
        setIsPlaying(false);

        if (!video || !seekTarget) {
            return false;
        }

        if (shouldResume) {
            return startPlaybackFromTarget(seekTarget);
        }

        if (!Number.isFinite(seekTarget.videoTime)) {
            return seekTarget.kind === 'image';
        }

        if (shouldPreviewOnly) {
            return previewSeekVideoToTime(seekTarget.videoTime) || isVideoNearTime(seekTarget.videoTime);
        }

        const didSeek = await seekVideoToTime(seekTarget.videoTime);
        return didSeek || isVideoNearTime(seekTarget.videoTime);
    }, [audioRefs, cancelPendingPlaybackRequest, getSeekTargetDebugState, getVideoDebugState, isVideoNearTime, logTimelineDebug, previewSeekVideoToTime, rememberSeekTarget, seekVideoToTime, setIsPlaying, startPlaybackFromTarget, videoRef]);

    const seekTimelineToClientX = useCallback((clientX: number, target?: EventTarget | null) => {
        const total = getTimelineDuration();
        const rect = getTimelineSeekRect(target ?? null);
        if (!rect || total <= 0) return null;

        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(rect.width, 1)));
        const desiredTime = percent * total;
        const seekTarget = getSeekTargetFromDisplayTime(desiredTime);

        if (!seekTarget) return null;

        logTimelineDebug('seekTimelineToClientX', {
            clientX,
            isDraggingPlayhead: state.isDraggingPlayhead,
            desiredDisplayTime: roundDebugTime(desiredTime),
            seekTarget: getSeekTargetDebugState(seekTarget),
            ...getVideoDebugState(),
        });
        rememberSeekTarget(seekTarget, seekTarget.displayTime);
        if (state.isDraggingPlayhead) {
            return seekTarget.displayTime;
        }

        void applySeekTarget(seekTarget, { resume: isPlaying });
        return seekTarget.displayTime;
    }, [applySeekTarget, getSeekTargetDebugState, getSeekTargetFromDisplayTime, getTimelineDuration, getTimelineSeekRect, getVideoDebugState, isPlaying, logTimelineDebug, rememberSeekTarget, roundDebugTime, state.isDraggingPlayhead]);

    const commitLastRequestedSeekTarget = useCallback(async () => {
        const requestedSeekTarget = resolveVisiblePlaybackTarget(displayTimeRef.current)
            ?? getSeekTargetFromDisplayTime(displayTimeRef.current);

        if (!requestedSeekTarget) {
            return;
        }

        rememberSeekTarget(requestedSeekTarget, requestedSeekTarget.displayTime);
        const shouldResume = resumePlaybackAfterSeekRef.current;
        resumePlaybackAfterSeekRef.current = false;

        logTimelineDebug('commitLastRequestedSeekTarget', {
            shouldResume,
            requestedSeekTarget: getSeekTargetDebugState(requestedSeekTarget),
            displayTime: roundDebugTime(displayTimeRef.current),
            ...getVideoDebugState(),
        });

        if (shouldResume) {
            await startPlaybackFromTarget(requestedSeekTarget);
            return;
        }

        // Commit the scrubbed pin as a real seek so play reuses a settled target
        // instead of racing the playback loop against a preview-only position.
        await applySeekTarget(requestedSeekTarget, { resume: false });
    }, [applySeekTarget, getSeekTargetFromDisplayTime, getSeekTargetDebugState, getVideoDebugState, logTimelineDebug, rememberSeekTarget, resolveVisiblePlaybackTarget, roundDebugTime, startPlaybackFromTarget, videoRef]);

    const seekToDisplayTime = useCallback((nextDisplayTime: number, options?: { resume?: boolean }) => {
        const total = getTimelineDuration();
        const clampedDisplayTime = Math.max(0, Math.min(total, nextDisplayTime));
        const seekTarget = getSeekTargetFromDisplayTime(clampedDisplayTime);

        if (!seekTarget) {
            displayTimeRef.current = clampedDisplayTime;
            setDisplayTime(clampedDisplayTime);
            return clampedDisplayTime;
        }

        void applySeekTarget(seekTarget, { resume: options?.resume ?? isPlaying });
        return seekTarget.displayTime;
    }, [applySeekTarget, getSeekTargetFromDisplayTime, getTimelineDuration, isPlaying, setDisplayTime]);

    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        const total = getTimelineDuration();
        if (!video || total <= 0 || state.isEditingText) return;
        if (isPlaying) {
            logTimelineDebug('togglePlay:pause', {
                displayTime: roundDebugTime(displayTimeRef.current),
                ...getVideoDebugState(),
            });
            resumePlaybackAfterSeekRef.current = false;
            const pausedDisplayTime = Math.max(0, Math.min(total, displayTimeRef.current));
            const pausedTarget = getSeekTargetFromDisplayTime(pausedDisplayTime);
            const preservedDisplayTime = pausedTarget?.displayTime ?? pausedDisplayTime;
            rememberSeekTarget(pausedTarget, preservedDisplayTime);
            pausePlaybackForSeek();
            return;
        }

        const pinnedDisplayTime = Math.max(0, Math.min(total, displayTimeRef.current));
        const visiblePlaybackTarget = resolveVisiblePlaybackTarget(pinnedDisplayTime)
            ?? getSeekTargetFromDisplayTime(pinnedDisplayTime);
        const shouldRestartFromBeginning = Boolean(
            video.ended
            && visiblePlaybackTarget
            && visiblePlaybackTarget.displayTime >= total - 0.05
            && isVideoNearTime(visiblePlaybackTarget.videoTime),
        );
        const playbackTarget = shouldRestartFromBeginning
            ? getSeekTargetFromDisplayTime(0)
            : visiblePlaybackTarget;

        logTimelineDebug('togglePlay:play', {
            displayTime: roundDebugTime(displayTimeRef.current),
            pinnedDisplayTime: roundDebugTime(pinnedDisplayTime),
            shouldRestartFromBeginning,
            playbackTarget: getSeekTargetDebugState(playbackTarget),
            videoTime: roundDebugTime(video.currentTime),
            ...getVideoDebugState(),
        });

        if (playbackTarget) {
            rememberSeekTarget(playbackTarget, playbackTarget.displayTime);
        }

        void startPlaybackFromTarget(playbackTarget);
    }, [getSeekTargetDebugState, getSeekTargetFromDisplayTime, getTimelineDuration, getVideoDebugState, isPlaying, isVideoNearTime, logTimelineDebug, pausePlaybackForSeek, rememberSeekTarget, resolveVisiblePlaybackTarget, roundDebugTime, startPlaybackFromTarget, state.isEditingText, videoRef]);

    const splitAtPlayhead = useCallback(() => {
        const video = videoRef.current;
        const pinnedTarget = getSeekTargetFromDisplayTime(displayTimeRef.current)
            ?? (video && Number.isFinite(video.currentTime) ? getSeekTargetFromVideoTime(video.currentTime) : null);
        if (!pinnedTarget) return;
        if (pinnedTarget.kind === 'image') {
            const imageClip = imageClips.find((clip: ImageClip) => clip.id === pinnedTarget.imageClipId);
            if (!imageClip) return;
            const splitOffset = displayTimeRef.current - imageClip.startTime;
            if (splitOffset < 0.01 || imageClip.duration - splitOffset < 0.01) return;
            const index = imageClips.findIndex((clip: ImageClip) => clip.id === imageClip.id);
            if (index < 0) return;

            saveHistory();
            const idA = `image-clip-${Date.now()}-a`;
            const idB = `image-clip-${Date.now()}-b`;
            const nextImageClips = [...imageClips];
            nextImageClips.splice(
                index,
                1,
                { ...imageClip, id: idA, duration: splitOffset },
                { ...imageClip, id: idB, startTime: displayTimeRef.current, duration: imageClip.duration - splitOffset },
            );
            setImageClips(nextImageClips);
            state.setSelectedImageClipId(idB);
            rememberSeekTarget({
                kind: 'image',
                imageClipId: idB,
                displayTime: displayTimeRef.current,
                videoTime: pinnedTarget.videoTime,
            }, displayTimeRef.current);
            saveHistory({ imageClips: nextImageClips });
            return;
        }

        const preciseVideoTime = pinnedTarget.videoTime;
        const seg = segments.find((s: Segment) => s.id === pinnedTarget.segmentId)
            ?? segments.find((s: Segment) => preciseVideoTime >= s.startTime && preciseVideoTime <= s.endTime);
        if (!seg) return;
        if (preciseVideoTime - seg.startTime < 0.01 || seg.endTime - preciseVideoTime < 0.01) return;
        saveHistory();
        const idx = segments.findIndex((s: Segment) => s.id === seg.id);
        const firstDur = preciseVideoTime - seg.startTime;
        const idA = `seg-${Date.now()}-a`;
        const idB = `seg-${Date.now()}-b`;
        const newSegs = [...segments];
        newSegs.splice(idx, 1, { ...seg, id: idA, endTime: preciseVideoTime }, { ...seg, id: idB, startTime: preciseVideoTime, timelineStart: seg.timelineStart + firstDur });
        setSegments(newSegs);
        setSelectedSegmentId(idB);
        rememberSeekTarget({
            kind: 'video',
            segmentId: idB,
            displayTime: seg.timelineStart + firstDur,
            videoTime: preciseVideoTime,
        }, seg.timelineStart + firstDur);
        saveHistory(newSegs);
    }, [segments, imageClips, videoRef, getSeekTargetFromDisplayTime, getSeekTargetFromVideoTime, saveHistory, setSegments, setSelectedSegmentId, setImageClips, state, rememberSeekTarget]);

    const deleteSelectedSegment = useCallback(() => {
        saveHistory();
        if (state.selectedAudioId) {
            const nextAudioSegments = audioSegments.filter((a: any) => a.id !== state.selectedAudioId);
            state.setAudioSegments(nextAudioSegments);
            state.setSelectedAudioId(null);
            saveHistory({ audioSegments: nextAudioSegments });
            showNotification('success', 'Media Hub', 'Audio removed');
            return;
        }
        if (state.selectedOverlayId) {
            const nextOverlayImages = overlayImages.filter((o: any) => o.id !== state.selectedOverlayId);
            state.setOverlayImages(nextOverlayImages);
            state.setSelectedOverlayId(null);
            saveHistory({ overlayImages: nextOverlayImages });
            showNotification('success', 'Media Hub', 'Overlay removed');
            return;
        }
        if (state.selectedTextOverlayId) {
            const nextTextOverlays = textOverlays.filter((t: any) => t.id !== state.selectedTextOverlayId);
            state.setTextOverlays(nextTextOverlays);
            state.setSelectedTextOverlayId(null);
            saveHistory({ textOverlays: nextTextOverlays });
            showNotification('success', 'Media Hub', 'Text removed');
            return;
        }
        if (state.selectedEffectId) {
            const nextSmartEffects = smartEffects.filter((e: any) => e.id !== state.selectedEffectId);
            state.setSmartEffects(nextSmartEffects);
            state.setSelectedEffectId(null);
            saveHistory({ smartEffects: nextSmartEffects });
            showNotification('success', 'Media Hub', 'Effect removed');
            return;
        }
        if (state.selectedImageClipId) {
            const nextScene = removeImageClipFromTimelineScene(
                getTimelineSceneCollections(),
                state.selectedImageClipId,
            );
            if (!nextScene) return;
            applyTimelineSceneCollections(nextScene);
            state.setSelectedImageClipId(null);
            saveHistory(nextScene);
            showNotification('success', 'Timeline', 'Image clip removed');
            return;
        }
        if (state.selectedSegmentId) {
            const selectedSegment = segments.find((s: Segment) => s.id === state.selectedSegmentId);
            const remaining = segments.filter((s: Segment) => s.id !== state.selectedSegmentId);
            if (remaining.length === 0) {
            const emptyScene: TimelineSceneCollections = {
                segments: [],
                imageClips: [],
                audioSegments: [],
                smartEffects: [],
                    overlayImages: [],
                textOverlays: [],
                annotationOverlays: [],
            };
            applyTimelineSceneCollections(emptyScene);
            setClipTransitions([]);
            setMediaPath(null);
            setMediaType(null);
            setMediaLoaded(false);
            setIsPlaying(false);
            setDisplayTime(0);
            state.setSelectedSegmentId(null);
            state.setSelectedAudioId(null);
            state.setSelectedOverlayId(null);
            state.setSelectedEffectId(null);
            state.setSelectedImageClipId(null);
            state.setSelectedTextOverlayId(null);
            saveHistory({ ...emptyScene, clipTransitions: [] });
            return;
        }
            const removedDuration = selectedSegment ? Math.max(0, selectedSegment.endTime - selectedSegment.startTime) : 0;
            const removedEnd = selectedSegment ? getSegmentTimelineEnd(selectedSegment) : 0;
            const nextScene = shiftTimelineSceneAfter(
                getTimelineSceneCollections({ segments: remaining }),
                removedEnd,
                -removedDuration,
            );
            applyTimelineSceneCollections(nextScene);
            state.setSelectedSegmentId(null);
            saveHistory(nextScene);
            showNotification('success', 'Timeline', 'Segment removed');
        }
    }, [state, segments, audioSegments, overlayImages, textOverlays, smartEffects, saveHistory, setClipTransitions, setMediaPath, setMediaType, setMediaLoaded, setIsPlaying, setDisplayTime, showNotification, getTimelineSceneCollections, applyTimelineSceneCollections]);

    const deleteOverlayById = useCallback((overlayId: string) => {
        saveHistory();
        const nextOverlayImages = overlayImages.filter((overlay: OverlayImage) => overlay.id !== overlayId);
        state.setOverlayImages(nextOverlayImages);
        if (state.selectedOverlayId === overlayId) state.setSelectedOverlayId(null);
        if (state.draggedOverlayId === overlayId) state.setDraggedOverlayId(null);
        if (state.effectDragInfo && state.draggedOverlayId === overlayId) {
            state.setEffectDragInfo(null);
        }
        saveHistory({ overlayImages: nextOverlayImages });
        showNotification('success', 'Media Hub', 'Overlay removed');
    }, [overlayImages, saveHistory, showNotification, state]);

    const toggleOverlayRenderMode = useCallback((overlayId: string) => {
        const previewWidth = Math.max(640, Math.round(state.threeContainerRef?.current?.clientWidth || 960));
        const previewHeight = Math.max(360, Math.round(state.threeContainerRef?.current?.clientHeight || 540));
        const nextWidth = Math.round(previewWidth * 0.26);
        const nextHeight = Math.round(previewHeight * 0.26);

        saveHistory();
        const nextOverlayImages = overlayImages.map((overlay: OverlayImage) => {
            if (overlay.id !== overlayId) return overlay;
            const nextMode = overlay.renderMode === 'fullscreen' ? 'overlay' : 'fullscreen';
            if (nextMode === 'fullscreen') {
                return {
                    ...overlay,
                    renderMode: 'fullscreen',
                };
            }
            return {
                ...overlay,
                renderMode: 'overlay',
                width: overlay.width > 0 ? overlay.width : nextWidth,
                height: overlay.height > 0 ? overlay.height : nextHeight,
                x: Math.max(16, Math.round((previewWidth - (overlay.width > 0 ? overlay.width : nextWidth)) / 2)),
                y: Math.max(16, Math.round((previewHeight - (overlay.height > 0 ? overlay.height : nextHeight)) / 2)),
            };
        });
        state.setOverlayImages(nextOverlayImages);
        saveHistory({ overlayImages: nextOverlayImages });
    }, [overlayImages, saveHistory, state]);

    const handlePlayheadDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        logTimelineDebug('handlePlayheadDragStart', {
            displayTime: roundDebugTime(displayTimeRef.current),
            isPlaying,
            ...getVideoDebugState(),
        });
        setIsDraggingPlayhead(true);
        resumePlaybackAfterSeekRef.current = isPlaying;
        pausePlaybackForSeek();
    }, [getVideoDebugState, isPlaying, logTimelineDebug, pausePlaybackForSeek, roundDebugTime, setIsDraggingPlayhead]);

    const handleVideoLoad = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        const dur = video.duration;
        if (dur === Infinity || (isNaN(dur) && video.readyState >= 1)) {
            video.currentTime = 1e10;
            const onSeekDone = () => {
                video.removeEventListener('seeked', onSeekDone);
                video.currentTime = 0;
                const onBack = () => { video.removeEventListener('seeked', onBack); if (isFinite(video.duration) && video.duration > 0) handleVideoLoad(); };
                video.addEventListener('seeked', onBack);
            };
            video.addEventListener('seeked', onSeekDone);
            return;
        }
        if (isNaN(dur) || dur <= 0 || !isFinite(dur)) return;
        const currentAssetThumbnail = state.libraryAssets.find((asset: any) => asset.type === 'video' && asset.path === mediaPath)?.thumbnail;
        const fallbackThumbnail = currentAssetThumbnail || createVideoElementThumbnail(video, { showPlayBadge: false });
        setDuration(dur);
        setMediaLoaded((prev: boolean) => { if (!prev) { video.currentTime = 0; return true; } return prev; });
        setSegments((prev: Segment[]) => {
            if (prev.length === 0) {
                return [{
                    id: `seg-${Date.now()}`,
                    startTime: 0,
                    endTime: dur,
                    timelineStart: 0,
                }];
            }
            return prev;
        });

        if (fallbackThumbnail && mediaPath) {
            state.setLibraryAssets((prev: any[]) => prev.map((asset) =>
                asset.type === 'video' && asset.path === mediaPath && !asset.thumbnail
                    ? { ...asset, thumbnail: fallbackThumbnail }
                    : asset
            ));
        }
    }, [videoRef, setDuration, setMediaLoaded, setSegments, state.libraryAssets, state.setLibraryAssets, mediaPath]);

    useEffect(() => {
        if (state.mediaType !== 'video' || !mediaPath || segments.length > 0) return;

        let cancelled = false;
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.muted = true;
        probe.src = getMediaSrc();

        const commit = () => {
            if (cancelled) return;
            const dur = probe.duration;
            if (isNaN(dur) || dur <= 0 || !isFinite(dur)) return;

            setDuration(dur);
            setSegments((prev: Segment[]) => {
                if (prev.length > 0) return prev;
                return [{ id: `seg-${Date.now()}`, startTime: 0, endTime: dur, timelineStart: 0 }];
            });
        };

        probe.addEventListener('loadedmetadata', commit);
        probe.addEventListener('loadeddata', commit);
        probe.addEventListener('canplay', commit);
        probe.load();

        return () => {
            cancelled = true;
            probe.removeEventListener('loadedmetadata', commit);
            probe.removeEventListener('loadeddata', commit);
            probe.removeEventListener('canplay', commit);
            probe.src = '';
        };
    }, [state.mediaType, mediaPath, segments.length, getMediaSrc, setDuration, setSegments]);

    const resetSegments = useCallback(() => {
        if (duration <= 0) return;
        const newSegs = [{ id: `seg-${Date.now()}`, startTime: 0, endTime: duration, timelineStart: 0 }];
        const emptyScene: TimelineSceneCollections = {
            segments: newSegs,
            imageClips: [],
            audioSegments: [],
            smartEffects: [],
            overlayImages: [],
            textOverlays: [],
            annotationOverlays: [],
        };
        applyTimelineSceneCollections(emptyScene);
        setClipTransitions([]);
        state.setSelectedSegmentId(null);
        state.setSelectedImageClipId(null);
        state.setSelectedAudioId(null);
        state.setSelectedOverlayId(null);
        state.setSelectedEffectId(null);
        state.setSelectedTextOverlayId(null);
        state.setAudioSegments([]);
        state.setSmartEffects([]);
        state.setOverlayImages([]);
        state.setTextOverlays([]);
        setAnnotationOverlays([]);
        saveHistory({ ...emptyScene, clipTransitions: [] });
    }, [applyTimelineSceneCollections, duration, saveHistory, setAnnotationOverlays, setClipTransitions, state]);

    const setClipTransitionForPair = useCallback((fromItemId: string, toItemId: string, type: TransitionType) => {
        const fallbackType = state.transitionType || 'cut';
        const currentType = resolveClipTransitionType(clipTransitions, fromItemId, toItemId, fallbackType);
        if (currentType === type) {
            return clipTransitions;
        }

        const nextClipTransitions = upsertClipTransition(
            clipTransitions,
            fromItemId,
            toItemId,
            type,
            fallbackType,
        );
        setClipTransitions(nextClipTransitions);
        saveHistory({ clipTransitions: nextClipTransitions });
        return nextClipTransitions;
    }, [clipTransitions, saveHistory, setClipTransitions, state.transitionType]);

    const splitAudioAtPlayhead = useCallback(() => {
        const total = getTimelineDuration();
        if (total <= 0) return;
        let audio = state.selectedAudioId ? audioSegments.find((s: any) => s.id === state.selectedAudioId) : null;
        if (audio && (displayTime < audio.startTime || displayTime >= audio.startTime + audio.duration)) audio = null;
        if (!audio) audio = audioSegments.find((s: any) => displayTime >= s.startTime && displayTime < s.startTime + s.duration);
        if (!audio) return;
        const split = displayTime - audio.startTime;
        if (split < 0.5 || audio.duration - split < 0.5) return;
        const idx = audioSegments.findIndex((s: any) => s.id === audio.id);
        const copy = [...audioSegments];
        copy.splice(idx, 1, { ...audio, id: `audio-${Date.now()}-a`, duration: split }, { ...audio, id: `audio-${Date.now()}-b`, startTime: displayTime, duration: audio.duration - split });
        setAudioSegments(copy);
        saveHistory({ audioSegments: copy });
        state.setSelectedAudioId(null);
    }, [displayTime, audioSegments, state, getTimelineDuration, setAudioSegments, saveHistory]);

    const syncPlaybackToTimelineScene = useCallback((
        nextScene: TimelineSceneCollections,
        nextDisplayTime: number,
    ) => {
        const nextSeekTarget = getSeekTargetForDisplayTime(
            nextScene.segments,
            nextScene.imageClips,
            nextDisplayTime,
        );

        if (nextSeekTarget) {
            rememberSeekTarget(nextSeekTarget, nextSeekTarget.displayTime);
            void applySeekTarget(nextSeekTarget, { resume: isPlaying });
            return;
        }

        const clampedDisplayTime = Math.max(
            0,
            Math.min(getTimelineDurationFromItems(nextScene.segments, nextScene.imageClips), nextDisplayTime),
        );
        rememberSeekTarget(null, clampedDisplayTime);
        void applySeekTarget(null, { resume: false });
    }, [applySeekTarget, isPlaying, rememberSeekTarget]);

    const closeAllGaps = useCallback(() => {
        const currentScene = getTimelineSceneCollections();
        const nextScene = closeVisualGapsInTimelineScene(currentScene);
        const didChange = JSON.stringify(currentScene) !== JSON.stringify(nextScene);
        const nextDisplayTime = mapDisplayTimeAfterClosingVisualGaps(currentScene, displayTimeRef.current);

        if (!didChange) {
            syncPlaybackToTimelineScene(nextScene, nextDisplayTime);
            return false;
        }

        saveHistory();
        applyTimelineSceneCollections(nextScene);
        syncPlaybackToTimelineScene(nextScene, nextDisplayTime);
        saveHistory(nextScene);
        return true;
    }, [applyTimelineSceneCollections, getTimelineSceneCollections, saveHistory, syncPlaybackToTimelineScene]);

    const finalizeMainTrackResize = useCallback(() => {
        const currentScene = getTimelineSceneCollections();
        const nextScene = normalizeVisualTimelineScene(currentScene);
        const didChange = JSON.stringify(currentScene) !== JSON.stringify(nextScene);
        const nextDisplayTime = didChange
            ? mapDisplayTimeAfterClosingVisualGaps(currentScene, displayTimeRef.current)
            : displayTimeRef.current;

        if (didChange) {
            applyTimelineSceneCollections(nextScene);
        }

        syncPlaybackToTimelineScene(nextScene, nextDisplayTime);
        saveHistory(didChange ? nextScene : undefined);
        return didChange;
    }, [applyTimelineSceneCollections, getTimelineSceneCollections, saveHistory, syncPlaybackToTimelineScene]);

    const handleMaximize = useCallback(() => { (window as any).videoEditorAPI?.send('video-editor-maximize'); state.setIsMaximized(!state.isMaximized); }, [state]);
    const handleMinimize = useCallback(() => { (window as any).videoEditorAPI?.send('video-editor-minimize'); }, []);
    const handleClose = useCallback(() => { (window as any).videoEditorAPI?.send('video-editor-close'); }, []);

    const addTextOverlay = useCallback(() => {
        const total = getTimelineDuration();
        const dur = Math.min(2, Math.max(1, total || 2));
        const start = Math.max(0, Math.min(displayTime, Math.max(0, total - dur)));
        saveHistory();
        const newText: TextOverlay = {
            id: `text-${Date.now()}`,
            text: 'New Text',
            startTime: start,
            duration: dur,
            x: 50,
            y: 86,
            fontSize: 40,
            color: '#ffffff',
            fontFamily: DEFAULT_TEXT_OVERLAY_FONT_STACK,
            fontWeight: 'normal',
            shadowColor: '#020617',
            shadowOffsetX: 0,
            shadowOffsetY: 4,
            shadowBlur: 10,
        };
        const nextTextOverlays = [...textOverlays, newText];
        setTextOverlays(nextTextOverlays);
        saveHistory({ textOverlays: nextTextOverlays });
        setSelectedTextOverlayId(newText.id);
    }, [displayTime, getTimelineDuration, saveHistory, setTextOverlays, setSelectedTextOverlayId, textOverlays]);

    const dragHandlers = useTimelineDrag(state, saveHistory, getTimelineDuration, showNotification, loadLibraryItem);
    const moveSelectedMainTrackItem = useCallback((step: -1 | 1) => {
        const selectedMainTrackId = state.selectedImageClipId ?? state.selectedSegmentId;
        if (!selectedMainTrackId) return false;
        return dragHandlers.moveMainTrackItemByStep(selectedMainTrackId, step);
    }, [dragHandlers, state.selectedImageClipId, state.selectedSegmentId]);

    return {
        showNotification, getMediaSrc, togglePlay, getTimelineDuration, getVideoTimeFromDisplayTime,
        getSeekTargetFromDisplayTime, getSeekTargetFromVideoTime, getDisplayTimeFromVideoTime, seekTimelineToClientX, seekToDisplayTime, rememberSeekTarget,
        getPendingPlaybackTarget, clearPendingPlaybackTarget, isSeekInFlight,
        startPlaybackFromTarget, setClipTransitionForPair,
        commitLastRequestedSeekTarget,
        splitAtPlayhead, handleImportMedia, saveHistory, deleteSelectedSegment, deleteOverlayById, toggleOverlayRenderMode, resetSegments,
        splitAudioAtPlayhead, closeAllGaps, finalizeMainTrackResize, handleMaximize, handleMinimize, handleClose,
        handleExport, handleAutoPolish, addTextOverlay, moveSelectedMainTrackItem,
        ...dragHandlers,
        handlePlayheadDragStart, handleVideoLoad, loadLibraryItem, deleteLibraryItem, clearLibrary,
        undo, redo, canUndo, canRedo,
    };
};
