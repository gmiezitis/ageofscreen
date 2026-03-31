import React, { useRef, useCallback, useEffect } from 'react';
import { TextOverlay } from '../../../videoEditor/types';

interface Props {
    tov: TextOverlay;
    isSelected: boolean;
    disabled?: boolean;
    onSelect: () => void;
    onMove: (x: number, y: number) => void;
}

const TextOverlayDraggable: React.FC<Props> = ({ tov, isSelected, disabled = false, onSelect, onMove }) => {
    const onMoveRef = useRef(onMove);
    const onSelectRef = useRef(onSelect);
    useEffect(() => { onMoveRef.current = onMove; }, [onMove]);
    useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

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
                transform: 'translate(-50%, -50%)',
                color: tov.color,
                fontWeight: tov.fontWeight || 'normal',
                fontSize: `${tov.fontSize}px`,
                backgroundColor: tov.backgroundColor ? `${tov.backgroundColor}${Math.round((tov.backgroundOpacity ?? 0.8) * 255).toString(16).padStart(2, '0')}` : 'transparent',
                padding: tov.backgroundColor ? `${tov.padding || 8}px` : (isSelected ? '4px 8px' : 0),
                border: tov.borderWidth ? `${tov.borderWidth}px solid ${tov.borderColor || 'white'}` : (isSelected ? '1px dashed rgba(255,255,255,0.75)' : 'none'),
                borderRadius: tov.borderRadius ?? 6,
                boxShadow: tov.shadowColor ? `${tov.shadowOffsetX ?? 2}px ${tov.shadowOffsetY ?? 2}px ${tov.shadowBlur ?? 4}px ${tov.shadowColor}` : '0 2px 10px rgba(0,0,0,0.4)',
                textShadow: tov.shadowColor ? 'none' : '0 1px 4px rgba(0,0,0,0.5)',
                cursor: disabled ? 'default' : isSelected ? 'move' : 'pointer',
                zIndex: 35,
                userSelect: 'none',
                whiteSpace: 'pre-wrap',
                textAlign: 'center',
                maxWidth: 'min(70vw, 520px)',
                pointerEvents: disabled ? 'none' : 'auto',
            }}
        >
            {tov.text}
        </div>
    );
};

export default TextOverlayDraggable;
