import fs from "fs";
import path from "path";

declare const __non_webpack_require__: NodeRequire | undefined;

export interface NativeCaptureEngine {
    getDisplays: () => unknown[];
    startCapture: () => boolean;
    stopCapture: () => boolean;
    getWindowBounds: (hwnd: string | number) => { x: number; y: number; width: number; height: number } | null;
}

const getRuntimeRequire = (): NodeRequire | null => {
    if (typeof __non_webpack_require__ === "function") {
        return __non_webpack_require__;
    }
    if (typeof require === "function") {
        return require;
    }
    return null;
};

const getAddonCandidates = (): string[] => [
    path.resolve(process.cwd(), "src", "native", "capture_engine", "build", "Release", "capture_engine.node"),
    path.resolve(process.resourcesPath || "", "native", "capture_engine", "build", "Release", "capture_engine.node"),
];

let loadedAddon: NativeCaptureEngine | null | undefined;

const loadNativeCaptureEngine = (): NativeCaptureEngine | null => {
    if (loadedAddon !== undefined) {
        return loadedAddon;
    }

    const runtimeRequire = getRuntimeRequire();
    if (!runtimeRequire) {
        loadedAddon = null;
        return loadedAddon;
    }

    for (const candidate of getAddonCandidates()) {
        if (!candidate || !fs.existsSync(candidate)) {
            continue;
        }

        try {
            loadedAddon = runtimeRequire(candidate) as NativeCaptureEngine;
            return loadedAddon;
        } catch (error) {
            console.warn("[SnipFocus] Failed to load native capture engine candidate:", candidate, error);
        }
    }

    loadedAddon = null;
    return loadedAddon;
};

export default loadNativeCaptureEngine();
