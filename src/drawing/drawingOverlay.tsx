import React, { useEffect, useRef, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';

// Drawing API exposed via preload
interface DrawingAPI {
    send: (channel: string, ...args: any[]) => void;
    onColorChange?: (callback: (color: string) => void) => () => void;
}

declare global {
    interface Window {
        drawingAPI?: DrawingAPI;
    }
}

interface Stroke {
    id: number;
    points: { x: number; y: number }[];
    timestamp: number;
    opacity: number;
    color: string;
}

const DrawingOverlay: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [strokeColor, setStrokeColor] = useState('#ef4444');
    const strokesRef = useRef<Stroke[]>([]);
    const isDrawingRef = useRef(false);
    const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);
    const strokeIdRef = useRef(0);
    const animationFrameRef = useRef<number | null>(null);
    const [isDrawingState, setIsDrawingState] = useState(false); // Only for UI if needed, but we'll use refs for logic

    // Configuration - strokes fade after 2 seconds for a better professional feel
    const STROKE_LIFETIME = 2000;
    const STROKE_WIDTH = 5;

    // Calculate glow color from stroke color
    const getGlowColor = useCallback((color: string) => {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, 0.4)`;
    }, []);

    // Listen for color changes
    useEffect(() => {
        if (window.drawingAPI?.onColorChange) {
            const cleanup = window.drawingAPI.onColorChange((color) => {
                setStrokeColor(color);
            });
            return cleanup;
        }
    }, []);

    const handleExitDrawing = useCallback(() => {
        if (window.drawingAPI) {
            window.drawingAPI.send('toggle-drawing-overlay', false);
        }
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                handleExitDrawing();
            } else if (e.key === 'c' || e.key === 'C') {
                e.preventDefault();
                strokesRef.current = [];
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleExitDrawing]);

    useEffect(() => {
        const updateCanvasSize = () => {
            const canvas = canvasRef.current;
            if (canvas) {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = window.innerWidth * dpr;
                canvas.height = window.innerHeight * dpr;

                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.scale(dpr, dpr);
                }
            }
        };
        updateCanvasSize();
        window.addEventListener('resize', updateCanvasSize);
        return () => window.removeEventListener('resize', updateCanvasSize);
    }, []);

    // Optimized animation loop using refs
    useEffect(() => {
        const render = () => {
            const canvas = canvasRef.current;
            if (!canvas) {
                animationFrameRef.current = requestAnimationFrame(render);
                return;
            }

            const ctx = canvas.getContext('2d', { alpha: true });
            if (!ctx) {
                animationFrameRef.current = requestAnimationFrame(render);
                return;
            }

            const dpr = window.devicePixelRatio || 1;
            const now = Date.now();

            ctx.save();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

            // Filter expired strokes in the ref directly
            strokesRef.current = strokesRef.current.filter(stroke => {
                return (now - stroke.timestamp) < STROKE_LIFETIME;
            });

            // Prepare stroke data for broadcast to compositor
            const strokeData: any[] = [];

            // Draw fading strokes
            strokesRef.current.forEach(stroke => {
                const opacity = Math.max(0, 1 - (now - stroke.timestamp) / STROKE_LIFETIME);
                if (opacity <= 0 || stroke.points.length < 2) return;

                // Add to broadcast data
                strokeData.push({
                    points: stroke.points,
                    color: stroke.color,
                    opacity,
                    lineWidth: STROKE_WIDTH
                });

                ctx.save();
                ctx.globalAlpha = opacity;
                ctx.shadowColor = getGlowColor(stroke.color);
                ctx.shadowBlur = 4; // Reduced blur for better performance
                ctx.strokeStyle = stroke.color;
                ctx.lineWidth = STROKE_WIDTH;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
                for (let i = 1; i < stroke.points.length; i++) {
                    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
                }
                ctx.stroke();
                ctx.restore();
            });

            // Draw current active stroke
            if (isDrawingRef.current && currentStrokeRef.current.length >= 2) {
                // Add current stroke to broadcast data
                strokeData.push({
                    points: [...currentStrokeRef.current],
                    color: strokeColor,
                    opacity: 1,
                    lineWidth: STROKE_WIDTH
                });

                ctx.save();
                ctx.globalAlpha = 1;
                ctx.shadowColor = getGlowColor(strokeColor);
                ctx.shadowBlur = 6;
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = STROKE_WIDTH;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(currentStrokeRef.current[0].x, currentStrokeRef.current[0].y);
                for (let i = 1; i < currentStrokeRef.current.length; i++) {
                    ctx.lineTo(currentStrokeRef.current[i].x, currentStrokeRef.current[i].y);
                }
                ctx.stroke();
                ctx.restore();
            }

            ctx.restore(); // Add missing restore for the global save()

            // Broadcast stroke data to compositor (throttled to every 2nd frame for performance)
            if (strokeData.length > 0 && window.drawingAPI) {
                window.drawingAPI.send('drawing-stroke-update', {
                    strokes: strokeData,
                    screenWidth: window.innerWidth,
                    screenHeight: window.innerHeight
                });
            }

            animationFrameRef.current = requestAnimationFrame(render);
        };

        animationFrameRef.current = requestAnimationFrame(render);
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [strokeColor, getGlowColor]);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        isDrawingRef.current = true;
        currentStrokeRef.current = [{ x: e.clientX, y: e.clientY }];
        setIsDrawingState(true);
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current) return;
        currentStrokeRef.current.push({ x: e.clientX, y: e.clientY });
    }, []);

    const handleMouseUp = useCallback(() => {
        if (isDrawingRef.current && currentStrokeRef.current.length >= 2) {
            strokesRef.current.push({
                id: strokeIdRef.current++,
                points: [...currentStrokeRef.current],
                timestamp: Date.now(),
                opacity: 1,
                color: strokeColor,
            });
        }
        isDrawingRef.current = false;
        currentStrokeRef.current = [];
        setIsDrawingState(false);
    }, [strokeColor]);

    const handleMouseLeave = useCallback(() => {
        handleMouseUp();
    }, [handleMouseUp]);

    const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
        if (window.drawingAPI) {
            window.drawingAPI.send('forward-scroll', { deltaX: e.deltaX, deltaY: e.deltaY });
        }
    }, []);

    return (
        <div
            id="drawing-overlay-root"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                pointerEvents: 'auto',
                zIndex: 9999,
                cursor: 'crosshair',
                background: 'rgba(0,0,0,0.005)', // Nearly invisible but helps grab mouse events on some systems
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onWheel={handleWheel}
            />

        </div>
    );
};

// Initialize the overlay
const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<DrawingOverlay />);
}
