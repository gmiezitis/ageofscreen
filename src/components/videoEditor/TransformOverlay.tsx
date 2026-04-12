import React, { useState, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

interface Transform {
    x: number;
    y: number;
    scale: number;
    rotation: number;
}

interface TransformOverlayProps {
    transform: Transform;
    setTransform: (t: Transform) => void;
    containerSize: { width: number; height: number };
    isActive: boolean;
}

export const TransformOverlay: React.FC<TransformOverlayProps> = ({
    transform,
    setTransform,
    containerSize: _,
    isActive
}) => {
    if (!isActive) return null;

    const [isDragging, setIsDragging] = useState(false);
    const [dragMode, setDragMode] = useState<'move' | 'scale' | 'rotate' | null>(null);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [initialTransform, setInitialTransform] = useState(transform);

    const handleMouseDown = (e: React.MouseEvent, mode: 'move' | 'scale' | 'rotate') => {
        e.stopPropagation();
        setIsDragging(true);
        setDragMode(mode);
        setStartPos({ x: e.clientX, y: e.clientY });
        setInitialTransform(transform);
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: any) => {
            const dx = e.clientX - startPos.x;
            const dy = e.clientY - startPos.y;

            if (dragMode === 'move') {
                setTransform({
                    ...initialTransform,
                    x: initialTransform.x + dx,
                    y: initialTransform.y + dy
                });
            } else if (dragMode === 'scale') {
                const scaleChange = dx / 200; // Sensivity
                setTransform({
                    ...initialTransform,
                    scale: Math.max(0.1, initialTransform.scale + scaleChange)
                });
            } else if (dragMode === 'rotate') {
                const rotationChange = dx / 2; // Degrees
                setTransform({
                    ...initialTransform,
                    rotation: initialTransform.rotation + rotationChange
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setDragMode(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragMode, startPos, initialTransform, setTransform]);

    // Box dimensions based on transform
    const width = 320 * transform.scale; // Default width
    const height = 180 * transform.scale; // Default height

    return (
        <div
            style={{
                position: 'absolute',
                left: transform.x,
                top: transform.y,
                width: width,
                height: height,
                border: '2px solid var(--accent)',
                transform: `rotate(${transform.rotation}deg)`,
                pointerEvents: 'none',
                zIndex: 100,
                boxShadow: '0 0 15px var(--accent-glow)'
            }}
        >
            {/* Move Handle */}
            <div
                onMouseDown={(e) => handleMouseDown(e, 'move')}
                style={{
                    position: 'absolute',
                    inset: 0,
                    cursor: 'move',
                    pointerEvents: 'auto'
                }}
            />

            {/* Resize Handles (Corners) */}
            {['se', 'sw', 'ne', 'nw'].map(corner => (
                <div
                    key={corner}
                    onMouseDown={(e) => handleMouseDown(e, 'scale')}
                    style={{
                        position: 'absolute',
                        width: 12, height: 12,
                        background: 'white',
                        border: '2px solid var(--accent)',
                        borderRadius: '2px',
                        cursor: 'nwse-resize',
                        pointerEvents: 'auto',
                        bottom: corner.includes('s') ? -6 : 'auto',
                        top: corner.includes('n') ? -6 : 'auto',
                        right: corner.includes('e') ? -6 : 'auto',
                        left: corner.includes('w') ? -6 : 'auto'
                    }}
                />
            ))}

            {/* Rotation Handle */}
            <div
                onMouseDown={(e) => handleMouseDown(e, 'rotate')}
                style={{
                    position: 'absolute',
                    top: -30,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 20, height: 20,
                    background: 'white',
                    border: '2px solid var(--accent)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'grab',
                    pointerEvents: 'auto'
                }}
            >
                <RotateCcw size={10} color="var(--accent)" />
            </div>
        </div>
    );
};
