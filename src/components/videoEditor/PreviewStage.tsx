import React, { useMemo, useRef, useState } from 'react';
import { Play, Music } from 'lucide-react';
import { SmartEffect, OverlayImage, TextOverlay, ZoomArea, ColorGradePreset, ImageClip, Segment } from '../../videoEditor/types';
import type { AnnotationObject } from '../../types';
import { computeEffectFadeRatio, effectEnvelope, resolveBackgroundCSS } from '../../videoEditor/effectMath';
import { getEffectIntensity } from '../../videoEditor/effectIntensity';
import CropOverlay from '../../videoEditor/CropOverlay';
import { TextOverlayDraggable, AreaOverlay, TextOverlayEditor, EffectBadges } from './overlays';
import { VideoAnnotationLayer } from './VideoAnnotationLayer';
import { EffectStyleSet, getEffectStyle, getFollowCursorPoint, getPreviewCursorPoint } from '../../videoEditor/utils';
import { buildVisualTimelineSceneItems, getActivePreviewTransition } from '../../videoEditor/timelineScene';
import { toMediaFileUrl } from '../../shared/mediaPaths';
import { getPreviewCropForDisplay, isNoOpCrop } from '../../videoEditor/useCrop';

const NO_EFFECT_STYLE_SET: EffectStyleSet = {
    windowStyle: {
        transform: 'none',
        willChange: 'auto',
    },
    contentStyle: {
        transform: 'none',
        transformOrigin: 'center center',
        willChange: 'auto',
    },
    filter: '',
    boxShadow: '',
};

/* ─── Props ─── */
const VIDEO_CLIP_EXTENSION_RE = /\.(mp4|webm|mov|m4v|avi|mkv)$/i;

const isVideoTimelineClip = (clip: ImageClip) => (
    clip.mediaType === 'video' || VIDEO_CLIP_EXTENSION_RE.test(clip.file)
);

const TimelineMediaClipLayer: React.FC<{
    clip: ImageClip;
    opacity: number;
    selectable: boolean;
    isSelected: boolean;
    isPlaying: boolean;
    displayTime: number;
    imageClipStageStyle: React.CSSProperties;
    onSelect: (id: string) => void;
}> = ({
    clip,
    opacity,
    selectable,
    isSelected,
    isPlaying,
    displayTime,
    imageClipStageStyle,
    onSelect,
}) => {
    const videoClipRef = useRef<HTMLVideoElement | null>(null);
    const isVideoClip = isVideoTimelineClip(clip);
    const localTime = Math.max(0, displayTime - clip.startTime);

    React.useEffect(() => {
        if (!isVideoClip) {
            return;
        }

        const video = videoClipRef.current;
        if (!video) {
            return;
        }

        const targetTime = Math.max(0, Math.min(localTime, Math.max(0, clip.duration)));
        if (Number.isFinite(targetTime) && !video.seeking && Math.abs(video.currentTime - targetTime) > 0.12) {
            try {
                video.currentTime = targetTime;
            } catch {}
        }

        if (isPlaying) {
            void video.play().catch(() => {});
        } else {
            video.pause();
        }
    }, [clip.duration, isPlaying, isVideoClip, localTime]);

    if (opacity <= 0.001) {
        return null;
    }

    return (
        <div
            onClick={selectable ? (e) => { e.stopPropagation(); onSelect(clip.id); } : undefined}
            style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...imageClipStageStyle,
                border: selectable && isSelected ? '2px solid var(--accent)' : 'none',
                zIndex: 6,
                overflow: 'hidden',
                opacity,
                willChange: 'opacity',
                pointerEvents: selectable && !isPlaying && isSelected ? 'auto' : 'none',
            }}
        >
            {isVideoClip ? (
                <video
                    ref={videoClipRef}
                    src={toMediaFileUrl(clip.file)}
                    muted
                    playsInline
                    preload="auto"
                    style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                />
            ) : (
                <img
                    src={toMediaFileUrl(clip.file)}
                    alt=""
                    draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'scale-down', pointerEvents: 'none' }}
                />
            )}
        </div>
    );
};

interface PreviewStageProps {
    mediaType: 'video' | 'image' | 'audio' | null;
    mediaPath: string | null;
    getMediaSrc: () => string;
    videoRef: React.RefObject<HTMLVideoElement>;
    audioRef: React.RefObject<HTMLAudioElement>;
    threeContainerRef: React.RefObject<HTMLDivElement>;
    crop: any;
    isPlaying: boolean;
    togglePlay: () => void;
    mediaLoaded: boolean;
    displayTime: number;
    activeEffects: SmartEffect[];
    selectedZoomEffect?: SmartEffect | null;
    selectedBlurEffect?: SmartEffect | null;
    segments: Segment[];
    imageClips: ImageClip[];
    selectedImageClipId: string | null;
    setSelectedImageClipId: (id: string | null) => void;
    overlayImages: OverlayImage[];
    selectedOverlayId: string | null;
    setSelectedOverlayId: (id: string | null) => void;
    onEditOverlayImage?: (id: string, updates: Partial<OverlayImage>) => void;
    onOverlayImageInteractionStart?: () => void;
    onOverlayImageInteractionEnd?: () => void;
    textOverlays: TextOverlay[];
    selectedTextOverlayId: string | null;
    setSelectedTextOverlayId: (id: string | null) => void;
    onEditTextOverlay?: (id: string, updates: Partial<TextOverlay>) => void;
    onTextOverlayMoveEnd?: () => void;
    handleCropDragStart: (e: React.MouseEvent) => void;
    effectStyleSet: EffectStyleSet;
    selectedPlatform: string;
    selectedPlatformRatio: number | null;
    onLoadedMetadata?: () => void;
    videoMuted?: boolean;
    backgroundColor?: string;
    videoPadding?: number;
    mediaName?: string;
    colorGrade?: ColorGradePreset;
    cursorHighlight?: unknown;
    onUpdateZoomArea?: (area: ZoomArea) => void;
    onUpdateBlurArea?: (area: ZoomArea) => void;
    recordedCursorData?: any[];
    isEditingText: boolean;
    setIsEditingText: (val: boolean) => void;
    annotationToolsVisible: boolean;
    annotationOverlays: AnnotationObject[];
    onAnnotationOverlaysChange: (annotations: AnnotationObject[]) => void;
    onAnnotationCanvasSizeChange: (size: { width: number; height: number } | null) => void;
    onCloseAnnotationTools?: () => void;
}

/* ─── Component ─── */
export const PreviewStage: React.FC<PreviewStageProps> = ({
    mediaType, mediaPath, getMediaSrc,
    videoRef, audioRef: _audioRef, threeContainerRef,
    crop, isPlaying, togglePlay, mediaLoaded, displayTime,
    activeEffects, selectedZoomEffect, selectedBlurEffect,
    segments, imageClips, selectedImageClipId, setSelectedImageClipId,
    overlayImages, selectedOverlayId, setSelectedOverlayId, onEditOverlayImage,
    onOverlayImageInteractionStart, onOverlayImageInteractionEnd,
    textOverlays, selectedTextOverlayId, setSelectedTextOverlayId, onEditTextOverlay, onTextOverlayMoveEnd,
    handleCropDragStart: _handleCropDragStart, effectStyleSet: _effectStyleSet,
    selectedPlatform: _selectedPlatform, selectedPlatformRatio,
    onLoadedMetadata, videoMuted,
    backgroundColor, videoPadding = 0, mediaName, colorGrade,
    onUpdateZoomArea, onUpdateBlurArea,
    recordedCursorData = [],
    isEditingText: _isEditingText, setIsEditingText,
    annotationToolsVisible,
    annotationOverlays,
    onAnnotationOverlaysChange,
    onAnnotationCanvasSizeChange,
    onCloseAnnotationTools,
}) => {
    const LEFT_DOCK_PANEL_WIDTH = 288;
    const LEFT_DOCK_PANEL_GAP = 18;
    const [leftDockHostElement, setLeftDockHostElement] = useState<HTMLDivElement | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const overlayLayerRef = useRef<HTMLDivElement | null>(null);
    const imageOverlayLayerRef = useRef<HTMLDivElement | null>(null);

    const contentBounds = useMemo(() => {
        const bounds = crop.videoBounds;
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
        return bounds;
    }, [crop.videoBounds]);

    const previewCropData = useMemo(
        () => getPreviewCropForDisplay(Boolean(crop?.isActive), crop?.appliedCrop ?? null),
        [crop?.appliedCrop, crop?.isActive]
    );

    const overlayBounds = useMemo(() => {
        if (!contentBounds) return null;
        const cropData = previewCropData;
        if (isNoOpCrop(cropData)) {
            return contentBounds;
        }
        const container = threeContainerRef.current;
        if (!container) return contentBounds;

        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const cropWidth = contentBounds.width * (cropData.width / 100);
        const cropHeight = contentBounds.height * (cropData.height / 100);
        if (!cw || !ch || !cropWidth || !cropHeight) return contentBounds;

        const scale = Math.min(cw / cropWidth, ch / cropHeight);
        const displayWidth = cropWidth * scale;
        const displayHeight = cropHeight * scale;

        return {
            left: (cw - displayWidth) / 2,
            top: (ch - displayHeight) / 2,
            width: displayWidth,
            height: displayHeight,
        };
    }, [contentBounds, previewCropData, threeContainerRef]);

    const smoothPreviewCursorPoint = useMemo(() => getPreviewCursorPoint(recordedCursorData, displayTime, 'smooth'), [recordedCursorData, displayTime]);
    const followPreviewCursorPoint = useMemo(() => getFollowCursorPoint(recordedCursorData, displayTime), [recordedCursorData, displayTime]);
    
    const previewEffectFrame = useMemo(() => {
        const frame = overlayBounds ?? contentBounds;
        const container = threeContainerRef.current;
        if (!frame || !container) return null;
        return {
            ...frame,
            containerWidth: container.clientWidth,
            containerHeight: container.clientHeight,
        };
    }, [contentBounds, overlayBounds, threeContainerRef]);
    const resolvedEffectStyleSet = useMemo(
        () => getEffectStyle(activeEffects, displayTime, followPreviewCursorPoint ?? smoothPreviewCursorPoint, previewEffectFrame),
        [activeEffects, displayTime, followPreviewCursorPoint, previewEffectFrame, smoothPreviewCursorPoint]
    );
    const previewEffectStyleSet = crop?.isActive ? NO_EFFECT_STYLE_SET : resolvedEffectStyleSet;

    const activeZoomEffect = useMemo(
        () => [...activeEffects].reverse().find((effect) => effect.type === 'zoom') ?? null,
        [activeEffects]
    );
    const activeImageClip = useMemo(
        () => imageClips.find((clip) => displayTime >= clip.startTime && displayTime < clip.startTime + clip.duration) ?? null,
        [displayTime, imageClips]
    );
    const mainTrackItems = useMemo(
        () => buildVisualTimelineSceneItems(segments, imageClips),
        [segments, imageClips]
    );
    const activePreviewTransition = useMemo(
        () => getActivePreviewTransition(mainTrackItems, [], 'crossfade', displayTime),
        [mainTrackItems, displayTime]
    );
    const crossfadeTransition = activePreviewTransition?.type === 'crossfade'
        ? activePreviewTransition
        : null;
    const outgoingTransitionImageClip = crossfadeTransition?.fromItem.kind === 'imageClip'
        ? crossfadeTransition.fromItem.clip
        : null;
    const incomingTransitionImageClip = crossfadeTransition?.toItem.kind === 'imageClip'
        ? crossfadeTransition.toItem.clip
        : null;
    const activeImageClipHandledByTransition = !!activeImageClip && (
        activeImageClip.id === outgoingTransitionImageClip?.id
        || activeImageClip.id === incomingTransitionImageClip?.id
    );
    const dipToBlackOpacity = activePreviewTransition?.type === 'dip_to_black'
        ? activePreviewTransition.blackOverlayOpacity
        : 0;

    const mediaContentStyle = crop.getVideoStyle();
    const bgStyle = resolveBackgroundCSS(backgroundColor);
    const hasStyledBackground = !!backgroundColor && backgroundColor !== 'transparent';
    const effectivePadding = hasStyledBackground && videoPadding > 0 ? Math.max(videoPadding, 4) : videoPadding;
    const isGradientBg = bgStyle.startsWith('linear-gradient');
    const isImageBg = bgStyle.startsWith('url(');

    let containerStyle: React.CSSProperties = {};
    if (isGradientBg || isImageBg) {
        containerStyle = { background: bgStyle, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' };
    } else {
        containerStyle = { backgroundColor: bgStyle };
    }
    const imageClipStageStyle: React.CSSProperties = isGradientBg || isImageBg
        ? { background: bgStyle, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
        : { backgroundColor: bgStyle && bgStyle !== 'transparent' ? bgStyle : '#020617' };

    const selectedTextOverlay = selectedTextOverlayId ? textOverlays.find(t => t.id === selectedTextOverlayId) : undefined;
    const showTextEditor = !!selectedTextOverlay && !annotationToolsVisible && !!onEditTextOverlay && displayTime >= selectedTextOverlay.startTime && displayTime < selectedTextOverlay.startTime + selectedTextOverlay.duration;
    const showLeftDockTools = annotationToolsVisible || showTextEditor;
    const dockedPanelStyle: React.CSSProperties | undefined = showLeftDockTools ? { top: 0, left: 0, width: '100%', maxWidth: '100%' } : undefined;

    React.useEffect(() => {
        if (!crossfadeTransition || mediaType !== 'video') {
            return;
        }

        if (crossfadeTransition.toItem.kind !== 'video') {
            return;
        }

        const video = videoRef.current;
        if (!video || !video.paused || video.seeking) {
            return;
        }

        const targetTime = crossfadeTransition.toItem.segment.startTime;
        if (Math.abs(video.currentTime - targetTime) <= 0.08) {
            return;
        }

        try {
            video.currentTime = targetTime;
        } catch {}
    }, [crossfadeTransition, mediaType, videoRef]);

    const renderImageClipLayer = (
        clip: ImageClip,
        opacity: number,
        key: string,
        selectable: boolean,
    ) => {
        return (
            <TimelineMediaClipLayer
                key={key}
                clip={clip}
                opacity={opacity}
                selectable={selectable}
                isSelected={selectedImageClipId === clip.id}
                isPlaying={isPlaying}
                displayTime={displayTime}
                imageClipStageStyle={imageClipStageStyle}
                onSelect={setSelectedImageClipId}
            />
        );
    };

    if (!mediaPath) return null;

    const startOverlayInteraction = (e: React.MouseEvent<HTMLDivElement>, img: OverlayImage, mode: 'move' | 'resize') => {
        if (!onEditOverlayImage) return;
        e.preventDefault(); e.stopPropagation();
        const container = wrapperRef.current ?? imageOverlayLayerRef.current;
        if (!container) return;
        onOverlayImageInteractionStart?.();
        const rect = container.getBoundingClientRect();
        const interaction = {
            startX: e.clientX, startY: e.clientY,
            startLeft: img.x, startTop: img.y,
            startWidth: img.width, startHeight: img.height,
            maxX: Math.max(0, rect.width - img.width), maxY: Math.max(0, rect.height - img.height),
            maxWidth: Math.max(48, rect.width - img.x), maxHeight: Math.max(48, rect.height - img.y),
        };
        const handleMove = (ev: MouseEvent) => {
            const dx = ev.clientX - interaction.startX;
            const dy = ev.clientY - interaction.startY;
            if (mode === 'resize') {
                onEditOverlayImage(img.id, {
                    width: Math.max(48, Math.min(interaction.maxWidth, interaction.startWidth + dx)),
                    height: Math.max(48, Math.min(interaction.maxHeight, interaction.startHeight + dy)),
                });
            } else {
                onEditOverlayImage(img.id, {
                    x: Math.max(0, Math.min(interaction.maxX, interaction.startLeft + dx)),
                    y: Math.max(0, Math.min(interaction.maxY, interaction.startTop + dy)),
                });
            }
        };
        const handleUp = () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            onOverlayImageInteractionEnd?.();
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    };

    const getColorGradeFilter = (grade?: ColorGradePreset) => {
        switch (grade) {
            case 'nordic_cold': return 'saturate(0.85) contrast(1.1) brightness(1.05) sepia(0.1) hue-rotate(-15deg)';
            case 'vibrant_pop': return 'saturate(1.3) contrast(1.05)';
            case 'moody_teal': return 'saturate(0.9) contrast(1.2) sepia(0.3) hue-rotate(180deg)';
            case 'vintage_film': return 'sepia(0.4) contrast(0.9) brightness(1.1) saturate(0.8)';
            case 'studio_clean': return 'contrast(1.05) brightness(1.05) saturate(1.1)';
            default: return '';
        }
    };
    const colorGradeFilter = getColorGradeFilter(colorGrade) || undefined;

    const VideoStack = (
        <div style={{ width: '100%', height: '100%', position: 'relative', overflow: crop.isActive ? 'visible' : 'hidden' }}>
            {mediaType === 'video' && (
                <div ref={threeContainerRef} className="three-preview-container" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ ...crop.getWrapperStyle(), width: '100%', height: '100%', position: 'relative', overflow: crop.isActive ? 'visible' : 'hidden' }}>
                        <div style={{ width: '100%', height: '100%', ...previewEffectStyleSet.contentStyle, filter: getColorGradeFilter(colorGrade) || undefined }}>
                            <video key={mediaPath} ref={videoRef} src={getMediaSrc()} className="video-preview" onClick={togglePlay} onLoadedMetadata={onLoadedMetadata} preload="auto" playsInline controls={false} muted={videoMuted}
                                style={{ ...mediaContentStyle, display: 'block', zIndex: 1 }} />
                        </div>
                    </div>
                </div>
            )}
            {mediaType === 'image' && (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <img src={getMediaSrc()} alt="preview" onLoad={onLoadedMetadata} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
            )}
            {mediaType === 'audio' && (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#1a1a1f', color: 'white', gap: 20 }}>
                    <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <Music size={60} strokeWidth={1.5} color="var(--accent)" />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{mediaName}</div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Audio File</div>
                    </div>
                </div>
            )}
            {outgoingTransitionImageClip && renderImageClipLayer(
                outgoingTransitionImageClip,
                1 - crossfadeTransition!.progress,
                `outgoing-image-transition-${outgoingTransitionImageClip.id}`,
                false,
            )}
            {incomingTransitionImageClip && renderImageClipLayer(
                incomingTransitionImageClip,
                crossfadeTransition!.progress,
                `incoming-image-transition-${incomingTransitionImageClip.id}`,
                false,
            )}
            {activeImageClip && !activeImageClipHandledByTransition && renderImageClipLayer(
                activeImageClip,
                1,
                `active-image-${activeImageClip.id}`,
                true,
            )}
            {dipToBlackOpacity > 0.001 && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: '#020617',
                        opacity: dipToBlackOpacity,
                        pointerEvents: 'none',
                        zIndex: 7,
                    }}
                />
            )}
            {crop.isActive && mediaLoaded && crop.videoBounds && crop.cropRect && (
                <CropOverlay cropRect={crop.cropRect} videoBounds={crop.videoBounds} onMouseDown={crop.handleMouseDown} />
            )}
            {textOverlays.map(tov => (displayTime >= tov.startTime && displayTime < tov.startTime + tov.duration) ? (
                <TextOverlayDraggable key={tov.id} tov={tov} isSelected={selectedTextOverlayId === tov.id} disabled={annotationToolsVisible || isPlaying || selectedTextOverlayId !== tov.id}
                    onSelect={() => { setSelectedTextOverlayId(selectedTextOverlayId === tov.id ? null : tov.id); setSelectedImageClipId(null); setSelectedOverlayId(null); }}
                    onMove={(x: number, y: number) => onEditTextOverlay?.(tov.id, { x, y })}
                    onMoveEnd={onTextOverlayMoveEnd}
                    visualFilter={colorGradeFilter}
                    maxWidth={overlayBounds?.width} />
            ) : null)}
        </div>
    );

    return (
        <div className="video-container" style={{ ...containerStyle, padding: 16, boxSizing: 'border-box' }}>
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'stretch', gap: showLeftDockTools ? LEFT_DOCK_PANEL_GAP : 0 }}>
                <div ref={setLeftDockHostElement} style={{ position: 'relative', flex: showLeftDockTools ? `0 0 ${LEFT_DOCK_PANEL_WIDTH}px` : '0 0 0px', width: showLeftDockTools ? LEFT_DOCK_PANEL_WIDTH : 0, minHeight: 0, overflow: 'visible', opacity: showLeftDockTools ? 1 : 0, transition: 'all 0.3s ease', pointerEvents: showLeftDockTools ? 'auto' : 'none' }} />
                
                <div
                    ref={wrapperRef}
                    className="video-wrapper"
                    style={{
                    position: 'relative', flex: 1, minWidth: 0, minHeight: 0,
                    aspectRatio: selectedPlatformRatio ? `${selectedPlatformRatio}` : undefined,
                    ...previewEffectStyleSet.windowStyle,
                    boxShadow: previewEffectStyleSet.boxShadow || undefined,
                    filter: previewEffectStyleSet.filter || undefined,
                    zIndex: 10,
                }}>
                    <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, zIndex: 2, transform: `scale(${1 - (effectivePadding || 0) / 100})`, transformOrigin: 'center center', transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                        {VideoStack}
                    </div>

                    {!isPlaying && mediaLoaded && !crop.isActive && !selectedZoomEffect && !selectedBlurEffect && (
                        <div className="play-overlay" style={{ zIndex: 100, pointerEvents: 'none', position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <button onClick={e => { e.preventDefault(); e.stopPropagation(); togglePlay(); }} style={{ pointerEvents: 'auto', width: 82, height: 82, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(2,6,23,0.68)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Play size={48} fill="white" />
                            </button>
                        </div>
                    )}

                    <EffectBadges effects={activeEffects} />

                    <div ref={overlayLayerRef} style={{ position: 'absolute', left: overlayBounds?.left ?? 0, top: overlayBounds?.top ?? 0, width: overlayBounds?.width ?? '100%', height: overlayBounds?.height ?? '100%', pointerEvents: 'none', zIndex: 50 }}>
                        {overlayImages.map(img => (img.renderMode === 'fullscreen' && displayTime >= img.startTime && displayTime < img.startTime + img.duration) ? (
                            <div key={img.id} onClick={e => { e.stopPropagation(); setSelectedOverlayId(img.id); }}
                                style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', border: selectedOverlayId === img.id ? '2px solid var(--accent)' : 'none', pointerEvents: !isPlaying && selectedOverlayId === img.id ? 'auto' : 'none', zIndex: selectedOverlayId === img.id ? 32 : 24 }}>
                                <img src={toMediaFileUrl(img.file)} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                            </div>
                        ) : null)}
                        <VideoAnnotationLayer containerRef={overlayLayerRef} panelHostElement={leftDockHostElement} enabled={annotationToolsVisible && !crop.isActive} displayTime={displayTime} annotations={annotationOverlays} onAnnotationsChange={onAnnotationOverlaysChange} onCanvasSizeChange={onAnnotationCanvasSizeChange} onRequestClose={onCloseAnnotationTools} toolbarStyle={dockedPanelStyle} panelLayout="leftDocked" />
                        {showTextEditor && <TextOverlayEditor overlay={selectedTextOverlay!} onEdit={onEditTextOverlay} onFocus={() => setIsEditingText(true)} onBlur={() => setIsEditingText(false)} containerRef={overlayLayerRef} panelHostElement={leftDockHostElement} panelStyle={dockedPanelStyle} panelLayout="leftDocked" />}
                        {(activeEffects.some(e => e.type === 'zoom') || selectedZoomEffect) && (() => {
                            const fx = activeZoomEffect ?? selectedZoomEffect;
                            return <AreaOverlay area={fx?.zoomArea ?? { x: 0, y: 0, width: 0, height: 0 }} canEdit={!!selectedZoomEffect && !!onUpdateZoomArea && !crop.isActive && !annotationToolsVisible} onUpdate={onUpdateZoomArea} onClick={togglePlay} hint="Click & drag to draw zoom area" />;
                        })()}
                        {(activeEffects.some(e => e.type === 'blur_area') || selectedBlurEffect) && (() => {
                            const fx = activeEffects.find(e => e.type === 'blur_area') ?? selectedBlurEffect;
                            const progress = fx ? Math.max(0, Math.min(1, (displayTime - fx.startTime) / Math.max(0.001, fx.duration))) : 0;
                            const fr = fx ? computeEffectFadeRatio(fx.duration) : 0.18;
                            const intensity = fx ? (getEffectIntensity(fx) / 100) * effectEnvelope(progress, fr, fr) : 0;
                            return (
                                <>
                                    {activeEffects.some(e => e.type === 'blur_area') && fx?.zoomArea && (
                                        <div style={{ position: 'absolute', left: `${fx.zoomArea.x}%`, top: `${fx.zoomArea.y}%`, width: `${fx.zoomArea.width}%`, height: `${fx.zoomArea.height}%`, backdropFilter: `blur(${intensity * 12}px)`, background: `rgba(0,0,0,${intensity * 0.4})`, borderRadius: 4, pointerEvents: 'none', zIndex: 29 }} />
                                    )}
                                    <AreaOverlay area={fx?.zoomArea ?? { x: 0, y: 0, width: 0, height: 0 }} canEdit={!!selectedBlurEffect && !!onUpdateBlurArea && !crop.isActive && !annotationToolsVisible} onUpdate={onUpdateBlurArea} onClick={togglePlay} hint="Click & drag to draw blur area" borderColor="#a855f7" />
                                </>
                            );
                        })()}
                    </div>

                    <div ref={imageOverlayLayerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 60 }}>
                        {overlayImages.map(img => (img.renderMode !== 'fullscreen' && displayTime >= img.startTime && displayTime < img.startTime + img.duration) ? (
                            <div key={img.id} onMouseDown={e => { setSelectedOverlayId(img.id); startOverlayInteraction(e, img, 'move'); }} onClick={e => { e.stopPropagation(); setSelectedOverlayId(img.id); }}
                                style={{ position: 'absolute', left: img.x, top: img.y, width: img.width, height: img.height, zIndex: selectedOverlayId === img.id ? 30 : 20, cursor: 'move', border: selectedOverlayId === img.id ? '2px solid var(--accent)' : '1px solid transparent', pointerEvents: !annotationToolsVisible && !isPlaying && selectedOverlayId === img.id ? 'auto' : 'none' }}>
                                <img src={toMediaFileUrl(img.file)} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                {selectedOverlayId === img.id && (
                                    <div onMouseDown={e => { setSelectedOverlayId(img.id); startOverlayInteraction(e, img, 'resize'); }}
                                        style={{ position: 'absolute', right: -7, bottom: -7, width: 14, height: 14, borderRadius: 999, background: 'white', border: '2px solid var(--accent)', cursor: 'nwse-resize' }} />
                                )}
                            </div>
                        ) : null)}
                    </div>
                </div>
            </div>
        </div>
    );
};
