import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import TaskTimerWidget from "../components/TaskTimerWidget";
import type { TimerWidgetPayload, TimerWidgetAlert } from "./types";

const FocusWidgetApp: React.FC = () => {
    const [payload, setPayload] = useState<TimerWidgetPayload | null>(null);
    const [alert, setAlert] = useState<TimerWidgetAlert | null>(null);
    const [customSoundPath, setCustomSoundPath] = useState<string | null>(null);

    useEffect(() => {
        const cleanup = (window as any).timerWidgetAPI?.onData((data: TimerWidgetPayload) => {
            console.log("[FocusWidget] Received payload:", data);
            setPayload(data);
        });

        const cleanupAlert = (window as any).timerWidgetAPI?.onAlert((data: TimerWidgetAlert) => {
            console.log("[FocusWidget] Received alert:", data);
            setAlert(data);
        });

        const cleanupCustomSound = (window as any).timerWidgetAPI?.onCustomSound?.((path: string) => {
            setCustomSoundPath(path);
        });

        return () => {
            cleanup?.();
            cleanupAlert?.();
            cleanupCustomSound?.();
        };
    }, []);

    const elapsed = useMemo(() => {
        if (!payload) {
            return 0;
        }
        return Math.max(0, Math.floor((Date.now() - payload.startedAt) / 1000));
    }, [payload]);

    const handleStop = useCallback(() => {
        (window as any).timerWidgetAPI?.requestStop();
    }, []);

    const handleBrowseSound = useCallback(() => {
        (window as any).timerWidgetAPI?.browseCustomSound?.();
    }, []);

    const handleDismissAlert = useCallback(() => {
        setAlert(null);
        (window as any).timerWidgetAPI?.dismissAlert?.();
    }, []);

    if (!payload) {
        return null;
    }

    return (
        <div style={{ padding: "10px" }}>
            <TaskTimerWidget
                taskName={payload.taskName}
                initialElapsedSeconds={elapsed}
                onStop={handleStop}
                breakIntervalMinutes={payload.breakIntervalMinutes}
                breakDurationMinutes={payload.breakDurationMinutes}
                alert={alert}
                onDismissAlert={handleDismissAlert}
                onBrowseCustomSound={handleBrowseSound}
                customSoundPath={customSoundPath}
            />
        </div>
    );
};

const rootElement = document.getElementById("root");
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<FocusWidgetApp />);
}
