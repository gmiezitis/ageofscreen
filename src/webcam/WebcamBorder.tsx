import React, { useEffect, useRef, useState } from 'react';
import { CameraShape, normalizeCameraShape, traceCameraShapePath } from '../shared/cameraShapes';

interface WebcamBorderProps {
    isRecording: boolean;
    progress: number; // 0 to 1
    volume?: number; // 0 to 1
    shape: CameraShape;
    borderColor?: string; // Hex, default #000000 (black)
    borderWidth?: number;
    glowEnabled?: boolean;
    micEnabled?: boolean;
}

const hexToRgba = (hex: string, alpha: number): string => {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
};

export const WebcamBorder: React.FC<WebcamBorderProps> = ({
    isRecording,
    progress,
    volume,
    shape,
    borderColor = '#000000',
    borderWidth = 4,
    glowEnabled = false,
    micEnabled = false
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Use state to force re-render on resize
    const [dimensions, setDimensions] = useState({ width: 300, height: 300 });

    useEffect(() => {
        const updateSize = () => {
            const container = canvasRef.current?.parentElement;
            if (container) {
                const rect = container.getBoundingClientRect();
                setDimensions({ width: rect.width * 2, height: rect.height * 2 });
            }
        };

        const container = canvasRef.current?.parentElement;
        if (container) {
            const ro = new ResizeObserver(updateSize);
            ro.observe(container);
            updateSize();
            return () => ro.disconnect();
        }
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { width, height } = dimensions;
        const normalizedShape = normalizeCameraShape(shape);

        ctx.clearRect(0, 0, width, height);

        // Always show the full border path
        ctx.lineWidth = borderWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const padding = 6;
        const drawDimensions = {
            width: width - padding * 2,
            height: height - padding * 2,
            x: padding,
            y: padding
        };

        const drawPath = (ctx: CanvasRenderingContext2D) => {
            ctx.beginPath();
            traceCameraShapePath(
                ctx,
                normalizedShape,
                drawDimensions.x,
                drawDimensions.y,
                drawDimensions.width,
                drawDimensions.height,
            );
        };

        // Draw the full colored border
        drawPath(ctx);
        
        // Modulate border alpha and glow based on volume
        const volMod = volume ? Math.min(volume * 2.5, 1) : 0;
        const baseAlpha = 0.85;
        const dynamicAlpha = Math.min(baseAlpha + (volMod * 0.15), 1);
        
        ctx.strokeStyle = hexToRgba(borderColor, dynamicAlpha);

        // Dynamic Glow based on volume and explicit glow setting
        // When quiet, subtle blur. When loud, intense pulse.
        if (glowEnabled) {
            ctx.shadowBlur = 15 + (volMod * 15);
            ctx.shadowColor = borderColor;
        } else {
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        }

        ctx.stroke();

        // Reset shadow
        ctx.shadowBlur = 0;

        // Optional: Small reactive dot on the border if loud
        if (volMod > 0.5) {
             ctx.beginPath();
             const centerX = width / 2;
             // Draw a tiny highlight dot at the top center
             ctx.arc(centerX, padding, 3, 0, Math.PI * 2);
             ctx.fillStyle = borderColor;
             ctx.fill();
        }

        // --- NEW: SIDE LEVEL METER (Simple Visible Approach) ---
        if (micEnabled) {
            const meterWidth = 8;
            const meterMaxHeight = height * 0.35;
            const meterX = width - padding - 2;
            const meterY = (height - meterMaxHeight) / 2;

            // 1. Meter Channel (Background)
            ctx.beginPath();
            ctx.roundRect(meterX - meterWidth, meterY, meterWidth, meterMaxHeight, 4);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // 2. Dynamic Level (Fill)
            const levelHeight = Math.max(4, meterMaxHeight * (volume ?? 0));
            ctx.beginPath();
            ctx.roundRect(meterX - meterWidth, meterY + meterMaxHeight - levelHeight, meterWidth, levelHeight, 4);
            
            // Bright gradient for visibility
            const grad = ctx.createLinearGradient(0, meterY + meterMaxHeight, 0, meterY);
            grad.addColorStop(0, borderColor);
            grad.addColorStop(1, '#fff');
            
            ctx.fillStyle = grad;
            ctx.fill();
            
            // Optional: White highlight at the very top of the bar
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#fff';
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

    }, [isRecording, progress, volume, shape, borderColor, dimensions, micEnabled]);

    return (
        <canvas
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 15
            }}
        />
    );
};
