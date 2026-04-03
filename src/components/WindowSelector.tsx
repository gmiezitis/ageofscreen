import React from "react";
import type { WindowSource } from "../types";
import styles from "./WindowSelector.module.css";

interface WindowSelectorProps {
  sources: WindowSource[];
  onSelect: (windowId: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const WindowSelector: React.FC<WindowSelectorProps> = ({
  sources,
  onSelect,
  onCancel,
  isLoading = false,
}) => {
  const handleSelectWindow = (windowId: string) => {
    console.log(
      `[WindowSelector] Window thumbnail clicked, calling onSelect with ID: ${windowId}`
    );
    onSelect(windowId);
  };

  // Filter out problematic window sources
  const problematicNames = ["NVIDIA GeForce Overlay", "Program Manager"];
  const filteredSources = sources.filter(
    (source) => !problematicNames.includes(source.name)
  );
  const skeletonCards = Array.from({ length: 6 }, (_, index) => index);

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>Window Capture</div>
          <div className={styles.title}>Choose a window</div>
          <div className={styles.subtitle}>
            Pick the app surface you want to record. We'll keep the rest of the setup intact.
          </div>
        </div>

        {isLoading ? (
          <div className={styles.gridContainer}>
            {skeletonCards.map((index) => (
              <div key={index} className={`${styles.windowItem} ${styles.skeletonCard}`} aria-hidden="true">
                <div className={`${styles.windowThumbnail} ${styles.skeletonThumb}`} />
                <div className={`${styles.windowName} ${styles.skeletonLine}`} />
              </div>
            ))}
          </div>
        ) : filteredSources.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No windows available right now</div>
            <div className={styles.emptyBody}>
              Open the app or document you want to capture, then try again.
            </div>
          </div>
        ) : (
          <div className={styles.gridContainer}>
            {filteredSources.map((source) => (
              <button
                type="button"
                key={source.id}
                className={styles.windowItem}
                onClick={() => handleSelectWindow(source.id)}
              >
                <img
                  src={source.thumbnailDataUrl}
                  alt={source.name}
                  className={styles.windowThumbnail}
                />
                <div className={styles.windowName} title={source.name}>
                  {source.name}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default WindowSelector;
