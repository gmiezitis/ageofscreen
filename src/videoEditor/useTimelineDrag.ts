import { useCallback } from 'react';
import { Segment, SmartEffect, AudioSegment, OverlayImage, TextOverlay, ImageClip } from './types';
import { toMediaFileUrl } from '../shared/mediaPaths';
import { createMediaThumbnail } from './mediaThumbnails';
import { insertImageClipIntoTimelineScene, reorderVisualTimelineSceneItems } from './timelineScene';
import {
    findGapAtDisplayTime,
    buildTimelinePlaybackItems,
} from './timelineClips';
import { buildVisualTimelineSceneItems } from './timelineScene';

/**
 * Timeline drag-start handlers for segments, effects, audio, overlays, and text.
 * Also includes resize-start and the library-asset drop handler.
 * Extracted from useVideoEditorHandlers to keep each module focused.
 */
export function useTimelineDrag(
    state: any,
    saveHistory: (stateOverride?: any) => void,
    getTimelineDuration: () => number,
    showNotification: (type: string, title: string, message: string) => void,
    loadLibraryItem: (id: string) => boolean,
) {
    const {
        segments, setSegments,
        audioSegments, setAudioSegments,
        smartEffects,
        overlayImages, setOverlayImages,
        imageClips, setImageClips,
        textOverlays,
        annotationOverlays,
        setIsLoading,
    } = state;

    type LibraryAssetLike = {
        id: string;
        type: 'video' | 'image' | 'audio';
        path: string;
        name: string;
        thumbnail?: string;
        cursorData?: any[];
    };

    const IMAGE_DROP_SNAP_DISTANCE = 0.9;

    const getVideoTrackRowRect = useCallback((target: EventTarget | null) => {
        const targetElement = target instanceof HTMLElement ? target : null;
        const trackRow = targetElement?.closest('.video-track-row') as HTMLElement | null;
        const fallbackRow = state.timelineRef.current?.querySelector('.video-track-row') as HTMLElement | null;
        return (trackRow ?? fallbackRow)?.getBoundingClientRect() ?? null;
    }, [state.timelineRef]);

    const getMainTrackDisplayTimeFromClientX = useCallback((clientX: number, target: EventTarget | null) => {
        const totalDuration = getTimelineDuration();
        const rect = getVideoTrackRowRect(target);
        if (!rect || totalDuration <= 0) {
            return 0;
        }

        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(rect.width, 1)));
        return percent * totalDuration;
    }, [getTimelineDuration, getVideoTrackRowRect]);

    const getMainTrackTargetIndexFromDisplayTime = useCallback((displayTime: number) => {
        const visualItems = buildVisualTimelineSceneItems(segments, imageClips);
        if (visualItems.length === 0) {
            return 0;
        }

        const index = visualItems.findIndex((item) => (
            displayTime < item.startTime + (item.duration / 2)
        ));
        return index >= 0 ? index : visualItems.length;
    }, [imageClips, segments]);

    const loadImageDimensions = useCallback((filePath: string): Promise<{ width: number; height: number } | null> => (
        new Promise((resolve) => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => resolve({
                width: img.naturalWidth || 0,
                height: img.naturalHeight || 0,
            });
            img.onerror = () => resolve(null);
            img.src = toMediaFileUrl(filePath);
        })
    ), []);

    const buildImagePlacement = useCallback(async (filePath: string) => {
        const previewWidth = Math.max(640, Math.round(state.threeContainerRef?.current?.clientWidth || 960));
        const previewHeight = Math.max(360, Math.round(state.threeContainerRef?.current?.clientHeight || 540));
        const maxWidth = previewWidth * 0.26;
        const maxHeight = previewHeight * 0.26;
        const dimensions = await loadImageDimensions(filePath);

        const naturalWidth = dimensions?.width && dimensions.width > 0 ? dimensions.width : 1280;
        const naturalHeight = dimensions?.height && dimensions.height > 0 ? dimensions.height : 720;
        const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
        const width = Math.max(96, Math.round(naturalWidth * scale));
        const height = Math.max(72, Math.round(naturalHeight * scale));

        return {
            width,
            height,
            x: Math.max(16, Math.round((previewWidth - width) / 2)),
            y: Math.max(16, Math.round((previewHeight - height) / 2)),
        };
    }, [loadImageDimensions, state.threeContainerRef]);

    const clearSelection = useCallback(() => {
        state.setSelectedSegmentId(null);
        state.setSelectedAudioId(null);
        state.setSelectedEffectId(null);
        state.setSelectedOverlayId(null);
        state.setSelectedImageClipId(null);
        state.setSelectedTextOverlayId(null);
    }, [state]);

    const addLibraryItemToTimeline = useCallback(async (
        assetOrId: string | LibraryAssetLike,
        startTime?: number,
        imagePlacement: 'clip' | OverlayImage['renderMode'] = 'clip',
    ) => {
        const libraryAsset = typeof assetOrId === 'string'
            ? state.libraryAssets.find((a: any) => a.id === assetOrId)
            : assetOrId;
        if (!libraryAsset) return false;

        const effectiveImagePlacement: 'clip' | OverlayImage['renderMode'] =
            libraryAsset.type === 'image' && state.mediaType === 'image' && imagePlacement === 'clip'
                ? 'overlay'
                : imagePlacement;

        const timelineDuration = getTimelineDuration();
        const requestedTime = Math.max(0, Math.min(startTime ?? state.displayTime ?? 0, Math.max(timelineDuration, 0)));
        
        // Gap filling logic
        const gap = (libraryAsset.type === 'image' && effectiveImagePlacement === 'clip')
            ? findGapAtDisplayTime(segments, imageClips, requestedTime, IMAGE_DROP_SNAP_DISTANCE)
            : null;

        const insertionTime = gap ? gap.startTime : requestedTime;
        saveHistory();

        if (libraryAsset.type === 'audio') {
            const newAudio: AudioSegment = {
                id: `audio-${Date.now()}`,
                file: libraryAsset.path,
                name: libraryAsset.name,
                startTime: insertionTime,
                duration: 10,
                volume: 1,
            };
            const nextAudioSegments = [...audioSegments, newAudio];
            setAudioSegments(nextAudioSegments);
            saveHistory({ audioSegments: nextAudioSegments });
            state.setDisplayTime(insertionTime);
            clearSelection();
            state.setSelectedAudioId(newAudio.id);
            showNotification('success', 'Timeline', `Added audio: ${libraryAsset.name}`);
            return true;
        }

        if (libraryAsset.type === 'image') {
            if (effectiveImagePlacement === 'clip') {
                const clipDuration = gap ? gap.duration : 3; // 3 sec default as requested
                const newClip: ImageClip = {
                    id: `image-clip-${Date.now()}`,
                    file: libraryAsset.path,
                    name: libraryAsset.name,
                    thumbnail: libraryAsset.thumbnail,
                    startTime: insertionTime,
                    duration: clipDuration,
                };

                const nextScene = insertImageClipIntoTimelineScene({
                    segments,
                    imageClips,
                    audioSegments,
                    smartEffects,
                    overlayImages,
                    textOverlays,
                    annotationOverlays,
                }, newClip);

                setSegments(nextScene.segments);
                setImageClips(nextScene.imageClips);
                setAudioSegments(nextScene.audioSegments);
                state.setSmartEffects(nextScene.smartEffects);
                setOverlayImages(nextScene.overlayImages);
                state.setTextOverlays(nextScene.textOverlays);
                state.setAnnotationOverlays(nextScene.annotationOverlays);
                saveHistory(nextScene);
                state.setDisplayTime(insertionTime);

                clearSelection();
                state.setSelectedImageClipId(newClip.id);
                showNotification('success', 'Timeline', `Inserted image clip: ${libraryAsset.name}`);
                return true;
            }

            const placement = effectiveImagePlacement === 'overlay'
                ? await buildImagePlacement(libraryAsset.path)
                : {
                    width: 0,
                    height: 0,
                    x: 0,
                    y: 0,
                };
            const newOverlay: OverlayImage = {
                id: `overlay-${Date.now()}`,
                file: libraryAsset.path,
                thumbnail: libraryAsset.thumbnail,
                startTime: insertionTime,
                duration: 4,
                x: placement.x,
                y: placement.y,
                width: placement.width,
                height: placement.height,
                renderMode: effectiveImagePlacement,
            };
            const nextOverlayImages = [...overlayImages, newOverlay];
            setOverlayImages(nextOverlayImages);
            saveHistory({ overlayImages: nextOverlayImages });
            state.setDisplayTime(insertionTime);
            clearSelection();
            state.setSelectedOverlayId(newOverlay.id);
            showNotification('success', 'Timeline', effectiveImagePlacement === 'overlay'
                ? `Added image overlay: ${libraryAsset.name}`
                : `Added full-frame image: ${libraryAsset.name}`);
            return true;
        }

        if (libraryAsset.type === 'video') {
            clearSelection();
            const didLoad = loadLibraryItem(libraryAsset.id);
            if (didLoad) {
                showNotification('success', 'Timeline', `Loaded video: ${libraryAsset.name}`);
            }
            return didLoad;
        }

        return false;
    }, [state, getTimelineDuration, imageClips, segments, saveHistory, setAudioSegments, setImageClips, setOverlayImages, showNotification, loadLibraryItem, buildImagePlacement, clearSelection, audioSegments, smartEffects, overlayImages, textOverlays, annotationOverlays]);

    const applyTimelineScene = useCallback((nextScene: any) => {
        setSegments(nextScene.segments);
        setImageClips(nextScene.imageClips);
        setAudioSegments(nextScene.audioSegments);
        state.setSmartEffects(nextScene.smartEffects);
        setOverlayImages(nextScene.overlayImages);
        state.setTextOverlays(nextScene.textOverlays);
        state.setAnnotationOverlays(nextScene.annotationOverlays);
    }, [setAudioSegments, setImageClips, setOverlayImages, setSegments, state]);

    const reorderMainTrackItemToIndex = useCallback((itemId: string, targetIndex: number) => {
        const nextScene = reorderVisualTimelineSceneItems({
            segments,
            imageClips,
            audioSegments,
            smartEffects,
            overlayImages,
            textOverlays,
            annotationOverlays,
        }, itemId, targetIndex);

        if (!nextScene) {
            return false;
        }

        applyTimelineScene(nextScene);
        saveHistory(nextScene);
        return true;
    }, [annotationOverlays, applyTimelineScene, audioSegments, imageClips, overlayImages, saveHistory, segments, smartEffects, textOverlays]);

    const moveMainTrackItemByStep = useCallback((itemId: string, step: -1 | 1) => {
        const visualItems = buildVisualTimelineSceneItems(segments, imageClips);
        const currentIndex = visualItems.findIndex((item) => item.id === itemId);
        if (currentIndex < 0) return false;

        const nextIndex = Math.max(0, Math.min(visualItems.length - 1, currentIndex + step));
        if (nextIndex === currentIndex) return false;

        saveHistory();
        return reorderMainTrackItemToIndex(itemId, nextIndex);
    }, [imageClips, reorderMainTrackItemToIndex, saveHistory, segments]);

    const importImageClipAtPlayhead = useCallback(async () => {
        const api = (window as any).videoEditorAPI;
        if (!api?.invoke) return false;

        setIsLoading?.(true);
        try {
            const result = await api.invoke('open-media-file', 'image');
            if (!result?.filePath) return false;

            const newAsset: LibraryAssetLike = {
                id: `image-${Date.now()}`,
                type: 'image',
                path: result.filePath,
                name: result.fileName,
            };

            state.setLibraryAssets((prev: any[]) => [newAsset, ...prev]);
            const didInsert = await addLibraryItemToTimeline(newAsset, state.displayTime ?? 0, 'clip');

            void createMediaThumbnail(result.filePath, 'image')
                .then((thumbnail) => {
                    if (!thumbnail) return;
                    state.setLibraryAssets((prev: any[]) => prev.map((asset: any) => (
                        asset.id === newAsset.id ? { ...asset, thumbnail } : asset
                    )));
                })
                .catch(() => {
                    // Thumbnail generation should never block timeline insertion.
                });

            return didInsert;
        } catch (error) {
            console.error('[VideoEditor] Failed to import image clip:', error);
            return false;
        } finally {
            setIsLoading?.(false);
        }
    }, [addLibraryItemToTimeline, setIsLoading, state]);

    const handleResizeStart = (e: React.MouseEvent, id: string, type: string, edge: string, initialTime: number, initialDuration: number) => {
        e.preventDefault();
        e.stopPropagation();
        saveHistory();
        state.setResizing({
            id,
            type,
            edge,
            startX: e.clientX,
            initialTime,
            initialDuration,
            initialScene: type === 'video' || type === 'imageClip'
                ? {
                    segments,
                    imageClips,
                    audioSegments,
                    smartEffects,
                    overlayImages,
                    textOverlays,
                    annotationOverlays,
                }
                : undefined,
        });
    };

    const handleDragStart = (e: React.DragEvent, id: string) => {
        e.stopPropagation();
        state.setDraggedSegmentId(id);
        const draggedVideoSegment = segments.find((segment: Segment) => segment.id === id);
        const draggedImageClip = imageClips.find((clip: ImageClip) => clip.id === id);
        if (draggedVideoSegment) {
            clearSelection();
            state.setSelectedSegmentId(id);
        } else if (draggedImageClip) {
            clearSelection();
            state.setSelectedImageClipId(id);
        }
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        state.setDragOverIndex(index);
    };

    const handleDrop = (e: React.DragEvent, dropTarget: 'video' | 'overlays' | 'audio') => {
        e.preventDefault();
        if (!state.draggedSegmentId || !state.timelineRef.current) return;

        const visualItems = buildVisualTimelineSceneItems(segments, imageClips);
        const draggedSeg = segments.find((s: Segment) => s.id === state.draggedSegmentId);
        const draggedClip = imageClips.find((c: ImageClip) => c.id === state.draggedSegmentId);
        
        const libraryAsset = draggedSeg || draggedClip ? null : state.libraryAssets.find((a: any) => a.id === state.draggedSegmentId);
        const snapDistance = libraryAsset?.type === 'image' ? IMAGE_DROP_SNAP_DISTANCE : 0.5;

        const totalDuration = getTimelineDuration();
        let newTimelineStart = getMainTrackDisplayTimeFromClientX(e.clientX, e.target);

        // Snapping logic
        if (newTimelineStart < snapDistance) {
            newTimelineStart = 0;
        } else if (newTimelineStart > totalDuration - snapDistance) {
            newTimelineStart = totalDuration;
        } else {
            // Snap to item boundaries
            const items = buildTimelinePlaybackItems(segments, imageClips);
            for (const item of items) {
                if (Math.abs(item.startTime - newTimelineStart) < snapDistance) {
                    newTimelineStart = item.startTime;
                    break;
                }
                if (Math.abs(item.endTime - newTimelineStart) < snapDistance) {
                    newTimelineStart = item.endTime;
                    break;
                }
            }
        }

        if (draggedSeg || (state.draggedSegmentId && imageClips.find((c: any) => c.id === state.draggedSegmentId))) {
            if (dropTarget !== 'video') {
                state.setDraggedSegmentId(null);
                state.setDragOverIndex(null);
                return;
            }

            const currentId = state.draggedSegmentId;
            const currentIndex = visualItems.findIndex((item) => item.id === currentId);
            const targetIndex = state.dragOverIndex ?? getMainTrackTargetIndexFromDisplayTime(newTimelineStart);

            if (currentIndex >= 0) {
                const normalizedDropIndex = Math.max(0, Math.min(visualItems.length, targetIndex));
                const nextIndex = normalizedDropIndex > currentIndex
                    ? normalizedDropIndex - 1
                    : normalizedDropIndex;

                if (nextIndex !== currentIndex) {
                    saveHistory();
                    reorderMainTrackItemToIndex(currentId, nextIndex);
                }
            }

            state.setDraggedSegmentId(null);
            state.setDragOverIndex(null);
            return;
        }

        if (libraryAsset) {
            if (libraryAsset.type === 'image' && dropTarget === 'audio') {
                state.setDraggedSegmentId(null);
                state.setDragOverIndex(null);
                return;
            }
            const imageMode = dropTarget === 'overlays'
                ? 'overlay'
                : libraryAsset.type === 'image'
                    ? (state.mediaType === 'image' ? 'overlay' : 'clip')
                    : 'fullscreen';
            
            // If dropping into a specific index
            if (state.dragOverIndex !== null && imageMode === 'clip') {
                const targetIndex = state.dragOverIndex;
                const visualItems = buildVisualTimelineSceneItems(segments, imageClips);
                const insertionTime = targetIndex < visualItems.length 
                    ? visualItems[targetIndex].startTime 
                    : getTimelineDuration();
                
                void addLibraryItemToTimeline(libraryAsset.id, insertionTime, 'clip');
            } else {
                void addLibraryItemToTimeline(libraryAsset.id, newTimelineStart, imageMode);
            }

            state.setDraggedSegmentId(null);
            state.setDragOverIndex(null);
            return;
        }

        state.setDraggedSegmentId(null);
        state.setDragOverIndex(null);
    };

    const handleDragEnd = () => {
        state.setDraggedSegmentId(null);
        state.setDragOverIndex(null);
    };

    const handleEffectDragStart = (clientX: number, id: string) => {
        const effect = smartEffects.find((ef: SmartEffect) => ef.id === id);
        if (!effect) return;
        saveHistory();
        state.setDraggingEffectId(id);
        state.setEffectDragInfo({ startX: clientX, initialStart: effect.startTime });
    };

    const handleAudioDragStart = (clientX: number, id: string) => {
        const audio = audioSegments.find((a: AudioSegment) => a.id === id);
        if (!audio) return;
        saveHistory();
        state.setDraggedAudioId(id);
        state.setEffectDragInfo({ startX: clientX, initialStart: audio.startTime });
    };

    const handleOverlayDragStart = (clientX: number, id: string) => {
        const overlay = overlayImages.find((o: OverlayImage) => o.id === id);
        if (!overlay) return;
        saveHistory();
        state.setDraggedOverlayId(id);
        state.setEffectDragInfo({ startX: clientX, initialStart: overlay.startTime });
    };

    const handleTextOverlayDragStart = (clientX: number, id: string) => {
        const textOverlay = textOverlays.find((t: TextOverlay) => t.id === id);
        if (!textOverlay) return;
        saveHistory();
        state.setDraggedTextOverlayId(id);
        state.setEffectDragInfo({ startX: clientX, initialStart: textOverlay.startTime });
    };

    const handleImageClipDragStart = (clientX: number, id: string) => {
        const clip = imageClips.find((candidate: ImageClip) => candidate.id === id);
        if (!clip) return;
        saveHistory();
        state.setDraggedImageClipId(id);
        state.setEffectDragInfo({ startX: clientX, initialStart: clip.startTime });
        state.setSelectedImageClipId(id);
    };

    return {
        addLibraryItemToTimeline,
        importImageClipAtPlayhead,
        getMainTrackTargetIndexFromDisplayTime,
        moveMainTrackItemByStep,
        handleResizeStart, handleDragStart, handleDragOver, handleDrop, handleDragEnd,
        handleEffectDragStart, handleAudioDragStart, handleOverlayDragStart, handleTextOverlayDragStart, handleImageClipDragStart,
    };
}
