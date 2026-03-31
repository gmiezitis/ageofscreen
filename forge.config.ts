import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerMSIX } from "@electron-forge/maker-msix";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";
import fs from "fs";
import path from "path";

import { mainConfig } from "./webpack.main.config";
import { rendererConfig } from "./webpack.renderer.config";
import {
    WINDOWS_MAX_TESTED_VERSION,
    WINDOWS_MIN_OS_VERSION,
    WINDOWS_PUBLISHER_DEFAULT,
    WINDOWS_PUBLISHER_DISPLAY_NAME,
    WINDOWS_STORE_IDENTITY_DEFAULT,
} from "./src/config/windowsSupport";
import { FEATURES } from "./src/config/features";
import { buildReleaseProfile, inferReleaseProfileName } from "./src/config/releaseProfile";

const productName = "SnipFocus";
const packageDescription = "Local-first AI demo video maker";
const releaseProfile = buildReleaseProfile(inferReleaseProfileName());
const parsePort = (value: string | undefined, fallback: number): number => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535 ? parsed : fallback;
};
const windowsStoreIdentity = process.env.WINDOWS_STORE_IDENTITY_NAME || WINDOWS_STORE_IDENTITY_DEFAULT;
const windowsPublisher = process.env.WINDOWS_PUBLISHER || WINDOWS_PUBLISHER_DEFAULT;
const windowsCertFile = process.env.WINDOWS_CERT_FILE;
const windowsCertPassword = process.env.WINDOWS_CERT_PASSWORD;
const windowsKitRoot = process.env.WINDOWS_KIT_ROOT || "C:\\Program Files (x86)\\Windows Kits\\10\\bin";
const devServerPort = parsePort(process.env.SNIPFOCUS_DEV_SERVER_PORT, 3030);
const devLoggerPort = parsePort(process.env.SNIPFOCUS_DEV_LOGGER_PORT, 9333);
const requiredWindowsKitExecutables = ["makeappx.exe", "makepri.exe", "signtool.exe", "makecert.exe"];

const hasWindowsKitExecutables = (candidatePath: string): boolean => (
    fs.existsSync(candidatePath)
    && requiredWindowsKitExecutables.every((fileName) => fs.existsSync(path.join(candidatePath, fileName)))
);

const compareWindowsKitVersions = (left: string, right: string): number => {
    const leftParts = left.split(".").map((part) => Number(part));
    const rightParts = right.split(".").map((part) => Number(part));
    const maxParts = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < maxParts; index += 1) {
        const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
        if (diff !== 0) {
            return diff;
        }
    }

    return 0;
};

const resolveWindowsKitPath = (): string | undefined => {
    const windowsKitPathOverride = process.env.WINDOWS_KIT_PATH;
    if (windowsKitPathOverride) {
        return hasWindowsKitExecutables(windowsKitPathOverride) ? windowsKitPathOverride : undefined;
    }

    const resolveVersionPath = (version: string): string | undefined => {
        const versionedCandidates = [
            path.join(windowsKitRoot, version, "x64"),
            path.join(windowsKitRoot, version, "arm64"),
        ];

        return versionedCandidates.find(hasWindowsKitExecutables);
    };

    const windowsKitVersionOverride = process.env.WINDOWS_KIT_VERSION;
    if (windowsKitVersionOverride) {
        return resolveVersionPath(windowsKitVersionOverride);
    }

    if (!fs.existsSync(windowsKitRoot)) {
        return undefined;
    }

    const installedVersions = fs.readdirSync(windowsKitRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^10\.0\.\d+\.\d+$/.test(entry.name))
        .map((entry) => entry.name)
        .sort((left, right) => compareWindowsKitVersions(right, left));

    for (const version of installedVersions) {
        const resolved = resolveVersionPath(version);
        if (resolved) {
            return resolved;
        }
    }

    const fallbackCandidates = [
        path.join(windowsKitRoot, "x64"),
        path.join(windowsKitRoot, "arm64"),
    ];

    return fallbackCandidates.find(hasWindowsKitExecutables);
};

const windowsSignOptions = windowsCertFile && windowsCertPassword
    ? {
        certificateFile: windowsCertFile,
        certificatePassword: windowsCertPassword,
        description: productName,
        website: "https://snipfocus.app",
    }
    : undefined;
const ffmpegResourceRoot = path.resolve(__dirname, "resources", "ffmpeg");
const nativeCaptureAddonPath = path.resolve(__dirname, "src", "native", "capture_engine", "build", "Release", "capture_engine.node");
const windowsKitPath = resolveWindowsKitPath();
const extraResources = [
    ...(fs.existsSync(ffmpegResourceRoot) ? [ffmpegResourceRoot] : []),
    ...(fs.existsSync(nativeCaptureAddonPath) ? [{ from: nativeCaptureAddonPath, to: path.join("native", "capture_engine", "build", "Release", "capture_engine.node") }] : []),
];

if (releaseProfile.allowBundledFfmpegOnly && extraResources.length === 0) {
    console.warn("[forge.config] resources/ffmpeg is missing. Packaged builds will not have deterministic FFmpeg until architecture-specific binaries are added.");
}

if (releaseProfile.storeSafe && !windowsKitPath) {
    console.warn("[forge.config] Unable to resolve a Windows SDK bin path. Set WINDOWS_KIT_PATH or WINDOWS_KIT_VERSION before building MSIX packages.");
}

if (releaseProfile.storeSafe && windowsKitPath) {
    console.warn(`[forge.config] Using Windows SDK bin path: ${windowsKitPath}`);
}

const rendererEntryPoints = [
    // Main window (App with snip UI)
    {
        html: "./src/index.html",
        js: "./src/renderer.tsx",
        name: "main_window",
        preload: {
            js: "./src/preload.ts",
        },
    },
    // Capture window (region selection overlay)
    {
        html: "./src/capture/capture.html",
        js: "./src/capture/capture.tsx",
        name: "capture_window",
        preload: {
            js: "./src/capture/capturePreload.ts",
        },
    },
    // Trigger line window
    {
        html: "./src/trigger/trigger.html",
        js: "./src/trigger/renderer.ts",
        name: "trigger_window",
        preload: {
            js: "./src/trigger/preload.ts",
        },
    },
    // Menu window (4-tile menu)
    {
        html: "./src/menu/menu.html",
        js: "./src/menu/renderer.tsx",
        name: "menu_window",
        preload: {
            js: "./src/menu/menuPreload.ts",
        },
    },
    // Webcam window
    {
        html: "./src/webcam/webcam.html",
        js: "./src/webcam/webcam.tsx",
        name: "webcam_window",
        preload: {
            js: "./src/webcam/webcamPreload.ts",
        },
    },
    // Recording Widget
    {
        html: "./src/recording/recordingWidget.html",
        js: "./src/recording/recordingWidgetRenderer.ts",
        name: "recording_widget_window",
        preload: {
            js: "./src/recording/recordingWidgetPreload.ts",
        },
    },
    // Video editor window (trim/crop)
    {
        html: "./src/videoEditor/videoEditor.html",
        js: "./src/videoEditor/videoEditor.tsx",
        name: "video_editor_window",
        preload: {
            js: "./src/videoEditor/videoEditorPreload.ts",
        },
    },
];

if (FEATURES.ENABLE_FOCUS_WIDGET) {
    rendererEntryPoints.push({
        html: "./src/focus/index.html",
        js: "./src/focus/renderer.tsx",
        name: "focus_widget_window",
        preload: {
            js: "./src/focus/preload.ts",
        },
    });
}

if (FEATURES.ENABLE_TELEPROMPTER) {
    rendererEntryPoints.push({
        html: "./src/teleprompter/teleprompter.html",
        js: "./src/teleprompter/teleprompter.tsx",
        name: "teleprompter_window",
        preload: {
            js: "./src/teleprompter/teleprompterPreload.ts",
        },
    });
}

if (FEATURES.ENABLE_DRAWING) {
    rendererEntryPoints.push({
        html: "./src/drawing/drawingOverlay.html",
        js: "./src/drawing/drawingOverlay.tsx",
        name: "drawing_overlay_window",
        preload: {
            js: "./src/drawing/drawingOverlayPreload.ts",
        },
    });
}

const directDownloadMakers = [
    new MakerSquirrel({}),
    new MakerZIP({}, ["win32", "darwin", "linux"]),
];

const storeMakers = [
    new MakerMSIX({
        packageName: "SnipFocus.msix",
        sign: true,
        logLevel: "warn",
        windowsKitPath,
        manifestVariables: {
            packageIdentity: windowsStoreIdentity,
            publisher: windowsPublisher,
            publisherDisplayName: WINDOWS_PUBLISHER_DISPLAY_NAME,
            packageDisplayName: productName,
            appDisplayName: productName,
            packageDescription,
            packageBackgroundColor: "#101014",
            packageMinOSVersion: WINDOWS_MIN_OS_VERSION,
            packageMaxOSVersionTested: WINDOWS_MAX_TESTED_VERSION,
        },
        windowsSignOptions,
    }, ["win32"]),
];

const config: ForgeConfig = {
    packagerConfig: {
        asar: true,
        prune: true,
        extraResource: extraResources,
    },
    rebuildConfig: {},
    makers: releaseProfile.storeSafe ? storeMakers : directDownloadMakers,
    plugins: [
        new AutoUnpackNativesPlugin({}),
        new WebpackPlugin({
            mainConfig,
            devContentSecurityPolicy: "default-src 'self' 'unsafe-inline' 'unsafe-eval' file: data: blob: snipfocus-media:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; media-src 'self' file: blob: data: snipfocus-media: *; img-src 'self' file: blob: data: snipfocus-media: *;",
            port: devServerPort,
            loggerPort: devLoggerPort,
            renderer: {
                config: rendererConfig,
                entryPoints: rendererEntryPoints,
            },
            devServer: {
                liveReload: false,
                hot: false,
                host: "localhost",
                port: devServerPort,
            },
        }),
    ],
};

export default config;
