import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import { TextOverlay } from '../../../videoEditor/types';
import { getTextOverlayFontFamily, renderTextOverlaySprite } from '../../../videoEditor/textOverlayRendering';

interface Props {
    tov: TextOverlay;
    isSelected: boolean;
    disabled?: boolean;
    onSelect: () => void;
    onMove: (x: number, y: number) => void;
    onMoveEnd?: () => void;
    visualFilter?: string;
    maxWidth?: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const hexToRgba = (color: string, alpha: number): string => {
    const hex = color.trim().replace('#', '');
    if (hex.length !== 6) {
        return color;
    }

    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha).toFixed(3)})`;
};

const TextOverlayDraggable: React.FC<Props> = ({
    tov,
    isSelected,
    disabled = false,
    onSelect,
    onMove,
    onMoveEnd,
    visualFilter,
    maxWidth,
}) => {
    const onMoveRef = useRef(onMove);
    const onSelectRef = useRef(onSelect);
    const onMoveEndRef = useRef(onMoveEnd);
    useEffect(() => { onMoveRef.current = onMove; }, [onMove]);
    useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
    useEffect(() => { onMoveEndRef.current = onMoveEnd; }, [onMoveEnd]);

    const hasBackground = Boolean(
        tov.backgroundColor
        && (tov.backgroundOpacity ?? 0) > 0
        && (tov.padding ?? 0) > 0,
    );
    const strokeWidth = Math.max(0, Math.round(tov.borderWidth ?? 0));
    const shadowOffsetX = Math.round(tov.shadowOffsetX ?? 0);
    const shadowOffsetY = Math.round(tov.shadowOffsetY ?? 0);
    const showShadow = Boolean(
        tov.shadowColor
        && (shadowOffsetX !== 0 || shadowOffsetY !== 0),
    );
    const sprite = useMemo(
        () => renderTextOverlaySprite(tov, maxWidth),
        [
            maxWidth,
            tov.backgroundColor,
            tov.backgroundOpacity,
            tov.borderColor,
            tov.borderWidth,
            tov.color,
            tov.fontFamily,
            tov.fontSize,
            tov.fontWeight,
            tov.padding,
            tov.shadowBlur,
            tov.shadowColor,
            tov.shadowOffsetX,
            tov.shadowOffsetY,
            tov.text,
        ],
    );

    const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (disabled) return;
        e.stopPropagation();
        e.preventDefault();
        const container = e.currentTarget.parentElement as HTMLElement;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const state = {
            startX: e.clientX,
            startY: e.clientY,
            startPctX: tov.x,
            startPctY: tov.y,
            moved: false,
            containerW: rect.width,
            containerH: rect.height,
        };

        const handleMove = (ev: MouseEvent) => {
            const dx = ev.clientX - state.startX;
            const dy = ev.clientY - state.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) state.moved = true;
            const newX = Math.max(2, Math.min(98, state.startPctX + (dx / state.containerW) * 100));
            const newY = Math.max(2, Math.min(98, state.startPctY + (dy / state.containerH) * 100));
            onMoveRef.current(newX, newY);
        };
        const handleUp = () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            if (!state.moved) onSelectRef.current();
            else onMoveEndRef.current?.();
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    }, [disabled, tov.x, tov.y]);

    return (
        <div
            onMouseDown={onMouseDown}
            style={{
                position: 'absolute',
                left: `${tov.x}%`,
                top: `${tov.y}%`,
                transform: sprite
                    ? `translate(-${Math.round(sprite.hotspotX)}px, -${Math.round(sprite.hotspotY)}px)`
                    : 'translate(-50%, -50%)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: sprite?.width,
                height: sprite?.height,
                color: tov.color,
                fontFamily: getTextOverlayFontFamily(tov),
                fontWeight: tov.fontWeight || 'normal',
                fontSize: `${tov.fontSize}px`,
                lineHeight: 1.12,
                backgroundColor: !sprite && hasBackground && tov.backgroundColor
                    ? hexToRgba(tov.backgroundColor, tov.backgroundOpacity ?? 0.8)
                    : 'transparent',
                padding: !sprite && hasBackground ? `${Math.max(0, Math.round(tov.padding ?? 0))}px` : 0,
                borderRadius: 4,
                outline: isSelected ? '1px dashed rgba(255,255,255,0.75)' : 'none',
                outlineOffset: isSelected ? '4px' : 0,
                WebkitTextStroke: !sprite && strokeWidth > 0
                    ? `${strokeWidth}px ${tov.borderColor || '#020617'}`
                    : undefined,
                paintOrder: !sprite && strokeWidth > 0 ? 'stroke fill' : undefined,
                textShadow: !sprite && showShadow && tov.shadowColor
                    ? `${shadowOffsetX}px ${shadowOffsetY}px 0 ${tov.shadowColor}`
                    : 'none',
                cursor: disabled ? 'default' : isSelected ? 'move' : 'pointer',
                zIndex: 35,
                userSelect: 'none',
                whiteSpace: 'pre-wrap',
                textAlign: 'center',
                pointerEvents: disabled ? 'none' : 'auto',
                filter: !sprite ? visualFilter || undefined : undefined,
            }}
        >
            {sprite ? (
                <img
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    src={sprite.file}
                    style={{
                        display: 'block',
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        filter: visualFilter || undefined,
                    }}
                />
            ) : (
                tov.text
            )}
        </div>
    );
};

export default TextOverlayDraggable;
