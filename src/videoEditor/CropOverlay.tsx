/**
 * CropOverlay.tsx - Simple, performant crop overlay
 * 
 * Clean design with:
 * - Dark overlay outside crop area
 * - Simple white border
 * - 4 corner handles (no extra cursors/overlays)
 */

import React, { useMemo } from 'react';
import { CropRect, VideoBounds } from './useCrop';

interface CropOverlayProps {
    cropRect: CropRect;
    videoBounds: VideoBounds;
    onMouseDown: (e: React.MouseEvent, handle: string) => void;
}

const CropOverlay: React.FC<CropOverlayProps> = ({
    cropRect,
    videoBounds,
    onMouseDown
}) => {
    // Memoize box calculations to prevent re-renders
    const box = useMemo(() => ({
        left: (cropRect.x / 100) * videoBounds.width,
        top: (cropRect.y / 100) * videoBounds.height,
        width: (cropRect.width / 100) * videoBounds.width,
        height: (cropRect.height / 100) * videoBounds.height
    }), [cropRect.x, cropRect.y, cropRect.width, cropRect.height, videoBounds.width, videoBounds.height]);

    const handleSize = 12;
    const handleOffset = handleSize / 2;

    return (
        <div
            style={{
                position: 'absolute',
                left: videoBounds.left,
                top: videoBounds.top,
                width: videoBounds.width,
                height: videoBounds.height,
                pointerEvents: 'none',
                zIndex: 200
            }}
        >
            {/* Dark overlay regions - removed background to prevent dark overlay */}
            <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: box.top, background: 'transparent', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: box.top + box.height, background: 'transparent', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', left: 0, top: box.top, width: box.left, height: box.height, background: 'transparent', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', right: 0, top: box.top, left: box.left + box.width, height: box.height, background: 'transparent', pointerEvents: 'none' }} />

            {/* Crop box - draggable center */}
            <div
                style={{
                    position: 'absolute',
                    left: box.left,
                    top: box.top,
                    width: box.width,
                    height: box.height,
                    border: '2px solid white',
                    boxSizing: 'border-box',
                    cursor: 'move',
                    pointerEvents: 'auto',
                    zIndex: 210
                }}
                onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, 'move'); }}
            />

            {/* Corner handles - simple squares */}
            {/* Top-Left */}
            <div
                style={{
                    position: 'absolute',
                    left: box.left - handleOffset,
                    top: box.top - handleOffset,
                    width: handleSize,
                    height: handleSize,
                    background: 'white',
                    borderRadius: 2,
                    cursor: 'nwse-resize',
                    pointerEvents: 'auto',
                    zIndex: 220,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)'
                }}
                onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, 'top-left'); }}
            />
            {/* Top-Right */}
            <div
                style={{
                    position: 'absolute',
                    left: box.left + box.width - handleOffset,
                    top: box.top - handleOffset,
                    width: handleSize,
                    height: handleSize,
                    background: 'white',
                    borderRadius: 2,
                    cursor: 'nesw-resize',
                    pointerEvents: 'auto',
                    zIndex: 220,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)'
                }}
                onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, 'top-right'); }}
            />
            {/* Bottom-Left */}
            <div
                style={{
                    position: 'absolute',
                    left: box.left - handleOffset,
                    top: box.top + box.height - handleOffset,
                    width: handleSize,
                    height: handleSize,
                    background: 'white',
                    borderRadius: 2,
                    cursor: 'nesw-resize',
                    pointerEvents: 'auto',
                    zIndex: 220,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)'
                }}
                onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, 'bottom-left'); }}
            />
            {/* Bottom-Right */}
            <div
                style={{
                    position: 'absolute',
                    left: box.left + box.width - handleOffset,
                    top: box.top + box.height - handleOffset,
                    width: handleSize,
                    height: handleSize,
                    background: 'white',
                    borderRadius: 2,
                    cursor: 'nwse-resize',
                    pointerEvents: 'auto',
                    zIndex: 220,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)'
                }}
                onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, 'bottom-right'); }}
            />
        </div>
    );
};

export default CropOverlay;
