import type {
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
} from '../types';

/**
 * CanvasRenderer - Centralized canvas drawing service
 * 
 * This service contains all canvas drawing logic extracted from App.tsx
 * to eliminate code duplication and improve maintainability.
 */
export class CanvasRenderer {

  // Utility: Convert hex color to rgba
  static hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Utility: Calculate bounds from points array
  static calculatePointsBounds(points: { x: number; y: number }[]): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null {
    if (!points || points.length === 0) return null;
    let minX = points[0].x, maxX = points[0].x;
    let minY = points[0].y, maxY = points[0].y;
    points.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
    return { minX, maxX, minY, maxY };
  }

  // Utility: Get text bounds
  static getTextBounds(
    annotation: TextAnnotation,
    ctx: CanvasRenderingContext2D | null
  ): { x: number; y: number; width: number; height: number } {
    // If we have explicit box bounds, return them
    if (annotation.boxWidth !== undefined && annotation.boxHeight !== undefined && annotation.boxX !== undefined && annotation.boxY !== undefined) {
      return {
        x: annotation.boxX,
        y: annotation.boxY,
        width: annotation.boxWidth,
        height: annotation.boxHeight
      };
    }

    if (!ctx) {
      const approxCharWidth = annotation.size === "s" ? 8 : annotation.size === "m" ? 10 : 14;
      const approxLineHeight = annotation.size === "s" ? 14 : annotation.size === "m" ? 18 : 28;
      const lines = annotation.content.split("\n");
      const maxLineWidth = Math.max(...lines.map((line) => line.length * approxCharWidth));
      return {
        x: annotation.x,
        y: annotation.y - approxLineHeight * 0.8,
        width: maxLineWidth,
        height: lines.length * approxLineHeight,
      };
    }
    ctx.save();
    ctx.font = annotation.font;
    const lines = annotation.content.split("\n");
    const metrics = lines.map((line) => ctx.measureText(line));
    const maxWidth = Math.max(...metrics.map((m) => m.width));
    const firstMetric = metrics[0];
    const fontHeight =
      (firstMetric.actualBoundingBoxAscent ?? firstMetric.fontBoundingBoxAscent ?? parseInt(ctx.font, 10)) +
      (firstMetric.actualBoundingBoxDescent ?? firstMetric.fontBoundingBoxDescent ?? 0);
    const totalHeight = fontHeight * lines.length;
    ctx.restore();
    return {
      x: annotation.x,
      y: annotation.y - (firstMetric.actualBoundingBoxAscent ?? fontHeight * 0.8),
      width: maxWidth,
      height: totalHeight,
    };
  }

  // Utility: Get annotation bounds
  static getAnnotationBounds(
    annotation: AnnotationObject,
    ctx: CanvasRenderingContext2D | null
  ): { x: number; y: number; width: number; height: number } | null {
    switch (annotation.type) {
      case "pen":
      case "highlighter": {
        if (!annotation.points || annotation.points.length === 0) return null;
        const penBounds = this.calculatePointsBounds(annotation.points);
        if (!penBounds) return null;
        const width = annotation.width;
        const halfWidth = width / 2;
        return {
          x: penBounds.minX - halfWidth,
          y: penBounds.minY - halfWidth,
          width: penBounds.maxX - penBounds.minX + width,
          height: penBounds.maxY - penBounds.minY + width,
        };
      }
      case "arrow": {
        const arrowHalfWidth = annotation.width / 2;
        return {
          x: Math.min(annotation.startX, annotation.endX) - arrowHalfWidth,
          y: Math.min(annotation.startY, annotation.endY) - arrowHalfWidth,
          width: Math.abs(annotation.startX - annotation.endX) + annotation.width,
          height: Math.abs(annotation.startY - annotation.endY) + annotation.width,
        };
      }
      case "text":
        return this.getTextBounds(annotation, ctx);
      case "rectangle": {
        const rectHalfWidth = annotation.lineWidth / 2;
        return {
          x: annotation.x - rectHalfWidth,
          y: annotation.y - rectHalfWidth,
          width: annotation.width + annotation.lineWidth,
          height: annotation.height + annotation.lineWidth,
        };
      }
      case "ellipse": {
        const ellipseHalfWidth = annotation.lineWidth / 2;
        return {
          x: annotation.cx - annotation.rx - ellipseHalfWidth,
          y: annotation.cy - annotation.ry - ellipseHalfWidth,
          width: (annotation.rx + ellipseHalfWidth) * 2,
          height: (annotation.ry + ellipseHalfWidth) * 2,
        };
      }
      case "step":
        return {
          x: annotation.cx - annotation.radius,
          y: annotation.cy - annotation.radius,
          width: annotation.radius * 2,
          height: annotation.radius * 2,
        };
      case "symbol":
        return {
          // Approximate bounds of a single emoji/symbol based on font size
          x: annotation.x - annotation.fontSize * 0.6,
          y: annotation.y - annotation.fontSize * 0.6,
          width: annotation.fontSize * 1.2,
          height: annotation.fontSize * 1.2,
        };
      case "blur": {
        if (annotation.mode === "spot" && annotation.points && annotation.points.length > 0) {
          const blurBounds = this.calculatePointsBounds(annotation.points);
          if (!blurBounds) return null;
          const spotBrushSize = annotation.brushSize ?? 10;
          const halfSpotBrush = spotBrushSize / 2;
          return {
            x: blurBounds.minX - halfSpotBrush,
            y: blurBounds.minY - halfSpotBrush,
            width: blurBounds.maxX - blurBounds.minX + spotBrushSize,
            height: blurBounds.maxY - blurBounds.minY + spotBrushSize,
          };
        }
      }
        return null;
      case "focusRect":
        return {
          x: annotation.x,
          y: annotation.y,
          width: annotation.width,
          height: annotation.height,
        };
      default:
        return null;
    }
  }

  // Drawing: Classic Simple Arrow helper
  static drawArrow(
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);

    // Classic proportions: simple and clear
    const headLength = Math.min(24, Math.max(16, ctx.lineWidth * 4));

    // Ultra pointy classic arrow angle (15 degrees total)
    const arrowHeadAngle = Math.PI / 12; // 15 degrees for ultra sharp classic look

    ctx.save();

    // Set line properties for consistent drawing
    ctx.lineCap = "round"; // Better appearance for arrows
    ctx.lineJoin = "round";

    // Draw the main line - simple and clean
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Draw classic triangular arrowhead - bigger and more visible
    ctx.beginPath();
    ctx.moveTo(toX, toY); // Arrow tip

    // Left side of arrowhead
    const leftX = toX - headLength * Math.cos(angle - arrowHeadAngle);
    const leftY = toY - headLength * Math.sin(angle - arrowHeadAngle);

    // Right side of arrowhead  
    const rightX = toX - headLength * Math.cos(angle + arrowHeadAngle);
    const rightY = toY - headLength * Math.sin(angle + arrowHeadAngle);

    // Create classic triangular arrowhead - fill AND stroke for better visibility
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();

    // Also stroke the arrowhead for better definition
    ctx.stroke();

    ctx.restore();
  }


  static drawTextObject(
    ctx: CanvasRenderingContext2D,
    annotation: TextAnnotation,
    options: {
      isEditing: boolean;
      selectedAnnotationId: string | null;
    }
  ) {
    const isCurrentlyEditing = options.isEditing && options.selectedAnnotationId === annotation.id;
    const hasBox = annotation.boxWidth !== undefined && annotation.boxHeight !== undefined;

    ctx.save();
    ctx.font = annotation.font;
    ctx.fillStyle = annotation.color;

    if (hasBox) {
      // BOX MODE: Center text in the drawn box
      const x = annotation.boxX!;
      const y = annotation.boxY!;
      const w = annotation.boxWidth!;
      const h = annotation.boxHeight!;

      ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.lineWidth = 1.5;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const centerX = x + w / 2;
      const centerY = y + h / 2;

      const text = annotation.content || "";

      // Render text (only if content exists)
      if (text) {
        ctx.fillStyle = annotation.color;
        ctx.fillText(text, centerX, centerY);
      }

      // Draw cursor if editing
      if (isCurrentlyEditing) {
        const metrics = ctx.measureText(text);
        const halfWidth = metrics.width / 2;
        // Cursor is at center + half width (right end of text)
        const cursorX = centerX + halfWidth + 2;
        const fontSize = parseInt(annotation.font, 10);

        // Blink
        if (Math.floor(Date.now() / 500) % 2 === 0) {
          ctx.beginPath();
          ctx.moveTo(cursorX, centerY - fontSize / 2);
          ctx.lineTo(cursorX, centerY + fontSize / 2);
          ctx.strokeStyle = annotation.color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Draw box border helper
        ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }
    } else {
      // LEGACY MODE (Click to type)
      if (annotation.content) {
        ctx.fillText(annotation.content, annotation.x, annotation.y);
      } else if (isCurrentlyEditing) {
        ctx.fillStyle = "rgba(128, 128, 128, 0.7)";
        ctx.fillText("Type here...", annotation.x, annotation.y);
      }

      // Draw blinking cursor if editing
      if (isCurrentlyEditing) {
        const cursorVisible = Math.floor(Date.now() / 500) % 2 === 0;
        if (cursorVisible) {
          const textWidth = ctx.measureText(annotation.content || "").width;
          const cursorX = annotation.x + textWidth;
          const fontSize = parseInt(annotation.font, 10);

          ctx.strokeStyle = annotation.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cursorX, annotation.y - fontSize + 5);
          ctx.lineTo(cursorX, annotation.y + 5);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // Drawing: Pen annotation
  static drawPenObject(ctx: CanvasRenderingContext2D, annotation: PenAnnotation) {
    if (annotation.points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = annotation.color;
    ctx.lineWidth = annotation.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
    for (let i = 1; i < annotation.points.length; i++) {
      ctx.lineTo(annotation.points[i].x, annotation.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Drawing: Arrow annotation
  static drawArrowObject(ctx: CanvasRenderingContext2D, annotation: ArrowAnnotation) {
    ctx.strokeStyle = annotation.color;
    ctx.lineWidth = annotation.width;
    ctx.fillStyle = annotation.color;
    this.drawArrow(ctx, annotation.startX, annotation.startY, annotation.endX, annotation.endY);
  }

  // Drawing: Highlighter annotation
  static drawHighlighterObject(ctx: CanvasRenderingContext2D, annotation: HighlighterAnnotation) {
    if (annotation.points.length < 2) return;

    ctx.save();
    const highlighterAlpha = 0.4;
    ctx.strokeStyle = this.hexToRgba(annotation.color, highlighterAlpha);
    ctx.lineWidth = annotation.width;
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
    for (let i = 1; i < annotation.points.length; i++) {
      ctx.lineTo(annotation.points[i].x, annotation.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Drawing: Rectangle annotation
  static drawRectangleObject(ctx: CanvasRenderingContext2D, annotation: RectangleAnnotation) {
    ctx.strokeStyle = annotation.color;
    ctx.lineWidth = annotation.lineWidth;
    ctx.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height);
  }

  // Drawing: Ellipse annotation
  static drawEllipseObject(ctx: CanvasRenderingContext2D, annotation: EllipseAnnotation) {
    ctx.strokeStyle = annotation.color;
    ctx.lineWidth = annotation.lineWidth;
    ctx.beginPath();
    ctx.ellipse(
      annotation.cx,
      annotation.cy,
      annotation.rx,
      annotation.ry,
      0, // rotation
      0, // startAngle
      2 * Math.PI // endAngle
    );
    ctx.stroke();
  }

  // Drawing: Step annotation
  static drawStepObject(ctx: CanvasRenderingContext2D, annotation: StepAnnotation) {
    const isNoCircle = annotation.symbol === 'none';

    // Draw Circle (unless symbol is 'none' which means no circle)
    if (!isNoCircle) {
      ctx.fillStyle = annotation.color;
      ctx.beginPath();
      ctx.arc(annotation.cx, annotation.cy, annotation.radius, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Draw Content
    ctx.fillStyle = isNoCircle ? annotation.color : "#FFFFFF";
    ctx.font = `${annotation.fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let content = annotation.number.toString();
    if (annotation.symbol === 'check') content = '✓';
    else if (annotation.symbol === 'x') content = '✕';
    else if (annotation.symbol === 'plus') content = '＋';

    ctx.fillText(content, annotation.cx, annotation.cy);
  }

  // Drawing: Symbol annotation
  static drawSymbolObject(ctx: CanvasRenderingContext2D, annotation: SymbolAnnotation) {
    ctx.save();
    ctx.fillStyle = annotation.color; // Used if the symbol is actually standard text, emojis mostly ignore this
    ctx.font = `${annotation.fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(annotation.symbol, annotation.x, annotation.y);
    ctx.restore();
  }

  // Effects: Apply focus area blur
  static applyFocusAreaBlur(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    area: { x: number; y: number; width: number; height: number },
    blurredImageCanvas: HTMLCanvasElement | null,
    img: HTMLImageElement
  ) {
    if (!blurredImageCanvas || !img) {
      console.warn("Blurred image canvas or original image is not available.");
      return;
    }

    try {
      // Step 1: Draw the pre-blurred image
      ctx.drawImage(
        blurredImageCanvas,
        0, 0, blurredImageCanvas.width, blurredImageCanvas.height,
        0, 0, img.naturalWidth, img.naturalHeight
      );

      // Step 2: Clip to focus area and draw original image
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.x, area.y, area.width, area.height);
      ctx.clip();
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
      ctx.restore();

      // Step 3: Draw border around focus area
      ctx.strokeStyle = "rgba(0, 255, 0, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(area.x, area.y, area.width, area.height);
    } catch (e) {
      console.error("Error applying focus area blur:", e);
      // Fallback: just draw the original image
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
    }
  }

  // Effects: Apply spot blur
  static applySpotBlur(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    points: { x: number; y: number }[],
    brushSize: number,
    img: HTMLImageElement,
    scrollOffset: { x: number; y: number }
  ) {
    if (!points || points.length === 0) return;

    try {
      // Create blur canvas
      const blurCanvas = document.createElement("canvas");
      blurCanvas.width = canvas.width;
      blurCanvas.height = canvas.height;
      const blurCtx = blurCanvas.getContext("2d");
      if (!blurCtx) return;

      // Apply transform and blur
      blurCtx.translate(-scrollOffset.x, -scrollOffset.y);
      blurCtx.filter = "blur(10px)";
      blurCtx.drawImage(img, 0, 0);
      blurCtx.filter = "none";
      blurCtx.resetTransform();

      // Apply blur for each point
      points.forEach((point: { x: number; y: number }) => {
        ctx.save();
        ctx.beginPath();
        const scaledRadius = brushSize;
        ctx.arc(point.x, point.y, scaledRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        const currentTransform = ctx.getTransform();
        ctx.resetTransform();
        ctx.drawImage(blurCanvas, 0, 0);
        ctx.setTransform(currentTransform);
        ctx.restore();
      });
    } catch (e) {
      console.error("Error applying spot blur:", e);
    }
  }

  // Drawing: Blur annotation (spot blur only)
  static drawBlurObject(
    ctx: CanvasRenderingContext2D,
    annotation: BlurAnnotation,
    canvas: HTMLCanvasElement,
    img: HTMLImageElement,
    scrollOffset: { x: number; y: number }
  ) {
    if (annotation.mode !== "spot" || !annotation.points || annotation.points.length === 0) {
      return;
    }
    this.applySpotBlur(
      ctx,
      canvas,
      annotation.points,
      annotation.brushSize || 10,
      img,
      scrollOffset
    );
  }

  // Main rendering function
  static renderAnnotations(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    annotations: AnnotationObject[],
    options: {
      selectedAnnotationId: string | null;
      isEditing: boolean;
      img?: HTMLImageElement;
      scrollOffset: { x: number; y: number };
    }
  ) {
    // Separate spot blurs to draw them last
    const spotBlurAnnotations = annotations.filter(
      (a): a is BlurAnnotation => a.type === "blur" && a.mode === "spot"
    );
    const otherAnnotations = annotations.filter(
      (a) => !(a.type === "blur" && a.mode === "spot")
    );

    // Draw non-blur annotations first
    otherAnnotations.forEach((annotation) => {
      switch (annotation.type) {
        case "pen":
          this.drawPenObject(ctx, annotation);
          break;
        case "text":
          this.drawTextObject(ctx, annotation, {
            isEditing: options.isEditing,
            selectedAnnotationId: options.selectedAnnotationId,
          });
          break;
        case "arrow":
          this.drawArrowObject(ctx, annotation);
          break;
        case "highlighter":
          this.drawHighlighterObject(ctx, annotation);
          break;
        case "rectangle":
          this.drawRectangleObject(ctx, annotation);
          break;
        case "ellipse":
          this.drawEllipseObject(ctx, annotation);
          break;
        case "step":
          this.drawStepObject(ctx, annotation);
          break;
        case "symbol":
          this.drawSymbolObject(ctx, annotation);
          break;
        // focusRects and other blur modes filtered out
      }
    });

    // Draw spot blurs on top
    if (options.img) {
      spotBlurAnnotations.forEach((annotation) => {
        this.drawBlurObject(ctx, annotation, canvas, options.img!, options.scrollOffset);
      });
    }

    // Draw selection highlight for non-text annotations
    const selectedAnnotation = [...otherAnnotations, ...spotBlurAnnotations].find(
      (a) => a.id === options.selectedAnnotationId
    );

    if (selectedAnnotation && selectedAnnotation.type !== "text") {
      const bounds = this.getAnnotationBounds(selectedAnnotation, ctx);
      if (bounds) {
        // Draw a solid selection border instead of dashed to avoid pulsing
        ctx.strokeStyle = "rgba(0, 100, 255, 0.8)";
        ctx.lineWidth = 2;
        ctx.strokeRect(bounds.x - 3, bounds.y - 3, bounds.width + 6, bounds.height + 6);

        // Draw corner handles for better visual feedback
        const handleSize = 6;
        ctx.fillStyle = "rgba(0, 100, 255, 0.8)";
        // Top-left
        ctx.fillRect(bounds.x - 3 - handleSize / 2, bounds.y - 3 - handleSize / 2, handleSize, handleSize);
        // Top-right
        ctx.fillRect(bounds.x + bounds.width + 3 - handleSize / 2, bounds.y - 3 - handleSize / 2, handleSize, handleSize);
        // Bottom-left
        ctx.fillRect(bounds.x - 3 - handleSize / 2, bounds.y + bounds.height + 3 - handleSize / 2, handleSize, handleSize);
        // Bottom-right
        ctx.fillRect(bounds.x + bounds.width + 3 - handleSize / 2, bounds.y + bounds.height + 3 - handleSize / 2, handleSize, handleSize);
      }
    }
  }
} 