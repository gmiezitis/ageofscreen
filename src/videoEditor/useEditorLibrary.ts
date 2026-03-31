import { useCallback, useEffect } from 'react';
import { createMediaThumbnail } from './mediaThumbnails';
import { buildSmartTrackingEffects, DEFAULT_SMART_TRACKING_PROFILE } from './smartTracking';

/**
 * Manages the media library: import, load, delete, and clear items.
 * Extracted from useVideoEditorHandlers to keep each module focused.
 */
export function useEditorLibrary(state: any, showNotification: (type: string, title: string, message: string) => void) {
    const {
        mediaPath, setMediaPath, setMediaType, setMediaName, setMediaLoaded,
        setIsLoading, setSegments, setIsPlaying, setDisplayTime,
        setTextOverlays,
        setAnnotationOverlays,
        setAnnotationCanvasSize,
        history, setHistory, historyIndex, setHistoryIndex,
    } = state;

    const resetSelections = useCallback(() => {
        state.setSelectedSegmentId?.(null);
        state.setSelectedAudioId?.(null);
        state.setSelectedEffectId?.(null);
        state.setSelectedOverlayId?.(null);
        state.setSelectedImageClipId?.(null);
        state.setSelectedTextOverlayId?.(null);
    }, [state]);

    const applyMediaContextState = useCallback((cursorData?: any[]) => {
        const nextCursorData = Array.isArray(cursorData) ? cursorData : [];
        state.setRecordedCursorData(nextCursorData);
        state.setSmartEffects(
            nextCursorData.length > 0
                ? buildSmartTrackingEffects(nextCursorData, {
                    profile: state.autoPolishTrackingProfile || DEFAULT_SMART_TRACKING_PROFILE,
                })
                : []
        );
        state.setAudioSegments([]);
        state.setOverlayImages([]);
        state.setImageClips([]);
        state.setClipTransitions?.([]);
        resetSelections();
    }, [resetSelections, state]);

    useEffect(() => {
        let cancelled = false;
        const missingThumbnail = state.libraryAssets.find((asset: any) =>
            (asset.type === 'video' || asset.type === 'image') && !asset.thumbnail
        );

        if (!missingThumbnail) return;

        createMediaThumbnail(missingThumbnail.path, missingThumbnail.type)
            .then((thumbnail) => {
                if (cancelled || !thumbnail) return;
                state.setLibraryAssets((prev: any[]) => prev.map((asset) =>
                    asset.id === missingThumbnail.id ? { ...asset, thumbnail } : asset
                ));
            })
            .catch(() => {
                // Keep generic icon fallback if thumbnail generation fails.
            });

        return () => {
            cancelled = true;
        };
    }, [state.libraryAssets, state.setLibraryAssets]);

    const handleImportMedia = async (type: 'video' | 'image' | 'audio') => {
        setIsLoading(true);
        try {
            const api = (window as any).videoEditorAPI;
            const result = await api?.invoke('open-media-file', type);
            if (result && result.filePath) {
                console.log('[VideoEditor] Media file selected:', result.filePath, type);
                
                // 1. Create asset with current data (thumbnail will be added later if possible)
                const newAsset = {
                    id: `${type}-${Date.now()}`,
                    type,
                    path: result.filePath,
                    name: result.fileName,
                    thumbnail: undefined as string | undefined, // Initial value
                    cursorData: Array.isArray(result.cursorData) ? result.cursorData : undefined,
                };
                
                // 2. Add to library AND set as current media immediately
                state.setLibraryAssets((prev: any) => [newAsset, ...prev]);

                if (type === 'video' || !mediaPath) {
                    setMediaPath(result.filePath);
                    setMediaType(type);
                    setMediaName(result.fileName);
                    setMediaLoaded(false);
                    setIsPlaying(false);
                    setDisplayTime(0);
                    setSegments([]);
                    setHistory([]);
                    setHistoryIndex(-1);
                    setTextOverlays([]);
                    setAnnotationOverlays([]);
                    setAnnotationCanvasSize(null);
                    applyMediaContextState(type === 'video' ? result.cursorData : []);
                }
                
                showNotification('success', 'Media Hub', `Adding ${type}: ${result.fileName}`);

                // 3. Generate thumbnail asynchronously to avoid blocking the UI
                createMediaThumbnail(result.filePath, type)
                    .then((thumbnail) => {
                        if (thumbnail) {
                            state.setLibraryAssets((prev: any[]) => prev.map((asset: any) => 
                                asset.id === newAsset.id ? { ...asset, thumbnail } : asset
                            ));
                        }
                    })
                    .catch(() => {
                        // thumbnail generation failed, skip it
                    });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const loadLibraryItem = useCallback((id: string) => {
        const item = state.libraryAssets.find((a: any) => a.id === id);
        if (!item) return;

        setMediaPath(item.path);
        setMediaType(item.type);
        setMediaName(item.name);
        setMediaLoaded(false);
        setIsPlaying(false);
        setDisplayTime(0);
        setSegments([]);
        setHistory([]);
        setHistoryIndex(-1);
        setTextOverlays([]);
        setAnnotationOverlays([]);
        setAnnotationCanvasSize(null);
        applyMediaContextState(item.type === 'video' ? item.cursorData : []);
    }, [applyMediaContextState, state.libraryAssets, setDisplayTime, setIsPlaying, setMediaPath, setMediaType, setMediaName, setMediaLoaded, setSegments, setHistory, setHistoryIndex, setTextOverlays, setAnnotationOverlays, setAnnotationCanvasSize]);

    const deleteLibraryItem = useCallback(async (id: string) => {
        const item = state.libraryAssets.find((a: any) => a.id === id);
        if (!item) return;

        if (item.path.includes('snipfocus-rec-') || item.id.startsWith('recording-')) {
            try {
                const api = (window as any).videoEditorAPI;
                await api.invoke('delete-temp-video', item.path);
            } catch (err: any) {
                console.warn('[VideoEditor] Failed to delete file from disk:', err);
            }
        }

        state.setLibraryAssets((prev: any) => prev.filter((a: any) => a.id !== id));

        if (item.path === mediaPath) {
            setMediaPath(null);
            setMediaType(null);
            setSegments([]);
            setMediaLoaded(false);
            setIsPlaying(false);
            setDisplayTime(0);
            setHistory([]);
            setHistoryIndex(-1);
            setTextOverlays([]);
            setAnnotationOverlays([]);
            setAnnotationCanvasSize(null);
            applyMediaContextState([]);
        }
    }, [applyMediaContextState, state, mediaPath, setMediaPath, setMediaType, setSegments, setMediaLoaded, setIsPlaying, setDisplayTime, setHistory, setHistoryIndex, setTextOverlays, setAnnotationOverlays, setAnnotationCanvasSize]);

    const clearLibrary = useCallback(async () => {
        const recordings = state.libraryAssets.filter((a: any) => a.id.startsWith('recording-') || a.path.includes('snipfocus-rec-'));
        const api = (window as any).videoEditorAPI;

        for (const item of recordings) {
            try { await api.invoke('delete-temp-video', item.path); } catch { }
        }

        state.setLibraryAssets([]);
        setMediaPath(null);
        setMediaType(null);
        setSegments([]);
        setMediaLoaded(false);
        setIsPlaying(false);
        setDisplayTime(0);
        setHistory([]);
        setHistoryIndex(-1);
        setTextOverlays([]);
        setAnnotationOverlays([]);
        setAnnotationCanvasSize(null);
        applyMediaContextState([]);
        showNotification('success', 'Media Hub', 'Library cleared');
    }, [applyMediaContextState, state, setMediaPath, setMediaType, setSegments, setMediaLoaded, setIsPlaying, setDisplayTime, setHistory, setHistoryIndex, setTextOverlays, setAnnotationOverlays, setAnnotationCanvasSize, showNotification]);

    return { handleImportMedia, loadLibraryItem, deleteLibraryItem, clearLibrary };
}
