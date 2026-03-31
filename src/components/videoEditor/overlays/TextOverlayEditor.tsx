import React, { useMemo } from 'react';
import { GripHorizontal } from 'lucide-react';
import { createPortal } from 'react-dom';
import { TextOverlay } from '../../../videoEditor/types';
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

const buildPresetUpdates = (preset: 'plain' | 'box' | 'outline' | 'pill' | 'label'): Partial<TextOverlay> => {
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
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowOffsetY: 4,
            };
        case 'outline':
            return {
                backgroundColor: '#0f172a',
                backgroundOpacity: 0.18,
                padding: 16,
                borderWidth: 2,
                borderColor: '#f8fafc',
                borderRadius: 12,
                shadowColor: '#020617',
                shadowBlur: 14,
                shadowOffsetX: 0,
                shadowOffsetY: 6,
            };
        case 'pill':
            return {
                backgroundColor: '#0f172a',
                backgroundOpacity: 0.86,
                padding: 16,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.18)',
                borderRadius: 999,
                shadowColor: '#020617',
                shadowBlur: 18,
                shadowOffsetX: 0,
                shadowOffsetY: 8,
            };
        case 'label':
            return {
                backgroundColor: '#111827',
                backgroundOpacity: 0.92,
                padding: 12,
                borderWidth: 1,
                borderColor: '#22c55e',
                borderRadius: 8,
                shadowColor: '#020617',
                shadowBlur: 12,
                shadowOffsetX: 0,
                shadowOffsetY: 5,
            };
        case 'box':
        default:
            return {
                backgroundColor: '#0f172a',
                backgroundOpacity: 0.78,
                padding: 16,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.16)',
                borderRadius: 14,
                shadowColor: '#020617',
                shadowBlur: 18,
                shadowOffsetX: 0,
                shadowOffsetY: 6,
            };
    }
};

const presetButtonStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'white',
    borderRadius: 8,
    padding: '5px 8px',
    fontSize: 11,
    cursor: 'pointer',
};

const TextOverlayEditor: React.FC<Props> = ({ overlay, onEdit, onFocus, onBlur, containerRef, panelHostElement, panelStyle, panelLayout = 'floating' }) => {
    const panelContainerRef = useMemo(
        () => (panelHostElement
            ? ({ current: panelHostElement } as React.RefObject<HTMLElement | null>)
            : containerRef),
        [containerRef, panelHostElement],
    );
    const { panelRef, floatingStyle, startDrag } = useFloatingPanelPosition(panelContainerRef, panelStyle);
    const isDocked = panelLayout === 'leftDocked';

    const panel = (
        <div
            ref={panelRef}
            style={{
                position: 'absolute',
                top: 14,
                left: 14,
                zIndex: 90,
                width: 'min(320px, calc(100% - 28px))',
                padding: 12,
                display: 'grid',
                gap: 10,
                borderRadius: 14,
                background: 'rgba(15,23,42,0.82)',
                border: '1px solid rgba(255,255,255,0.10)',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 20px 48px rgba(2,6,23,0.34)',
                pointerEvents: 'auto',
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
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                color: 'rgba(226,232,240,0.78)',
                                borderRadius: 8,
                                padding: '4px 6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'grab',
                            }}
                        >
                            <GripHorizontal size={13} />
                        </button>
                    )}
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(226,232,240,0.78)' }}>
                        Text
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => onEdit(overlay.id, { fontWeight: overlay.fontWeight === 'bold' ? 'normal' : 'bold' })}
                    style={{
                        background: overlay.fontWeight === 'bold' ? 'rgba(34,197,94,0.92)' : 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.14)',
                        color: overlay.fontWeight === 'bold' ? '#052e16' : '#f8fafc',
                        borderRadius: 8,
                        padding: '5px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                >
                    B
                </button>
            </div>

            <textarea
                value={overlay.text}
                onChange={(e) => onEdit(overlay.id, { text: e.target.value })}
                onFocus={onFocus}
                onBlur={onBlur}
                placeholder="Overlay text"
                rows={2}
                style={{
                    width: '100%',
                    resize: 'none',
                    minHeight: 58,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'white',
                    borderRadius: 10,
                    padding: '10px 12px',
                    fontSize: 13,
                    lineHeight: 1.35,
                }}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                    { id: 'plain', label: 'Plain' },
                    { id: 'box', label: 'Box' },
                    { id: 'outline', label: 'Outline' },
                    { id: 'pill', label: 'Pill' },
                    { id: 'label', label: 'Label' },
                ].map((preset) => (
                    <button
                        key={preset.id}
                        type="button"
                        onClick={() => onEdit(overlay.id, buildPresetUpdates(preset.id as 'plain' | 'box' | 'outline' | 'pill' | 'label'))}
                        style={presetButtonStyle}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
                <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: 'rgba(255,255,255,0.6)' }}>Size</span>
                        <span style={{ color: 'white' }}>{overlay.fontSize}px</span>
                    </div>
                    <input
                        type="range"
                        min={12}
                        max={120}
                        value={overlay.fontSize}
                        onChange={(e) => onEdit(overlay.id, { fontSize: parseInt(e.target.value, 10) })}
                        className="overlay-range"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => onEdit(overlay.id, overlay.backgroundColor
                        ? { backgroundColor: undefined, backgroundOpacity: 0, padding: 0, borderWidth: 0, borderColor: undefined }
                        : { backgroundColor: '#0f172a', backgroundOpacity: 0.82, padding: 14, borderRadius: 12, borderWidth: 0 })}
                    style={{
                        background: overlay.backgroundColor ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        color: '#f8fafc',
                        borderRadius: 8,
                        padding: '6px 10px',
                        fontSize: 11,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {overlay.backgroundColor ? 'Fill On' : 'Fill Off'}
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: overlay.backgroundColor ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10 }}>
                <div style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Text</span>
                    <input
                        type="color"
                        value={overlay.color}
                        onChange={(e) => onEdit(overlay.id, { color: e.target.value })}
                        style={{ width: '100%', height: 30, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}
                    />
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fill</span>
                    <input
                        type="color"
                        value={overlay.backgroundColor || '#0f172a'}
                        onChange={(e) => onEdit(overlay.id, { backgroundColor: e.target.value, backgroundOpacity: overlay.backgroundOpacity ?? 0.82, padding: overlay.padding ?? 14, borderRadius: overlay.borderRadius ?? 12 })}
                        style={{ width: '100%', height: 30, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}
                    />
                </div>
                {overlay.backgroundColor && (
                    <div style={{ display: 'grid', gap: 4 }}>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Opacity</span>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={(overlay.backgroundOpacity ?? 0.82) * 100}
                            onChange={(e) => onEdit(overlay.id, { backgroundOpacity: parseInt(e.target.value, 10) / 100 })}
                        />
                    </div>
                )}
            </div>

            {overlay.backgroundColor && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                            <span style={{ color: 'rgba(255,255,255,0.6)' }}>Padding</span>
                            <span style={{ color: 'white' }}>{overlay.padding ?? 14}</span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={36}
                            value={overlay.padding ?? 14}
                            onChange={(e) => onEdit(overlay.id, { padding: parseInt(e.target.value, 10) })}
                        />
                    </div>
                    <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                            <span style={{ color: 'rgba(255,255,255,0.6)' }}>Roundness</span>
                            <span style={{ color: 'white' }}>{overlay.borderRadius ?? 12}</span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={999}
                            value={overlay.borderRadius ?? 12}
                            onChange={(e) => onEdit(overlay.id, { borderRadius: parseInt(e.target.value, 10) })}
                        />
                    </div>
                </div>
            )}
        </div>
    );

    return panelHostElement ? createPortal(panel, panelHostElement) : panel;
};

export default TextOverlayEditor;
