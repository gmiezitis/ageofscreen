import { useEffect, useRef } from 'react';
import { shiftTimelineSceneAfter } from './timelineScene';

/**
 * Handles mouse-driven drag & resize operations on the timeline:
 * - Playhead scrubbing
 * - Effect / audio / overlay / text overlay position dragging
 * - Segment, audio, effect, overlay, and text edge resizing
 *
 * Extracted from videoEditor.tsx to keep the orchestrator lean.
 */
export function useDragResize(state: any, handlers: any) {
    const { resizing } = state;
    const handlersRef = useRef(handlers);

    useEffect(() => {
        handlersRef.current = handlers;
    });

    useEffect(() => {
        const isDraggingAsset = state.draggingEffectId || state.draggedAudioId || state.draggedOverlayId || state.draggedTextOverlayId || state.draggedImageClipId;
        if (!state.isDraggingPlayhead && !resizing && !isDraggingAsset) return;

        let rafId: number | null = null;
        let saveHistoryTimeoutId: number | null = null;
        let lastEvent: MouseEvent | null = null;

        const processMove = () => {
            const e = lastEvent;
            if (!e || !state.timelineRef.current) {
                rafId = null;
                return;
            }

            const rect = state.timelineRef.current.getBoundingClientRect();
            const labelWidth = 100;
            const trackWidth = rect.width - labelWidth;
            const totalDuration = handlers.getTimelineDuration();

            if (state.isDraggingPlayhead) {
                const seekTargetElement = (state.timelineRef.current.querySelector('.ruler-content') as HTMLElement | null)
                    ?? state.timelineRef.current;

                handlers.seekTimelineToClientX?.(e.clientX, seekTargetElement);
            } else if ((state.draggingEffectId || state.draggedAudioId || state.draggedOverlayId || state.draggedTextOverlayId || state.draggedImageClipId) && state.effectDragInfo) {
                const pxPerSec = trackWidth / (totalDuration > 0 ? totalDuration : 1);
                const deltaPx = e.clientX - state.effectDragInfo.startX;
                const deltaSec = deltaPx / pxPerSec;

                let draggedDuration = 0.1;
                if (state.draggingEffectId) {
                    const effect = state.smartEffects.find((ef: any) => ef.id === state.draggingEffectId);
                    draggedDuration = effect?.duration ?? draggedDuration;
                } else if (state.draggedAudioId) {
                    const audio = state.audioSegments.find((a: any) => a.id === state.draggedAudioId);
                    draggedDuration = audio?.duration ?? draggedDuration;
                } else if (state.draggedOverlayId) {
                    const overlay = state.overlayImages.find((o: any) => o.id === state.draggedOverlayId);
                    draggedDuration = overlay?.duration ?? draggedDuration;
                } else if (state.draggedTextOverlayId) {
                    const textItem = state.textOverlays.find((t: any) => t.id === state.draggedTextOverlayId);
                    draggedDuration = textItem?.duration ?? draggedDuration;
                } else if (state.draggedImageClipId) {
                    const clip = state.imageClips.find((c: any) => c.id === state.draggedImageClipId);
                    draggedDuration = clip?.duration ?? draggedDuration;
                }

                const maxStart = Math.max(0, totalDuration - draggedDuration);
                const newStart = Math.max(0, Math.min(maxStart, state.effectDragInfo.initialStart + deltaSec));

                if (state.draggingEffectId) {
                    state.setSmartEffects((prev: any) => prev.map((ef: any) =>
                        ef.id === state.draggingEffectId ? { ...ef, startTime: newStart } : ef
                    ));
                } else if (state.draggedAudioId) {
                    state.setAudioSegments((prev: any) => prev.map((a: any) =>
                        a.id === state.draggedAudioId ? { ...a, startTime: newStart } : a
                    ));
                } else if (state.draggedOverlayId) {
                    state.setOverlayImages((prev: any) => prev.map((o: any) =>
                        o.id === state.draggedOverlayId ? { ...o, startTime: newStart } : o
                    ));
                } else if (state.draggedTextOverlayId) {
                    state.setTextOverlays((prev: any) => prev.map((t: any) =>
                        t.id === state.draggedTextOverlayId ? { ...t, startTime: newStart } : t
                    ));
                } else if (state.draggedImageClipId) {
                    state.setImageClips((prev: any) => prev.map((c: any) =>
                        c.id === state.draggedImageClipId ? { ...c, startTime: newStart } : c
                    ));
                }
            } else if (resizing) {
                const pxPerSec = trackWidth / (totalDuration > 0 ? totalDuration : 1);
                const deltaPx = e.clientX - resizing.startX;
                const deltaSec = deltaPx / pxPerSec;
                const applyMainTrackScene = (nextScene: any) => {
                    state.setSegments(nextScene.segments);
                    state.setImageClips(nextScene.imageClips);
                    state.setAudioSegments(nextScene.audioSegments);
                    state.setSmartEffects(nextScene.smartEffects);
                    state.setOverlayImages(nextScene.overlayImages);
                    state.setTextOverlays(nextScene.textOverlays);
                    state.setAnnotationOverlays(nextScene.annotationOverlays);
                };
                const initialScene = resizing.initialScene;

                if (resizing.type === 'video') {
                    const initialSegment = initialScene?.segments?.find((s: any) => s.id === resizing.id);
                    if (initialSegment) {
                        const minDuration = 0.08;
                        const originalDuration = Math.max(minDuration, initialSegment.endTime - initialSegment.startTime);
                        const originalTimelineEnd = initialSegment.timelineStart + originalDuration;
                        const nextSegments = initialScene.segments.map((segment: any) => {
                            if (segment.id !== resizing.id) return segment;
                            if (resizing.edge === 'end') {
                                return {
                                    ...segment,
                                    endTime: Math.max(segment.startTime + minDuration, initialSegment.endTime + deltaSec),
                                };
                            }

                            return {
                                ...segment,
                                startTime: Math.max(0, Math.min(segment.endTime - minDuration, initialSegment.startTime + deltaSec)),
                            };
                        });
                        const resizedSegment = nextSegments.find((segment: any) => segment.id === resizing.id);
                        const nextDuration = Math.max(minDuration, resizedSegment.endTime - resizedSegment.startTime);
                        const durationDelta = nextDuration - originalDuration;
                        const nextScene = shiftTimelineSceneAfter(
                            { ...initialScene, segments: nextSegments },
                            originalTimelineEnd,
                            durationDelta,
                        );
                        applyMainTrackScene(nextScene);
                    } else {
                        state.setSegments((prev: any) => prev.map((s: any) => {
                            if (s.id !== resizing.id) return s;
                            if (resizing.edge === 'end') {
                                return { ...s, endTime: Math.max(s.startTime + 0.08, resizing.initialDuration + resizing.initialTime + deltaSec) };
                            }
                            return { ...s, startTime: Math.max(0, Math.min(s.endTime - 0.08, resizing.initialTime + deltaSec)) };
                        }));
                    }
                } else if (resizing.type === 'audio') {
                    state.setAudioSegments((prev: any) => prev.map((s: any) => {
                        if (s.id !== resizing.id) return s;
                        if (resizing.edge === 'end') {
                            return { ...s, duration: Math.max(0.1, resizing.initialDuration + deltaSec) };
                        } else {
                            const newStart = Math.max(0, resizing.initialTime + deltaSec);
                            const newDuration = Math.max(0.1, resizing.initialDuration - deltaSec);
                            return { ...s, startTime: newStart, duration: newDuration };
                        }
                    }));
                } else if (resizing.type === 'effect') {
                    state.setSmartEffects((prev: any) => prev.map((s: any) => {
                        if (s.id !== resizing.id) return s;
                        if (resizing.edge === 'end') {
                            return { ...s, duration: Math.max(0.2, Math.min(totalDuration - s.startTime, resizing.initialDuration + deltaSec)) };
                        } else {
                            const maxDelta = resizing.initialDuration - 0.2;
                            const actualDelta = Math.min(maxDelta, deltaSec);
                            const newStart = Math.max(0, resizing.initialTime + actualDelta);
                            const newDuration = resizing.initialDuration - actualDelta;
                            return { ...s, startTime: newStart, duration: Math.max(0.2, newDuration) };
                        }
                    }));
                } else if (resizing.type === 'overlay' || resizing.type === 'image') {
                    state.setOverlayImages((prev: any) => prev.map((s: any) => {
                        if (s.id !== resizing.id) return s;
                        if (resizing.edge === 'end') {
                            return { ...s, duration: Math.max(0.2, Math.min(totalDuration - s.startTime, resizing.initialDuration + deltaSec)) };
                        } else {
                            const maxDelta = resizing.initialDuration - 0.2;
                            const actualDelta = Math.min(maxDelta, deltaSec);
                            const newStart = Math.max(0, resizing.initialTime + actualDelta);
                            const newDuration = resizing.initialDuration - actualDelta;
                            return { ...s, startTime: newStart, duration: Math.max(0.2, newDuration) };
                        }
                    }));
                } else if (resizing.type === 'imageClip') {
                    const initialClip = initialScene?.imageClips?.find((clip: any) => clip.id === resizing.id);
                    if (initialClip) {
                        const minDuration = 0.08;
                        const originalDuration = Math.max(minDuration, initialClip.duration);
                        const originalEnd = initialClip.startTime + originalDuration;
                        const nextImageClips = initialScene.imageClips.map((clip: any) => {
                            if (clip.id !== resizing.id) return clip;
                            if (resizing.edge === 'end') {
                                return {
                                    ...clip,
                                    duration: Math.max(minDuration, originalDuration + deltaSec),
                                };
                            }

                            const maxDelta = originalDuration - minDuration;
                            const actualDelta = Math.max(-initialClip.startTime, Math.min(maxDelta, deltaSec));
                            return {
                                ...clip,
                                startTime: Math.max(0, initialClip.startTime + actualDelta),
                                duration: Math.max(minDuration, originalDuration - actualDelta),
                            };
                        });
                        const resizedClip = nextImageClips.find((clip: any) => clip.id === resizing.id);
                        const nextEnd = resizedClip.startTime + Math.max(minDuration, resizedClip.duration);
                        const durationDelta = resizing.edge === 'end'
                            ? nextEnd - originalEnd
                            : 0;
                        const nextScene = shiftTimelineSceneAfter(
                            { ...initialScene, imageClips: nextImageClips },
                            originalEnd,
                            durationDelta,
                            { excludeImageClipId: resizing.id },
                        );
                        applyMainTrackScene(nextScene);
                    } else {
                        state.setImageClips((prev: any) => prev.map((s: any) => {
                            if (s.id !== resizing.id) return s;
                            if (resizing.edge === 'end') {
                                return { ...s, duration: Math.max(0.08, resizing.initialDuration + deltaSec) };
                            }
                            const maxDelta = resizing.initialDuration - 0.08;
                            const actualDelta = Math.min(maxDelta, deltaSec);
                            const newStart = Math.max(0, resizing.initialTime + actualDelta);
                            const newDuration = resizing.initialDuration - actualDelta;
                            return { ...s, startTime: newStart, duration: Math.max(0.08, newDuration) };
                        }));
                    }
                } else if (resizing.type === 'text') {
                    state.setTextOverlays((prev: any) => prev.map((s: any) => {
                        if (s.id !== resizing.id) return s;
                        if (resizing.edge === 'end') {
                            return { ...s, duration: Math.max(0.2, Math.min(totalDuration - s.startTime, resizing.initialDuration + deltaSec)) };
                        } else {
                            const maxDelta = resizing.initialDuration - 0.2;
                            const actualDelta = Math.min(maxDelta, deltaSec);
                            const newStart = Math.max(0, resizing.initialTime + actualDelta);
                            const newDuration = resizing.initialDuration - actualDelta;
                            return { ...s, startTime: newStart, duration: Math.max(0.2, newDuration) };
                        }
                    }));
                }
            }
            rafId = null;
        };

        const handleMove = (e: MouseEvent) => {
            lastEvent = e;
            if (rafId === null) {
                rafId = requestAnimationFrame(processMove);
            }
        };

        const handleUp = (e: MouseEvent) => {
            const wasDraggingPlayhead = state.isDraggingPlayhead;
            const isMainTrackResize = Boolean(resizing && (resizing.type === 'video' || resizing.type === 'imageClip'));
            const shouldSaveHistory = Boolean((resizing || isDraggingAsset) && !isMainTrackResize);
            if (!wasDraggingPlayhead) {
                lastEvent = e;
            } else {
                const releaseTarget = e.target as Node | null;
                const releasedInsideTimeline = !!state.timelineRef.current
                    && !!releaseTarget
                    && state.timelineRef.current.contains(releaseTarget);
                if (releasedInsideTimeline) {
                    lastEvent = e;
                }
            }
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            processMove();
            lastEvent = null;
            state.setIsDraggingPlayhead(false);
            state.setResizing(null);
            state.setDraggingEffectId(null);
            state.setDraggedAudioId(null);
            state.setDraggedOverlayId(null);
            state.setDraggedTextOverlayId(null);
            state.setDraggedImageClipId(null);
            state.setEffectDragInfo(null);
            if (wasDraggingPlayhead) {
                void handlersRef.current.commitLastRequestedSeekTarget?.();
            }
            if (isMainTrackResize) {
                handlersRef.current.finalizeMainTrackResize?.();
            }
            if (shouldSaveHistory) {
                saveHistoryTimeoutId = window.setTimeout(() => {
                    handlersRef.current.saveHistory?.();
                }, 0);
            }
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            if (saveHistoryTimeoutId !== null) window.clearTimeout(saveHistoryTimeoutId);
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [state.isDraggingPlayhead, resizing, state.draggingEffectId, state.draggedAudioId, state.draggedOverlayId, state.draggedTextOverlayId, state.draggedImageClipId, state.effectDragInfo, state, handlers]);
}
