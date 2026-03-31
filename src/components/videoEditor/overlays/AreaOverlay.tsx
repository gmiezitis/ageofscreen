import React, { useRef, useState, useCallback, useEffect } from 'react';
import { ZoomArea } from '../../../videoEditor/types';

interface Props {
    area: ZoomArea;
    canEdit: boolean;
    onUpdate?: (area: ZoomArea) => void;
    onClick?: () => void;
    hint: string;
    borderColor?: string;
}

const AreaOverlay: React.FC<Props> = ({ area, canEdit, onUpdate, onClick, hint, borderColor = 'var(--accent)' }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [drawing, setDrawing] = useState(false);
    const [rect, setRect] = useState<ZoomArea | null>(null);
    const origin = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

    const toPercent = useCallback((cx: number, cy: number) => {
        const el = ref.current;
        if (!el) return { x: 50, y: 50 };
        const r = el.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(100, ((cx - r.left) / r.width) * 100)),
            y: Math.max(0, Math.min(100, ((cy - r.top) / r.height) * 100))
        };
    }, []);

    const onDown = useCallback((e: React.MouseEvent) => {
        if (!canEdit || !onUpdate) { onClick?.(); return; }
        e.preventDefault(); e.stopPropagation();
        const pt = toPercent(e.clientX, e.clientY);
        origin.current = { x: pt.x, y: pt.y, cx: e.clientX, cy: e.clientY };
        setDrawing(true);
        setRect({ x: pt.x, y: pt.y, width: 1, height: 1 });
    }, [canEdit, onUpdate, onClick, toPercent]);

    useEffect(() => {
        if (!drawing) return;
        const move = (e: MouseEvent) => {
            const o = origin.current;
            if (!o) return;
            const pt = toPercent(e.clientX, e.clientY);
            setRect({
                x: Math.min(o.x, pt.x), y: Math.min(o.y, pt.y),
                width: Math.max(2, Math.abs(pt.x - o.x)),
                height: Math.max(2, Math.abs(pt.y - o.y)),
            });
        };
        const up = (e: MouseEvent) => {
            const o = origin.current;
            const moved = o && (Math.abs(e.clientX - o.cx) > 5 || Math.abs(e.clientY - o.cy) > 5);
            setDrawing(false);
            setRect(prev => {
                if (!prev || !onUpdate) return null;
                if (!moved) onUpdate({ x: Math.max(0, prev.x - 20), y: Math.max(0, prev.y - 15), width: 40, height: 30 });
                else if (prev.width >= 5 && prev.height >= 5) onUpdate(prev);
                return null;
            });
            origin.current = null;
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, [drawing, onUpdate, toPercent]);

    const d = rect || area;
    const active = canEdit && !!onUpdate;
    const hasArea = d.width > 1 || d.height > 1 || drawing;

    return (
        <div ref={ref} style={{ position: 'absolute', inset: 0, zIndex: 30, pointerEvents: active ? 'auto' : 'none', cursor: active ? 'crosshair' : 'default' }} onMouseDown={onDown}>
            {hasArea && (
                <div style={{
                    position: 'absolute', left: `${d.x}%`, top: `${d.y}%`, width: `${d.width}%`, height: `${d.height}%`,
                    border: `3px dashed ${borderColor}`, borderRadius: 4,
                    boxShadow: `0 0 15px ${borderColor}88`,
                    background: 'rgba(255,255,255,0.05)',
                    pointerEvents: 'none',
                    transition: drawing ? 'none' : 'all 0.15s ease-out'
                }} />
            )}
            {active && !drawing && (
                <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', fontSize: 13, fontWeight: 500, color: '#fff', background: 'rgba(0,0,0,0.85)', padding: '8px 16px', borderRadius: 20, pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                    {hint}
                </div>
            )}
        </div>
    );
};

export default AreaOverlay;
