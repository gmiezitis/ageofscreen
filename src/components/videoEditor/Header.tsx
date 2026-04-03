import React, { useState, useRef, useEffect } from 'react';
import { PanelLeft, Monitor, Palette, Undo2, Redo2, ChevronDown, Sparkles, Crop, Wand2, Mic2, Activity, Loader2, Crown, Lock, MousePointer2 } from 'lucide-react';
import {
    ExportQuality,
    PlatformPreset,
    ColorGradePreset,
    SmartTrackingProfile,
    CursorHighlightSettings,
    CURSOR_HIGHLIGHT_MAX_OPACITY,
    CURSOR_HIGHLIGHT_MAX_SIZE,
    CURSOR_HIGHLIGHT_MIN_OPACITY,
    CURSOR_HIGHLIGHT_MIN_SIZE,
    normalizeCursorHighlightSettings,
} from '../../videoEditor/types';
import { BackgroundPicker } from './BackgroundPicker';
import { WindowControls } from './WindowControls';
import { resolveBackgroundCSS } from '../../videoEditor/effectMath';
import type { EntitlementState, UpgradeSource } from '../../shared/licensing';

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
    onExport: () => void;
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
    cursorHighlight: CursorHighlightSettings;
    setCursorHighlight: (settings: CursorHighlightSettings) => void;
    hasRecordingMetadata: boolean;
    canRenderCursorHighlight?: boolean;
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

const DEFAULT_ENTITLEMENT_STATE: EntitlementState = {
    tier: 'free',
    maxRecordingSeconds: 180,
    watermarkEnabled: true,
    canUseAutoPolish: false,
    canUseStudioVoice: false,
    purchaseAvailable: false,
    provider: 'manual',
    lastSyncAt: null,
};

const PURCHASE_MESSAGES: Record<UpgradeSource, string> = {
    generic: 'Upgrade to Pro to unlock premium editing features.',
    recording_limit: 'Upgrade to Pro for unlimited screen recording.',
    auto_polish: 'Upgrade to Pro to unlock Auto-Polish.',
    studio_voice: 'Upgrade to Pro to unlock Studio Voice.',
    export_watermark: 'Upgrade to Pro to remove the export watermark.',
};

const renderCursorHighlightPreview = (
    color: string,
    opacity: number,
    size = 18,
): React.ReactNode => {
    const safeOpacity = Math.max(0.18, Math.min(1, opacity));
    const glowBoxShadow = [
        `0 0 ${Math.max(8, Math.round(size * 0.7))}px ${color}44`,
        `0 0 ${Math.max(14, Math.round(size * 1.1))}px ${color}22`,
    ].join(', ');

    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: `radial-gradient(circle at 38% 34%, rgba(255,255,255,0.62), ${color} ${Math.max(42, Math.round(safeOpacity * 100))}%, transparent 82%)`,
                opacity: safeOpacity,
                boxShadow: glowBoxShadow,
                filter: 'saturate(1.05)',
            }}
        />
    );
};

export const Header: React.FC<HeaderProps> = React.memo(({
    mediaType, mediaName, isSidebarCollapsed, setIsSidebarCollapsed,
    selectedPlatform, setSelectedPlatform, platformPresets,
    isMaximized, onMaximize, onMinimize, onExport, onAutoPolish, onClose,
    isExporting, exportProgress = 0, isAutoPolishing = false, isCropping, onStartCropping, onApplyCrop, onCancelCrop,
    backgroundColor, setBackgroundColor, videoPadding = 0, setVideoPadding,
    cursorHighlight, setCursorHighlight, hasRecordingMetadata, canRenderCursorHighlight = true,
    onUndo, onRedo, canUndo, canRedo,
    exportQuality, setExportQuality,
    colorGrade, setColorGrade,
    premiumVoice, setPremiumVoice,
    playbackSpeed, setPlaybackSpeed,
    autoPolishTrackingProfile: _autoPolishTrackingProfile, setAutoPolishTrackingProfile: _setAutoPolishTrackingProfile,
}) => {
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showExports, setShowExports] = useState(false);
    const [showColorGrade, setShowColorGrade] = useState(false);
    const [showCursorHighlight, setShowCursorHighlight] = useState(false);
    const [entitlementState, setEntitlementState] = useState<EntitlementState>(DEFAULT_ENTITLEMENT_STATE);
    const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
    const [purchasePending, setPurchasePending] = useState(false);
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const colorGradeRef = useRef<HTMLDivElement>(null);
    const cursorHighlightRef = useRef<HTMLDivElement>(null);
    const exportMenuRef = useRef<HTMLDivElement>(null);
    const backgroundSwatch = resolveBackgroundCSS(backgroundColor || '#000000');
    const api = (window as any).videoEditorAPI;
    const isProUser = entitlementState.tier === 'pro';
    const canPurchasePro = entitlementState.purchaseAvailable;
    const canUseAutoPolish = entitlementState.canUseAutoPolish;
    const canUseStudioVoice = entitlementState.canUseStudioVoice;
    const normalizedCursorHighlight = normalizeCursorHighlightSettings(cursorHighlight);

    useEffect(() => {
        if (!showColorPicker && !showColorGrade && !showCursorHighlight && !showExports) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) setShowColorPicker(false);
            if (colorGradeRef.current && !colorGradeRef.current.contains(e.target as Node)) setShowColorGrade(false);
            if (cursorHighlightRef.current && !cursorHighlightRef.current.contains(e.target as Node)) setShowCursorHighlight(false);
            if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setShowExports(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showColorPicker, showColorGrade, showCursorHighlight, showExports]);

    useEffect(() => {
        let cancelled = false;

        api?.license?.getState?.()
            ?.then((state: EntitlementState) => {
                if (!cancelled && state) setEntitlementState(state);
            })
            ?.catch(() => { });

        const cleanup = api?.license?.onChanged?.((state: EntitlementState) => {
            if (!cancelled && state) setEntitlementState(state);
        });

        return () => {
            cancelled = true;
            cleanup?.();
        };
    }, [api]);

    useEffect(() => {
        if (!purchaseMessage) return;
        const timer = window.setTimeout(() => setPurchaseMessage(null), 4200);
        return () => window.clearTimeout(timer);
    }, [purchaseMessage]);

    const undoRedoStyle = (enabled: boolean): any => ({
        background: 'transparent', border: 'none', padding: '8px', borderRadius: '8px', cursor: enabled ? 'pointer' : 'not-allowed',
        color: enabled ? 'var(--text-secondary)' : 'var(--text-muted)', opacity: enabled ? 1 : 0.4, transition: 'opacity 0.2s', WebkitAppRegion: 'no-drag',
    });

    const purchasePro = async (source: UpgradeSource) => {
        if (purchasePending) return;
        setPurchasePending(true);

        try {
            const result = await api?.license?.purchasePro?.(source);
            if (result?.state) {
                setEntitlementState(result.state);
            }
            setPurchaseMessage(result?.message || PURCHASE_MESSAGES[source]);
        } catch (error) {
            setPurchaseMessage((error as Error).message || PURCHASE_MESSAGES[source]);
        } finally {
            setPurchasePending(false);
        }
    };

    const importedVideoLacksMetadata = mediaType === 'video' && !hasRecordingMetadata;
    const autoPolishButtonDisabled = isAutoPolishing || isExporting || !canUseAutoPolish || importedVideoLacksMetadata;
    const studioVoiceButtonDisabled = !canUseStudioVoice;
    const cursorHighlightButtonDisabled = !hasRecordingMetadata || !canRenderCursorHighlight;
    const cursorHighlightTitle = !hasRecordingMetadata
        ? 'Cursor highlight is available only for videos with cursor metadata'
        : 'Cursor Highlight';
    const updateCursorHighlight = (updates: Partial<CursorHighlightSettings>) => {
        setCursorHighlight(normalizeCursorHighlightSettings({
            ...cursorHighlight,
            ...updates,
        }));
    };

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

                <div ref={cursorHighlightRef} style={{ position: 'relative', WebkitAppRegion: 'no-drag' } as any}>
                    <button
                        onClick={() => {
                            if (!cursorHighlightButtonDisabled) {
                                setShowCursorHighlight(!showCursorHighlight);
                            }
                        }}
                        disabled={cursorHighlightButtonDisabled}
                        title={cursorHighlightTitle}
                        style={{
                            background: normalizedCursorHighlight.enabled || showCursorHighlight ? 'rgba(245,158,11,0.14)' : 'transparent',
                            border: '1px solid ' + ((normalizedCursorHighlight.enabled || showCursorHighlight) ? 'rgba(245,158,11,0.36)' : 'transparent'),
                            color: cursorHighlightButtonDisabled ? 'rgba(255,255,255,0.35)' : (normalizedCursorHighlight.enabled ? '#fbbf24' : 'var(--text-muted)'),
                            padding: '8px',
                            cursor: cursorHighlightButtonDisabled ? 'not-allowed' : 'pointer',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            WebkitAppRegion: 'no-drag',
                            opacity: cursorHighlightButtonDisabled ? 0.7 : 1,
                        } as any}
                    >
                        <MousePointer2 size={18} />
                        <div style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {renderCursorHighlightPreview(
                                normalizedCursorHighlight.color,
                                normalizedCursorHighlight.enabled ? Math.max(0.34, normalizedCursorHighlight.opacity) : 0.24,
                                14,
                            )}
                        </div>
                    </button>
                    {showCursorHighlight && (
                        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'rgba(26,26,31,0.96)', backdropFilter: 'blur(28px)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'var(--shadow-lg)', padding: '10px', zIndex: 2147483647, width: '228px', display: 'grid', gap: '10px', WebkitAppRegion: 'no-drag' } as any}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                <div style={{ display: 'grid', gap: '3px' }}>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cursor Highlight</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Soft glow around the recorded cursor.</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => updateCursorHighlight({ enabled: !normalizedCursorHighlight.enabled })}
                                    style={{
                                        border: '1px solid ' + (normalizedCursorHighlight.enabled ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.12)'),
                                        background: normalizedCursorHighlight.enabled ? 'rgba(34,197,94,0.16)' : 'rgba(255,255,255,0.05)',
                                        color: normalizedCursorHighlight.enabled ? '#86efac' : 'var(--text-primary)',
                                        padding: '7px 11px',
                                        borderRadius: '999px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        flexShrink: 0,
                                    }}
                                >
                                    {normalizedCursorHighlight.enabled ? 'On' : 'Off'}
                                </button>
                            </div>

                            <div style={{ display: 'grid', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Color</span>
                                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{normalizedCursorHighlight.color.toUpperCase()}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: '8px', alignItems: 'center' }}>
                                    <input type="color" value={normalizedCursorHighlight.color} onChange={(e) => updateCursorHighlight({ color: e.target.value })} style={{ width: 44, height: 36, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', background: 'transparent', padding: 0 }} />
                                    <div style={{ display: 'grid', gap: '8px' }}>
                                        <div style={{ display: 'grid', gap: '6px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                <span>Size</span>
                                                <span>{normalizedCursorHighlight.size}%</span>
                                            </div>
                                            <input type="range" min={CURSOR_HIGHLIGHT_MIN_SIZE} max={CURSOR_HIGHLIGHT_MAX_SIZE} step="0.5" value={normalizedCursorHighlight.size} onChange={(e) => updateCursorHighlight({ size: Number(e.target.value) })} />
                                        </div>
                                        <div style={{ display: 'grid', gap: '6px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                <span>Opacity</span>
                                                <span>{Math.round(normalizedCursorHighlight.opacity * 100)}%</span>
                                            </div>
                                            <input type="range" min={CURSOR_HIGHLIGHT_MIN_OPACITY} max={CURSOR_HIGHLIGHT_MAX_OPACITY} step="0.01" value={normalizedCursorHighlight.opacity} onChange={(e) => updateCursorHighlight({ opacity: Number(e.target.value) })} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ width: '1px', height: '20px', background: 'var(--border-light)' }} />

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
                            onClick={canUseAutoPolish ? onAutoPolish : undefined}
                            disabled={autoPolishButtonDisabled}
                            title={importedVideoLacksMetadata
                                ? 'Auto-Polish focus tracking is available only for ageofscreen recordings with cursor metadata'
                                : canUseAutoPolish
                                    ? 'Auto-Polish: trim dead air, apply a clean frame, enhance voice, and add focus motion'
                                    : 'Auto-Polish is a Pro feature'}
                            style={{
                                WebkitAppRegion: 'no-drag',
                                background: (canUseAutoPolish && !importedVideoLacksMetadata) ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.08)',
                                border: (canUseAutoPolish && !importedVideoLacksMetadata) ? 'none' : '1px solid rgba(255,255,255,0.08)',
                                color: (canUseAutoPolish && !importedVideoLacksMetadata) ? '#111' : 'rgba(255,255,255,0.6)',
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
                                boxShadow: (canUseAutoPolish && !importedVideoLacksMetadata) ? '0 2px 10px rgba(255,255,255,0.08)' : 'none',
                                lineHeight: 1,
                            } as any}
                            onMouseEnter={(e) => {
                                if (!autoPolishButtonDisabled && canUseAutoPolish && !importedVideoLacksMetadata) {
                                    e.currentTarget.style.background = '#ffffff';
                                    e.currentTarget.style.transform = 'scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(255,255,255,0.15)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!autoPolishButtonDisabled && canUseAutoPolish && !importedVideoLacksMetadata) {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.95)';
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = '0 2px 12px rgba(255,255,255,0.1)';
                                }
                            }}
                            onMouseDown={(e) => {
                                if (!autoPolishButtonDisabled && canUseAutoPolish && !importedVideoLacksMetadata) e.currentTarget.style.transform = 'scale(0.98)';
                            }}
                            onMouseUp={(e) => {
                                if (!autoPolishButtonDisabled && canUseAutoPolish && !importedVideoLacksMetadata) e.currentTarget.style.transform = 'scale(1.02)';
                            }}
                        >
                            <Sparkles size={11} strokeWidth={2.5} color={(canUseAutoPolish && !importedVideoLacksMetadata) ? '#111' : 'rgba(255,255,255,0.7)'} />
                            <span>{isAutoPolishing ? 'Polishing...' : 'Auto-Polish'}</span>
                            {(!canUseAutoPolish || importedVideoLacksMetadata) && <Lock size={10} />}
                        </button>
                        {!canUseAutoPolish && canPurchasePro && (
                            <button
                                type="button"
                                onClick={() => void purchasePro('auto_polish')}
                                disabled={purchasePending}
                                style={{
                                    border: '1px solid rgba(250,204,21,0.22)',
                                    background: 'rgba(250,204,21,0.12)',
                                    color: '#fde68a',
                                    padding: '6px 10px',
                                    borderRadius: '999px',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    cursor: purchasePending ? 'wait' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    WebkitAppRegion: 'no-drag',
                                } as any}
                            >
                                <Crown size={11} />
                                Upgrade
                            </button>
                        )}
                    </div>
                )}

                <div style={{ width: '1px', height: '20px', background: 'var(--border-light)' }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', WebkitAppRegion: 'no-drag' } as any}>
                    <button
                        onClick={canUseStudioVoice ? () => setPremiumVoice(!premiumVoice) : undefined}
                        disabled={studioVoiceButtonDisabled}
                        title={canUseStudioVoice ? 'Studio Voice: Enhance dialogue and remove background noise' : 'Studio Voice is a Pro feature'}
                        style={{
                            background: premiumVoice && canUseStudioVoice ? 'rgba(234,88,12,0.15)' : 'transparent',
                            border: '1px solid ' + (premiumVoice && canUseStudioVoice ? 'rgba(234,88,12,0.4)' : studioVoiceButtonDisabled ? 'rgba(255,255,255,0.08)' : 'transparent'),
                            color: premiumVoice && canUseStudioVoice ? '#f97316' : studioVoiceButtonDisabled ? 'rgba(255,255,255,0.45)' : 'var(--text-muted)',
                            padding: '8px',
                            cursor: studioVoiceButtonDisabled ? 'not-allowed' : 'pointer',
                            borderRadius: '8px',
                            WebkitAppRegion: 'no-drag',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'all 0.2s',
                            opacity: studioVoiceButtonDisabled ? 0.8 : 1,
                            gap: '4px',
                        } as any}
                    >
                        <Mic2 size={18} />
                        {studioVoiceButtonDisabled && <Lock size={10} />}
                    </button>
                    {!canUseStudioVoice && canPurchasePro && (
                        <button
                            type="button"
                            onClick={() => void purchasePro('studio_voice')}
                            disabled={purchasePending}
                            style={{
                                border: '1px solid rgba(250,204,21,0.22)',
                                background: 'rgba(250,204,21,0.12)',
                                color: '#fde68a',
                                padding: '6px 10px',
                                borderRadius: '999px',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: purchasePending ? 'wait' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                WebkitAppRegion: 'no-drag',
                            } as any}
                        >
                            <Crown size={11} />
                            Upgrade
                        </button>
                    )}
                </div>

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

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 10px', height: '34px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(12,16,26,0.62)', WebkitAppRegion: 'no-drag' } as any}>
                    <Activity size={14} color="rgba(255,255,255,0.6)" />
                    <select
                        value={playbackSpeed}
                        onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                        title="Preview playback speed"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                            fontWeight: 600,
                            outline: 'none',
                            cursor: 'pointer',
                            colorScheme: 'dark',
                            WebkitAppearance: 'none',
                            paddingRight: '14px',
                        }}
                    >
                        <option value={0.75} style={{ background: '#141821', color: '#f8fafc' }}>0.75x</option>
                        <option value={1} style={{ background: '#141821', color: '#f8fafc' }}>1x</option>
                        <option value={1.25} style={{ background: '#141821', color: '#f8fafc' }}>1.25x</option>
                        <option value={1.5} style={{ background: '#141821', color: '#f8fafc' }}>1.5x</option>
                        <option value={2} style={{ background: '#141821', color: '#f8fafc' }}>2x</option>
                    </select>
                </div>

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '0 12px',
                        height: '34px',
                        borderRadius: '999px',
                        background: isProUser ? 'rgba(34,197,94,0.12)' : 'rgba(250,204,21,0.12)',
                        border: isProUser ? '1px solid rgba(34,197,94,0.18)' : '1px solid rgba(250,204,21,0.22)',
                        color: isProUser ? '#bbf7d0' : '#fde68a',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        WebkitAppRegion: 'no-drag',
                    } as any}
                >
                    <Crown size={12} />
                    {isProUser ? 'Pro Active' : 'Free Plan'}
                </div>

                {purchaseMessage && (
                    <div
                        style={{
                            maxWidth: 220,
                            padding: '8px 12px',
                            borderRadius: '999px',
                            background: 'rgba(15,23,42,0.72)',
                            border: '1px solid rgba(148,163,184,0.18)',
                            color: '#e2e8f0',
                            fontSize: '11px',
                            lineHeight: 1.4,
                            WebkitAppRegion: 'no-drag',
                        } as any}
                    >
                        {purchaseMessage}
                    </div>
                )}

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
                            {!isProUser && (
                                <>
                                    <div
                                        style={{
                                            margin: '0 4px 8px',
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            background: 'rgba(250,204,21,0.08)',
                                            border: '1px solid rgba(250,204,21,0.18)',
                                            display: 'grid',
                                            gap: '8px',
                                        }}
                                    >
                                        <div style={{ fontSize: '10px', color: '#fde68a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            Free export
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#e2e8f0', lineHeight: 1.45 }}>
                                            Exports include a ageofscreen watermark. Upgrade to remove it.
                                        </div>
                                        {canPurchasePro ? (
                                            <button
                                                type="button"
                                                onClick={() => void purchasePro('export_watermark')}
                                                disabled={purchasePending}
                                                style={{
                                                    border: '1px solid rgba(250,204,21,0.22)',
                                                    background: 'rgba(250,204,21,0.14)',
                                                    color: '#fde68a',
                                                    padding: '8px 10px',
                                                    borderRadius: '999px',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    cursor: purchasePending ? 'wait' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '6px',
                                                }}
                                            >
                                                <Crown size={12} />
                                                Remove Watermark
                                            </button>
                                        ) : (
                                            <div style={{ fontSize: '11px', color: '#cbd5e1', lineHeight: 1.45 }}>
                                                Pro unlock is not available in this build yet.
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 8px 8px 8px' }} />
                                </>
                            )}
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
                                    <option value="high" style={{ background: '#1a1a1f', color: '#f8fafc' }}>High (best clarity)</option>
                                </select>
                            </div>
                            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 8px 8px 8px' }} />
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '8px 12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Select Format</div>
                            {platformPresets.map(preset => {
                                const Icon = preset.icon || Monitor;
                                return (
                                    <button key={preset.id} onClick={() => { setSelectedPlatform(preset.id); setShowExports(false); setTimeout(onExport, 50); }}
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




