import { TextOverlay } from './types';

export const DEFAULT_TEXT_OVERLAY_FONT_STACK = 'Arial, Helvetica, sans-serif';
export type RenderedTextOverlaySprite = {
    file: string;
    width: number;
    height: number;
    hotspotX: number;
    hotspotY: number;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const normalizeHex = (value: string, fallback: string): string => {
    const trimmed = (value || '').trim();
    if (!trimmed) return fallback;
    const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    if (hex.length === 3) {
        return `#${hex.split('').map((char) => `${char}${char}`).join('')}`;
    }
    if (hex.length === 6) {
        return `#${hex}`;
    }
    return fallback;
};

const hexToRgba = (value: string, alpha: number, fallback: string): string => {
    const hex = normalizeHex(value, fallback).slice(1);
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha).toFixed(3)})`;
};

export const getTextOverlayFontFamily = (overlay: Pick<TextOverlay, 'fontFamily'>): string => (
    overlay.fontFamily?.trim() || DEFAULT_TEXT_OVERLAY_FONT_STACK
);

const getTextOverlayLines = (text: string): string[] => {
    const normalized = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    return lines.length > 0 ? lines : [''];
};

type TextOverlayLayout = {
    lines: string[];
    fontSize: number;
    fontWeight: string;
    fontFamily: string;
    lineHeight: number;
    hasBackground: boolean;
    padding: number;
    strokeWidth: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
    shadowBlur: number;
    showShadow: boolean;
    textWidth: number;
    textHeight: number;
    boxWidth: number;
    boxHeight: number;
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
};

const getTextOverlayLayout = (
    ctx: CanvasRenderingContext2D,
    overlay: TextOverlay,
    maxCanvasWidth?: number,
): TextOverlayLayout => {
    const fontSize = Math.max(10, Math.round(overlay.fontSize || 40));
    const fontWeight = overlay.fontWeight || 'normal';
    const fontFamily = getTextOverlayFontFamily(overlay);
    const lineHeight = Math.max(fontSize * 1.2, fontSize + 4); // Increased line height slightly

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

    // Initial split by explicit newlines
    const rawLines = getTextOverlayLines(overlay.text || '');

    // Determine max width for wrapping - use 80% of canvas if available, else a reasonable default
    const maxWidth = maxCanvasWidth ? maxCanvasWidth * 0.85 : 800;

    // Apply word wrapping to each raw line
    const wrappedLines: string[] = [];
    rawLines.forEach(line => {
        if (ctx.measureText(line).width > maxWidth) {
            wrappedLines.push(...wrapText(ctx, line, maxWidth));
        } else {
            wrappedLines.push(line);
        }
    });

    const lines = wrappedLines.length > 0 ? wrappedLines : [''];
    const hasBackground = Boolean(
        overlay.backgroundColor
        && (overlay.backgroundOpacity ?? 0) > 0
        && (overlay.padding ?? 0) > 0,
    );
    const padding = hasBackground ? Math.max(0, Math.round(overlay.padding ?? 0)) : 0;
    const strokeWidth = Math.max(0, Math.round(overlay.borderWidth ?? 0));
    const shadowOffsetX = Math.round(overlay.shadowOffsetX ?? 0);
    const shadowOffsetY = Math.round(overlay.shadowOffsetY ?? 0);
    const shadowBlur = Math.max(0, Math.round(overlay.shadowBlur ?? 0));
    const showShadow = Boolean(
        overlay.shadowColor
        && (shadowOffsetX !== 0 || shadowOffsetY !== 0 || shadowBlur !== 0),
    );

    const lineWidths = lines.map((line) => ctx.measureText(line).width);
    const textWidth = Math.max(1, ...lineWidths);
    // Added 0.1 * fontSize extra height to prevent descender cutoff
    const textHeight = Math.max(lineHeight, lines.length * lineHeight) + (fontSize * 0.1);
    const boxWidth = textWidth + padding * 2;
    const boxHeight = textHeight + padding * 2;

    return {
        lines,
        fontSize,
        fontWeight,
        fontFamily,
        lineHeight,
        hasBackground,
        padding,
        strokeWidth,
        shadowOffsetX,
        shadowOffsetY,
        shadowBlur,
        showShadow,
        textWidth,
        textHeight,
        boxWidth,
        boxHeight,
    };
};

const drawTextOverlay = (
    ctx: CanvasRenderingContext2D,
    overlay: TextOverlay,
    layout: TextOverlayLayout,
    centerX: number,
    centerY: number,
) => {
    const left = centerX - layout.boxWidth / 2;
    const top = centerY - layout.boxHeight / 2;

    ctx.font = `${layout.fontWeight} ${layout.fontSize}px ${layout.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    if (layout.hasBackground && overlay.backgroundColor) {
        ctx.fillStyle = hexToRgba(overlay.backgroundColor, overlay.backgroundOpacity ?? 0.8, '#0f172a');
        ctx.fillRect(left, top, layout.boxWidth, layout.boxHeight);
    }

    if (layout.showShadow && overlay.shadowColor) {
        ctx.shadowColor = overlay.shadowColor;
        ctx.shadowBlur = layout.shadowBlur;
        ctx.shadowOffsetX = layout.shadowOffsetX;
        ctx.shadowOffsetY = layout.shadowOffsetY;
    } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }

    ctx.fillStyle = normalizeHex(overlay.color, '#ffffff');
    if (layout.strokeWidth > 0) {
        ctx.lineWidth = layout.strokeWidth * 2;
        ctx.strokeStyle = normalizeHex(overlay.borderColor || '#020617', '#020617');
    }

    const firstLineCenterY = top + layout.padding + layout.lineHeight / 2;
    layout.lines.forEach((line, index) => {
        const lineY = firstLineCenterY + index * layout.lineHeight;
        if (layout.strokeWidth > 0) {
            ctx.strokeText(line, centerX, lineY);
        }
        ctx.fillText(line, centerX, lineY);
    });
};

export const renderTextOverlayToDataUrl = (
    overlay: TextOverlay,
    frameSize: { width: number; height: number },
): string | null => {
    if (typeof document === 'undefined') {
        return null;
    }

    const width = Math.max(2, Math.round(frameSize.width));
    const height = Math.max(2, Math.round(frameSize.height));
    if (width <= 0 || height <= 0) {
        return null;
    }

    const text = overlay.text || '';
    if (!text.trim()) {
        return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return null;
    }

    const layout = getTextOverlayLayout(ctx, overlay, width);
    const centerX = width * clamp01(overlay.x / 100);
    const centerY = height * clamp01(overlay.y / 100);
    drawTextOverlay(ctx, overlay, layout, centerX, centerY);

    return canvas.toDataURL('image/png');
};

export const renderTextOverlaySprite = (
    overlay: TextOverlay,
    maxWidth?: number,
): RenderedTextOverlaySprite | null => {
    if (typeof document === 'undefined') {
        return null;
    }

    const text = overlay.text || '';
    if (!text.trim()) {
        return null;
    }

    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    if (!measureCtx) {
        return null;
    }

    const layout = getTextOverlayLayout(measureCtx, overlay, maxWidth);
    const margin = Math.max(
        8,
        layout.strokeWidth * 2,
        Math.abs(layout.shadowOffsetX),
        Math.abs(layout.shadowOffsetY),
        layout.shadowBlur,
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.ceil(layout.boxWidth + margin * 2));
    canvas.height = Math.max(2, Math.ceil(layout.boxHeight + margin * 2));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return null;
    }

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    drawTextOverlay(ctx, overlay, layout, centerX, centerY);

    return {
        file: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
        hotspotX: centerX,
        hotspotY: centerY,
    };
};
