import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import Toolbar from "./components/Toolbar";
import { AnnotationCanvas } from "./components/AnnotationCanvas";
import ImageCropOverlay from "./components/ImageCropOverlay";
import { UnsavedChangesDialog } from "./components/UnsavedChangesDialog";
import { useAnnotationManager } from "./services/annotationManager";
import { useRecordingManager } from "./components/RecordingManager";
import { CanvasRenderer } from "./services/canvasRenderer";
import { buildWatermarkedCanvas } from "./services/exportWatermark";
import { penSizeValues, textSizeValues, highlighterSizeValues } from "./styles";
import type { Tool, PenSize, BlurMode, AnnotationObject, ImageAnnotation } from "./types";
import type { OnboardingState } from "./shared/licensing";

type CropSelection = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type EditorSnapshot = {
    dataUrl: string;
    annotations: AnnotationObject[];
};

type StatusNotice = {
    message: string;
    actionLabel?: string;
    onAction?: () => void;
};

const PREMIUM_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const EDITOR_APP_BACKGROUND = [
    "radial-gradient(circle at top, rgba(125, 211, 252, 0.08), transparent 32%)",
    "radial-gradient(circle at 82% 18%, rgba(96, 165, 250, 0.08), transparent 24%)",
    "linear-gradient(180deg, #171c29 0%, #0d1320 100%)",
].join(", ");

const DEFAULT_ONBOARDING_STATE: OnboardingState = {
    hasCompletedOnboarding: false,
    preferredCaptureShortcut: "print_screen",
};

const cloneAnnotations = (items: AnnotationObject[]): AnnotationObject[] => {
    if (typeof structuredClone === "function") {
        return structuredClone(items);
    }

    return JSON.parse(JSON.stringify(items)) as AnnotationObject[];
};

const createEditorSnapshot = (dataUrl: string, annotations: AnnotationObject[]): EditorSnapshot => ({
    dataUrl,
    annotations: cloneAnnotations(annotations),
});

const deriveTextPreset = (fontSize: number): PenSize => (
    fontSize <= 14 ? "s" : fontSize <= 22 ? "m" : "l"
);

const parseFontSize = (font: string): number => {
    const match = font.match(/(\d+(?:\.\d+)?)px/i);
    return match ? Number(match[1]) : 16;
};

const getFontFamily = (font: string): string => {
    const match = font.match(/\d+(?:\.\d+)?px\s+(.+)/i);
    return match?.[1] ?? "sans-serif";
};

const loadImageElement = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = src;
});

const rectsIntersect = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
) => (
    a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
);

const translateAnnotationForCrop = (
    annotation: AnnotationObject,
    crop: CropSelection,
): AnnotationObject | null => {
    const bounds = CanvasRenderer.getAnnotationBounds(annotation, null);
    if (bounds && !rectsIntersect(bounds, crop)) {
        return null;
    }

    const shiftX = -crop.x;
    const shiftY = -crop.y;

    switch (annotation.type) {
        case "pen":
        case "highlighter":
            return {
                ...annotation,
                points: annotation.points.map((point) => ({ x: point.x + shiftX, y: point.y + shiftY })),
            };
        case "line":
        case "arrow":
            return {
                ...annotation,
                startX: annotation.startX + shiftX,
                startY: annotation.startY + shiftY,
                endX: annotation.endX + shiftX,
                endY: annotation.endY + shiftY,
            };
        case "rectangle":
        case "focusRect":
        case "image":
            return {
                ...annotation,
                x: annotation.x + shiftX,
                y: annotation.y + shiftY,
            };
        case "ellipse":
            return {
                ...annotation,
                cx: annotation.cx + shiftX,
                cy: annotation.cy + shiftY,
            };
        case "text":
            return {
                ...annotation,
                x: annotation.x + shiftX,
                y: annotation.y + shiftY,
                boxX: annotation.boxX !== undefined ? annotation.boxX + shiftX : undefined,
                boxY: annotation.boxY !== undefined ? annotation.boxY + shiftY : undefined,
            };
        case "step":
            return {
                ...annotation,
                cx: annotation.cx + shiftX,
                cy: annotation.cy + shiftY,
            };
        case "symbol":
            return {
                ...annotation,
                x: annotation.x + shiftX,
                y: annotation.y + shiftY,
            };
        case "blur":
            return annotation.points
                ? {
                    ...annotation,
                    points: annotation.points.map((point) => ({ x: point.x + shiftX, y: point.y + shiftY })),
                }
                : annotation;
        default:
            return annotation;
    }
};

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
    const [defaultTextFontSize, setDefaultTextFontSize] = useState<number>(textSizeValues.m);
    const [defaultTextBoxWidth, setDefaultTextBoxWidth] = useState<number>(240);
    const [stepColor, setStepColor] = useState("#ff0000");
    const [selectedStepSize, setSelectedStepSize] = useState<PenSize>("m");
    const [stepSymbol, setStepSymbol] = useState<string | undefined>(undefined);
    const [selectedSymbolText, setSelectedSymbolText] = useState("❤️");
    const [selectedBlurMode, setSelectedBlurMode] = useState<BlurMode>("spot");
    const [scrollOffset, setScrollOffset] = useState({ x: 0, y: 0 });
    const [cropSelection, setCropSelection] = useState<CropSelection | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastPosition, setLastPosition] = useState<{ x: number; y: number } | null>(null);
    const [cropUndoStack, setCropUndoStack] = useState<EditorSnapshot[]>([]);
    const [cropRedoStack, setCropRedoStack] = useState<EditorSnapshot[]>([]);
    const [_onboardingState, setOnboardingState] = useState<OnboardingState>(DEFAULT_ONBOARDING_STATE);
    const [statusNotice, setStatusNotice] = useState<StatusNotice | null>(null);
    const [showClosePrompt, setShowClosePrompt] = useState(false);
    const [isSavingBeforeClose, setIsSavingBeforeClose] = useState(false);
    const lastNonCropToolRef = useRef<Tool>("pen");
    const statusTimeoutRef = useRef<number | null>(null);
    const allowWindowCloseRef = useRef(false);
    const hasUnsavedChangesRef = useRef(false);
    const lastSavedSignatureRef = useRef(JSON.stringify({ capturedDataUrl: null, annotations: [] }));

    // --- Annotation Manager ---
    const [annotationState, annotationActions] = useAnnotationManager();
    const { annotations, selectedAnnotationId, isEditing } = annotationState;
    const { canUndo, canRedo } = annotationActions;
    const selectedTextAnnotation = useMemo(() => {
        const annotation = selectedAnnotationId
            ? annotations.find((item) => item.id === selectedAnnotationId)
            : null;
        return annotation?.type === "text" ? annotation : null;
    }, [annotations, selectedAnnotationId]);

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

    const showTimedStatus = useCallback((message: string, durationMs = 4200) => {
        setStatusNotice({ message });
        if (statusTimeoutRef.current !== null) {
            window.clearTimeout(statusTimeoutRef.current);
        }
        statusTimeoutRef.current = window.setTimeout(() => {
            setStatusNotice((current) => (current?.message === message ? null : current));
            statusTimeoutRef.current = null;
        }, durationMs);
    }, []);

    const showStatusAction = useCallback((message: string, actionLabel: string, onAction: () => void, durationMs = 7000) => {
        setStatusNotice({ message, actionLabel, onAction });
        if (statusTimeoutRef.current !== null) {
            window.clearTimeout(statusTimeoutRef.current);
        }
        statusTimeoutRef.current = window.setTimeout(() => {
            setStatusNotice((current) => (current?.message === message ? null : current));
            statusTimeoutRef.current = null;
        }, durationMs);
    }, []);

    useEffect(() => {
        const cleanup = (window as any).electronAPI.settings.onChanged?.((state: OnboardingState) => {
            setOnboardingState(state);
        });

        (window as any).electronAPI.settings.getOnboardingState()
            .then((state: OnboardingState) => setOnboardingState(state))
            .catch(() => { });

        return () => {
            cleanup?.();
        };
    }, []);

    useEffect(() => (
        () => {
            if (statusTimeoutRef.current !== null) {
                window.clearTimeout(statusTimeoutRef.current);
            }
        }
    ), []);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (allowWindowCloseRef.current || isSavingBeforeClose || !hasUnsavedChangesRef.current) {
                return;
            }
            event.preventDefault();
            event.returnValue = false;
            setShowClosePrompt(true);
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [isSavingBeforeClose]);

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
            if (ann && ['pen', 'line', 'arrow', 'rectangle', 'ellipse'].includes(ann.type)) {
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
            if (ann && ['pen', 'line', 'arrow', 'rectangle', 'ellipse'].includes(ann.type)) {
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

    const beginTextBoxAdjustment = useCallback(() => {
        if (selectedTextAnnotation) {
            annotationActions.saveStateToHistory?.();
        }
    }, [annotationActions, selectedTextAnnotation]);

    const handleTextFontSizeChange = useCallback((fontSize: number) => {
        const nextFontSize = Math.max(10, Math.min(96, Math.round(fontSize)));
        const nextPreset = deriveTextPreset(nextFontSize);
        setDefaultTextFontSize(nextFontSize);
        setSelectedTextSize(nextPreset);

        if (selectedTextAnnotation) {
            const nextFont = `${nextFontSize}px ${getFontFamily(selectedTextAnnotation.font)}`;
            const textMeasureContext = canvasRef.current?.getContext("2d")
                ?? previewCanvasRef.current?.getContext("2d")
                ?? null;
            const nextLayout = CanvasRenderer.getTextBoxLayout({
                ...selectedTextAnnotation,
                font: nextFont,
                size: nextPreset,
            }, textMeasureContext);

            annotationActions.updateAnnotationLive?.(selectedTextAnnotation.id, {
                font: nextFont,
                size: nextPreset,
                boxHeight: nextLayout.boxHeight,
            });
        }
    }, [annotationActions, selectedTextAnnotation]);

    const handleTextBoxWidthChange = useCallback((boxWidth: number) => {
        const nextWidth = Math.max(120, Math.round(boxWidth));
        setDefaultTextBoxWidth(nextWidth);

        if (selectedTextAnnotation) {
            const textMeasureContext = canvasRef.current?.getContext("2d")
                ?? previewCanvasRef.current?.getContext("2d")
                ?? null;
            const nextLayout = CanvasRenderer.getTextBoxLayout({
                ...selectedTextAnnotation,
                boxWidth: nextWidth,
            }, textMeasureContext);

            annotationActions.updateAnnotationLive?.(selectedTextAnnotation.id, {
                boxWidth: nextWidth,
                boxHeight: nextLayout.boxHeight,
            });
        }
    }, [annotationActions, selectedTextAnnotation]);

    // --- Refs ---
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const blurredImageCanvasRef = useRef<HTMLCanvasElement>(null);
    const imageElementRef = useRef<HTMLImageElement>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);

    const [displayDimensions, setDisplayDimensions] = useState<{ width: string; height: string }>({ width: "auto", height: "auto" });
    const activeTextFontSize = selectedTextAnnotation ? parseFontSize(selectedTextAnnotation.font) : defaultTextFontSize;
    const activeTextBoxWidth = selectedTextAnnotation?.boxWidth ?? defaultTextBoxWidth;
    const textBoxWidthMax = Math.max(
        260,
        (canvasRef.current?.width ?? imageElementRef.current?.naturalWidth ?? 920) - 32,
    );
    const displayWidthPx = useMemo(() => {
        const parsed = Number.parseFloat(displayDimensions.width);
        return Number.isFinite(parsed) ? parsed : 0;
    }, [displayDimensions.width]);
    const displayHeightPx = useMemo(() => {
        const parsed = Number.parseFloat(displayDimensions.height);
        return Number.isFinite(parsed) ? parsed : 0;
    }, [displayDimensions.height]);
    const currentEditorSignature = useMemo(() => JSON.stringify({
        capturedDataUrl,
        annotations,
    }), [annotations, capturedDataUrl]);
    const hasUnsavedChanges = Boolean(capturedDataUrl) && currentEditorSignature !== lastSavedSignatureRef.current;

    useEffect(() => {
        hasUnsavedChangesRef.current = hasUnsavedChanges;
    }, [hasUnsavedChanges]);

    const buildDefaultCropSelection = useCallback((): CropSelection | null => {
        const width = canvasRef.current?.width ?? imageElementRef.current?.naturalWidth ?? 0;
        const height = canvasRef.current?.height ?? imageElementRef.current?.naturalHeight ?? 0;
        if (!width || !height) {
            return null;
        }

        return {
            x: 0,
            y: 0,
            width,
            height,
        };
    }, []);

    const setEditorTool = useCallback((tool: Tool) => {
        if (tool === "crop") {
            if (selectedTool !== "crop") {
                lastNonCropToolRef.current = selectedTool;
            }
            setCropSelection((current) => current ?? buildDefaultCropSelection());
            setSelectedTool("crop");
            return;
        }

        lastNonCropToolRef.current = tool;
        setCropSelection(null);
        setSelectedTool(tool);
    }, [buildDefaultCropSelection, selectedTool]);

    const exitCropMode = useCallback(() => {
        setCropSelection(null);
        setSelectedTool(lastNonCropToolRef.current || "pen");
    }, []);

    const restoreEditorSnapshot = useCallback((snapshot: EditorSnapshot) => {
        setCapturedDataUrl(snapshot.dataUrl);
        setIsImageLoaded(false);
        setScrollOffset({ x: 0, y: 0 });
        setCropSelection(null);
        setSelectedTool((currentTool) => currentTool === "crop"
            ? (lastNonCropToolRef.current || "pen")
            : currentTool);
        annotationActions.replaceAnnotations(cloneAnnotations(snapshot.annotations));
    }, [annotationActions]);

    const handleUndoAction = useCallback(() => {
        if (annotationActions.undo()) {
            return true;
        }

        const previousSnapshot = cropUndoStack[cropUndoStack.length - 1];
        if (!previousSnapshot || !capturedDataUrl) {
            return false;
        }

        setCropUndoStack((prev) => prev.slice(0, -1));
        setCropRedoStack((prev) => [...prev, createEditorSnapshot(capturedDataUrl, annotations)]);
        restoreEditorSnapshot(previousSnapshot);
        return true;
    }, [annotationActions, annotations, capturedDataUrl, cropUndoStack, restoreEditorSnapshot]);

    const handleRedoAction = useCallback(() => {
        if (annotationActions.redo()) {
            return true;
        }

        const nextSnapshot = cropRedoStack[cropRedoStack.length - 1];
        if (!nextSnapshot || !capturedDataUrl) {
            return false;
        }

        setCropRedoStack((prev) => prev.slice(0, -1));
        setCropUndoStack((prev) => [...prev, createEditorSnapshot(capturedDataUrl, annotations)]);
        restoreEditorSnapshot(nextSnapshot);
        return true;
    }, [annotationActions, annotations, capturedDataUrl, cropRedoStack, restoreEditorSnapshot]);

    // --- IPC Listeners ---
    useEffect(() => {
        const cleanup = (window as any).electronAPI?.onCaptureData?.((event: any, data: any) => {
            if (data.success && data.dataUrl) {
                setCapturedDataUrl(data.dataUrl);
                annotationActions.resetAll();
                setIsImageLoaded(false);
                setCropSelection(null);
                setCropUndoStack([]);
                setCropRedoStack([]);
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
            if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) {
                    handleRedoAction();
                } else {
                    handleUndoAction();
                }
            } else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "y") {
                e.preventDefault();
                handleRedoAction();
            }
        };
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            cleanup?.();
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [annotationActions, handleRedoAction, handleUndoAction, isEditing, selectedAnnotationId]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && selectedTool === "crop") {
                exitCropMode();
            }
        };

        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [exitCropMode, selectedTool]);

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
    const performWindowClose = useCallback(() => {
        allowWindowCloseRef.current = true;
        (window as any).electronAPI.closeMainWindow();
        window.setTimeout(() => {
            allowWindowCloseRef.current = false;
        }, 1500);
    }, []);

    const requestClose = useCallback(() => {
        if (hasUnsavedChangesRef.current) {
            setShowClosePrompt(true);
            return;
        }
        performWindowClose();
    }, [performWindowClose]);

    const handleSave = useCallback(async (options?: { closeAfterSave?: boolean }) => {
        if (!canvasRef.current) return false;
        let exportCanvas = canvasRef.current;
        try {
            const entitlementState = await (window as any).electronAPI.license.getState();
            if (entitlementState?.watermarkEnabled) {
                exportCanvas = await buildWatermarkedCanvas(canvasRef.current);
            }
        } catch (error) {
            console.warn("[Editor] Failed to resolve entitlement state before saving screenshot:", error);
        }
        const dataUrl = exportCanvas.toDataURL("image/png");
        const result = await (window as any).electronAPI.saveImageAs(dataUrl);
        if (result?.success) {
            lastSavedSignatureRef.current = currentEditorSignature;
            if (options?.closeAfterSave) {
                setShowClosePrompt(false);
                performWindowClose();
            } else if (result.filePath) {
                showStatusAction(
                    `Saved image to ${result.filePath}`,
                    "Show in Folder",
                    () => { void (window as any).electronAPI.showItemInFolder(result.filePath); },
                );
            } else {
                showTimedStatus("Image saved.");
            }
            return true;
        }

        if (!result?.canceled) {
            showTimedStatus(result?.error || "Could not save image.", 4600);
        }
        return false;
    }, [currentEditorSignature, performWindowClose, showStatusAction, showTimedStatus]);

    const handleImport = useCallback(async () => {
        const result = await (window as any).electronAPI.importImage();
        if (result && result.success && result.dataUrl) {
            setCapturedDataUrl(result.dataUrl);
            annotationActions.resetAll();
            setIsImageLoaded(false);
            setCropSelection(null);
            setCropUndoStack([]);
            setCropRedoStack([]);
        }
    }, [annotationActions]);

    const handleDiscardAndClose = useCallback(() => {
        setShowClosePrompt(false);
        performWindowClose();
    }, [performWindowClose]);

    const handleSaveBeforeClose = useCallback(async () => {
        setIsSavingBeforeClose(true);
        try {
            await handleSave({ closeAfterSave: true });
        } finally {
            setIsSavingBeforeClose(false);
        }
    }, [handleSave]);

    const handleAddImageOverlay = useCallback(async () => {
        if (!capturedDataUrl || !canvasRef.current) {
            await handleImport();
            return;
        }

        const result = await (window as any).electronAPI.importImage();
        if (!result?.success || !result?.dataUrl) {
            return;
        }

        try {
            const importedImage = await loadImageElement(result.dataUrl);
            CanvasRenderer.primeImageCache(result.dataUrl, importedImage);

            const canvas = canvasRef.current;
            const maxDefaultWidth = Math.min(canvas.width * 0.28, 320, importedImage.naturalWidth);
            const minDefaultWidth = Math.min(canvas.width * 0.18, importedImage.naturalWidth);
            const width = Math.max(120, Math.round(Math.max(maxDefaultWidth, minDefaultWidth)));
            const aspectRatio = importedImage.naturalWidth / Math.max(1, importedImage.naturalHeight);
            const height = Math.max(48, Math.round(width / Math.max(aspectRatio, 0.1)));

            const imageAnnotation: ImageAnnotation = {
                id: `image_${Date.now()}`,
                type: "image",
                x: Math.max(16, Math.round((canvas.width - width) / 2)),
                y: Math.max(16, Math.round((canvas.height - height) / 2)),
                width,
                height,
                src: result.dataUrl,
                naturalWidth: importedImage.naturalWidth,
                naturalHeight: importedImage.naturalHeight,
                aspectRatio,
            };

            annotationActions.addAnnotation(imageAnnotation);
            annotationActions.selectAnnotation(imageAnnotation.id);
            setEditorTool("move");
        } catch (error) {
            console.error("[Editor] Failed to add overlay image:", error);
        }
    }, [annotationActions, capturedDataUrl, handleImport, setEditorTool]);

    

    const handleApplyCrop = useCallback(() => {
        if (!cropSelection || !imageElementRef.current || !capturedDataUrl) {
            return;
        }

        const sourceImage = imageElementRef.current;
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = Math.max(1, Math.round(cropSelection.width));
        cropCanvas.height = Math.max(1, Math.round(cropSelection.height));
        const context = cropCanvas.getContext("2d");
        if (!context) {
            return;
        }

        context.drawImage(
            sourceImage,
            cropSelection.x,
            cropSelection.y,
            cropSelection.width,
            cropSelection.height,
            0,
            0,
            cropCanvas.width,
            cropCanvas.height,
        );

        const nextDataUrl = cropCanvas.toDataURL("image/png");
        const nextAnnotations = annotations
            .map((annotation) => translateAnnotationForCrop(annotation, cropSelection))
            .filter((annotation): annotation is AnnotationObject => annotation !== null);

        setCropUndoStack((prev) => [...prev, createEditorSnapshot(capturedDataUrl, annotations)]);
        setCropRedoStack([]);
        setCapturedDataUrl(nextDataUrl);
        setIsImageLoaded(false);
        setScrollOffset({ x: 0, y: 0 });
        annotationActions.replaceAnnotations(nextAnnotations);
        exitCropMode();
    }, [annotations, annotationActions, capturedDataUrl, cropSelection, exitCropMode]);

    return (
        <>
            <style>
                {`
                    @keyframes editorShellSweep {
                        from {
                            transform: translateX(-150%) rotate(16deg);
                        }
                        to {
                            transform: translateX(240%) rotate(16deg);
                        }
                    }

                    @keyframes editorNoticeRise {
                        from {
                            opacity: 0;
                            transform: translate(-50%, -8px) scale(0.98);
                        }
                        to {
                            opacity: 1;
                            transform: translate(-50%, 0) scale(1);
                        }
                    }

                    .editor-scroll-area {
                        scrollbar-width: thin;
                        scrollbar-color: rgba(148, 163, 184, 0.46) rgba(15, 23, 42, 0.12);
                    }

                    .editor-scroll-area::-webkit-scrollbar {
                        width: 12px;
                        height: 12px;
                    }

                    .editor-scroll-area::-webkit-scrollbar-track {
                        background: rgba(15, 23, 42, 0.12);
                        border-radius: 999px;
                        margin: 12px;
                    }

                    .editor-scroll-area::-webkit-scrollbar-thumb {
                        background: linear-gradient(180deg, rgba(148, 163, 184, 0.72), rgba(100, 116, 139, 0.64));
                        border-radius: 999px;
                        border: 3px solid rgba(30, 30, 40, 0);
                        background-clip: padding-box;
                        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
                    }

                    .editor-scroll-area::-webkit-scrollbar-thumb:hover {
                        background: linear-gradient(180deg, rgba(191, 219, 254, 0.88), rgba(125, 211, 252, 0.82));
                    }

                    .editor-scroll-area::-webkit-scrollbar-corner {
                        background: transparent;
                    }

                    .editor-image-shell {
                        position: absolute;
                        inset: clamp(20px, 4vw, 42px);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        pointer-events: none;
                        z-index: 40;
                    }

                    .editor-image-shell-frame {
                        position: relative;
                        width: min(920px, calc(100vw - 160px));
                        min-height: min(62vh, 560px);
                        border-radius: 28px;
                        padding: 22px;
                        overflow: hidden;
                        border: 1px solid rgba(148, 163, 184, 0.16);
                        background:
                            linear-gradient(180deg, rgba(15, 23, 42, 0.88), rgba(15, 23, 42, 0.7)),
                            radial-gradient(circle at top, rgba(96, 165, 250, 0.08), transparent 48%);
                        box-shadow:
                            inset 0 1px 0 rgba(255, 255, 255, 0.05),
                            0 28px 80px rgba(2, 6, 23, 0.34);
                        backdrop-filter: blur(24px);
                    }

                    .editor-image-shell-frame::after {
                        content: "";
                        position: absolute;
                        inset: -35% auto -35% -22%;
                        width: 34%;
                        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.14), transparent);
                        animation: editorShellSweep 1.85s ${PREMIUM_EASE} infinite;
                    }

                    .editor-image-shell-top {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 14px;
                        margin-bottom: 18px;
                    }

                    .editor-image-shell-pill {
                        height: 12px;
                        border-radius: 999px;
                        background: rgba(148, 163, 184, 0.14);
                    }

                    .editor-image-shell-pillWide {
                        width: 34%;
                    }

                    .editor-image-shell-pillShort {
                        width: 18%;
                    }

                    .editor-image-shell-panel {
                        height: min(44vh, 420px);
                        border-radius: 22px;
                        margin-bottom: 18px;
                        background:
                            linear-gradient(180deg, rgba(148, 163, 184, 0.1), rgba(51, 65, 85, 0.16)),
                            rgba(15, 23, 42, 0.54);
                        border: 1px solid rgba(148, 163, 184, 0.12);
                    }

                    .editor-image-shell-lines {
                        display: grid;
                        gap: 10px;
                    }

                    .editor-image-shell-line {
                        height: 10px;
                        border-radius: 999px;
                        background: rgba(148, 163, 184, 0.12);
                    }

                    .editor-image-shell-lineMedium {
                        width: 54%;
                    }

                    .editor-image-shell-lineWide {
                        width: 72%;
                    }

                    .editor-image-shell-lineShort {
                        width: 38%;
                    }

                    .editor-status-action {
                        transition:
                            transform 180ms ${PREMIUM_EASE},
                            box-shadow 180ms ${PREMIUM_EASE},
                            background 180ms ${PREMIUM_EASE},
                            border-color 180ms ${PREMIUM_EASE};
                    }

                    .editor-status-action:hover {
                        transform: translateY(-1px);
                        box-shadow: 0 10px 22px rgba(37, 99, 235, 0.24);
                    }

                    .editor-status-action:active {
                        transform: translateY(1px) scale(0.985);
                    }
                `}
            </style>

            <div style={{
                display: "flex",
                flexDirection: "column",
                height: "100vh",
                background: EDITOR_APP_BACKGROUND,
                color: "white",
                overflow: "hidden",
                position: "relative",
            }}>
                {statusNotice && (
                    <div
                        style={{
                            position: "absolute",
                            top: 52,
                            left: "50%",
                            transform: "translateX(-50%)",
                            zIndex: 220,
                            padding: "11px 16px",
                            borderRadius: 999,
                            background: "linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.86))",
                            border: "1px solid rgba(148, 163, 184, 0.18)",
                            boxShadow: "0 22px 54px rgba(2, 6, 23, 0.38)",
                            color: "rgba(241, 245, 249, 0.96)",
                            fontSize: 12.5,
                            fontWeight: 600,
                            letterSpacing: "0.01em",
                            pointerEvents: statusNotice.onAction ? "auto" : "none",
                            backdropFilter: "blur(22px)",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            animation: `editorNoticeRise 280ms ${PREMIUM_EASE}`,
                        }}
                    >
                        <span>{statusNotice.message}</span>
                        {statusNotice.actionLabel && statusNotice.onAction && (
                            <button
                                className="editor-status-action"
                                type="button"
                                onClick={statusNotice.onAction}
                                style={{
                                    borderRadius: 999,
                                    border: "1px solid rgba(96, 165, 250, 0.24)",
                                    background: "linear-gradient(180deg, rgba(59, 130, 246, 0.18), rgba(37, 99, 235, 0.12))",
                                    color: "#dbeafe",
                                    padding: "6px 12px",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
                                }}
                            >
                                {statusNotice.actionLabel}
                            </button>
                        )}
                    </div>
                )}
                <Toolbar
                    onFullscreenCapture={() => (window as any).electronAPI.invokeCapture("fullscreen")}
                    onRegionCapture={() => (window as any).electronAPI.invokeCapture("region")}
                    onWindowCapture={() => (window as any).electronAPI.invokeCapture("window")}
                    isRecording={isRecording}
                    onStartRecording={() => handleStartRecording()}
                    onStopRecording={handleStopRecording}
                    selectedTool={selectedTool}
                    onToolSelect={setEditorTool}
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
                    hasSelectedTextAnnotation={!!selectedTextAnnotation}
                    textFontSize={activeTextFontSize}
                    textBoxWidth={activeTextBoxWidth}
                    textBoxWidthMax={textBoxWidthMax}
                    onBeginTextAdjustment={beginTextBoxAdjustment}
                    onTextFontSizeChange={handleTextFontSizeChange}
                    onTextBoxWidthChange={handleTextBoxWidthChange}
                    selectedHighlighterSize={selectedHighlighterSize}
                    onHighlighterSizeSelect={handleHighlighterSizeSelect}
                    selectedStepSize={selectedStepSize}
                    onStepSizeSelect={handleStepSizeSelect}
                    textColor={textColor}
                    onTextColorChange={handleTextColorChange}
                    nextStepNumber={stepCounter}
                    onUndo={handleUndoAction}
                    onRedo={handleRedoAction}
                    canUndo={canUndo() || cropUndoStack.length > 0}
                    canRedo={canRedo() || cropRedoStack.length > 0}
                    onSave={() => { void handleSave(); }}
                    onImport={handleImport}
                    onAddImageOverlay={handleAddImageOverlay}
                    selectedStepSymbol={stepSymbol}
                    onStepSymbolChange={handleStepSymbolChange}
                    selectedSymbolText={selectedSymbolText}
                    onSymbolTextChange={handleSymbolTextChange}
                    onClear={annotationActions.clearAnnotations}
                    isFullscreen={false}
                    isDarkMode={true}
                    onMinimize={() => (window as any).electronAPI.minimizeMainWindow()}
                    onMaximize={() => (window as any).electronAPI.maximizeMainWindow()}
                    onClose={requestClose}
                    hasCropSelection={!!cropSelection}
                    onApplyCrop={handleApplyCrop}
                                        onCancelCrop={exitCropMode}
                />

                <div
                    ref={canvasContainerRef}
                    className="editor-scroll-area"
                    style={{
                        flex: 1,
                        overflow: "auto",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        padding: "48px",
                        position: "relative"
                    }}
                >
                    <img ref={imageElementRef} style={{ display: "none" }} />
                    <canvas ref={blurredImageCanvasRef} style={{ display: "none" }} />

                    {capturedDataUrl && !isImageLoaded && (
                        <div className="editor-image-shell" aria-hidden="true">
                            <div className="editor-image-shell-frame">
                                <div className="editor-image-shell-top">
                                    <span className="editor-image-shell-pill editor-image-shell-pillWide" />
                                    <span className="editor-image-shell-pill editor-image-shell-pillShort" />
                                </div>
                                <div className="editor-image-shell-panel" />
                                <div className="editor-image-shell-lines">
                                    <span className="editor-image-shell-line editor-image-shell-lineWide" />
                                    <span className="editor-image-shell-line editor-image-shell-lineMedium" />
                                    <span className="editor-image-shell-line editor-image-shell-lineShort" />
                                </div>
                            </div>
                        </div>
                    )}

                    {capturedDataUrl ? (
                        <div
                            style={{
                                position: "relative",
                                width: displayDimensions.width,
                                height: displayDimensions.height,
                            }}
                        >
                            <canvas
                                ref={previewCanvasRef}
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    zIndex: 10,
                                    pointerEvents: "none",
                                    width: "100%",
                                    height: "100%",
                                }}
                            />
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
                                defaultTextFontSize={defaultTextFontSize}
                                defaultTextBoxWidth={defaultTextBoxWidth}
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
                                onToolSelect={setEditorTool}
                                dynamicCursorStyle={selectedTool === "move" || selectedTool === "select" ? "grab" : "crosshair"}
                            />
                            {selectedTool === "crop" && cropSelection && displayWidthPx > 0 && displayHeightPx > 0 && (
                                <ImageCropOverlay
                                    selection={cropSelection}
                                    imageWidth={canvasRef.current?.width ?? imageElementRef.current?.naturalWidth ?? 0}
                                    imageHeight={canvasRef.current?.height ?? imageElementRef.current?.naturalHeight ?? 0}
                                    displayWidth={displayWidthPx}
                                    displayHeight={displayHeightPx}
                                    onSelectionChange={setCropSelection}
                                />
                            )}
                        </div>
                    ) : (
                        <div
                            style={{
                                textAlign: "center",
                                padding: "30px 34px",
                                borderRadius: 24,
                                border: "1px solid rgba(148, 163, 184, 0.14)",
                                background: "linear-gradient(180deg, rgba(15, 23, 42, 0.72), rgba(15, 23, 42, 0.5))",
                                boxShadow: "0 24px 60px rgba(2, 6, 23, 0.24)",
                                backdropFilter: "blur(18px)",
                            }}
                        >
                            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.04em", marginBottom: 8 }}>ageofscreen</h1>
                            <p style={{ color: "rgba(226, 232, 240, 0.74)", fontSize: 14, lineHeight: 1.6 }}>
                                Capture something to start editing.
                            </p>
                        </div>
                    )}
                </div>
                <UnsavedChangesDialog
                    open={showClosePrompt}
                    title="Save your image before closing?"
                    message="You have changes in this screenshot that have not been saved yet. Save the image first, or close without saving."
                    saveLabel="Save Image"
                    onSave={() => { void handleSaveBeforeClose(); }}
                    onDiscard={handleDiscardAndClose}
                    onCancel={() => setShowClosePrompt(false)}
                    isSaving={isSavingBeforeClose}
                />
            </div>
        </>
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
