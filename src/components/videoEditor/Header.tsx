import React, { useState, useRef, useEffect } from 'react';
import { PanelLeft, Monitor, Palette, Undo2, Redo2, ChevronDown, Sparkles, Crop, Wand2, Activity, Loader2 } from 'lucide-react';
import {
    ExportQuality,
    PlatformPreset,
    ColorGradePreset,
    SmartTrackingProfile,
} from '../../videoEditor/types';
import { BackgroundPicker } from './BackgroundPicker';
import { WindowControls } from './WindowControls';
import { resolveBackgroundCSS } from '../../videoEditor/effectMath';

interface HeaderProps {
    mediaType: string | null;
    mediaName: string;
    isSidebarCollapsed: boolean;
    setIsSidebarCollapsed: (collapsed: boolean) => void;
    selectedPlatform: string;
    setSelectedPlatform: (platform: string) => void;
    platformPresets: PlatformPreset[];
    isMaximized: boolean;
    onMaximize: () => void;
    onMinimize: () => void;
    onExport: (platformOverride?: string) => void;
    onAutoPolish?: () => void;
    onClose: () => void;
    isExporting: boolean;
    exportProgress?: number;
    isAutoPolishing?: boolean;
    isCropping: boolean;
    onStartCropping: () => void;
    onApplyCrop: () => void;
    onCancelCrop: () => void;
    backgroundColor?: string;
    setBackgroundColor?: (color: string) => void;
    videoPadding?: number;
    setVideoPadding?: (padding: number) => void;
    hasRecordingMetadata: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    exportQuality: ExportQuality;
    setExportQuality: (quality: ExportQuality) => void;
    colorGrade: ColorGradePreset;
    setColorGrade: (grade: ColorGradePreset) => void;
    premiumVoice: boolean;
    setPremiumVoice: (active: boolean) => void;
    playbackSpeed: number;
    setPlaybackSpeed: (speed: number) => void;
    autoPolishTrackingProfile: SmartTrackingProfile;
    setAutoPolishTrackingProfile: (profile: SmartTrackingProfile) => void;
}

export const Header: React.FC<HeaderProps> = React.memo(({
    mediaType, mediaName, isSidebarCollapsed, setIsSidebarCollapsed,
    selectedPlatform, setSelectedPlatform, platformPresets,
    isMaximized, onMaximize, onMinimize, onExport, onAutoPolish, onClose,
    isExporting, exportProgress = 0, isAutoPolishing = false, isCropping, onStartCropping, onApplyCrop, onCancelCrop,
    backgroundColor, setBackgroundColor, videoPadding = 0, setVideoPadding,
    hasRecordingMetadata,
    onUndo, onRedo, canUndo, canRedo,
    exportQuality, setExportQuality,
    colorGrade, setColorGrade,
    premiumVoice: _premiumVoice, setPremiumVoice: _setPremiumVoice,
    playbackSpeed, setPlaybackSpeed,
    autoPolishTrackingProfile: _autoPolishTrackingProfile, setAutoPolishTrackingProfile: _setAutoPolishTrackingProfile,
}) => {
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showExports, setShowExports] = useState(false);
    const [showColorGrade, setShowColorGrade] = useState(false);
    const [showPlaybackSpeed, setShowPlaybackSpeed] = useState(false);
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const colorGradeRef = useRef<HTMLDivElement>(null);
    const exportMenuRef = useRef<HTMLDivElement>(null);
    const playbackSpeedRef = useRef<HTMLDivElement>(null);
    const backgroundSwatch = resolveBackgroundCSS(backgroundColor || '#000000');

    useEffect(() => {
        if (!showColorPicker && !showColorGrade && !showExports && !showPlaybackSpeed) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) setShowColorPicker(false);
            if (colorGradeRef.current && !colorGradeRef.current.contains(e.target as Node)) setShowColorGrade(false);
            if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setShowExports(false);
            if (playbackSpeedRef.current && !playbackSpeedRef.current.contains(e.target as Node)) setShowPlaybackSpeed(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showColorPicker, showColorGrade, showExports, showPlaybackSpeed]);

    useEffect(() => {
        if (exportQuality === 'high') {
            setExportQuality('balanced');
        }
    }, [exportQuality, setExportQuality]);

    const undoRedoStyle = (enabled: boolean): any => ({
        background: 'transparent', border: 'none', padding: '8px', borderRadius: '8px', cursor: enabled ? 'pointer' : 'not-allowed',
        color: enabled ? 'var(--text-secondary)' : 'var(--text-muted)', opacity: enabled ? 1 : 0.4, transition: 'opacity 0.2s', WebkitAppRegion: 'no-drag',
    });

    const importedVideoLacksMetadata = mediaType === 'video' && !hasRecordingMetadata;
    const autoPolishButtonDisabled = isAutoPolishing || isExporting || importedVideoLacksMetadata;

    return (
        <div className="editor-header" style={{ height: '56px', background: 'rgba(26,26,31,0.8)', backdropFilter: 'blur(20px)', zIndex: 1100, overflow: 'visible', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '0 1 auto', minWidth: 0, overflow: 'hidden' }}>
                <button className={`sidebar-toggle-btn ${isSidebarCollapsed ? 'collapsed' : ''}`} onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} title={isSidebarCollapsed ? 'Show My Media' : 'Hide My Media'}
                    style={{ background: 'transparent', border: 'none', padding: '8px', opacity: isSidebarCollapsed ? 0.5 : 1, flexShrink: 0 }}>
                    <PanelLeft size={18} />
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ageofscreen Editor</span>
                    {mediaName && <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mediaName}</span>}
                </div>
                {importedVideoLacksMetadata && (
                    <div
                        title="Imported video detected. Cursor-based tools are available only for ageofscreen recordings with cursor metadata."
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            border: '1px solid rgba(148,163,184,0.18)',
                            background: 'rgba(15,23,42,0.45)',
                            color: '#cbd5e1',
                            fontSize: '10px',
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            flexShrink: 0,
                        }}
                    >
                        <span>Imported Video</span>
                        <span style={{ color: 'rgba(203,213,225,0.7)' }}>Cursor Tools Off</span>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {onUndo && <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={undoRedoStyle(!!canUndo)}><Undo2 size={18} /></button>}
                {onRedo && <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" style={undoRedoStyle(!!canRedo)}><Redo2 size={18} /></button>}

                <div style={{ width: '1px', height: '20px', background: 'var(--border-light)' }} />

                {setBackgroundColor && (
                    <div ref={colorPickerRef} style={{ position: 'relative', WebkitAppRegion: 'no-drag' } as any}>
                        <button onClick={() => setShowColorPicker(!showColorPicker)} title="Background & Frame"
                            style={{ background: showColorPicker ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: 'var(--text-muted)', padding: '8px', cursor: 'pointer', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', WebkitAppRegion: 'no-drag' } as any}>
                            <Palette size={18} />
                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: backgroundSwatch, backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid rgba(255,255,255,0.2)' }} />
                        </button>
                        {showColorPicker && <BackgroundPicker backgroundColor={backgroundColor || '#000000'} setBackgroundColor={setBackgroundColor} videoPadding={videoPadding} setVideoPadding={setVideoPadding} />}
                    </div>
                )}

                {isCropping ? (
                    <div style={{ display: 'flex', gap: '10px', WebkitAppRegion: 'no-drag' } as any}>
                        <button onClick={onCancelCrop} style={{ background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-muted)', padding: '8px 16px', borderRadius: '100px', fontSize: '12px', cursor: 'pointer', WebkitAppRegion: 'no-drag' } as any}>Cancel</button>
                        <button onClick={onApplyCrop} style={{ background: 'var(--text-primary)', border: 'none', color: 'var(--bg-primary)', padding: '8px 24px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', WebkitAppRegion: 'no-drag' } as any}>Apply Crop</button>
                    </div>
                ) : (
                    <button onClick={onStartCropping} title="Crop Video" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', padding: '8px', cursor: 'pointer', borderRadius: '8px', WebkitAppRegion: 'no-drag' } as any}><Crop size={18} /></button>
                )}

                {onAutoPolish && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', WebkitAppRegion: 'no-drag' } as any}>
                        <button
                            onClick={autoPolishButtonDisabled ? undefined : onAutoPolish}
                            disabled={autoPolishButtonDisabled}
                            title={importedVideoLacksMetadata
                                ? 'Auto-Polish focus tracking is available only for ageofscreen recordings with cursor metadata'
                                : 'Auto-Polish: trim dead air, apply a cinematic frame, and add focus motion'}
                            style={{
                                WebkitAppRegion: 'no-drag',
                                background: !importedVideoLacksMetadata ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.08)',
                                border: !importedVideoLacksMetadata ? 'none' : '1px solid rgba(255,255,255,0.08)',
                                color: !importedVideoLacksMetadata ? '#111' : 'rgba(255,255,255,0.6)',
                                padding: '5px 10px',
                                cursor: autoPolishButtonDisabled ? 'not-allowed' : 'pointer',
                                borderRadius: '999px',
                                fontSize: '10px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                opacity: autoPolishButtonDisabled ? 0.7 : 1,
                                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                                boxShadow: !importedVideoLacksMetadata ? '0 2px 10px rgba(255,255,255,0.08)' : 'none',
                                lineHeight: 1,
                            } as any}
                            onMouseEnter={(e) => {
                                if (!autoPolishButtonDisabled && !importedVideoLacksMetadata) {
                                    e.currentTarget.style.background = '#ffffff';
                                    e.currentTarget.style.transform = 'scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(255,255,255,0.15)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!autoPolishButtonDisabled && !importedVideoLacksMetadata) {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.95)';
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = '0 2px 12px rgba(255,255,255,0.1)';
                                }
                            }}
                            onMouseDown={(e) => {
                                if (!autoPolishButtonDisabled && !importedVideoLacksMetadata) e.currentTarget.style.transform = 'scale(0.98)';
                            }}
                            onMouseUp={(e) => {
                                if (!autoPolishButtonDisabled && !importedVideoLacksMetadata) e.currentTarget.style.transform = 'scale(1.02)';
                            }}
                        >
                            <Sparkles size={11} strokeWidth={2.5} color={!importedVideoLacksMetadata ? '#111' : 'rgba(255,255,255,0.7)'} />
                            <span>{isAutoPolishing ? 'Polishing...' : 'Auto-Polish'}</span>
                        </button>
                    </div>
                )}

                <div style={{ width: '1px', height: '20px', background: 'var(--border-light)' }} />

                <div ref={colorGradeRef} style={{ position: 'relative', WebkitAppRegion: 'no-drag' } as any}>
                    <button onClick={() => setShowColorGrade(!showColorGrade)} title="Cinematic Color Grading"
                        style={{ background: colorGrade !== 'none' || showColorGrade ? 'rgba(59,130,246,0.15)' : 'transparent', border: '1px solid ' + (colorGrade !== 'none' ? 'rgba(59,130,246,0.4)' : 'transparent'), color: colorGrade !== 'none' ? '#60a5fa' : 'var(--text-muted)', padding: '8px', cursor: 'pointer', borderRadius: '8px', WebkitAppRegion: 'no-drag', display: 'flex', alignItems: 'center', transition: 'all 0.2s' } as any}>
                        <Wand2 size={18} />
                    </button>
                    {showColorGrade && (
                        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'rgba(26,26,31,0.95)', backdropFilter: 'blur(30px)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: 'var(--shadow-lg)', padding: '8px', zIndex: 2147483647, width: '160px', WebkitAppRegion: 'no-drag' } as any}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '4px 8px 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Color Grading</div>
                            {[
                                { id: 'none', label: 'Original' },
                                { id: 'nordic_cold', label: 'Nordic Cold' },
                                { id: 'vibrant_pop', label: 'Vibrant Pop' },
                                { id: 'moody_teal', label: 'Moody Teal' },
                                { id: 'vintage_film', label: 'Vintage Film' },
                                { id: 'studio_clean', label: 'Studio Clean' }
                            ].map(grade => (
                                <button key={grade.id} onClick={() => { setColorGrade(grade.id as ColorGradePreset); setShowColorGrade(false); }}
                                    style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: colorGrade === grade.id ? 'rgba(59,130,246,0.15)' : 'transparent', border: 'none', color: colorGrade === grade.id ? '#60a5fa' : 'var(--text-primary)', fontSize: '12px', cursor: 'pointer', borderRadius: '6px', transition: 'background 0.15s' }}>
                                    {grade.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div ref={playbackSpeedRef} style={{ position: 'relative', WebkitAppRegion: 'no-drag' } as any}>
                    <button
                        onClick={() => setShowPlaybackSpeed(!showPlaybackSpeed)}
                        title="Preview playback speed"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '0 12px',
                            height: '34px',
                            borderRadius: '999px',
                            border: '1px solid ' + (showPlaybackSpeed ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)'),
                            background: showPlaybackSpeed ? 'rgba(59,130,246,0.15)' : 'rgba(12,16,26,0.62)',
                            color: showPlaybackSpeed ? '#60a5fa' : 'var(--text-primary)',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            WebkitAppRegion: 'no-drag'
                        } as any}
                    >
                        <Activity size={14} color={showPlaybackSpeed ? '#60a5fa' : "rgba(255,255,255,0.6)"} />
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>{playbackSpeed}x</span>
                        <ChevronDown size={12} style={{ opacity: 0.5, transform: showPlaybackSpeed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </button>

                    {showPlaybackSpeed && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: '8px',
                            background: 'rgba(26,26,31,0.95)',
                            backdropFilter: 'blur(30px)',
                            borderRadius: '12px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            boxShadow: 'var(--shadow-lg)',
                            padding: '8px',
                            zIndex: 2147483647,
                            width: '120px',
                            WebkitAppRegion: 'no-drag'
                        } as any}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '4px 10px 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Speed</div>
                            {[0.75, 1, 1.25, 1.5, 2].map(speed => (
                                <button
                                    key={speed}
                                    onClick={() => { setPlaybackSpeed(speed); setShowPlaybackSpeed(false); }}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '8px 12px',
                                        background: playbackSpeed === speed ? 'rgba(59,130,246,0.15)' : 'transparent',
                                        border: 'none',
                                        color: playbackSpeed === speed ? '#60a5fa' : 'var(--text-primary)',
                                        fontSize: '12px',
                                        fontWeight: playbackSpeed === speed ? 600 : 400,
                                        cursor: 'pointer',
                                        borderRadius: '6px',
                                        transition: 'background 0.15s',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                    <span>{speed}x</span>
                                    {playbackSpeed === speed && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#60a5fa' }} />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div ref={exportMenuRef} style={{ position: 'relative' }}>
                    <style>{`@keyframes ageofscreen-spin { to { transform: rotate(360deg); } }`}</style>
                    <button onClick={() => setShowExports(!showExports)} disabled={isExporting}
                        style={{ background: isExporting ? 'rgba(59,130,246,0.15)' : 'var(--accent)', color: isExporting ? '#60a5fa' : 'white', padding: '8px 20px', borderRadius: '100px', border: isExporting ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent', fontSize: '12px', fontWeight: 600, cursor: isExporting ? 'not-allowed' : 'pointer', transition: 'all 0.2s', boxShadow: isExporting ? 'none' : '0 4px 12px var(--accent-glow)', display: 'flex', alignItems: 'center', gap: '8px', WebkitAppRegion: 'no-drag' } as any}>
                        {isExporting ? (
                            <>
                                <span>{`Exporting ${Math.max(0, Math.min(100, Math.round(exportProgress)))}%`}</span>
                                <Loader2 size={14} style={{ animation: 'ageofscreen-spin 1s linear infinite' }} />
                            </>
                        ) : (
                            <>
                                <span>Export</span>
                                <ChevronDown size={14} style={{ transform: showExports ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                            </>
                        )}
                    </button>
                    {showExports && (
                        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'rgba(26,26,31,0.98)', backdropFilter: 'blur(30px)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: 'var(--shadow-lg)', padding: '8px', zIndex: 2147483647, width: '220px', WebkitAppRegion: 'no-drag' } as any}>
                            <div
                                style={{
                                    margin: '0 4px 8px',
                                    padding: '10px 12px',
                                    borderRadius: '10px',
                                    background: 'rgba(59,130,246,0.08)',
                                    border: '1px solid rgba(96,165,250,0.18)',
                                    color: '#dbeafe',
                                    fontSize: '11px',
                                    lineHeight: 1.45,
                                }}
                            >
                                Exports include a subtle ageofscreen watermark.
                            </div>
                            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 8px 8px 8px' }} />
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '8px 12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Quality</div>
                            <div style={{ padding: '0 8px 8px 8px' }}>
                                <select
                                    value={exportQuality}
                                    onChange={(e) => setExportQuality(e.target.value as ExportQuality)}
                                    style={{
                                        width: '100%',
                                        background: '#1a1b21',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        color: 'var(--text-primary)',
                                        padding: '8px 10px',
                                        borderRadius: '8px',
                                        fontSize: '12px',
                                        outline: 'none',
                                        cursor: 'pointer',
                                        colorScheme: 'dark',
                                        WebkitAppearance: 'none',
                                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m3 5 3 3 3-3'/%3E%3C/svg%3E")`,
                                        backgroundRepeat: 'no-repeat',
                                        backgroundPosition: 'right 10px center',
                                    }}
                                >
                                    <option value="fast" style={{ background: '#1a1a1f', color: '#f8fafc' }}>Fast (quickest export)</option>
                                    <option value="balanced" style={{ background: '#1a1a1f', color: '#f8fafc' }}>Balanced</option>
                                    <option value="high" disabled style={{ background: '#1a1a1f', color: '#64748b' }}>High (coming later)</option>
                                </select>
                            </div>
                            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 8px 8px 8px' }} />
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '8px 12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Select Format</div>
                            {platformPresets.map(preset => {
                                const Icon = preset.icon || Monitor;
                                return (
                                    <button key={preset.id} onClick={() => { setSelectedPlatform(preset.id); setShowExports(false); setTimeout(() => onExport(preset.id), 50); }}
                                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', background: selectedPlatform === preset.id ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '12px', transition: 'background 0.15s', textAlign: 'left' }}>
                                        <Icon size={14} />
                                        <div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>{preset.name}</div><div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{preset.dimensions}</div></div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div style={{ width: '12px' }} />
                <WindowControls isMaximized={isMaximized} onMaximize={onMaximize} onMinimize={onMinimize} onClose={onClose} />
            </div>
        </div>
    );
});




