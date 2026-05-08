import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ScreenPlaygroundInitPayload } from "./preload";
import "./types";
import {
    createImpact,
    createParticlesForTool,
    drawImpact,
    drawParticle,
    Impact,
    Particle,
    PlaygroundToolId,
    stepParticles,
} from "./engine";
import { playToolSound } from "./sound";

const TOOLS: Array<{ id: PlaygroundToolId; label: string; hotkey: string; cursor: string }> = [
    { id: "hammer", label: "Crack", hotkey: "1", cursor: "🔨" },
    { id: "burn", label: "Burn", hotkey: "2", cursor: "🔥" },
    { id: "scatter", label: "Scatter", hotkey: "3", cursor: "✦" },
    { id: "glyph", label: "Letters", hotkey: "4", cursor: "A" },
];

const MAX_IMPACTS = 520;
const MAX_PARTICLES = 900;

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
});

const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
    };
};

const ScreenPlayground: React.FC = () => {
    const [payload, setPayload] = useState<ScreenPlaygroundInitPayload | null>(null);
    const [tool, setTool] = useState<PlaygroundToolId>("hammer");
    const [muted, setMuted] = useState(false);
    const [cursorPoint, setCursorPoint] = useState({ x: -999, y: -999 });
    const [impactCount, setImpactCount] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const backgroundImageRef = useRef<HTMLImageElement | null>(null);
    const impactsRef = useRef<Impact[]>([]);
    const particlesRef = useRef<Particle[]>([]);
    const rafRef = useRef<number | null>(null);
    const toolRef = useRef(tool);
    const mutedRef = useRef(muted);

    useEffect(() => { toolRef.current = tool; }, [tool]);
    useEffect(() => { mutedRef.current = muted; }, [muted]);

    useEffect(() => {
        const cleanup = window.screenPlaygroundAPI?.onInit((nextPayload) => {
            setPayload(nextPayload);
            loadImage(nextPayload.screenshotDataUrl)
                .then((image) => {
                    backgroundImageRef.current = image;
                })
                .catch((error) => console.error("[ScreenPlayground] Failed to load screenshot", error));
        });

        return () => cleanup?.();
    }, []);

    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const targetWidth = Math.max(1, Math.round(width * dpr));
        const targetHeight = Math.max(1, Math.round(height * dpr));
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
        }

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);
        const background = backgroundImageRef.current;
        if (background) {
            const scale = Math.max(width / background.width, height / background.height);
            const drawWidth = background.width * scale;
            const drawHeight = background.height * scale;
            ctx.drawImage(background, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
        } else {
            ctx.fillStyle = "#0f172a";
            ctx.fillRect(0, 0, width, height);
        }

        ctx.fillStyle = "rgba(2,6,23,0.08)";
        ctx.fillRect(0, 0, width, height);
        impactsRef.current.forEach((impact) => drawImpact(ctx, impact));
        particlesRef.current = stepParticles(particlesRef.current);
        particlesRef.current.forEach((particle) => drawParticle(ctx, particle));
        ctx.restore();

        rafRef.current = window.requestAnimationFrame(drawFrame);
    }, []);

    useEffect(() => {
        rafRef.current = window.requestAnimationFrame(drawFrame);
        return () => {
            if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
        };
    }, [drawFrame]);

    const addImpact = useCallback((x: number, y: number) => {
        const currentTool = toolRef.current;
        impactsRef.current = [
            ...impactsRef.current.slice(-(MAX_IMPACTS - 1)),
            createImpact(currentTool, x, y),
        ];
        particlesRef.current = [
            ...particlesRef.current,
            ...createParticlesForTool(currentTool, x, y),
        ].slice(-MAX_PARTICLES);
        setImpactCount(impactsRef.current.length);
        if (!mutedRef.current) playToolSound(currentTool);
    }, []);

    const reset = useCallback(() => {
        impactsRef.current = [];
        particlesRef.current = [];
        setImpactCount(0);
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                window.screenPlaygroundAPI?.close();
                return;
            }
            if (event.key.toLowerCase() === "r") {
                reset();
                return;
            }
            const selected = TOOLS.find((candidate) => candidate.hotkey === event.key);
            if (selected) setTool(selected.id);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [reset]);

    const selectedCursor = useMemo(() => TOOLS.find((item) => item.id === tool)?.cursor ?? "✦", [tool]);

    return (
        <div className="playground-shell">
            <style>{`
                * { box-sizing: border-box; }
                html, body, #root { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #05070d; }
                body { user-select: none; cursor: none; font-family: "Segoe UI", Arial, sans-serif; }
                .playground-shell { width: 100%; height: 100%; position: relative; overflow: hidden; }
                .playground-canvas { width: 100%; height: 100%; display: block; cursor: none; }
                .playground-hud {
                    position: absolute; left: 50%; top: 18px; transform: translateX(-50%);
                    display: flex; align-items: center; gap: 8px; padding: 8px;
                    border: 1px solid rgba(255,255,255,0.12); border-radius: 999px;
                    background: rgba(7,10,18,0.72); backdrop-filter: blur(22px);
                    box-shadow: 0 18px 60px rgba(0,0,0,0.36); color: #f8fafc;
                }
                .playground-btn {
                    border: 1px solid rgba(255,255,255,0.08); color: #e2e8f0; background: rgba(255,255,255,0.04);
                    height: 34px; padding: 0 12px; border-radius: 999px; font-size: 12px; font-weight: 700;
                    cursor: none; transition: transform 0.16s ease, background 0.16s ease, border 0.16s ease;
                }
                .playground-btn:hover { transform: translateY(-1px); background: rgba(255,255,255,0.1); }
                .playground-btn.active { background: rgba(147,197,253,0.18); border-color: rgba(147,197,253,0.42); color: #bfdbfe; }
                .playground-meta {
                    position: absolute; left: 24px; bottom: 20px; color: rgba(248,250,252,0.78);
                    font-size: 12px; line-height: 1.5; padding: 10px 12px; border-radius: 12px;
                    background: rgba(7,10,18,0.52); border: 1px solid rgba(255,255,255,0.08);
                }
                .playground-cursor {
                    position: absolute; pointer-events: none; transform: translate(-50%, -50%);
                    left: ${cursorPoint.x}px; top: ${cursorPoint.y}px;
                    width: 54px; height: 54px; border-radius: 50%; display: grid; place-items: center;
                    color: #fff; font-size: ${tool === "glyph" ? "30px" : "26px"}; font-weight: 900;
                    text-shadow: 0 3px 18px rgba(0,0,0,0.8);
                    filter: drop-shadow(0 10px 26px rgba(0,0,0,0.55));
                    mix-blend-mode: screen;
                }
            `}</style>
            <canvas
                ref={canvasRef}
                className="playground-canvas"
                onPointerMove={(event) => {
                    setCursorPoint({ x: event.clientX, y: event.clientY });
                    if (event.buttons === 1 && canvasRef.current) {
                        const point = getCanvasPoint(event, canvasRef.current);
                        addImpact(point.x, point.y);
                    }
                }}
                onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const point = getCanvasPoint(event, event.currentTarget);
                    addImpact(point.x, point.y);
                }}
            />
            <div className="playground-hud">
                {TOOLS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={`playground-btn ${tool === item.id ? "active" : ""}`}
                        onClick={() => setTool(item.id)}
                    >
                        {item.hotkey}. {item.label}
                    </button>
                ))}
                <button type="button" className="playground-btn" onClick={() => setMuted((value) => !value)}>
                    {muted ? "Sound Off" : "Sound On"}
                </button>
                <button type="button" className="playground-btn" onClick={reset}>Reset</button>
                <button type="button" className="playground-btn" onClick={() => window.screenPlaygroundAPI?.close()}>Close</button>
            </div>
            <div className="playground-meta">
                Screen Playground edits a temporary screenshot only. Impacts: {impactCount}. Hotkeys: 1-4 tools, R reset, Esc close.
            </div>
            <div className="playground-cursor">{selectedCursor}</div>
            {!payload && (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#f8fafc", background: "#05070d" }}>
                    Loading Screen Playground...
                </div>
            )}
        </div>
    );
};

createRoot(document.getElementById("root")!).render(<ScreenPlayground />);
