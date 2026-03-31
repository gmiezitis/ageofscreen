/**
 * Canvas compositor for recording pipelines.
 *
 * Consolidates the duplicated window-mode and fullscreen+typing-zoom
 * draw loops into a single configurable compositor.
 */

export interface CompositorConfig {
    screenVideo: HTMLVideoElement;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    targetFps: number;
    background?: string;

    sourceWindowBounds?: { x: number; y: number; width: number; height: number } | null;
}

export interface CompositorState {
    typingZoom: { isZoomed: boolean; x: number; y: number };
    sourceBounds?: { x: number; y: number; width: number; height: number } | null;
    backgroundColor?: string;
    webcam: {
        visible: boolean;
        video: HTMLVideoElement | null;
        bounds: { x: number; y: number; width: number; height: number };
        shape: string;
        scaleFactor: number;
        name: string;
        borderColor?: string;
    };
    drawing: { strokes: any[]; screenWidth: number; screenHeight: number };
}

const MAX_CAPTURE_DIM = 3840;

const smoothCursorState = { x: 0, y: 0, initialized: false };
const smoothZoomState = { value: 0 };
const CURSOR_LERP = 0.16;
const CURSOR_SETTLE_LERP = 0.08;
const CURSOR_DEADZONE_PX = 6;
const ZOOM_LERP_IN = 0.1;
const ZOOM_LERP_OUT = 0.075;
const ZOOM_MAX = 1.25;
const WEBCAM_ZOOM_MIN_SCALE = 0.9;

const smootherStep = (value: number): number => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Compute even canvas dimensions (≤ 1080p) from a source video element. */
export function computeCanvasDimensions(video: HTMLVideoElement): { width: number; height: number } {
    let w = video.videoWidth;
    let h = video.videoHeight;

    if (w > MAX_CAPTURE_DIM || h > MAX_CAPTURE_DIM) {
        const ratio = w / h;
        if (w > h) {
            w = MAX_CAPTURE_DIM;
            h = Math.round(w / ratio);
        } else {
            h = MAX_CAPTURE_DIM;
            w = Math.round(h * ratio);
        }
    }

    // Ensure even dimensions for codec compatibility
    if (w % 2 !== 0) w++;
    if (h % 2 !== 0) h++;
    if (w <= 0) w = 1280;
    if (h <= 0) h = 720;
    return { width: w, height: h };
}

/** Wait for a video element to report valid dimensions. */
export function waitForVideoMetadata(video: HTMLVideoElement, maxAttempts = 50): Promise<void> {
    return new Promise<void>((resolve) => {
        let attempts = 0;
        const check = () => {
            attempts++;
            if ((video.videoWidth > 0 && video.videoHeight > 0) || attempts > maxAttempts) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

/** Draw the screen source, applying typing-zoom if active. */
export function drawScreen(
    cfg: CompositorConfig,
    state: CompositorState,
) {
    const { screenVideo, canvas, ctx, sourceWindowBounds } = cfg;
    if (screenVideo.videoWidth <= 0) return;

    const dstW = canvas.width;
    const dstH = canvas.height;
    const dstX = 0;
    const dstY = 0;

    const targetZoom = state.typingZoom.isZoomed ? 1 : 0;
    const zoomLerp = targetZoom > smoothZoomState.value ? ZOOM_LERP_IN : ZOOM_LERP_OUT;
    smoothZoomState.value += (targetZoom - smoothZoomState.value) * zoomLerp;
    const zoomEase = smootherStep(smoothZoomState.value);
    const zoomFactor = 1 + (ZOOM_MAX - 1) * zoomEase;
    const sw = screenVideo.videoWidth;
    const sh = screenVideo.videoHeight;

    if (zoomEase > 0.01 || state.typingZoom.isZoomed) {
        let scaleX: number, scaleY: number, rawCX: number, rawCY: number;

        if (sourceWindowBounds) {
            scaleX = sw / (sourceWindowBounds.width || sw);
            scaleY = sh / (sourceWindowBounds.height || sh);
            rawCX = Math.max(0, Math.min(sw, (state.typingZoom.x - sourceWindowBounds.x) * scaleX));
            rawCY = Math.max(0, Math.min(sh, (state.typingZoom.y - sourceWindowBounds.y) * scaleY));
        } else {
            scaleX = sw / (window.screen?.width || sw);
            scaleY = sh / (window.screen?.height || sh);
            rawCX = Math.max(0, Math.min(sw, state.typingZoom.x * scaleX));
            rawCY = Math.max(0, Math.min(sh, state.typingZoom.y * scaleY));
        }

        if (!smoothCursorState.initialized) {
            smoothCursorState.x = rawCX;
            smoothCursorState.y = rawCY;
            smoothCursorState.initialized = true;
        } else {
            const delta = Math.hypot(rawCX - smoothCursorState.x, rawCY - smoothCursorState.y);
            const cursorLerp = delta < CURSOR_DEADZONE_PX ? CURSOR_SETTLE_LERP : CURSOR_LERP;
            smoothCursorState.x += (rawCX - smoothCursorState.x) * cursorLerp;
            smoothCursorState.y += (rawCY - smoothCursorState.y) * cursorLerp;
        }

        const srcW = sw / zoomFactor;
        const srcH = sh / zoomFactor;
        const srcX = Math.max(0, Math.min(sw - srcW, smoothCursorState.x - srcW / 2));
        const srcY = Math.max(0, Math.min(sh - srcH, smoothCursorState.y - srcH / 2));
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = state.backgroundColor || cfg.background || '#101014';
        ctx.fillRect(0, 0, dstW, dstH);
        ctx.drawImage(screenVideo, 0, 0, sw, sh, dstX, dstY, dstW, dstH);
        ctx.drawImage(screenVideo, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);
    } else {
        smoothZoomState.value = 0;
        smoothCursorState.initialized = false;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(screenVideo, 0, 0, sw, sh, dstX, dstY, dstW, dstH);
    }
}

/** Draw the webcam overlay (circle/pill/rounded/square shapes). */
export function drawWebcam(
    cfg: CompositorConfig,
    state: CompositorState,
) {
    const { canvas, ctx, sourceWindowBounds } = cfg;
    const wc = state.webcam;
    if (!wc.video || wc.video.videoWidth <= 0 || !wc.visible) return;

    const videoRatio = wc.video.videoWidth / wc.video.videoHeight;
    const sf = sourceWindowBounds
        ? canvas.width / sourceWindowBounds.width
        : canvas.width / 1920;

    const sourcePixelX = sourceWindowBounds?.x || 0;
    const sourcePixelY = sourceWindowBounds?.y || 0;
    const zoomEase = smootherStep(smoothZoomState.value);
    const webcamScale = Math.exp(Math.log(WEBCAM_ZOOM_MIN_SCALE) * zoomEase);
    const safeInset = 16;

    // Keep the webcam anchored in place while zooming and only scale it subtly.
    const baseWidth = wc.bounds.width * sf;
    const baseHeight = wc.bounds.height * sf;
    const targetWidth = baseWidth * webcamScale;
    const targetHeight = wc.shape === 'pill' ? targetWidth / 1.7 : baseHeight * webcamScale;
    const baseX = (wc.bounds.x - sourcePixelX) * sf;
    const baseY = (wc.bounds.y - sourcePixelY) * sf;
    const centerX = baseX + baseWidth / 2;
    const centerY = baseY + baseHeight / 2;
    const x = Math.max(safeInset, Math.min(canvas.width - targetWidth - safeInset,
        centerX - targetWidth / 2));
    const y = Math.max(safeInset, Math.min(canvas.height - targetHeight - safeInset,
        centerY - targetHeight / 2));

    // Clip + draw webcam
    ctx.save();
    ctx.beginPath();
    drawShapePath(ctx, wc.shape, x, y, targetWidth, targetHeight);
    ctx.clip();

    let drawW: number, drawH: number;
    const clipRatio = targetWidth / targetHeight;
    if (videoRatio > clipRatio) {
        drawH = targetHeight;
        drawW = targetHeight * videoRatio;
    } else {
        drawW = targetWidth;
        drawH = targetWidth / videoRatio;
    }

    // Mirror horizontally and scale up slightly to match the local webcam view
    ctx.translate(x + targetWidth / 2, y + targetHeight / 2);
    ctx.scale(-1.02, 1.02);
    ctx.translate(-(x + targetWidth / 2), -(y + targetHeight / 2));

    ctx.drawImage(wc.video, x + (targetWidth - drawW) / 2, y + (targetHeight - drawH) / 2, drawW, drawH);
    ctx.restore();

    // Border (user color or default white)
    const borderHex = (wc.borderColor || '#22c55e').replace('#', '');
    const br = parseInt(borderHex.substring(0, 2), 16);
    const bg = parseInt(borderHex.substring(2, 4), 16);
    const bb = parseInt(borderHex.substring(4, 6), 16);
    ctx.beginPath();
    drawShapePath(ctx, wc.shape, x, y, targetWidth, targetHeight);
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(${br},${bg},${bb},0.8)`;
    ctx.stroke();

    // Name tag
    if (wc.name) {
        ctx.font = '600 12px "Inter", -apple-system, sans-serif';
        const textMetrics = ctx.measureText(wc.name);
        const paddingH = 12;
        const tagWidth = textMetrics.width + paddingH * 2;
        const tagHeight = 22;
        const tagX = x + (targetWidth - tagWidth) / 2;
        const tagY = y + targetHeight - (tagHeight / 2);
        ctx.save();
        ctx.beginPath();
        if ((ctx as any).roundRect) {
            (ctx as any).roundRect(tagX, tagY, tagWidth, tagHeight, 100);
        } else {
            ctx.rect(tagX, tagY, tagWidth, tagHeight);
        }
        ctx.fillStyle = 'rgba(26, 26, 31, 1)';
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(wc.name, tagX + tagWidth / 2, tagY + tagHeight / 2 + 0.5);
        ctx.restore();
    }
}

/** Draw freehand drawing strokes. */
export function drawStrokes(
    cfg: CompositorConfig,
    state: CompositorState,
) {
    if (state.drawing.strokes.length === 0) return;
    const { canvas, ctx } = cfg;
    const scaleX = canvas.width / state.drawing.screenWidth;
    const scaleY = canvas.height / state.drawing.screenHeight;

    for (const stroke of state.drawing.strokes) {
        if (!stroke.points || stroke.points.length < 2) continue;

        ctx.save();
        ctx.globalAlpha = stroke.opacity ?? 1;

        const hex = (stroke.color || '#ef4444').replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
        ctx.shadowBlur = 4;
        ctx.strokeStyle = stroke.color || '#ef4444';
        ctx.lineWidth = (stroke.lineWidth || 5) * Math.min(scaleX, scaleY);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY);
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x * scaleX, stroke.points[i].y * scaleY);
        }
        ctx.stroke();
        ctx.restore();
    }
}

/* ─── Helpers ─── */

function drawShapePath(
    ctx: CanvasRenderingContext2D,
    shape: string,
    x: number, y: number,
    w: number, h: number,
) {
    if (shape === 'circle') {
        ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
    } else if (shape === 'pill') {
        const radius = h / 2;
        if ((ctx as any).roundRect) {
            (ctx as any).roundRect(x, y, w, h, radius);
        } else {
            ctx.arc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5);
            ctx.lineTo(x + w - radius, y);
            ctx.arc(x + w - radius, y + radius, radius, Math.PI * 1.5, 0);
            ctx.lineTo(x + w, y + h - radius);
            ctx.arc(x + w - radius, y + h - radius, radius, 0, Math.PI * 0.5);
            ctx.lineTo(x + radius, y + h);
            ctx.arc(x + radius, y + h - radius, radius, Math.PI * 0.5, Math.PI);
            ctx.closePath();
        }
    } else if (shape === 'rounded') {
        const radius = w * 0.15;
        if ((ctx as any).roundRect) {
            (ctx as any).roundRect(x, y, w, h, radius);
        } else {
            ctx.rect(x, y, w, h);
        }
    } else {
        ctx.rect(x, y, w, h);
    }
}



