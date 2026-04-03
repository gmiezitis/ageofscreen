import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import styles from './FocusBlockingWarning.module.css';

interface FocusBlockingWarningProps {
  blockedUrl?: string | null;
  blockedApp?: string | null;
  onStayFocused: () => void;
  onDismiss: () => void;
}

const FocusBlockingWarning: React.FC<FocusBlockingWarningProps> = ({
  blockedUrl,
  blockedApp,
  onStayFocused,
  onDismiss,
}) => {
  const blockedItem = blockedUrl || blockedApp || 'distraction';

  return (
    <div className={styles.overlay}>
      <div className={styles.warning}>
        <div className={styles.warningHeader}>
          <AlertTriangle size={20} className={styles.warningIcon} />
          <span className={styles.warningTitle}>Stay in Flow</span>
          <button className={styles.closeButton} onClick={onDismiss}>
            <X size={14} />
          </button>
        </div>
        <div className={styles.warningContent}>
          <p className={styles.warningText}>
            <strong>{blockedItem}</strong> is on your focus list. Close it to keep this session calm and distraction-free.
          </p>
          <div className={styles.warningActions}>
            <button className={styles.stayButton} onClick={onStayFocused}>
              Keep Session Active
            </button>
            <button className={styles.dismissButton} onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FocusBlockingWarning;






