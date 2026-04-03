import React, { useMemo } from 'react';
import { GripHorizontal } from 'lucide-react';
import { createPortal } from 'react-dom';
import { TextOverlay } from '../../../videoEditor/types';
import { getTextOverlayFontFamily } from '../../../videoEditor/textOverlayRendering';
import { useFloatingPanelPosition } from './useFloatingPanelPosition';

interface Props {
    overlay: TextOverlay;
    onEdit: (id: string, updates: Partial<TextOverlay>) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    containerRef: React.RefObject<HTMLDivElement>;
    panelHostElement?: HTMLElement | null;
    panelStyle?: React.CSSProperties;
    panelLayout?: 'floating' | 'leftDocked';
}

type TextOverlayPreset = 'plain' | 'soft_box' | 'solid_box' | 'outline';

const PANEL_SURFACE = '#10243d';
const PANEL_FIELD = '#163252';
const PANEL_FIELD_STRONG = '#1b3b60';
const PANEL_EDGE = 'rgba(163, 201, 240, 0.16)';
const PANEL_TEXT_MUTED = 'rgba(224, 236, 251, 0.62)';

const buildPresetUpdates = (preset: TextOverlayPreset): Partial<TextOverlay> => {
    switch (preset) {
        case 'plain':
            return {
                backgroundColor: undefined,
                backgroundOpacity: 0,
                padding: 0,
                borderWidth: 0,
                borderColor: undefined,
                borderRadius: 0,
                shadowColor: '#020617',
                shadowBlur: 0,
                shadowOffsetX: 2,
                shadowOffsetY: 2,
            };
        case 'outline':
            return {
                backgroundColor: undefined,
                backgroundOpacity: 0,
                padding: 0,
                borderWidth: 2,
                borderColor: '#020617',
                borderRadius: 0,
                shadowColor: '#020617',
                shadowBlur: 0,
                shadowOffsetX: 2,
                shadowOffsetY: 2,
            };
        case 'soft_box':
            return {
                backgroundColor: '#0f172a',
                backgroundOpacity: 0.56,
                padding: 12,
                borderWidth: 0,
                borderColor: '#020617',
                borderRadius: 0,
                shadowColor: '#020617',
                shadowBlur: 0,
                shadowOffsetX: 2,
                shadowOffsetY: 2,
            };
        case 'solid_box':
        default:
            return {
                backgroundColor: '#111827',
                backgroundOpacity: 0.88,
                padding: 14,
                borderWidth: 0,
                borderColor: '#020617',
                borderRadius: 0,
                shadowColor: '#020617',
                shadowBlur: 0,
                shadowOffsetX: 2,
                shadowOffsetY: 2,
            };
    }
};

const sectionStyle: React.CSSProperties = {
    display: 'grid',
    gap: 6,
};

const controlSurfaceStyle: React.CSSProperties = {
    background: PANEL_FIELD,
    border: `1px solid ${PANEL_EDGE}`,
    color: 'white',
    borderRadius: 7,
};

const compactLabelStyle: React.CSSProperties = {
    fontSize: 10,
    color: PANEL_TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
};

const presetButtonStyle: React.CSSProperties = {
    background: 'transparent',
    border: `1px solid ${PANEL_EDGE}`,
    color: '#eef6ff',
    borderRadius: 7,
    padding: '3px 7px',
    fontSize: 9.5,
    cursor: 'pointer',
};

const sliderFieldStyle: React.CSSProperties = {
    display: 'grid',
    gap: 4,
    padding: '6px 7px',
    borderRadius: 7,
    background: PANEL_FIELD,
    border: `1px solid ${PANEL_EDGE}`,
};

const colorFieldStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '7px 9px',
    borderRadius: 7,
    background: PANEL_FIELD,
    border: `1px solid ${PANEL_EDGE}`,
    cursor: 'pointer',
};

const hiddenColorInputStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    opacity: 0,
    cursor: 'pointer',
};

const formatColorLabel = (value: string | undefined, fallback: string) => (
    (value || fallback).toUpperCase()
);

const getColorSwatchStyle = (value: string): React.CSSProperties => ({
    width: 18,
    height: 18,
    borderRadius: 7,
    background: value,
    border: '1px solid rgba(255,255,255,0.22)',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
    flexShrink: 0,
});

const TextOverlayEditor: React.FC<Props> = ({
    overlay,
    onEdit,
    onFocus,
    onBlur,
    containerRef,
    panelHostElement,
    panelStyle,
    panelLayout = 'floating',
}) => {
    const panelContainerRef = useMemo(
        () => (panelHostElement
            ? ({ current: panelHostElement } as React.RefObject<HTMLElement | null>)
            : containerRef),
        [containerRef, panelHostElement],
    );
    const { panelRef, floatingStyle, startDrag } = useFloatingPanelPosition(panelContainerRef, panelStyle);
    const isDocked = panelLayout === 'leftDocked';
    const hasFill = Boolean(overlay.backgroundColor);
    const hasStroke = (overlay.borderWidth ?? 0) > 0;

    const panel = (
        <div
            ref={panelRef}
            style={{
                position: 'absolute',
                top: 10,
                left: 10,
                zIndex: 90,
                width: 'min(258px, calc(100% - 20px))',
                maxHeight: 'calc(100% - 10px)',
                overflowY: 'auto',
                scrollbarGutter: 'stable both-edges',
                padding: 8,
                display: 'grid',
                gap: 6,
                borderRadius: 10,
                background: PANEL_SURFACE,
                border: `1px solid ${PANEL_EDGE}`,
                boxShadow: '0 8px 18px rgba(2,6,23,0.16)',
                pointerEvents: 'auto',
                boxSizing: 'border-box',
                ...(isDocked ? panelStyle : { ...panelStyle, ...floatingStyle }),
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {!isDocked && (
                        <button
                            type="button"
                            title="Drag text editor"
                            onMouseDown={startDrag}
                            onClick={(event) => event.preventDefault()}
                            style={{
                                background: 'transparent',
                                border: `1px solid ${PANEL_EDGE}`,
                                color: 'rgba(226,232,240,0.78)',
                                borderRadius: 7,
                                padding: '3px 6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'grab',
                            }}
                        >
                            <GripHorizontal size={13} />
                        </button>
                    )}
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(226,232,240,0.82)' }}>
                        Text
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => onEdit(overlay.id, { fontWeight: overlay.fontWeight === 'bold' ? 'normal' : 'bold' })}
                    style={{
                        background: overlay.fontWeight === 'bold' ? 'rgba(34,197,94,0.92)' : PANEL_FIELD_STRONG,
                        border: `1px solid ${PANEL_EDGE}`,
                        color: overlay.fontWeight === 'bold' ? '#052e16' : '#f8fafc',
                        borderRadius: 7,
                        padding: '4px 8px',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                >
                    B
                </button>
            </div>

            <div style={sectionStyle}>
                <textarea
                    value={overlay.text}
                    onChange={(event) => onEdit(overlay.id, { text: event.target.value })}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    placeholder="Overlay text"
                    rows={1}
                    style={{
                        width: '100%',
                        resize: 'none',
                        minHeight: 36,
                        ...controlSurfaceStyle,
                        padding: '7px 9px',
                        fontSize: 10.5,
                        lineHeight: 1.3,
                        fontFamily: getTextOverlayFontFamily(overlay),
                    }}
                />

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[
                        { id: 'plain', label: 'Plain' },
                        { id: 'solid_box', label: 'Solid' },
                        { id: 'outline', label: 'Outline' },
                    ].map((preset) => (
                        <button
                            key={preset.id}
                            type="button"
                            onClick={() => onEdit(overlay.id, buildPresetUpdates(preset.id as TextOverlayPreset))}
                            style={presetButtonStyle}
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ ...sectionStyle, gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 6 }}>
                <div style={sliderFieldStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: PANEL_TEXT_MUTED }}>Size</span>
                        <span style={{ color: 'white' }}>{overlay.fontSize}px</span>
                    </div>
                    <input
                        type="range"
                        min={12}
                        max={120}
                        value={overlay.fontSize}
                        onChange={(event) => onEdit(overlay.id, { fontSize: parseInt(event.target.value, 10) })}
                        className="overlay-range"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => onEdit(overlay.id, hasFill
                        ? { backgroundColor: undefined, backgroundOpacity: 0, padding: 0, borderRadius: 0 }
                        : { backgroundColor: '#0f172a', backgroundOpacity: 0.72, padding: 12, borderRadius: 0, borderWidth: overlay.borderWidth ?? 0, borderColor: overlay.borderColor ?? '#020617' })}
                    style={{
                        background: hasFill ? 'rgba(34,197,94,0.18)' : PANEL_FIELD_STRONG,
                        border: `1px solid ${PANEL_EDGE}`,
                        color: '#f8fafc',
                        borderRadius: 7,
                        padding: '4px 7px',
                        fontSize: 10,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {hasFill ? 'Fill On' : 'Fill Off'}
                </button>
            </div>

            <div style={{ ...sectionStyle, gridTemplateColumns: hasFill ? '1fr 1fr' : '1fr' }}>
                <label style={colorFieldStyle}>
                    <span style={compactLabelStyle}>Text</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, color: PANEL_TEXT_MUTED, fontFamily: 'monospace' }}>{formatColorLabel(overlay.color, '#FFFFFF')}</span>
                        <span style={getColorSwatchStyle(overlay.color || '#ffffff')} />
                    </span>
                    <input
                        type="color"
                        value={overlay.color}
                        onChange={(event) => onEdit(overlay.id, { color: event.target.value })}
                        style={hiddenColorInputStyle}
                    />
                </label>

                {hasFill && (
                    <label style={colorFieldStyle}>
                        <span style={compactLabelStyle}>Fill</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 10, color: PANEL_TEXT_MUTED, fontFamily: 'monospace' }}>{formatColorLabel(overlay.backgroundColor, '#0F172A')}</span>
                            <span style={getColorSwatchStyle(overlay.backgroundColor || '#0f172a')} />
                        </span>
                        <input
                            type="color"
                            value={overlay.backgroundColor || '#0f172a'}
                            onChange={(event) => onEdit(overlay.id, { backgroundColor: event.target.value, backgroundOpacity: overlay.backgroundOpacity ?? 0.72, padding: overlay.padding ?? 12, borderRadius: 0 })}
                            style={hiddenColorInputStyle}
                        />
                    </label>
                )}

                {hasStroke && (
                    <label style={{ ...colorFieldStyle, gridColumn: '1 / -1' }}>
                        <span style={compactLabelStyle}>Stroke</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 10, color: PANEL_TEXT_MUTED, fontFamily: 'monospace' }}>{formatColorLabel(overlay.borderColor, '#020617')}</span>
                            <span style={getColorSwatchStyle(overlay.borderColor || '#020617')} />
                        </span>
                        <input
                            type="color"
                            value={overlay.borderColor || '#020617'}
                            onChange={(event) => onEdit(overlay.id, { borderColor: event.target.value, borderWidth: Math.max(overlay.borderWidth ?? 0, 1) })}
                            style={hiddenColorInputStyle}
                        />
                    </label>
                )}
            </div>

            <div style={{ ...sectionStyle, gridTemplateColumns: '1fr 1fr' }}>
                <div style={sliderFieldStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: PANEL_TEXT_MUTED }}>Stroke</span>
                        <span style={{ color: 'white' }}>{overlay.borderWidth ?? 0}px</span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={8}
                        value={overlay.borderWidth ?? 0}
                        onChange={(event) => onEdit(overlay.id, { borderWidth: parseInt(event.target.value, 10) })}
                    />
                </div>

                {hasFill && (
                    <div style={sliderFieldStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                            <span style={{ color: PANEL_TEXT_MUTED }}>Fill Opacity</span>
                            <span style={{ color: 'white' }}>{Math.round((overlay.backgroundOpacity ?? 0.72) * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round((overlay.backgroundOpacity ?? 0.72) * 100)}
                            onChange={(event) => onEdit(overlay.id, { backgroundOpacity: parseInt(event.target.value, 10) / 100 })}
                        />
                    </div>
                )}

                {hasFill && (
                    <div style={{ ...sliderFieldStyle, gridColumn: '1 / -1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                            <span style={{ color: PANEL_TEXT_MUTED }}>Padding</span>
                            <span style={{ color: 'white' }}>{overlay.padding ?? 12}px</span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={36}
                            value={overlay.padding ?? 12}
                            onChange={(event) => onEdit(overlay.id, { padding: parseInt(event.target.value, 10) })}
                        />
                    </div>
                )}
            </div>
        </div>
    );

    return panelHostElement ? createPortal(panel, panelHostElement) : panel;
};

export default TextOverlayEditor;
