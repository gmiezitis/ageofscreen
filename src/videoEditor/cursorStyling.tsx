import React from 'react';
import type { InteractionEvent } from '../services/metadataRecorder';
import { CursorHighlightSettings, GlobalCursorStyle, normalizeCursorHighlightSettings } from './types';
import { buildCursorMotionActiveRanges, getFollowCursorPoint, getNativeCursorSuppressionState, getPreviewCursorPoint, getPreviewCursorState, invertTimeRanges, isTimeWithinRanges, mapCursorPointToViewport, mapCursorStateToViewport } from './utils';

export type StyledCursorStyle = Exclude<GlobalCursorStyle, 'original'>;

export type CursorOverlayMetrics = {
    width: number;
    height: number;
    hotspotX: number;
    hotspotY: number;
    backdropScale: number;
    backdropPadX: number;
    backdropPadY: number;
};

export type CursorPreviewVisualState = {
    x: number;
    y: number;
    isClicking: boolean;
    clickTimestamp: number | null;
    blurPx: number;
    rotationDeg: number;
    stretch: number;
    dx: number;
    dy: number;
    speed: number;
};

export type CursorOverlayData = {
    backdropFile?: string;
    backdropWidth?: number;
    backdropHeight?: number;
    backdropHotspotX?: number;
    backdropHotspotY?: number;
    cursorFile?: string;
    cursorWidth?: number;
    cursorHeight?: number;
    cursorHotspotX?: number;
    cursorHotspotY?: number;
    rippleFile?: string;
    rippleSize?: number;
    disabledRanges?: Array<{ startTime: number; endTime: number }>;
    track: Array<{ time: number; x: number; y: number }>;
    clicks: Array<{ time: number; x: number; y: number }>;
};

type CropRect = { x: number; y: number; width: number; height: number } | null | undefined;
type ExportFrameSize = { width: number; height: number };

const CURSOR_SAMPLE_WINDOW_SEC = 0.035;
const CURSOR_BLUR_SPEED = 20;
const CURSOR_TRAIL_MAX_BLUR = 5.5;
const CURSOR_ROTATION_MAX = 8;
const CURSOR_CLICK_RIPPLE_MS = 550;
const CURSOR_TRACK_SAMPLE_STEP = 1 / 45;
const CURSOR_TRACK_MOVE_THRESHOLD = 0.02;
const CURSOR_TRACK_TIME_THRESHOLD = 0.05;
const CURSOR_OVERLAY_MAX_POINTS = 112;
export const FOLLOW_CURSOR_TRACK_MAX_POINTS = 128;
const CURSOR_EXPORT_MATTE_SCALE = 1.42;
export const CURSOR_HIGHLIGHT_MAX_PIXEL_SIZE = 180;
const CURSOR_HIGHLIGHT_MIN_PIXEL_SIZE = 44;
const CURSOR_HIGHLIGHT_REFERENCE_STYLE: StyledCursorStyle = 'arrow';
const CURSOR_HIGHLIGHT_CURSOR_SCALE = 0.9;
const CURSOR_HIGHLIGHT_VISUAL_CENTER_X = 0.46;
const CURSOR_HIGHLIGHT_VISUAL_CENTER_Y = 0.42;
const CURSOR_HIGHLIGHT_BAKED_CURSOR_LAG_SEC = 1 / 30;
const CURSOR_AMBIENT_WAKE_MIN_DRIFT = 0.72;
const CURSOR_AMBIENT_WAKE_MAX_DRIFT = 1.58;
const CURSOR_AMBIENT_WAKE_MAX_SHIFT_PERCENT = 2.8;

export type CursorTrackMode = 'smooth' | 'direct' | 'follow';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const normalizeHexColor = (value: string): string => {
    const trimmed = value.trim();
    const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    if (hex.length === 3) {
        return `#${hex.split('').map((char) => `${char}${char}`).join('')}`;
    }
    if (hex.length === 6) {
        return `#${hex}`;
    }
    return '#f59e0b';
};
const hexToRgba = (value: string, alpha: number): string => {
    const hex = normalizeHexColor(value).slice(1);
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1).toFixed(3)})`;
};

const sampleTimedTrack = <T extends { time: number }>(points: T[], maxPoints: number): T[] => {
    if (points.length <= maxPoints || maxPoints < 2) return points;

    const result: T[] = [];
    const lastIndex = points.length - 1;
    for (let i = 0; i < maxPoints; i += 1) {
        const index = i === maxPoints - 1
            ? lastIndex
            : Math.round((i * lastIndex) / (maxPoints - 1));
        const point = points[index];
        if (result[result.length - 1] !== point) {
            result.push(point);
        }
    }

    return result;
};

const compressTimedTrack = (
    points: Array<{ time: number; x: number; y: number }>
): Array<{ time: number; x: number; y: number }> => points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return Math.abs(point.x - previous.x) > CURSOR_TRACK_MOVE_THRESHOLD
        || Math.abs(point.y - previous.y) > CURSOR_TRACK_MOVE_THRESHOLD
        || point.time - previous.time > CURSOR_TRACK_TIME_THRESHOLD;
});

const appendTrackEndpoint = (
    points: Array<{ time: number; x: number; y: number }>,
    cursorData: InteractionEvent[] | undefined,
    endTime: number,
    cropRect?: CropRect,
    mode: CursorTrackMode = 'smooth',
) => {
    if (endTime <= 0) return points;

    const lastPoint = points[points.length - 1];
    if (lastPoint && Math.abs(lastPoint.time - endTime) < 0.001) {
        return points;
    }

    const previewPoint = mode === 'follow'
        ? getFollowCursorPoint(cursorData, endTime)
        : getPreviewCursorPoint(cursorData, endTime, mode);
    const viewportPoint = mapCursorPointToViewport(previewPoint, cropRect);
    if (!viewportPoint) return points;

    return [
        ...points,
        {
            time: Number(endTime.toFixed(3)),
            x: Number(viewportPoint.x.toFixed(3)),
            y: Number(viewportPoint.y.toFixed(3)),
        },
    ];
};

export const isStyledCursorStyle = (style: GlobalCursorStyle): style is StyledCursorStyle => style !== 'original';

export const getCursorOverlayMetrics = (style: StyledCursorStyle): CursorOverlayMetrics => {
    if (style === 'hand') {
        return { width: 44, height: 50, hotspotX: 15.7, hotspotY: 5.7, backdropScale: 1.6, backdropPadX: 12, backdropPadY: 12 };
    }
    if (style === 'text') {
        return { width: 22, height: 44, hotspotX: 11, hotspotY: 22, backdropScale: 1.7, backdropPadX: 13, backdropPadY: 10 };
    }
    return { width: 31, height: 43, hotspotX: 4.1, hotspotY: 4.1, backdropScale: 1.56, backdropPadX: 10, backdropPadY: 10 };
};

export const getCursorClickRippleProgress = (
    clickTimestamp: number | null,
    displayTimeSeconds: number,
): number | null => {
    if (clickTimestamp == null) return null;
    const elapsed = displayTimeSeconds * 1000 - clickTimestamp;
    if (elapsed < 0 || elapsed > CURSOR_CLICK_RIPPLE_MS) return null;
    return clamp(elapsed / CURSOR_CLICK_RIPPLE_MS, 0, 1);
};

export const getCursorPreviewVisualState = (
    cursorData: InteractionEvent[] | undefined,
    displayTime: number,
    cropRect?: CropRect,
): CursorPreviewVisualState | null => {
    const current = mapCursorStateToViewport(getPreviewCursorState(cursorData, displayTime, 'smooth'), cropRect);
    if (!current) return null;

    const previous = mapCursorPointToViewport(
        getPreviewCursorPoint(cursorData, Math.max(0, displayTime - CURSOR_SAMPLE_WINDOW_SEC), 'smooth'),
        cropRect,
    );
    const next = mapCursorPointToViewport(
        getPreviewCursorPoint(cursorData, displayTime + CURSOR_SAMPLE_WINDOW_SEC, 'smooth'),
        cropRect,
    );

    let dx = 0;
    let dy = 0;
    if (previous && next) {
        dx = next.x - previous.x;
        dy = next.y - previous.y;
    } else if (previous) {
        dx = current.x - previous.x;
        dy = current.y - previous.y;
    } else if (next) {
        dx = next.x - current.x;
        dy = next.y - current.y;
    }

    const speed = Math.hypot(dx, dy) / Math.max(CURSOR_SAMPLE_WINDOW_SEC * 2, 0.001);
    const motionFactor = clamp(speed / CURSOR_BLUR_SPEED, 0, 1);

    return {
        ...current,
        blurPx: motionFactor * CURSOR_TRAIL_MAX_BLUR,
        rotationDeg: clamp(dx * 0.28, -CURSOR_ROTATION_MAX, CURSOR_ROTATION_MAX),
        stretch: 1 + motionFactor * 0.08 + (current.isClicking ? 0.03 : 0),
        dx,
        dy,
        speed,
    };
};

export const offsetCursorPointForAmbientWake = (
    point: { x: number; y: number },
    visualState: Pick<CursorPreviewVisualState, 'dx' | 'dy' | 'blurPx'> | null | undefined,
): { x: number; y: number } => {
    if (!visualState) {
        return point;
    }

    const motionStrength = clamp(visualState.blurPx / CURSOR_TRAIL_MAX_BLUR, 0, 1);
    const driftFactor = CURSOR_AMBIENT_WAKE_MIN_DRIFT
        + (CURSOR_AMBIENT_WAKE_MAX_DRIFT - CURSOR_AMBIENT_WAKE_MIN_DRIFT) * motionStrength;
    const wakeOffsetX = clamp(-visualState.dx * driftFactor, -CURSOR_AMBIENT_WAKE_MAX_SHIFT_PERCENT, CURSOR_AMBIENT_WAKE_MAX_SHIFT_PERCENT);
    const wakeOffsetY = clamp(-visualState.dy * driftFactor, -CURSOR_AMBIENT_WAKE_MAX_SHIFT_PERCENT, CURSOR_AMBIENT_WAKE_MAX_SHIFT_PERCENT);

    return {
        x: clamp(point.x + wakeOffsetX, 0, 100),
        y: clamp(point.y + wakeOffsetY, 0, 100),
    };
};

export const renderStyledCursorGraphic = (style: StyledCursorStyle): React.ReactNode => {
    const metrics = getCursorOverlayMetrics(style);

    if (style === 'hand') {
        return (
            <svg width={metrics.width} height={metrics.height} viewBox="0 0 32 36" aria-hidden="true">
                <path
                    d="M8.4 31.1c-3.2 0-5.8-2.6-5.8-5.8V16.1c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5v2.6h1.8V7.2c0-1.9 1.5-3.4 3.3-3.4 1.8 0 3.3 1.5 3.3 3.4v11.5h1.8V6.1c0-1.7 1.4-3.1 3.1-3.1s3.1 1.4 3.1 3.1v12.6h1.6V9.6c0-1.5 1.2-2.7 2.7-2.7s2.7 1.2 2.7 2.7v11.6c0 6.4-5.2 11.6-11.6 11.6h-4.5l-4.9 3.2 1-4.9H8.4Z"
                    fill="#ffffff"
                    stroke="#1f2937"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                />
            </svg>
        );
    }

    if (style === 'text') {
        return (
            <svg width={metrics.width} height={metrics.height} viewBox="0 0 18 32" aria-hidden="true">
                <path
                    d="M9 2.5v27M4.5 4.8h9M4.5 27.2h9"
                    fill="none"
                    stroke="rgba(17,24,39,0.95)"
                    strokeWidth="2.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <path
                    d="M9 2.5v27M4.5 4.8h9M4.5 27.2h9"
                    fill="none"
                    stroke="rgba(255,255,255,0.98)"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        );
    }

    return (
        <svg width={metrics.width} height={metrics.height} viewBox="0 0 22 32" aria-hidden="true">
            <path
                d="M2.8 2.4v24.4l5.8-5 3.8 8.6 3.6-1.6-3.7-8.2h6.8L2.8 2.4Z"
                fill="#fcfcfd"
                stroke="#23262d"
                strokeWidth="1.45"
                strokeLinejoin="round"
            />
            <path
                d="M5.2 7.8v14.1l3.7-3.1c.2-.2.5-.2.7-.1l1.4.6-5.8-11.5Z"
                fill="#d8dde5"
                opacity="0.9"
            />
        </svg>
    );
};

const drawArrowCursor = (ctx: CanvasRenderingContext2D, mode: 'sprite' | 'matte') => {
    const pointerPath = new Path2D('M3.4 3.1L3.4 29L10 23.3L14 32.4L18 30.7L14.1 21.9H21.2L3.4 3.1Z');
    const pointerShadePath = new Path2D('M5.3 8.4V22.8l4.2-3.6c.2-.2.5-.2.8-.1l1.6.7L5.3 8.4Z');
    ctx.translate(0.5, 0.5);
    ctx.fillStyle = mode === 'matte' ? 'rgba(255,255,255,0.96)' : '#ffffff';
    ctx.strokeStyle = mode === 'matte' ? 'rgba(255,255,255,0.96)' : '#111827';
    ctx.lineWidth = mode === 'matte' ? 2.3 : 1.4;
    ctx.fill(pointerPath);
    ctx.stroke(pointerPath);
    if (mode === 'sprite') {
        ctx.fillStyle = '#d8dde5';
        ctx.fill(pointerShadePath);
    }
};

const drawHandCursor = (ctx: CanvasRenderingContext2D, mode: 'sprite' | 'matte') => {
    const handPath = new Path2D('M8.4 31.1c-3.2 0-5.8-2.6-5.8-5.8V16.1c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5v2.6h1.8V7.2c0-1.9 1.5-3.4 3.3-3.4 1.8 0 3.3 1.5 3.3 3.4v11.5h1.8V6.1c0-1.7 1.4-3.1 3.1-3.1s3.1 1.4 3.1 3.1v12.6h1.6V9.6c0-1.5 1.2-2.7 2.7-2.7s2.7 1.2 2.7 2.7v11.6c0 6.4-5.2 11.6-11.6 11.6h-4.5l-4.9 3.2 1-4.9H8.4Z');
    ctx.translate(0.5, 0.5);
    ctx.fillStyle = mode === 'matte' ? 'rgba(255,255,255,0.96)' : '#ffffff';
    ctx.strokeStyle = mode === 'matte' ? 'rgba(255,255,255,0.96)' : '#111827';
    ctx.lineWidth = mode === 'matte' ? 2.5 : 1.6;
    ctx.fill(handPath);
    ctx.stroke(handPath);
};

const drawTextCursor = (ctx: CanvasRenderingContext2D, mode: 'sprite' | 'matte') => {
    ctx.translate(0.5, 0.5);
    ctx.strokeStyle = mode === 'matte' ? 'rgba(255,255,255,0.96)' : '#111827';
    ctx.lineWidth = mode === 'matte' ? 4 : 2.3;
    ctx.beginPath();
    ctx.moveTo(9, 3);
    ctx.lineTo(9, 31);
    ctx.moveTo(4.5, 4.8);
    ctx.lineTo(13.5, 4.8);
    ctx.moveTo(4.5, 27.2);
    ctx.lineTo(13.5, 27.2);
    ctx.stroke();
    if (mode === 'sprite') {
        ctx.strokeStyle = 'rgba(255,255,255,0.98)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(9, 3);
        ctx.lineTo(9, 31);
        ctx.moveTo(4.5, 4.8);
        ctx.lineTo(13.5, 4.8);
        ctx.moveTo(4.5, 27.2);
        ctx.lineTo(13.5, 27.2);
        ctx.stroke();
    }
};

const drawStyledCursorOnCanvas = (
    ctx: CanvasRenderingContext2D,
    style: StyledCursorStyle,
    mode: 'sprite' | 'matte',
) => {
    if (style === 'hand') {
        drawHandCursor(ctx, mode);
        return;
    }
    if (style === 'text') {
        drawTextCursor(ctx, mode);
        return;
    }
    drawArrowCursor(ctx, mode);
};

export const createStyledCursorSprite = (style: StyledCursorStyle) => {
    const metrics = getCursorOverlayMetrics(style);
    const canvas = document.createElement('canvas');
    canvas.width = metrics.width;
    canvas.height = metrics.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.3)';
    ctx.shadowBlur = 6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    drawStyledCursorOnCanvas(ctx, style, 'sprite');

    ctx.restore();

    return {
        file: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
        hotspotX: metrics.hotspotX,
        hotspotY: metrics.hotspotY,
    };
};

export const createCursorHighlightReplacementCursorSprite = () => {
    const sprite = createStyledCursorSprite(CURSOR_HIGHLIGHT_REFERENCE_STYLE);
    if (!sprite) return null;

    return {
        ...sprite,
        width: Math.max(2, Math.round(sprite.width * CURSOR_HIGHLIGHT_CURSOR_SCALE)),
        height: Math.max(2, Math.round(sprite.height * CURSOR_HIGHLIGHT_CURSOR_SCALE)),
        hotspotX: Number((sprite.hotspotX * CURSOR_HIGHLIGHT_CURSOR_SCALE).toFixed(2)),
        hotspotY: Number((sprite.hotspotY * CURSOR_HIGHLIGHT_CURSOR_SCALE).toFixed(2)),
    };
};

export const createCursorBackdropSprite = (style: StyledCursorStyle) => {
    const metrics = getCursorOverlayMetrics(style);
    const padX = Math.max(metrics.backdropPadX + 2, 10);
    const padY = Math.max(metrics.backdropPadY + 2, 10);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(metrics.width * CURSOR_EXPORT_MATTE_SCALE + padX * 2);
    canvas.height = Math.ceil(metrics.height * CURSOR_EXPORT_MATTE_SCALE + padY * 2);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.22)';
    ctx.shadowBlur = 8;
    ctx.translate(padX + metrics.hotspotX, padY + metrics.hotspotY);
    ctx.scale(CURSOR_EXPORT_MATTE_SCALE, CURSOR_EXPORT_MATTE_SCALE);
    ctx.translate(-metrics.hotspotX, -metrics.hotspotY);
    drawStyledCursorOnCanvas(ctx, style, 'matte');
    ctx.restore();

    return {
        file: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
        hotspotX: padX + metrics.hotspotX,
        hotspotY: padY + metrics.hotspotY,
    };
};

export const createCursorRippleSprite = (color = '#ffffff') => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const mid = canvas.width / 2;
    const ringColor = color === '#ffffff' ? 'rgba(255, 255, 255, 0.92)' : hexToRgba(color, 0.94);
    ctx.save();
    ctx.shadowColor = color === '#ffffff' ? 'rgba(255, 255, 255, 0.22)' : hexToRgba(color, 0.4);
    ctx.shadowBlur = 16;
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mid, mid, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    return {
        file: canvas.toDataURL('image/png'),
        size: canvas.width,
    };
};

const traceRoundedRectPath = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
) => {
    const safeRadius = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
    if ((ctx as any).roundRect) {
        (ctx as any).roundRect(x, y, width, height, safeRadius);
        return;
    }

    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.arcTo(x + width, y, x + width, y + safeRadius, safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.arcTo(x + width, y + height, x + width - safeRadius, y + height, safeRadius);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.arcTo(x, y + height, x, y + height - safeRadius, safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.arcTo(x, y, x + safeRadius, y, safeRadius);
    ctx.closePath();
};

const traceHeartHighlightPath = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
) => {
    ctx.moveTo(x + width * 0.5, y + height * 0.92);
    ctx.bezierCurveTo(
        x + width * 0.18,
        y + height * 0.72,
        x + width * 0.02,
        y + height * 0.46,
        x + width * 0.19,
        y + height * 0.24,
    );
    ctx.bezierCurveTo(
        x + width * 0.32,
        y + height * 0.06,
        x + width * 0.47,
        y + height * 0.12,
        x + width * 0.5,
        y + height * 0.24,
    );
    ctx.bezierCurveTo(
        x + width * 0.53,
        y + height * 0.12,
        x + width * 0.68,
        y + height * 0.06,
        x + width * 0.81,
        y + height * 0.24,
    );
    ctx.bezierCurveTo(
        x + width * 0.98,
        y + height * 0.46,
        x + width * 0.82,
        y + height * 0.72,
        x + width * 0.5,
        y + height * 0.92,
    );
    ctx.closePath();
};

const traceArrowHighlightPath = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
) => {
    ctx.moveTo(x + width * 0.1, y + height * 0.38);
    ctx.lineTo(x + width * 0.54, y + height * 0.38);
    ctx.lineTo(x + width * 0.54, y + height * 0.17);
    ctx.lineTo(x + width * 0.92, y + height * 0.5);
    ctx.lineTo(x + width * 0.54, y + height * 0.83);
    ctx.lineTo(x + width * 0.54, y + height * 0.62);
    ctx.lineTo(x + width * 0.1, y + height * 0.62);
    ctx.closePath();
};

const traceTextCursorHighlightPath = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
) => {
    const stemWidth = width * 0.24;
    const capWidth = width * 0.58;
    const capHeight = height * 0.16;
    const stemX = x + (width - stemWidth) / 2;
    const capX = x + (width - capWidth) / 2;

    traceRoundedRectPath(
        ctx,
        stemX,
        y + capHeight * 0.72,
        stemWidth,
        height - capHeight * 1.44,
        stemWidth / 2,
    );
    traceRoundedRectPath(
        ctx,
        capX,
        y + capHeight * 0.12,
        capWidth,
        capHeight,
        capHeight / 2,
    );
    traceRoundedRectPath(
        ctx,
        capX,
        y + height - capHeight * 1.12,
        capWidth,
        capHeight,
        capHeight / 2,
    );
};

const traceCursorHighlightShapePath = (
    ctx: CanvasRenderingContext2D,
    shape: CursorHighlightSettings['shape'],
    x: number,
    y: number,
    size: number,
    inset = 0,
) => {
    const safeInset = Math.max(0, inset);
    const shapeSize = Math.max(2, size - safeInset * 2);
    const shapeX = x + safeInset;
    const shapeY = y + safeInset;

    ctx.beginPath();
    switch (shape) {
        case 'glow':
            ctx.arc(
                shapeX + shapeSize / 2,
                shapeY + shapeSize / 2,
                Math.max(2, shapeSize / 2),
                0,
                Math.PI * 2,
            );
            return;
        case 'heart':
            traceHeartHighlightPath(ctx, shapeX, shapeY, shapeSize, shapeSize);
            return;
        case 'arrow':
            traceArrowHighlightPath(ctx, shapeX, shapeY, shapeSize, shapeSize);
            return;
        case 'text_cursor':
            traceTextCursorHighlightPath(ctx, shapeX, shapeY, shapeSize, shapeSize);
            return;
        case 'circle':
        default:
            ctx.arc(
                shapeX + shapeSize / 2,
                shapeY + shapeSize / 2,
                Math.max(2, shapeSize / 2),
                0,
                Math.PI * 2,
            );
    }
};

export const getCursorHighlightPixelSize = (
    settings: CursorHighlightSettings,
    frameSize: ExportFrameSize,
) => clamp(
    Math.round(Math.min(frameSize.width, frameSize.height) * (settings.size / 100)),
    CURSOR_HIGHLIGHT_MIN_PIXEL_SIZE,
    CURSOR_HIGHLIGHT_MAX_PIXEL_SIZE,
);

export const getCursorHighlightAnchor = (size: number): {
    hotspotX: number;
    hotspotY: number;
    centerOffsetX: number;
    centerOffsetY: number;
} => {
    const safeSize = Math.max(CURSOR_HIGHLIGHT_MIN_PIXEL_SIZE, size);
    const referenceMetrics = getCursorOverlayMetrics(CURSOR_HIGHLIGHT_REFERENCE_STYLE);
    const referenceVisualCenterX = referenceMetrics.width * CURSOR_HIGHLIGHT_VISUAL_CENTER_X;
    const referenceVisualCenterY = referenceMetrics.height * CURSOR_HIGHLIGHT_VISUAL_CENTER_Y;
    const centerOffsetX = (referenceVisualCenterX - referenceMetrics.hotspotX) * CURSOR_HIGHLIGHT_CURSOR_SCALE;
    const centerOffsetY = (referenceVisualCenterY - referenceMetrics.hotspotY) * CURSOR_HIGHLIGHT_CURSOR_SCALE;
    return {
        hotspotX: safeSize / 2 - centerOffsetX,
        hotspotY: safeSize / 2 - centerOffsetY,
        centerOffsetX,
        centerOffsetY,
    };
};

export const getCursorHighlightMotionActiveRanges = (
    cursorData: InteractionEvent[] | undefined,
    settings: CursorHighlightSettings,
    totalDuration = Number.POSITIVE_INFINITY,
) => {
    const normalizedSettings = normalizeCursorHighlightSettings(settings);
    if (!normalizedSettings.motionOnly) {
        return [];
    }

    return buildCursorMotionActiveRanges(
        cursorData,
        normalizedSettings.motionHoldSeconds,
        totalDuration,
    );
};

export const getCursorHighlightMotionDisabledRanges = (
    cursorData: InteractionEvent[] | undefined,
    settings: CursorHighlightSettings,
    totalDuration: number,
) => {
    const normalizedSettings = normalizeCursorHighlightSettings(settings);
    if (!normalizedSettings.motionOnly || totalDuration <= 0) {
        return [];
    }

    return invertTimeRanges(
        getCursorHighlightMotionActiveRanges(cursorData, normalizedSettings, totalDuration),
        totalDuration,
    );
};

export const resolveCursorHighlightPlaybackConfig = (
    cursorData: InteractionEvent[] | undefined,
) => {
    return {
        nativeCursorSuppressed: true,
        trackMode: 'direct' as CursorTrackMode,
        sampleTimeOffsetSec: 0,
    };
};

export const getEffectiveCursorHighlightSettings = (
    settings: CursorHighlightSettings,
    _nativeCursorSuppressed: boolean,
) => normalizeCursorHighlightSettings(settings);

export const isCursorHighlightVisibleAtTime = (
    cursorData: InteractionEvent[] | undefined,
    displayTime: number,
    settings: CursorHighlightSettings,
) => {
    const normalizedSettings = normalizeCursorHighlightSettings(settings);
    if (!normalizedSettings.enabled) {
        return false;
    }
    if (!normalizedSettings.motionOnly) {
        return true;
    }

    return isTimeWithinRanges(
        displayTime,
        getCursorHighlightMotionActiveRanges(cursorData, normalizedSettings),
    );
};

export const createCursorHighlightBackdropSprite = (
    settings: CursorHighlightSettings,
    frameSize: ExportFrameSize,
) => {
    const normalizedSettings = normalizeCursorHighlightSettings(settings);
    const size = getCursorHighlightPixelSize(normalizedSettings, frameSize);
    const padding = Math.max(14, Math.round(size * 0.32));
    const canvas = document.createElement('canvas');
    canvas.width = size + padding * 2;
    canvas.height = size + padding * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const anchor = getCursorHighlightAnchor(size);
    const coreFill = hexToRgba(normalizedSettings.color, clamp(normalizedSettings.opacity * 0.22, 0.08, 0.18));
    const midFill = hexToRgba(normalizedSettings.color, clamp(normalizedSettings.opacity * 0.62, 0.18, 0.5));
    const edgeFill = hexToRgba(normalizedSettings.color, clamp(normalizedSettings.opacity * 0.46, 0.14, 0.34));
    const outerGlow = hexToRgba(normalizedSettings.color, Math.min(0.64, normalizedSettings.opacity + 0.18));
    const innerGlow = hexToRgba(normalizedSettings.color, Math.min(0.82, normalizedSettings.opacity + 0.26));
    const outline = hexToRgba('#ffffff', Math.min(0.52, normalizedSettings.opacity + 0.14));
    const accentOutline = hexToRgba(normalizedSettings.color, Math.min(0.72, normalizedSettings.opacity + 0.2));
    const gradientCenterX = padding + size / 2;
    const gradientCenterY = padding + size / 2;
    const fillGradient = ctx.createRadialGradient(
        gradientCenterX,
        gradientCenterY,
        Math.max(2, size * 0.12),
        padding + size / 2,
        padding + size / 2,
        size / 2,
    );
    fillGradient.addColorStop(0, coreFill);
    fillGradient.addColorStop(0.52, midFill);
    fillGradient.addColorStop(1, edgeFill);
    const glossGradient = ctx.createLinearGradient(
        padding,
        padding,
        padding + size,
        padding + size,
    );
    glossGradient.addColorStop(0, 'rgba(255,255,255,0.42)');
    glossGradient.addColorStop(0.26, 'rgba(255,255,255,0.14)');
    glossGradient.addColorStop(0.62, 'rgba(255,255,255,0.04)');
    glossGradient.addColorStop(1, 'rgba(255,255,255,0)');
    const drawShape = (inset = 0) => traceCursorHighlightShapePath(
        ctx,
        normalizedSettings.shape,
        padding,
        padding,
        size,
        inset,
    );

    if (normalizedSettings.shape === 'glow') {
        const glowCenterX = padding + size / 2 - size * 0.05;
        const glowCenterY = padding + size / 2 - size * 0.06;
        const primaryGradient = ctx.createRadialGradient(
            glowCenterX,
            glowCenterY,
            Math.max(4, size * 0.08),
            padding + size / 2,
            padding + size / 2,
            size * 0.66,
        );
        primaryGradient.addColorStop(0, hexToRgba('#ffffff', Math.min(0.34, normalizedSettings.opacity * 0.92)));
        primaryGradient.addColorStop(0.18, hexToRgba(normalizedSettings.color, Math.min(0.3, normalizedSettings.opacity * 0.72)));
        primaryGradient.addColorStop(0.5, hexToRgba(normalizedSettings.color, Math.min(0.52, normalizedSettings.opacity * 0.94)));
        primaryGradient.addColorStop(0.82, hexToRgba(normalizedSettings.color, Math.min(0.22, normalizedSettings.opacity * 0.48)));
        primaryGradient.addColorStop(1, hexToRgba(normalizedSettings.color, 0));

        ctx.save();
        ctx.fillStyle = primaryGradient;
        ctx.shadowColor = outerGlow;
        ctx.shadowBlur = Math.round(size * 0.56);
        ctx.beginPath();
        ctx.ellipse(
            padding + size / 2,
            padding + size / 2,
            size * 0.46,
            size * 0.42,
            -0.22,
            0,
            Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const gloss = ctx.createRadialGradient(
            glowCenterX - size * 0.08,
            glowCenterY - size * 0.1,
            0,
            glowCenterX - size * 0.08,
            glowCenterY - size * 0.1,
            size * 0.34,
        );
        gloss.addColorStop(0, 'rgba(255,255,255,0.56)');
        gloss.addColorStop(0.36, 'rgba(255,255,255,0.16)');
        gloss.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gloss;
        ctx.beginPath();
        ctx.ellipse(
            glowCenterX - size * 0.05,
            glowCenterY - size * 0.08,
            size * 0.24,
            size * 0.2,
            -0.5,
            0,
            Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();

        return {
            file: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height,
            hotspotX: padding + anchor.hotspotX,
            hotspotY: padding + anchor.hotspotY,
        };
    }

    ctx.save();
    ctx.fillStyle = fillGradient;
    ctx.shadowColor = outerGlow;
    ctx.shadowBlur = Math.round(size * 0.42);
    drawShape();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = glossGradient;
    drawShape(Math.max(2, Math.round(size * 0.08)));
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glintX = gradientCenterX - size * 0.15;
    const glintY = gradientCenterY - size * 0.18;
    const glintGradient = ctx.createRadialGradient(
        glintX,
        glintY,
        0,
        glintX,
        glintY,
        size * 0.42,
    );
    glintGradient.addColorStop(0, 'rgba(255,255,255,0.38)');
    glintGradient.addColorStop(0.45, 'rgba(255,255,255,0.12)');
    glintGradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glintGradient;
    ctx.beginPath();
    ctx.ellipse(
        glintX,
        glintY,
        size * 0.34,
        size * 0.24,
        -0.4,
        0,
        Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = accentOutline;
    ctx.lineWidth = Math.max(1.5, Math.round(size * 0.05));
    ctx.shadowColor = innerGlow;
    ctx.shadowBlur = Math.round(size * 0.18);
    drawShape(Math.max(1, ctx.lineWidth * 0.5));
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(1.1, Math.round(size * 0.03));
    drawShape(Math.max(2, Math.round(size * 0.14)));
    ctx.stroke();
    ctx.restore();

    return {
        file: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
        hotspotX: padding + anchor.hotspotX,
        hotspotY: padding + anchor.hotspotY,
    };
};

export const buildCursorHighlightPreviewSprite = (
    settings: CursorHighlightSettings,
    frameSize: ExportFrameSize,
) => createCursorHighlightBackdropSprite(settings, frameSize);

export const buildCursorTimedTrack = (
    cursorData: InteractionEvent[] | undefined,
    startTime: number,
    endTime: number,
    cropRect?: CropRect,
    maxPoints = FOLLOW_CURSOR_TRACK_MAX_POINTS,
    mode: CursorTrackMode = 'smooth',
    leadSeconds = 0,
): Array<{ time: number; x: number; y: number }> => {
    if (!Array.isArray(cursorData) || cursorData.length === 0 || endTime <= startTime) return [];

    const points: Array<{ time: number; x: number; y: number }> = [];
    for (let time = startTime; time <= endTime + 0.001; time += CURSOR_TRACK_SAMPLE_STEP) {
        const sampleTime = Math.max(startTime, Math.min(endTime, time + leadSeconds));
        const point = mode === 'follow'
            ? getFollowCursorPoint(cursorData, sampleTime)
            : getPreviewCursorPoint(cursorData, sampleTime, mode);
        const viewportPoint = mapCursorPointToViewport(point, cropRect);
        if (!viewportPoint) continue;
        points.push({
            time: Number(time.toFixed(3)),
            x: Number(viewportPoint.x.toFixed(3)),
            y: Number(viewportPoint.y.toFixed(3)),
        });
    }

    const withEndpoint = appendTrackEndpoint(points, cursorData, endTime, cropRect, mode);
    return sampleTimedTrack(compressTimedTrack(withEndpoint), maxPoints);
};

export const buildStyledCursorOverlayData = (
    cursorData: InteractionEvent[] | undefined,
    totalDuration: number,
    style: GlobalCursorStyle,
    cropRect?: CropRect,
): CursorOverlayData | null => {
    if (!isStyledCursorStyle(style) || !Array.isArray(cursorData) || cursorData.length === 0 || totalDuration <= 0) {
        return null;
    }

    const cursorSprite = createStyledCursorSprite(style);
    if (!cursorSprite) return null;
    const backdropSprite = createCursorBackdropSprite(style);
    const rippleSprite = createCursorRippleSprite();
    const track = buildCursorTimedTrack(cursorData, 0, totalDuration, cropRect, CURSOR_OVERLAY_MAX_POINTS);

    if (track.length === 0) return null;

    const clicks = cursorData
        .filter((event) =>
            event?.type === 'click'
            && typeof event.t === 'number'
            && event.t >= 0
            && event.t / 1000 <= totalDuration + 0.6
        )
        .map((event) => {
            const time = event.t / 1000;
            const point = getPreviewCursorPoint(cursorData, time, 'smooth');
            const viewportPoint = mapCursorPointToViewport(point, cropRect);
            if (!viewportPoint) return null;
            return {
                time: Number(time.toFixed(3)),
                x: Number(viewportPoint.x.toFixed(3)),
                y: Number(viewportPoint.y.toFixed(3)),
            };
        })
        .filter((item): item is { time: number; x: number; y: number } => !!item);

    return {
        backdropFile: backdropSprite?.file,
        backdropWidth: backdropSprite?.width,
        backdropHeight: backdropSprite?.height,
        backdropHotspotX: backdropSprite?.hotspotX,
        backdropHotspotY: backdropSprite?.hotspotY,
        cursorFile: cursorSprite.file,
        cursorWidth: cursorSprite.width,
        cursorHeight: cursorSprite.height,
        cursorHotspotX: cursorSprite.hotspotX,
        cursorHotspotY: cursorSprite.hotspotY,
        rippleFile: rippleSprite?.file,
        rippleSize: rippleSprite?.size ?? 0,
        track,
        clicks,
    };
};

export const buildCursorHighlightOverlayData = (
    cursorData: InteractionEvent[] | undefined,
    totalDuration: number,
    settings: CursorHighlightSettings,
    cropRect: CropRect,
    frameSize: ExportFrameSize,
): CursorOverlayData | null => {
    const normalizedSettings = normalizeCursorHighlightSettings(settings);
    if (!normalizedSettings.enabled || !Array.isArray(cursorData) || cursorData.length === 0 || totalDuration <= 0) {
        return null;
    }

    const playbackConfig = resolveCursorHighlightPlaybackConfig(cursorData);
    const nativeCursorSuppressed = playbackConfig.nativeCursorSuppressed;
    const effectiveSettings = getEffectiveCursorHighlightSettings(normalizedSettings, nativeCursorSuppressed);
    const backdropSprite = createCursorHighlightBackdropSprite(effectiveSettings, frameSize);
    if (!backdropSprite) return null;
    const replacementCursorSprite = nativeCursorSuppressed
        ? createCursorHighlightReplacementCursorSprite()
        : null;
    const track = buildCursorTimedTrack(
        cursorData,
        0,
        totalDuration,
        cropRect,
        CURSOR_OVERLAY_MAX_POINTS,
        playbackConfig.trackMode,
        playbackConfig.sampleTimeOffsetSec,
    );
    if (track.length === 0) return null;

    return {
        backdropFile: backdropSprite.file,
        backdropWidth: backdropSprite.width,
        backdropHeight: backdropSprite.height,
        backdropHotspotX: backdropSprite.hotspotX,
        backdropHotspotY: backdropSprite.hotspotY,
        cursorFile: replacementCursorSprite?.file,
        cursorWidth: replacementCursorSprite?.width,
        cursorHeight: replacementCursorSprite?.height,
        cursorHotspotX: replacementCursorSprite?.hotspotX,
        cursorHotspotY: replacementCursorSprite?.hotspotY,
        track,
        clicks: [],
    };
};
