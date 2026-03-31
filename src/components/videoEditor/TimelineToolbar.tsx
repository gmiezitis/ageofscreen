import React from 'react';
import {
    Scissors, Trash2, Maximize2,
    SkipBack, Pause, Play, SkipForward,
    Minimize2, Zap, Scan, Type, PenLine,
    ArrowLeft, ArrowRight, Image as ImageIcon, Wind, Focus
} from 'lucide-react';
import { DEFAULT_ZOOM_INTENSITY, getEffectIntensity } from '../../videoEditor/effectIntensity';
import { OverlayImage, SmartEffect, TiltDirection, ZoomArea } from '../../videoEditor/types';
import { formatTime } from '../../videoEditor/utils';

const ZoomAreaControls: React.FC<{ area: ZoomArea; onUpdate: (area: ZoomArea) => void }> = ({ area }) => {
    const hasArea = area && (area.width > 1 || area.height > 1);
    return (
        <div className="zoom-area-controls" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: hasArea ? 'var(--accent)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {hasArea ? `Area: ${Math.round(area.width)}×${Math.round(area.height)}%` : '← Draw area on preview'}
            </span>
        </div>
    );
};

interface TimelineToolbarProps {
    totalKeptDuration: number;
    displayTime: number;
    zoom: number;
    setZoom: (z: number) => void;
    isPlaying: boolean;
    togglePlay: () => void;
    seekToStart: () => void;
    seekToEnd: () => void;
    onSplit: () => void;
    onAddImageClip: () => void;
    onDelete: () => void;
    onMoveSelectedMainTrackLeft: () => void;
    onMoveSelectedMainTrackRight: () => void;
    onAddTextOverlay: () => void;
    onAddEffect: (type: SmartEffect['type']) => void;
    annotationToolsVisible: boolean;
    onToggleAnnotationTools: () => void;
    selectedSegmentId: string | null;
    selectedImageClipId?: string | null;
    canMoveSelectedMainTrackLeft?: boolean;
    canMoveSelectedMainTrackRight?: boolean;
    selectedAudioId: string | null;
    selectedEffectId: string | null;
    selectedOverlayId?: string | null;
    overlayImages?: OverlayImage[];
    onToggleOverlayRenderMode?: (id: string) => void;
    smartEffects: SmartEffect[];
    onUpdateEffect?: (id: string, updates: Partial<SmartEffect>) => void;
    segments: any[];
    mediaLoaded: boolean;
    hasCursorData?: boolean;
}

export const TimelineToolbar: React.FC<TimelineToolbarProps> = ({
    totalKeptDuration, displayTime, zoom, setZoom, isPlaying, togglePlay,
    seekToStart, seekToEnd, onSplit, onAddImageClip, onDelete, onMoveSelectedMainTrackLeft, onMoveSelectedMainTrackRight,
    onAddTextOverlay, onAddEffect, annotationToolsVisible, onToggleAnnotationTools, selectedSegmentId, selectedImageClipId, canMoveSelectedMainTrackLeft = false, canMoveSelectedMainTrackRight = false, selectedAudioId, selectedEffectId, selectedOverlayId,
    overlayImages = [], onToggleOverlayRenderMode,
    smartEffects, onUpdateEffect, segments, mediaLoaded, hasCursorData = false,
}) => {
    const selectedOverlay = selectedOverlayId
        ? overlayImages.find((overlay) => overlay.id === selectedOverlayId) ?? null
        : null;
    const hasSelectedMainTrackItem = Boolean(selectedSegmentId || selectedImageClipId);

    return (
    <div className="playback-bar">
        <div className="timeline-tools">
            <button className={`tool-btn ${totalKeptDuration > 0 ? '' : 'disabled'}`} onClick={onSplit} title="Split (S)">
                <Scissors size={14} />
            </button>
            <button className={`tool-btn ${mediaLoaded && segments.length > 0 ? '' : 'disabled'}`} onClick={onAddImageClip} title="Add picture at playhead">
                <ImageIcon size={14} />
            </button>
            <button className={`tool-btn ${hasSelectedMainTrackItem && canMoveSelectedMainTrackLeft ? '' : 'disabled'}`} onClick={onMoveSelectedMainTrackLeft} title="Move selected clip left">
                <ArrowLeft size={14} />
            </button>
            <button className={`tool-btn ${hasSelectedMainTrackItem && canMoveSelectedMainTrackRight ? '' : 'disabled'}`} onClick={onMoveSelectedMainTrackRight} title="Move selected clip right">
                <ArrowRight size={14} />
            </button>
            <button className={`tool-btn ${selectedSegmentId || selectedImageClipId || selectedAudioId || selectedOverlayId ? '' : 'disabled'}`} onClick={onDelete} title="Delete (Del)">
                <Trash2 size={14} />
            </button>

            <div className="toolbar-divider" style={{ height: '20px', width: '1px', background: 'var(--border-light)', margin: '0 4px' }} />

            <button className="tool-btn" onClick={() => onAddEffect('zoom')} title="Focus Zoom" disabled={!mediaLoaded}><Maximize2 size={14} /></button>
            <button className="tool-btn" onClick={() => onAddEffect('slow_zoom' as any)} title="Camera Drift" disabled={!mediaLoaded}><Focus size={14} /></button>
            <button className="tool-btn" onClick={() => onAddEffect('breathing')} title="Ambient Pulse" disabled={!mediaLoaded}><Wind size={14} /></button>
            <button className="tool-btn" onClick={() => onAddEffect('blur_area' as any)} title="Blur Area Effect" disabled={!mediaLoaded}><Scan size={14} /></button>
            <button className="tool-btn" onClick={() => onAddEffect('exposure' as any)} title="Flash Accent" disabled={!mediaLoaded}><Zap size={14} /></button>
            <button className="tool-btn" onClick={onAddTextOverlay} title="Add Text Overlay (T)" disabled={!mediaLoaded}><Type size={14} /></button>
            <button
                className="tool-btn"
                onClick={onToggleAnnotationTools}
                title="Toggle Annotation Tools"
                disabled={!mediaLoaded}
                style={{
                    background: annotationToolsVisible ? 'rgba(34,197,94,0.14)' : undefined,
                    color: annotationToolsVisible ? '#4ade80' : undefined,
                    border: annotationToolsVisible ? '1px solid rgba(34,197,94,0.35)' : undefined,
                }}
            >
                <PenLine size={14} />
            </button>

            {selectedOverlay && onToggleOverlayRenderMode && (
                <button
                    className="tool-btn"
                    onClick={() => onToggleOverlayRenderMode(selectedOverlay.id)}
                    title={selectedOverlay.renderMode === 'fullscreen' ? 'Switch to floating overlay mode' : 'Switch to full-frame image mode'}
                >
                    {selectedOverlay.renderMode === 'fullscreen' ? 'Full Frame' : 'Overlay'}
                </button>
            )}

            {selectedEffectId && onUpdateEffect && (() => {
                const effect = smartEffects.find(e => e.id === selectedEffectId);
                if (!effect) return null;
                const intensity = getEffectIntensity(effect);
                const area = effect.zoomArea ?? { x: 25, y: 25, width: 50, height: 50 };
                const pillStyle: React.CSSProperties = {
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: '#111113', borderRadius: 6, padding: '3px 8px',
                    border: '1px solid #2a2a2e',
                };
                const labelStyle: React.CSSProperties = {
                    fontSize: 10, color: '#888', whiteSpace: 'nowrap', fontWeight: 500,
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                };
                const valueStyle: React.CSSProperties = {
                    fontSize: 10, color: '#ccc', minWidth: 24, fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                };
                const selectStyle: React.CSSProperties = {
                    background: '#1a1a1e', border: '1px solid #333',
                    color: '#ddd', padding: '3px 22px 3px 6px', borderRadius: 5,
                    fontSize: 10, fontWeight: 500, outline: 'none', cursor: 'pointer',
                    appearance: 'none', WebkitAppearance: 'none',
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'8\' height=\'5\' viewBox=\'0 0 8 5\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M1 1l3 3 3-3\' stroke=\'%23777\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")',
                    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 5px center',
                };
                return (
                    <div key="effect-controls" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                        <div style={pillStyle}>
                            <span style={labelStyle}>Int</span>
                            <input type="range" min="0" max="100" value={intensity} onChange={(e) => onUpdateEffect(effect.id, { intensity: parseInt(e.target.value) })} style={{ width: 60, height: 3 }} />
                            <span style={valueStyle}>{intensity}%</span>
                        </div>
                        {effect.type === 'zoom' && (
                            <>
                                <div style={{ ...pillStyle, opacity: hasCursorData ? 1 : 0.6 }}>
                                    <span style={labelStyle}>Mode</span>
                                    <select
                                        value={effect.followCursor ? 'follow' : 'fixed'}
                                        onChange={(e) => onUpdateEffect(effect.id, {
                                            followCursor: e.target.value === 'follow',
                                        })}
                                        style={selectStyle}
                                        disabled={!hasCursorData && !(effect.followCursor ?? false)}
                                        title={hasCursorData ? 'Choose whether the zoom stays fixed or follows the cursor' : 'Cursor data is required for follow mode'}
                                    >
                                        <option value="fixed">Fixed</option>
                                        <option value="follow" disabled={!hasCursorData}>Follow cursor</option>
                                    </select>
                                </div>
                                {effect.followCursor && (
                                    <div style={pillStyle}>
                                        <span style={labelStyle}>Follow</span>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={effect.followCursorIntensity ?? DEFAULT_ZOOM_INTENSITY}
                                            onChange={(e) => onUpdateEffect(effect.id, { followCursorIntensity: parseInt(e.target.value, 10) })}
                                            style={{ width: 60, height: 3 }}
                                        />
                                        <span style={valueStyle}>{effect.followCursorIntensity ?? DEFAULT_ZOOM_INTENSITY}%</span>
                                    </div>
                                )}
                            </>
                        )}
                        {effect.type === '3d_tilt' && (
                            <>
                                <div style={pillStyle}>
                                    <select
                                        value={effect.tiltDirection ?? 'orbital'}
                                        onChange={(e) => onUpdateEffect(effect.id, { tiltDirection: e.target.value as TiltDirection })}
                                        style={selectStyle}
                                    >
                                        <option value="orbital">Orbital</option>
                                        <option value="left">Left</option>
                                        <option value="right">Right</option>
                                        <option value="up">Up</option>
                                        <option value="down">Down</option>
                                    </select>
                                </div>
                                <div style={pillStyle}>
                                    <span style={labelStyle}>Snap</span>
                                    <input type="range" min="0" max="100" value={effect.tiltSnap ?? 50} onChange={(e) => onUpdateEffect(effect.id, { tiltSnap: parseInt(e.target.value) })} style={{ width: 50, height: 3 }} />
                                    <span style={valueStyle}>{effect.tiltSnap ?? 50}%</span>
                                </div>
                            </>
                        )}
                        {(effect.type === 'zoom' || effect.type === 'blur_area') && (
                            <ZoomAreaControls area={area} onUpdate={(zoomArea) => onUpdateEffect(effect.id, { zoomArea })} />
                        )}
                    </div>
                );
            })()}
        </div>

        <div className="playback-controls">
            <button className="control-btn" onClick={seekToStart} title="Skip to start"><SkipBack size={16} /></button>
            <button className="control-btn play-btn" onClick={togglePlay}>{isPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</button>
            <button className="control-btn" onClick={seekToEnd} title="Skip to end"><SkipForward size={16} /></button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="zoom-controls">
                <button className="zoom-btn" onClick={() => setZoom(Math.max(0.3, zoom - 0.2))}><Minimize2 size={12} /></button>
                <input type="range" min="0.3" max="5" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} />
                <button className="zoom-btn" onClick={() => setZoom(Math.min(5, zoom + 0.2))}><Maximize2 size={12} /></button>
            </div>
            <div className="time-display">
                <span className="current-time">{formatTime(displayTime)}</span>
                <span className="time-separator">/</span>
                <span className="total-time">{formatTime(totalKeptDuration)}</span>
            </div>
        </div>
    </div>
    );
};

