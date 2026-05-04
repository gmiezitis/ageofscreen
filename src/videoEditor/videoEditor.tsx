import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Monitor, RectangleHorizontal, Smartphone } from 'lucide-react';
import { Header } from '../components/videoEditor/Header';
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog';
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
import { normalizeCursorHighlightSettings, PlatformPreset, SmartEffect } from './types';
import { normalizeAppliedCrop } from './useCrop';
import './videoEditor.css';

const PLATFORM_PRESETS: PlatformPreset[] = [
    { id: 'original', name: 'Original', icon: Monitor, ratio: null, dimensions: 'Keep source' },
    { id: 'landscape', name: 'Landscape', icon: RectangleHorizontal, ratio: 16 / 9, dimensions: '1920x1080' },
    { id: 'square', name: 'Square', icon: Monitor, ratio: 1, dimensions: '1080x1080' },
    { id: 'vertical', name: 'Vertical', icon: Smartphone, ratio: 9 / 16, dimensions: '1080x1920' },
];

const buildProjectSnapshot = (state: any) => ({
    projectName: state.mediaName || 'ageofscreen project',
    media: {
        mediaType: state.mediaType,
        mediaPath: state.mediaPath,
        mediaName: state.mediaName,
        selectedPlatform: state.selectedPlatform,
        exportQuality: state.exportQuality,
    },
    timeline: {
        segments: state.segments,
        audioSegments: state.audioSegments,
        smartEffects: state.smartEffects,
        overlayImages: state.overlayImages,
        imageClips: state.imageClips,
        textOverlays: state.textOverlays,
        annotationOverlays: state.annotationOverlays,
        annotationCanvasSize: state.annotationCanvasSize,
        transitionType: state.transitionType,
        clipTransitions: state.clipTransitions,
        appliedCrop: state.crop?.appliedCrop ?? null,
    },
    styling: {
        backgroundColor: state.backgroundColor,
        videoPadding: state.videoPadding,
        colorGrade: state.colorGrade,
        cursorHighlight: state.cursorHighlight,
        premiumVoice: state.premiumVoice,
        playbackSpeed: state.playbackSpeed,
        autoPolishTrackingProfile: state.autoPolishTrackingProfile,
    },
    recording: {
        recordedCursorData: state.recordedCursorData,
    },
});

const hasProjectContent = (state: any) => Boolean(
    state.mediaPath
    || state.segments.length
    || state.audioSegments.length
    || state.smartEffects.length
    || state.overlayImages.length
    || state.imageClips.length
    || state.textOverlays.length
    || state.annotationOverlays.length
);

const VideoEditorApp: React.FC = () => {
    const state = useVideoEditorState();
    const handlers = useVideoEditorHandlers(state);
    const isFromMenu = window.location.search.includes('mode=library');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(!isFromMenu);
    const [annotationToolsVisible, setAnnotationToolsVisible] = useState(false);
    const [showClosePrompt, setShowClosePrompt] = useState(false);
    const [isSavingProject, setIsSavingProject] = useState(false);
    const acknowledgedMediaPathRef = React.useRef<string | null>(null);
    const historySessionRef = React.useRef<Record<string, boolean>>({});
    const historyTimerRef = React.useRef<Record<string, number | null>>({});
    const allowWindowCloseRef = React.useRef(false);
    const hasUnsavedChangesRef = React.useRef(false);
    const lastSavedProjectSignatureRef = React.useRef(JSON.stringify(buildProjectSnapshot(state)));

    useEditorIPC(state, handlers.showNotification, handlers.saveHistory, () => setIsSidebarCollapsed(true));
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
        Object.keys(historyTimerRef.current).forEach((key) => {
            const timerId = historyTimerRef.current[key];
            if (typeof timerId === 'number') {
                window.clearTimeout(timerId);
            }
            historyTimerRef.current[key] = null;
            historySessionRef.current[key] = false;
        });
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
        const handleEnded = () => {
            handlers.clearPendingPlaybackTarget();
            state.setDisplayTime(handlers.getTimelineDuration());
            state.setIsPlaying(false);
        };
        video.addEventListener('ended', handleEnded);
        return () => {
            video.removeEventListener('ended', handleEnded);
        };
    }, [
        handlers.clearPendingPlaybackTarget,
        handlers.getTimelineDuration,
        state.mediaPath,
        state.mediaType,
        state.setDisplayTime,
        state.setIsPlaying,
        state.videoRef,
    ]);

    useEffect(() => {
        if (annotationToolsVisible && state.selectedTextOverlayId) {
            setAnnotationToolsVisible(false);
        }
    }, [annotationToolsVisible, state.selectedTextOverlayId]);

    useEffect(() => () => {
        Object.values(historyTimerRef.current).forEach((timerId) => {
            if (typeof timerId === 'number') {
                window.clearTimeout(timerId);
            }
        });
    }, []);

    useEffect(() => {
        const api = (window as any).videoEditorAPI;
        if (!api?.on) return;

        return api.on('export-progress', (payload?: { percent?: number }) => {
            if (typeof payload?.percent === 'number') {
                state.setExportProgress(Math.max(0, Math.min(100, Math.round(payload.percent))));
            }
        });
    }, [state.setExportProgress]);

    const beginHistorySession = React.useCallback((key: string) => {
        if (!historySessionRef.current[key]) {
            handlers.saveHistory();
            historySessionRef.current[key] = true;
        }
        const timerId = historyTimerRef.current[key];
        if (typeof timerId === 'number') {
            window.clearTimeout(timerId);
            historyTimerRef.current[key] = null;
        }
    }, [handlers]);

    const queueHistoryCommit = React.useCallback((key: string, snapshot: any, delayMs = 220) => {
        const existingTimer = historyTimerRef.current[key];
        if (typeof existingTimer === 'number') {
            window.clearTimeout(existingTimer);
        }
        historyTimerRef.current[key] = window.setTimeout(() => {
            handlers.saveHistory(snapshot);
            historySessionRef.current[key] = false;
            historyTimerRef.current[key] = null;
        }, delayMs);
    }, [handlers]);

    const selectedPlatformPreset = useMemo(
        () => PLATFORM_PRESETS.find((preset) => preset.id === state.selectedPlatform) ?? PLATFORM_PRESETS[0],
        [state.selectedPlatform]
    );
    const currentProjectSignature = useMemo(() => JSON.stringify(buildProjectSnapshot(state)), [
        state.mediaType,
        state.mediaPath,
        state.mediaName,
        state.selectedPlatform,
        state.exportQuality,
        state.transitionType,
        state.clipTransitions,
        state.segments,
        state.audioSegments,
        state.smartEffects,
        state.overlayImages,
        state.imageClips,
        state.textOverlays,
        state.annotationOverlays,
        state.annotationCanvasSize,
        state.crop.appliedCrop,
        state.backgroundColor,
        state.videoPadding,
        state.colorGrade,
        state.cursorHighlight,
        state.premiumVoice,
        state.playbackSpeed,
        state.autoPolishTrackingProfile,
        state.recordedCursorData,
    ]);
    const currentHasProjectContent = useMemo(() => hasProjectContent(state), [
        state.mediaPath,
        state.segments,
        state.audioSegments,
        state.smartEffects,
        state.overlayImages,
        state.imageClips,
        state.textOverlays,
        state.annotationOverlays,
    ]);
    const hasUnsavedChanges = currentHasProjectContent && currentProjectSignature !== lastSavedProjectSignatureRef.current;
    const hasRecordingMetadata = state.mediaType === 'video' && state.recordedCursorData.length > 0;
    const canRenderCursorHighlight = hasRecordingMetadata;

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

    useEffect(() => {
        hasUnsavedChangesRef.current = hasUnsavedChanges;
    }, [hasUnsavedChanges]);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (allowWindowCloseRef.current || isSavingProject || !hasUnsavedChangesRef.current) {
                return;
            }
            event.preventDefault();
            event.returnValue = false;
            setShowClosePrompt(true);
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isSavingProject]);

    const performWindowClose = React.useCallback(() => {
        allowWindowCloseRef.current = true;
        (window as any).videoEditorAPI?.send?.('video-editor-close');
        window.setTimeout(() => {
            allowWindowCloseRef.current = false;
        }, 1500);
    }, []);

    const requestClose = React.useCallback(() => {
        if (hasUnsavedChangesRef.current) {
            setShowClosePrompt(true);
            return;
        }
        performWindowClose();
    }, [performWindowClose]);

    const handleDiscardAndClose = React.useCallback(() => {
        setShowClosePrompt(false);
        performWindowClose();
    }, [performWindowClose]);

    const handleSaveProjectAndClose = React.useCallback(async () => {
        const api = (window as any).videoEditorAPI;
        setIsSavingProject(true);
        try {
            const result = await api?.invoke?.('save-video-project', buildProjectSnapshot(state));
            if (result?.success) {
                lastSavedProjectSignatureRef.current = currentProjectSignature;
                setShowClosePrompt(false);
                performWindowClose();
                return;
            }
            if (!result?.canceled) {
                handlers.showNotification('error', 'Save Project Failed', result?.error || 'Could not save this project.');
            }
        } catch (error) {
            handlers.showNotification('error', 'Save Project Failed', (error as Error).message);
        } finally {
            setIsSavingProject(false);
        }
    }, [currentProjectSignature, handlers, performWindowClose, state]);

    const updateEffect = (id: string, updates: Partial<SmartEffect>) => {
        beginHistorySession('smartEffects');
        state.setSmartEffects((prev: SmartEffect[]) => {
            const nextEffects = prev.map((effect) => effect.id === id ? { ...effect, ...updates } : effect);
            queueHistoryCommit('smartEffects', { smartEffects: nextEffects });
            return nextEffects;
        });
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
        beginHistorySession('overlayImages');
        state.setOverlayImages((prev: any[]) => {
            const nextOverlayImages = prev.map((item) => item.id === id ? { ...item, ...updates } : item);
            queueHistoryCommit('overlayImages', { overlayImages: nextOverlayImages });
            return nextOverlayImages;
        });
    };

    const editTextOverlay = (id: string, updates: any) => {
        beginHistorySession('textOverlays');
        state.setTextOverlays((prev: any[]) => {
            const nextTextOverlays = prev.map((item) => item.id === id ? { ...item, ...updates } : item);
            queueHistoryCommit('textOverlays', { textOverlays: nextTextOverlays }, 260);
            return nextTextOverlays;
        });
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

    const handleApplyCrop = React.useCallback(() => {
        const nextCrop = normalizeAppliedCrop(state.crop.cropRect);
        handlers.saveHistory();
        state.crop.replaceAppliedCrop(nextCrop);
        handlers.saveHistory({ appliedCrop: nextCrop });
    }, [handlers, state.crop]);

    const setBackgroundColorWithHistory = React.useCallback((color: string) => {
        beginHistorySession('projectStyle');
        state.setBackgroundColor(color);
        queueHistoryCommit('projectStyle', {
            backgroundColor: color,
            videoPadding: state.videoPadding,
            colorGrade: state.colorGrade,
            premiumVoice: state.premiumVoice,
        }, 260);
    }, [beginHistorySession, queueHistoryCommit, state]);

    const setVideoPaddingWithHistory = React.useCallback((padding: number) => {
        beginHistorySession('projectStyle');
        state.setVideoPadding(padding);
        queueHistoryCommit('projectStyle', {
            backgroundColor: state.backgroundColor,
            videoPadding: padding,
            colorGrade: state.colorGrade,
            premiumVoice: state.premiumVoice,
        }, 260);
    }, [beginHistorySession, queueHistoryCommit, state]);

    const setColorGradeWithHistory = React.useCallback((grade: typeof state.colorGrade) => {
        beginHistorySession('projectStyle');
        state.setColorGrade(grade);
        queueHistoryCommit('projectStyle', {
            backgroundColor: state.backgroundColor,
            videoPadding: state.videoPadding,
            colorGrade: grade,
            premiumVoice: state.premiumVoice,
        });
    }, [beginHistorySession, queueHistoryCommit, state]);

    const setPremiumVoiceWithHistory = React.useCallback((active: boolean) => {
        beginHistorySession('projectStyle');
        state.setPremiumVoice(active);
        queueHistoryCommit('projectStyle', {
            backgroundColor: state.backgroundColor,
            videoPadding: state.videoPadding,
            colorGrade: state.colorGrade,
            premiumVoice: active,
        });
    }, [beginHistorySession, queueHistoryCommit, state]);

    const setCursorHighlightWithHistory = React.useCallback((settings: typeof state.cursorHighlight) => {
        const normalizedSettings = normalizeCursorHighlightSettings(settings);
        beginHistorySession('cursorHighlight');
        state.setCursorHighlight(normalizedSettings);
        queueHistoryCommit('cursorHighlight', { cursorHighlight: normalizedSettings }, 260);
    }, [beginHistorySession, queueHistoryCommit, state]);

    const setAnnotationOverlaysWithHistory = React.useCallback((annotations: typeof state.annotationOverlays) => {
        beginHistorySession('annotationOverlays');
        state.setAnnotationOverlays(annotations);
        queueHistoryCommit('annotationOverlays', { annotationOverlays: annotations }, 80);
    }, [beginHistorySession, queueHistoryCommit, state]);

    return (
        <div className="video-editor">
            <Header
                mediaType={state.mediaType}
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
                onClose={requestClose}
                isExporting={state.isExporting}
                exportProgress={state.exportProgress}
                isAutoPolishing={state.isAutoPolishing}
                isCropping={state.crop.isActive}
                onStartCropping={state.crop.startCropping}
                onApplyCrop={handleApplyCrop}
                onCancelCrop={state.crop.cancelCrop}
                backgroundColor={state.backgroundColor}
                setBackgroundColor={setBackgroundColorWithHistory}
                videoPadding={state.videoPadding}
                setVideoPadding={setVideoPaddingWithHistory}
                cursorHighlight={state.cursorHighlight}
                setCursorHighlight={setCursorHighlightWithHistory}
                hasRecordingMetadata={hasRecordingMetadata}
                canRenderCursorHighlight={canRenderCursorHighlight}
                onUndo={handlers.undo}
                onRedo={handlers.redo}
                canUndo={handlers.canUndo}
                canRedo={handlers.canRedo}
                exportQuality={state.exportQuality}
                setExportQuality={state.setExportQuality}
                colorGrade={state.colorGrade}
                setColorGrade={setColorGradeWithHistory}
                premiumVoice={state.premiumVoice}
                setPremiumVoice={setPremiumVoiceWithHistory}
                playbackSpeed={state.playbackSpeed}
                setPlaybackSpeed={state.setPlaybackSpeed}
                autoPolishTrackingProfile={state.autoPolishTrackingProfile}
                setAutoPolishTrackingProfile={state.setAutoPolishTrackingProfile}
            />

            {state.isExporting && (
                <div
                    style={{
                        position: 'fixed',
                        top: 72,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 10950,
                        width: 'min(420px, calc(100vw - 40px))',
                        padding: '14px 16px',
                        borderRadius: 18,
                        background: 'rgba(15, 23, 42, 0.94)',
                        border: '1px solid rgba(96, 165, 250, 0.24)',
                        boxShadow: '0 22px 60px rgba(2, 6, 23, 0.42)',
                        backdropFilter: 'blur(18px)',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                        <div>
                            <div style={{ color: '#f8fafc', fontSize: 13, fontWeight: 700, letterSpacing: '0.01em' }}>
                                Exporting {state.mediaType === 'video' ? 'video' : 'media'}
                            </div>
                            <div style={{ color: '#cbd5e1', fontSize: 11.5, marginTop: 2 }}>
                                Rendering and packaging your file.
                            </div>
                        </div>
                        <div style={{ color: '#93c5fd', fontSize: 18, fontWeight: 800 }}>
                            {Math.max(0, Math.min(100, Math.round(state.exportProgress)))}%
                        </div>
                    </div>
                    <div style={{ height: 10, borderRadius: 999, background: 'rgba(30, 41, 59, 0.9)', overflow: 'hidden' }}>
                        <div
                            style={{
                                width: `${Math.max(6, Math.min(100, state.exportProgress || 0))}%`,
                                height: '100%',
                                borderRadius: 999,
                                background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 55%, #93c5fd 100%)',
                                transition: 'width 0.18s ease',
                                boxShadow: '0 0 20px rgba(96, 165, 250, 0.4)',
                            }}
                        />
                    </div>
                </div>
            )}

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
                        onUpdateZoomArea={selectedZoomEffect ? (area) => updateEffect(selectedZoomEffect.id, { zoomArea: area, followCursor: false }) : undefined}
                        onUpdateBlurArea={selectedBlurEffect ? (area) => updateEffect(selectedBlurEffect.id, { zoomArea: area }) : undefined}
                        recordedCursorData={state.recordedCursorData}
                        isEditingText={state.isEditingText}
                        setIsEditingText={state.setIsEditingText}
                        annotationToolsVisible={annotationToolsVisible}
                        annotationOverlays={state.annotationOverlays}
                        onAnnotationOverlaysChange={setAnnotationOverlaysWithHistory}
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
                        hasCursorData={hasRecordingMetadata}
                    />
                </div>
            </div>

            <Toast notification={state.notification} onClose={() => state.setNotification(null)} />
            <UnsavedChangesDialog
                open={showClosePrompt}
                title="Save your project before closing?"
                message="Your current timeline changes have not been saved as a project yet. Save the project first, or leave without saving."
                saveLabel="Save Project"
                onSave={() => { void handleSaveProjectAndClose(); }}
                onDiscard={handleDiscardAndClose}
                onCancel={() => setShowClosePrompt(false)}
                isSaving={isSavingProject}
            />
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
