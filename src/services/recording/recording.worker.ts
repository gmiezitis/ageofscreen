/**
 * Pro Recording Engine (Worker)
 * 
 * Performance: High (Multi-threaded)
 * Strategy: Zero-copy VideoFrame transfer + MediaRecorder in Worker
 */

interface CompositorState {
    typingZoom: { isZoomed: boolean; x: number; y: number };
    webcam: {
        visible: boolean;
        bounds: { x: number; y: number; width: number; height: number };
        shape: string;
        scaleFactor: number;
        name: string;
        borderColor?: string;
    };
    drawing: { strokes: any[]; screenWidth: number; screenHeight: number };
}

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let recorder: MediaRecorder | null = null;
let state: CompositorState | null = null;

let currentScreenFrame: VideoFrame | null = null;
let currentWebcamFrame: VideoFrame | null = null;

let isRecording = false;

const WEBCAM_ZOOM_MIN_SCALE = 0.9;

self.onmessage = (e) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT':
            canvas = payload.canvas;
            ctx = canvas!.getContext('2d', { alpha: false });
            break;

        case 'START':
            startRecording(payload);
            break;

        case 'STOP':
            stopRecording();
            break;

        case 'UPDATE_STATE':
            state = payload;
            break;

        case 'SCREEN_FRAME':
            if (currentScreenFrame) currentScreenFrame.close();
            currentScreenFrame = payload;
            if (isRecording) render();
            break;

        case 'WEBCAM_FRAME':
            if (currentWebcamFrame) currentWebcamFrame.close();
            currentWebcamFrame = payload;
            break;
    }
};

function startRecording(cfg: any) {
    if (!canvas) return;

    // captureStream on OffscreenCanvas is the bridge to MediaRecorder
    const stream = (canvas as any).captureStream(cfg.fps || 24);

    recorder = new MediaRecorder(stream, {
        mimeType: cfg.mimeType || 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: cfg.bitrate || 5000000
    });

    recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
            // Send chunk back to main thread
            self.postMessage({ type: 'DATA', payload: ev.data });
        }
    };

    recorder.onstop = () => {
        if (currentScreenFrame) currentScreenFrame.close();
        if (currentWebcamFrame) currentWebcamFrame.close();
        self.postMessage({ type: 'STOPPED' });
    };

    recorder.start(200);
    isRecording = true;
}

function stopRecording() {
    isRecording = false;
    if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
    }
}

function render() {
    if (!ctx || !canvas || !state || !currentScreenFrame) return;

    // 1. Draw Background
    ctx.fillStyle = '#101014';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw Screen
    const sw = currentScreenFrame.displayWidth;
    const sh = currentScreenFrame.displayHeight;
    ctx.drawImage(currentScreenFrame, 0, 0, sw, sh, 0, 0, canvas.width, canvas.height);

    // 3. Draw Webcam
    if (state.webcam.visible && currentWebcamFrame) {
        const wb = state.webcam.bounds;
        // In a full implementation, we'd apply the shape masks here
        const zoomScale = state.typingZoom.isZoomed ? WEBCAM_ZOOM_MIN_SCALE : 1;
        const targetWidth = wb.width * zoomScale;
        const targetHeight = wb.height * zoomScale;
        const centerX = wb.x + wb.width / 2;
        const centerY = wb.y + wb.height / 2;
        const x = Math.max(0, Math.min(canvas.width - targetWidth, centerX - targetWidth / 2));
        const y = Math.max(0, Math.min(canvas.height - targetHeight, centerY - targetHeight / 2));
        ctx.drawImage(currentWebcamFrame, x, y, targetWidth, targetHeight);
    }

    // 4. Note: MediaRecorder in current thread automatically captures 
    // the canvas updates from captureStream().
}
