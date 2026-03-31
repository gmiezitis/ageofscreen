import { Camera, MousePointer, Zap, User, Scissors, Mic, MessageSquare } from 'lucide-react';
import { FEATURES } from '../../config/features';
import styles from '../RecordingSetup.module.css';

interface ConfigTogglesProps {
    cameraEnabled: boolean;
    setCameraEnabled: (val: boolean) => void;
    micEnabled: boolean;
    setMicEnabled: (val: boolean) => void;
    captureCursorData: boolean;
    setCaptureCursorData: (val: boolean) => void;
    liveMagnifierEnabled: boolean;
    setLiveMagnifierEnabled: (val: boolean) => void;
    presenterNameEnabled: boolean;
    setPresenterNameEnabled: (val: boolean) => void;
    editAfterRecording: boolean;
    setEditAfterRecording: (val: boolean) => void;
    teleprompterEnabled: boolean;
    setTeleprompterEnabled: (val: boolean) => void;
}

export const ConfigToggles: React.FC<ConfigTogglesProps> = ({
    cameraEnabled,
    setCameraEnabled,
    micEnabled,
    setMicEnabled,
    captureCursorData,
    setCaptureCursorData,
    liveMagnifierEnabled,
    setLiveMagnifierEnabled,
    presenterNameEnabled,
    setPresenterNameEnabled,
    editAfterRecording,
    setEditAfterRecording,
    teleprompterEnabled,
    setTeleprompterEnabled,
}) => {
    return (
        <div className={styles.gridToggles}>
            <div
                className={`${styles.toggleCard} ${cameraEnabled ? styles.active : ''}`}
                onClick={() => setCameraEnabled(!cameraEnabled)}
                title="Toggle Webcam Preview"
            >
                <div className={styles.toggleIcon}>
                    <Camera size={16} strokeWidth={2} />
                </div>
            </div>

            <div
                className={`${styles.toggleCard} ${micEnabled ? styles.active : ''}`}
                onClick={() => setMicEnabled(!micEnabled)}
                title="Toggle Microphone"
            >
                <div className={styles.toggleIcon}>
                    <Mic size={16} strokeWidth={2} />
                </div>
            </div>

            <div
                className={`${styles.toggleCard} ${captureCursorData ? styles.active : ''}`}
                onClick={() => setCaptureCursorData(!captureCursorData)}
                title="Capture cursor & clicks"
            >
                <div className={styles.toggleIcon}>
                    <MousePointer size={16} strokeWidth={2} />
                </div>
            </div>

            {FEATURES.ENABLE_LIVE_MAGNIFIER && (
                <div
                    className={`${styles.toggleCard} ${liveMagnifierEnabled ? styles.active : ''}`}
                    onClick={() => setLiveMagnifierEnabled(!liveMagnifierEnabled)}
                    title="Live Magnifier (Alt+1)"
                >
                    <div className={styles.toggleIcon}>
                        <Zap size={16} strokeWidth={2} />
                    </div>
                </div>
            )}

            <div
                className={`${styles.toggleCard} ${presenterNameEnabled ? styles.active : ''}`}
                onClick={() => setPresenterNameEnabled(!presenterNameEnabled)}
                title="Show Name Tag"
            >
                <div className={styles.toggleIcon}>
                    <User size={16} strokeWidth={2} />
                </div>
            </div>

            <div
                className={`${styles.toggleCard} ${editAfterRecording ? styles.active : ''}`}
                onClick={() => setEditAfterRecording(!editAfterRecording)}
                title="Open Editor after stop"
            >
                <div className={styles.toggleIcon}>
                    <Scissors size={16} strokeWidth={2} />
                </div>
            </div>

            {FEATURES.ENABLE_TELEPROMPTER && (
                <div
                    className={`${styles.toggleCard} ${teleprompterEnabled ? styles.active : ''}`}
                    onClick={() => setTeleprompterEnabled(!teleprompterEnabled)}
                    title="Show Teleprompter Script"
                >
                    <div className={styles.toggleIcon}>
                        <MessageSquare size={16} strokeWidth={2} />
                    </div>
                </div>
            )}
        </div>
    );
};
