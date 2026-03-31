import { isRenderableMediaUrl, toMediaFileUrl } from '../shared/mediaPaths';

const THUMBNAIL_WIDTH = 960;
const THUMBNAIL_HEIGHT = 540;
type ThumbnailOptions = {
    showPlayBadge?: boolean;
};

const waitForEvent = <T extends Event>(
    target: EventTarget,
    eventName: string,
    errorEventName = 'error',
    timeoutMs = 10000
): Promise<T> => new Promise((resolve, reject) => {
    let timeoutId: any = null;
    const handleSuccess = (event: Event) => {
        cleanup();
        resolve(event as T);
    };
    const handleError = () => {
        cleanup();
        reject(new Error(`Failed waiting for ${eventName}`));
    };
    const cleanup = () => {
        if (timeoutId !== null) clearTimeout(timeoutId);
        target.removeEventListener(eventName, handleSuccess);
        target.removeEventListener(errorEventName, handleError);
    };

    target.addEventListener(eventName, handleSuccess, { once: true });
    target.addEventListener(errorEventName, handleError, { once: true });
    
    if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error(`Timeout waiting for ${eventName}`));
        }, timeoutMs);
    }
});

const drawCover = (
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number
) => {
    const scale = Math.max(THUMBNAIL_WIDTH / sourceWidth, THUMBNAIL_HEIGHT / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const drawX = (THUMBNAIL_WIDTH - drawWidth) / 2;
    const drawY = (THUMBNAIL_HEIGHT - drawHeight) / 2;
    ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
};

const createCanvas = () => {
    const canvas = document.createElement('canvas');
    canvas.width = THUMBNAIL_WIDTH;
    canvas.height = THUMBNAIL_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#10131a';
    ctx.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
    return { canvas, ctx };
};

const waitForVideoFrame = (video: HTMLVideoElement): Promise<void> => new Promise((resolve) => {
    const requestVideoFrame = (video as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: () => void) => number;
    }).requestVideoFrameCallback;

    if (typeof requestVideoFrame === 'function') {
        requestVideoFrame.call(video, () => resolve());
        return;
    }

    window.requestAnimationFrame(() => resolve());
});

export const createVideoElementThumbnail = (
    video: HTMLVideoElement,
    options: ThumbnailOptions = {},
): string | undefined => {
    const canvasData = createCanvas();
    if (!canvasData) return undefined;

    const { canvas, ctx } = canvasData;
    const sourceWidth = video.videoWidth || video.clientWidth || THUMBNAIL_WIDTH;
    const sourceHeight = video.videoHeight || video.clientHeight || THUMBNAIL_HEIGHT;
    const showPlayBadge = options.showPlayBadge ?? true;

    if (!sourceWidth || !sourceHeight) return undefined;

    try {
        drawCover(ctx, video, sourceWidth, sourceHeight);

        if (showPlayBadge) {
            const iconWidth = 28;
            const iconHeight = 28;
            const iconX = THUMBNAIL_WIDTH - iconWidth - 8;
            const iconY = THUMBNAIL_HEIGHT - iconHeight - 8;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
            ctx.beginPath();
            ctx.roundRect(iconX, iconY, iconWidth, iconHeight, 999);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(iconX + 11, iconY + 8);
            ctx.lineTo(iconX + 11, iconY + 20);
            ctx.lineTo(iconX + 20, iconY + 14);
            ctx.closePath();
            ctx.fill();
        }

        return canvas.toDataURL('image/png');
    } catch {
        return undefined;
    }
};

const captureVideoThumbnails = async (
    mediaUrl: string,
    targetTimeSeconds: number[],
    options: ThumbnailOptions = {},
): Promise<string[]> => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.src = mediaUrl;

    await waitForEvent(video, 'loadedmetadata');
    const results: string[] = [];

    for (const requestedTime of targetTimeSeconds) {
        const safeTime = Math.min(
            Math.max(0, Number.isFinite(requestedTime) ? requestedTime : 0),
            Math.max(0, (video.duration || 0) - 0.05),
        );

        if (safeTime > 0 && Math.abs(video.currentTime - safeTime) > 0.01) {
            video.currentTime = safeTime;
            await waitForEvent(video, 'seeked');
        } else if (video.readyState < 2) {
            await waitForEvent(video, 'loadeddata');
        }

        await waitForVideoFrame(video);
        const thumbnail = createVideoElementThumbnail(video, options);
        if (thumbnail) {
            results.push(thumbnail);
        }
    }

    return results;
};

const captureVideoThumbnail = async (
    mediaUrl: string,
    targetTimeSeconds: number,
    options: ThumbnailOptions = {},
): Promise<string | undefined> => {
    const thumbnails = await captureVideoThumbnails(mediaUrl, [targetTimeSeconds], options);
    return thumbnails[0];
};

export const createVideoThumbnailAtTime = async (
    sourcePath: string,
    timeSeconds: number,
): Promise<string | undefined> => {
    if (!sourcePath) return undefined;
    const mediaUrl = isRenderableMediaUrl(sourcePath) ? sourcePath : toMediaFileUrl(sourcePath);
    return captureVideoThumbnail(mediaUrl, timeSeconds, { showPlayBadge: false });
};

export const createVideoThumbnailsAtTimes = async (
    sourcePath: string,
    timeSeconds: number[],
): Promise<string[]> => {
    if (!sourcePath || timeSeconds.length === 0) return [];
    const mediaUrl = isRenderableMediaUrl(sourcePath) ? sourcePath : toMediaFileUrl(sourcePath);
    return captureVideoThumbnails(mediaUrl, timeSeconds, { showPlayBadge: false });
};

export const createMediaThumbnail = async (
    sourcePath: string,
    type: 'video' | 'image' | 'audio'
): Promise<string | undefined> => {
    if (type === 'audio' || !sourcePath) return undefined;

    const mediaUrl = isRenderableMediaUrl(sourcePath) ? sourcePath : toMediaFileUrl(sourcePath);
    const canvasData = createCanvas();
    if (!canvasData) return undefined;

    const { canvas, ctx } = canvasData;

    try {
        if (type === 'image') {
            const img = new Image();
            img.decoding = 'async';
            img.src = mediaUrl;
            await waitForEvent(img, 'load');
            drawCover(ctx, img, img.naturalWidth || THUMBNAIL_WIDTH, img.naturalHeight || THUMBNAIL_HEIGHT);
            return canvas.toDataURL('image/png');
        }

        return await captureVideoThumbnail(mediaUrl, 0.3, { showPlayBadge: true });
    } catch {
        return type === 'image' ? mediaUrl : undefined;
    }
};
