import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { X, RotateCcw, Play, Pause, Pencil, Minus, Plus, Minimize2 } from 'lucide-react';

declare global {
    interface Window {
        teleprompterAPI?: {
            send: (channel: string, ...args: any[]) => void;
            on: (channel: string, callback: (...args: any[]) => void) => () => void;
        };
    }
}

const getParamsFromURL = () => {
    const params = new URLSearchParams(window.location.search);
    return {
        text: params.get('text') || '',
        speed: parseInt(params.get('speed') || '90', 10),
    };
};

const TeleprompterWindow: React.FC = () => {
    const initialParams = getParamsFromURL();
    const [text, setText] = useState(initialParams.text);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState(initialParams.speed);
    const [isEditing, setIsEditing] = useState(!initialParams.text);
    const textRef = useRef<HTMLDivElement>(null);
    const scrollPositionRef = useRef(0);
    const scrollVelocityRef = useRef(0);
    const speedRef = useRef(initialParams.speed);
    const animationFrameRef = useRef<number | null>(null);
    const lastFrameTimeRef = useRef<number | null>(null);

    useEffect(() => {
        speedRef.current = speed;
    }, [speed]);

    const applyScrollPosition = useCallback((position: number) => {
        if (!textRef.current || isEditing) return;
        textRef.current.style.transform = `translate3d(-${position}px, 0, 0)`;
    }, [isEditing]);

    const resetScroll = useCallback(() => {
        scrollPositionRef.current = 0;
        scrollVelocityRef.current = 0;
        lastFrameTimeRef.current = null;
        applyScrollPosition(0);
    }, [applyScrollPosition]);

    useEffect(() => {
        if (!isPlaying || isEditing) {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            lastFrameTimeRef.current = null;
            scrollVelocityRef.current = 0;
            return;
        }

        const tick = (now: number) => {
            if (!isPlaying || isEditing) {
                animationFrameRef.current = null;
                lastFrameTimeRef.current = null;
                scrollVelocityRef.current = 0;
                return;
            }

            if (lastFrameTimeRef.current === null) {
                lastFrameTimeRef.current = now;
            }

            const dt = Math.min(0.05, Math.max(0, (now - lastFrameTimeRef.current) / 1000));
            lastFrameTimeRef.current = now;

            const targetVelocity = speedRef.current * 0.6;
            scrollVelocityRef.current += (targetVelocity - scrollVelocityRef.current) * 0.14;
            scrollPositionRef.current += scrollVelocityRef.current * dt;

            applyScrollPosition(scrollPositionRef.current);
            animationFrameRef.current = requestAnimationFrame(tick);
        };

        animationFrameRef.current = requestAnimationFrame(tick);
        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [isPlaying, isEditing, applyScrollPosition]);

    useEffect(() => {
        const api = window.teleprompterAPI;
        if (!api) return;

        const cleanups: (() => void)[] = [];

        cleanups.push(api.on('teleprompter-set-text', (t: string) => {
            setText(t);
            resetScroll();
        }));
        cleanups.push(api.on('teleprompter-set-speed', (s: number) => setSpeed(s)));
        cleanups.push(api.on('teleprompter-play', () => {
            setIsPlaying(true);
            setIsEditing(false);
        }));
        cleanups.push(api.on('teleprompter-pause', () => setIsPlaying(false)));
        cleanups.push(api.on('teleprompter-reset', () => {
            resetScroll();
            setIsPlaying(false);
        }));

        if (initialParams.text) {
            setTimeout(() => {
                setIsPlaying(true);
                setIsEditing(false);
            }, 500);
        }

        return () => cleanups.forEach(c => c?.());
    }, [initialParams.text, resetScroll]);

    const handleClose = () => {
        window.teleprompterAPI?.send('teleprompter-close');
    };

    const handleMinimize = () => {
        window.teleprompterAPI?.send('teleprompter-minimize');
    };

    return (
        <div className="drag-region" style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(10, 10, 15, 0.9)',
            backdropFilter: 'blur(20px) saturate(180%)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Outfit", "Inter", sans-serif',
            padding: '0 12px',
            gap: '8px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden'
        }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                    className="no-drag action-btn"
                    onClick={handleClose}
                    style={{
                        width: '24px', height: '24px', borderRadius: '7px', border: 'none',
                        background: 'rgba(239, 68, 68, 0.12)', color: '#f87171',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                >
                    <X size={12} strokeWidth={2.5} />
                </button>

                <button
                    className="no-drag action-btn"
                    onClick={handleMinimize}
                    title="Minimize"
                    style={{
                        width: '24px', height: '24px', borderRadius: '7px', border: 'none',
                        background: 'rgba(251, 191, 36, 0.12)', color: '#fbbf24',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                >
                    <Minimize2 size={12} strokeWidth={2.5} />
                </button>

                <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

                <button
                    className="no-drag action-btn"
                    onClick={() => { resetScroll(); setIsPlaying(false); }}
                    style={{
                        width: '24px', height: '24px', borderRadius: '7px', border: 'none',
                        background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                >
                    <RotateCcw size={12} strokeWidth={2.5} />
                </button>

                <button
                    className="no-drag action-btn"
                    onClick={() => isPlaying ? setIsPlaying(false) : (setIsPlaying(true), setIsEditing(false))}
                    style={{
                        width: '32px', height: '24px', borderRadius: '7px', border: 'none',
                        background: isPlaying ? 'rgba(251, 191, 36, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                        color: isPlaying ? '#fbbf24' : '#4ade80',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: isPlaying ? '0 0 10px rgba(251, 191, 36, 0.1)' : '0 0 10px rgba(34, 197, 94, 0.1)'
                    }}
                >
                    {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                </button>
            </div>

            <div style={{ flex: 1, overflow: 'hidden', height: '100%', display: 'flex', alignItems: 'center', position: 'relative' }}>
                <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: '20px',
                    background: 'linear-gradient(to right, rgba(10,10,15,0.95), transparent)', zIndex: 2
                }} />
                {isEditing ? (
                    <input
                        className="no-drag"
                        value={text}
                        autoFocus
                        onBlur={() => text.trim() && setIsEditing(false)}
                        onChange={e => setText(e.target.value)}
                        placeholder="Type your script..."
                        style={{
                            width: '100%',
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            fontSize: '13px',
                            fontWeight: 500,
                            outline: 'none',
                            fontFamily: 'inherit',
                            padding: '0 8px'
                        }}
                    />
                ) : (
                    <div
                        ref={textRef}
                        onClick={() => setIsEditing(true)}
                        style={{
                            fontSize: '13px',
                            color: 'rgba(255, 255, 255, 0.95)',
                            whiteSpace: 'nowrap',
                            paddingLeft: '20px',
                            paddingRight: '40px',
                            transition: 'transform 0.08s linear',
                            fontWeight: 500,
                            letterSpacing: '0.01em',
                            cursor: 'text'
                        }}
                    >
                        {text || 'Click to add script...'}
                    </div>
                )}
                <div style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0, width: '40px',
                    background: 'linear-gradient(to left, rgba(10,10,15,0.95), transparent)', zIndex: 2
                }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: '8px' }}>
                <button
                    className="no-drag action-btn"
                    onClick={() => setSpeed(p => Math.max(20, p - 2))}
                    style={{
                        width: '20px', height: '20px', borderRadius: '5px', border: 'none',
                        background: 'transparent', color: 'rgba(255,255,255,0.4)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    <Minus size={10} strokeWidth={3} />
                </button>
                <span style={{
                    fontSize: '11px',
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: '24px',
                    textAlign: 'center',
                    fontWeight: 600
                }}>{speed}</span>
                <button
                    className="no-drag action-btn"
                    onClick={() => setSpeed(p => Math.min(200, p + 2))}
                    style={{
                        width: '20px', height: '20px', borderRadius: '5px', border: 'none',
                        background: 'transparent', color: 'rgba(255,255,255,0.4)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    <Plus size={10} strokeWidth={3} />
                </button>
            </div>

            <style>{`
                .action-btn:hover {
                    filter: brightness(1.2);
                    transform: scale(1.05);
                }
                .action-btn:active {
                    transform: scale(0.95);
                }
            `}</style>
        </div>
    );
};

const container = document.getElementById('root');
if (container) {
    createRoot(container).render(<TeleprompterWindow />);
}
