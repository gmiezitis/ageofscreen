import React from 'react';
import { Camera } from 'lucide-react';
import { CameraShape, getCameraDimensionsForWidth, getCameraShapeStyle, normalizeCameraShape } from '../../shared/cameraShapes';
import styles from '../RecordingSetup.module.css';

interface PreviewPaneProps {
    countdown: number | null;
    cameraEnabled: boolean;
    stream: MediaStream | null;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    cameraSize: number;
    cameraShape: CameraShape;
    cameraBorderColor?: string;
    cameraBorderWidth: number;
    cameraGlowEnabled: boolean;
    isPreviewStarting: boolean;
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
    cameraBorderWidth,
    cameraGlowEnabled,
    isPreviewStarting,
    presenterNameEnabled,
    presenterName,
}) => {
    const normalizedShape = normalizeCameraShape(cameraShape);
    const previewDimensions = getCameraDimensionsForWidth(normalizedShape, cameraSize);
    const previewShapeStyle = getCameraShapeStyle(normalizedShape);

    return (
        <div className={styles.cameraPreview}>
            {countdown !== null ? (
                <span className={styles.countdown}>{countdown}</span>
            ) : cameraEnabled && stream ? (
                <div
                    className={styles.previewShape}
                    style={{
                        width: `${previewDimensions.width}px`,
                        height: `${previewDimensions.height}px`,
                        border: `${cameraBorderWidth}px solid ${cameraBorderColor}`,
                        boxShadow: cameraGlowEnabled ? `0 0 20px ${cameraBorderColor}88, inset 0 0 10px ${cameraBorderColor}44` : 'none',
                        ...previewShapeStyle,
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
            ) : cameraEnabled && isPreviewStarting ? (
                <div className={styles.previewLoading} aria-hidden="true">
                    <div className={styles.previewSkeletonShape} />
                    <div className={styles.previewSkeletonLine} />
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
