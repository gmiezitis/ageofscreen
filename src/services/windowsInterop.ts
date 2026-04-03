import captureEngine from "../native/capture_engine";
import { parseWindowHandleFromSourceId } from "../shared/windowBounds";

export interface ExternalWindowBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

let loggedNativeBoundsFailure = false;

export const getExternalWindowBounds = (sourceId: string): ExternalWindowBounds | null => {
    if (process.platform !== "win32") return null;

    const hwnd = parseWindowHandleFromSourceId(sourceId);
    if (!hwnd) return null;

    try {
        const bounds = captureEngine?.getWindowBounds?.(hwnd);
        if (!bounds || typeof bounds !== "object") return null;

        const width = Number(bounds.width);
        const height = Number(bounds.height);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            return null;
        }

        return {
            x: Number(bounds.x) || 0,
            y: Number(bounds.y) || 0,
            width,
            height,
        };
    } catch (error) {
        if (!loggedNativeBoundsFailure) {
            loggedNativeBoundsFailure = true;
            console.warn("[ageofscreen] Native window bounds lookup unavailable. Window-mode capture will fall back without external bounds.", error);
        }
        return null;
    }
};
