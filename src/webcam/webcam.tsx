import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { WebcamBorder } from './WebcamBorder';

/**
 * Main Webcam Window component.
 * Handles camera stream acquisition, audio analysis, and IPC synchronization.
 */
declare global {
    interface Window {
        webcamAPI?: {
            send: (channel: string, ...args: any[]) => void;
            on: (channel: string, callback: (...args: any[]) => void) => () => void;
            resizeStart: (screenX: number, screenY: number) => void;
            resizeWindowAbsolute: (screenX: number, screenY: number, edge: string) => void;
        };
        AudioContext: typeof AudioContext;
        webkitAudioContext: typeof AudioContext;
    }
}

type CameraShape = 'circle' | 'rounded' | 'pill' | 'square';

const getParamsFromURL = () => {
    const params = new URLSearchParams(window.location.search);
    return {
        shape: (params.get('shape') as CameraShape) || 'circle',
        size: parseInt(params.get('size') || '120', 10),
        name: params.get('name') || '',
        borderColor: params.get('borderColor') || '#22c55e',
        micEnabled: params.get('micEnabled') === 'true',
    };
};

const WebcamWindow: React.FC = () => {
    const params = getParamsFromURL();
    const [shape, setShape] = useState<CameraShape>(params.shape);
    const [presenterName, setPresenterName] = useState(params.name);
    const [borderColor, setBorderColor] = useState(params.borderColor);
    const [micEnabled, setMicEnabled] = useState(params.micEnabled);
    const videoRef = useRef<HTMLVideoElement>(null);

    const [isRecording, setIsRecording] = useState(false);
    const [recordingProgress, setRecordingProgress] = useState(0);
    const [isResizing, setIsResizing] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [hasStream, setHasStream] = useState(false);
    const [volume, setVolume] = useState(0);
    const webcamStreamRef = useRef<MediaStream | null>(null);
    const streamRequestIdRef = useRef(0);

    const stopStreamTracks = useCallback((mediaStream: MediaStream | null) => {
        mediaStream?.getTracks().forEach((track) => track.stop());
    }, []);

    const stopWebcamStream = useCallback(() => {
        streamRequestIdRef.current += 1;
        stopStreamTracks(webcamStreamRef.current);
        webcamStreamRef.current = null;
        setHasStream(false);

        const video = videoRef.current;
        if (!video) return;

        video.pause();
        video.srcObject = null;
        video.onloadeddata = null;
    }, [stopStreamTracks]);

    // Initialize webcam stream with retry — camera may still be releasing from preview.
    useEffect(() => {
        let stream: MediaStream | null = null;
        let cancelled = false;
        const requestId = ++streamRequestIdRef.current;

        const tryGetMedia = async (attempt: number): Promise<MediaStream | null> => {
            try {
                return await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 240 },
                        height: { ideal: 240 },
                        frameRate: { ideal: 20, max: 24 },
                        facingMode: 'user'
                    },
                    audio: micEnabled
                });
            } catch (err) {
                console.warn(`[Webcam] Attempt ${attempt} failed:`, err);
                return null;
            }
        };

        const initWebcam = async () => {
            const maxRetries = 4;
            for (let i = 1; i <= maxRetries && !cancelled; i++) {
                if (i > 1) await new Promise(r => setTimeout(r, 600 * i));
                stream = await tryGetMedia(i);
                if (stream) break;
            }
            if (cancelled) { stopStreamTracks(stream); return; }
            if (stream && videoRef.current) {
                if (streamRequestIdRef.current !== requestId) {
                    stopStreamTracks(stream);
                    return;
                }
                stopStreamTracks(webcamStreamRef.current);
                webcamStreamRef.current = stream;
                videoRef.current.srcObject = stream;
                videoRef.current.onloadeddata = () => setHasStream(true);
            } else {
                console.error('[Webcam] Could not acquire camera after retries');
            }
        };
        initWebcam();
        return () => {
            cancelled = true;
            if (streamRequestIdRef.current === requestId) {
                stopWebcamStream();
                return;
            }
            stopStreamTracks(stream);
        };
    }, [micEnabled, stopStreamTracks, stopWebcamStream]);

    // Audio Analysis for Smart Border
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !hasStream) return;

        let audioContext: AudioContext | null = null;
        let analyser: AnalyserNode | null = null;
        let animFrame: number;
        let pollTimer: number | null = null;

        const setupAudio = (stream: MediaStream) => {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                audioContext = new AudioCtx();
                const source = audioContext.createMediaStreamSource(stream);
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                source.connect(analyser);

                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);

                const update = () => {
                    if (!analyser) return;
                    analyser.getByteFrequencyData(dataArray);
                    
                    let sum = 0;
                    for (let i = 0; i < bufferLength; i++) {
                        sum += dataArray[i];
                    }
                    const average = sum / bufferLength;
                    const normalized = Math.min(average / 128, 1);
                    setVolume(prev => prev * 0.7 + normalized * 0.3);
                    
                    animFrame = requestAnimationFrame(update);
                };
                update();
            } catch (err) {
                console.warn('[Webcam] AudioContext failed:', err);
            }
        };

        const checkStream = () => {
            const stream = video.srcObject as MediaStream;
            if (stream && stream.getAudioTracks().length > 0) {
                setupAudio(stream);
            } else {
                pollTimer = window.setTimeout(checkStream, 500);
            }
        };

        checkStream();

        return () => {
            if (pollTimer !== null) {
                window.clearTimeout(pollTimer);
            }
            if (animFrame) cancelAnimationFrame(animFrame);
            if (audioContext) audioContext.close();
        };
    }, [hasStream]);

    // IPC listeners
    useEffect(() => {
        const api = window.webcamAPI;
        if (!api) return;
        const cleanups = [
            api.on('recording-status', (r: boolean) => { setIsRecording(r); if (!r) setRecordingProgress(0); }),
            api.on('recording-progress', (p: number) => setRecordingProgress(p)),
            api.on('update-shape', (s: CameraShape) => setShape(s)),
            api.on('update-border-color', (c: string) => setBorderColor(c)),
            api.on('update-presenter-name', (n: string) => setPresenterName(n)),
            api.on('update-mic-status', (m: boolean) => setMicEnabled(m)),
            api.on('drawing-status', (isDrawing: boolean) => setIsDrawingMode(isDrawing)),
            api.on('stop-stream', () => stopWebcamStream()),
        ];
        return () => cleanups.forEach(c => c?.());
    }, [stopWebcamStream]);

    const [isDrawingMode, setIsDrawingMode] = useState(false);

    const resizingRef = useRef(false);

    // Handle Resize (Top Left Only)
    const handleResize = useCallback((e: MouseEvent) => {
        window.webcamAPI?.resizeWindowAbsolute(e.screenX, e.screenY, 'top-left');
    }, []);

    const handleResizeEnd = useCallback(() => {
        resizingRef.current = false;
        setIsResizing(false);
        window.removeEventListener('mousemove', handleResize);
        window.removeEventListener('mouseup', handleResizeEnd);
    }, [handleResize]);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizingRef.current = true;
        setIsResizing(true);
        window.webcamAPI?.resizeStart(e.screenX, e.screenY);
        window.addEventListener('mousemove', handleResize);
        window.addEventListener('mouseup', handleResizeEnd);
    }, [handleResize, handleResizeEnd]);

    // Unified radii to match Preview Widget exactly
    const borderRadius = shape === 'circle' ? '50%'
        : shape === 'pill' ? '9999px'
            : shape === 'rounded' ? '24px'
                : '12px';

    return (
        <div
            style={{
                width: '100vw',
                height: '100vh',
                background: 'transparent',
                position: 'relative',
                opacity: hasStream ? 1 : 0,
                transition: 'opacity 0.4s ease-out',
                pointerEvents: isDrawingMode ? 'none' : 'auto'
            }}
        >
            {/* Main Content Container (Locked to Window Size) */}
            <div
                onMouseEnter={() => { setIsHovered(true); }}
                onMouseLeave={() => { setIsHovered(false); }}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    borderRadius: borderRadius,
                    background: '#000',
                    boxSizing: 'border-box',
                    WebkitAppRegion: 'drag',
                    zIndex: 10,
                    overflow: 'hidden',
                    WebkitMaskImage: '-webkit-radial-gradient(white, black)',
                    transition: 'border-radius 0.4s ease',
                } as any}
            >
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: 'scaleX(-1) scale(1.02)',
                        display: 'block',
                        pointerEvents: 'none'
                    }}
                />

                {presenterName && (
                    <div
                        className="no-drag"
                        style={{
                            position: 'absolute',
                            bottom: '15%',
                            left: '12%',
                            background: isRecording ? 'rgba(239, 68, 68, 0.45)' : 'rgba(255, 255, 255, 0.08)',
                            backdropFilter: 'blur(16px) saturate(180%)',
                            WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            borderRadius: 'min(12px, 3vw)',
                            padding: '0.6vw 1.8vw',
                            color: '#fff',
                            fontSize: 'min(14px, max(9px, 4.5vw))',
                            fontWeight: 600,
                            letterSpacing: '0.01em',
                            maxWidth: '75%',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            zIndex: 30,
                            pointerEvents: 'none',
                            boxShadow: 'none',
                            transition: 'background 0.3s ease, transform 0.3s ease',
                            animation: 'presenterFadeIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {presenterName}
                    </div>
                )}

                <WebcamBorder isRecording={isRecording} progress={recordingProgress} volume={volume} shape={shape} borderColor={borderColor} micEnabled={micEnabled} />

                {/* Bottom Center - Controls Trigger Area (Option Widget Invoker) */}
                <div
                    onMouseEnter={() => { window.webcamAPI?.send('webcam-controls-hover', true); }}
                    onMouseLeave={() => { window.webcamAPI?.send('webcam-controls-hover', false); }}
                    className="no-drag"
                    style={{
                        position: 'absolute',
                        bottom: '-14px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '50px',
                        height: '25px',
                        zIndex: 50,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        WebkitAppRegion: 'no-drag'
                    } as any}
                >
                    <div style={{
                        width: '18px',
                        height: '3px',
                        background: 'rgba(255,255,255,0.3)',
                        borderRadius: '10px',
                        opacity: isHovered ? 1 : 0,
                        transition: 'all 0.3s ease',
                        transform: isHovered ? 'scaleX(1.1) translateY(-5px)' : 'scaleX(1) translateY(0)'
                    }} />
                </div>
            </div>

            {/* Left-Border Resize Handle - AFTER main container so it renders ON TOP of the drag region */}
            <div
                onMouseDown={handleResizeStart}
                className="no-drag"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '20px',
                    height: '100%',
                    cursor: 'ew-resize',
                    WebkitAppRegion: 'no-drag',
                    zIndex: 99999,
                    background: 'rgba(0,0,0,0.01)',
                } as any}
            />

            <style>{`
                .no-drag { -webkit-app-region: no-drag !important; }
                @keyframes presenterFadeIn {
                    from { opacity: 0; transform: translateY(10px) scale(0.9); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
};


const container = document.getElementById('root');
if (container) {
    createRoot(container).render(<WebcamWindow />);
}
