import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
    Sparkles, Maximize2, Film, VolumeX, Volume2, Music,
    GripVertical, Trash2, Scan, Zap, Image as ImageIcon, Type,
} from 'lucide-react';
import { Segment, AudioSegment, SmartEffect, OverlayImage, TextOverlay, ImageClip } from '../../videoEditor/types';
import { VisualSceneItem, buildVisualTimelineSceneItems } from '../../videoEditor/timelineScene';
import { formatTime, getSmartEffectLabel } from '../../videoEditor/utils';
import { TimelineToolbar } from './TimelineToolbar';
import TrackItem from './TrackItem';
import { toMediaFileUrl } from '../../shared/mediaPaths';
import { createVideoThumbnailsAtTimes } from '../../videoEditor/mediaThumbnails';
import { getSegmentThumbnailSampleTimes } from '../../videoEditor/timelineClips';

function computeLanes<T extends { startTime: number; duration: number }>(items: T[]): Map<T, number> {
    const laneMap = new Map<T, number>();
    const laneEnds: number[] = [];
    const sorted = [...items].sort((a, b) => a.startTime - b.startTime);
    for (const item of sorted) {
        let placed = false;
        for (let i = 0; i < laneEnds.length; i++) {
            if (item.startTime >= laneEnds[i]) {
                laneEnds[i] = item.startTime + item.duration;
                laneMap.set(item, i);
                placed = true;
                break;
            }
        }
        if (!placed) {
            laneMap.set(item, laneEnds.length);
            laneEnds.push(item.startTime + item.duration);
        }
    }
    return laneMap;
}

const EFFECT_COLORS: Record<string, string> = {
    '3d_tilt': 'linear-gradient(135deg, #7b5fbf 0%, #5a4a9f 100%)',
    'zoom': 'linear-gradient(135deg, #5fbf7b 0%, #4a9f5a 100%)',
    'blur_area': 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    'exposure': 'linear-gradient(135deg, #facc15 0%, #ca8a04 100%)',
    'slow_zoom': 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
    'breathing': 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    'card_flip': 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
};

const EFFECT_ICONS: Record<string, React.ReactNode> = {
    '3d_tilt': <Sparkles size={10} />,
    'zoom': <Maximize2 size={10} />,
    'blur_area': <Scan size={10} />,
    'exposure': <Zap size={10} />,
    'slow_zoom': <Maximize2 size={10} />,
    'breathing': <Sparkles size={10} />,
    'card_flip': <Sparkles size={10} />,
};

interface TimelineProps {
    totalKeptDuration: number;
    displayTime: number;
    zoom: number;
    setZoom: (zoom: number) => void;
    isPlaying: boolean;
    togglePlay: () => void;
    seekToStart: () => void;
    seekToEnd: () => void;
    segments: Segment[];
    selectedSegmentId: string | null;
    setSelectedSegmentId: (id: string | null) => void;
    imageClips: ImageClip[];
    selectedImageClipId: string | null;
    setSelectedImageClipId: (id: string | null) => void;
    audioSegments: AudioSegment[];
    selectedAudioId: string | null;
    setSelectedAudioId: (id: string | null) => void;
    smartEffects: SmartEffect[];
    selectedEffectId: string | null;
    setSelectedEffectId: (id: string | null) => void;
    overlayImages: OverlayImage[];
    selectedOverlayId: string | null;
    setSelectedOverlayId: (id: string | null) => void;
    textOverlays: TextOverlay[];
    selectedTextOverlayId: string | null;
    setSelectedTextOverlayId: (id: string | null) => void;
    videoMuted: boolean;
    setVideoMuted: (muted: boolean) => void;
    onSplit: () => void;
    onAddImageClip: () => void;
    onDelete: () => void;
    onDeleteOverlayImage: (id: string) => void;
    onToggleOverlayRenderMode: (id: string) => void;
    onCloseGaps: () => void;
    onAddTextOverlay: () => void;
    onAddEffect: (type: SmartEffect['type']) => void;
    annotationToolsVisible: boolean;
    onToggleAnnotationTools: () => void;
    seekTimelineToClientX: (clientX: number, target?: EventTarget | null) => void;
    handlePlayheadDragStart: (e: React.MouseEvent) => void;
    handleDragStart: (e: React.DragEvent, id: string) => void;
    handleDragOver: (e: React.DragEvent, index: number) => void;
    handleDrop: (e: React.DragEvent, target: 'video' | 'overlays' | 'audio') => void;
    handleDragEnd: () => void;
    handleResizeStart: (e: React.MouseEvent, id: string, type: string, edge: string, start: number, duration: number) => void;
    handleEffectDragStart: (clientX: number, id: string) => void;
    handleAudioDragStart: (clientX: number, id: string) => void;
    handleOverlayDragStart: (clientX: number, id: string) => void;
    handleTextOverlayDragStart: (clientX: number, id: string) => void;
    onDeleteEffect: (id: string) => void;
    onDeleteTextOverlay: (id: string) => void;
    onUpdateEffect?: (id: string, updates: Partial<SmartEffect>) => void;
    isDraggingPlayhead: boolean;
    draggedSegmentId: string | null;
    dragOverIndex: number | null;
    draggedAudioId: string | null;
    draggedOverlayId: string | null;
    mediaLoaded: boolean;
    handleImportMedia: (type: 'video' | 'audio') => void;
    mediaPath: string | null;
    mediaLibrary: Array<{ id: string; type: 'video' | 'image' | 'audio'; path: string; name: string; thumbnail?: string; duration?: number }>;
    draggingEffectId?: string | null;
    timelineRef: React.RefObject<HTMLDivElement>;
    onSmartFocus?: () => void;
    hasCursorData?: boolean;
}

export const Timeline: React.FC<TimelineProps> = (props) => {
    const {
        totalKeptDuration, displayTime, zoom, segments,
        selectedSegmentId, setSelectedSegmentId, imageClips, selectedImageClipId, setSelectedImageClipId, audioSegments,
        selectedAudioId, setSelectedAudioId, smartEffects,
        selectedEffectId, setSelectedEffectId, overlayImages,
        selectedOverlayId, setSelectedOverlayId, textOverlays,
        selectedTextOverlayId, setSelectedTextOverlayId,
        videoMuted, setVideoMuted, onDelete,
        onDeleteOverlayImage, onToggleOverlayRenderMode,
        seekTimelineToClientX,
        handlePlayheadDragStart, handleDragStart, handleDragOver,
        handleDrop, handleDragEnd, handleResizeStart,
        handleEffectDragStart, handleAudioDragStart,
        handleOverlayDragStart, handleTextOverlayDragStart,
        onDeleteEffect, onDeleteTextOverlay, isDraggingPlayhead,
        draggedSegmentId, dragOverIndex, handleImportMedia,
        mediaPath, mediaLibrary, draggingEffectId, timelineRef,
    } = props;

    const LANE_H = 22;
    const LANE_GAP = 2;
    const thumbnailCacheRef = useRef(new Map<string, string[]>());
    const [segmentThumbnailStrips, setSegmentThumbnailStrips] = useState<Record<string, string[]>>({});

    const mainTrackItems = useMemo(() => buildVisualTimelineSceneItems(segments, imageClips), [segments, imageClips]);
    const mainTrackDropBoundaries = useMemo(() => {
        if (mainTrackItems.length === 0 || totalKeptDuration <= 0) {
            return [];
        }

        return [
            ...mainTrackItems.map((item, index) => ({
                index,
                leftPct: (item.startTime / totalKeptDuration) * 100,
                edge: index === 0 && item.startTime <= 0.0001 ? 'start' : 'center',
            })),
            { index: mainTrackItems.length, leftPct: 100, edge: 'end' },
        ];
    }, [mainTrackItems, totalKeptDuration]);
    const getMainTrackDropIndexFromClientX = useCallback((clientX: number, target: EventTarget | null) => {
        if (mainTrackItems.length === 0 || totalKeptDuration <= 0) {
            return 0;
        }

        const targetElement = target instanceof HTMLElement ? target : null;
        const rowElement = targetElement?.closest('.video-track-row') as HTMLElement | null;
        const rowRect = rowElement?.getBoundingClientRect();
        if (!rowRect) {
            return mainTrackItems.length;
        }

        const percent = Math.max(0, Math.min(1, (clientX - rowRect.left) / Math.max(rowRect.width, 1)));
        const displayTimeAtCursor = percent * totalKeptDuration;
        const index = mainTrackItems.findIndex((item) => (
            displayTimeAtCursor < item.startTime + (item.duration / 2)
        ));
        return index >= 0 ? index : mainTrackItems.length;
    }, [mainTrackItems, totalKeptDuration]);

    const allItems = useMemo(() => ([
        ...smartEffects.map((e: SmartEffect) => ({ kind: 'effect' as const, item: e })),
        ...overlayImages.map((i: OverlayImage) => ({ kind: 'image' as const, item: i })),
        ...textOverlays.map((t: TextOverlay) => ({ kind: 'text' as const, item: t })),
    ]), [overlayImages, smartEffects, textOverlays]);
    const laneMap = useMemo(() => computeLanes(allItems.map((a: { item: any }) => a.item)), [allItems]);
    const laneCount = useMemo(
        () => Math.max(1, ...Array.from(laneMap.values()).map((v: number) => v + 1)),
        [laneMap],
    );
    const trackHeight = useMemo(() => laneCount * (LANE_H + LANE_GAP) + LANE_GAP, [laneCount]);
    const getOverlayThumbnail = useCallback((overlay: OverlayImage) => (
        overlay.thumbnail
        || mediaLibrary.find((item) => item.type === 'image' && item.path === overlay.file)?.thumbnail
        || toMediaFileUrl(overlay.file)
    ), [mediaLibrary]);

    useEffect(() => {
        if (!mediaPath || segments.length === 0) {
            setSegmentThumbnailStrips({});
            return;
        }
        if (props.isPlaying) {
            return;
        }

        let cancelled = false;
        let idleHandle: number | null = null;
        const idleWindow = window as Window & {
            requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
            cancelIdleCallback?: (handle: number) => void;
        };
        const buildSegmentThumbnails = async () => {
            const nextStrips: Record<string, string[]> = {};
            const requests = segments.flatMap((segment) => {
                const sampleTimes = getSegmentThumbnailSampleTimes(segment);
                if (sampleTimes.length === 0) return [];

                const cacheKey = [
                    mediaPath,
                    segment.startTime.toFixed(3),
                    segment.endTime.toFixed(3),
                    sampleTimes.length,
                ].join('|');
                const cached = thumbnailCacheRef.current.get(cacheKey);
                if (cached?.length) {
                    nextStrips[segment.id] = cached;
                    return [];
                }

                return [{ segmentId: segment.id, sampleTimes, cacheKey }];
            });

            if (requests.length > 0) {
                try {
                    const allTimes = requests.flatMap((request) => request.sampleTimes);
                    const captured = await createVideoThumbnailsAtTimes(mediaPath, allTimes);
                    let offset = 0;

                    for (const request of requests) {
                        const frameCount = request.sampleTimes.length;
                        const strip = captured.slice(offset, offset + frameCount).filter(Boolean);
                        offset += frameCount;
                        if (strip.length > 0) {
                            thumbnailCacheRef.current.set(request.cacheKey, strip);
                            nextStrips[request.segmentId] = strip;
                        }
                    }
                } catch (error) {
                    console.warn('[Timeline] Failed to build segment thumbnails:', error);
                }
            }

            if (!cancelled) {
                setSegmentThumbnailStrips(nextStrips);
            }
        };

        if (typeof idleWindow.requestIdleCallback === 'function') {
            idleHandle = idleWindow.requestIdleCallback(() => {
                if (!cancelled) {
                    void buildSegmentThumbnails();
                }
            }, { timeout: 400 });
        } else {
            idleHandle = window.setTimeout(() => {
                if (!cancelled) {
                    void buildSegmentThumbnails();
                }
            }, 160);
        }

        return () => {
            cancelled = true;
            if (idleHandle !== null) {
                if (typeof idleWindow.cancelIdleCallback === 'function') {
                    idleWindow.cancelIdleCallback(idleHandle);
                } else {
                    window.clearTimeout(idleHandle);
                }
            }
        };
    }, [mediaPath, props.isPlaying, segments]);

    const clearSelection = useCallback(() => {
        setSelectedSegmentId(null);
        setSelectedAudioId(null);
        setSelectedEffectId(null);
        setSelectedOverlayId(null);
        setSelectedImageClipId(null);
        setSelectedTextOverlayId(null);
    }, [
        setSelectedAudioId,
        setSelectedEffectId,
        setSelectedImageClipId,
        setSelectedOverlayId,
        setSelectedSegmentId,
        setSelectedTextOverlayId,
    ]);
    const selectEffect = useCallback((id: string | null) => {
        clearSelection();
        setSelectedEffectId(id);
    }, [clearSelection, setSelectedEffectId]);
    const selectOverlay = useCallback((id: string | null) => {
        clearSelection();
        setSelectedOverlayId(id);
    }, [clearSelection, setSelectedOverlayId]);
    const selectTextOverlay = useCallback((id: string | null) => {
        clearSelection();
        setSelectedTextOverlayId(id);
    }, [clearSelection, setSelectedTextOverlayId]);
    const getClampedPlacement = useCallback((leftPct: number, widthPct: number, minWidthPct = 2) => {
        const safeLeft = Math.max(0, Math.min(leftPct, 100));
        const availableWidth = Math.max(0, 100 - safeLeft);
        if (availableWidth <= 0) return null;
        const minVisibleWidth = Math.min(minWidthPct, availableWidth);
        return {
            leftPct: safeLeft,
            widthPct: Math.min(Math.max(widthPct, minVisibleWidth), availableWidth),
        };
    }, []);
    const handleTimelinePointerDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest('.track-label, .ruler-header-spacer, .resize-handle, button, .playhead')) return;
        e.preventDefault();
        seekTimelineToClientX(e.clientX, e.target);
    }, [seekTimelineToClientX]);

    return (
        <div className="editor-timeline">
            <TimelineToolbar
                totalKeptDuration={totalKeptDuration}
                displayTime={displayTime}
                zoom={zoom}
                setZoom={props.setZoom}
                isPlaying={props.isPlaying}
                togglePlay={props.togglePlay}
                seekToStart={props.seekToStart}
                seekToEnd={props.seekToEnd}
                onSplit={props.onSplit}
                onAddImageClip={props.onAddImageClip}
                onDelete={onDelete}
                onAddTextOverlay={props.onAddTextOverlay}
                onAddEffect={props.onAddEffect}
                annotationToolsVisible={props.annotationToolsVisible}
                onToggleAnnotationTools={props.onToggleAnnotationTools}
                selectedSegmentId={selectedSegmentId}
                selectedImageClipId={selectedImageClipId}
                selectedAudioId={selectedAudioId}
                selectedEffectId={selectedEffectId}
                selectedOverlayId={selectedOverlayId}
                overlayImages={overlayImages}
                onToggleOverlayRenderMode={onToggleOverlayRenderMode}
                smartEffects={smartEffects}
                onUpdateEffect={props.onUpdateEffect}
                segments={segments}
                mediaLoaded={props.mediaLoaded}
                hasCursorData={props.hasCursorData}
            />

            <div className="timeline-scroll-container" style={{ overflowX: 'auto', overflowY: 'visible', flex: 1, position: 'relative' }}>
                <div
                    className="timeline-track"
                    ref={timelineRef}
                    onMouseDown={handleTimelinePointerDown}
                    style={{ overflow: 'visible', width: `${100 * zoom}%`, minWidth: '100%', boxSizing: 'border-box' }}
                >
                    {/* Ruler */}
                    <div className="timeline-ruler">
                        <div className="ruler-header-spacer" />
                        <div className="ruler-content">
                            {Array.from({ length: 11 }).map((_, i) => (
                                <div key={i} className="ruler-marker" style={{ left: `${i * 10}%` }}>
                                    {formatTime((totalKeptDuration * i) / 10)}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Video Track */}
                    <div className="track-container">
                        <div className="track-label" style={{ justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Film size={11} strokeWidth={1.5} />Video</div>
                            <button className={`track-mute-btn ${videoMuted ? 'muted' : ''}`} onClick={(e) => { e.stopPropagation(); setVideoMuted(!videoMuted); }}>
                                {videoMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                            </button>
                        </div>
                        <div
                            className={`track-row video-track-row ${draggedSegmentId ? 'dragging-main-item' : ''}`}
                            onDragOver={(e) => handleDragOver(e, getMainTrackDropIndexFromClientX(e.clientX, e.target))}
                            onDrop={(e) => handleDrop(e, 'video')}
                        >
                            {mainTrackItems.length === 0 ? (
                                <button className="add-track-btn" onClick={() => handleImportMedia('video')}>+ Add video</button>
                            ) : (
                                <>
                                    {draggedSegmentId && mainTrackDropBoundaries.map((boundary) => (
                                        <div
                                            key={`drop-zone-${boundary.index}`}
                                            className={`main-track-drop-zone main-track-drop-zone-${boundary.edge} ${dragOverIndex === boundary.index ? 'active' : ''}`}
                                            style={{ left: `${boundary.leftPct}%` }}
                                            onDragOver={(e) => handleDragOver(e, boundary.index)}
                                            onDrop={(e) => handleDrop(e, 'video')}
                                        />
                                    ))}
                                    {mainTrackItems.map((item: VisualSceneItem, index: number) => {
                                        if (item.kind === 'video') {
                                            const segment = item.segment;
                                            const segDuration = segment.endTime - segment.startTime;
                                            const segWidth = totalKeptDuration > 0 ? (segDuration / totalKeptDuration) * 100 : 0;
                                            const segLeft = totalKeptDuration > 0 ? (segment.timelineStart / totalKeptDuration) * 100 : 0;
                                            const placement = getClampedPlacement(segLeft, segWidth, 3);
                                            const isSelected = selectedSegmentId === segment.id;
                                            const thumbnailStrip = segmentThumbnailStrips[segment.id] ?? [];
                                            if (!placement) return null;
                                            return (
                                                <React.Fragment key={segment.id}>
                                                    {dragOverIndex === index && draggedSegmentId && draggedSegmentId !== segment.id && (
                                                        <div className="drop-indicator" style={{ left: `${placement.leftPct}%` }} />
                                                    )}
                                                    <div
                                                        className={`segment ${isSelected ? 'selected' : ''} ${draggedSegmentId === segment.id ? 'dragging' : ''}`}
                                                        style={{ position: 'absolute', left: `${placement.leftPct}%`, width: `${placement.widthPct}%`, height: '100%' }}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, segment.id)}
                                                        onDragOver={(e) => handleDragOver(e, getMainTrackDropIndexFromClientX(e.clientX, e.currentTarget))}
                                                        onDrop={(e) => handleDrop(e, 'video')}
                                                        onDragEnd={handleDragEnd}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const nextId = segment.id === selectedSegmentId ? null : segment.id;
                                                            clearSelection();
                                                            setSelectedSegmentId(nextId);
                                                        }}
                                                    >
                                                        {thumbnailStrip.length > 0 && (
                                                            <div className="segment-filmstrip" aria-hidden="true">
                                                                {thumbnailStrip.map((frame, frameIndex) => (
                                                                    <div
                                                                        key={`${segment.id}-thumb-${frameIndex}`}
                                                                        className="segment-filmstrip-frame"
                                                                        style={{ backgroundImage: `url(${frame})` }}
                                                                    />
                                                                ))}
                                                            </div>
                                                        )}
                                                        <div className="segment-filmstrip-overlay" aria-hidden="true" />
                                                        <div className="segment-filmstrip-glow" aria-hidden="true" />
                                                        <div className="segment-grip"><GripVertical size={12} /></div>
                                                        <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 4, opacity: isSelected ? 1 : 0, transition: 'opacity 0.2s', zIndex: 10 }}>
                                                            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ background: 'rgba(255, 68, 68, 0.8)', border: 'none', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }} title="Delete Segment"><Trash2 size={12} /></button>
                                                        </div>
                                                        <span className="segment-duration">{formatTime(segment.endTime - segment.startTime)}</span>
                                                        <div className="resize-handle left" onMouseDown={(e) => handleResizeStart(e, segment.id, 'video', 'start', segment.startTime, segDuration)} style={{ width: '12px' }} />
                                                        <div className="resize-handle right" onMouseDown={(e) => handleResizeStart(e, segment.id, 'video', 'end', segment.startTime, segDuration)} style={{ width: '12px' }} />
                                                    </div>
                                                </React.Fragment>
                                            );
                                        } else {
                                            const clip = item.clip;
                                            const clipWidth = totalKeptDuration > 0 ? (clip.duration / totalKeptDuration) * 100 : 0;
                                            const clipLeft = totalKeptDuration > 0 ? (clip.startTime / totalKeptDuration) * 100 : 0;
                                            const placement = getClampedPlacement(clipLeft, clipWidth, 1);
                                            const isSelected = selectedImageClipId === clip.id;
                                            const isVideoClip = clip.mediaType === 'video';
                                            if (!placement) return null;
                                            return (
                                                <React.Fragment key={clip.id}>
                                                    {dragOverIndex === index && draggedSegmentId && draggedSegmentId !== clip.id && (
                                                        <div className="drop-indicator" style={{ left: `${placement.leftPct}%` }} />
                                                    )}
                                                    <div
                                                        className={`track-item-draggable ${isSelected ? 'selected' : ''} ${draggedSegmentId === clip.id ? 'dragging' : ''}`}
                                                        style={{ position: 'absolute', left: `${placement.leftPct}%`, width: `${placement.widthPct}%`, height: '100%', zIndex: isSelected ? 100 : 10 }}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, clip.id)}
                                                        onDragOver={(e) => handleDragOver(e, getMainTrackDropIndexFromClientX(e.clientX, e.currentTarget))}
                                                        onDrop={(e) => handleDrop(e, 'video')}
                                                        onDragEnd={handleDragEnd}
                                                    >
                                                        <TrackItem
                                                            id={clip.id}
                                                            leftPct={0}
                                                            widthPct={100}
                                                            topPx={0}
                                                            heightPx="100%"
                                                            background={isVideoClip ? "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)" : "linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)"}
                                                            thumbnailUrl={clip.thumbnail || (isVideoClip ? undefined : toMediaFileUrl(clip.file))}
                                                            isSelected={isSelected}
                                                            icon={isVideoClip ? <Film size={10} /> : <ImageIcon size={10} />}
                                                            label={clip.name || (isVideoClip ? 'Video' : 'Image')}
                                                            startTime={clip.startTime}
                                                            duration={clip.duration}
                                                            onPointerDownSeek={seekTimelineToClientX}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                clearSelection();
                                                                setSelectedImageClipId(clip.id);
                                                            }}
                                                            onDelete={(e) => { e.stopPropagation(); onDelete(); }}
                                                            onResizeStart={(e, edge) => handleResizeStart(e, clip.id, 'imageClip', edge, clip.startTime, clip.duration)}
                                                        />
                                                    </div>
                                                </React.Fragment>
                                            );
                                        }
                                    })}
                                    {dragOverIndex === mainTrackItems.length && draggedSegmentId && <div className="drop-indicator last" />}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Overlays Track */}
                    <div className="track-container">
                        <div className="track-label"><span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={11} strokeWidth={1.5} />Overlays</span></div>
                        <div className="track-row overlays-track-row" style={{ position: 'relative', minHeight: `${trackHeight}px` }} onDragOver={(e) => handleDragOver(e, -1)} onDrop={(e) => handleDrop(e, 'overlays')}>
                            {smartEffects.map((effect: SmartEffect) => {
                                const lane = laneMap.get(effect) ?? 0;
                                return (
                                    <TrackItem
                                        key={effect.id}
                                        id={effect.id}
                                        leftPct={totalKeptDuration > 0 ? (effect.startTime / totalKeptDuration) * 100 : 0}
                                        widthPct={totalKeptDuration > 0 ? (effect.duration / totalKeptDuration) * 100 : 10}
                                        topPx={LANE_GAP + lane * (LANE_H + LANE_GAP)}
                                        heightPx={LANE_H}
                                        background={EFFECT_COLORS[effect.type as string] || 'var(--accent)'}
                                        isSelected={selectedEffectId === effect.id}
                                        isDragging={draggingEffectId === effect.id}
                                        icon={EFFECT_ICONS[effect.type as string]}
                                        label={getSmartEffectLabel(effect.type, effect.label)}
                                        startTime={effect.startTime}
                                        duration={effect.duration}
                                        onPointerDownSeek={seekTimelineToClientX}
                                        onStartDrag={(clientX) => handleEffectDragStart(clientX, effect.id)}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            selectEffect(selectedEffectId === effect.id ? null : effect.id);
                                        }}
                                        onDelete={(e) => { e.stopPropagation(); onDeleteEffect(effect.id); }}
                                        onResizeStart={(e, edge) => handleResizeStart(e, effect.id, 'effect', edge, effect.startTime, effect.duration)}
                                    />
                                );
                            })}
                            {overlayImages.map((img: OverlayImage) => {
                                const lane = laneMap.get(img) ?? 0;
                                return (
                                    <TrackItem
                                        key={img.id}
                                        id={img.id}
                                        leftPct={totalKeptDuration > 0 ? (img.startTime / totalKeptDuration) * 100 : 0}
                                        widthPct={totalKeptDuration > 0 ? (img.duration / totalKeptDuration) * 100 : 10}
                                        topPx={LANE_GAP + lane * (LANE_H + LANE_GAP)}
                                        heightPx={LANE_H}
                                        background="linear-gradient(135deg, #10b981 0%, #059669 100%)"
                                        thumbnailUrl={getOverlayThumbnail(img)}
                                        isSelected={selectedOverlayId === img.id}
                                        icon={<ImageIcon size={10} />}
                                        label={img.renderMode === 'fullscreen' ? 'Full Frame Image' : 'Image Overlay'}
                                        startTime={img.startTime}
                                        duration={img.duration}
                                        onPointerDownSeek={seekTimelineToClientX}
                                        onStartDrag={(clientX) => handleOverlayDragStart(clientX, img.id)}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            selectOverlay(selectedOverlayId === img.id ? null : img.id);
                                        }}
                                        onDelete={(e) => { e.stopPropagation(); onDeleteOverlayImage(img.id); }}
                                        onResizeStart={(e, edge) => handleResizeStart(e, img.id, 'image', edge, img.startTime, img.duration)}
                                    />
                                );
                            })}
                            {textOverlays.map((tov: TextOverlay) => {
                                const lane = laneMap.get(tov) ?? 0;
                                return (
                                    <TrackItem
                                        key={tov.id}
                                        id={tov.id}
                                        leftPct={totalKeptDuration > 0 ? (tov.startTime / totalKeptDuration) * 100 : 0}
                                        widthPct={totalKeptDuration > 0 ? (tov.duration / totalKeptDuration) * 100 : 10}
                                        topPx={LANE_GAP + lane * (LANE_H + LANE_GAP)}
                                        heightPx={LANE_H}
                                        background="linear-gradient(135deg, #e06c9f 0%, #c2547a 100%)"
                                        isSelected={selectedTextOverlayId === tov.id}
                                        icon={<Type size={10} />}
                                        label={tov.text || 'Text'}
                                        startTime={tov.startTime}
                                        duration={tov.duration}
                                        onPointerDownSeek={seekTimelineToClientX}
                                        onStartDrag={(clientX) => handleTextOverlayDragStart(clientX, tov.id)}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            selectTextOverlay(selectedTextOverlayId === tov.id ? null : tov.id);
                                        }}
                                        onDelete={(e) => { e.stopPropagation(); onDeleteTextOverlay(tov.id); setSelectedTextOverlayId(null); }}
                                        onResizeStart={(e, edge) => handleResizeStart(e, tov.id, 'text', edge, tov.startTime, tov.duration)}
                                    />
                                );
                            })}
                        </div>
                    </div>

                    {/* Audio Track */}
                    <div className="track-container">
                        <div className="track-label"><Music size={11} strokeWidth={1.5} />Audio</div>
                        <div className="track-row audio-track-row" onDragOver={(e) => handleDragOver(e, -1)} onDrop={(e) => handleDrop(e, 'audio')}>
                            {audioSegments.map((seg: AudioSegment) => {
                                const leftPct = totalKeptDuration > 0 ? (seg.startTime / totalKeptDuration) * 100 : 0;
                                const widthPct = totalKeptDuration > 0 ? (seg.duration / totalKeptDuration) * 100 : 10;
                                const placement = getClampedPlacement(leftPct, widthPct);
                                const isSelected = selectedAudioId === seg.id;
                                if (!placement) return null;
                                return (
                                    <div
                                        key={seg.id}
                                        className={`audio-segment ${isSelected ? 'selected' : ''}`}
                                        style={{ left: `${placement.leftPct}%`, width: `${placement.widthPct}%`, cursor: 'grab', height: '20px' }}
                                        onMouseDown={(e) => {
                                            const target = e.target as HTMLElement | null;
                                            if (target?.closest('.resize-handle, button')) {
                                                e.stopPropagation();
                                                return;
                                            }
                                            e.preventDefault();
                                            e.stopPropagation();
                                            seekTimelineToClientX(e.clientX, e.target);
                                            handleAudioDragStart(e.clientX, seg.id);
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            clearSelection();
                                            setSelectedAudioId(seg.id);
                                        }}
                                    >
                                        <Music size={10} />
                                        <span style={{ fontSize: '9px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{seg.name}</span>
                                        {isSelected && (
                                            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ background: 'rgba(255,68,68,0.8)', border: 'none', borderRadius: '4px', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', marginRight: '4px' }}><Trash2 size={10} /></button>
                                        )}
                                        <div className="resize-handle left" onMouseDown={(e) => handleResizeStart(e, seg.id, 'audio', 'start', seg.startTime, seg.duration)} style={{ width: '12px' }} />
                                        <div className="resize-handle right" onMouseDown={(e) => handleResizeStart(e, seg.id, 'audio', 'end', seg.startTime, seg.duration)} style={{ width: '12px' }} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Playhead */}
                    <div
                        className="playhead"
                        style={{
                            position: 'absolute', top: 0, bottom: 0,
                            left: `calc(100px + (100% - 100px) * ${totalKeptDuration > 0 ? Math.min(displayTime / totalKeptDuration, 1) : 0})`,
                            width: '1px', background: 'var(--accent-light, #7a8fb3)', zIndex: 100, pointerEvents: 'none',
                            boxShadow: 'var(--shadow-md)',
                        }}
                    >
                        <div
                            className="playhead-handle"
                            style={{
                                position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                                width: '15px', height: '15px',
                                background: 'rgba(255, 255, 255, 0.25)',
                                backdropFilter: 'blur(8px)',
                                border: '1px solid rgba(255, 255, 255, 0.5)',
                                borderRadius: '50%',
                                cursor: isDraggingPlayhead ? 'grabbing' : 'ew-resize',
                                pointerEvents: 'auto',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15), inset 0 0 4px rgba(255, 255, 255, 0.4)',
                                transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                            onMouseDown={handlePlayheadDragStart}
                        >
                             <div className="playhead-label" style={{ 
                                 opacity: 0, position: 'absolute', top: -24, 
                                 background: 'rgba(20, 20, 25, 0.85)', backdropFilter: 'blur(4px)',
                                 color: 'white', padding: '3px 8px', borderRadius: '6px', 
                                 fontSize: '9px', fontWeight: 600, pointerEvents: 'none',
                                 border: '1px solid rgba(255,255,255,0.1)',
                                 boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                                 transition: 'opacity 0.2s, transform 0.2s',
                                 transform: 'translateY(4px)'
                             }}>
                                CAMERA
                             </div>
                        </div>
                    </div>
                </div>
            </div>
            <style dangerouslySetInnerHTML={{ __html: `
                .playhead-handle:hover .playhead-label {
                    opacity: 1 !important;
                    transform: translateY(0) !important;
                }
                .playhead-handle:hover {
                    background: rgba(255, 255, 255, 0.4) !important;
                    transform: translateX(-50%) scale(1.1) !important;
                }
            `}} />
        </div>
    );
};
