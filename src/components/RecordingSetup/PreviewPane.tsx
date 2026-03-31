import React from 'react';
import { Camera } from 'lucide-react';
import styles from '../RecordingSetup.module.css';

interface PreviewPaneProps {
    countdown: number | null;
    cameraEnabled: boolean;
    stream: MediaStream | null;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    cameraSize: number;
    cameraShape: string;
    cameraBorderColor?: string;
    presenterNameEnabled: boolean;
    presenterName: string;
}

export const PreviewPane: React.FC<PreviewPaneProps> = ({
    countdown,
    cameraEnabled,
    stream,
    videoRef,
    cameraSize,
    cameraShape,
    cameraBorderColor = '#22c55e',
    presenterNameEnabled,
    presenterName,
}) => {
    return (
        <div className={styles.cameraPreview}>
            {countdown !== null ? (
                <span className={styles.countdown}>{countdown}</span>
            ) : cameraEnabled && stream ? (
                <div
                    className={styles.previewShape}
                    style={{
                        width: `${60 + (cameraSize - 60) * 1}px`,
                        height: cameraShape === 'pill' ? `${(60 + (cameraSize - 60) * 1) / 1.7}px` : `${60 + (cameraSize - 60) * 1}px`,
                        borderRadius: cameraShape === 'circle' ? '50%'
                            : cameraShape === 'pill' ? '9999px'
                                : cameraShape === 'rounded' ? '24px'
                                    : '12px',
                        border: `2px solid ${cameraBorderColor}`,
                    }}
                >
                    <video
                        ref={videoRef as any}
                        className={styles.previewVideo}
                        autoPlay
                        muted
                        playsInline
                    />
                    {presenterNameEnabled && presenterName && (
                        <div className={styles.presenterTag}>
                            {presenterName}
                        </div>
                    )}
                </div>
            ) : (
                <div className={styles.previewPlaceholder}>
                    <Camera size={24} strokeWidth={1.5} />
                    <span>Preview Off</span>
                </div>
            )}
        </div>
    );
};
