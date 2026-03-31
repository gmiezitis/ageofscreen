import React, { useState } from "react";
import type { WindowSource } from "../types";

interface WindowSelectorProps {
  sources: WindowSource[];
  onSelect: (windowId: string) => void;
  onCancel: () => void;
}

const WindowSelector: React.FC<WindowSelectorProps> = ({
  sources,
  onSelect,
  onCancel,
}) => {
  const [selectedWindowId] = useState<string | null>(null);

  const handleSelectWindow = (windowId: string) => {
    console.log(
      `[WindowSelector] Window thumbnail clicked, calling onSelect with ID: ${windowId}`
    );
    onSelect(windowId);
  };

  // Styles for the component
  const styles = {
    container: {
      position: "fixed" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(10, 11, 14, 0.85)",
      backdropFilter: "blur(12px)",
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 20000, // Higher than RecordingSetup
      padding: "40px",
      color: "#f8fafc",
    },
    modal: {
      backgroundColor: "rgba(26, 29, 35, 0.95)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      borderRadius: "24px",
      width: "100%",
      maxWidth: "900px",
      maxHeight: "85vh",
      display: "flex",
      flexDirection: "column" as const,
      boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.5)",
      overflow: "hidden",
    },
    header: {
      padding: "24px 32px 16px",
      textAlign: "left" as const,
    },
    title: {
      fontSize: "20px",
      fontWeight: "600",
      marginBottom: "8px",
      color: "#fff",
    },
    subtitle: {
      fontSize: "13px",
      color: "#94a3b8",
    },
    gridContainer: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
      gap: "16px",
      padding: "16px 32px 32px",
      overflowY: "auto" as const,
      flex: 1,
    },
    windowItem: {
      border: "1px solid rgba(255, 255, 255, 0.08)",
      borderRadius: "16px",
      padding: "12px",
      cursor: "pointer",
      backgroundColor: "rgba(255, 255, 255, 0.03)",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      position: "relative" as const,
    },
    selectedWindow: {
      borderColor: "rgba(255, 255, 255, 0.4)",
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      transform: "translateY(-2px)",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
    },
    windowThumbnail: {
      width: "100%",
      aspectRatio: "16/10",
      objectFit: "contain" as const,
      marginBottom: "12px",
      backgroundColor: "#000",
      borderRadius: "8px",
      border: "1px solid rgba(255, 255, 255, 0.05)",
    },
    windowName: {
      fontSize: "12px",
      fontWeight: "500",
      textAlign: "center" as const,
      whiteSpace: "nowrap" as const,
      overflow: "hidden",
      textOverflow: "ellipsis",
      width: "100%",
      color: "#e2e8f0",
    },
    footer: {
      padding: "20px 32px",
      borderTop: "1px solid rgba(255, 255, 255, 0.08)",
      display: "flex",
      justifyContent: "flex-end",
      gap: "12px",
      backgroundColor: "rgba(0, 0, 0, 0.1)",
    },
    button: {
      padding: "10px 24px",
      borderRadius: "10px",
      border: "none",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: "600",
      transition: "all 0.2s ease",
    },
    cancelButton: {
      backgroundColor: "rgba(255, 255, 255, 0.05)",
      color: "#94a3b8",
    },
    loadingMessage: {
      fontSize: "14px",
      color: "#94a3b8",
      padding: "40px",
      textAlign: "center" as const,
    },
  };

  // Filter out problematic window sources
  const problematicNames = ["NVIDIA GeForce Overlay", "Program Manager"];
  const filteredSources = sources.filter(
    (source) => !problematicNames.includes(source.name)
  );

  return (
    <div style={styles.container} onClick={(e) => e.stopPropagation()}>
      <style>
        {`
          .window-grid-scrollbar::-webkit-scrollbar {
            width: 8px;
          }
          .window-grid-scrollbar::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.05);
            border-radius: 10px;
          }
          .window-grid-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            border: 2px solid rgba(26, 29, 35, 0.95);
          }
          .window-grid-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.2);
          }
        `}
      </style>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={styles.title}>Select Window</div>
          <div style={styles.subtitle}>Choose an active window to start recording</div>
        </div>

        {filteredSources.length === 0 ? (
          <div style={styles.loadingMessage}>No windows available for capture</div>
        ) : (
          <div style={styles.gridContainer} className="window-grid-scrollbar">
            {filteredSources.map((source) => (
              <div
                key={source.id}
                style={{
                  ...styles.windowItem,
                  ...(selectedWindowId === source.id
                    ? styles.selectedWindow
                    : {}),
                }}
                onClick={() => handleSelectWindow(source.id)}
              >
                <img
                  src={source.thumbnailDataUrl}
                  alt={source.name}
                  style={styles.windowThumbnail}
                />
                <div style={styles.windowName} title={source.name}>
                  {source.name}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={styles.footer}>
          <button
            style={{ ...styles.button, ...styles.cancelButton }}
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
