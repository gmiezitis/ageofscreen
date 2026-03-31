import React, { useRef, useCallback, useEffect } from 'react';
import type {
  Tool,
  PenSize,
  BlurMode,
  AnnotationObject,
  TextAnnotation,
  PenAnnotation,
  ArrowAnnotation,
  HighlighterAnnotation,
  RectangleAnnotation,
  EllipseAnnotation,
  StepAnnotation,
  BlurAnnotation,
  SymbolAnnotation,
  FocusRectangleAnnotation
} from '../types';
import {
  penSizeValues,
  textSizeValues,
  highlighterSizeValues
} from '../styles';
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
  stepColor: string;
  selectedStepSize: PenSize;
  selectedStepSymbol?: string;
  stepCounter: number;
  selectedSymbolText: string;
  selectedBlurMode: BlurMode;
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
}

export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  canvasRef,
  previewCanvasRef,
  blurredImageCanvasRef,
  imageElementRef,
  canvasContainerRef,
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
  stepColor,
  selectedStepSize,
  selectedStepSymbol,
  stepCounter,
  selectedSymbolText,
  selectedBlurMode,
  blurBrushSize,
  isDrawing,
  setIsDrawing,
  lastPosition,
  setLastPosition,
  annotations,
  selectedAnnotationId,
  isEditing,
  annotationActions,
  scrollOffset,
  setScrollOffset,
  dynamicCursorStyle,
  onStepCounterIncrement,
  onToolSelect, // Destructure new prop
}) => {
  // Refs for drag optimization
  const canvasRectRef = useRef<DOMRect | null>(null);
  const canvasScaleRef = useRef<{ x: number; y: number } | null>(null);
  const relativeStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const previewElementStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const penLastRelativePosRef = useRef<{ x: number; y: number } | null>(null);

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
        };

        annotationActions.addAnnotation(newAnnotation);
        onStepCounterIncrement();

        // Auto-switch to move tool after placing step? Optional.
      } else if (selectedTool === "symbol") {
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
      } else if (["arrow", "rectangle", "ellipse", "text"].includes(selectedTool)) {
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
      annotations // Added dependency for hit test
    ]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !isDrawing) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      // Dragging logic
      if ((selectedTool === "move" || selectedTool === "select")) {
        annotationActions.updateDragOffset({ x, y });
        return;
      }

      if (selectedTool === "pen" || selectedTool === "highlighter" || (selectedTool === "blur" && selectedBlurMode === "spot")) {
        // Update the last pen/highlighter/blur annotation with new point
        annotationActions.addPointToLastAnnotation({ x, y });
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
              // Text box preview (dashed line)
              const rx = Math.min(startPos.x, x);
              const ry = Math.min(startPos.y, y);
              const rw = Math.abs(x - startPos.x);
              const rh = Math.abs(y - startPos.y);

              ctx.strokeStyle = textColor;
              ctx.setLineDash([5, 5]);
              ctx.strokeRect(rx, ry, rw, rh);

              // Show "Text" hint in center
              ctx.font = "14px sans-serif";
              ctx.fillStyle = textColor;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              if (rw > 30 && rh > 20) {
                ctx.fillText("Type here", rx + rw / 2, ry + rh / 2);
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
            } else if (selectedTool === "arrow") {
              ctx.strokeStyle = penColor;
              ctx.fillStyle = penColor;
              CanvasRenderer.drawArrow(ctx, startPos.x, startPos.y, x, y);
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

      // Stop dragging if moving
      if (selectedTool === "move" || selectedTool === "select") {
        annotationActions.stopDragging();
        setIsDrawing(false);
        return;
      }

      if (selectedTool === "arrow" && relativeStartPosRef.current) {
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

        // If click without drag (small box), create a default box
        if (rectWidth < 10 || rectHeight < 10) {
          const defaultSize = textSizeValues[selectedTextSize] || 24;
          rectWidth = 200;
          rectHeight = defaultSize * 1.5;
          // Center on click
          rectX = startPos.x - rectWidth / 2;
          rectY = startPos.y - rectHeight / 2;
        }

        // Auto-size font to fit height approx 70% of box height
        const fontSize = Math.floor(rectHeight * 0.7);

        const newAnnotation: TextAnnotation = {
          id: `text_${Date.now()}`,
          type: "text",
          x: rectX,
          y: rectY + rectHeight / 2, // Baseline approx middle
          content: "",
          color: textColor,
          font: `${fontSize}px sans-serif`,
          size: selectedTextSize,
          boxX: rectX,
          boxY: rectY,
          boxWidth: rectWidth,
          boxHeight: rectHeight
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
      scrollOffset,
      highlighterColor,
      textColor,
      selectedTextSize,
      selectedBlurMode,
      annotationActions,
      setIsDrawing,
      textSizeValues,
      onToolSelect
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
        if (focusRects.length > 0 && blurredImageCanvasRef.current) {
          CanvasRenderer.applyFocusAreaBlur(
            context,
            canvas,
            focusRects[0],
            blurredImageCanvasRef.current,
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

      // If editing, start animation loop for cursor blink
      if (isEditing) {
        let animationFrameId: number;
        const renderLoop = () => {
          redrawCanvas(annotations);
          animationFrameId = requestAnimationFrame(renderLoop);
        };
        renderLoop(); // Start loop
        return () => cancelAnimationFrame(animationFrameId);
      }
    }
  }, [annotations, isImageLoaded, capturedDataUrl, redrawCanvas, isEditing]);

  // --- Keyboard Input for Text ---
  useEffect(() => {
    if (!isEditing || !selectedAnnotationId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Find the currently selected annotation
      const annotation = annotations.find(a => a.id === selectedAnnotationId);
      if (!annotation || annotation.type !== 'text') return;

      e.preventDefault(); // Prevent standard browser shortcuts/scrolling

      if (e.key === 'Backspace') {
        const newContent = annotation.content.slice(0, -1);
        annotationActions.updateTextContent(annotation.id, newContent);
      } else if (e.key === 'Enter') {
        if (e.shiftKey) {
          const newContent = annotation.content + '\n';
          annotationActions.updateTextContent(annotation.id, newContent);
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
        annotationActions.updateTextContent(annotation.id, newContent);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, selectedAnnotationId, annotations, annotationActions, onToolSelect]);

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
        cursor: dynamicCursorStyle,
      }}
    />
  );
};