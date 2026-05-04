import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Lightbulb, Circle, Square, LayoutTemplate, Heart, Hexagon, Diamond, Settings2, Sparkles } from 'lucide-react';
import { FEATURES } from '../config/features';
import { CameraShape } from '../shared/cameraShapes';
import { describeMediaError, getMediaErrorName, getUserMediaWithFallback } from '../shared/mediaDeviceAccess';

import styles from './RecordingSetup.module.css';
import { PreviewPane } from './RecordingSetup/PreviewPane';
import { ConfigToggles } from './RecordingSetup/ConfigToggles';
import { ModeSelector } from './RecordingSetup/ModeSelector';
import WindowSelector from './WindowSelector';
import { WindowSource } from '../types';

const DEFAULT_CAMERA_SIZE = 100;
const MIN_CAMERA_SIZE = 60;
const MAX_CAMERA_SIZE = 250;
const CAMERA_START_RETRY_DELAYS_MS = [0, 500, 1000, 2000];
const CAMERA_RELEASE_DELAY_MS = 120;

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

interface RecordingSetupProps {
    isVisible: boolean;
    onClose: () => void;
    onStartRecording: (config: RecordingConfig) => void;
    showShortcutTip?: boolean;
    onCompleteShortcutTip?: () => void;
}

export const DEFAULT_CAMERA_BORDER_COLOR = '#000000';

export interface RecordingConfig {
    cameraEnabled: boolean;
    micEnabled: boolean;
    cameraShape: CameraShape;
    cameraSize: number;
    cameraBorderColor?: string;
    cameraBorderWidth?: number;
    cameraGlowEnabled?: boolean;
    cameraAudioMeterEnabled?: boolean;
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
    { value: 'pill', label: 'Pill', icon: LayoutTemplate },
    { value: 'square', label: 'Square', icon: Square },
    { value: 'hexagon', label: 'Hexagon', icon: Hexagon },
    { value: 'heart', label: 'Heart', icon: Heart },
    { value: 'romb', label: 'Rhombus', icon: Diamond },
];

export const RecordingSetup: React.FC<RecordingSetupProps> = ({
    isVisible,
    onClose,
    onStartRecording,
    showShortcutTip = false,
    onCompleteShortcutTip,
}) => {
    const [cameraEnabled, setCameraEnabled] = useState(true);
    const [micEnabled, setMicEnabled] = useState(true);
    const [cameraShape, setCameraShape] = useState<CameraShape>('square');
    const [cameraSize, setCameraSize] = useState(DEFAULT_CAMERA_SIZE);
    const [cameraBorderColor, setCameraBorderColor] = useState(DEFAULT_CAMERA_BORDER_COLOR);
    const [cameraBorderWidth, setCameraBorderWidth] = useState(4);
    const [cameraGlowEnabled, setCameraGlowEnabled] = useState(false);
    const [cameraAudioMeterEnabled, setCameraAudioMeterEnabled] = useState(false);
    const [isAdvancedVisible, setIsAdvancedVisible] = useState(false);
    const [teleprompterEnabled, setTeleprompterEnabled] = useState(false);
    const [teleprompterText, setTeleprompterText] = useState('');
    const [teleprompterSpeed] = useState(90);
    const [liveMagnifierEnabled, setLiveMagnifierEnabled] = useState(true);
    const [captureCursorData, setCaptureCursorData] = useState(true);
    const [presenterNameEnabled, setPresenterNameEnabled] = useState(false);
    const [editAfterRecording, setEditAfterRecording] = useState(true);
    const [presenterName, setPresenterName] = useState('');
    const [recordingMode, setRecordingMode] = useState<'fullscreen' | 'window'>('fullscreen');

    const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);
    const [isWindowSelectorVisible, setIsWindowSelectorVisible] = useState(false);
    const [isWindowSourcesLoading, setIsWindowSourcesLoading] = useState(false);
    const [windowSources, setWindowSources] = useState<WindowSource[]>([]);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isPreviewStarting, setIsPreviewStarting] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [showRecordingTip, setShowRecordingTip] = useState(() => !localStorage.getItem('ageofscreen-hasSeenRecordingTip'));
    const videoRef = useRef<HTMLVideoElement>(null);
    const previewRequestIdRef = useRef(0);
    const windowSourceRequestIdRef = useRef(0);
    const previewStreamRef = useRef<MediaStream | null>(null);
    const recordingStartInFlightRef = useRef(false);
    const wasVisibleRef = useRef(false);
    const shouldShowLauncherTip = showRecordingTip || showShortcutTip;

    const dismissLauncherTip = () => {
        setShowRecordingTip(false);
        localStorage.setItem('ageofscreen-hasSeenRecordingTip', '1');
        onCompleteShortcutTip?.();
    };

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

    const getCameraPreviewErrorMessage = useCallback((err: unknown): string => {
        const errorName = getMediaErrorName(err);
        if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
            return 'Camera permission is blocked. Allow camera access in Windows privacy settings.';
        }
        if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
            return 'Camera is busy or Windows could not start it. Close other camera apps and try again.';
        }
        if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
            return 'No camera was found.';
        }
        return 'Camera preview could not start.';
    }, []);

    const startCameraPreview = useCallback(async () => {
        const requestId = ++previewRequestIdRef.current;
        setIsPreviewStarting(true);
        setPreviewError(null);
        replacePreviewStream(null);
        clearPreviewElement();

        try {
            const mediaStream = await getUserMediaWithFallback(
                [
                    {
                        video: { width: { ideal: 320 }, height: { ideal: 240 } },
                        audio: false,
                    },
                    { video: true, audio: false },
                ],
                'Recording setup preview',
                CAMERA_START_RETRY_DELAYS_MS,
            );

            if (previewRequestIdRef.current !== requestId || !isVisible || !cameraEnabled) {
                setIsPreviewStarting(false);
                stopStreamTracks(mediaStream);
                return;
            }

            replacePreviewStream(mediaStream);
            setIsPreviewStarting(false);
        } catch (err) {
            setIsPreviewStarting(false);
            setPreviewError(getCameraPreviewErrorMessage(err));
            console.error('Failed to start camera preview:', describeMediaError(err), err);
        }
    }, [cameraEnabled, clearPreviewElement, getCameraPreviewErrorMessage, isVisible, replacePreviewStream, stopStreamTracks]);

    const stopCameraPreview = useCallback(() => {
        previewRequestIdRef.current += 1;
        setIsPreviewStarting(false);
        setPreviewError(null);
        replacePreviewStream(null);
        clearPreviewElement();
    }, [clearPreviewElement, replacePreviewStream]);

    useEffect(() => {
        if (isVisible && !wasVisibleRef.current) {
            setCameraEnabled(true);
            setCaptureCursorData(true);
        }
        wasVisibleRef.current = isVisible;

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
            if (recordingStartInFlightRef.current) return;
            recordingStartInFlightRef.current = true;
            stopCameraPreview();
            setCountdown(null);
            void (async () => {
                await wait(CAMERA_RELEASE_DELAY_MS);
                const effectiveMagnifier = FEATURES.ENABLE_LIVE_MAGNIFIER ? liveMagnifierEnabled : false;
                const effectiveTeleprompter = FEATURES.ENABLE_TELEPROMPTER ? teleprompterEnabled : false;
                onStartRecording({
                    cameraEnabled, micEnabled, cameraShape, cameraSize, cameraBorderColor,
                    cameraBorderWidth, cameraGlowEnabled, cameraAudioMeterEnabled,
                    teleprompterEnabled: effectiveTeleprompter,
                    teleprompterText, teleprompterSpeed,
                    liveMagnifierEnabled: effectiveMagnifier,
                    captureCursorData, presenterNameEnabled, presenterName, recordingMode,
                    windowId: selectedWindowId || undefined,
                    recordingPadding: 0,
                    editAfterRecording,
                });
                recordingStartInFlightRef.current = false;
                onClose();
            })();
            return;
        }
        const timer = setTimeout(() => setCountdown(prev => (prev !== null ? prev - 1 : null)), 1000);
        return () => clearTimeout(timer);
    }, [countdown, cameraEnabled, cameraShape, cameraSize, cameraBorderColor, cameraBorderWidth, cameraGlowEnabled, cameraAudioMeterEnabled, teleprompterEnabled, teleprompterText, teleprompterSpeed, liveMagnifierEnabled, captureCursorData, presenterNameEnabled, presenterName, recordingMode, selectedWindowId, editAfterRecording, onStartRecording, stopCameraPreview, onClose]);


    const handleClose = () => {
        windowSourceRequestIdRef.current += 1;
        stopCameraPreview();
        setCountdown(null);
        setIsWindowSourcesLoading(false);
        setIsWindowSelectorVisible(false);
        setWindowSources([]);
        setSelectedWindowId(null);
        onClose();
    };

    const handleStartClick = async () => {
        if (recordingMode === 'window') {
            const requestId = ++windowSourceRequestIdRef.current;
            setIsWindowSelectorVisible(true);
            setIsWindowSourcesLoading(true);
            setWindowSources([]);
            try {
                // Fetch window sources before showing selector
                const sources = await (window as any).electronAPI.getScreenSources();
                // Prefer dedicated getWindowSources for better thumbnails
                let nextWindowSources: WindowSource[];
                if ((window as any).electronAPI.getWindowSources) {
                    const winSources = await (window as any).electronAPI.getWindowSources();
                    nextWindowSources = winSources;
                } else {
                    // Fallback to primary screen sources but mapped correctly
                    nextWindowSources = sources.map((s: any) => ({
                        id: s.id,
                        name: s.name,
                        thumbnailDataUrl: s.thumbnailDataUrl || s.appIcon || '',
                    })).filter((s: any) => s.id.startsWith("window:"));
                }

                if (windowSourceRequestIdRef.current !== requestId) {
                    return;
                }

                setWindowSources(nextWindowSources);
                setIsWindowSourcesLoading(false);
            } catch (err) {
                if (windowSourceRequestIdRef.current !== requestId) {
                    return;
                }

                console.error("Failed to fetch windows:", err);
                setIsWindowSelectorVisible(false);
                setIsWindowSourcesLoading(false);
                setCountdown(3); // Fallback to auto-select
            }
        } else {
            setCountdown(3);
        }
    };

    const handleWindowSelect = (id: string) => {
        console.log("[RecordingSetup] Window selected:", id);
        windowSourceRequestIdRef.current += 1;
        setSelectedWindowId(id);
        setIsWindowSourcesLoading(false);
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
                    {shouldShowLauncherTip && (
                        <div className={styles.onboardingTip}>
                            <Lightbulb size={14} />
                            <span>Print Screen opens AgeofScreen. If Windows takes that key, use the thin top trigger. Record - Trim - Export.</span>
                            <span>Record → Trim → Export. Your recording opens in the editor when you stop.</span>
                            <button type="button" className={styles.tipDismiss} onClick={dismissLauncherTip} aria-label="Dismiss"><X size={12} /></button>
                        </div>
                    )}
                    <PreviewPane
                        countdown={countdown} cameraEnabled={cameraEnabled} stream={stream}
                        videoRef={videoRef} cameraSize={cameraSize} cameraShape={cameraShape}
                        cameraBorderColor={cameraBorderColor}
                        cameraBorderWidth={cameraBorderWidth}
                        cameraGlowEnabled={cameraGlowEnabled}
                        cameraAudioMeterEnabled={cameraAudioMeterEnabled}
                        micEnabled={micEnabled}
                        isPreviewStarting={isPreviewStarting}
                        previewError={previewError}
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
                                        aria-label={opt.label}
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
                            <button
                                className={`${styles.advancedToggle} ${isAdvancedVisible ? styles.active : ''}`}
                                onClick={() => setIsAdvancedVisible(!isAdvancedVisible)}
                                title="Advanced Border Settings"
                            >
                                <Settings2 size={16} />
                            </button>
                            </div>

                            {isAdvancedVisible && (
                                <div className={styles.advancedSettings}>
                                    <div className={styles.advancedRow}>
                                        <span className={styles.advancedLabel}>Border Width</span>
                                        <input
                                            type="range" min={0} max={12} value={cameraBorderWidth}
                                            onChange={(e) => setCameraBorderWidth(Number(e.target.value))}
                                            className={styles.miniSlider}
                                        />
                                        <span className={styles.miniValue}>{cameraBorderWidth}px</span>
                                    </div>
                                    <div className={styles.advancedRow}>
                                        <span className={styles.advancedLabel}>Floating Glow</span>
                                        <button
                                            className={`${styles.glowToggle} ${cameraGlowEnabled ? styles.active : ''}`}
                                            onClick={() => setCameraGlowEnabled(!cameraGlowEnabled)}
                                        >
                                            <Sparkles size={12} />
                                            {cameraGlowEnabled ? 'On' : 'Off'}
                                        </button>
                                    </div>
                                    <div className={styles.advancedRow}>
                                        <span className={styles.advancedLabel}>Voice Meter</span>
                                        <button
                                            className={`${styles.glowToggle} ${cameraAudioMeterEnabled ? styles.active : ''}`}
                                            onClick={() => setCameraAudioMeterEnabled(!cameraAudioMeterEnabled)}
                                            disabled={!micEnabled}
                                            title={micEnabled ? 'Show a minimal sound meter on the webcam' : 'Enable microphone to use the voice meter'}
                                        >
                                            {cameraAudioMeterEnabled && micEnabled ? 'On' : 'Off'}
                                        </button>
                                    </div>
                                </div>
                            )}
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
                    isLoading={isWindowSourcesLoading}
                    onSelect={handleWindowSelect}
                    onCancel={() => {
                        windowSourceRequestIdRef.current += 1;
                        setIsWindowSourcesLoading(false);
                        setIsWindowSelectorVisible(false);
                    }}
                />
            )}
        </div>
    );
};

export default RecordingSetup;
