import type {
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
  SymbolAnnotation,
  ImageAnnotation,
  ArrowType,
} from '../types';

/**
 * CanvasRenderer - Centralized canvas drawing service
 * 
 * This service contains all canvas drawing logic extracted from App.tsx
 * to eliminate code duplication and improve maintainability.
 */
export class CanvasRenderer {
  private static imageCache = new Map<string, HTMLImageElement>();

  static readonly SELECTION_PADDING = 3;
  static readonly IMAGE_HANDLE_SIZE = 14;
  static readonly IMAGE_HANDLE_HIT_PADDING = 4;
  static readonly ARROW_HEAD_LENGTH_MULTIPLIER = 6.2;
  static readonly ARROW_HEAD_MIN_LENGTH = 20;
  static readonly ARROW_HEAD_MAX_LENGTH = 34;
  static readonly ARROW_HEAD_HALF_ANGLE = Math.PI / 22;

  static primeImageCache(src: string, image: HTMLImageElement) {
    if (!src || !image) return;
    this.imageCache.set(src, image);
  }

  static getCachedImage(src: string): HTMLImageElement | null {
    if (!src) return null;

    const cached = this.imageCache.get(src);
    if (cached) return cached;

    const image = new Image();
    image.src = src;
    this.imageCache.set(src, image);
    return image;
  }

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
      const layout = this.getTextBoxLayout(annotation, ctx);
      return {
        x: layout.boxX,
        y: layout.boxY,
        width: layout.boxWidth,
        height: layout.boxHeight,
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

  static parseFontSize(font: string): number {
    const match = font.match(/(\d+(?:\.\d+)?)px/i);
    return match ? Number(match[1]) : 16;
  }

  static measureTextWidth(
    ctx: CanvasRenderingContext2D | null,
    text: string,
    fontSize: number,
  ): number {
    if (!text) return 0;
    return ctx ? ctx.measureText(text).width : text.length * fontSize * 0.56;
  }

  static wrapTextToWidth(
    ctx: CanvasRenderingContext2D | null,
    text: string,
    maxWidth: number,
    fontSize: number,
  ): string[] {
    const safeWidth = Math.max(16, maxWidth);
    const paragraphs = (text ?? "").replace(/\r/g, "").split("\n");
    const lines: string[] = [];

    for (const paragraph of paragraphs) {
      if (!paragraph.length) {
        lines.push("");
        continue;
      }

      const tokens = paragraph.match(/\S+\s*|\s+/g) ?? [paragraph];
      let currentLine = "";

      for (const token of tokens) {
        const candidate = `${currentLine}${token}`;
        if (!currentLine || this.measureTextWidth(ctx, candidate, fontSize) <= safeWidth) {
          currentLine = candidate;
          continue;
        }

        lines.push(currentLine.trimEnd());
        currentLine = "";

        if (this.measureTextWidth(ctx, token, fontSize) <= safeWidth) {
          currentLine = token;
          continue;
        }

        for (const character of token) {
          const charCandidate = `${currentLine}${character}`;
          if (!currentLine || this.measureTextWidth(ctx, charCandidate, fontSize) <= safeWidth) {
            currentLine = charCandidate;
          } else {
            lines.push(currentLine.trimEnd());
            currentLine = character;
          }
        }
      }

      lines.push(currentLine.trimEnd());
    }

    return lines.length > 0 ? lines : [""];
  }

  static normalizeHexColor(color: string): string | null {
    if (typeof color !== "string") {
      return null;
    }

    const trimmed = color.trim();
    if (!trimmed.startsWith("#")) {
      return null;
    }

    if (trimmed.length === 4) {
      const [, r, g, b] = trimmed;
      return `#${r}${r}${g}${g}${b}${b}`;
    }

    return trimmed.length === 7 ? trimmed : null;
  }

  static getRelativeLuminance(color: string): number {
    const normalized = this.normalizeHexColor(color);
    if (!normalized) {
      return 0;
    }

    const channels = [1, 3, 5].map((index) => {
      const channel = parseInt(normalized.slice(index, index + 2), 16) / 255;
      return channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });

    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }

  static resolveStepContent(annotation: StepAnnotation): string {
    if (annotation.symbol === "check") return "\u2713";
    if (annotation.symbol === "x") return "\u2715";
    if (annotation.symbol === "plus") return "+";
    return annotation.number.toString();
  }

  static getStepBadgeMetrics(
    annotation: StepAnnotation,
    ctx: CanvasRenderingContext2D | null,
  ): {
    content: string;
    radius: number;
    fontSize: number;
    textColor: string;
    textOutlineColor: string;
    textOutlineWidth: number;
    circleOutlineColor: string;
    circleOutlineWidth: number;
  } {
    const content = this.resolveStepContent(annotation);
    const fontSize = Math.max(12, annotation.fontSize);
    const textWidth = this.measureTextWidth(ctx, content, fontSize);
    const textPadding = Math.max(6, Math.round(fontSize * 0.38));
    const radius = Math.max(
      annotation.radius,
      Math.ceil(textWidth / 2 + textPadding),
      Math.ceil(fontSize * 0.72)
    );

    const luminance = this.getRelativeLuminance(annotation.color);
    const isHollow = annotation.stepType?.startsWith("outline-");
    
    const textColor = isHollow 
      ? annotation.color 
      : (luminance > 0.6 ? "#0f172a" : "#f8fafc");
      
    const textOutlineColor = luminance > 0.6 ? "rgba(255, 255, 255, 0.2)" : "rgba(15, 23, 42, 0.1)";
    const circleOutlineColor = isHollow ? annotation.color : (luminance > 0.6 ? "rgba(15, 23, 42, 0.12)" : "rgba(255, 255, 255, 0.1)");

    return {
      content,
      radius,
      fontSize,
      textColor,
      textOutlineColor,
      textOutlineWidth: Math.max(2, fontSize * 0.18),
      circleOutlineColor,
      circleOutlineWidth: Math.max(1.5, fontSize * 0.08),
    };
  }

  static getTextBoxLayout(
    annotation: TextAnnotation,
    ctx: CanvasRenderingContext2D | null,
    textOverride?: string,
    options?: {
      constrainToBox?: boolean;
    },
  ) {
    const fontSize = this.parseFontSize(annotation.font);
    const text = textOverride ?? annotation.content ?? "";
    
    const paddingX = Math.max(8, Math.round(fontSize * 0.4));
    const paddingY = Math.max(6, Math.round(fontSize * 0.3));

    let contentMaxWidth = 40;
    if (ctx) {
      ctx.save();
      ctx.font = annotation.font;
      const splitLines = text.split('\n');
      const metrics = splitLines.map((line) => ctx.measureText(line));
      contentMaxWidth = Math.max(40, ...metrics.map((m) => m.width)) + paddingX * 2 + 4;
      ctx.restore();
    } else {
      // Approximation for hit-testing without context
      const splitLines = text.split('\n');
      const approxWidths = splitLines.map((line) => line.length * fontSize * 0.56);
      contentMaxWidth = Math.max(40, ...approxWidths) + paddingX * 2 + 4;
    }

    const boxX = annotation.boxX ?? annotation.x;
    const boxY = annotation.boxY ?? Math.max(0, annotation.y - fontSize);
    const boxWidth = contentMaxWidth;
    const innerWidth = Math.max(24, boxWidth - paddingX * 2);

    const lines = text.split('\n');

    const lineHeight = Math.max(Math.round(fontSize * 1.28), fontSize + 6);
    const contentHeight = Math.max(lineHeight, lines.length * lineHeight);
    const boxHeight = contentHeight + paddingY * 2;

    return {
      boxX,
      boxY,
      boxWidth,
      boxHeight,
      paddingX,
      paddingY,
      innerWidth,
      fontSize,
      lineHeight,
      lines: lines,
      rawLines: lines,
      maxVisibleLines: lines.length,
      isOverflowing: false,
    };
  }

  static canTextContentFit(
    annotation: TextAnnotation,
    ctx: CanvasRenderingContext2D | null,
    text: string,
  ): boolean {
    const layout = this.getTextBoxLayout(annotation, ctx, text);
    return !layout.isOverflowing;
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
        const arrowPadding = Math.min(
          this.ARROW_HEAD_MAX_LENGTH,
          Math.max(this.ARROW_HEAD_MIN_LENGTH, annotation.width * this.ARROW_HEAD_LENGTH_MULTIPLIER),
        );
        return {
          x: Math.min(annotation.startX, annotation.endX) - arrowPadding,
          y: Math.min(annotation.startY, annotation.endY) - arrowPadding,
          width: Math.abs(annotation.startX - annotation.endX) + arrowPadding * 2,
          height: Math.abs(annotation.startY - annotation.endY) + arrowPadding * 2,
        };
      }
      case "line": {
        const lineHalfWidth = annotation.width / 2;
        return {
          x: Math.min(annotation.startX, annotation.endX) - lineHalfWidth,
          y: Math.min(annotation.startY, annotation.endY) - lineHalfWidth,
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
      case "step": {
        const stepMetrics = this.getStepBadgeMetrics(annotation, ctx);
        return {
          x: annotation.cx - stepMetrics.radius,
          y: annotation.cy - stepMetrics.radius,
          width: stepMetrics.radius * 2,
          height: stepMetrics.radius * 2,
        };
      }
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
      case "image":
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

  static getSelectionBounds(
    annotation: AnnotationObject,
    ctx: CanvasRenderingContext2D | null,
  ): { x: number; y: number; width: number; height: number } | null {
    const bounds = this.getAnnotationBounds(annotation, ctx);
    if (!bounds) {
      return null;
    }

    return {
      x: bounds.x - this.SELECTION_PADDING,
      y: bounds.y - this.SELECTION_PADDING,
      width: bounds.width + this.SELECTION_PADDING * 2,
      height: bounds.height + this.SELECTION_PADDING * 2,
    };
  }

  static getImageResizeHandles(
    annotation: ImageAnnotation,
    ctx: CanvasRenderingContext2D | null,
  ): Array<{
    corner: "nw" | "ne" | "sw" | "se";
    x: number;
    y: number;
    size: number;
  }> {
    const selectionBounds = this.getSelectionBounds(annotation, ctx);
    if (!selectionBounds) {
      return [];
    }

    return [
      { corner: "nw", x: selectionBounds.x, y: selectionBounds.y, size: this.IMAGE_HANDLE_SIZE },
      { corner: "ne", x: selectionBounds.x + selectionBounds.width, y: selectionBounds.y, size: this.IMAGE_HANDLE_SIZE },
      { corner: "sw", x: selectionBounds.x, y: selectionBounds.y + selectionBounds.height, size: this.IMAGE_HANDLE_SIZE },
      { corner: "se", x: selectionBounds.x + selectionBounds.width, y: selectionBounds.y + selectionBounds.height, size: this.IMAGE_HANDLE_SIZE },
    ];
  }

  // Drawing: Classic Simple Arrow helper
  static drawArrow(
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    arrowType: ArrowType = 'sharp'
  ) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 1) return;

    // Dynamic sizing based on line width
    const lw = Math.max(2, ctx.lineWidth);
    let headLength = Math.max(16, lw * 4.5);
    let headWidth = Math.max(12, lw * 3.5);
    let headIndentation = arrowType === 'standard' ? 0 : headLength * 0.35;

    if (arrowType === 'bold') {
      ctx.lineWidth *= 1.8;
      headLength *= 1.2;
      headWidth *= 1.3;
    } else if (arrowType === 'brush') {
      ctx.lineWidth *= 2.8;
      headLength *= 1.5;
      headWidth *= 1.8;
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Set line dash for dotted/dashed
    if (arrowType === 'dotted') {
      ctx.setLineDash([lw, lw * 1.5]);
    } else if (arrowType === 'dashed') {
      ctx.setLineDash([lw * 4, lw * 3]);
    }

    // --- Draw the Shaft ---
    const shaftEndX = toX - (headLength - headIndentation) * Math.cos(angle);
    const shaftEndY = toY - (headLength - headIndentation) * Math.sin(angle);
    
    if (arrowType === 'curved' || arrowType === 'brush') {
      // Draw a quadratic curve for "curved" or "brush" style
      const curveAmount = arrowType === 'brush' ? 0.12 : 0.15;
      const midX = (fromX + toX) / 2 - Math.sin(angle) * (length * curveAmount);
      const midY = (fromY + toY) / 2 + Math.cos(angle) * (length * curveAmount);
      
      if (arrowType === 'brush') {
        // Draw multiple strokes for a brush-like feel
        const offset = ctx.lineWidth * 0.15;
        ctx.save();
        
        // Main stroke
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.quadraticCurveTo(midX, midY, shaftEndX, shaftEndY);
        ctx.stroke();
        
        // Textured side strokes
        ctx.globalAlpha *= 0.6;
        ctx.lineWidth *= 0.8;
        
        ctx.beginPath();
        ctx.moveTo(fromX + Math.sin(angle) * offset, fromY - Math.cos(angle) * offset);
        ctx.quadraticCurveTo(midX + Math.sin(angle) * offset, midY - Math.cos(angle) * offset, shaftEndX, shaftEndY);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(fromX - Math.sin(angle) * offset, fromY + Math.cos(angle) * offset);
        ctx.quadraticCurveTo(midX - Math.sin(angle) * offset, midY + Math.cos(angle) * offset, shaftEndX, shaftEndY);
        ctx.stroke();
        
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.quadraticCurveTo(midX, midY, shaftEndX, shaftEndY);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(shaftEndX, shaftEndY);
      ctx.stroke();
    }

    // Reset dash for the head
    ctx.setLineDash([]);

    // --- Draw Double Head if needed ---
    if (arrowType === 'double') {
      this.drawArrowHead(ctx, fromX, fromY, angle + Math.PI, headLength, headWidth, headIndentation, false);
    }

    // --- Draw Fletchings (Feathers) ---
    if (arrowType === 'feathered' && length > headLength * 2.5) {
      const fletchingLength = headLength * 0.8;
      const fletchingWidth = headWidth * 0.9;
      const numFletchings = 3;
      const fletchingSpacing = lw * 2.5;

      ctx.beginPath();
      for (let i = 0; i < numFletchings; i++) {
        const fBaseX = fromX + (i * fletchingSpacing) * Math.cos(angle);
        const fBaseY = fromY + (i * fletchingSpacing) * Math.sin(angle);
        
        const fLeftX = fBaseX - fletchingLength * Math.cos(angle) - fletchingWidth * Math.sin(angle);
        const fLeftY = fBaseY - fletchingLength * Math.sin(angle) + fletchingWidth * Math.cos(angle);
        
        const fRightX = fBaseX - fletchingLength * Math.cos(angle) + fletchingWidth * Math.sin(angle);
        const fRightY = fBaseY - fletchingLength * Math.sin(angle) - fletchingWidth * Math.cos(angle);

        ctx.moveTo(fLeftX, fLeftY);
        ctx.lineTo(fBaseX, fBaseY);
        ctx.lineTo(fRightX, fRightY);
      }
      ctx.stroke();
    }

    // --- Draw the Arrowhead ---
    if (arrowType === 'brush') {
      ctx.save();
      // Draw a slightly messy, multi-stroke head
      this.drawArrowHead(ctx, toX, toY, angle, headLength, headWidth, headIndentation, false);
      
      ctx.globalAlpha *= 0.6;
      const offset = ctx.lineWidth * 0.1;
      this.drawArrowHead(ctx, toX + Math.sin(angle) * offset, toY - Math.cos(angle) * offset, angle, headLength * 0.95, headWidth * 0.95, headIndentation, false);
      this.drawArrowHead(ctx, toX - Math.sin(angle) * offset, toY + Math.cos(angle) * offset, angle, headLength * 0.95, headWidth * 0.95, headIndentation, false);
      
      ctx.restore();
    } else {
      this.drawArrowHead(ctx, toX, toY, angle, headLength, headWidth, headIndentation, arrowType === 'outline');
    }

    ctx.restore();
  }

  private static drawArrowHead(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    headLength: number,
    headWidth: number,
    headIndentation: number,
    isOutline: boolean
  ) {
    ctx.beginPath();
    ctx.moveTo(x, y); // Tip
    
    // Left back corner
    const leftX = x - headLength * Math.cos(angle) - (headWidth / 2) * Math.sin(angle);
    const leftY = y - headLength * Math.sin(angle) + (headWidth / 2) * Math.cos(angle);
    ctx.lineTo(leftX, leftY);

    // Inner indented point
    if (headIndentation > 0) {
      const innerX = x - (headLength - headIndentation) * Math.cos(angle);
      const innerY = y - (headLength - headIndentation) * Math.sin(angle);
      ctx.lineTo(innerX, innerY);
    }

    // Right back corner
    const rightX = x - headLength * Math.cos(angle) + (headWidth / 2) * Math.sin(angle);
    const rightY = y - headLength * Math.sin(angle) - (headWidth / 2) * Math.cos(angle);
    ctx.lineTo(rightX, rightY);

    ctx.closePath();
    
    if (isOutline) {
      ctx.stroke();
    } else {
      ctx.fill();
      ctx.stroke();
    }
  }

  static drawLine(
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
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
      const actualText = annotation.content || "";
      const displayText = actualText || (isCurrentlyEditing ? "Type here..." : "");
      const layout = this.getTextBoxLayout(annotation, ctx, displayText);
      const cursorLayout = this.getTextBoxLayout(annotation, ctx, actualText);

      if (!annotation.isPlainText) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 1.5;
        ctx.fillRect(layout.boxX, layout.boxY, layout.boxWidth, layout.boxHeight);
        ctx.strokeRect(layout.boxX, layout.boxY, layout.boxWidth, layout.boxHeight);
      }

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        layout.boxX - 5,
        layout.boxY - 5,
        Math.max(0, layout.boxWidth + 10),
        Math.max(0, layout.boxHeight + 10),
      );
      ctx.clip();

      if (displayText) {
        ctx.fillStyle = actualText ? annotation.color : "rgba(148, 163, 184, 0.92)";
        layout.lines.forEach((line, index) => {
          ctx.fillText(
            line,
            layout.boxX + layout.paddingX,
            layout.boxY + layout.paddingY + index * layout.lineHeight,
          );
        });
      }

      if (isCurrentlyEditing) {
        if (Math.floor(Date.now() / 500) % 2 === 0) {
          const cursorLines = cursorLayout.lines.length > 0 ? cursorLayout.lines : [""];
          const lastLine = cursorLines[cursorLines.length - 1] ?? "";
          const cursorX = cursorLayout.boxX + cursorLayout.paddingX + this.measureTextWidth(ctx, lastLine, cursorLayout.fontSize);
          const cursorY = cursorLayout.boxY + cursorLayout.paddingY + (cursorLines.length - 1) * cursorLayout.lineHeight;

          ctx.beginPath();
          ctx.moveTo(cursorX, cursorY + 2);
          ctx.lineTo(cursorX, cursorY + cursorLayout.lineHeight - 2);
          ctx.strokeStyle = annotation.color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.strokeStyle = "rgba(59, 130, 246, 0.65)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(layout.boxX, layout.boxY, layout.boxWidth, layout.boxHeight);
      }

      ctx.restore();
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
    this.drawArrow(ctx, annotation.startX, annotation.startY, annotation.endX, annotation.endY, annotation.arrowType);
  }

  static drawLineObject(ctx: CanvasRenderingContext2D, annotation: LineAnnotation) {
    ctx.strokeStyle = annotation.color;
    ctx.lineWidth = annotation.width;
    this.drawLine(ctx, annotation.startX, annotation.startY, annotation.endX, annotation.endY);
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
    const isNoCircle = annotation.symbol === "none";
    const badge = this.getStepBadgeMetrics(annotation, ctx);
    const type = annotation.stepType || "circle";

    ctx.save();

    // Draw Badge Shape (unless symbol is 'none')
    if (!isNoCircle) {
      ctx.fillStyle = annotation.color;
      ctx.strokeStyle = badge.circleOutlineColor;
      ctx.lineWidth = badge.circleOutlineWidth;

      const x = annotation.cx;
      const y = annotation.cy;
      const r = badge.radius;

      ctx.beginPath();
      if (type === "circle" || type === "outline-circle") {
        ctx.arc(x, y, r, 0, 2 * Math.PI);
      } else if (type === "square" || type === "outline-square") {
        ctx.rect(x - r, y - r, r * 2, r * 2);
      } else if (type === "hexagon") {
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 2;
          const px = x + r * Math.cos(angle);
          const py = y + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else if (type === "diamond") {
        ctx.moveTo(x, y - r * 1.1);
        ctx.lineTo(x + r * 1.1, y);
        ctx.lineTo(x, y + r * 1.1);
        ctx.lineTo(x - r * 1.1, y);
        ctx.closePath();
      } else if (type === "pill") {
        const w = r * 1.3;
        const h = r;
        // Draw pill shape manually for better compatibility
        ctx.moveTo(x - w + h, y - h);
        ctx.lineTo(x + w - h, y - h);
        ctx.arc(x + w - h, y, h, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(x - w + h, y + h);
        ctx.arc(x - w + h, y, h, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();
      }

      if (type.startsWith("outline-")) {
          ctx.stroke();
      } else {
          ctx.fill();
          ctx.stroke();
      }
    }

    // Draw Content
    ctx.fillStyle = badge.textColor;
    ctx.font = `600 ${badge.fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let content = badge.content;

    if (annotation.symbol === 'check') content = '✓';
    else if (annotation.symbol === 'x') content = '✕';
    else if (annotation.symbol === 'plus') content = '＋';

    void content;
    ctx.lineWidth = badge.textOutlineWidth;
    ctx.strokeStyle = badge.textOutlineColor;
    ctx.strokeText(badge.content, annotation.cx, annotation.cy);
    ctx.fillText(badge.content, annotation.cx, annotation.cy);
    ctx.restore();
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

  static drawImageObject(ctx: CanvasRenderingContext2D, annotation: ImageAnnotation) {
    const image = this.getCachedImage(annotation.src);
    if (!image || !image.complete) {
      return;
    }

    ctx.save();
    ctx.drawImage(image, annotation.x, annotation.y, annotation.width, annotation.height);
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
    _scrollOffset: { x: number; y: number },
    blurredImageCanvas: HTMLCanvasElement | null,
  ) {
    if (!points || points.length === 0) return;

    try {
      const blurCanvas = (
        blurredImageCanvas
        && blurredImageCanvas.width === canvas.width
        && blurredImageCanvas.height === canvas.height
      )
        ? blurredImageCanvas
        : (() => {
          const fallbackBlurCanvas = document.createElement("canvas");
          fallbackBlurCanvas.width = canvas.width;
          fallbackBlurCanvas.height = canvas.height;
          const blurCtx = fallbackBlurCanvas.getContext("2d");
          if (!blurCtx) return null;
          blurCtx.filter = "blur(10px)";
          blurCtx.drawImage(img, 0, 0);
          blurCtx.filter = "none";
          return fallbackBlurCanvas;
        })();

      if (!blurCanvas) return;

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
    scrollOffset: { x: number; y: number },
    blurredImageCanvas: HTMLCanvasElement | null,
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
      scrollOffset,
      blurredImageCanvas,
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
      blurredImageCanvas?: HTMLCanvasElement | null;
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
        case "line":
          this.drawLineObject(ctx, annotation);
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
        case "image":
          this.drawImageObject(ctx, annotation);
          break;
        // focusRects and other blur modes filtered out
      }
    });

    // Draw spot blurs on top
    if (options.img) {
      spotBlurAnnotations.forEach((annotation) => {
        this.drawBlurObject(
          ctx,
          annotation,
          canvas,
          options.img!,
          options.scrollOffset,
          options.blurredImageCanvas ?? null,
        );
      });
    }

    // Draw selection highlight for non-text annotations
    const selectedAnnotation = [...otherAnnotations, ...spotBlurAnnotations].find(
      (a) => a.id === options.selectedAnnotationId
    );

    if (selectedAnnotation && selectedAnnotation.type !== "text") {
      const selectionBounds = this.getSelectionBounds(selectedAnnotation, ctx);
      if (selectionBounds) {
        // Draw a solid selection border instead of dashed to avoid pulsing
        ctx.strokeStyle = "rgba(0, 100, 255, 0.8)";
        ctx.lineWidth = 2;
        ctx.strokeRect(selectionBounds.x, selectionBounds.y, selectionBounds.width, selectionBounds.height);

        // Draw corner handles for better visual feedback
        ctx.fillStyle = "rgba(0, 100, 255, 0.8)";

        if (selectedAnnotation.type === "image") {
          this.getImageResizeHandles(selectedAnnotation, ctx).forEach((handle) => {
            ctx.fillRect(
              handle.x - handle.size / 2,
              handle.y - handle.size / 2,
              handle.size,
              handle.size,
            );
          });
        } else {
          const handleSize = 6;
          // Top-left
          ctx.fillRect(selectionBounds.x - handleSize / 2, selectionBounds.y - handleSize / 2, handleSize, handleSize);
          // Top-right
          ctx.fillRect(selectionBounds.x + selectionBounds.width - handleSize / 2, selectionBounds.y - handleSize / 2, handleSize, handleSize);
          // Bottom-left
          ctx.fillRect(selectionBounds.x - handleSize / 2, selectionBounds.y + selectionBounds.height - handleSize / 2, handleSize, handleSize);
          // Bottom-right
          ctx.fillRect(selectionBounds.x + selectionBounds.width - handleSize / 2, selectionBounds.y + selectionBounds.height - handleSize / 2, handleSize, handleSize);
        }
      }
    }
  }

} 
