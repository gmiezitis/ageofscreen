import React from 'react';
import { Monitor, Layout } from 'lucide-react';
import styles from '../RecordingSetup.module.css';

interface ModeSelectorProps {
    recordingMode: 'fullscreen' | 'window';
    setRecordingMode: (mode: 'fullscreen' | 'window') => void;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
    recordingMode,
    setRecordingMode,
}) => {
    return (
        <div className={styles.section}>
            <div className={styles.sectionLabel}>Capture Area</div>
            <div className={styles.modeSelector}>
                <button
                    className={`${styles.modeBtn} ${recordingMode === 'fullscreen' ? styles.active : ''}`}
                    onClick={() => setRecordingMode('fullscreen')}
                    title="Record Entire Screen"
                >
                    <Monitor size={16} />
                </button>
                <button
                    className={`${styles.modeBtn} ${recordingMode === 'window' ? styles.active : ''}`}
                    onClick={() => setRecordingMode('window')}
                    title="Choose Specific Window"
                >
                    <Layout size={16} />
                </button>
            </div>
        </div>
    );
};
