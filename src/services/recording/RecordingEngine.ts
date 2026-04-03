/**
 * RecordingEngine.ts
 *
 * The high-performance implementation of the ageofscreen recording pipeline.
 * Manages zero-latency compositing and encoding on the main thread via standard canvas captureStream.
 */

import { getCameraDimensionsForWidth, normalizeCameraShape, traceCameraShapePath } from '../../shared/cameraShapes';

const ZOOM_LERP_IN = 0.1;
const ZOOM_LERP_OUT = 0.075;
const CURSOR_LERP = 0.18;
const CURSOR_SETTLE_LERP = 0.08;
const CURSOR_DEADZONE_PX = 6;
const ZOOM_MAX = 1.26;
const WEBCAM_ZOOM_MIN_SCALE = 0.9;

export class RecordingEngine {
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private onData: (chunk: Blob) => void;
    private onError: (err: string) => void;

    private recorder: MediaRecorder | null = null;
    private state: any = null;
    private currentScreenFrame: VideoFrame | null = null;
    private currentWebcamFrame: VideoFrame | null = null;
    private isRecording = false;
    private smoothedCursor = { x: 0, y: 0, initialized: false };
    private zoomProgress = 0;
    private stopPromise: Promise<void> | null = null;
    private resolveStopPromise: (() => void) | null = null;

    constructor(onData: (chunk: Blob) => void, onError: (err: string) => void) {
        this.onData = onData;
        this.onError = onError;
    }

    public async init(width: number, height: number, fps: number, bitrate: number) {
        try {
            this.canvas = document.createElement('canvas');
            this.canvas.width = width;
            this.canvas.height = height;
            this.ctx = this.canvas.getContext('2d', { alpha: false });

            const stream = (this.canvas as any).captureStream(fps || 24);

            this.recorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp8,opus',
                videoBitsPerSecond: bitrate || 5000000
            });

            this.recorder.ondataavailable = (ev) => {
                if (ev.data.size > 0) {
                    this.onData(ev.data);
                }
            };

            this.recorder.onstop = () => {
                this.isRecording = false;
                if (this.currentScreenFrame) { this.currentScreenFrame.close(); this.currentScreenFrame = null; }
                if (this.currentWebcamFrame) { this.currentWebcamFrame.close(); this.currentWebcamFrame = null; }
                this.resolveStopPromise?.();
                this.resolveStopPromise = null;
                this.stopPromise = null;
            };
        } catch (err: any) {
            this.onError(err.message || 'Failed to init engine');
        }
    }

    public start() {
        if (!this.recorder) return;
        this.recorder.start(200);
        this.isRecording = true;
    }

    public stop() {
        void this.stopAndFlush();
    }

    public stopAndFlush(): Promise<void> {
        this.isRecording = false;
        if (!this.recorder || this.recorder.state === 'inactive') {
            return Promise.resolve();
        }

        if (this.stopPromise) {
            return this.stopPromise;
        }

        this.stopPromise = new Promise<void>((resolve) => {
            this.resolveStopPromise = resolve;
        });

        try {
            if (typeof this.recorder.requestData === 'function') {
                this.recorder.requestData();
            }
        } catch {
            // Some recorder states reject requestData; stopping still flushes the final chunk.
        }

        this.recorder.stop();
        return this.stopPromise;
    }

    public updateState(state: any) {
        this.state = state;
    }

    public sendScreenFrame(frame: VideoFrame) {
        if (this.currentScreenFrame) this.currentScreenFrame.close();
        this.currentScreenFrame = frame;
        if (this.isRecording) this.render();
    }

    public sendWebcamFrame(frame: VideoFrame) {
        if (this.currentWebcamFrame) this.currentWebcamFrame.close();
        this.currentWebcamFrame = frame;
    }

    private render() {
        if (!this.ctx || !this.canvas || !this.state || !this.currentScreenFrame) return;

        this.ctx.fillStyle = this.state?.backgroundColor || '#101014';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawScreen();

        if (this.state.webcam && this.state.webcam.visible && this.currentWebcamFrame) {
            this.drawWebcam();
        }
    }

    private drawScreen() {
        if (!this.ctx || !this.canvas || !this.currentScreenFrame) return;

        const sw = this.currentScreenFrame.displayWidth;
        const sh = this.currentScreenFrame.displayHeight;
        const targetZoom = this.state?.typingZoom?.isZoomed ? 1 : 0;
        const zoomLerp = targetZoom > this.zoomProgress ? ZOOM_LERP_IN : ZOOM_LERP_OUT;
        this.zoomProgress += (targetZoom - this.zoomProgress) * zoomLerp;
        const zoomEase = this.smootherStep(this.zoomProgress);

        if (zoomEase < 0.01 && !targetZoom) {
            this.zoomProgress = 0;
            this.smoothedCursor.initialized = false;
            this.ctx.drawImage(this.currentScreenFrame, 0, 0, sw, sh, 0, 0, this.canvas.width, this.canvas.height);
            return;
        }

        const sourceBounds = this.state?.sourceBounds;
        const fallbackWidth = this.state?.drawing?.screenWidth || sw;
        const fallbackHeight = this.state?.drawing?.screenHeight || sh;
        const focusWidth = sourceBounds?.width || fallbackWidth;
        const focusHeight = sourceBounds?.height || fallbackHeight;
        const scaleX = sw / Math.max(1, focusWidth);
        const scaleY = sh / Math.max(1, focusHeight);
        const rawCX = Math.max(0, Math.min(sw,
            ((this.state.typingZoom.x || 0) - (sourceBounds?.x || 0)) * scaleX,
        ));
        const rawCY = Math.max(0, Math.min(sh,
            ((this.state.typingZoom.y || 0) - (sourceBounds?.y || 0)) * scaleY,
        ));

        if (!this.smoothedCursor.initialized) {
            this.smoothedCursor = { x: rawCX, y: rawCY, initialized: true };
        } else {
            const delta = Math.hypot(rawCX - this.smoothedCursor.x, rawCY - this.smoothedCursor.y);
            const cursorLerp = delta < CURSOR_DEADZONE_PX ? CURSOR_SETTLE_LERP : CURSOR_LERP;
            this.smoothedCursor.x += (rawCX - this.smoothedCursor.x) * cursorLerp;
            this.smoothedCursor.y += (rawCY - this.smoothedCursor.y) * cursorLerp;
        }

        const zoomAmount = 1 + (ZOOM_MAX - 1) * zoomEase;
        const srcW = sw / zoomAmount;
        const srcH = sh / zoomAmount;
        const srcX = Math.max(0, Math.min(sw - srcW, this.smoothedCursor.x - srcW / 2));
        const srcY = Math.max(0, Math.min(sh - srcH, this.smoothedCursor.y - srcH / 2));

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        // Keep the live frame underneath the zoom crop so rounded corners or tiny edge gaps
        // inherit the same background as the captured window instead of a hardcoded matte.
        this.ctx.drawImage(this.currentScreenFrame, 0, 0, sw, sh, 0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.currentScreenFrame, srcX, srcY, srcW, srcH, 0, 0, this.canvas.width, this.canvas.height);
    }

    private drawWebcam() {
        if (!this.ctx || !this.canvas || !this.currentWebcamFrame || !this.state?.webcam) return;

        const webcam = this.state.webcam;
        const sourceBounds = this.state?.sourceBounds;
        const scale = sourceBounds
            ? this.canvas.width / Math.max(1, sourceBounds.width)
            : this.canvas.width / Math.max(1, this.state?.drawing?.screenWidth || this.canvas.width);
        const sourceX = sourceBounds?.x || 0;
        const sourceY = sourceBounds?.y || 0;
        const zoomEase = this.smootherStep(this.zoomProgress);
        const zoomScale = Math.exp(Math.log(WEBCAM_ZOOM_MIN_SCALE) * zoomEase);
        const normalizedShape = normalizeCameraShape(webcam.shape);
        const baseWidth = webcam.bounds.width * scale;
        const baseHeight = getCameraDimensionsForWidth(normalizedShape, baseWidth).height;
        const targetWidth = baseWidth * zoomScale;
        const targetHeight = getCameraDimensionsForWidth(normalizedShape, targetWidth).height;
        const baseX = (webcam.bounds.x - sourceX) * scale;
        const baseY = (webcam.bounds.y - sourceY) * scale;
        const safeInset = 16;
        const centerX = baseX + baseWidth / 2;
        const centerY = baseY + baseHeight / 2;
        const clampedX = Math.max(safeInset, Math.min(this.canvas.width - targetWidth - safeInset, centerX - targetWidth / 2));
        const clampedY = Math.max(safeInset, Math.min(this.canvas.height - targetHeight - safeInset, centerY - targetHeight / 2));

        this.ctx.save();
        this.ctx.beginPath();
        traceCameraShapePath(this.ctx, normalizedShape, clampedX, clampedY, targetWidth, targetHeight);
        this.ctx.clip();

        const videoRatio = this.currentWebcamFrame.displayWidth / Math.max(1, this.currentWebcamFrame.displayHeight);
        const clipRatio = targetWidth / Math.max(1, targetHeight);
        let drawW = targetWidth;
        let drawH = targetHeight;

        if (videoRatio > clipRatio) {
            drawH = targetHeight;
            drawW = targetHeight * videoRatio;
        } else {
            drawW = targetWidth;
            drawH = targetWidth / Math.max(0.0001, videoRatio);
        }

        this.ctx.translate(clampedX + targetWidth / 2, clampedY + targetHeight / 2);
        this.ctx.scale(-1.02, 1.02);
        this.ctx.translate(-(clampedX + targetWidth / 2), -(clampedY + targetHeight / 2));
        this.ctx.drawImage(
            this.currentWebcamFrame,
            clampedX + (targetWidth - drawW) / 2,
            clampedY + (targetHeight - drawH) / 2,
            drawW,
            drawH,
        );
        this.ctx.restore();

        this.ctx.beginPath();
        traceCameraShapePath(this.ctx, normalizedShape, clampedX, clampedY, targetWidth, targetHeight);
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = this.hexToRgba(webcam.borderColor || '#22c55e', 0.8);
        this.ctx.stroke();
    }

    private lerp(a: number, b: number, t: number) {
        return a + (b - a) * t;
    }

    private smootherStep(value: number) {
        const t = Math.max(0, Math.min(1, value));
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    private hexToRgba(hex: string, alpha: number) {
        const h = hex.replace('#', '').padEnd(6, '0');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    public destroy() {
        this.stop();
        if (this.currentScreenFrame) { this.currentScreenFrame.close(); this.currentScreenFrame = null; }
        if (this.currentWebcamFrame) { this.currentWebcamFrame.close(); this.currentWebcamFrame = null; }
        this.canvas = null;
        this.ctx = null;
        this.recorder = null;
    }
}
