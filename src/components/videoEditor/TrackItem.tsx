import React from 'react';
import { X } from 'lucide-react';

interface TrackItemProps {
    id: string;
    leftPct: number;
    widthPct: number;
    topPx: number;
    heightPx?: number | string;
    background: string;
    thumbnailUrl?: string;
    isSelected: boolean;
    isDragging?: boolean;
    icon?: React.ReactNode;
    label: string;
    onPointerDownSeek?: (clientX: number, target?: EventTarget | null) => void;
    onStartDrag?: (clientX: number) => void;
    onClick: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
    onResizeStart: (e: React.MouseEvent, edge: 'start' | 'end') => void;
    startTime: number;
    duration: number;
}

const TrackItem: React.FC<TrackItemProps> = ({
    id, leftPct, widthPct, topPx, heightPx, background, thumbnailUrl,
    isSelected, isDragging, icon, label,
    onPointerDownSeek, onStartDrag, onClick, onDelete, onResizeStart,
}) => {
    const safeLeft = Math.max(0, Math.min(leftPct, 100));
    const availableWidth = Math.max(0, 100 - safeLeft);
    const minVisibleWidth = Math.min(3, availableWidth);
    const safeWidth = availableWidth <= 0
        ? 0
        : Math.min(Math.max(widthPct, minVisibleWidth), availableWidth);

    if (safeWidth <= 0) {
        return null;
    }

    const handleMouseDown = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('.resize-handle, button')) {
            e.stopPropagation();
            return;
        }
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        let dragging = false;

        const cleanup = () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };

        const handleMove = (event: MouseEvent) => {
            if (dragging) return;
            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;
            if (Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) return;
            dragging = true;
            cleanup();
            onStartDrag?.(startX);
        };

        const handleUp = () => {
            cleanup();
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    };

    return (
        <div
            key={id}
            className={`effect-segment ${isSelected ? 'selected' : ''}`}
            onMouseDown={handleMouseDown}
            onClick={(e) => {
                onPointerDownSeek?.(e.clientX, e.target);
                onClick(e);
            }}
            style={{
                position: 'absolute',
                left: `${safeLeft}%`,
                width: `${safeWidth}%`,
                height: typeof heightPx === 'number' ? `${heightPx}px` : (heightPx ?? '100%'),
                top: `${topPx}px`,
                background: thumbnailUrl ? `${background}` : background,
                borderRadius: '4px',
                cursor: isDragging ? 'grabbing' : 'grab',
                zIndex: isSelected ? 100 : 11,
                border: isSelected ? '2px solid white' : '1px solid rgba(255,255,255,0.2)',
                boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 6px',
                overflow: 'hidden',
                transition: 'top 0.2s ease, height 0.2s ease',
            }}
        >
            {thumbnailUrl && (
                <>
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            backgroundImage: `url(${thumbnailUrl})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            opacity: 0.7,
                            pointerEvents: 'none',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: background.includes('gradient')
                                ? background
                                : 'linear-gradient(135deg, rgba(15,23,42,0.42) 0%, rgba(15,23,42,0.18) 100%)',
                            mixBlendMode: 'multiply',
                            pointerEvents: 'none',
                        }}
                    />
                </>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, overflow: 'hidden' }}>
                {icon}
                <span style={{ fontSize: '9px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {label}
                </span>
            </div>

            {isSelected && (
                <button
                    onClick={onDelete}
                    style={{
                        background: 'rgba(255,68,68,0.8)', border: 'none', borderRadius: '4px',
                        width: '16px', height: '16px', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', cursor: 'pointer', color: 'white',
                        marginLeft: '4px', flexShrink: 0,
                    }}
                >
                    <X size={10} />
                </button>
            )}

            <div className="resize-handle left" onMouseDown={(e) => onResizeStart(e, 'start')} style={{ width: '12px' }} />
            <div className="resize-handle right" onMouseDown={(e) => onResizeStart(e, 'end')} style={{ width: '12px' }} />
        </div>
    );
};

export default TrackItem;
