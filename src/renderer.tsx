import React, { useEffect, useState, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import Toolbar from "./components/Toolbar";
import { AnnotationCanvas } from "./components/AnnotationCanvas";
import { useAnnotationManager } from "./services/annotationManager";
import { useRecordingManager } from "./components/RecordingManager";
import { penSizeValues, textSizeValues, highlighterSizeValues } from "./styles";
import type { Tool, PenSize, BlurMode, AnnotationObject } from "./types";

const App: React.FC = () => {
    // --- State ---
    const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    const [selectedTool, setSelectedTool] = useState<Tool>("pen");
    const [penColor, setPenColor] = useState("#ff0000");
    const [selectedPenSize, setSelectedPenSize] = useState<PenSize>("m");
    const [highlighterColor, setHighlighterColor] = useState("#ff0000");
    const [selectedHighlighterSize, setSelectedHighlighterSize] = useState<PenSize>("m");
    const [textColor, setTextColor] = useState("#ff0000");
    const [selectedTextSize, setSelectedTextSize] = useState<PenSize>("m");
    const [stepColor, setStepColor] = useState("#ff0000");
    const [selectedStepSize, setSelectedStepSize] = useState<PenSize>("m");
    const [stepSymbol, setStepSymbol] = useState<string | undefined>(undefined);
    const [selectedSymbolText, setSelectedSymbolText] = useState("❤️");
    const [selectedBlurMode, setSelectedBlurMode] = useState<BlurMode>("spot");
    const [scrollOffset, setScrollOffset] = useState({ x: 0, y: 0 });
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastPosition, setLastPosition] = useState<{ x: number; y: number } | null>(null);

    // --- Annotation Manager ---
    const [annotationState, annotationActions] = useAnnotationManager();
    const { annotations, selectedAnnotationId, isEditing } = annotationState;
    const { canUndo, canRedo } = annotationActions;

    // Derived step counter: Start from 0 when hitting garbage (clear all)
    // Find highest current step number; next step is max + 1. If none, start at 0.
    const stepAnnotations = annotations.filter(a => a.type === 'step' && !a.symbol) as any[];
    const maxStep = stepAnnotations.length > 0
        ? Math.max(...stepAnnotations.map(a => a.number))
        : 0;
    const stepCounter = maxStep + 1;

    // --- Recording Manager ---
    const { isRecording, handleStartRecording, handleStopRecording } = useRecordingManager({
        onMessage: (msg) => {
            console.log("[Editor] Recording message:", msg);
        }
    });

    // --- Helpers to update selected annotation properties ---
    const handleUpdateSelected = useCallback((updates: Partial<AnnotationObject>) => {
        if (selectedAnnotationId) {
            annotationActions.updateAnnotation(selectedAnnotationId, updates);
        }
    }, [selectedAnnotationId, annotationActions]);

    const handlePenColorChange = (color: string) => {
        setPenColor(color);
        if (selectedAnnotationId) {
            const ann = annotations.find(a => a.id === selectedAnnotationId);
            if (ann && ['pen', 'arrow', 'rectangle', 'ellipse'].includes(ann.type)) {
                handleUpdateSelected({ color });
            }
        }
    };

    const handleHighlighterColorChange = (color: string) => {
        setHighlighterColor(color);
        if (selectedAnnotationId) {
            const ann = annotations.find(a => a.id === selectedAnnotationId);
            if (ann?.type === 'highlighter') handleUpdateSelected({ color });
        }
    };

    const handleTextColorChange = (color: string) => {
        setTextColor(color);
        if (selectedAnnotationId) {
            const ann = annotations.find(a => a.id === selectedAnnotationId);
            if (ann?.type === 'text') handleUpdateSelected({ color });
        }
    };

    const handleStepColorChange = (color: string) => {
        setStepColor(color);
        if (selectedAnnotationId) {
            const ann = annotations.find(a => a.id === selectedAnnotationId);
            if (ann?.type === 'step' || ann?.type === 'symbol') handleUpdateSelected({ color });
        }
    };

    const handlePenSizeSelect = (size: PenSize) => {
        setSelectedPenSize(size);
        if (selectedAnnotationId) {
            const ann = annotations.find(a => a.id === selectedAnnotationId);
            if (ann && ['pen', 'arrow', 'rectangle', 'ellipse'].includes(ann.type)) {
                handleUpdateSelected({ size, width: penSizeValues[size] });
            }
        }
    };

    const handleHighlighterSizeSelect = (size: PenSize) => {
        setSelectedHighlighterSize(size);
        if (selectedAnnotationId) {
            const ann = annotations.find(a => a.id === selectedAnnotationId);
            if (ann?.type === 'highlighter') {
                handleUpdateSelected({ size, width: highlighterSizeValues[size] });
            }
        }
    };

    const handleTextSizeSelect = (size: PenSize) => {
        setSelectedTextSize(size);
        if (selectedAnnotationId) {
            const ann = annotations.find(a => a.id === selectedAnnotationId);
            if (ann?.type === 'text') {
                // Approximate font parsing or replace size and rerender
                const oldFontParts = ann.font.split('px');
                if (oldFontParts.length > 1) {
                    const newFont = `${textSizeValues[size]}px${oldFontParts[1]}`;
                    handleUpdateSelected({ size, font: newFont });
                }
            }
        }
    };

    const handleStepSizeSelect = (size: PenSize) => {
        setSelectedStepSize(size);
        if (selectedAnnotationId) {
            const ann = annotations.find(a => a.id === selectedAnnotationId);
            if (ann?.type === 'step') {
                const fontSize = textSizeValues[size];
                handleUpdateSelected({ size, fontSize, radius: fontSize * 0.8 });
            } else if (ann?.type === 'symbol') {
                const fontSize = textSizeValues[size] * 1.8;
                handleUpdateSelected({ size, fontSize });
            }
        }
    };

    const handleStepSymbolChange = (newSymbol: string | undefined) => {
        setStepSymbol(newSymbol);
        if (selectedAnnotationId) {
            const ann = annotations.find(a => a.id === selectedAnnotationId);
            if (ann?.type === 'step') {
                handleUpdateSelected({ symbol: newSymbol });
            }
        }
    };

    const handleSymbolTextChange = (text: string) => {
        setSelectedSymbolText(text);
        if (selectedAnnotationId) {
            const ann = annotations.find(a => a.id === selectedAnnotationId);
            if (ann?.type === 'symbol') {
                handleUpdateSelected({ symbol: text });
            }
        }
    };

    // --- Refs ---
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const blurredImageCanvasRef = useRef<HTMLCanvasElement>(null);
    const imageElementRef = useRef<HTMLImageElement>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);

    const [displayDimensions, setDisplayDimensions] = useState<{ width: string; height: string }>({ width: "auto", height: "auto" });

    // --- IPC Listeners ---
    useEffect(() => {
        const cleanup = (window as any).electronAPI?.onCaptureData?.((event: any, data: any) => {
            if (data.success && data.dataUrl) {
                setCapturedDataUrl(data.dataUrl);
                annotationActions.resetAll();
                setIsImageLoaded(false);
            }
        });

        // Add global delete listener
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Delete" || e.key === "Backspace") {
                // Only delete if NOT editing text
                if (!isEditing && selectedAnnotationId) {
                    annotationActions.deleteAnnotation(selectedAnnotationId);
                }
            }
            // Undo/Redo shortcuts
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                if (e.shiftKey) {
                    annotationActions.redo();
                } else {
                    annotationActions.undo();
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            cleanup?.();
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [annotationActions, isEditing, selectedAnnotationId]);

    // --- Image Loading ---
    useEffect(() => {
        if (capturedDataUrl && imageElementRef.current) {
            imageElementRef.current.src = capturedDataUrl;
            imageElementRef.current.onload = () => {
                const img = imageElementRef.current!;
                const naturalWidth = img.naturalWidth;
                const naturalHeight = img.naturalHeight;

                if (canvasRef.current) {
                    canvasRef.current.width = naturalWidth;
                    canvasRef.current.height = naturalHeight;
                }
                if (previewCanvasRef.current) {
                    previewCanvasRef.current.width = naturalWidth;
                    previewCanvasRef.current.height = naturalHeight;
                }
                // Prepare blurred version for focus blur
                if (blurredImageCanvasRef.current) {
                    const blurCanvas = blurredImageCanvasRef.current;
                    blurCanvas.width = naturalWidth;
                    blurCanvas.height = naturalHeight;
                    const ctx = blurCanvas.getContext("2d");
                    if (ctx) {
                        ctx.filter = "blur(10px)";
                        ctx.drawImage(img, 0, 0);
                    }
                }

                // Calculate display dimensions to fit 90vw/90vh while maintaining aspect ratio
                // This replaces object-fit: contain which causes coordinate mismatch logic
                const maxWidth = window.innerWidth * 0.9;
                const maxHeight = window.innerHeight * 0.9;
                const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1); // Don't upscale, only downscale

                setDisplayDimensions({
                    width: `${naturalWidth * scale}px`,
                    height: `${naturalHeight * scale}px`
                });

                setIsImageLoaded(true);
            };
        }
    }, [capturedDataUrl]);

    // --- Handlers ---
    const handleSave = useCallback(async () => {
        if (!canvasRef.current) return;
        const dataUrl = canvasRef.current.toDataURL("image/png");
        await (window as any).electronAPI.saveImageAs(dataUrl);
    }, []);

    const handleImport = useCallback(async () => {
        const result = await (window as any).electronAPI.importImage();
        if (result && result.success && result.dataUrl) {
            setCapturedDataUrl(result.dataUrl);
            annotationActions.resetAll();
            setIsImageLoaded(false);
        }
    }, [annotationActions]);

    const handleImportRandom = useCallback(async () => {
        const result = await (window as any).electronAPI.importRandomImage();
        if (result && result.success && result.dataUrl) {
            setCapturedDataUrl(result.dataUrl);
            annotationActions.resetAll();
            setIsImageLoaded(false);
        } else if (result && result.error) {
            alert(result.error);
        }
    }, [annotationActions]);

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            backgroundColor: "#1e1e28",
            color: "white",
            overflow: "hidden"
        }}>
            <Toolbar
                onFullscreenCapture={() => (window as any).electronAPI.invokeCapture("fullscreen")}
                onRegionCapture={() => (window as any).electronAPI.invokeCapture("region")}
                onWindowCapture={() => (window as any).electronAPI.invokeCapture("window")}
                isRecording={isRecording}
                onStartRecording={() => handleStartRecording()}
                onStopRecording={handleStopRecording}
                selectedTool={selectedTool}
                onToolSelect={setSelectedTool}
                selectedBlurMode={selectedBlurMode}
                onBlurModeChange={setSelectedBlurMode}
                penColor={penColor}
                onPenColorChange={handlePenColorChange}
                highlighterColor={highlighterColor}
                onHighlighterColorChange={handleHighlighterColorChange}
                stepColor={stepColor}
                onStepColorChange={handleStepColorChange}
                selectedPenSize={selectedPenSize}
                onPenSizeSelect={handlePenSizeSelect}
                selectedTextSize={selectedTextSize}
                onTextSizeSelect={handleTextSizeSelect}
                selectedHighlighterSize={selectedHighlighterSize}
                onHighlighterSizeSelect={handleHighlighterSizeSelect}
                selectedStepSize={selectedStepSize}
                onStepSizeSelect={handleStepSizeSelect}
                textColor={textColor}
                onTextColorChange={handleTextColorChange}
                nextStepNumber={stepCounter}
                onUndo={annotationActions.undo}
                onRedo={annotationActions.redo}
                canUndo={canUndo()}
                canRedo={canRedo()}
                onSave={handleSave}
                onImport={handleImport}
                onImportRandom={handleImportRandom}
                selectedStepSymbol={stepSymbol}
                onStepSymbolChange={handleStepSymbolChange}
                selectedSymbolText={selectedSymbolText}
                onSymbolTextChange={handleSymbolTextChange}
                onClear={annotationActions.clearAnnotations}
                onOpenSettings={() => { }}
                isFullscreen={false}
                isDarkMode={true}
                onClose={() => (window as any).electronAPI.closeMainWindow()}
            />

            <div
                ref={canvasContainerRef}
                style={{
                    flex: 1,
                    overflow: "auto",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: "40px",
                    position: "relative"
                }}
            >
                <img ref={imageElementRef} style={{ display: "none" }} />
                <canvas
                    ref={previewCanvasRef}
                    style={{
                        position: "absolute",
                        zIndex: 10,
                        pointerEvents: "none",
                        width: displayDimensions.width,
                        height: displayDimensions.height,
                    }}
                />
                <canvas ref={blurredImageCanvasRef} style={{ display: "none" }} />

                {capturedDataUrl ? (
                    <div style={{ width: displayDimensions.width, height: displayDimensions.height }}>
                        <AnnotationCanvas
                            canvasRef={canvasRef}
                            previewCanvasRef={previewCanvasRef}
                            blurredImageCanvasRef={blurredImageCanvasRef}
                            imageElementRef={imageElementRef}
                            canvasContainerRef={canvasContainerRef}
                            isImageLoaded={isImageLoaded}
                            capturedDataUrl={capturedDataUrl}
                            selectedTool={selectedTool}
                            penColor={penColor}
                            selectedPenSize={selectedPenSize}
                            penWidth={penSizeValues[selectedPenSize]}
                            highlighterColor={highlighterColor}
                            selectedHighlighterSize={selectedHighlighterSize}
                            highlighterWidth={highlighterSizeValues[selectedHighlighterSize]}
                            textColor={textColor}
                            selectedTextSize={selectedTextSize}
                            stepColor={stepColor}
                            selectedStepSize={selectedStepSize}
                            selectedStepSymbol={stepSymbol}
                            stepCounter={stepCounter}
                            selectedSymbolText={selectedSymbolText}
                            onStepCounterIncrement={() => { }} // No longer needed, handled by annotations update
                            selectedBlurMode={selectedBlurMode}
                            blurBrushSize={penSizeValues[selectedPenSize]}
                            isDrawing={isDrawing}
                            setIsDrawing={setIsDrawing}
                            lastPosition={lastPosition}
                            setLastPosition={setLastPosition}
                            annotations={annotations}
                            selectedAnnotationId={selectedAnnotationId}
                            isEditing={isEditing}
                            annotationActions={annotationActions}
                            scrollOffset={scrollOffset}
                            setScrollOffset={setScrollOffset}
                            onToolSelect={setSelectedTool}
                            dynamicCursorStyle="crosshair"
                        />
                    </div>
                ) : (
                    <div style={{ opacity: 0.5, textAlign: "center" }}>
                        <h1>SnipFocus</h1>
                        <p>Capture something to start editing</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const rootElement = document.getElementById("root");
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}
