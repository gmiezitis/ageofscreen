import React, { useEffect, useRef, useState } from 'react';
import { CameraShape, normalizeCameraShape, traceCameraShapePath } from '../shared/cameraShapes';

interface WebcamBorderProps {
    isRecording: boolean;
    progress: number; // 0 to 1
    volume?: number; // 0 to 1
    shape: CameraShape;
    showBorder?: boolean;
    borderColor?: string; // Hex, default #000000 (black)
    borderWidth?: number;
    glowEnabled?: boolean;
    micEnabled?: boolean;
    showAudioMeter?: boolean;
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
    showBorder = true,
    borderColor = '#000000',
    borderWidth = 4,
    glowEnabled = false,
    micEnabled = false,
    showAudioMeter = false,
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

        const padding = Math.max(1, Math.ceil(borderWidth / 2));
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

        const volMod = volume ? Math.min(volume * 2.5, 1) : 0;

        if (showBorder) {
            drawPath(ctx);

            const baseAlpha = 0.85;
            const dynamicAlpha = Math.min(baseAlpha + (volMod * 0.15), 1);

            ctx.strokeStyle = hexToRgba(borderColor, dynamicAlpha);

            if (glowEnabled) {
                ctx.shadowBlur = 15 + (volMod * 15);
                ctx.shadowColor = borderColor;
            } else {
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
            }

            ctx.stroke();
            ctx.shadowBlur = 0;

            if (volMod > 0.5) {
                ctx.beginPath();
                const centerX = width / 2;
                ctx.arc(centerX, padding, 3, 0, Math.PI * 2);
                ctx.fillStyle = borderColor;
                ctx.fill();
            }
        }

        if (micEnabled && showAudioMeter) {
            const meterBarCount = 7;
            const meterBarWidth = Math.max(3, Math.round(width * 0.005));
            const meterGap = Math.max(3, Math.round(width * 0.004));
            const meterInnerWidth = meterBarCount * meterBarWidth + (meterBarCount - 1) * meterGap;
            const meterX = Math.round((width - meterInnerWidth) / 2);
            const normalizedVolume = Math.max(0, Math.min(volume ?? 0, 1));
            const bottomInset = Math.max(6, Math.round(height * 0.022));
            const barMinHeight = Math.max(3, Math.round(height * 0.018));
            const barMaxHeight = Math.max(barMinHeight + 3, Math.round(height * 0.05));
            const barBaseY = height - padding - bottomInset;
            const centerIndex = (meterBarCount - 1) / 2;

            for (let i = 0; i < meterBarCount; i += 1) {
                const distance = Math.abs(i - centerIndex);
                const shapeBias = Math.max(0.52, 1 - distance * 0.14);
                const animatedHeight = barMinHeight + Math.round((barMaxHeight - barMinHeight) * normalizedVolume * shapeBias);
                const barHeight = Math.min(barMaxHeight, animatedHeight);
                const barX = meterX + i * (meterBarWidth + meterGap);
                const barY = barBaseY - barHeight;

                ctx.beginPath();
                ctx.roundRect(barX, barY, meterBarWidth, barHeight, meterBarWidth / 2);
                ctx.fillStyle = i <= Math.round(normalizedVolume * (meterBarCount - 1)) + 1
                    ? 'rgba(255, 255, 255, 0.84)'
                    : 'rgba(255, 255, 255, 0.18)';
                ctx.shadowBlur = 4;
                ctx.shadowColor = 'rgba(255, 255, 255, 0.08)';
                ctx.fill();
            }
            ctx.shadowBlur = 0;
        }

    }, [isRecording, progress, volume, shape, showBorder, borderColor, borderWidth, glowEnabled, dimensions, micEnabled, showAudioMeter]);

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
