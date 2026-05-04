import React, { useRef, useCallback, useEffect } from 'react';
import type {
  Tool,
  PenSize,
  BlurMode,
  AnnotationObject,
  TextAnnotation,
  PenAnnotation,
  LineAnnotation,
  ArrowAnnotation,
  HighlighterAnnotation,
  RectangleAnnotation,
  EllipseAnnotation,
  StepAnnotation,
  BlurAnnotation,
  FocusRectangleAnnotation,
  SymbolAnnotation,
  ArrowType,
  StepType,
} from '../types';
import { textSizeValues } from '../styles';
import { CanvasRenderer } from '../services/canvasRenderer';

interface AnnotationCanvasProps {
  // Canvas refs
  canvasRef: React.RefObject<HTMLCanvasElement>;
  previewCanvasRef: React.RefObject<HTMLCanvasElement>;
  blurredImageCanvasRef: React.RefObject<HTMLCanvasElement>;
  imageElementRef: React.RefObject<HTMLImageElement>;
  canvasContainerRef: React.RefObject<HTMLDivElement>;

  // Image state
  isImageLoaded: boolean;
  capturedDataUrl: string | null;

  // Tool state
  selectedTool: Tool;
  penColor: string;
  selectedPenSize: PenSize;
  penWidth: number;
  highlighterColor: string;
  selectedHighlighterSize: PenSize;
  highlighterWidth: number;
  textColor: string;
  selectedTextSize: PenSize;
  defaultTextFontSize: number;
  isPlainText: boolean;
  stepColor: string;
  selectedStepSize: PenSize;
  selectedStepSymbol?: string;
  stepCounter: number;
  selectedSymbolText: string;
  selectedBlurMode: BlurMode;
  selectedArrowType: ArrowType;
  selectedStepType: StepType;
  blurBrushSize: number;

  // Drawing state
  isDrawing: boolean;
  setIsDrawing: (drawing: boolean) => void;
  lastPosition: { x: number; y: number } | null;
  setLastPosition: (pos: { x: number; y: number } | null) => void;

  // Annotation state
  annotations: AnnotationObject[];
  selectedAnnotationId: string | null;
  isEditing: boolean;

  // Annotation actions
  annotationActions: any; // TODO: Type this properly

  // UI state
  scrollOffset: { x: number; y: number };
  setScrollOffset: (offset: { x: number; y: number }) => void;
  dynamicCursorStyle: string;

  // Callbacks
  onStepCounterIncrement: () => void;
  onToolSelect?: (tool: Tool) => void; // New Prop
  isDarkMode: boolean;
}

export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  canvasRef,
  previewCanvasRef,
  blurredImageCanvasRef,
  imageElementRef,
  canvasContainerRef: _canvasContainerRef,
  isImageLoaded,
  capturedDataUrl,
  selectedTool,
  penColor,
  selectedPenSize,
  penWidth,
  highlighterColor,
  selectedHighlighterSize,
  highlighterWidth,
  textColor,
  selectedTextSize,
  defaultTextFontSize,
  isPlainText,
  stepColor,
  selectedStepSize,
  selectedStepSymbol,
  selectedStepType,
  stepCounter,
  selectedSymbolText,
  selectedBlurMode,
  selectedArrowType,
  blurBrushSize,
  isDrawing,
  setIsDrawing,
  lastPosition: _lastPosition,
  setLastPosition,
  annotations,
  selectedAnnotationId,
  isEditing,
  annotationActions,
  scrollOffset,
  setScrollOffset: _setScrollOffset,
  dynamicCursorStyle,
  onStepCounterIncrement,
  onToolSelect, // Destructure new prop
  isDarkMode,
}) => {
  const [hoverCursor, setHoverCursor] = React.useState<string | null>(null);
  const [blurCanvasVersion, setBlurCanvasVersion] = React.useState(0);

  const relativeStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const pendingStrokePointsRef = useRef<{ x: number; y: number }[]>([]);
  const strokeFrameRef = useRef<number | null>(null);
  const preparedBlurSourceRef = useRef<HTMLImageElement | null>(null);
  const imageResizeStateRef = useRef<{
    id: string;
    corner: "nw" | "ne" | "sw" | "se";
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startAnnotationX: number;
    startAnnotationY: number;
    aspectRatio: number;
  } | null>(null);

  const clearPreviewCanvas = useCallback(() => {
    const previewCanvas = previewCanvasRef.current;
    const ctx = previewCanvas?.getContext("2d");
    if (!previewCanvas || !ctx) return;
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  }, [previewCanvasRef]);

  const flushPendingStrokePoints = useCallback(() => {
    if (strokeFrameRef.current !== null) {
      window.cancelAnimationFrame(strokeFrameRef.current);
      strokeFrameRef.current = null;
    }

    const points = pendingStrokePointsRef.current;
    if (points.length === 0) return;

    pendingStrokePointsRef.current = [];
    if (annotationActions.addPointsToLastAnnotation) {
      annotationActions.addPointsToLastAnnotation(points);
      return;
    }

    points.forEach((point) => annotationActions.addPointToLastAnnotation(point));
  }, [annotationActions]);

  const queueStrokePoint = useCallback((point: { x: number; y: number }) => {
    pendingStrokePointsRef.current.push(point);
    if (strokeFrameRef.current !== null) return;

    strokeFrameRef.current = window.requestAnimationFrame(() => {
      strokeFrameRef.current = null;
      const points = pendingStrokePointsRef.current;
      if (points.length === 0) return;

      pendingStrokePointsRef.current = [];
      if (annotationActions.addPointsToLastAnnotation) {
        annotationActions.addPointsToLastAnnotation(points);
      } else {
        points.forEach((queuedPoint) => annotationActions.addPointToLastAnnotation(queuedPoint));
      }
    });
  }, [annotationActions]);

  useEffect(() => () => {
    if (strokeFrameRef.current !== null) {
      window.cancelAnimationFrame(strokeFrameRef.current);
    }
  }, []);

  const hasBlurAnnotations = annotations.some(
    (annotation) => annotation.type === "focusRect"
      || (annotation.type === "blur" && annotation.mode === "spot")
  );

  useEffect(() => {
    const img = imageElementRef.current;
    const blurCanvas = blurredImageCanvasRef.current;
    if (!isImageLoaded || !hasBlurAnnotations || !img || !blurCanvas) {
      return;
    }

    const needsRefresh = preparedBlurSourceRef.current !== img
      || blurCanvas.width !== img.naturalWidth
      || blurCanvas.height !== img.naturalHeight;
    if (!needsRefresh) {
      return;
    }

    let cancelled = false;
    const prepare = () => {
      if (cancelled) return;
      const ctx = blurCanvas.getContext("2d");
      if (!ctx) return;

      blurCanvas.width = img.naturalWidth;
      blurCanvas.height = img.naturalHeight;
      ctx.filter = "blur(10px)";
      ctx.drawImage(img, 0, 0);
      ctx.filter = "none";
      preparedBlurSourceRef.current = img;
      setBlurCanvasVersion((version) => version + 1);
    };

    const idleCallback = (window as any).requestIdleCallback as
      | ((callback: () => void, options?: { timeout: number }) => number)
      | undefined;
    const cancelIdleCallback = (window as any).cancelIdleCallback as
      | ((id: number) => void)
      | undefined;

    if (idleCallback && cancelIdleCallback) {
      const idleId = idleCallback(prepare, { timeout: 180 });
      return () => {
        cancelled = true;
        cancelIdleCallback(idleId);
      };
    }

    const timerId = window.setTimeout(prepare, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [annotations, blurredImageCanvasRef, hasBlurAnnotations, imageElementRef, isImageLoaded]);

  const findImageResizeHandleAtPoint = useCallback((x: number, y: number) => {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const annotation = annotations[i];
      if (annotation.type !== "image") continue;

      const handle = CanvasRenderer.getImageResizeHandles(annotation, null).find((candidate) => {
        const half = candidate.size / 2 + CanvasRenderer.IMAGE_HANDLE_HIT_PADDING;
        return (
          x >= candidate.x - half
          && x <= candidate.x + half
          && y >= candidate.y - half
          && y <= candidate.y + half
        );
      });

      if (handle) {
        return {
          annotation,
          corner: handle.corner,
        };
      }
    }

    return null;
  }, [annotations]);

  // Helper: Simple Hit Test
  const findAnnotationAtPoint = (x: number, y: number): string | null => {
    // iterate in reverse to hit top-most first
    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i];
      const bounds = CanvasRenderer.getAnnotationBounds(ann, null); // Pass null ctx for approx bounds
      if (bounds) {
        if (x >= bounds.x && x <= bounds.x + bounds.width &&
          y >= bounds.y && y <= bounds.y + bounds.height) {
          return ann.id;
        }
      }
    }
    return null;
  };

  useEffect(() => {
    clearPreviewCanvas();
  }, [clearPreviewCanvas, selectedTool]);

  // --- Mouse Event Handlers ---
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      // Store relative start position for shapes and other tools
      relativeStartPosRef.current = { x, y };

      if (selectedTool === "move" || selectedTool === "select") {
        const resizeTarget = findImageResizeHandleAtPoint(x, y);
        if (resizeTarget) {
          if (selectedAnnotationId !== resizeTarget.annotation.id) {
            annotationActions.selectAnnotation(resizeTarget.annotation.id);
          }
          annotationActions.saveStateToHistory?.();
          imageResizeStateRef.current = {
            id: resizeTarget.annotation.id,
            corner: resizeTarget.corner,
            startX: x,
            startY: y,
            startWidth: resizeTarget.annotation.width,
            startHeight: resizeTarget.annotation.height,
            startAnnotationX: resizeTarget.annotation.x,
            startAnnotationY: resizeTarget.annotation.y,
            aspectRatio: resizeTarget.annotation.aspectRatio || (resizeTarget.annotation.width / Math.max(1, resizeTarget.annotation.height)),
          };
          setIsDrawing(true);
          return;
        }
      }

      // Select/Move Logic
      if (selectedTool === "move" || selectedTool === "select") {
        const hitId = findAnnotationAtPoint(x, y);
        if (hitId) {
          annotationActions.selectAnnotation(hitId);
          annotationActions.startDragging(hitId, { x, y });
          setIsDrawing(true); // Re-use isDrawing to mean "interacting"
          setLastPosition({ x, y });
        } else {
          // Deselect if clicked empty space
          annotationActions.selectAnnotation(null);
        }
        return;
      }

      if (selectedTool === "pen") {
        setIsDrawing(true);
        setLastPosition({ x, y });

        // Start new pen annotation
        const newAnnotation: PenAnnotation = {
          id: `pen_${Date.now()}`,
          type: "pen",
          points: [{ x, y }],
          color: penColor,
          width: penWidth,
          size: selectedPenSize,
        };
        annotationActions.addAnnotation(newAnnotation);
      } else if (selectedTool === "highlighter") {
        setIsDrawing(true);
        setLastPosition({ x, y });

        // Start new highlighter annotation
        const newAnnotation: HighlighterAnnotation = {
          id: `highlighter_${Date.now()}`,
          type: "highlighter",
          points: [{ x, y }],
          color: highlighterColor,
          width: highlighterWidth,
          size: selectedHighlighterSize,
        };
        annotationActions.addAnnotation(newAnnotation);
      } else if (selectedTool === "blur" && selectedBlurMode === "spot") {
        setIsDrawing(true);
        setLastPosition({ x, y });

        // Start new spot blur annotation
        const newAnnotation: BlurAnnotation = {
          id: `blur_${Date.now()}`,
          type: "blur",
          mode: "spot",
          points: [{ x, y }],
          brushSize: blurBrushSize,
        };
        annotationActions.addAnnotation(newAnnotation);
      } else if (selectedTool === "step") {
        // Create step annotation immediately
        const fontSize = textSizeValues[selectedStepSize];
        const radius = fontSize * 0.8;

        const newAnnotation: StepAnnotation = {
          id: `step_${Date.now()}`,
          type: "step",
          cx: x,
          cy: y,
          radius: radius,
          number: stepCounter,
          color: stepColor,
          fontSize: fontSize,
          size: selectedStepSize,
          symbol: selectedStepSymbol,
          stepType: selectedStepType,
        };

        annotationActions.addAnnotation(newAnnotation);
        onStepCounterIncrement();

        // Auto-switch to move tool after placing step? Optional.
      } else if (selectedTool === "sticker" || selectedTool === "symbol") {
        const fontSize = textSizeValues[selectedStepSize] * 1.8; // Emojis should be larger

        const newAnnotation: SymbolAnnotation = {
          id: `symbol_${Date.now()}`,
          type: "symbol",
          x: x,
          y: y,
          symbol: selectedSymbolText || "❤️",
          color: stepColor, // Fallback color
          fontSize: fontSize,
          size: selectedStepSize,
        };

        annotationActions.addAnnotation(newAnnotation);
      } else if (["line", "arrow", "rectangle", "ellipse", "text"].includes(selectedTool)) {
        // Start interactive drawing for shapes AND text box
        setIsDrawing(true);
      } else if (selectedTool === "blur" && selectedBlurMode === "focus") {
        // Start drawing focus rectangle
        setIsDrawing(true);
      }
    },
    [
      selectedTool,
      penColor,
      penWidth,
      selectedPenSize,
      highlighterWidth,
      selectedHighlighterSize,
      selectedBlurMode,
      blurBrushSize,
      stepCounter,
      stepColor,
      selectedStepSize,
      selectedSymbolText,
      textSizeValues,
      highlighterColor,
      textColor,
      annotationActions,
      setIsDrawing,
      setLastPosition,
      onStepCounterIncrement,
      annotations, // Added dependency for hit test
      findImageResizeHandleAtPoint,
      selectedAnnotationId,
      selectedStepType,
    ]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      if (!isDrawing) {
        if (selectedTool === "move" || selectedTool === "select") {
          // Detect hover over resize handles
          const resizeTarget = findImageResizeHandleAtPoint(x, y);
          if (resizeTarget && resizeTarget.annotation.id === selectedAnnotationId) {
            const corner = resizeTarget.corner;
            const cursor = corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize";
            if (hoverCursor !== cursor) setHoverCursor(cursor);
          } else {
            const annId = findAnnotationAtPoint(x, y);
            if (annId) {
              if (hoverCursor !== "move") setHoverCursor("move");
            } else if (hoverCursor) {
              setHoverCursor(null);
            }
          }
        } else if (hoverCursor) {
          setHoverCursor(null);
        }
        return;
      }

      if ((selectedTool === "move" || selectedTool === "select") && imageResizeStateRef.current) {
        const resizeState = imageResizeStateRef.current;
        const corner = resizeState.corner;
        const cursor = corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize";
        if (hoverCursor !== cursor) setHoverCursor(cursor);

        const minWidth = 48;
        let nextWidth = resizeState.startWidth;

        if (resizeState.corner === "ne" || resizeState.corner === "se") {
          nextWidth = Math.max(minWidth, resizeState.startWidth + (x - resizeState.startX));
        } else {
          nextWidth = Math.max(minWidth, resizeState.startWidth - (x - resizeState.startX));
        }

        const aspectRatio = Math.max(0.1, resizeState.aspectRatio || 1);
        const nextHeight = Math.max(32, nextWidth / aspectRatio);
        const nextX = resizeState.corner === "nw" || resizeState.corner === "sw"
          ? resizeState.startAnnotationX + (resizeState.startWidth - nextWidth)
          : resizeState.startAnnotationX;
        const nextY = resizeState.corner === "nw" || resizeState.corner === "ne"
          ? resizeState.startAnnotationY + (resizeState.startHeight - nextHeight)
          : resizeState.startAnnotationY;

        (annotationActions.updateAnnotationLive ?? annotationActions.updateAnnotation)(resizeState.id, {
          x: nextX,
          y: nextY,
          width: nextWidth,
          height: nextHeight,
        });
        return;
      }

      // Dragging logic
      if (selectedTool === "move" || selectedTool === "select") {
        if (hoverCursor !== "grabbing") setHoverCursor("grabbing");
        const clampedX = Math.max(0, Math.min(canvas.width, x));
        const clampedY = Math.max(0, Math.min(canvas.height, y));
        annotationActions.updateDragOffset({ x: clampedX, y: clampedY });
        return;
      }

      if (selectedTool === "pen" || selectedTool === "highlighter" || (selectedTool === "blur" && selectedBlurMode === "spot")) {
        // Update the last pen/highlighter/blur annotation with new point
        queueStrokePoint({ x, y });
        setLastPosition({ x, y });
      } else {
        // Draw real-time preview for shapes on the preview canvas
        const previewCanvas = previewCanvasRef.current;
        if (previewCanvas && relativeStartPosRef.current) {
          const ctx = previewCanvas.getContext("2d");
          if (ctx) {
            const startPos = relativeStartPosRef.current;
            ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            ctx.save();
            ctx.translate(-scrollOffset.x, -scrollOffset.y);

            ctx.lineWidth = penWidth;

            if (selectedTool === "text") {
              // Text box preview - Premium Focus Frame
              const rx = Math.min(startPos.x, x);
              const ry = Math.min(startPos.y, y);
              const rw = Math.abs(x - startPos.x);
              const rh = Math.abs(y - startPos.y);

              // 1. Light background fill
              ctx.fillStyle = isDarkMode ? "rgba(255, 255, 255, 0.03)" : "rgba(125, 211, 252, 0.05)";
              ctx.fillRect(rx, ry, rw, rh);

              // 2. Subtle dashed border
              ctx.strokeStyle = textColor;
              ctx.globalAlpha = 0.4;
              ctx.setLineDash([4, 4]);
              ctx.lineWidth = 1;
              ctx.strokeRect(rx, ry, rw, rh);
              ctx.globalAlpha = 1.0;

              // 3. Corner Brackets (Premium look)
              ctx.setLineDash([]);
              ctx.lineWidth = 2;
              const cl = Math.min(12, rw / 3.5, rh / 3.5); // corner length
              
              if (cl > 2) {
                // Top-left
                ctx.beginPath();
                ctx.moveTo(rx, ry + cl); ctx.lineTo(rx, ry); ctx.lineTo(rx + cl, ry);
                ctx.stroke();
                // Top-right
                ctx.beginPath();
                ctx.moveTo(rx + rw - cl, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + cl);
                ctx.stroke();
                // Bottom-left
                ctx.beginPath();
                ctx.moveTo(rx, ry + rh - cl); ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + cl, ry + rh);
                ctx.stroke();
                // Bottom-right
                ctx.beginPath();
                ctx.moveTo(rx + rw - cl, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw, ry + rh - cl);
                ctx.stroke();
              }

              // 4. "Type here" hint
              ctx.font = "italic 13px sans-serif";
              ctx.fillStyle = textColor;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              if (rw > 50 && rh > 25) {
                ctx.fillText("Type here...", rx + rw / 2, ry + rh / 2);
              }
            } else if (selectedTool === "rectangle") {
              ctx.strokeStyle = penColor;
              ctx.fillStyle = penColor;
              const rx = Math.min(startPos.x, x);
              const ry = Math.min(startPos.y, y);
              const rw = Math.abs(x - startPos.x);
              const rh = Math.abs(y - startPos.y);
              CanvasRenderer.drawRectangleObject(ctx, {
                type: 'rectangle', x: rx, y: ry, width: rw, height: rh, color: penColor, lineWidth: penWidth
              } as any);
            } else if (selectedTool === "line") {
              ctx.strokeStyle = penColor;
              CanvasRenderer.drawLine(ctx, startPos.x, startPos.y, x, y);
            } else if (selectedTool === "arrow") {
              ctx.strokeStyle = penColor;
              ctx.fillStyle = penColor;
              CanvasRenderer.drawArrow(ctx, startPos.x, startPos.y, x, y, selectedArrowType);
            } else if (selectedTool === "ellipse") {
              ctx.strokeStyle = penColor;
              ctx.fillStyle = penColor;
              const rx = Math.min(startPos.x, x);
              const ry = Math.min(startPos.y, y);
              const rw = Math.abs(x - startPos.x);
              const rh = Math.abs(y - startPos.y);
              CanvasRenderer.drawEllipseObject(ctx, {
                type: 'ellipse', cx: rx + rw / 2, cy: ry + rh / 2, rx: rw / 2, ry: rh / 2, color: penColor, lineWidth: penWidth
              } as any);
            } else if (selectedTool === "blur" && selectedBlurMode === "focus") {
              ctx.strokeStyle = "rgba(0, 255, 0, 0.5)";
              ctx.setLineDash([5, 5]);
              ctx.strokeRect(Math.min(startPos.x, x), Math.min(startPos.y, y), Math.abs(x - startPos.x), Math.abs(y - startPos.y));
            }

            ctx.restore();
          }
        }
      }
    },

    [
      isDrawing,
      selectedTool,
      selectedBlurMode,
      annotationActions,
      setLastPosition,
      previewCanvasRef,
      scrollOffset,
      penColor,
      penWidth,
      textColor,
      findImageResizeHandleAtPoint,
      hoverCursor,
      queueStrokePoint,
      selectedArrowType,
      selectedStepType,
    ]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      if ((selectedTool === "move" || selectedTool === "select") && imageResizeStateRef.current) {
        imageResizeStateRef.current = null;
        setIsDrawing(false);
        return;
      }

      // Stop dragging if moving
      if (selectedTool === "move" || selectedTool === "select") {
        annotationActions.stopDragging();
        setIsDrawing(false);
        return;
      }

      if (selectedTool === "line" && relativeStartPosRef.current) {
        const startPos = relativeStartPosRef.current;
        const newAnnotation: LineAnnotation = {
          id: `line_${Date.now()}`,
          type: "line",
          startX: startPos.x,
          startY: startPos.y,
          endX: x,
          endY: y,
          color: penColor,
          width: penWidth,
          size: selectedPenSize,
        };
        annotationActions.addAnnotation(newAnnotation);
      } else if (selectedTool === "arrow" && relativeStartPosRef.current) {
        // Complete arrow drawing with user-defined start and end points
        const startPos = relativeStartPosRef.current;
        const newAnnotation: ArrowAnnotation = {
          id: `arrow_${Date.now()}`,
          type: "arrow",
          startX: startPos.x,
          startY: startPos.y,
          endX: x,
          endY: y,
          color: penColor,
          width: penWidth,
          size: selectedPenSize,
          arrowType: selectedArrowType,
        };
        annotationActions.addAnnotation(newAnnotation);
      } else if (selectedTool === "rectangle" && relativeStartPosRef.current) {
        // Complete rectangle drawing with user-defined bounds
        const startPos = relativeStartPosRef.current;
        const rectX = Math.min(startPos.x, x);
        const rectY = Math.min(startPos.y, y);
        const rectWidth = Math.abs(x - startPos.x);
        const rectHeight = Math.abs(y - startPos.y);

        // Only create rectangle if it has meaningful size
        if (rectWidth > 5 && rectHeight > 5) {
          const newAnnotation: RectangleAnnotation = {
            id: `rectangle_${Date.now()}`,
            type: "rectangle",
            x: rectX,
            y: rectY,
            width: rectWidth,
            height: rectHeight,
            color: penColor,
            lineWidth: penWidth,
            size: selectedPenSize,
          };
          annotationActions.addAnnotation(newAnnotation);
        }
      } else if (selectedTool === "ellipse" && relativeStartPosRef.current) {
        // Complete ellipse drawing with user-defined bounds
        const startPos = relativeStartPosRef.current;
        const centerX = (startPos.x + x) / 2;
        const centerY = (startPos.y + y) / 2;
        const radiusX = Math.abs(x - startPos.x) / 2;
        const radiusY = Math.abs(y - startPos.y) / 2;

        // Only create ellipse if it has meaningful size
        if (radiusX > 5 && radiusY > 5) {
          const newAnnotation: EllipseAnnotation = {
            id: `ellipse_${Date.now()}`,
            type: "ellipse",
            cx: centerX,
            cy: centerY,
            rx: radiusX,
            ry: radiusY,
            color: penColor,
            lineWidth: penWidth,
            size: selectedPenSize,
          };
          annotationActions.addAnnotation(newAnnotation);
        }
      } else if (selectedTool === "text" && relativeStartPosRef.current) {
        // Complete Text Box drawing
        const startPos = relativeStartPosRef.current;
        let rectX = Math.min(startPos.x, x);
        let rectY = Math.min(startPos.y, y);
        let rectWidth = Math.abs(x - startPos.x);
        let rectHeight = Math.abs(y - startPos.y);
        const minBoxHeight = Math.max(52, Math.round(defaultTextFontSize * 2.2));

        // If click without drag (small box), create a default box
        if (rectWidth < 15 || rectHeight < 15) {
          rectWidth = 140;
          rectHeight = minBoxHeight;
          // Center on click
          rectX = startPos.x - rectWidth / 2;
          rectY = startPos.y - rectHeight / 2;
        } else {
          // More precise: allow smaller boxes
          rectWidth = Math.max(40, rectWidth);
          rectHeight = Math.max(25, rectHeight);
        }

        // Adjust size of letters: if they draw a large box, scale the font size
        let fontSize = defaultTextFontSize;
        if (rectHeight > defaultTextFontSize * 2.5) {
            fontSize = Math.min(400, Math.round(rectHeight * 0.65));
        }

        const newAnnotation: TextAnnotation = {
          id: `text_${Date.now()}`,
          type: "text",
          x: rectX + 12,
          y: rectY + 12,
          content: "",
          color: textColor,
          font: `${fontSize}px sans-serif`,
          size: selectedTextSize,
          boxX: rectX,
          boxY: rectY,
          boxWidth: rectWidth,
          boxHeight: rectHeight,
          isPlainText: isPlainText
        };

        annotationActions.addAnnotation(newAnnotation);
        annotationActions.selectAnnotation(newAnnotation.id);
        annotationActions.startEditing(newAnnotation.id);

        if (window.electronAPI && window.electronAPI.focusMainWindow) {
          window.electronAPI.focusMainWindow();
        }

        // Auto-switch to Neutral Tool (pen or move)
        if (onToolSelect) {
          onToolSelect("move"); // Or "select" if "move" isn't a valid tool string
        }

      } else if (
        selectedTool === "blur" &&
        selectedBlurMode === "focus" &&
        relativeStartPosRef.current
      ) {
        // Complete focus rectangle drawing
        const startPos = relativeStartPosRef.current;
        const rectX = Math.min(startPos.x, x);
        const rectY = Math.min(startPos.y, y);
        const rectWidth = Math.abs(x - startPos.x);
        const rectHeight = Math.abs(y - startPos.y);

        // Only create focus rectangle if it has meaningful size
        if (rectWidth > 10 && rectHeight > 10) {
          const newAnnotation: FocusRectangleAnnotation = {
            id: `focusRect_${Date.now()}`,
            type: "focusRect",
            x: rectX,
            y: rectY,
            width: rectWidth,
            height: rectHeight,
          };
          annotationActions.addAnnotation(newAnnotation);
        }
      }

      flushPendingStrokePoints();

      // Clear preview canvas
      const previewCanvas = previewCanvasRef.current;
      if (previewCanvas) {
        const ctx = previewCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        }
      }

      // Always clear the start position ref to prevent stale values
      relativeStartPosRef.current = null;
      setIsDrawing(false);
    },
    [
      isDrawing,
      selectedTool,
      penColor,
      penWidth,
      selectedPenSize,
      textColor,
      selectedTextSize,
      defaultTextFontSize,
      isPlainText,
      selectedBlurMode,
      annotationActions,
      setIsDrawing,
      onToolSelect,
      flushPendingStrokePoints,
      selectedArrowType,
    ]
  );

  // Main Redraw Function with CanvasRenderer integration
  const redrawCanvas = useCallback(
    (annotationsToDraw: AnnotationObject[], includeImage = true) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      const imgElement = imageElementRef.current;

      if (!canvas || !context || !isImageLoaded) {
        return;
      }

      context.save();
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.translate(-scrollOffset.x, -scrollOffset.y);

      const focusRects = annotationsToDraw.filter(
        (a): a is FocusRectangleAnnotation => a.type === "focusRect"
      );

      if (includeImage && imgElement) {
        const blurredImageCanvas = blurredImageCanvasRef.current;
        const hasPreparedBlurCanvas = !!blurredImageCanvas
          && blurredImageCanvas.width === canvas.width
          && blurredImageCanvas.height === canvas.height;

        if (focusRects.length > 0 && hasPreparedBlurCanvas) {
          CanvasRenderer.applyFocusAreaBlur(
            context,
            canvas,
            focusRects[0],
            blurredImageCanvas,
            imgElement
          );
        } else {
          context.drawImage(imgElement, 0, 0);
        }
      }

      // Filter annotations to render
      const annotationsToRender = annotationsToDraw.filter((ann) => {
        if (ann.type === "focusRect") return false;
        if (ann.type === "blur" && ann.mode !== "spot") return false;

        if (focusRects.length > 0) {
          const annBounds = CanvasRenderer.getAnnotationBounds(ann, context);
          if (!annBounds) return false;

          return focusRects.some(
            (focusRect) =>
              annBounds.x >= focusRect.x &&
              annBounds.x + annBounds.width <= focusRect.x + focusRect.width &&
              annBounds.y >= focusRect.y &&
              annBounds.y + annBounds.height <= focusRect.y + focusRect.height
          );
        }
        return true;
      });

      // Use CanvasRenderer to draw all annotations
      CanvasRenderer.renderAnnotations(context, canvas, annotationsToRender, {
        selectedAnnotationId,
        isEditing,
        img: imgElement,
        scrollOffset,
        blurredImageCanvas: blurredImageCanvasRef.current,
      });

      context.restore();
    },
    [
      isImageLoaded,
      selectedAnnotationId,
      scrollOffset,
      isEditing,
      canvasRef,
      imageElementRef,
      blurredImageCanvasRef,
      blurCanvasVersion,
    ]
  );

  // Effect to redraw canvas when annotations change
  // Also runs a loop if editing to support cursor blinking
  useEffect(() => {
    if (
      isImageLoaded &&
      capturedDataUrl &&
      canvasRef.current &&
      imageElementRef.current
    ) {
      // Initial draw or update
      redrawCanvas(annotations);

      // If editing, refresh at the cursor blink cadence instead of redrawing at 60fps.
      if (isEditing) {
        const blinkIntervalId = window.setInterval(() => {
          redrawCanvas(annotations);
        }, 480);
        return () => window.clearInterval(blinkIntervalId);
      }
    }
  }, [annotations, isImageLoaded, capturedDataUrl, redrawCanvas, isEditing]);

  const applyTextContentChange = useCallback((
    annotation: TextAnnotation,
    nextContent: string,
    textMeasureContext: CanvasRenderingContext2D | null,
  ) => {
    const nextLayout = CanvasRenderer.getTextBoxLayout(annotation, textMeasureContext, nextContent);
    (annotationActions.updateAnnotationLive ?? annotationActions.updateAnnotation)(annotation.id, {
      content: nextContent,
      boxHeight: nextLayout.boxHeight,
    });
  }, [annotationActions]);

  // --- Keyboard Input for Text ---
  useEffect(() => {
    if (!isEditing || !selectedAnnotationId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Find the currently selected annotation
      const annotation = annotations.find(a => a.id === selectedAnnotationId);
      if (!annotation || annotation.type !== 'text') return;
      const textMeasureContext = canvasRef.current?.getContext("2d")
        ?? previewCanvasRef.current?.getContext("2d")
        ?? null;

      e.preventDefault(); // Prevent standard browser shortcuts/scrolling

      if (e.key === 'Backspace') {
        const newContent = annotation.content.slice(0, -1);
        applyTextContentChange(annotation, newContent, textMeasureContext);
      } else if (e.key === 'Enter') {
        if (e.shiftKey) {
          const newContent = annotation.content + '\n';
          applyTextContentChange(annotation, newContent, textMeasureContext);
        } else {
          // Finish editing on Enter (without Shift)
          annotationActions.stopEditing();
          // Switch to move tool so user can immediately drag
          if (onToolSelect) {
            onToolSelect("move");
          }
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Regular character input
        const newContent = annotation.content + e.key;
        applyTextContentChange(annotation, newContent, textMeasureContext);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [applyTextContentChange, isEditing, selectedAnnotationId, annotations, annotationActions, onToolSelect]);

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        border: "1px solid #ccc",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        // Removed fixed sizing/object-fit here, handled by parent/renderer to Fix Precision
        width: "100%",
        height: "100%",
        cursor: hoverCursor ?? dynamicCursorStyle,
      }}
    />
  );
};
