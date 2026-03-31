import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Monitor, RectangleHorizontal, Smartphone } from 'lucide-react';
import { Header } from '../components/videoEditor/Header';
import { PreviewStage } from '../components/videoEditor/PreviewStage';
import { Sidebar } from '../components/videoEditor/Sidebar';
import { Timeline } from '../components/videoEditor/Timeline';
import { Toast } from '../components/videoEditor/Toast';
import { useAudioSync } from './useAudioSync';
import { useDragResize } from './useDragResize';
import { useEditorIPC } from './useEditorIPC';
import { useEditorKeyboard } from './useEditorKeyboard';
import { usePlaybackLoop } from './usePlaybackLoop';
import { useVideoEditorHandlers } from './useVideoEditorHandlers';
import { useVideoEditorState } from './useVideoEditorState';
import { DEFAULT_ZOOM_INTENSITY, getDefaultEffectIntensity } from './effectIntensity';
import { PlatformPreset, SmartEffect } from './types';
import './videoEditor.css';

const PLATFORM_PRESETS: PlatformPreset[] = [
    { id: 'original', name: 'Original', icon: Monitor, ratio: null, dimensions: 'Keep source' },
    { id: 'landscape', name: 'Landscape', icon: RectangleHorizontal, ratio: 16 / 9, dimensions: '1920x1080' },
    { id: 'square', name: 'Square', icon: Monitor, ratio: 1, dimensions: '1080x1080' },
    { id: 'vertical', name: 'Vertical', icon: Smartphone, ratio: 9 / 16, dimensions: '1080x1920' },
];

const VideoEditorApp: React.FC = () => {
    const state = useVideoEditorState();
    const handlers = useVideoEditorHandlers(state);
    const isFromMenu = window.location.search.includes('mode=library');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(!isFromMenu);
    const [annotationToolsVisible, setAnnotationToolsVisible] = useState(false);
    const acknowledgedMediaPathRef = React.useRef<string | null>(null);

    useEditorIPC(state, handlers.showNotification, () => setIsSidebarCollapsed(true));
    usePlaybackLoop(state, handlers);
    useEditorKeyboard(state, handlers);
    useDragResize(state, handlers);
    useAudioSync(state.isPlaying, state.displayTime, state.audioSegments, state.playbackSpeed);

    useEffect(() => {
        const video = state.videoRef.current;
        if (video) {
            video.playbackRate = state.playbackSpeed;
        }
    }, [state.playbackSpeed, state.mediaPath, state.videoRef]);

    useEffect(() => {
        acknowledgedMediaPathRef.current = null;
    }, [state.mediaPath]);

    useEffect(() => {
        if (!state.mediaLoaded || !state.mediaPath) return;
        if (acknowledgedMediaPathRef.current === state.mediaPath) return;

        acknowledgedMediaPathRef.current = state.mediaPath;
        (window as any).videoEditorAPI?.send?.('video-editor-media-consumed', state.mediaPath);
    }, [state.mediaLoaded, state.mediaPath]);

    useEffect(() => {
        const video = state.videoRef.current;
        if (!video || !state.mediaPath || state.mediaType !== 'video') return;

        // Only listen for 'ended' — the playback loop and togglePlay
        // already handle pause transitions. A raw 'pause' listener here
        // fires during seeks and segment hops, causing position jumps.
        const handleEnded = () => state.setIsPlaying(false);
        video.addEventListener('ended', handleEnded);
        return () => {
            video.removeEventListener('ended', handleEnded);
        };
    }, [state.mediaPath, state.mediaType, state.videoRef, state.setIsPlaying]);

    useEffect(() => {
        if (annotationToolsVisible && state.selectedTextOverlayId) {
            setAnnotationToolsVisible(false);
        }
    }, [annotationToolsVisible, state.selectedTextOverlayId]);

    const selectedPlatformPreset = useMemo(
        () => PLATFORM_PRESETS.find((preset) => preset.id === state.selectedPlatform) ?? PLATFORM_PRESETS[0],
        [state.selectedPlatform]
    );

    const totalKeptDuration = handlers.getTimelineDuration();
    const activeEffects = useMemo(
        () => state.smartEffects.filter((effect: SmartEffect) => state.displayTime >= effect.startTime && state.displayTime < effect.startTime + effect.duration),
        [state.smartEffects, state.displayTime]
    );
    const selectedEffect = useMemo(
        () => state.smartEffects.find((effect: SmartEffect) => effect.id === state.selectedEffectId) ?? null,
        [state.smartEffects, state.selectedEffectId]
    );
    const selectedZoomEffect = selectedEffect?.type === 'zoom' ? selectedEffect : null;
    const selectedBlurEffect = selectedEffect?.type === 'blur_area' ? selectedEffect : null;

    const updateEffect = (id: string, updates: Partial<SmartEffect>) => {
        state.setSmartEffects((prev: SmartEffect[]) => prev.map((effect) => effect.id === id ? { ...effect, ...updates } : effect));
    };

    const addEffect = (type: SmartEffect['type']) => {
        if (!state.mediaLoaded) return;
        const timelineDuration = Math.max(handlers.getTimelineDuration(), state.duration || 0);
        const defaultDuration = type === 'slow_zoom' ? 4 : type === 'breathing' ? 3.5 : 2.6;
        const startTime = Math.max(0, Math.min(state.displayTime, Math.max(0, timelineDuration - defaultDuration)));
        const baseEffect: SmartEffect = {
            id: `effect-${Date.now()}`,
            type,
            startTime,
            duration: defaultDuration,
            label: type,
            intensity: getDefaultEffectIntensity(type),
        };

        if (type === 'zoom' || type === 'blur_area') {
            baseEffect.zoomArea = { x: 25, y: 25, width: 50, height: 50 };
            if (type === 'zoom') {
                baseEffect.followCursor = false;
                baseEffect.followCursorIntensity = DEFAULT_ZOOM_INTENSITY;
                baseEffect.cursorStyle = 'none';
                baseEffect.tilt = 0;
            }
        }

        const nextEffects = [...state.smartEffects, baseEffect];
        state.setSmartEffects(nextEffects);
        handlers.saveHistory({ smartEffects: nextEffects });
        state.setSelectedEffectId(baseEffect.id);
        state.setSelectedSegmentId(null);
        state.setSelectedAudioId(null);
        state.setSelectedOverlayId(null);
        state.setSelectedImageClipId(null);
        state.setSelectedTextOverlayId(null);
    };

    const deleteEffect = (id: string) => {
        const nextEffects = state.smartEffects.filter((effect) => effect.id !== id);
        state.setSmartEffects(nextEffects);
        handlers.saveHistory({ smartEffects: nextEffects });
    };

    const editOverlayImage = (id: string, updates: any) => {
        state.setOverlayImages((prev: any[]) => prev.map((item) => item.id === id ? { ...item, ...updates } : item));
    };

    const editTextOverlay = (id: string, updates: any) => {
        state.setTextOverlays((prev: any[]) => prev.map((item) => item.id === id ? { ...item, ...updates } : item));
    };

    const deleteTextOverlay = (id: string) => {
        const nextTextOverlays = state.textOverlays.filter((item) => item.id !== id);
        state.setTextOverlays(nextTextOverlays);
        handlers.saveHistory({ textOverlays: nextTextOverlays });
    };

    const seekToStart = () => {
        handlers.seekToDisplayTime(0, { resume: state.isPlaying });
    };

    const seekToEnd = () => {
        const total = handlers.getTimelineDuration();
        handlers.seekToDisplayTime(total, { resume: state.isPlaying });
    };

    return (
        <div className="video-editor">
            <Header
                mediaName={state.mediaName}
                isSidebarCollapsed={isSidebarCollapsed}
                setIsSidebarCollapsed={setIsSidebarCollapsed}
                selectedPlatform={state.selectedPlatform}
                setSelectedPlatform={state.setSelectedPlatform}
                platformPresets={PLATFORM_PRESETS}
                isMaximized={state.isMaximized}
                onMaximize={handlers.handleMaximize}
                onMinimize={handlers.handleMinimize}
                onExport={handlers.handleExport}
                onAutoPolish={handlers.handleAutoPolish}
                onClose={handlers.handleClose}
                isExporting={state.isExporting}
                isAutoPolishing={state.isAutoPolishing}
                isCropping={state.crop.isActive}
                onStartCropping={state.crop.startCropping}
                onApplyCrop={state.crop.applyCrop}
                onCancelCrop={state.crop.cancelCrop}
                backgroundColor={state.backgroundColor}
                setBackgroundColor={state.setBackgroundColor}
                videoPadding={state.videoPadding}
                setVideoPadding={state.setVideoPadding}
                onUndo={handlers.undo}
                onRedo={handlers.redo}
                canUndo={handlers.canUndo}
                canRedo={handlers.canRedo}
                exportQuality={state.exportQuality}
                setExportQuality={state.setExportQuality}
                colorGrade={state.colorGrade}
                setColorGrade={state.setColorGrade}
                premiumVoice={state.premiumVoice}
                setPremiumVoice={state.setPremiumVoice}
                playbackSpeed={state.playbackSpeed}
                setPlaybackSpeed={state.setPlaybackSpeed}
                autoPolishTrackingProfile={state.autoPolishTrackingProfile}
                setAutoPolishTrackingProfile={state.setAutoPolishTrackingProfile}
            />

            <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
                <Sidebar
                    isCollapsed={isSidebarCollapsed}
                    mediaLibrary={state.libraryAssets}
                    onImport={handlers.handleImportMedia}
                    onDeleteLibraryItem={handlers.deleteLibraryItem}
                    onDragStart={handlers.handleDragStart}
                    onItemClick={handlers.loadLibraryItem}
                    onClearLibrary={handlers.clearLibrary}
                />

                <div className="editor-main">
                    <PreviewStage
                        mediaType={state.mediaType}
                        mediaPath={state.mediaPath}
                        getMediaSrc={handlers.getMediaSrc}
                        videoRef={state.videoRef}
                        audioRef={state.audioRef}
                        threeContainerRef={state.threeContainerRef}
                        crop={state.crop}
                        isPlaying={state.isPlaying}
                        togglePlay={handlers.togglePlay}
                        mediaLoaded={state.mediaLoaded}
                        displayTime={state.displayTime}
                        activeEffects={activeEffects}
                        selectedZoomEffect={selectedZoomEffect}
                        selectedBlurEffect={selectedBlurEffect}
                        segments={state.segments}
                        imageClips={state.imageClips}
                        selectedImageClipId={state.selectedImageClipId}
                        setSelectedImageClipId={state.setSelectedImageClipId}
                        overlayImages={state.overlayImages}
                        selectedOverlayId={state.selectedOverlayId}
                        setSelectedOverlayId={state.setSelectedOverlayId}
                        onEditOverlayImage={editOverlayImage}
                        textOverlays={state.textOverlays}
                        selectedTextOverlayId={state.selectedTextOverlayId}
                        setSelectedTextOverlayId={state.setSelectedTextOverlayId}
                        onEditTextOverlay={editTextOverlay}
                        handleCropDragStart={() => {}}
                        effectStyleSet={{ windowStyle: {}, contentStyle: {}, filter: '', boxShadow: '' }}
                        selectedPlatform={state.selectedPlatform}
                        selectedPlatformRatio={selectedPlatformPreset.ratio}
                        onLoadedMetadata={handlers.handleVideoLoad}
                        videoMuted={state.videoMuted}
                        backgroundColor={state.backgroundColor}
                        videoPadding={state.videoPadding}
                        mediaName={state.mediaName}
                        colorGrade={state.colorGrade}
                        onUpdateZoomArea={selectedZoomEffect ? (area) => updateEffect(selectedZoomEffect.id, { zoomArea: area }) : undefined}
                        onUpdateBlurArea={selectedBlurEffect ? (area) => updateEffect(selectedBlurEffect.id, { zoomArea: area }) : undefined}
                        recordedCursorData={state.recordedCursorData}
                        isEditingText={state.isEditingText}
                        setIsEditingText={state.setIsEditingText}
                        annotationToolsVisible={annotationToolsVisible}
                        annotationOverlays={state.annotationOverlays}
                        onAnnotationOverlaysChange={state.setAnnotationOverlays}
                        onAnnotationCanvasSizeChange={state.setAnnotationCanvasSize}
                        onCloseAnnotationTools={() => setAnnotationToolsVisible(false)}
                    />

                    <Timeline
                        totalKeptDuration={totalKeptDuration}
                        displayTime={state.displayTime}
                        zoom={state.zoom}
                        setZoom={state.setZoom}
                        isPlaying={state.isPlaying}
                        togglePlay={handlers.togglePlay}
                        seekToStart={seekToStart}
                        seekToEnd={seekToEnd}
                        segments={state.segments}
                        selectedSegmentId={state.selectedSegmentId}
                        setSelectedSegmentId={state.setSelectedSegmentId}
                        imageClips={state.imageClips}
                        selectedImageClipId={state.selectedImageClipId}
                        setSelectedImageClipId={state.setSelectedImageClipId}
                        audioSegments={state.audioSegments}
                        selectedAudioId={state.selectedAudioId}
                        setSelectedAudioId={state.setSelectedAudioId}
                        smartEffects={state.smartEffects}
                        selectedEffectId={state.selectedEffectId}
                        setSelectedEffectId={state.setSelectedEffectId}
                        overlayImages={state.overlayImages}
                        selectedOverlayId={state.selectedOverlayId}
                        setSelectedOverlayId={state.setSelectedOverlayId}
                        textOverlays={state.textOverlays}
                        selectedTextOverlayId={state.selectedTextOverlayId}
                        setSelectedTextOverlayId={state.setSelectedTextOverlayId}
                        videoMuted={state.videoMuted}
                        setVideoMuted={state.setVideoMuted}
                        onSplit={handlers.splitAtPlayhead}
                        onAddImageClip={handlers.importImageClipAtPlayhead}
                        onDelete={handlers.deleteSelectedSegment}
                        onMoveSelectedMainTrackLeft={() => handlers.moveSelectedMainTrackItem(-1)}
                        onMoveSelectedMainTrackRight={() => handlers.moveSelectedMainTrackItem(1)}
                        onDeleteOverlayImage={handlers.deleteOverlayById}
                        onToggleOverlayRenderMode={handlers.toggleOverlayRenderMode}
                        onCloseGaps={handlers.closeAllGaps}
                        onAddTextOverlay={() => {
                            setAnnotationToolsVisible(false);
                            handlers.addTextOverlay();
                        }}
                        onAddEffect={addEffect}
                        annotationToolsVisible={annotationToolsVisible}
                        onToggleAnnotationTools={() => setAnnotationToolsVisible((visible) => !visible)}
                        seekTimelineToClientX={handlers.seekTimelineToClientX}
                        handlePlayheadDragStart={handlers.handlePlayheadDragStart}
                        handleDragStart={handlers.handleDragStart}
                        handleDragOver={handlers.handleDragOver}
                        handleDrop={handlers.handleDrop}
                        handleDragEnd={handlers.handleDragEnd}
                        handleResizeStart={handlers.handleResizeStart}
                        handleEffectDragStart={handlers.handleEffectDragStart}
                        handleAudioDragStart={handlers.handleAudioDragStart}
                        handleOverlayDragStart={handlers.handleOverlayDragStart}
                        handleTextOverlayDragStart={handlers.handleTextOverlayDragStart}
                        onDeleteEffect={deleteEffect}
                        onDeleteTextOverlay={deleteTextOverlay}
                        onUpdateEffect={updateEffect}
                        isDraggingPlayhead={state.isDraggingPlayhead}
                        draggedSegmentId={state.draggedSegmentId}
                        dragOverIndex={state.dragOverIndex}
                        draggedAudioId={state.draggedAudioId}
                        draggedOverlayId={state.draggedOverlayId}
                        mediaLoaded={state.mediaLoaded}
                        handleImportMedia={handlers.handleImportMedia}
                        mediaPath={state.mediaPath}
                        mediaLibrary={state.libraryAssets}
                        draggingEffectId={state.draggingEffectId}
                        timelineRef={state.timelineRef}
                        hasCursorData={state.recordedCursorData.length > 0}
                    />
                </div>
            </div>

            <Toast notification={state.notification} onClose={() => state.setNotification(null)} />
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    createRoot(rootElement).render(
        <React.StrictMode>
            <VideoEditorApp />
        </React.StrictMode>
    );
}
