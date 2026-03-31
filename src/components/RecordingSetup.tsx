import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Lightbulb, Circle, Square, LayoutTemplate } from 'lucide-react';
import { FEATURES } from '../config/features';

import styles from './RecordingSetup.module.css';
import { PreviewPane } from './RecordingSetup/PreviewPane';
import { ConfigToggles } from './RecordingSetup/ConfigToggles';
import { ModeSelector } from './RecordingSetup/ModeSelector';
import WindowSelector from './WindowSelector';
import { WindowSource } from '../types';

type CameraShape = 'circle' | 'rounded' | 'pill' | 'square';

const DEFAULT_CAMERA_SIZE = 100;
const MIN_CAMERA_SIZE = 60;
const MAX_CAMERA_SIZE = 250;

interface RecordingSetupProps {
    isVisible: boolean;
    onClose: () => void;
    onStartRecording: (config: RecordingConfig) => void;
}

export const DEFAULT_CAMERA_BORDER_COLOR = '#000000';

export interface RecordingConfig {
    cameraEnabled: boolean;
    micEnabled: boolean;
    cameraShape: CameraShape;
    cameraSize: number;
    cameraBorderColor?: string;
    teleprompterEnabled: boolean;
    teleprompterText: string;
    teleprompterSpeed: number;
    liveMagnifierEnabled: boolean;
    captureCursorData: boolean;
    presenterNameEnabled: boolean;
    presenterName: string;
    recordingMode: 'fullscreen' | 'window';
    windowId?: string;
    windowBackground?: string;
    recordingPadding?: number;

    editAfterRecording: boolean;
}

const SHAPE_OPTIONS: { value: CameraShape; label: string; icon: any }[] = [
    { value: 'circle', label: 'Circle', icon: Circle },
    { value: 'pill', label: 'Pill', icon: LayoutTemplate }, // Using LayoutTemplate as a pill-like representation
    { value: 'rounded', label: 'Rounded Square', icon: Square },
];

export const RecordingSetup: React.FC<RecordingSetupProps> = ({
    isVisible,
    onClose,
    onStartRecording,
}) => {
    const [cameraEnabled, setCameraEnabled] = useState(true);
    const [micEnabled, setMicEnabled] = useState(true);
    const [cameraShape, setCameraShape] = useState<CameraShape>('circle');
    const [cameraSize, setCameraSize] = useState(DEFAULT_CAMERA_SIZE);
    const [cameraBorderColor, setCameraBorderColor] = useState(DEFAULT_CAMERA_BORDER_COLOR);
    const [teleprompterEnabled, setTeleprompterEnabled] = useState(false);
    const [teleprompterText, setTeleprompterText] = useState('');
    const [teleprompterSpeed, setTeleprompterSpeed] = useState(90);
    const [liveMagnifierEnabled, setLiveMagnifierEnabled] = useState(true);
    const [captureCursorData, setCaptureCursorData] = useState(true);
    const [presenterNameEnabled, setPresenterNameEnabled] = useState(false);
    const [editAfterRecording, setEditAfterRecording] = useState(true);
    const [presenterName, setPresenterName] = useState('');
    const [recordingMode, setRecordingMode] = useState<'fullscreen' | 'window'>('fullscreen');

    const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);
    const [isWindowSelectorVisible, setIsWindowSelectorVisible] = useState(false);
    const [windowSources, setWindowSources] = useState<WindowSource[]>([]);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [showRecordingTip, setShowRecordingTip] = useState(() => !localStorage.getItem('snipfocus-hasSeenRecordingTip'));
    const videoRef = useRef<HTMLVideoElement>(null);
    const previewRequestIdRef = useRef(0);
    const previewStreamRef = useRef<MediaStream | null>(null);

    const stopStreamTracks = useCallback((mediaStream: MediaStream | null) => {
        mediaStream?.getTracks().forEach((track) => track.stop());
    }, []);

    const clearPreviewElement = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        video.pause();
        video.srcObject = null;
    }, []);

    const replacePreviewStream = useCallback((nextStream: MediaStream | null) => {
        if (previewStreamRef.current && previewStreamRef.current !== nextStream) {
            stopStreamTracks(previewStreamRef.current);
        }
        previewStreamRef.current = nextStream;
        setStream(nextStream);
    }, [stopStreamTracks]);

    const startCameraPreview = useCallback(async () => {
        const requestId = ++previewRequestIdRef.current;
        replacePreviewStream(null);
        clearPreviewElement();

        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 320 }, height: { ideal: 240 } },
                audio: false,
            });

            if (previewRequestIdRef.current !== requestId || !isVisible || !cameraEnabled) {
                stopStreamTracks(mediaStream);
                return;
            }

            replacePreviewStream(mediaStream);
        } catch (err) {
            console.error('Failed to start camera preview:', err);
        }
    }, [cameraEnabled, clearPreviewElement, isVisible, replacePreviewStream, stopStreamTracks]);

    const stopCameraPreview = useCallback(() => {
        previewRequestIdRef.current += 1;
        replacePreviewStream(null);
        clearPreviewElement();
    }, [clearPreviewElement, replacePreviewStream]);

    useEffect(() => {
        if (!isVisible) {
            stopCameraPreview();
            setCountdown(null);
            return;
        }
        if (cameraEnabled) {
            void startCameraPreview();
            return () => {
                stopCameraPreview();
            };
        }

        stopCameraPreview();
        return;
    }, [isVisible, cameraEnabled, startCameraPreview, stopCameraPreview]);

    useEffect(() => {
        const video = videoRef.current;

        if (!video) return;

        if (!stream) {
            video.pause();
            video.srcObject = null;
            return;
        }

        video.srcObject = stream;
        video.play().catch(console.error);

        return () => {
            if (video.srcObject === stream) {
                video.pause();
                video.srcObject = null;
            }
        };
    }, [stream]);

    useEffect(() => {
        if (countdown === null) return;
        if (countdown === 0) {
            stopCameraPreview();
            const effectiveMagnifier = FEATURES.ENABLE_LIVE_MAGNIFIER ? liveMagnifierEnabled : false;
            const effectiveTeleprompter = FEATURES.ENABLE_TELEPROMPTER ? teleprompterEnabled : false;
            onStartRecording({
                cameraEnabled, micEnabled, cameraShape, cameraSize, cameraBorderColor,
                teleprompterEnabled: effectiveTeleprompter,
                teleprompterText, teleprompterSpeed,
                liveMagnifierEnabled: effectiveMagnifier,
                captureCursorData, presenterNameEnabled, presenterName, recordingMode,
                windowId: selectedWindowId || undefined,
                recordingPadding: 0,
                editAfterRecording,
            });
            setCountdown(null);
            onClose();
            return;
        }
        const timer = setTimeout(() => setCountdown(prev => (prev !== null ? prev - 1 : null)), 1000);
        return () => clearTimeout(timer);
    }, [countdown, cameraEnabled, cameraShape, cameraSize, cameraBorderColor, teleprompterEnabled, teleprompterText, teleprompterSpeed, liveMagnifierEnabled, captureCursorData, presenterNameEnabled, presenterName, recordingMode, selectedWindowId, editAfterRecording, onStartRecording, stopCameraPreview, onClose]);


    const handleClose = () => {
        stopCameraPreview();
        setCountdown(null);
        setIsWindowSelectorVisible(false);
        setSelectedWindowId(null);
        onClose();
    };

    const handleStartClick = async () => {
        if (recordingMode === 'window') {
            try {
                // Fetch window sources before showing selector
                const sources = await (window as any).electronAPI.getScreenSources();
                const filtered = sources.filter((s: any) => !s.id.startsWith("screen:"));

                // Prefer dedicated getWindowSources for better thumbnails
                if ((window as any).electronAPI.getWindowSources) {
                    const winSources = await (window as any).electronAPI.getWindowSources();
                    setWindowSources(winSources);
                } else {
                    // Fallback to primary screen sources but mapped correctly
                    const formatted: WindowSource[] = sources.map((s: any) => ({
                        id: s.id,
                        name: s.name,
                        thumbnailDataUrl: s.thumbnailDataUrl || s.appIcon || '',
                    })).filter((s: any) => s.id.startsWith("window:"));
                    setWindowSources(formatted);
                }

                setIsWindowSelectorVisible(true);
            } catch (err) {
                console.error("Failed to fetch windows:", err);
                setCountdown(3); // Fallback to auto-select
            }
        } else {
            setCountdown(3);
        }
    };

    const handleWindowSelect = (id: string) => {
        console.log("[RecordingSetup] Window selected:", id);
        setSelectedWindowId(id);
        setIsWindowSelectorVisible(false);
        // Start the countdown after window is selected
        setCountdown(3);
    };

    if (!isVisible) return null;

    return (
        <div className={styles.overlay} onClick={handleClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <div />
                    <button className={styles.closeBtn} onClick={handleClose}><X size={16} /></button>
                </div>

                <div className={styles.content}>
                    {showRecordingTip && (
                        <div className={styles.onboardingTip}>
                            <Lightbulb size={14} />
                            <span>Record → Trim → Export. Your recording opens in the editor when you stop.</span>
                            <button type="button" className={styles.tipDismiss} onClick={() => { setShowRecordingTip(false); localStorage.setItem('snipfocus-hasSeenRecordingTip', '1'); }} aria-label="Dismiss"><X size={12} /></button>
                        </div>
                    )}
                    <PreviewPane
                        countdown={countdown} cameraEnabled={cameraEnabled} stream={stream}
                        videoRef={videoRef} cameraSize={cameraSize} cameraShape={cameraShape}
                        cameraBorderColor={cameraBorderColor}
                        presenterNameEnabled={presenterNameEnabled} presenterName={presenterName}
                    />

                    <ConfigToggles
                        cameraEnabled={cameraEnabled} setCameraEnabled={setCameraEnabled}
                        micEnabled={micEnabled} setMicEnabled={setMicEnabled}
                        captureCursorData={captureCursorData} setCaptureCursorData={setCaptureCursorData}
                        liveMagnifierEnabled={liveMagnifierEnabled} setLiveMagnifierEnabled={setLiveMagnifierEnabled}
                        presenterNameEnabled={presenterNameEnabled} setPresenterNameEnabled={setPresenterNameEnabled}
                        editAfterRecording={editAfterRecording} setEditAfterRecording={setEditAfterRecording}
                        teleprompterEnabled={teleprompterEnabled} setTeleprompterEnabled={setTeleprompterEnabled}
                    />

                    <ModeSelector recordingMode={recordingMode} setRecordingMode={setRecordingMode} />



                    {presenterNameEnabled && (
                        <div className={styles.subSettingsBox}>
                            <input
                                type="text" value={presenterName} onChange={(e) => setPresenterName(e.target.value)}
                                placeholder="Enter presenter name..." className={styles.nameInput} autoFocus
                            />
                        </div>
                    )}

                    {cameraEnabled && (
                        <div className={styles.subSettingsBox}>
                            <div className={styles.subSettingsRow}>
                                <div className={styles.optionRow}>
                                {SHAPE_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        className={`${styles.optionBtn} ${cameraShape === opt.value ? styles.active : ''}`}
                                        onClick={() => setCameraShape(opt.value)}
                                        title={opt.label}
                                    >
                                        <opt.icon size={16} strokeWidth={cameraShape === opt.value ? 2.5 : 2} />
                                    </button>
                                ))}
                            </div>
                            <div className={styles.colorPickerWrapper} title="Border Color">
                                <input
                                    type="color"
                                    value={cameraBorderColor}
                                    onChange={(e) => setCameraBorderColor(e.target.value)}
                                    className={styles.colorInput}
                                    style={{ '--glow-color': cameraBorderColor + '44' } as any}
                                />
                            </div>
                            </div>
                            <div className={styles.sliderRow}>
                                <span className={styles.sliderLabel}>Size</span>
                                <input
                                    type="range" min={MIN_CAMERA_SIZE} max={MAX_CAMERA_SIZE} value={cameraSize}
                                    onChange={(e) => setCameraSize(Number(e.target.value))} className={styles.sizeSlider}
                                />
                                <span className={styles.sizeValue}>{cameraSize}%</span>
                            </div>
                        </div>
                    )}

                    {FEATURES.ENABLE_TELEPROMPTER && teleprompterEnabled && (
                        <div className={styles.subSettingsBox}>
                            <textarea
                                value={teleprompterText} onChange={(e) => setTeleprompterText(e.target.value)}
                                placeholder="Paste teleprompter script here..." className={styles.scriptTextarea}
                            />
                        </div>
                    )}

                </div>

                <div className={styles.footer}>
                    <div className={styles.footerRow}>
                        <button
                            className={`${styles.startBtn} ${countdown !== null ? styles.counting : ''}`}
                            onClick={handleStartClick} disabled={countdown !== null}
                        >
                            {countdown !== null ? 'Starting...' : 'Start Recording'}
                        </button>
                    </div>
                </div>
            </div>

            {isWindowSelectorVisible && (
                <WindowSelector
                    sources={windowSources}
                    onSelect={handleWindowSelect}
                    onCancel={() => setIsWindowSelectorVisible(false)}
                />
            )}
        </div>
    );
};

export default RecordingSetup;

