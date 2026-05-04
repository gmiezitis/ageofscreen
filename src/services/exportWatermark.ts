import watermarkLogo from "../assets/branding/export-watermark.png";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

let watermarkImagePromise: Promise<HTMLImageElement> | null = null;

const loadWatermarkImage = (): Promise<HTMLImageElement> => {
    if (watermarkImagePromise) {
        return watermarkImagePromise;
    }

    watermarkImagePromise = new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Failed to load export watermark image."));
        image.src = watermarkLogo;
    });

    return watermarkImagePromise;
};

const drawLogoWatermark = (
    ctx: CanvasRenderingContext2D,
    logo: HTMLImageElement,
    width: number,
    height: number,
) => {
    const shortEdge = Math.max(320, Math.min(width, height));
    const margin = clamp(Math.round(shortEdge * 0.016), 10, 22);
    const targetWidth = clamp(Math.round(shortEdge * 0.19), 94, 190);
    const aspectRatio = logo.width > 0 && logo.height > 0 ? logo.width / logo.height : 1;
    const targetHeight = Math.max(22, Math.round(targetWidth / Math.max(0.1, aspectRatio)));
    const x = width - targetWidth - margin;
    const y = height - targetHeight - margin;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
    ctx.shadowBlur = Math.max(5, Math.round(shortEdge * 0.008));
    ctx.shadowOffsetY = 1;
    ctx.globalAlpha = 0.74;
    ctx.drawImage(logo, x, y, targetWidth, targetHeight);
    ctx.restore();
};

export const buildWatermarkedCanvas = async (sourceCanvas: HTMLCanvasElement): Promise<HTMLCanvasElement> => {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = sourceCanvas.width;
    exportCanvas.height = sourceCanvas.height;

    const ctx = exportCanvas.getContext("2d");
    if (!ctx) {
        return sourceCanvas;
    }

    ctx.drawImage(sourceCanvas, 0, 0);

    try {
        const logo = await loadWatermarkImage();
        drawLogoWatermark(ctx, logo, exportCanvas.width, exportCanvas.height);
    } catch (error) {
        console.warn("[ExportWatermark] Falling back to source canvas without logo watermark:", error);
    }

    return exportCanvas;
};
