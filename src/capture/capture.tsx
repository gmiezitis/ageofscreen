import React, {
    useEffect,
    useState,
    useRef,
    useCallback,
} from "react";
import { createRoot } from "react-dom/client";
import WindowSelector from "../components/WindowSelector";
import type { WindowSource } from "../types";

// Placeholder UI component for the capture window
const CaptureUI: React.FC = () => {
    const [captureMode, setCaptureMode] = useState<"region" | "window">("region");
    const [windowSources, setWindowSources] = useState<WindowSource[]>([]);
    const [isSelecting, setIsSelecting] = useState(false);
    const selectionDivRef = useRef<HTMLDivElement>(null);
    const startPointRef = useRef<{ x: number; y: number } | null>(null);
    const endPointRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        document.documentElement.style.background = "transparent";
        document.body.style.background = "transparent";
    }, []);

    // Function to send result and close window
    const sendResult = useCallback(
        (
            cancelled: boolean,
            bounds?: { x: number; y: number; width: number; height: number },
            windowId?: string
        ) => {
            (window as any).captureAPI.sendSelectionResult({ cancelled, bounds, windowId });
        },
        []
    );

    // Calculate selection bounds
    const getSelectionBounds = useCallback(() => {
        const start = startPointRef.current;
        const end = endPointRef.current;
        if (!start || !end) return null;
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const width = Math.abs(start.x - end.x);
        const height = Math.abs(start.y - end.y);
        return { x, y, width, height };
    }, []);

    const paintSelectionBounds = useCallback((bounds: { x: number; y: number; width: number; height: number } | null) => {
        const selection = selectionDivRef.current;
        if (!selection || !bounds) return;
        selection.style.left = `${bounds.x}px`;
        selection.style.top = `${bounds.y}px`;
        selection.style.width = `${bounds.width}px`;
        selection.style.height = `${bounds.height}px`;
        selection.style.display = "block";
    }, []);

    // --- Event Handlers ---
    const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        if (captureMode === "window") return;
        event.preventDefault();
        const point = { x: event.clientX, y: event.clientY };
        startPointRef.current = point;
        endPointRef.current = point;
        setIsSelecting(true);
        paintSelectionBounds({ x: point.x, y: point.y, width: 0, height: 0 });
    };

    const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!isSelecting || captureMode === "window") return;
        endPointRef.current = { x: event.clientX, y: event.clientY };
        paintSelectionBounds(getSelectionBounds());
    };

    const handleMouseUp = (_event: React.MouseEvent<HTMLDivElement>) => {
        if (!isSelecting || captureMode === "window") return;
        setIsSelecting(false);
        endPointRef.current = { x: _event.clientX, y: _event.clientY };
        const bounds = getSelectionBounds();
        const MIN_SELECTION_SIZE = 10;
        if (
            bounds &&
            bounds.width >= MIN_SELECTION_SIZE &&
            bounds.height >= MIN_SELECTION_SIZE
        ) {
            sendResult(false, bounds);
        } else {
            sendResult(true);
        }
    };

    // Handle Esc key press for cancellation
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                sendResult(true);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [sendResult]);

    // --- Receive Screenshot Data via IPC ---
    useEffect(() => {
        const handleData = (_event: any, _dataUrl: string) => {
            console.log("Received screenshot data via IPC.");
        };
        const cleanup = (window as any).captureAPI.onScreenshotData(handleData);
        return cleanup;
    }, []);

    // --- NEW: Receive Capture Mode and Sources ---
    useEffect(() => {
        const handleMode = async (_event: any, mode: "region" | "window") => {
            console.log(`[CaptureUI] Capture mode set to: ${mode}`);
            setCaptureMode(mode);
            if (mode === "window") {
                const sources = await (window as any).captureAPI.getWindowSources();
                setWindowSources(sources);
            }
        };
        const cleanup = (window as any).captureAPI.onCaptureMode(handleMode);
        return cleanup;
    }, []);

    // --- Update Selection Div Style ---
    useEffect(() => {
        if (!isSelecting && selectionDivRef.current) {
            selectionDivRef.current.style.display = "none";
        }
    }, [isSelecting]);

    if (captureMode === "window") {
        return (
            <WindowSelector
                sources={windowSources}
                onSelect={(windowId) => sendResult(false, undefined, windowId)}
                onCancel={() => sendResult(true)}
            />
        );
    }

    return (
        <div
            style={{
                width: "100vw",
                height: "100vh",
                cursor: "crosshair",
                position: "fixed",
                top: 0,
                left: 0,
                userSelect: "none",
                backgroundColor: "transparent",
                overflow: "hidden",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            {/* Selection Rectangle */}
            <div
                ref={selectionDivRef}
                style={{
                    position: "absolute",
                    border: "2px solid #00d4ff",
                    backgroundColor: "transparent",
                    display: "none",
                    pointerEvents: "none",
                }}
            />

            {/* Instruction text */}
            {!isSelecting && (
                <div
                    style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        pointerEvents: "none",
                        textAlign: "center",
                    }}
                >
                    <p style={{
                        color: "white",
                        fontSize: "14px",
                        fontWeight: "500",
                        letterSpacing: "0.3px",
                        userSelect: "none",
                        textShadow: "0 1px 3px rgba(0, 0, 0, 0.8)",
                        opacity: 0.9,
                    }}>Click and drag to select area • Press ESC to cancel</p>
                </div>
            )}
        </div>
    );
};

// Find the root element
const rootElement = document.getElementById("capture-root");

if (rootElement) {
    const root = createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <CaptureUI />
        </React.StrictMode>
    );
} else {
    console.error("Capture root element not found!");
}
