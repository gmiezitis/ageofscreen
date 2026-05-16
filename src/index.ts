/**
 * ageofscreen - Main Process
 * Lightweight screen capture and focus tool
 */

import { app, BrowserWindow, ipcMain, screen, desktopCapturer, nativeImage, Tray, Menu, dialog, globalShortcut, protocol, session, shell } from "electron";
import type { WebContents } from "electron";
import path from "path";
import { FEATURES } from "./config/features";
import { PLAN_CONFIG, type PlanTier } from "./config/plan";
import { RELEASE_PROFILE } from "./config/releaseProfile";
import { planAutoPolish, runAutoPolish } from "./services/autoPolish";
import fs from "fs";
import { execFile, spawn } from "child_process";
import Store from "electron-store";
import { EventEmitter } from "events";
import { Readable } from "stream";
import { fromMediaFileUrl, toMediaFileUrl } from "./shared/mediaPaths";
import { getCameraDimensionsForWidth, normalizeCameraShape, type CameraShape } from "./shared/cameraShapes";
import { isPathInsideDirectory, isSupportedCaptureInvokeType, isSupportedMediaDialogType, isSupportedMediaFilePath } from "./shared/pathSecurity";
import { buildSmartTrackingEffects, DEFAULT_SMART_TRACKING_PROFILE, remapSmartTrackingEffects } from "./videoEditor/smartTracking";
import { resolveBackgroundFFmpeg } from "./videoEditor/effectMath";
import type { SmartTrackingProfile } from "./videoEditor/types";
import type { AgentJob, AgentJobResult, AgentRecordingRequest, AgentSummaryPayload, ShieldMode, ShieldState } from "./shared/agent";
import { getWindowsRuntimeSupport, isWindowsStorePackage } from "./config/windowsSupport";
import { getageofscreenTempDir } from "./services/runtimePaths";
import type {
    CaptureShortcutPreference,
    EntitlementProvider,
    EntitlementState,
    OnboardingState,

    PurchaseProResult,
    UpgradeSource,
} from "./shared/licensing";
import type { MenuOpenReason, MenuOpenedPayload } from "./menu/menuLifecycle";

import { getExternalWindowBounds } from "./services/windowsInterop";

// Lazy-load services that may fail on unsupported platforms
let focusLogic: any = null;
let videoRenderer: any = null;

type AppPreferences = {
    hasCompletedOnboarding: boolean;
    preferredCaptureShortcut: CaptureShortcutPreference;
    devEntitlementOverride: PlanTier | null;
    windowsDesktopShortcutCreated: boolean;
};

const smokeLogFile = process.env.AGEOFSCREEN_SMOKE_LOG_FILE?.trim();
if (smokeLogFile) {
    const originalConsole = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
    };
    const appendSmokeLog = (level: "log" | "warn" | "error", args: unknown[]) => {
        try {
            const rendered = args.map((value) => {
                if (typeof value === "string") return value;
                if (value instanceof Error) return value.stack || value.message;
                try {
                    return JSON.stringify(value);
                } catch {
                    return String(value);
                }
            }).join(" ");
            fs.appendFileSync(smokeLogFile, `[${new Date().toISOString()}] ${level.toUpperCase()} ${rendered}\n`);
        } catch {
            // Keep smoke logging best-effort only.
        }
    };

    console.log = (...args: unknown[]) => {
        appendSmokeLog("log", args);
        originalConsole.log(...args);
    };
    console.warn = (...args: unknown[]) => {
        appendSmokeLog("warn", args);
        originalConsole.warn(...args);
    };
    console.error = (...args: unknown[]) => {
        appendSmokeLog("error", args);
        originalConsole.error(...args);
    };
}



const appPreferencesStore = new (Store as any)({
    name: "app-preferences",
    defaults: {
        hasCompletedOnboarding: false,
        preferredCaptureShortcut: "print_screen",
        devEntitlementOverride: PLAN_CONFIG.allowManualTierOverride ? (PLAN_CONFIG.devOverrideTier ?? null) : null,
        windowsDesktopShortcutCreated: false,
    } satisfies AppPreferences,
});

let entitlementLastSyncAt: string | null = null;
let cachedEntitlementState: EntitlementState = {
    tier: "free",
    maxRecordingSeconds: null,
    watermarkEnabled: true,
    canUseAutoPolish: true,
    canUseStudioVoice: false,
    purchaseAvailable: false,
    provider: isWindowsStorePackage() ? "store_stub" : "manual",
    lastSyncAt: null,
};

const readAppPreference = <T = unknown>(key: keyof AppPreferences): T => (
    (appPreferencesStore as any).get(key as string) as T
);

const writeAppPreference = (key: keyof AppPreferences, value: unknown) => {
    (appPreferencesStore as any).set(key as string, value);
};

const canUseManualEntitlementOverride = (): boolean => (
    PLAN_CONFIG.allowManualTierOverride && RELEASE_PROFILE.name === "dev"
);

const resolveStoredTierOverride = (): PlanTier | null => {
    if (!canUseManualEntitlementOverride()) {
        return null;
    }
    return readAppPreference<PlanTier | null>("devEntitlementOverride");
};

const buildEntitlementState = (
    tier: PlanTier,
    provider: EntitlementState["provider"],
    purchaseAvailable: boolean,
): EntitlementState => ({
    tier: "free",
    maxRecordingSeconds: null,
    watermarkEnabled: true,
    canUseAutoPolish: true,
    canUseStudioVoice: false,
    purchaseAvailable: false,
    provider,
    lastSyncAt: entitlementLastSyncAt,
});

const resolveManualEntitlementState = (): EntitlementState => {
    if (canUseManualEntitlementOverride()) {
        return buildEntitlementState("free", "manual", false);
    }

    if (isWindowsStorePackage()) {
        return buildEntitlementState("free", "store_stub", false);
    }

    return buildEntitlementState("free", "manual", false);
};

const broadcastLicenseState = (state: EntitlementState = cachedEntitlementState) => {
    BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
            win.webContents.send("license:state-changed", state);
        }
    });
};

const getOnboardingState = (): OnboardingState => ({
    hasCompletedOnboarding: Boolean(readAppPreference<boolean>("hasCompletedOnboarding")),
    preferredCaptureShortcut: readAppPreference<CaptureShortcutPreference>("preferredCaptureShortcut"),
});

const broadcastOnboardingState = (state: OnboardingState = getOnboardingState()) => {
    BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
            win.webContents.send("settings:onboarding-state-changed", state);
        }
    });
};






const completeOnboarding = (): OnboardingState => {
    writeAppPreference("hasCompletedOnboarding", true);
    const nextState = getOnboardingState();
    broadcastOnboardingState(nextState);
    if (shouldUseTriggerLine()) {
        restoreTriggerWindowIfEnabled(0);
    } else {
        hideTriggerWindow();
    }
    return nextState;
};



const manualEntitlementProvider: EntitlementProvider = {
    async initialize() {
        entitlementLastSyncAt = new Date().toISOString();
        cachedEntitlementState = resolveManualEntitlementState();
        return cachedEntitlementState;
    },
    async getState() {
        return cachedEntitlementState;
    },
    async refresh() {
        entitlementLastSyncAt = new Date().toISOString();
        cachedEntitlementState = resolveManualEntitlementState();
        return cachedEntitlementState;
    },
    async purchasePro(source: UpgradeSource = "generic"): Promise<PurchaseProResult> {
        const state = await this.refresh();

        return {
            success: false,
            state,
            message: "This release is free and does not include paid upgrades.",
            source,
        };
    },
    async restoreIfNeeded() {
        return this.refresh();
    },
};

const getEntitlementProvider = (): EntitlementProvider => manualEntitlementProvider;

const refreshEntitlementState = async (): Promise<EntitlementState> => {
    const nextState = await getEntitlementProvider().refresh();
    cachedEntitlementState = nextState;
    broadcastLicenseState(nextState);
    return nextState;
};

const getCurrentEntitlementState = (): EntitlementState => cachedEntitlementState;
const getAutoPolishUpgradeMessage = () => "Auto-Polish is unavailable for this clip.";
const getStudioVoiceUpgradeMessage = () => "Studio Voice is not enabled in this free release.";

const isCursorMetadataEvent = (event: any): boolean => (
    !!event
    && typeof event === 'object'
    && typeof event.type === 'string'
    && typeof event.x === 'number'
    && typeof event.y === 'number'
    && typeof event.t === 'number'
);

const normalizeCursorSidecarPayload = (payload: any): any[] | null => {
    const events = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload?.events) ? payload.events : null);

    if (!events || events.length === 0) {
        return null;
    }

    const normalizedEvents = events.filter((event: any) => isCursorMetadataEvent(event));
    const hasCursorTimeline = normalizedEvents.some((event: any) => event.type === 'move' || event.type === 'click');
    return hasCursorTimeline ? normalizedEvents : null;
};

const loadCursorMetadataSidecar = async (mediaFilePath: string): Promise<any[] | null> => {
    const extension = path.extname(mediaFilePath);
    const basePath = extension ? mediaFilePath.slice(0, -extension.length) : mediaFilePath;
    const candidatePaths = Array.from(new Set([
        `${basePath}.json`,
        `${basePath}.cursor.json`,
    ]));

    for (const candidatePath of candidatePaths) {
        if (!fs.existsSync(candidatePath)) {
            continue;
        }

        try {
            const raw = await fs.promises.readFile(candidatePath, 'utf8');
            const parsed = JSON.parse(raw);
            const cursorData = normalizeCursorSidecarPayload(parsed);
            if (cursorData) {
                console.log('[ageofscreen] Loaded cursor metadata sidecar:', {
                    mediaFilePath,
                    candidatePath,
                    events: cursorData.length,
                });
                return cursorData;
            }
            console.warn('[ageofscreen] Ignoring unsupported cursor metadata sidecar format:', candidatePath);
        } catch (error) {
            console.warn('[ageofscreen] Failed to read cursor metadata sidecar:', candidatePath, error);
        }
    }

    return null;
};

const getFocusLogic = async () => {
    if (!FEATURES.ENABLE_SMART_TARGETING_OCR) {
        return null;
    }

    if (!focusLogic) {
        try {
            const module = await import("@services/focusLogic");
            focusLogic = module.focusLogic;
        } catch (err) {
            console.warn('[ageofscreen] FocusLogic not available:', err);
        }
    }
    return focusLogic;
};

const getVideoRenderer = async () => {
    if (!videoRenderer) {
        try {
            const module = await import("./services/videoRenderer");
            videoRenderer = module.videoRenderer;
        } catch (err) {
            console.warn('[ageofscreen] VideoRenderer not available:', err);
        }
    }
    return videoRenderer;
};

const getFfprobePath = (ffmpegPath: string | null): string | null => {
    if (!ffmpegPath) return null;
    const dir = path.dirname(ffmpegPath);
    const ext = path.extname(ffmpegPath);
    const candidate = path.join(dir, `ffprobe${ext}`);
    return fs.existsSync(candidate) ? candidate : null;
};

const probeMediaDuration = (filePath: string, ffmpegPath: string | null): Promise<number | null> => (
    new Promise((resolve) => {
        const ffprobePath = getFfprobePath(ffmpegPath);
        if (!ffprobePath || !fs.existsSync(filePath)) {
            resolve(null);
            return;
        }

        const proc = spawn(ffprobePath, [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath,
        ], { stdio: ['ignore', 'pipe', 'ignore'] });

        let stdout = '';
        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        proc.on('error', () => resolve(null));
        proc.on('close', (code) => {
            if (code !== 0) {
                resolve(null);
                return;
            }
            const duration = Number.parseFloat(stdout.trim());
            resolve(Number.isFinite(duration) && duration > 0 ? duration : null);
        });
    })
);

const normalizeTempRecordingForEditor = async (sourcePath: string): Promise<string> => {
    const vr = await getVideoRenderer();
    const ffmpegPath = vr?.isAvailable?.() ? vr.getFFmpegPath?.() : null;
    if (!ffmpegPath) {
        return sourcePath;
    }

    const sourceDuration = await probeMediaDuration(sourcePath, ffmpegPath);
    if (sourceDuration && sourceDuration > 0) {
        return sourcePath;
    }

    const remuxedPath = sourcePath.replace(/\.[^.]+$/, '.fixed.webm');
    const normalizedPath = sourcePath.replace(/\.[^.]+$/, '.mp4');
    console.log('[ageofscreen] Recording duration metadata missing; normalizing temp recording for editor', {
        sourcePath,
        remuxedPath,
        normalizedPath,
    });

    const runFfmpeg = (args: string[]) => new Promise<void>((resolve, reject) => {
        const proc = spawn(ffmpegPath, [
            '-y',
            ...args,
        ], { stdio: ['ignore', 'ignore', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
        });
    });

    try {
        await runFfmpeg([
            '-fflags', '+genpts',
            '-i', sourcePath,
            '-map', '0:v:0',
            '-map', '0:a:0?',
            '-c', 'copy',
            remuxedPath,
        ]);

        const remuxedDuration = await probeMediaDuration(remuxedPath, ffmpegPath);
        if (remuxedDuration && remuxedDuration > 0) {
            try {
                await fs.promises.unlink(sourcePath);
            } catch {
                // Keep the original temp file if cleanup fails.
            }
            return remuxedPath;
        }
    } catch (error) {
        console.warn('[ageofscreen] Fast WebM duration repair failed; falling back to MP4 transcode.', error);
    }

    await runFfmpeg([
            '-i', sourcePath,
            '-map', '0:v:0',
            '-map', '0:a:0?',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-c:a', 'aac',
            '-b:a', '160k',
            normalizedPath,
    ]);

    const normalizedDuration = await probeMediaDuration(normalizedPath, ffmpegPath);
    if (!normalizedDuration || normalizedDuration <= 0) {
        throw new Error('Normalized recording is still missing duration metadata');
    }

    try {
        await fs.promises.unlink(sourcePath);
    } catch {
        // Keep the original temp file if cleanup fails.
    }

    return normalizedPath;
};

const getMediaMimeType = (filePath: string): string => {
    switch (path.extname(filePath).toLowerCase()) {
        case '.mp4':
        case '.m4v':
            return 'video/mp4';
        case '.webm':
            return 'video/webm';
        case '.mov':
            return 'video/quicktime';
        case '.avi':
            return 'video/x-msvideo';
        case '.mkv':
            return 'video/x-matroska';
        case '.mp3':
            return 'audio/mpeg';
        case '.wav':
            return 'audio/wav';
        case '.ogg':
            return 'audio/ogg';
        case '.m4a':
            return 'audio/mp4';
        case '.flac':
            return 'audio/flac';
        case '.aac':
            return 'audio/aac';
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.gif':
            return 'image/gif';
        case '.webp':
            return 'image/webp';
        case '.bmp':
            return 'image/bmp';
        default:
            return 'application/octet-stream';
    }
};

const getRequestHeader = (headers: Headers | Record<string, string>, name: string): string | null => {
    if ((headers as Headers).get) {
        return (headers as Headers).get(name);
    }

    const recordHeaders = headers as Record<string, string>;
    return recordHeaders[name] ?? recordHeaders[name.toLowerCase()] ?? null;
};

const createMediaFileResponse = async (request: Request, filePath: string): Promise<Response> => {
    const stats = await fs.promises.stat(filePath);
    const totalSize = stats.size;
    const mimeType = getMediaMimeType(filePath);
    const rangeHeader = getRequestHeader(request.headers, 'range');
    const method = request.method?.toUpperCase?.() || 'GET';

    const baseHeaders = {
        'Accept-Ranges': 'bytes',
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache',
    };

    if (!rangeHeader) {
        if (method === 'HEAD') {
            return new Response(null, {
                status: 200,
                headers: {
                    ...baseHeaders,
                    'Content-Length': String(totalSize),
                },
            });
        }

        const stream = fs.createReadStream(filePath);
        return new Response(Readable.toWeb(stream) as any, {
            status: 200,
            headers: {
                ...baseHeaders,
                'Content-Length': String(totalSize),
            },
        });
    }

    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (!match) {
        return new Response(null, {
            status: 416,
            headers: {
                ...baseHeaders,
                'Content-Range': `bytes */${totalSize}`,
            },
        });
    }

    const [, startRaw, endRaw] = match;
    let start = startRaw ? Number.parseInt(startRaw, 10) : NaN;
    let end = endRaw ? Number.parseInt(endRaw, 10) : NaN;

    if (Number.isNaN(start)) {
        const suffixLength = Number.isNaN(end) ? totalSize : end;
        start = Math.max(0, totalSize - suffixLength);
        end = totalSize - 1;
    } else {
        end = Number.isNaN(end) ? totalSize - 1 : Math.min(end, totalSize - 1);
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= totalSize) {
        return new Response(null, {
            status: 416,
            headers: {
                ...baseHeaders,
                'Content-Range': `bytes */${totalSize}`,
            },
        });
    }

    const chunkSize = end - start + 1;
    if (method === 'HEAD') {
        return new Response(null, {
            status: 206,
            headers: {
                ...baseHeaders,
                'Content-Length': String(chunkSize),
                'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            },
        });
    }

    const stream = fs.createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(stream) as any, {
        status: 206,
        headers: {
            ...baseHeaders,
            'Content-Length': String(chunkSize),
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        },
    });
};

// Register app-owned media protocol so renderer pages can load local video/image/audio files
// without disabling Chromium web security for the whole editor.
protocol.registerSchemesAsPrivileged([
    { scheme: 'file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
    { scheme: 'ageofscreen-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
]);

// Enable Hardware Acceleration for peak performance, especially on ARM64/Surface devices.
// We only disable it if the user explicitly triggers a "Safe Mode" or if we detect legacy drivers.
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-hardware-overlays');
app.commandLine.appendSwitch('use-angle', 'd3d11'); // Surface/ARM64 standard


// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (!isWindowsStorePackage() && require("electron-squirrel-startup")) {
    app.quit();
}

const windowsRuntimeSupport = getWindowsRuntimeSupport();
if (windowsRuntimeSupport.platform === "win32") {
    console.log("[ageofscreen] Windows runtime support:", windowsRuntimeSupport);
    console.log("[ageofscreen] Release profile:", RELEASE_PROFILE);
    if (windowsRuntimeSupport.isArm64) {
        console.log("[ageofscreen] Windows ARM64 detected. Validate capture, export, FFmpeg, and MSIX flows on this device before release.");
    }
}

// Hub Dimensions
const HUB_WIDTH = 900;
const HUB_HEIGHT = 720;

// Window references
let triggerWindow: BrowserWindow | null = null;
let menuWindow: BrowserWindow | null = null;
let captureWindow: BrowserWindow | null = null;
let focusWindow: BrowserWindow | null = null;
let webcamWindow: BrowserWindow | null = null;
let editorWindow: BrowserWindow | null = null;
let recordingWidget: BrowserWindow | null = null;
let teleprompterWindow: BrowserWindow | null = null;
let drawingOverlayWindow: BrowserWindow | null = null;
let videoEditorWindow: BrowserWindow | null = null;
let introWindow: BrowserWindow | null = null;
let _tray: Tray | null = null;
let wasWebcamVisibleBeforeDrawing = false;
let shouldRestoreEditorAfterCaptureCancel = false;
let isCaptureSessionActive = false;

// Shield state
const shieldStore = new (Store as any)({
    name: "shield-preferences",
    defaults: { shieldMode: "human_local" },
});
const getStoredShieldMode = (): ShieldMode => {
    if (!FEATURES.ENABLE_AGENT_SURFACES) {
        return "human_local";
    }
    const raw = (shieldStore as any).get("shieldMode");
    return raw === "agent_local" ? "agent_local" : "human_local";
};
let shieldMode: ShieldMode = getStoredShieldMode();
const shieldEvents = new EventEmitter();
let webRequestInstalled = false;
let lastBlockedNoticeAt = 0;
let triggerMouseResetTimeout: NodeJS.Timeout | null = null;
let triggerTrackingInterval: NodeJS.Timeout | null = null;
let triggerHoverStartedAt = 0;
let triggerLastOpenedAt = 0;
let pendingStopRecordingDispatchTimeouts: NodeJS.Timeout[] = [];
let menuTriggerRearmTimeout: NodeJS.Timeout | null = null;
let menuIdleReleaseTimeout: NodeJS.Timeout | null = null;
let menuReopenBlockedUntil = 0;
let menuWindowShouldShowOnReady = true;
let menuWindowBlurGuardUntil = 0;

const toShieldState = (mode: ShieldMode): ShieldState => ({
    mode,
    localOnly: true,
    agentEnabled: FEATURES.ENABLE_AGENT_SURFACES && mode === "agent_local",
    networkFilterEnabled: true,
});

const setShieldMode = (value: ShieldMode) => {
    shieldMode = FEATURES.ENABLE_AGENT_SURFACES && value === "agent_local" ? "agent_local" : "human_local";
    if (shieldMode !== "agent_local") {
        agentAutoRecordingRequested = false;
    }
    (shieldStore as any).set("shieldMode", shieldMode);
    shieldEvents.emit("state-changed", toShieldState(shieldMode));
    if (shieldMode === "agent_local") {
        setTimeout(() => maybeAutoStartAgentRecording("shield mode changed"), 200);
    }
};

const installShieldRequestFilter = () => {
    if (webRequestInstalled) return;
    const defaultSession = session.defaultSession;
    if (!defaultSession) {
        console.warn("[ageofscreen] Shield filter skipped: no defaultSession");
        return;
    }

    defaultSession.webRequest.onBeforeRequest((details, callback) => {
        try {
            if (!toShieldState(shieldMode).networkFilterEnabled) {
                callback({});
                return;
            }

            const url = details.url || "";
            let hostname = "";
            try {
                const parsed = new URL(url);
                const protocol = parsed.protocol.replace(":", "");
                if (protocol !== "http" && protocol !== "https") {
                    callback({});
                    return;
                }
                hostname = parsed.hostname.toLowerCase();
                if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
                    callback({});
                    return;
                }
            } catch (err) {
                console.warn("[ageofscreen] Shield filter parse failure, allowing request:", url, err);
                callback({});
                return;
            }

            const now = Date.now();
            if (now - lastBlockedNoticeAt > 1000) {
                lastBlockedNoticeAt = now;
                shieldEvents.emit("blocked-request", { url, hostname });
            }
            callback({ cancel: true });
        } catch (err) {
            console.error("[ageofscreen] Shield filter error, allowing request:", err);
            callback({});
        }
    });

    webRequestInstalled = true;
    console.log("[ageofscreen] Shield filter installed. Initial mode:", shieldMode);
};

const installMediaPermissionHandlers = () => {
    const defaultSession = session.defaultSession;
    if (!defaultSession) {
        console.warn("[ageofscreen] Media permission handlers skipped: no defaultSession");
        return;
    }

    const isTrustedWebContents = (webContents: WebContents | null | undefined): boolean => {
        if (!webContents || webContents.isDestroyed()) {
            return false;
        }

        const ownerWindow = BrowserWindow.fromWebContents(webContents);
        return !!ownerWindow;
    };

    defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowed = isTrustedWebContents(webContents) && permission === "media";
        callback(allowed);
    });

    defaultSession.setPermissionCheckHandler((webContents, permission) => {
        return isTrustedWebContents(webContents) && permission === "media";
    });
};

// Temp recorded video for editing
let pendingVideoDataUrl: string | null = null;
let pendingMediaName: string | null = null;
let pendingAgentSummary: AgentSummaryPayload | null = null;
let latestAgentVideoPath: string | null = null;
let pendingVideoDeliveryInFlight = false;
let agentAutoRecordingRequested = false;
let _latestCaptureHealth: { droppedFrames: number; bufferErrors: number; effectiveFps: number | null; status: string } | null = null;
let _latestSourceStatus: { screen: boolean; camera: boolean; mic: boolean } | null = null;

const DEFAULT_AGENT_RECORDING_REQUEST: AgentRecordingRequest = {
    recordingMode: "fullscreen",
    cameraEnabled: false,
    micEnabled: true,
    captureCursorData: true,
    liveMagnifierEnabled: false,
    editAfterRecording: false,
};

const shouldAutoSaveToDownloads = () => shieldMode === "agent_local";
const resolveAutomatedExportPath = (defaultFolder: string, defaultFileName: string): string | null => {
    const smokeExportDir = process.env.AGEOFSCREEN_SMOKE_EXPORT_DIR?.trim();
    if (!smokeExportDir) {
        return null;
    }

    const targetDir = path.resolve(smokeExportDir);
    fs.mkdirSync(targetDir, { recursive: true });
    return path.join(targetDir, defaultFileName);
};
const resolveExportSavePath = async ({
    defaultFolder,
    defaultFileName,
    filters,
}: {
    defaultFolder: string;
    defaultFileName: string;
    filters: Electron.FileFilter[];
}): Promise<string | null> => {
    const automatedPath = resolveAutomatedExportPath(defaultFolder, defaultFileName);
    if (automatedPath) {
        return automatedPath;
    }

    const { filePath, canceled } = await dialog.showSaveDialog({
        defaultPath: path.join(defaultFolder, defaultFileName),
        filters,
    });

    if (canceled || !filePath) {
        return null;
    }

    return filePath;
};

// Recording Widget Dimensions
const RECORDING_WIDGET_WIDTH = 220;
const RECORDING_WIDGET_HEIGHT = 42;
const RECORDING_WIDGET_MARGIN = 20;

// Teleprompter settings
let teleprompterText = '';
let teleprompterSpeed = 90;

// Auto-Zoom State
let isAutoZoomEnabled = false;
let lastMousePos = { x: 0, y: 0 };
let mouseTrackInterval: NodeJS.Timeout | null = null;
const TRIGGER_WINDOW_WIDTH = 40;
const TRIGGER_WINDOW_HEIGHT = 2;
const TRIGGER_WINDOW_TOP_OFFSET = 0;
const MENU_WINDOW_TOP_OFFSET = TRIGGER_WINDOW_HEIGHT + 1;
const TRIGGER_HOVER_OPEN_MS = 180;
const TRIGGER_TRACK_INTERVAL_MS = 50;
const MENU_REOPEN_GUARD_MS = 260;
const MENU_TRIGGER_REARM_DELAY_MS = 120;
const MENU_PREWARM_DELAY_MS = 260;
const MENU_IDLE_RELEASE_DELAY_MS = 6000;
const CAPTURE_WINDOW_SETTLE_MS = 160;
const STOP_RECORDING_RETRY_DELAYS_MS = [0, 160, 420] as const;
const PRINT_SCREEN_REGISTRATION_RETRY_DELAYS_MS = [1000, 5000, 15000] as const;
const AUTO_LAUNCH_ARG = "--ageofscreen-startup";
let isWebcamSmall = false; // Toggle for webcam size
let isWebcamZoomed = false; // Track zoom status for manual toggle
let printScreenRegistrationRetryTimeouts: NodeJS.Timeout[] = [];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hideWindowForCapture = (windowRef: BrowserWindow | null): boolean => {
    if (!windowRef || windowRef.isDestroyed() || !windowRef.isVisible()) {
        return false;
    }

    windowRef.hide();
    return true;
};
const shouldUseTriggerLine = (): boolean => (
    process.platform === "win32"
    || !Boolean(readAppPreference<boolean>("hasCompletedOnboarding"))
    || readAppPreference<CaptureShortcutPreference>("preferredCaptureShortcut") === "trigger_line"
);

const shouldUsePrintScreenShortcut = (): boolean => (
    readAppPreference<CaptureShortcutPreference>("preferredCaptureShortcut") === "print_screen"
);

const runWindowsCommand = (command: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> => (
    new Promise((resolve) => {
        execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
            resolve({
                stdout: stdout?.toString?.() ?? "",
                stderr: stderr?.toString?.() ?? "",
                code: typeof (error as any)?.code === "number" ? (error as any).code : 0,
            });
        });
    })
);

const cleanupBrokenWindowsAutoLaunchRegistration = async () => {
    if (process.platform !== "win32") {
        return;
    }

    try {
        const runKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
        const queryResult = await runWindowsCommand("reg.exe", ["query", runKey, "/v", "AgeofScreen"]);
        const value = `${queryResult.stdout}\n${queryResult.stderr}`;
        const hasBrokenDevElectronEntry = /node_modules\\electron\\dist\\electron\.exe/i.test(value)
            || /node_modules\/electron\/dist\/electron\.exe/i.test(value);

        if (!hasBrokenDevElectronEntry) {
            return;
        }

        await runWindowsCommand("reg.exe", ["delete", runKey, "/v", "AgeofScreen", "/f"]);
        console.log("[ageofscreen] Removed broken development Electron startup entry.");
    } catch (error) {
        console.warn("[ageofscreen] Failed to clean development startup entry:", error);
    }
};

const ensureWindowsAutoLaunchRegistration = () => {
    if (process.platform !== "win32") {
        return;
    }

    try {
        if (!app.isPackaged) {
            console.log("[ageofscreen] Skipping Windows startup registration in development.");
            return;
        }

        app.setLoginItemSettings({
            openAtLogin: true,
            enabled: true,
            name: "AgeofScreen",
            path: process.execPath,
            args: [AUTO_LAUNCH_ARG],
        });
        const loginSettings = app.getLoginItemSettings({
            path: process.execPath,
            args: [AUTO_LAUNCH_ARG],
        });
        console.log("[ageofscreen] Windows startup registration:", {
            openAtLogin: loginSettings.openAtLogin,
            executableWillLaunchAtLogin: loginSettings.executableWillLaunchAtLogin,
            wasOpenedAtLogin: loginSettings.wasOpenedAtLogin,
        });
    } catch (error) {
        console.warn("[ageofscreen] Failed to register Windows startup launch:", error);
    }
};

const ensureWindowsPrintScreenPreference = async () => {
    if (process.platform !== "win32" || !shouldUsePrintScreenShortcut()) {
        return;
    }

    try {
        const result = await runWindowsCommand("reg.exe", [
            "add",
            "HKCU\\Control Panel\\Keyboard",
            "/v",
            "PrintScreenKeyForSnippingEnabled",
            "/t",
            "REG_DWORD",
            "/d",
            "0",
            "/f",
        ]);

        if (result.code === 0) {
            console.log("[ageofscreen] Windows Print Screen snipping handoff disabled for AgeofScreen shortcut registration.");
        } else {
            console.warn("[ageofscreen] Could not update Windows Print Screen preference:", result);
        }
    } catch (error) {
        console.warn("[ageofscreen] Failed to update Windows Print Screen preference:", error);
    }
};

const isWindowsAutoLaunch = (): boolean => {
    if (process.platform !== "win32") {
        return false;
    }

    if (process.argv.includes(AUTO_LAUNCH_ARG)) {
        return true;
    }

    try {
        return app.getLoginItemSettings({
            path: process.execPath,
            args: [AUTO_LAUNCH_ARG],
        }).wasOpenedAtLogin;
    } catch {
        return false;
    }
};

const clearPrintScreenRegistrationRetries = () => {
    for (const timeout of printScreenRegistrationRetryTimeouts) {
        clearTimeout(timeout);
    }
    printScreenRegistrationRetryTimeouts = [];
};

const resolveAppIconPath = (fileName = "app-icon.png"): string | null => {
    const candidates = [
        path.join(process.resourcesPath, fileName),
        path.join(app.getAppPath(), "resources", fileName),
        path.join(__dirname, "..", "resources", fileName),
        path.join(__dirname, "..", "..", "resources", fileName),
        path.resolve(process.cwd(), "resources", fileName),
    ];

    return candidates.find((candidate) => {
        try {
            return fs.existsSync(candidate);
        } catch {
            return false;
        }
    }) ?? null;
};

const getAppWindowIcon = () => {
    const iconPath = resolveAppIconPath(process.platform === "win32" ? "app-icon.ico" : "app-icon.png");
    return iconPath ? nativeImage.createFromPath(iconPath) : undefined;
};

const resolveWindowsStoreAppUserModelId = async (): Promise<string | null> => {
    if (process.platform !== "win32" || !isWindowsStorePackage()) {
        return null;
    }

    const script = `
$ErrorActionPreference = 'Stop'
$names = @('Age of Screen', 'AgeofScreen')
$app = Get-StartApps | Where-Object { $names -contains $_.Name } | Select-Object -First 1
if (-not $app) { exit 2 }
[Console]::Out.Write($app.AppID)
`;

    try {
        const result = await runWindowsCommand("powershell.exe", [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ]);

        const appUserModelId = result.stdout.trim();
        if (result.code === 0 && appUserModelId) {
            return appUserModelId;
        }

        console.warn("[ageofscreen] Could not resolve Windows Store AppUserModelID:", result);
    } catch (error) {
        console.warn("[ageofscreen] Failed to resolve Windows Store AppUserModelID:", error);
    }

    return null;
};

const createWindowsStoreDesktopShortcut = async () => {
    if (process.platform !== "win32" || !isWindowsStorePackage()) {
        return;
    }

    const shortcutPath = path.join(app.getPath("desktop"), "Age of Screen.lnk");
    if (fs.existsSync(shortcutPath)) {
        writeAppPreference("windowsDesktopShortcutCreated", true);
        return;
    }

    if (readAppPreference<boolean>("windowsDesktopShortcutCreated")) {
        writeAppPreference("windowsDesktopShortcutCreated", false);
    }

    const iconPath = resolveAppIconPath("app-icon.ico") || "";
    const appUserModelId = await resolveWindowsStoreAppUserModelId();
    if (!appUserModelId) {
        return;
    }

    try {
        const created = shell.writeShortcutLink(shortcutPath, "create", {
            target: path.join(process.env.WINDIR || "C:\\Windows", "explorer.exe"),
            args: `shell:AppsFolder\\${appUserModelId}`,
            cwd: app.getPath("home"),
            description: "Age of Screen",
            icon: iconPath || undefined,
            iconIndex: 0,
            appUserModelId,
        });

        if (created && fs.existsSync(shortcutPath)) {
            writeAppPreference("windowsDesktopShortcutCreated", true);
            console.log("[ageofscreen] Created Windows Store desktop shortcut:", shortcutPath);
            return;
        }

        console.warn("[ageofscreen] Windows Store desktop shortcut was not created.");
    } catch (error) {
        console.warn("[ageofscreen] Failed to create Windows Store desktop shortcut:", error);
    }
};

const openAgeofScreenLauncher = () => {
    createTriggerWindow();
    restoreTriggerWindowIfEnabled(40);
    createMenuWindow({
        openReason: "manual",
        bypassReopenGuard: true,
    });
};

const createAppTray = () => {
    if (_tray) {
        return;
    }

    const iconPath = resolveAppIconPath("app-icon.png");
    const trayIcon = iconPath
        ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
        : nativeImage.createEmpty();

    _tray = new Tray(trayIcon);
    _tray.setToolTip("AgeofScreen");
    _tray.setContextMenu(Menu.buildFromTemplate([
        { label: "Launch AgeofScreen", click: openAgeofScreenLauncher },
        { label: "Open Media Editor", click: () => createVideoEditorWindow() },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
    ]));
    _tray.on("click", openAgeofScreenLauncher);
    _tray.on("double-click", openAgeofScreenLauncher);
};

const clearTriggerMouseReset = () => {
    if (triggerMouseResetTimeout) {
        clearTimeout(triggerMouseResetTimeout);
        triggerMouseResetTimeout = null;
    }
};

const clearTriggerTracking = () => {
    triggerHoverStartedAt = 0;
    if (triggerTrackingInterval) {
        clearInterval(triggerTrackingInterval);
        triggerTrackingInterval = null;
    }
};

const clearPendingStopRecordingDispatches = () => {
    if (pendingStopRecordingDispatchTimeouts.length === 0) {
        return;
    }

    for (const timeout of pendingStopRecordingDispatchTimeouts) {
        clearTimeout(timeout);
    }
    pendingStopRecordingDispatchTimeouts = [];
};

const dispatchStopRecordingRequest = () => {
    if (menuWindow && !menuWindow.isDestroyed()) {
        menuWindow.webContents.send("stop-recording-requested");
    }
    if (editorWindow && !editorWindow.isDestroyed()) {
        editorWindow.webContents.send("stop-recording-requested");
    }
};

const startTriggerTracking = () => {
    if (triggerTrackingInterval) {
        return;
    }

    triggerTrackingInterval = setInterval(() => {
        if (!shouldUseTriggerLine() || isCaptureSessionActive) {
            triggerHoverStartedAt = 0;
            return;
        }

        if (!triggerWindow || triggerWindow.isDestroyed() || !triggerWindow.isVisible()) {
            triggerHoverStartedAt = 0;
            return;
        }

        if (menuWindow && !menuWindow.isDestroyed() && menuWindow.isVisible()) {
            triggerHoverStartedAt = 0;
            return;
        }

        const now = Date.now();
        if (now < menuReopenBlockedUntil || now - triggerLastOpenedAt < MENU_REOPEN_GUARD_MS) {
            triggerHoverStartedAt = 0;
            return;
        }

        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth } = primaryDisplay.size;
        const triggerX = primaryDisplay.bounds.x + Math.round((screenWidth - TRIGGER_WINDOW_WIDTH) / 2);
        const cursorPoint = screen.getCursorScreenPoint();
        const withinTriggerBounds = (
            cursorPoint.x >= triggerX
            && cursorPoint.x < triggerX + TRIGGER_WINDOW_WIDTH
            && cursorPoint.y >= primaryDisplay.bounds.y + TRIGGER_WINDOW_TOP_OFFSET
            && cursorPoint.y <= primaryDisplay.bounds.y + TRIGGER_WINDOW_TOP_OFFSET + TRIGGER_WINDOW_HEIGHT
        );

        if (!withinTriggerBounds) {
            triggerHoverStartedAt = 0;
            return;
        }

        if (!triggerHoverStartedAt) {
            triggerHoverStartedAt = now;
            return;
        }

        if (now - triggerHoverStartedAt >= TRIGGER_HOVER_OPEN_MS) {
            triggerHoverStartedAt = 0;
            triggerLastOpenedAt = now;
            createMenuWindow();
        }
    }, TRIGGER_TRACK_INTERVAL_MS);
};

const hideTriggerWindow = () => {
    clearTriggerMouseReset();
    clearTriggerTracking();

    if (!triggerWindow || triggerWindow.isDestroyed()) {
        return;
    }

    triggerWindow.hide();
    triggerWindow.setIgnoreMouseEvents(true, { forward: true });
};

const registerCaptureShortcut = (scheduleRetries = true) => {
    try {
        if (globalShortcut.isRegistered("PrintScreen")) {
            globalShortcut.unregister("PrintScreen");
        }

        if (!shouldUsePrintScreenShortcut()) {
            return;
        }

        const registered = globalShortcut.register("PrintScreen", () => {
            if (isCaptureSessionActive) {
                return;
            }

            createMenuWindow({
                openReason: "manual",
                bypassReopenGuard: true,
            });
        });

        if (!registered) {
            console.warn("[ageofscreen] Print Screen shortcut could not be registered.");
            if (scheduleRetries) {
                clearPrintScreenRegistrationRetries();
                printScreenRegistrationRetryTimeouts = PRINT_SCREEN_REGISTRATION_RETRY_DELAYS_MS.map((delayMs) => (
                    setTimeout(() => {
                        if (!globalShortcut.isRegistered("PrintScreen")) {
                            registerCaptureShortcut(false);
                        }
                    }, delayMs)
                ));
            }
            return;
        }
        clearPrintScreenRegistrationRetries();
    } catch (error) {
        console.warn("[ageofscreen] Failed to register Print Screen shortcut:", error);
    }
};
let zoomToMouseActive = false; // Current zoom state

// Temporary screenshot data
let tempScreenshotDataUrl: string | null = null;

// Webpack entry points (generated at build time)
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const CAPTURE_WINDOW_WEBPACK_ENTRY: string;
declare const CAPTURE_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const TRIGGER_WINDOW_WEBPACK_ENTRY: string;
declare const TRIGGER_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const FOCUS_WIDGET_WINDOW_WEBPACK_ENTRY: string;
declare const FOCUS_WIDGET_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const MENU_WINDOW_WEBPACK_ENTRY: string;
declare const MENU_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const WEBCAM_WINDOW_WEBPACK_ENTRY: string;
declare const WEBCAM_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const RECORDING_WIDGET_WINDOW_WEBPACK_ENTRY: string;
declare const RECORDING_WIDGET_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const TELEPROMPTER_WINDOW_WEBPACK_ENTRY: string;
declare const TELEPROMPTER_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const DRAWING_OVERLAY_WINDOW_WEBPACK_ENTRY: string;
declare const DRAWING_OVERLAY_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const VIDEO_EDITOR_WINDOW_WEBPACK_ENTRY: string;
declare const VIDEO_EDITOR_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// --- Editor Window (Main Annotation App) ---
const createEditorWindow = (initialDataUrl?: string, options: { showWhenReady?: boolean } = {}) => {
    const { showWhenReady = true } = options;
    if (editorWindow && !editorWindow.isDestroyed()) {
        hideTriggerWindow();
        if (showWhenReady) {
            editorWindow.show();
            editorWindow.focus();
        }
        if (initialDataUrl) {
            const sendCaptureData = () => {
                if (editorWindow && !editorWindow.isDestroyed()) {
                    editorWindow.webContents.send("capture-data", { success: true, dataUrl: initialDataUrl });
                }
            };
            if (editorWindow.webContents.isLoadingMainFrame()) {
                editorWindow.webContents.once("did-finish-load", sendCaptureData);
            } else {
                sendCaptureData();
            }
        }
        return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: _width, height: _height } = primaryDisplay.workAreaSize;

    editorWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        backgroundColor: "#0f0f17",
        icon: getAppWindowIcon(),
        show: false,
        webPreferences: {
            preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    editorWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

    editorWindow.once("ready-to-show", () => {
        if (editorWindow) {
            hideTriggerWindow();
            if (showWhenReady) {
                editorWindow.show();
            }
            if (initialDataUrl) {
                editorWindow.webContents.send("capture-data", { success: true, dataUrl: initialDataUrl });
            }
        }
    });

    editorWindow.on("closed", () => {
        editorWindow = null;
        restoreTriggerWindowIfEnabled();
    });
};

// --- Trigger Window ---
const rearmTriggerWindow = () => {
    if (!triggerWindow || triggerWindow.isDestroyed()) return;
    if (!shouldUseTriggerLine() || isCaptureSessionActive) {
        hideTriggerWindow();
        return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.size;
    const triggerX = Math.round((screenWidth - TRIGGER_WINDOW_WIDTH) / 2);

    triggerWindow.setBounds({
        width: TRIGGER_WINDOW_WIDTH,
        height: TRIGGER_WINDOW_HEIGHT,
        x: primaryDisplay.bounds.x + triggerX,
        y: TRIGGER_WINDOW_TOP_OFFSET,
    }, false);
    triggerWindow.setAlwaysOnTop(true, 'screen-saver');
    triggerWindow.showInactive();
    triggerWindow.setIgnoreMouseEvents(true, { forward: true });
    clearTriggerMouseReset();
    startTriggerTracking();
};

const scheduleTriggerRearm = (delayMs = MENU_TRIGGER_REARM_DELAY_MS) => {
    if (menuTriggerRearmTimeout) {
        clearTimeout(menuTriggerRearmTimeout);
    }

    menuTriggerRearmTimeout = setTimeout(() => {
        menuTriggerRearmTimeout = null;
        rearmTriggerWindow();
    }, delayMs);
};

const restoreTriggerWindowIfEnabled = (delayMs = MENU_TRIGGER_REARM_DELAY_MS) => {
    if (!shouldUseTriggerLine() || isCaptureSessionActive) {
        hideTriggerWindow();
        return;
    }

    scheduleTriggerRearm(delayMs);
};

const clearMenuIdleRelease = () => {
    if (menuIdleReleaseTimeout) {
        clearTimeout(menuIdleReleaseTimeout);
        menuIdleReleaseTimeout = null;
    }
};

const scheduleMenuIdleRelease = (delayMs = MENU_IDLE_RELEASE_DELAY_MS) => {
    clearMenuIdleRelease();

    menuIdleReleaseTimeout = setTimeout(() => {
        menuIdleReleaseTimeout = null;

        if (isRecordingActive) {
            return;
        }

        if (!menuWindow || menuWindow.isDestroyed() || menuWindow.isVisible()) {
            return;
        }

        menuWindow.close();
    }, delayMs);
};

const armMenuBlurGuard = (durationMs = 1200) => {
    menuWindowBlurGuardUntil = Date.now() + durationMs;
};

const hideMenuWindow = (
    options: {
        rearmTrigger?: boolean;
        rearmDelayMs?: number;
        blockReopenMs?: number;
    } = {},
) => {
    const {
        rearmTrigger = true,
        rearmDelayMs = MENU_TRIGGER_REARM_DELAY_MS,
        blockReopenMs = MENU_REOPEN_GUARD_MS,
    } = options;

    menuReopenBlockedUntil = Date.now() + blockReopenMs;

    if (menuWindow && !menuWindow.isDestroyed()) {
        menuWindow.hide();
        scheduleMenuIdleRelease();
    }

    if (rearmTrigger && !isCaptureSessionActive) {
        scheduleTriggerRearm(rearmDelayMs);
    } else if (!shouldUseTriggerLine()) {
        hideTriggerWindow();
    }
};

const notifyMenuOpened = (payload: MenuOpenedPayload) => {
    if (!menuWindow || menuWindow.isDestroyed()) {
        return;
    }

    const sendOpened = () => {
        if (menuWindow && !menuWindow.isDestroyed()) {
            menuWindow.webContents.send("menu-opened", payload);
        }
    };

    if (menuWindow.webContents.isLoadingMainFrame()) {
        menuWindow.webContents.once("did-finish-load", sendOpened);
        return;
    }

    sendOpened();
};

const createTriggerWindow = () => {
    if (triggerWindow && !triggerWindow.isDestroyed()) {
        rearmTriggerWindow();
        return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.size;
    const triggerX = Math.round((screenWidth - TRIGGER_WINDOW_WIDTH) / 2);

    triggerWindow = new BrowserWindow({
        width: TRIGGER_WINDOW_WIDTH,
        height: TRIGGER_WINDOW_HEIGHT,
        x: primaryDisplay.bounds.x + triggerX,
        y: TRIGGER_WINDOW_TOP_OFFSET,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        focusable: false,
        hasShadow: false,
        show: false,
        webPreferences: {
            preload: TRIGGER_WINDOW_PRELOAD_WEBPACK_ENTRY,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    triggerWindow.loadURL(TRIGGER_WINDOW_WEBPACK_ENTRY);

    triggerWindow.once('ready-to-show', () => {
        if (shouldUseTriggerLine()) {
            rearmTriggerWindow();
        } else {
            hideTriggerWindow();
        }
    });

    triggerWindow.on("closed", () => {
        clearTriggerMouseReset();
        clearTriggerTracking();
        triggerWindow = null;
    });
};

// --- Menu Window (Hub Menu) ---
const createMenuWindow = (
    options: {
        show?: boolean;
        bypassReopenGuard?: boolean;
        openReason?: MenuOpenReason;
    } = {},
) => {
    const {
        show = true,
        bypassReopenGuard = false,
        openReason,
    } = options;

    if (show && isCaptureSessionActive) {
        return;
    }

    if (show && !bypassReopenGuard && Date.now() < menuReopenBlockedUntil) {
        return;
    }

    menuWindowShouldShowOnReady = show;

    if (show) {
        menuReopenBlockedUntil = 0;
        clearMenuIdleRelease();
        hideTriggerWindow();
        armMenuBlurGuard();
        if (menuTriggerRearmTimeout) {
            clearTimeout(menuTriggerRearmTimeout);
            menuTriggerRearmTimeout = null;
        }
    }

    if (menuWindow && !menuWindow.isDestroyed()) {
        if (show && !menuWindow.webContents.isLoadingMainFrame()) {
            menuWindow.show();
            menuWindow.focus();
        }
        if (!show) {
            scheduleMenuIdleRelease();
        }
        if (show && openReason) {
            notifyMenuOpened({ reason: openReason, openedAt: Date.now() });
        }
        return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: _screenHeight } = primaryDisplay.size;
    const centerX = Math.round((screenWidth - HUB_WIDTH) / 2);

    menuWindow = new BrowserWindow({
        width: HUB_WIDTH,
        height: HUB_HEIGHT,
        x: centerX,
        y: MENU_WINDOW_TOP_OFFSET, // Leave the trigger strip visible at the top edge
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        icon: getAppWindowIcon(),
        show: false,
        webPreferences: {
            preload: MENU_WINDOW_PRELOAD_WEBPACK_ENTRY,
            nodeIntegration: false,
            contextIsolation: true,
            // This renderer hosts recording/compositing work and must stay responsive while hidden.
            backgroundThrottling: false,
        },
    });

    menuWindow.loadURL(MENU_WINDOW_WEBPACK_ENTRY);
    if (!show) {
        scheduleMenuIdleRelease();
    }

    if (show && openReason) {
        notifyMenuOpened({ reason: openReason, openedAt: Date.now() });
    }

    menuWindow.once("ready-to-show", () => {
        if (menuWindow && menuWindowShouldShowOnReady) {
            menuWindow.show();
            menuWindow.focus();
        }
    });

    menuWindow.on("blur", () => {
        if (Date.now() < menuWindowBlurGuardUntil) {
            return;
        }
        hideMenuWindow();
    });

    menuWindow.on("closed", () => {
        clearMenuIdleRelease();
        if (menuTriggerRearmTimeout) {
            clearTimeout(menuTriggerRearmTimeout);
            menuTriggerRearmTimeout = null;
        }
        menuWindow = null;
    });
};

const getIntroHtml = () => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;" />
  <title>AgeofScreen</title>
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; }
    body {
      font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
      color: #f8fafc;
      background:
        radial-gradient(circle at 18% 12%, rgba(125, 211, 252, 0.28), transparent 28%),
        radial-gradient(circle at 86% 78%, rgba(34, 197, 94, 0.16), transparent 34%),
        linear-gradient(145deg, #070a12, #111827 52%, #080b12);
      overflow: hidden;
    }
    .shell {
      width: 100%;
      height: 100%;
      padding: 34px;
      display: grid;
      grid-template-columns: 1fr 1.1fr;
      gap: 28px;
      align-items: center;
    }
    .mark {
      width: 120px;
      height: 120px;
      border-radius: 36px;
      display: grid;
      place-items: center;
      background: linear-gradient(145deg, rgba(56, 189, 248, 0.15), rgba(15, 23, 42, 0.95));
      border: 1px solid rgba(125, 211, 252, 0.2);
      box-shadow: 0 32px 84px rgba(0, 0, 0, 0.4);
      margin-bottom: 28px;
      position: relative;
    }
    .focus-icon {
      width: 64px;
      height: 64px;
      position: relative;
    }
    .corner {
      position: absolute;
      width: 20px;
      height: 20px;
      border: 3.5px solid #7dd3fc;
      opacity: 0.9;
    }
    .top-left { top: 0; left: 0; border-right: none; border-bottom: none; border-top-left-radius: 8px; }
    .top-right { top: 0; right: 0; border-left: none; border-bottom: none; border-top-right-radius: 8px; }
    .bottom-left { bottom: 0; left: 0; border-right: none; border-top: none; border-bottom-left-radius: 8px; }
    .bottom-right { bottom: 0; right: 0; border-left: none; border-top: none; border-bottom-right-radius: 8px; }
    .center-dot {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 12px;
      height: 12px;
      background: #7dd3fc;
      border-radius: 50%;
      box-shadow: 0 0 24px rgba(125, 211, 252, 0.8);
    }
    h1 { margin: 0; font-size: 42px; line-height: 1.0; font-weight: 800; letter-spacing: -0.02em; color: #fff; }
    p { margin: 20px 0 0; color: rgba(226, 232, 240, 0.75); font-size: 16px; line-height: 1.6; }
    .actions { display: flex; gap: 14px; margin-top: 36px; }
    a {
      text-decoration: none;
      border-radius: 14px;
      padding: 14px 24px;
      font-size: 14px;
      font-weight: 700;
      color: #06111f;
      background: #7dd3fc;
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 20px 40px rgba(14, 165, 233, 0.25);
      transition: all 0.2s ease;
    }
    a:hover { transform: translateY(-2px); box-shadow: 0 24px 48px rgba(14, 165, 233, 0.35); filter: brightness(1.1); }
    a.secondary {
      color: #e2e8f0;
      background: rgba(255,255,255,0.06);
      box-shadow: none;
    }
    .panel {
      border-radius: 22px;
      padding: 22px;
      background: rgba(15, 23, 42, 0.58);
      border: 1px solid rgba(148, 163, 184, 0.16);
      box-shadow: 0 28px 90px rgba(2, 6, 23, 0.44);
      backdrop-filter: blur(22px);
    }
    .item { display: grid; grid-template-columns: 34px 1fr; gap: 12px; padding: 14px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.12); }
    .item:last-child { border-bottom: none; }
    .num { width: 28px; height: 28px; border-radius: 10px; display: grid; place-items: center; background: rgba(125, 211, 252, 0.12); color: #bae6fd; font-size: 12px; font-weight: 800; }
    .title { font-size: 14px; font-weight: 800; }
    .copy { margin-top: 4px; font-size: 12px; color: rgba(203, 213, 225, 0.72); line-height: 1.45; }
  </style>
</head>
<body>
  <main class="shell">
    <section>
      <div class="mark">
        <div class="focus-icon">
          <div class="corner top-left"></div>
          <div class="corner top-right"></div>
          <div class="corner bottom-left"></div>
          <div class="corner bottom-right"></div>
          <div class="center-dot"></div>
        </div>
      </div>
      <h1>AgeofScreen is ready.</h1>
      <p>Your screen capture launcher lives at the top edge. The AgeofScreen icon also stays in the Windows tray so it is always easy to reopen.</p>
      <div class="actions">
        <a href="ageofscreen-intro://launch">Launch</a>
        <a class="secondary" href="ageofscreen-intro://media">Open editor</a>
      </div>
    </section>
    <section class="panel">
      <div class="item"><div class="num">1</div><div><div class="title">Use the top trigger line</div><div class="copy">Move your mouse to the thin strip at the top of the screen to open the capture menu.</div></div></div>
      <div class="item"><div class="num">2</div><div><div class="title">Capture or record</div><div class="copy">Start a snip, screen capture, window capture, or recording from the hex launcher.</div></div></div>
      <div class="item"><div class="num">3</div><div><div class="title">Find it in the tray</div><div class="copy">Click the AgeofScreen icon in the bottom-right Windows tray to launch it again.</div></div></div>
    </section>
  </main>
</body>
</html>`;

const handleIntroAction = (rawUrl: string) => {
    if (!rawUrl.startsWith("ageofscreen-intro://")) {
        return false;
    }

    const action = rawUrl.replace("ageofscreen-intro://", "").replace(/\/$/, "");
    if (action === "launch") {
        completeOnboarding();
        introWindow?.close();
        openAgeofScreenLauncher();
        return true;
    }
    if (action === "media") {
        completeOnboarding();
        introWindow?.close();
        createTriggerWindow();
        restoreTriggerWindowIfEnabled(40);
        createVideoEditorWindow();
        return true;
    }
    if (action === "quit") {
        app.quit();
        return true;
    }
    return false;
};

const createIntroWindow = () => {
    if (introWindow && !introWindow.isDestroyed()) {
        introWindow.show();
        introWindow.focus();
        return;
    }

    introWindow = new BrowserWindow({
        width: 860,
        height: 560,
        minWidth: 760,
        minHeight: 500,
        title: "AgeofScreen",
        backgroundColor: "#070a12",
        icon: getAppWindowIcon(),
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    introWindow.removeMenu();
    introWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getIntroHtml())}`);

    introWindow.webContents.on("will-navigate", (event, url) => {
        if (handleIntroAction(url)) {
            event.preventDefault();
        }
    });
    introWindow.webContents.setWindowOpenHandler(({ url }) => {
        handleIntroAction(url);
        return { action: "deny" };
    });

    introWindow.once("ready-to-show", () => {
        introWindow?.show();
        introWindow?.focus();
    });

    introWindow.on("closed", () => {
        introWindow = null;
        restoreTriggerWindowIfEnabled(120);
    });
};

// --- Capture Window ---
const createCaptureWindow = async (type: "region" | "fullscreen" | "window" = "region") => {
    isCaptureSessionActive = true;
    menuReopenBlockedUntil = Date.now() + CAPTURE_WINDOW_SETTLE_MS + MENU_REOPEN_GUARD_MS;
    if (menuTriggerRearmTimeout) {
        clearTimeout(menuTriggerRearmTimeout);
        menuTriggerRearmTimeout = null;
    }
    hideTriggerWindow();

    if (captureWindow && !captureWindow.isDestroyed()) {
        const previousCaptureWindow = captureWindow;
        captureWindow = null;
        previousCaptureWindow.close();
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    const scaleFactor = primaryDisplay.scaleFactor;
    const hiddenEditorWindow = hideWindowForCapture(editorWindow);
    const hiddenAnyWindow = [
        hiddenEditorWindow,
        hideWindowForCapture(menuWindow),
        hideWindowForCapture(triggerWindow),
    ].some(Boolean);

    shouldRestoreEditorAfterCaptureCancel = hiddenEditorWindow;

    if (hiddenAnyWindow) {
        await wait(CAPTURE_WINDOW_SETTLE_MS);
    }

    // Take screenshot first - Request exact physical pixels to match cropping logic
    const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
            width: width * scaleFactor,
            height: height * scaleFactor
        },
    });

    const primarySource = sources.find((s) => s.id.startsWith("screen:")) || sources[0];
    if (primarySource) {
        tempScreenshotDataUrl = primarySource.thumbnail.toDataURL();
    }

    if (type === "fullscreen" && tempScreenshotDataUrl) {
        console.log("[ageofscreen] Fullscreen capture triggered");
        shouldRestoreEditorAfterCaptureCancel = false;
        isCaptureSessionActive = false;
        createEditorWindow(tempScreenshotDataUrl);
        return;
    }

    if (type === "region" && tempScreenshotDataUrl && (!editorWindow || editorWindow.isDestroyed())) {
        createEditorWindow(undefined, { showWhenReady: false });
    }

    const createdCaptureWindow = new BrowserWindow({
        x: primaryDisplay.bounds.x,
        y: primaryDisplay.bounds.y,
        width,
        height,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        alwaysOnTop: true,
        skipTaskbar: true,
        autoHideMenuBar: true,
        show: false,
        paintWhenInitiallyHidden: false,
        webPreferences: {
            preload: CAPTURE_WINDOW_PRELOAD_WEBPACK_ENTRY,
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
        },
    });
    captureWindow = createdCaptureWindow;

    createdCaptureWindow.loadURL(CAPTURE_WINDOW_WEBPACK_ENTRY);

    createdCaptureWindow.webContents.once("did-finish-load", () => {
        if (captureWindow === createdCaptureWindow && tempScreenshotDataUrl) {
            createdCaptureWindow.show();
            createdCaptureWindow.focus();
            createdCaptureWindow.webContents.send("capture-mode", type === "window" ? "window" : "region");
            createdCaptureWindow.webContents.send("screenshot-data", tempScreenshotDataUrl);
        }
    });

    createdCaptureWindow.on("closed", () => {
        if (captureWindow === createdCaptureWindow) {
            captureWindow = null;
            tempScreenshotDataUrl = null;
        }
    });
};

// --- Focus Window (Timer Widget) ---
const createFocusWindow = (payload: any) => {
    if (!FEATURES.ENABLE_FOCUS_WIDGET) {
        console.log("[ageofscreen] Focus widget disabled by feature flag");
        return;
    }

    if (focusWindow && !focusWindow.isDestroyed()) {
        focusWindow.webContents.send("focus-widget-data", payload);
        focusWindow.focus();
        return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: _screenHeight } = primaryDisplay.workAreaSize;

    focusWindow = new BrowserWindow({
        width: 240,
        height: 120,
        x: screenWidth - 260,
        y: 40,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        webPreferences: {
            preload: FOCUS_WIDGET_WINDOW_PRELOAD_WEBPACK_ENTRY,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    focusWindow.loadURL(FOCUS_WIDGET_WINDOW_WEBPACK_ENTRY);

    focusWindow.webContents.once("did-finish-load", () => {
        if (focusWindow) {
            focusWindow.webContents.send("focus-widget-data", payload);
        }
    });

    focusWindow.on("closed", () => {
        focusWindow = null;
    });
};

const createRecordingWidget = () => {
    if (recordingWidget && !recordingWidget.isDestroyed()) {
        recordingWidget.show();
        return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    recordingWidget = new BrowserWindow({
        width: RECORDING_WIDGET_WIDTH,
        height: RECORDING_WIDGET_HEIGHT,
        x: width - RECORDING_WIDGET_WIDTH - RECORDING_WIDGET_MARGIN,
        y: height - RECORDING_WIDGET_HEIGHT - RECORDING_WIDGET_MARGIN,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        show: false,
        title: "Recording Widget",
        webPreferences: {
            preload: RECORDING_WIDGET_WINDOW_PRELOAD_WEBPACK_ENTRY,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    recordingWidget.loadURL(RECORDING_WIDGET_WINDOW_WEBPACK_ENTRY);
    recordingWidget.setAlwaysOnTop(true, 'screen-saver');

    recordingWidget.once("ready-to-show", () => {
        // We no longer show automatically on ready - we wait for hover or recording start logic
        if (recordingWidget && !recordingWidget.isDestroyed()) {
            recordingWidget.webContents.send('recording-settings', {
                recordingMode: smartFeaturesConfig.recordingMode,
                windowBackground: smartFeaturesConfig.windowBackground
            });
        }
    });

    recordingWidget.on("closed", () => {
        recordingWidget = null;
    });
};

// Recording state
let isRecordingActive = false;

const isDrawingOverlayActive = () => !!(drawingOverlayWindow && !drawingOverlayWindow.isDestroyed());

// Helper to stop recording from ESC or widget
const triggerStopRecording = () => {
    console.log('[ageofscreen] Triggering stop recording');
    isRecordingActive = false;
    clearPendingStopRecordingDispatches();

    // Unregister ESC and zoom shortcuts
    try {
        if (globalShortcut.isRegistered('Escape')) globalShortcut.unregister('Escape');
        if (globalShortcut.isRegistered('F9')) globalShortcut.unregister('F9');
        if (globalShortcut.isRegistered('F10')) globalShortcut.unregister('F10');
        if (globalShortcut.isRegistered('Ctrl+Shift+Z')) globalShortcut.unregister('Ctrl+Shift+Z');
        if (globalShortcut.isRegistered('Ctrl+Shift+X')) globalShortcut.unregister('Ctrl+Shift+X');
    } catch (err) {
        console.warn('[ageofscreen] Failed to unregister shortcuts', err);
    }

    // Hide/close widgets first so they are not captured in the final frames
    if (webcamWindow && !webcamWindow.isDestroyed()) {
        webcamWindow.webContents.send('stop-stream');
        webcamWindow.hide();
    }
    if (teleprompterWindow && !teleprompterWindow.isDestroyed()) teleprompterWindow.hide();
    if (drawingOverlayWindow && !drawingOverlayWindow.isDestroyed()) drawingOverlayWindow.hide();

    // Close drawing overlay immediately
    closeDrawingOverlayWindow();

    // Hide recording widget
    hideRecordingWidget();

    // Retry the stop request a few times so the first post-restart session can't miss it
    // while renderer listeners and compositor teardown are still settling.
    for (const delayMs of STOP_RECORDING_RETRY_DELAYS_MS) {
        const timeout = setTimeout(() => {
            dispatchStopRecordingRequest();

            if (delayMs === STOP_RECORDING_RETRY_DELAYS_MS[STOP_RECORDING_RETRY_DELAYS_MS.length - 1]) {
                clearPendingStopRecordingDispatches();
            }
        }, delayMs);
        pendingStopRecordingDispatchTimeouts.push(timeout);
    }

    // Close remaining windows after the first stop request has been delivered.
    const cleanupTimeout = setTimeout(() => {
        if (webcamWindow && !webcamWindow.isDestroyed()) {
            webcamWindow.close();
            webcamWindow = null;
        }
        closeTeleprompterWindow();
    }, STOP_RECORDING_RETRY_DELAYS_MS[0] + 150);
    pendingStopRecordingDispatchTimeouts.push(cleanupTimeout);
};

ipcMain.handle("get-window-bounds", (event, windowId: string) => {
    return getExternalWindowBounds(windowId);
});

// Smart features config (set by recording setup)
const smartFeaturesConfig = {
    liveMagnifierEnabled: false,
    captureCursorData: false,
    micEnabled: false,
    recordingMode: 'fullscreen' as 'fullscreen' | 'window',
    windowBackground: '#F1F5F9'
};

const showRecordingWidget = (config?: {
    liveMagnifierEnabled?: boolean;
    captureCursorData?: boolean;
    micEnabled?: boolean;
    recordingMode?: 'fullscreen' | 'window';
    windowBackground?: string;
    bounds?: { x: number; y: number; width: number; height: number };
}) => {
    // Update smart features config if provided
    if (config) {
        smartFeaturesConfig.liveMagnifierEnabled = config.liveMagnifierEnabled ?? false;
        smartFeaturesConfig.captureCursorData = config.captureCursorData ?? false;
        smartFeaturesConfig.micEnabled = config.micEnabled ?? false;
        if (config.recordingMode) (smartFeaturesConfig as any).recordingMode = config.recordingMode;
        if (config.windowBackground) (smartFeaturesConfig as any).windowBackground = config.windowBackground;
        if (config.bounds) (smartFeaturesConfig as any).bounds = config.bounds;

        // Notify webcam window if it's active
        if (webcamWindow && !webcamWindow.isDestroyed()) {
            webcamWindow.webContents.send("update-mic-status", smartFeaturesConfig.micEnabled);
        }
    }

    isRecordingActive = true;
    broadcastWebcamUpdate();

    // Register Escape to stop (but not if drawing overlay is active)
    try {
        if (globalShortcut.isRegistered('Escape')) globalShortcut.unregister('Escape');
        globalShortcut.register('Escape', () => {
            // If drawing overlay is active, close it instead of stopping recording
            if (drawingOverlayWindow && !drawingOverlayWindow.isDestroyed()) {
                console.log('[ageofscreen] ESC pressed - closing drawing overlay');
                restoreAfterDrawingOverlay();
                return;
            }

            console.log('[ageofscreen] ESC pressed - stopping');
            triggerStopRecording();
        });
    } catch (e) {
        console.error('Failed to register Escape', e);
    }

    const shouldTrackMouseDuringRecording = smartFeaturesConfig.captureCursorData
        || FEATURES.ENABLE_AUTO_ZOOM_ADVANCED
        || (FEATURES.ENABLE_LIVE_MAGNIFIER && smartFeaturesConfig.liveMagnifierEnabled);

    if (shouldTrackMouseDuringRecording) {
        startMouseTracking((smartFeaturesConfig as any).bounds);
    }

    // Show Widget OR Use Webcam Controls
    // Always show the recording widget if we are in "Separated Controls" mode
    if (!recordingWidget || recordingWidget.isDestroyed()) {
        createRecordingWidget();
    }

    // Ensure it's prepared and listening
    if (recordingWidget && !recordingWidget.isDestroyed()) {
        recordingWidget.setAlwaysOnTop(true, 'screen-saver', 1);
    }

    // Notify webcam if active
    if (webcamWindow && !webcamWindow.isDestroyed()) {
        webcamWindow.webContents.send('recording-status', true);
    }

    // Notify widget of recording status (it stays hidden until hover)
    if (recordingWidget && !recordingWidget.isDestroyed()) {
        recordingWidget.webContents.send('recording-status', true);
    }

    // Register Alt+1 for SCREEN ZOOM (only if Live Magnifier is enabled and feature flag allows)
    if (FEATURES.ENABLE_LIVE_MAGNIFIER && smartFeaturesConfig.liveMagnifierEnabled) {
        try {
            globalShortcut.unregister('Alt+1');
            const registered1 = globalShortcut.register('Alt+1', async () => {
                console.log('[ageofscreen] Alt+1 pressed - toggle screen zoom');
                zoomToMouseActive = !zoomToMouseActive;

                if (zoomToMouseActive) {
                    // Create zoom overlay window
                    const _cursorPoint = screen.getCursorScreenPoint();
                    const primaryDisplay = screen.getPrimaryDisplay();
                    const { width, height } = primaryDisplay.size;

                    const projectRoot = process.cwd();
                    const zoomOverlayPreload = path.join(projectRoot, 'src', 'recording', 'zoomOverlayPreload.js');

                    // Create fullscreen transparent overlay for zoom effect
                    const zoomWindow = new BrowserWindow({
                        x: 0,
                        y: 0,
                        width: width,
                        height: height,
                        frame: false,
                        transparent: true,
                        alwaysOnTop: true,
                        skipTaskbar: true,
                        focusable: false,
                        webPreferences: {
                            preload: zoomOverlayPreload,
                            nodeIntegration: false,
                            contextIsolation: true,
                        }
                    });

                    (global as any).zoomOverlayWindow = zoomWindow;

                    try {
                        const sources = await desktopCapturer.getSources({ types: ['screen'] });
                        const source = sources[0];

                        if (source) {
                            const projectRoot = process.cwd();
                            const htmlPath = path.join(projectRoot, 'src', 'recording', 'zoomOverlay.html');
                            const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
                            zoomWindow.loadURL(`${fileUrl}?sourceId=${source.id}`);
                            zoomWindow.setIgnoreMouseEvents(true);
                            console.log('[ageofscreen] Zoom overlay created.');
                        }
                    } catch (e) {
                        console.error('Failed to init zoom source', e);
                    }
                } else {
                    const zoomWindow = (global as any).zoomOverlayWindow;
                    if (zoomWindow && !zoomWindow.isDestroyed()) {
                        zoomWindow.close();
                    }
                    (global as any).zoomOverlayWindow = null;
                    console.log('[ageofscreen] Zoom overlay closed');
                }
            });
            console.log(`[ageofscreen] Alt+1 (Live Magnifier) registered: ${registered1 ? 'YES' : 'FAILED'}`);
        } catch (err) {
            console.log('[ageofscreen] Error registering Alt+1', err);
        }
    } else {
        console.log('[ageofscreen] Live Magnifier DISABLED - Alt+1 not registered');
    }

    // Keep webcam controls on Alt+2 during recording.
    try {
        globalShortcut.unregister('Alt+2');
        const registered2 = globalShortcut.register('Alt+2', () => {
            console.log('[ageofscreen] Alt+2 pressed - toggle webcam');
            if (webcamWindow && !webcamWindow.isDestroyed()) {
                if (!webcamWindow.isVisible()) {
                    webcamWindow.show();
                    console.log('[ageofscreen] Webcam shown');
                } else {
                    toggleWebcamSize();
                }
            }
        });
        console.log(`[ageofscreen] Alt+2 (Webcam) registered: ${registered2 ? 'YES' : 'FAILED'}`);
    } catch (err) {
        console.log('[ageofscreen] Error registering Alt+2', err);
    }

    // Register Alt+3 for auto-zoom toggle (only if feature flag allows)
    if (FEATURES.ENABLE_AUTO_ZOOM_ADVANCED) {
        try {
            globalShortcut.unregister('Alt+3');
            const registered3 = globalShortcut.register('Alt+3', () => {
                isAutoZoomEnabled = !isAutoZoomEnabled;
                console.log(`[ageofscreen] Alt+3 pressed - Auto-zoom ${isAutoZoomEnabled ? 'ON' : 'OFF'}`);

                if (recordingWidget && !recordingWidget.isDestroyed()) {
                    recordingWidget.webContents.send('auto-zoom-status', isAutoZoomEnabled);
                }
            });
            console.log(`[ageofscreen] Alt+3 (Auto-zoom) registered: ${registered3 ? 'YES' : 'FAILED'}`);
        } catch (err) {
            console.log('[ageofscreen] Error registering Alt+3', err);
        }
    } else {
        console.log('[ageofscreen] Auto-zoom ADVANCED disabled - Alt+3 not registered');
    }

    // Register Ctrl+Shift+Z = zoom in, Ctrl+Shift+X = zoom out during recording
    try {
        globalShortcut.unregister('Ctrl+Shift+Z');
        globalShortcut.unregister('Ctrl+Shift+X');
        zoomMarkerActive = false;
        globalShortcut.register('Ctrl+Shift+Z', () => {
            if (!isRecordingActive || zoomMarkerActive) return;
            zoomMarkerActive = true;
            const cursorPos = screen.getCursorScreenPoint();
            recordZoomToggle(cursorPos.x, cursorPos.y, true);
            recordingWidget?.webContents.send('zoom-marked', { x: cursorPos.x, y: cursorPos.y, zoomIn: true });
            console.log(`[ageofscreen] Ctrl+Shift+Z - Zoom IN at (${cursorPos.x}, ${cursorPos.y})`);
        });
        globalShortcut.register('Ctrl+Shift+X', () => {
            if (!isRecordingActive || !zoomMarkerActive) return;
            zoomMarkerActive = false;
            const cursorPos = screen.getCursorScreenPoint();
            recordZoomToggle(cursorPos.x, cursorPos.y, false);
            recordingWidget?.webContents.send('zoom-marked', { x: cursorPos.x, y: cursorPos.y, zoomIn: false });
            console.log(`[ageofscreen] Ctrl+Shift+X - Zoom OUT at (${cursorPos.x}, ${cursorPos.y})`);
        });
        console.log('[ageofscreen] Ctrl+Shift+Z (Zoom in) / Ctrl+Shift+X (Zoom out) registered');
    } catch (err) {
        console.log('[ageofscreen] Error registering zoom shortcuts', err);
    }
};

// Toggle webcam window size between big and small
const toggleWebcamSize = () => {
    if (!webcamWindow || webcamWindow.isDestroyed()) return;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const margin = 20;

    isWebcamSmall = !isWebcamSmall;

    // Use the user's configured size as base
    const baseSize = 140;
    const scaleFactor = currentCameraSize / 100;
    const normalSize = Math.round(baseSize * scaleFactor);

    if (isWebcamSmall) {
        // Small size: half of normal
        const smallSize = Math.max(80, Math.round(normalSize * 0.6));
        webcamWindow.setBounds({
            width: smallSize + 40,
            height: smallSize + 40,
            x: width - smallSize - 40 - margin,
            y: height - smallSize - 40 - margin
        }, true);
        console.log(`[ageofscreen] Webcam: SMALL (${smallSize}px)`);
    } else {
        // Big size: double or normal
        const bigSize = Math.max(200, normalSize * 1.5);
        webcamWindow.setBounds({
            width: bigSize + 40,
            height: bigSize + 40,
            x: width - bigSize - 40 - margin,
            y: height - bigSize - 40 - margin
        }, true);
        console.log(`[ageofscreen] Webcam: BIG (${bigSize}px)`);
    }

    // Notify webcam window about size change
    webcamWindow.webContents.send('size-changed', isWebcamSmall);
};

const hideRecordingWidget = () => {
    if (recordingWidget && !recordingWidget.isDestroyed()) {
        recordingWidget.close();
        recordingWidget = null;
    }

    // Notify webcam (stop timer)
    if (webcamWindow && !webcamWindow.isDestroyed()) {
        webcamWindow.webContents.send('recording-status', false);
    }

    isRecordingActive = false;

    // Unregister recording hotkeys (only if registered)
    try {
        ['Escape', 'Alt+1', 'Alt+2', 'Alt+3', 'Alt+Shift+2'].forEach((acc) => {
            if (globalShortcut.isRegistered(acc)) globalShortcut.unregister(acc);
        });
    } catch (_err) {
        // ignore
    }

    // Close zoom overlay if open
    const zoomWindow = (global as any).zoomOverlayWindow;
    if (zoomWindow && !zoomWindow.isDestroyed()) {
        zoomWindow.close();
    }
    (global as any).zoomOverlayWindow = null;

    // Reset zoom state
    zoomToMouseActive = false;

    // Stop mouse tracking
    if (mouseTrackInterval) {
        clearInterval(mouseTrackInterval);
        mouseTrackInterval = null;
    }

    finalizeRecordedCursorData();
    setClickListener(null);
};

// Mouse tracking logic for Auto-Zoom
let recordedCursorData: any[] = []; // Changed type so metadata can hold click events too
let isRecordingMetadataActive = false;

import { startMetadataRecording, stopMetadataRecording, recordZoomToggle, setClickListener, setRecordingCaptureMetadata } from './services/metadataRecorder';
let zoomMarkerActive = false;

const finalizeRecordedCursorData = () => {
    if (!isRecordingMetadataActive) {
        return recordedCursorData;
    }

    recordedCursorData = stopMetadataRecording();
    isRecordingMetadataActive = false;
    return recordedCursorData;
};

const startMouseTracking = (bounds?: { x: number; y: number; width: number; height: number }) => {
    if (mouseTrackInterval) clearInterval(mouseTrackInterval);
    finalizeRecordedCursorData();

    // Reset data
    recordedCursorData = [];
    isRecordingMetadataActive = false;

    if (smartFeaturesConfig.captureCursorData) {
        startMetadataRecording(bounds);
        isRecordingMetadataActive = true;
        setRecordingCaptureMetadata({
            capturePlatform: process.platform,
        });
    }

    let lastScanTime = 0;
    const SCAN_INTERVAL = 10000; // Scan every 10 seconds for better performance

    mouseTrackInterval = setInterval(async () => {
        if (!isRecordingActive) return;

        const cursorPoint = screen.getCursorScreenPoint();

        // Send mouse update to zoom overlay if active
        const zoomWin = (global as any).zoomOverlayWindow;
        if (zoomWin && !zoomWin.isDestroyed()) {
            const primaryDisplay = screen.getPrimaryDisplay();
            const { width, height } = primaryDisplay.size;
            zoomWin.webContents.send('mouse-update', {
                x: cursorPoint.x,
                y: cursorPoint.y,
                screenW: width,
                screenH: height
            });
        }

        // Throttled UI updates & logic (only when mouse moved)
        if (Math.abs(cursorPoint.x - lastMousePos.x) > 2 || Math.abs(cursorPoint.y - lastMousePos.y) > 2) {
            lastMousePos = cursorPoint;

            // Notify windows of mouse move (limited frequency)
            if (menuWindow && !menuWindow.isDestroyed() && menuWindow.isVisible()) {
                menuWindow.webContents.send('mouse-moved', cursorPoint);
            }

            // Only proceed with heavy auto-zoom/webcam logic if enabled.
            if (isAutoZoomEnabled) {
                // Auto-move webcam if cursor is near it
                if (webcamWindow && !webcamWindow.isDestroyed()) {
                    const bounds = webcamWindow.getBounds();
                    const margin = 100; // Activation distance
                    if (
                        cursorPoint.x > bounds.x - margin &&
                        cursorPoint.x < bounds.x + bounds.width + margin &&
                        cursorPoint.y > bounds.y - margin &&
                        cursorPoint.y < bounds.y + bounds.height + margin
                    ) {
                        const workArea = screen.getPrimaryDisplay().workAreaSize;
                        const camWidth = bounds.width;
                        const marginEdge = 24;

                        const isAtRight = bounds.x > workArea.width / 2;
                        const newX = isAtRight ? marginEdge : workArea.width - camWidth - marginEdge;

                        webcamWindow.setPosition(Math.round(newX), bounds.y, true);
                    }
                }
            }
        }

        // Periodic OCR scan for focus targets - Only if Smart Targeting is explicitly enabled to save massive performance
        const now = Date.now();
        if (isAutoZoomEnabled && (now - lastScanTime > SCAN_INTERVAL)) {
            lastScanTime = now;
            try {
                const fl = await getFocusLogic();
                if (!fl) return;

                const primaryDisplay = screen.getPrimaryDisplay();
                const sources = await desktopCapturer.getSources({
                    types: ["screen"],
                    thumbnailSize: primaryDisplay.size
                });

                if (!isRecordingActive) return; // Guard against race condition

                const primarySource = sources.find(s => s.id.startsWith("screen:"));
                if (primarySource) {
                    const imgBuffer = primarySource.thumbnail.toPNG();
                    const targets = await fl.detectTargets(imgBuffer);

                    // Filter targets near the cursor
                    const nearTarget = targets.find((t: { x: number; y: number; width: number; height: number; text: string }) =>
                        cursorPoint.x >= t.x && cursorPoint.x <= t.x + t.width &&
                        cursorPoint.y >= t.y && cursorPoint.y <= t.y + t.height
                    );

                    if (nearTarget && isRecordingActive) {
                        if (menuWindow && !menuWindow.isDestroyed()) {
                            menuWindow.webContents.send('focus-target-detected', nearTarget);
                        }
                    }
                }
            } catch (_err) {
                // Silently handle - avoid flooding logs during recording
                console.debug('[ageofscreen] Background OCR skipped/failed');
            }
        }
    }, 100); // 10fps tracking - much better for overall system performance
};

// --- Teleprompter Window ---
const createTeleprompterWindow = (text?: string, speed?: number) => {
    if (teleprompterWindow && !teleprompterWindow.isDestroyed()) {
        teleprompterWindow.show();
        return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.workAreaSize;

    // Store settings
    if (text !== undefined) teleprompterText = text;
    if (speed !== undefined) teleprompterSpeed = speed;

    teleprompterWindow = new BrowserWindow({
        width: width,
        height: 28,
        x: 0,
        y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        title: "Teleprompter",
        focusable: true,
        webPreferences: {
            preload: TELEPROMPTER_WINDOW_PRELOAD_WEBPACK_ENTRY,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    teleprompterWindow.setContentProtection(true);


    // Pass text and speed via URL params
    const params = new URLSearchParams({
        text: teleprompterText,
        speed: teleprompterSpeed.toString(),
    });
    teleprompterWindow.loadURL(`${TELEPROMPTER_WINDOW_WEBPACK_ENTRY}?${params.toString()}`);

    teleprompterWindow.once('ready-to-show', () => {
        teleprompterWindow?.show();
    });

    teleprompterWindow.on('closed', () => {
        teleprompterWindow = null;
    });
};

const closeTeleprompterWindow = () => {
    if (teleprompterWindow && !teleprompterWindow.isDestroyed()) {
        teleprompterWindow.close();
    }
    teleprompterWindow = null;
};

// --- Drawing Overlay Window ---
const raiseWebcamAboveDrawingOverlay = () => {
    if (!webcamWindow || webcamWindow.isDestroyed() || !wasWebcamVisibleBeforeDrawing) {
        return;
    }

    webcamWindow.showInactive();
    webcamWindow.setAlwaysOnTop(true, 'screen-saver', 2);
    webcamWindow.moveTop();
};

const createDrawingOverlayWindow = () => {
    if (drawingOverlayWindow && !drawingOverlayWindow.isDestroyed()) {
        drawingOverlayWindow.show();
        drawingOverlayWindow.focus();
        setTimeout(raiseWebcamAboveDrawingOverlay, 0);
        return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    drawingOverlayWindow = new BrowserWindow({
        width: width,
        height: height,
        x: 0,
        y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        hasShadow: false,
        webPreferences: {
            preload: DRAWING_OVERLAY_WINDOW_PRELOAD_WEBPACK_ENTRY,
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
        },
    });

    // Set to highest z-level
    drawingOverlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    drawingOverlayWindow.setIgnoreMouseEvents(false);


    drawingOverlayWindow.loadURL(DRAWING_OVERLAY_WINDOW_WEBPACK_ENTRY);

    drawingOverlayWindow.once('ready-to-show', () => {
        drawingOverlayWindow?.show();
        drawingOverlayWindow?.focus();
        setTimeout(raiseWebcamAboveDrawingOverlay, 0);
    });

    drawingOverlayWindow.on('closed', () => {
        drawingOverlayWindow = null;
    });
};

const closeDrawingOverlayWindow = () => {
    if (drawingOverlayWindow && !drawingOverlayWindow.isDestroyed()) {
        drawingOverlayWindow.close();
    }
    drawingOverlayWindow = null;
};

const restoreAfterDrawingOverlay = () => {
    closeDrawingOverlayWindow();

    if (webcamWindow && !webcamWindow.isDestroyed()) {
        if (wasWebcamVisibleBeforeDrawing) {
            webcamWindow.show();
        } else {
            webcamWindow.hide();
        }
        webcamWindow.setAlwaysOnTop(true, 'screen-saver');
    }

    if (recordingWidget && !recordingWidget.isDestroyed()) {
        recordingWidget.setAlwaysOnTop(true, 'screen-saver', 1);
        recordingWidget.webContents.send('drawing-toggled', false);
        recordingWidget.hide();
    }
};

const showRecordingWidgetForDrawing = () => {
    if (!recordingWidget || recordingWidget.isDestroyed()) {
        createRecordingWidget();
    }

    if (!recordingWidget || recordingWidget.isDestroyed()) {
        return;
    }

    if (webcamWindow && !webcamWindow.isDestroyed()) {
        const camBounds = webcamWindow.getBounds();
        const widgetBounds = recordingWidget.getBounds();
        const primaryDisplay = screen.getDisplayMatching(camBounds);
        const workArea = primaryDisplay.workArea;
        const x = Math.round(camBounds.x + (camBounds.width / 2) - (widgetBounds.width / 2));
        const y = Math.round(camBounds.y + camBounds.height);
        recordingWidget.setPosition(
            Math.max(workArea.x, Math.min(workArea.x + workArea.width - widgetBounds.width, x)),
            Math.max(workArea.y, Math.min(workArea.y + workArea.height - widgetBounds.height, y)),
        );
    }
    recordingWidget.setAlwaysOnTop(true, 'screen-saver', 2);
    recordingWidget.showInactive();
    recordingWidget.webContents.send('drawing-toggled', true);
};

const sendPendingMediaToVideoEditor = (reason: string) => {
    if (!videoEditorWindow || videoEditorWindow.isDestroyed() || !pendingVideoDataUrl || pendingVideoDeliveryInFlight) {
        return;
    }

    console.log(`[ageofscreen] Sending pending media to video editor (${reason})`, {
        mediaName: pendingMediaName,
        cursorPoints: recordedCursorData.length,
        mediaUrl: pendingVideoDataUrl,
    });

    videoEditorWindow.webContents.send(
        "load-video",
        pendingVideoDataUrl,
        pendingMediaName ?? undefined,
        undefined,
        undefined,
        recordedCursorData,
        undefined,
    );
    pendingVideoDeliveryInFlight = true;
};

const getPendingVideoEditorMedia = () => {
    if (!pendingVideoDataUrl) {
        return null;
    }

    return {
        videoDataUrl: pendingVideoDataUrl,
        name: pendingMediaName ?? undefined,
        cursorData: recordedCursorData,
    };
};

// --- Video Editor Window (Trim/Crop) ---
const createVideoEditorWindow = (videoDataUrl?: string, name?: string) => {
    try {
        console.log("[ageofscreen] createVideoEditorWindow called with:", videoDataUrl ? "data..." : "no data");
        console.log("[ageofscreen] Entry Points:", {
            entry: VIDEO_EDITOR_WINDOW_WEBPACK_ENTRY,
            preload: VIDEO_EDITOR_WINDOW_PRELOAD_WEBPACK_ENTRY
        });

        // Store the video data for when the window is ready
        if (videoDataUrl !== undefined) {
            approveMediaPath(videoDataUrl);
            pendingVideoDataUrl = videoDataUrl;
            pendingVideoDeliveryInFlight = false;
        }
        if (name !== undefined) {
            pendingMediaName = name;
        }

        if (videoEditorWindow && !videoEditorWindow.isDestroyed()) {
            console.log("[ageofscreen] Video editor exists, showing/restoring...");
            if (videoEditorWindow.isMinimized()) videoEditorWindow.restore();
            videoEditorWindow.show();
            videoEditorWindow.focus();

            if (videoDataUrl) {
                sendPendingMediaToVideoEditor("existing-window");
            }
            if (pendingAgentSummary) {
                videoEditorWindow.webContents.send("apply-agent-summary", pendingAgentSummary);
                pendingAgentSummary = null;
            }
            return;
        }

        console.log("[ageofscreen] Creating new video editor window...");
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;

        videoEditorWindow = new BrowserWindow({
            width: Math.min(1200, width - 100),
            height: Math.min(800, height - 100),
            x: Math.round((width - Math.min(1200, width - 100)) / 2),
            y: Math.round((height - Math.min(800, height - 100)) / 2),
            frame: false,
            backgroundColor: "#0a0a0f",
            icon: getAppWindowIcon(),
            show: true, // Show immediately
            webPreferences: {
                preload: VIDEO_EDITOR_WINDOW_PRELOAD_WEBPACK_ENTRY,
                nodeIntegration: false,
                contextIsolation: true,
            },
        });

        videoEditorWindow.show(); // Second show call to be absolutely sure
        videoEditorWindow.focus();

        const editorUrl = videoDataUrl ? VIDEO_EDITOR_WINDOW_WEBPACK_ENTRY : `${VIDEO_EDITOR_WINDOW_WEBPACK_ENTRY}?mode=library`;
        console.log("[ageofscreen] Loading video editor URL:", editorUrl);
        videoEditorWindow.loadURL(editorUrl);
        videoEditorWindow.webContents.once("did-finish-load", () => {
            console.log("[ageofscreen] Video editor did-finish-load");
        });

        videoEditorWindow.on("closed", () => {
            videoEditorWindow = null;
            pendingVideoDataUrl = null;
            pendingVideoDeliveryInFlight = false;
            pendingAgentSummary = null;
        });

        // Handle loading errors
        videoEditorWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error("[ageofscreen] Video editor failed to load:", errorCode, errorDescription);
        });

    } catch (err) {
        console.error("[ageofscreen] Error in createVideoEditorWindow:", err);
    }
};

const closeVideoEditorWindow = () => {
    if (videoEditorWindow && !videoEditorWindow.isDestroyed()) {
        videoEditorWindow.close();
    }
    videoEditorWindow = null;
    pendingVideoDataUrl = null;
    pendingVideoDeliveryInFlight = false;
    pendingAgentSummary = null;
};

// --- Webcam Window ---
let currentCameraShape: CameraShape = 'circle';
let currentCameraSize = 100; // Default 100%
let currentPresenterName: string | undefined = undefined;
let currentCameraBorderColor = '#22c55e'; // Default green
let currentCameraBorderWidth = 4;
let currentCameraGlowEnabled = false;
let currentCameraAudioMeterEnabled = false;

function broadcastWebcamUpdate() {
    const data = {
        visible: webcamWindow && !webcamWindow.isDestroyed() ? webcamWindow.isVisible() : false,
        bounds: webcamWindow && !webcamWindow.isDestroyed() ? webcamWindow.getBounds() : { x: 0, y: 0, width: 0, height: 0 },
        shape: currentCameraShape,
        scaleFactor: webcamWindow && !webcamWindow.isDestroyed() ? screen.getDisplayMatching(webcamWindow.getBounds()).scaleFactor : 1,
        name: currentPresenterName,
        borderColor: currentCameraBorderColor,
        borderWidth: currentCameraBorderWidth,
        glowEnabled: currentCameraGlowEnabled,
        audioMeterEnabled: currentCameraAudioMeterEnabled,
        micEnabled: smartFeaturesConfig.micEnabled
    };

    // Broadcast to ALL windows to ensure recording compositor gets updates
    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
            win.webContents.send('webcam-update', data);
        }
    });
}

const createWebcamWindow = (shape?: CameraShape, size?: number, name?: string, borderColor?: string, borderWidth?: number, glowEnabled?: boolean, audioMeterEnabled?: boolean) => {
    if (shape) currentCameraShape = normalizeCameraShape(shape);
    if (size !== undefined) currentCameraSize = size;
    if (name !== undefined) currentPresenterName = name;
    if (borderColor !== undefined) currentCameraBorderColor = borderColor;
    if (borderWidth !== undefined) currentCameraBorderWidth = borderWidth;
    if (glowEnabled !== undefined) currentCameraGlowEnabled = glowEnabled;
    if (audioMeterEnabled !== undefined) currentCameraAudioMeterEnabled = audioMeterEnabled;

    if (webcamWindow && !webcamWindow.isDestroyed()) {
        webcamWindow.webContents.send("update-shape", currentCameraShape);
        webcamWindow.webContents.send("update-border-color", currentCameraBorderColor);
        webcamWindow.webContents.send("update-border-width", currentCameraBorderWidth);
        webcamWindow.webContents.send("update-glow-enabled", currentCameraGlowEnabled);
        webcamWindow.webContents.send("update-audio-meter-visibility", currentCameraAudioMeterEnabled);
        if (name !== undefined) {
            webcamWindow.webContents.send("update-presenter-name", currentPresenterName);
        }

        // If recording, we only toggle visibility or update properties
        if (isRecordingActive) {
            // Update shape constraint on the existing window if size/shape changed
            const baseSize = 140;
            const sf = currentCameraSize / 100;
            const camSize = Math.round(baseSize * sf);
            const cameraBounds = getCameraDimensionsForWidth(currentCameraShape, camSize);

            // Update window size to match new shape while keeping it on screen
            const currentBounds = webcamWindow.getBounds();
            webcamWindow.setBounds({
                x: currentBounds.x,
                y: currentBounds.y,
                width: cameraBounds.width,
                height: cameraBounds.height
            }, true);

            broadcastWebcamUpdate();
            return;
        }

        // If not recording, re-create or re-init (original behavior)
        webcamWindow.close();
        webcamWindow = null;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Calculate size based on percentage (60-140 maps to window size)
    // Base size is 140px at 100%, scaled proportionally
    const baseSize = 140;
    const scaleFactor = currentCameraSize / 100;
    const camSize = Math.round(baseSize * scaleFactor);
    const margin = 20;
    const cameraBounds = getCameraDimensionsForWidth(currentCameraShape, camSize);

    webcamWindow = new BrowserWindow({
        width: cameraBounds.width,
        height: cameraBounds.height,
        useContentSize: true,
        x: width - cameraBounds.width - margin,
        y: height - cameraBounds.height - margin,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false, // Disable native resize to rely on custom handle
        movable: true,
        hasShadow: false,
        thickFrame: false,
        minWidth: 80,
        minHeight: getCameraDimensionsForWidth(currentCameraShape, 80).height,
        webPreferences: {
            preload: WEBCAM_WINDOW_PRELOAD_WEBPACK_ENTRY,
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
        },
        title: "Webcam",
    });

    // Load webcam with shape, size, border color, and optional name
    const borderParam = encodeURIComponent(currentCameraBorderColor);
    const url = `${WEBCAM_WINDOW_WEBPACK_ENTRY}?shape=${currentCameraShape}&size=${currentCameraSize}&borderColor=${borderParam}${currentPresenterName ? '&name=' + encodeURIComponent(currentPresenterName) : ''}&micEnabled=${smartFeaturesConfig.micEnabled}&borderWidth=${currentCameraBorderWidth}&glowEnabled=${currentCameraGlowEnabled}&audioMeterEnabled=${currentCameraAudioMeterEnabled}`;
    webcamWindow.loadURL(url);

    webcamWindow.webContents.once("did-finish-load", () => {
        if (webcamWindow && !webcamWindow.isDestroyed()) {
            webcamWindow.webContents.send("window-visibility", webcamWindow.isVisible());
        }
    });

    webcamWindow.on("closed", () => {
        webcamWindow = null;
    });

    webcamWindow.on("hide", () => {
        if (webcamWindow && !webcamWindow.isDestroyed()) {
            webcamWindow.webContents.send("window-visibility", false);
        }
    });

    webcamWindow.on("show", () => {
        if (webcamWindow && !webcamWindow.isDestroyed()) {
            webcamWindow.webContents.send("window-visibility", true);
        }
    });

    webcamWindow.on("minimize", () => {
        if (webcamWindow && !webcamWindow.isDestroyed()) {
            webcamWindow.webContents.send("window-visibility", false);
        }
    });

    webcamWindow.on("restore", () => {
        if (webcamWindow && !webcamWindow.isDestroyed()) {
            webcamWindow.webContents.send("window-visibility", webcamWindow.isVisible());
        }
    });

    webcamWindow.on("move", () => {
        broadcastWebcamUpdate();
    });

    webcamWindow.on("resize", () => {
        broadcastWebcamUpdate();
    });

    broadcastWebcamUpdate();
};

const writeDataUrlToFile = async (dataUrl: string, outputPath: string) => {
    const dataStart = dataUrl.indexOf(',');
    if (dataStart < 0) {
        throw new Error('Invalid data URL');
    }

    await fs.promises.writeFile(outputPath, dataUrl.slice(dataStart + 1), 'base64');
};

const approvedMediaPaths = new Set<string>();
const normalizeApprovedMediaPath = (source: string) => path.resolve(fromMediaFileUrl(source)).replace(/\\/g, '/').toLowerCase();
const approveMediaPath = (source: string | null | undefined) => {
    if (!source || source.startsWith('data:')) {
        return;
    }
    const physicalPath = fromMediaFileUrl(source);
    if (!path.isAbsolute(physicalPath) || !isSupportedMediaFilePath(physicalPath)) {
        return;
    }
    approvedMediaPaths.add(normalizeApprovedMediaPath(physicalPath));
};
const isApprovedMediaPath = (source: string): boolean => approvedMediaPaths.has(normalizeApprovedMediaPath(source));

const ensurePhysicalMediaPath = (source: string) => {
    const sourcePath = fromMediaFileUrl(source);
    if (!path.isAbsolute(sourcePath)) {
        throw new Error(`Media path must be absolute: ${sourcePath}`);
    }
    if (!isSupportedMediaFilePath(sourcePath)) {
        throw new Error(`Unsupported media file type: ${sourcePath}`);
    }
    if (!isApprovedMediaPath(sourcePath)) {
        throw new Error(`Media path is not approved for renderer access: ${sourcePath}`);
    }
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source file not found: ${sourcePath}`);
    }
    return sourcePath;
};

const saveMediaSourceToPath = async (source: string, outputPath: string) => {
    if (source.startsWith('data:')) {
        await writeDataUrlToFile(source, outputPath);
        return;
    }

    const sourcePath = ensurePhysicalMediaPath(source);
    await fs.promises.copyFile(sourcePath, outputPath);
};

const dispatchRecordingStartRequest = (config?: AgentRecordingRequest) => {
    if (isRecordingActive) {
        console.warn("[ageofscreen] Ignoring duplicate recording start request because a recording is already active.");
        return;
    }

    const sendStart = () => {
        if (menuWindow && !menuWindow.isDestroyed()) {
            menuWindow.webContents.send("start-recording-requested", config);
        }
    };

    if (!menuWindow || menuWindow.isDestroyed()) {
        createMenuWindow({ bypassReopenGuard: true });
        if (menuWindow && !menuWindow.isDestroyed()) {
            menuWindow.webContents.once("did-finish-load", () => {
                sendStart();
                menuWindow?.hide();
            });
        }
        return;
    }

    if (menuWindow.webContents.isLoadingMainFrame()) {
        menuWindow.webContents.once("did-finish-load", sendStart);
        return;
    }

    sendStart();
};

const maybeAutoStartAgentRecording = (reason: string) => {
    if (shieldMode !== "agent_local" || isRecordingActive || agentAutoRecordingRequested) {
        return;
    }

    agentAutoRecordingRequested = true;
    console.log("[ageofscreen] Auto-starting agent recording:", reason);
    dispatchRecordingStartRequest(DEFAULT_AGENT_RECORDING_REQUEST);
};

const captureAgentScreenshot = async (mode: "fullscreen" | "window" = "fullscreen", windowId?: string): Promise<AgentJobResult> => {
    if (mode === "window") {
        if (!windowId) {
            return { success: false, error: "Window screenshot requires a windowId." };
        }
        const sources = await desktopCapturer.getSources({
            types: ["window"],
            thumbnailSize: screen.getPrimaryDisplay().size,
        });
        const source = sources.find((item) => item.id === windowId);
        if (!source) {
            return { success: false, error: "Requested window source was not found." };
        }
        createEditorWindow(source.thumbnail.toDataURL());
        return {
            success: true,
            message: "Window screenshot captured and opened in the editor.",
            data: { mode, windowId },
        };
    }

    await createCaptureWindow("fullscreen");
    return {
        success: true,
        message: "Fullscreen screenshot captured and opened in the editor.",
        data: { mode: "fullscreen" },
    };
};
const runAutoPolishPreview = async ({
    videoSrc,
    backgroundColor,
    padding,
    trackingProfile,
}: {
    videoSrc: string;
    backgroundColor?: string;
    padding?: number;
    trackingProfile?: SmartTrackingProfile;
}) => {
    console.log('[ageofscreen] IPC auto-polish received:', videoSrc);
    try {
        const entitlementState = getCurrentEntitlementState();
        if (!entitlementState.canUseAutoPolish) {
            return { success: false, error: getAutoPolishUpgradeMessage() };
        }

        const vr = await getVideoRenderer();
        if (!vr?.isAvailable() || !vr.getFFmpegPath()) {
            return { success: false, error: 'FFmpeg is required for Auto-Polish. Please install FFmpeg.' };
        }

        const sourcePath = videoSrc.startsWith('data:')
            ? videoSrc
            : ensurePhysicalMediaPath(videoSrc);

        const tempDir = getageofscreenTempDir();
        let processingPath: string;

        if (videoSrc.startsWith('data:')) {
            processingPath = path.join(tempDir, `autopolish-${Date.now()}.webm`);
            await writeDataUrlToFile(videoSrc, processingPath);
        } else {
            processingPath = path.join(tempDir, `autopolish-input-${Date.now()}${path.extname(sourcePath) || '.mp4'}`);
            await fs.promises.copyFile(sourcePath, processingPath);
        }

        const previewPath = path.join(tempDir, `autopolish-preview-${Date.now()}.mp4`);
        const isAlreadyPolished = sourcePath.toLowerCase().includes('autopolish-preview');
        const skipStyle = isAlreadyPolished;

        const rawBg = backgroundColor || 'bg_starlight_blur';
        const requestedPadding = Math.max(0, padding ?? 0);
        const resolvedBg = resolveBackgroundFFmpeg(rawBg);
        const hexMatch = resolvedBg.match(/#([0-9A-Fa-f]{6})/);
        let solidBg = hexMatch ? `#${hexMatch[1]}` : '#1a1a1f';
        if (!backgroundColor || backgroundColor === 'transparent' || backgroundColor === '#000000') {
            solidBg = '#1a1a1f';
        }
        const hex = solidBg.replace('#', '');
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        if (luminance > 220) {
            const AUTO_POLISH_PALETTE = ['#1a1a1f', '#1e3a5f', '#1a3d2e', '#4a1c2e', '#0d1b2a', '#2d3748', '#0f0c29', '#667eea', '#764ba2'];
            solidBg = AUTO_POLISH_PALETTE[Math.floor(Math.random() * AUTO_POLISH_PALETTE.length)];
        }

        const result = await runAutoPolish(processingPath, previewPath, {
            ffmpegPath: vr.getFFmpegPath()!,
            backgroundColor: solidBg,
            padding: skipStyle ? 0 : requestedPadding,
            addWatermark: skipStyle ? false : entitlementState.watermarkEnabled,
        });

        fs.promises.unlink(processingPath).catch(console.error);

        if (result.success && result.outputPath && videoEditorWindow && !videoEditorWindow.isDestroyed()) {
            approveMediaPath(result.outputPath);
            const fileUrl = toMediaFileUrl(result.outputPath);
            const baseTrackingEffects = buildSmartTrackingEffects(recordedCursorData, {
                durationHint: result.beforeDuration ?? undefined,
                profile: trackingProfile ?? DEFAULT_SMART_TRACKING_PROFILE,
            });
            const remappedTrackingEffects = remapSmartTrackingEffects(baseTrackingEffects, result.beforeDuration, result.afterDuration);
            const previewToast = remappedTrackingEffects.length > 0
                ? 'Preview loaded with ' + remappedTrackingEffects.length + ' focus effects. Press play to preview motion.'
                : 'Preview loaded. Export when satisfied.';
            videoEditorWindow.webContents.send(
                'load-video',
                fileUrl,
                'Auto-Polish Preview',
                previewToast,
                true,
                recordedCursorData,
                remappedTrackingEffects,
            );
        }

        return result;
    } catch (error) {
        console.error('[ageofscreen] Auto-polish failed:', error);
        return { success: false, error: (error as Error).message };
    }
};

const runAutoPolishPlan = async ({
    videoSrc,
}: {
    videoSrc: string;
}) => {
    try {
        const entitlementState = getCurrentEntitlementState();
        if (!entitlementState.canUseAutoPolish) {
            return { success: false, error: getAutoPolishUpgradeMessage() };
        }

        const vr = await getVideoRenderer();
        if (!vr?.isAvailable() || !vr.getFFmpegPath()) {
            return { success: false, error: 'FFmpeg is required for Auto-Polish analysis. Please install FFmpeg.' };
        }

        const sourcePath = videoSrc.startsWith('data:')
            ? videoSrc
            : ensurePhysicalMediaPath(videoSrc);
        const tempDir = getageofscreenTempDir();
        let processingPath: string;

        if (videoSrc.startsWith('data:')) {
            processingPath = path.join(tempDir, `autopolish-plan-${Date.now()}.webm`);
            await writeDataUrlToFile(videoSrc, processingPath);
        } else {
            processingPath = sourcePath;
        }

        const result = await planAutoPolish(processingPath, {
            ffmpegPath: vr.getFFmpegPath()!,
            trimSilence: true,
            applyVisualPreset: true,
            applyFocusMotion: true,
            enhanceVoice: true,
        });

        if (processingPath !== sourcePath) {
            fs.promises.unlink(processingPath).catch(console.error);
        }

        return result;
    } catch (error) {
        console.error('[ageofscreen] Auto-polish plan failed:', error);
        return { success: false, error: (error as Error).message };
    }
};
// --- IPC Handlers ---
const registerIpcHandlers = () => {
    ipcMain.handle("get-feature-flags", () => FEATURES);
    ipcMain.handle("license:get-state", () => getCurrentEntitlementState());
    ipcMain.handle("license:refresh", async () => refreshEntitlementState());
    ipcMain.handle("license:purchase-pro", async (_event, source?: UpgradeSource) => {
        const result = await getEntitlementProvider().purchasePro(source ?? "generic");
        cachedEntitlementState = result.state;
        broadcastLicenseState(result.state);
        return result;
    });
    ipcMain.handle("settings:get-onboarding-state", () => getOnboardingState());
    ipcMain.handle("settings:complete-onboarding", () => completeOnboarding());

    // Shield mode controls
    ipcMain.handle("shield:get-state", () => toShieldState(shieldMode));
    ipcMain.handle("shield:set-mode", (_event, mode: ShieldMode) => {
        if (!FEATURES.ENABLE_AGENT_SURFACES) {
            setShieldMode("human_local");
            return toShieldState("human_local");
        }
        setShieldMode(mode === "agent_local" ? "agent_local" : "human_local");
        return toShieldState(shieldMode);
    });
    ipcMain.on("shield:subscribe", (event) => {
        const wc = event.sender;
        const blockedListener = (payload: any) => {
            if (!wc.isDestroyed()) {
                wc.send("shield:blocked", payload);
            }
        };
        const stateListener = (payload: ShieldState) => {
            if (!wc.isDestroyed()) {
                wc.send("shield:state", payload);
            }
        };

        shieldEvents.on("blocked-request", blockedListener);
        shieldEvents.on("state-changed", stateListener);

        wc.send("shield:state", toShieldState(shieldMode));

        wc.once("destroyed", () => {
            shieldEvents.off("blocked-request", blockedListener);
            shieldEvents.off("state-changed", stateListener);
        });
    });

    ipcMain.handle("agent:run-job", async (_event, job: AgentJob): Promise<AgentJobResult> => {
        if (!FEATURES.ENABLE_AGENT_SURFACES) {
            return {
                success: false,
                error: "Agent surfaces are disabled in this release profile.",
            };
        }
        if (shieldMode !== "agent_local") {
            return {
                success: false,
                error: "Shield is in Human Only mode. Switch the shield to orange to allow agent commands.",
            };
        }

        try {
            if (!job || typeof job !== "object" || typeof (job as any).type !== "string") {
                return { success: false, error: "Invalid agent job payload." };
            }

            switch (job.type) {
                case "open_editor": {
                    createVideoEditorWindow(job.sourceVideo, job.name);
                    return {
                        success: true,
                        message: job.sourceVideo
                            ? "Editor opened with source media loaded."
                            : "Editor opened and ready for a local agent workflow.",
                    };
                }
                case "polish_recording": {
                    const sourceVideo = job.sourceVideo || latestAgentVideoPath;
                    if (!sourceVideo) {
                        return {
                            success: false,
                            error: "No recording is available yet. Record something first.",
                        };
                    }
                    createVideoEditorWindow(sourceVideo, job.name || "Agent Polish");
                    const result = await runAutoPolishPreview({
                        videoSrc: sourceVideo,
                        backgroundColor: "#1a1a1f",
                        padding: 10,
                        trackingProfile: job.trackingProfile ?? DEFAULT_SMART_TRACKING_PROFILE,
                    });
                    if (!result?.success) {
                        return {
                            success: false,
                            error: result?.error || "Auto-Polish failed.",
                        };
                    }
                    return {
                        success: true,
                        message: "Agent polished the recording and loaded the preview in the editor.",
                        data: {
                            beforeDuration: result.beforeDuration,
                            afterDuration: result.afterDuration,
                            outputPath: result.outputPath,
                        },
                    };
                }
                case "create_summary_clip": {
                    const bullets = Array.isArray(job.bullets) ? job.bullets.map((item) => String(item)).filter(Boolean).slice(0, 3) : [];
                    const sourceVideo = job.sourceVideo || latestAgentVideoPath;
                    if (!sourceVideo || !job.title?.trim() || bullets.length === 0) {
                        return {
                            success: false,
                            error: "Summary clip requires a source video, title, and at least one bullet.",
                        };
                    }
                    pendingAgentSummary = {
                        title: job.title,
                        bullets,
                        style: job.style ?? "studio_clean",
                    };
                    createVideoEditorWindow(sourceVideo, job.name || job.title);
                    return {
                        success: true,
                        message: "Summary clip layout prepared in the editor. Review and export when ready.",
                        data: {
                            bulletCount: bullets.length,
                            style: job.style ?? "studio_clean",
                        },
                    };
                }
                case "capture_screenshot": {
                    return await captureAgentScreenshot(job.mode ?? "fullscreen", job.windowId);
                }
                case "start_recording": {
                    dispatchRecordingStartRequest(job.config);
                    return {
                        success: true,
                        message: "Recording start was dispatched through the app recording flow.",
                        data: {
                            recordingMode: job.config?.recordingMode ?? "fullscreen",
                        },
                    };
                }
                case "stop_recording": {
                    if (!isRecordingActive) {
                        return {
                            success: false,
                            error: "No active recording to stop.",
                        };
                    }
                    triggerStopRecording();
                    return {
                        success: true,
                        message: "Recording stop requested through the app recording flow.",
                    };
                }
                default:
                    return {
                        success: false,
                        error: `Unsupported agent job: ${(job as any).type}`,
                    };
            }
        } catch (error) {
            console.error("[ageofscreen] Agent job failed:", error);
            return {
                success: false,
                error: (error as Error).message,
            };
        }
    });

    // Trigger events
    ipcMain.on("trigger-mouse-enter", () => {
        if (!shouldUseTriggerLine() || isCaptureSessionActive) {
            return;
        }
        createMenuWindow();
    });

    // Menu events
    ipcMain.on("menu-hide", () => {
        hideMenuWindow();
    });

    ipcMain.on("menu-snip", () => {
        console.log("[ageofscreen] Mode: Region Snip");
        hideMenuWindow({ rearmTrigger: false, blockReopenMs: CAPTURE_WINDOW_SETTLE_MS + MENU_REOPEN_GUARD_MS });
        createCaptureWindow("region");
    });

    ipcMain.on("menu-fullscreen", () => {
        console.log("[ageofscreen] Mode: Full Screen");
        hideMenuWindow({ rearmTrigger: false, blockReopenMs: CAPTURE_WINDOW_SETTLE_MS + MENU_REOPEN_GUARD_MS });
        createCaptureWindow("fullscreen");
    });

    ipcMain.on("menu-window", () => {
        console.log("[ageofscreen] Mode: Window Snip");
        hideMenuWindow({ rearmTrigger: false, blockReopenMs: CAPTURE_WINDOW_SETTLE_MS + MENU_REOPEN_GUARD_MS });
        createCaptureWindow("window");
    });

    ipcMain.on("menu-focus", () => {
        // Toggled in the menu renderer itself (managed by FocusWidget component)
        console.log("[ageofscreen] Focus Toggled");
    });


    ipcMain.on("menu-camera", (event, shape?: CameraShape, size?: number, name?: string, borderColor?: string, borderWidth?: number, glowEnabled?: boolean, audioMeterEnabled?: boolean) => {
        console.log("[ageofscreen] Toggling Camera with shape:", shape || 'default', "size:", size || 'default', "name:", name || 'none', "borderColor:", borderColor || 'default', "borderWidth:", borderWidth, "glow:", glowEnabled, "audioMeter:", audioMeterEnabled);

        // During recording, toggle webcam visibility when no args provided (from widget)
        if (isRecordingActive && webcamWindow && !webcamWindow.isDestroyed() && !shape && size === undefined) {
            if (webcamWindow.isVisible()) {
                webcamWindow.hide();
            } else {
                webcamWindow.show();
                webcamWindow.setAlwaysOnTop(true, 'screen-saver', 2);
            }
            broadcastWebcamUpdate();
            return;
        }

        createWebcamWindow(shape, size, name, borderColor, borderWidth, glowEnabled, audioMeterEnabled);
        if (webcamWindow && !webcamWindow.isDestroyed()) {
            webcamWindow.webContents.send("update-shape", currentCameraShape);
            if (name !== undefined) {
                webcamWindow.webContents.send("update-presenter-name", name);
            }
            broadcastWebcamUpdate();
        } else {
            broadcastWebcamUpdate(); // Notify hidden
        }
    });

    let resizeSession: { anchorX: number; anchorY: number; grabOffsetX: number; grabOffsetY: number } | null = null;

    ipcMain.on('webcam-resize-start', (event, { screenX, screenY }) => {
        if (webcamWindow && !webcamWindow.isDestroyed()) {
            const bounds = webcamWindow.getBounds();
            resizeSession = {
                anchorX: bounds.x + bounds.width,
                anchorY: bounds.y + bounds.height,
                grabOffsetX: screenX - bounds.x,
                grabOffsetY: screenY - bounds.y
            };
        }
    });

    // Handle precise absolute resize
    ipcMain.on("webcam-resize-absolute", (_event, { screenX, screenY: _screenY }: { screenX: number; screenY: number }) => {
        if (webcamWindow && !webcamWindow.isDestroyed() && resizeSession) {
            // Target top-left is current mouse adjusted by the grab offset
            const targetX = screenX - resizeSession.grabOffsetX;

            // Calculate potential width relative to the FIXED anchor
            const potWidth = Math.max(80, Math.min(1200, resizeSession.anchorX - targetX));

            // Apply shape constraint (locked aspect ratio)
            const nextBounds = getCameraDimensionsForWidth(currentCameraShape, potWidth);

            // Re-calculate X, Y to maintain the bottom-right anchor
            const newX = resizeSession.anchorX - nextBounds.width;
            const newY = resizeSession.anchorY - nextBounds.height;

            webcamWindow.setBounds({
                x: Math.round(newX),
                y: Math.round(newY),
                width: Math.round(nextBounds.width),
                height: Math.round(nextBounds.height)
            }, false);

            if (recordingWidget && !recordingWidget.isDestroyed() && recordingWidget.isVisible()) {
                syncRecordingWidgetToWebcam();
            }
            broadcastWebcamUpdate();
        }
    });

    let isWebcamHovered = false;
    let isWidgetHovered = false;
    let hideWidgetTimeout: NodeJS.Timeout | null = null;

    function updateWidgetVisibility() {
        if (!isRecordingActive) return;

        if (isDrawingOverlayActive()) {
            showRecordingWidgetForDrawing();
            return;
        }

        if (isWebcamHovered || isWidgetHovered) {
            if (hideWidgetTimeout) clearTimeout(hideWidgetTimeout);
            if (recordingWidget && !recordingWidget.isDestroyed()) {
                syncRecordingWidgetToWebcam();
                recordingWidget.show();
                recordingWidget.setAlwaysOnTop(true, 'screen-saver', 1);
            }
        } else {
            if (hideWidgetTimeout) clearTimeout(hideWidgetTimeout);
            hideWidgetTimeout = setTimeout(() => {
                if (!isWebcamHovered && !isWidgetHovered) {
                    if (recordingWidget && !recordingWidget.isDestroyed()) {
                        recordingWidget.hide();
                    }
                }
            }, 800);
        }
    }

    ipcMain.on("webcam-controls-hover", (event, isHovered: boolean) => {
        isWebcamHovered = isHovered;
        updateWidgetVisibility();
    });

    ipcMain.on("widget-hover", (event, isHovered: boolean) => {
        isWidgetHovered = isHovered;
        updateWidgetVisibility();
    });

    function syncRecordingWidgetToWebcam() {
        if (webcamWindow && !webcamWindow.isDestroyed() && recordingWidget && !recordingWidget.isDestroyed()) {
            const camBounds = webcamWindow.getBounds();
            const widgetBounds = recordingWidget.getBounds();

            // Center the widget flushing against the camera (Scandinavian minimalism)
            const x = Math.round(camBounds.x + (camBounds.width / 2) - (widgetBounds.width / 2));
            const y = Math.round(camBounds.y + camBounds.height);

            const workArea = screen.getPrimaryDisplay().workAreaSize;
            recordingWidget.setPosition(
                Math.max(0, Math.min(workArea.width - widgetBounds.width, x)),
                Math.max(0, Math.min(workArea.height - widgetBounds.height, y))
            );
        }
    }

    // Handle capture request from renderer (Editor Toolbar)
    ipcMain.handle("invoke-capture", (event, type: string) => {
        if (isSupportedCaptureInvokeType(type)) {
            return screen.getAllDisplays().map(d => ({
                id: d.id,
                bounds: d.bounds,
                workArea: d.workArea,
                scaleFactor: d.scaleFactor
            }));
        }

        if (type !== "region" && type !== "fullscreen" && type !== "window") {
            console.warn("[ageofscreen] Unsupported capture request ignored:", type);
            return null;
        }

        console.log("[ageofscreen] Invoke capture requested from renderer:", type);
        createCaptureWindow(type as any);
        return null;
    });

    // Capture result
    ipcMain.on("capture-result", async (event, result: { cancelled: boolean; bounds?: any; windowId?: string }) => {
        console.log("[ageofscreen] Capture result received");

        if (result.cancelled) {
            if (captureWindow && !captureWindow.isDestroyed()) {
                captureWindow.close();
            }
            let restoredEditor = false;
            if (shouldRestoreEditorAfterCaptureCancel && editorWindow && !editorWindow.isDestroyed()) {
                editorWindow.show();
                editorWindow.focus();
                restoredEditor = true;
            }
            shouldRestoreEditorAfterCaptureCancel = false;
            isCaptureSessionActive = false;
            if (!restoredEditor) {
                restoreTriggerWindowIfEnabled();
            }
            return;
        }

        if (result.windowId) {
            // Window capture
            const sources = await desktopCapturer.getSources({
                types: ["window"],
                thumbnailSize: screen.getPrimaryDisplay().size,
            });
            const source = sources.find((s) => s.id === result.windowId);
            if (source) {
                if (captureWindow && !captureWindow.isDestroyed()) {
                    captureWindow.close();
                }
                shouldRestoreEditorAfterCaptureCancel = false;
                isCaptureSessionActive = false;
                createEditorWindow(source.thumbnail.toDataURL());
            } else {
                console.warn("[ageofscreen] Selected window source disappeared before capture completed:", result.windowId);
                if (captureWindow && !captureWindow.isDestroyed()) {
                    captureWindow.close();
                }
                let restoredEditor = false;
                if (shouldRestoreEditorAfterCaptureCancel && editorWindow && !editorWindow.isDestroyed()) {
                    editorWindow.show();
                    editorWindow.focus();
                    restoredEditor = true;
                }
                shouldRestoreEditorAfterCaptureCancel = false;
                isCaptureSessionActive = false;
                if (!restoredEditor) {
                    restoreTriggerWindowIfEnabled();
                }
            }
            return;
        }

        if (!result.bounds || !tempScreenshotDataUrl) {
            if (captureWindow && !captureWindow.isDestroyed()) {
                captureWindow.close();
            }
            let restoredEditor = false;
            if (shouldRestoreEditorAfterCaptureCancel && editorWindow && !editorWindow.isDestroyed()) {
                editorWindow.show();
                editorWindow.focus();
                restoredEditor = true;
            }
            shouldRestoreEditorAfterCaptureCancel = false;
            isCaptureSessionActive = false;
            if (!restoredEditor) {
                restoreTriggerWindowIfEnabled();
            }
            return;
        }

        try {
            const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
            const bounds = {
                x: Math.floor(result.bounds.x * scaleFactor),
                y: Math.floor(result.bounds.y * scaleFactor),
                width: Math.floor(result.bounds.width * scaleFactor),
                height: Math.floor(result.bounds.height * scaleFactor),
            };

            const img = nativeImage.createFromDataURL(tempScreenshotDataUrl);
            const cropped = img.crop(bounds);
            const croppedDataUrl = cropped.toDataURL();

            if (captureWindow && !captureWindow.isDestroyed()) {
                captureWindow.close();
            }

            console.log("[ageofscreen] Captured region:", bounds.width, "x", bounds.height);
            shouldRestoreEditorAfterCaptureCancel = false;
            isCaptureSessionActive = false;
            createEditorWindow(croppedDataUrl);
        } catch (error) {
            console.error("[ageofscreen] Error cropping image:", error);
            let restoredEditor = false;
            if (shouldRestoreEditorAfterCaptureCancel && editorWindow && !editorWindow.isDestroyed()) {
                editorWindow.show();
                editorWindow.focus();
                restoredEditor = true;
            }
            shouldRestoreEditorAfterCaptureCancel = false;
            isCaptureSessionActive = false;
            if (!restoredEditor) {
                restoreTriggerWindowIfEnabled();
            }
        }
    });

    // Focus widget (Timer) IPCs
    ipcMain.on("timer-widget-show", (event, payload) => {
        if (!FEATURES.ENABLE_FOCUS_WIDGET) return;
        createFocusWindow(payload);
    });

    ipcMain.on("timer-widget-hide", () => {
        if (!FEATURES.ENABLE_FOCUS_WIDGET) return;
        if (focusWindow && !focusWindow.isDestroyed()) {
            focusWindow.close();
        }
    });

    ipcMain.on("focus-widget-stop-clicked", () => {
        if (!FEATURES.ENABLE_FOCUS_WIDGET) return;
        if (menuWindow && !menuWindow.isDestroyed()) {
            menuWindow.webContents.send("timer-widget-stop-requested");
        }
        if (focusWindow && !focusWindow.isDestroyed()) {
            focusWindow.close();
        }
    });

    // Focus Blocking (Stub for now)
    ipcMain.on("focus-blocking-start", (event, blockedItems) => {
        console.log("[ageofscreen] Focus blocking started for:", blockedItems);
    });

    ipcMain.on("focus-blocking-stop", () => {
        console.log("[ageofscreen] Focus blocking stopped");
    });

    ipcMain.on("minimize-window", (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.minimize();
    });

    ipcMain.on("maximize-window", (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;

        if (win.isMaximized()) {
            win.unmaximize();
            return;
        }

        win.maximize();
    });

    // Recording IPCs
    ipcMain.on("menu-record", () => {
        if (menuWindow && !menuWindow.isDestroyed()) {
            menuWindow.webContents.send("start-recording-requested");
        }
    });

    ipcMain.on("show-recording-widget", (_event, config?: { liveMagnifierEnabled?: boolean; captureCursorData?: boolean; windowBackground?: string }) => {
        showRecordingWidget(config);
    });

    ipcMain.on("hide-recording-widget", () => {
        hideRecordingWidget();
    });

    ipcMain.on("widget-stop-recording", () => {
        console.log('[ageofscreen] Widget requested stop recording');
        triggerStopRecording();
    });

    // Drawing overlay toggle
    ipcMain.on("toggle-drawing-overlay", (event, enabled: boolean) => {
        if (!FEATURES.ENABLE_DRAWING) return;
        console.log('[ageofscreen] Toggle drawing overlay:', enabled);
        if (enabled) {
            wasWebcamVisibleBeforeDrawing = !!(webcamWindow && !webcamWindow.isDestroyed() && webcamWindow.isVisible());
            createDrawingOverlayWindow();
            // After overlay is created, raise webcam + widget above it (z-level 2 > overlay's 1)
            setTimeout(() => {
                // Focus first, then raise utility windows. On Windows, focusing the overlay after
                // the camera can push the camera behind the transparent drawing surface.
                if (drawingOverlayWindow && !drawingOverlayWindow.isDestroyed()) {
                    drawingOverlayWindow.focus();
                }
                raiseWebcamAboveDrawingOverlay();
                showRecordingWidgetForDrawing();
            }, 100);
        } else {
            restoreAfterDrawingOverlay();
        }
    });

    // Window background color change
    ipcMain.on("set-window-background", (event, color: string) => {
        console.log('[ageofscreen] Set window background color:', color);
        smartFeaturesConfig.windowBackground = color;
        // Optionally notify editor if it's open
    });

    ipcMain.on("get-recording-settings", (_event) => {
        if (recordingWidget && !recordingWidget.isDestroyed()) {
            recordingWidget.webContents.send('recording-settings', {
                recordingMode: smartFeaturesConfig.recordingMode,
                windowBackground: smartFeaturesConfig.windowBackground
            });
        }
    });

    ipcMain.on("capture-health-update", (_event, metrics: { droppedFrames: number; bufferErrors: number; effectiveFps: number | null; status: string }) => {
        _latestCaptureHealth = metrics;
        if (recordingWidget && !recordingWidget.isDestroyed()) {
            recordingWidget.webContents.send('capture-health', metrics);
        }
    });

    ipcMain.on("send-source-status", (_event, status: { screen: boolean; camera: boolean; mic: boolean }) => {
        _latestSourceStatus = status;
        if (recordingWidget && !recordingWidget.isDestroyed()) {
            recordingWidget.webContents.send('source-status', status);
        }
    });



    ipcMain.on("set-edit-after-recording", (event, enabled: boolean) => {
        console.log('[ageofscreen] Set edit after recording:', enabled);
        // Broadcast to all windows
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send('edit-after-recording-changed', enabled);
            }
        });
    });


    // Drawing color change
    ipcMain.on("set-drawing-color", (event, color: string) => {
        console.log('[ageofscreen] Set drawing color:', color);
        if (drawingOverlayWindow && !drawingOverlayWindow.isDestroyed()) {
            drawingOverlayWindow.webContents.send('set-drawing-color', color);
        }
    });

    // Drawing stroke updates - broadcast to all windows for compositor rendering
    ipcMain.on("drawing-stroke-update", (event, data: { strokes: any[]; screenWidth: number; screenHeight: number }) => {
        // Broadcast to all windows (including menu window where compositor runs)
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed() && win !== drawingOverlayWindow) {
                win.webContents.send('drawing-stroke-update', data);
            }
        });
    });

    // Teleprompter IPC handlers
    ipcMain.on("show-teleprompter", (event, text?: string, speed?: number) => {
        if (!FEATURES.ENABLE_TELEPROMPTER) return;
        console.log('[ageofscreen] Show teleprompter:', { text: text?.substring(0, 30), speed });
        createTeleprompterWindow(text, speed);
    });

    ipcMain.on("toggle-teleprompter-request", () => {
        if (!FEATURES.ENABLE_TELEPROMPTER) return;
        console.log('[ageofscreen] Toggle teleprompter requested');
        if (teleprompterWindow && !teleprompterWindow.isDestroyed()) {
            closeTeleprompterWindow();
        } else {
            createTeleprompterWindow();
        }
    });

    ipcMain.on("toggle-camera-zoom", () => {
        console.log('[ageofscreen] Toggle camera zoom requested');
        // If it's already large, normal it. If normal, large it.
        if (webcamWindow && !webcamWindow.isDestroyed()) {
            const bounds = webcamWindow.getBounds();
            const isCurrentlyLarge = bounds.width > 300;
            isWebcamZoomed = !isCurrentlyLarge;
            handleWebcamZoom(isWebcamZoomed);
        }
    });

    // Webcam Toolbar Actions
    ipcMain.on("webcam-stop-recording", () => {
        console.log('[ageofscreen] Webcam stop requested');
        triggerStopRecording();
    });

    // Resize webcam window (zoom button)
    ipcMain.on("webcam-resize", (event, size: 'large' | 'normal') => {
        isWebcamZoomed = size === 'large';
        handleWebcamZoom(isWebcamZoomed);
    });

    function handleWebcamZoom(zoomed: boolean) {
        if (webcamWindow && !webcamWindow.isDestroyed()) {
            const bounds = webcamWindow.getBounds();

            const baseSize = 140;
            const scaleFactor = currentCameraSize / 100;
            const normalSize = Math.round(baseSize * scaleFactor);

            let camSize = zoomed ? Math.max(350, normalSize * 2) : normalSize;

            const zoomBounds = getCameraDimensionsForWidth(currentCameraShape, camSize);

            // Grow/shrink from center to maintain position
            const centerX = bounds.x + (bounds.width / 2);
            const centerY = bounds.y + (bounds.height / 2);

            const newX = Math.round(centerX - (zoomBounds.width / 2));
            const newY = Math.round(centerY - (zoomBounds.height / 2));

            // Constrain to primary display work area
            const primaryDisplay = screen.getPrimaryDisplay();
            const { width, height } = primaryDisplay.workAreaSize;

            const finalX = Math.max(0, Math.min(width - zoomBounds.width, newX));
            const finalY = Math.max(0, Math.min(height - zoomBounds.height, newY));

            webcamWindow.setBounds({
                x: finalX,
                y: finalY,
                width: Math.round(zoomBounds.width),
                height: Math.round(zoomBounds.height)
            }, true);

            broadcastWebcamUpdate();

            // Sync widget immediately if it's visible
            if (recordingWidget && !recordingWidget.isDestroyed() && recordingWidget.isVisible()) {
                setTimeout(() => syncRecordingWidgetToWebcam(), 50); // Small delay for window resize to settle
            }
        }
    }

    ipcMain.on("webcam-hide-camera", () => {
        console.log('[ageofscreen] Hide camera requested');
        if (webcamWindow && !webcamWindow.isDestroyed()) {
            webcamWindow.hide();
        }
    });

    ipcMain.on("webcam-show-camera", () => {
        console.log('[ageofscreen] Show camera requested');
        if (webcamWindow && !webcamWindow.isDestroyed()) {
            webcamWindow.show();
        }
    });

    ipcMain.on("request-webcam-broadcast", () => {
        broadcastWebcamUpdate();
    });

    // Show recording widget (from webcam toolbar)
    ipcMain.on("show-recording-widget-request", () => {
        console.log('[ageofscreen] Show recording widget requested from webcam');
        if (!recordingWidget || recordingWidget.isDestroyed()) {
            createRecordingWidget();
        }
        recordingWidget?.show();
    });

    ipcMain.on("teleprompter-close", () => {
        console.log('[ageofscreen] Close teleprompter');
        closeTeleprompterWindow();
    });

    ipcMain.on("teleprompter-minimize", () => {
        console.log('[ageofscreen] Minimize teleprompter');
        if (teleprompterWindow && !teleprompterWindow.isDestroyed()) {
            teleprompterWindow.minimize();
        }
    });

    ipcMain.handle("get-screen-sources", async () => {
        const sources = await desktopCapturer.getSources({
            types: ["screen", "window"],
            thumbnailSize: { width: 150, height: 150 },
        });
        return sources.map(source => ({
            id: source.id,
            name: source.name,
            appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
            isPrimary: source.display_id ? screen.getPrimaryDisplay().id.toString() === source.display_id : false
        }));
    });

    ipcMain.handle("save-temp-video", async (event, buffer: ArrayBuffer) => {
        try {
            const tempDir = getageofscreenTempDir();
            const timestamp = Date.now();
            const initialFilePath = path.join(tempDir, `ageofscreen-rec-${timestamp}.webm`);

            // Write file and ensure it's flushed to disk
            const nodeBuffer = Buffer.from(buffer);
            await fs.promises.writeFile(initialFilePath, nodeBuffer);

            const filePath = await normalizeTempRecordingForEditor(initialFilePath);
            approveMediaPath(filePath);

            const cursorDataForSidecar = finalizeRecordedCursorData();

            // Save full cursor metadata so editor replay, cursor styling, and Auto-Polish
            // can restore the same interaction data when the clip is reopened later.
            if (cursorDataForSidecar.length > 0) {
                const jsonPath = filePath.replace(/\.[^.]+$/, '.cursor.json');
                await fs.promises.writeFile(jsonPath, JSON.stringify(cursorDataForSidecar));
                console.log('[ageofscreen] Saved cursor metadata sidecar:', cursorDataForSidecar.length, 'events');
            }

            // Verify file was written correctly
            const stats = await fs.promises.stat(filePath);
            console.log('[ageofscreen] Saved temp recording:', {
                path: filePath,
                size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
                bufferSize: `${(nodeBuffer.length / 1024 / 1024).toFixed(2)} MB`
            });

            if (stats.size === 0) {
                throw new Error('File was written but is empty');
            }

            // Construct file URL - Windows paths need proper formatting
            // Example: C:\Users\Name\AppData\Local\Temp\file.webm -> file:///C:/Users/Name/AppData/Local/Temp/file.webm
            // Use pathToFileURL for correct cross-platform file URL conversion
            const fileUrl = toMediaFileUrl(filePath);
            latestAgentVideoPath = fileUrl;

            console.log('[ageofscreen] File URL:', fileUrl);
            return { filePath: fileUrl };
        } catch (error) {
            console.error("[ageofscreen] Failed to save temp video:", error);
            return { error: (error as Error).message };
        }
    });

    ipcMain.handle("delete-temp-video", async (event, filePath: string) => {
        try {
            const physicalPath = fromMediaFileUrl(filePath);

            // Check if it's in the temp directory to be safe
            const tempDir = path.resolve(getageofscreenTempDir());
            const resolvedPhysicalPath = path.resolve(physicalPath);
            const isTempFile = isPathInsideDirectory(resolvedPhysicalPath, tempDir);

            if (isTempFile && fs.existsSync(resolvedPhysicalPath)) {
                await fs.promises.unlink(resolvedPhysicalPath);
                const sidecarPath = resolvedPhysicalPath.replace(/\.[^.]+$/, '.cursor.json');
                if (sidecarPath !== resolvedPhysicalPath && fs.existsSync(sidecarPath)) {
                    await fs.promises.unlink(sidecarPath);
                }
                console.log('[ageofscreen] Deleted temp recording:', resolvedPhysicalPath);
                return { success: true };
            }
            console.warn('[ageofscreen] Delete rejected - path not in temp dir:', physicalPath);
            return { success: false, error: "Path not allowed or not found" };
        } catch (error) {
            console.error("[ageofscreen] Failed to delete temp video:", error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle("save-video", async (event, buffer: ArrayBuffer) => {
        try {
            const defaultName = `record-${Date.now()}.webm`;
            const { filePath, canceled } = await dialog.showSaveDialog({
                defaultPath: path.join(app.getPath("videos"), defaultName),
                filters: [{ name: "Videos", extensions: ["webm"] }],
            });

            if (canceled || !filePath) return { success: false, canceled: true };

            await fs.promises.writeFile(filePath, Buffer.from(buffer));

            const cursorDataForSidecar = finalizeRecordedCursorData();
            if (cursorDataForSidecar.length > 0) {
                const jsonPath = filePath.replace(/\.webm$/, '.json');
                await fs.promises.writeFile(jsonPath, JSON.stringify(cursorDataForSidecar));
                console.log('[ageofscreen] Saved cursor data to:', jsonPath);
            }

            return { success: true, filePath };
        } catch (error) {
            console.error("[ageofscreen] Failed to save video:", error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.on("make-widget-capture-invisible", () => {
        // Content protection renders widget as black box when captured — disabled
    });

    ipcMain.on("recording-status", (event, status: boolean) => {
        if (webcamWindow && !webcamWindow.isDestroyed()) {
            webcamWindow.webContents.send("recording-status", status);
            webcamWindow.webContents.send("update-shape", currentCameraShape);
        }
    });

    ipcMain.on("recording-progress", (event, progress: number) => {
        if (webcamWindow && !webcamWindow.isDestroyed()) {
            webcamWindow.webContents.send("recording-progress", progress);
        }
        if (recordingWidget && !recordingWidget.isDestroyed()) {
            recordingWidget.webContents.send("recording-progress", progress);
        }
    });

    // Editor Handlers
    ipcMain.on("focus-main-window", () => {
        if (editorWindow && !editorWindow.isDestroyed()) {
            editorWindow.show();
            editorWindow.focus();
        }
    });



    ipcMain.handle("save-image-as", async (event, dataUrl) => {
        const { filePath, canceled } = await dialog.showSaveDialog({
            defaultPath: path.join(app.getPath("pictures"), `snip-${Date.now()}.png`),
            filters: [{ name: "Images", extensions: ["png"] }],
        });

        if (canceled || !filePath) return { success: false, canceled: true };

        try {
            const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
            await fs.promises.writeFile(filePath, base64Data, "base64");
            return { success: true, filePath };
        } catch (error) {
            console.error("[ageofscreen] Failed to save image:", error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle("show-item-in-folder", async (_event, filePath: string) => {
        try {
            if (typeof filePath !== "string" || filePath.trim().length === 0) {
                return { success: false, error: "No file path provided." };
            }
            shell.showItemInFolder(path.resolve(filePath));
            return { success: true };
        } catch (error) {
            console.error("[ageofscreen] Failed to reveal item in folder:", error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle("save-video-project", async (_event, projectPayload: any) => {
        try {
            const rawName = typeof projectPayload?.projectName === "string"
                ? projectPayload.projectName
                : "project";
            const sanitizedName = rawName
                .trim()
                .replace(/[<>:\"/\\|?*\u0000-\u001F]/g, "-")
                .replace(/\s+/g, "-")
                .replace(/-+/g, "-")
                .slice(0, 80) || "project";
            const defaultPath = path.join(
                app.getPath("documents"),
                `${sanitizedName}-${Date.now()}.ageofscreen-project.json`,
            );
            const { filePath, canceled } = await dialog.showSaveDialog({
                defaultPath,
                filters: [{ name: "ageofscreen Projects", extensions: ["json"] }],
            });

            if (canceled || !filePath) {
                return { success: false, canceled: true };
            }

            const document = {
                app: "ageofscreen",
                version: 1,
                savedAt: new Date().toISOString(),
                ...projectPayload,
            };
            await fs.promises.writeFile(filePath, JSON.stringify(document, null, 2), "utf8");
            return { success: true, filePath };
        } catch (error) {
            console.error("[ageofscreen] Failed to save video project:", error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle("import-image", async () => {
        const { filePaths, canceled } = await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }],
        });

        if (canceled || filePaths.length === 0) return { success: false };

        try {
            const filePath = filePaths[0];
            const data = await fs.promises.readFile(filePath);
            const ext = path.extname(filePath).slice(1).toLowerCase();
            const mimeType = ext === 'jpg' ? 'jpeg' : ext;
            const dataUrl = `data:image/${mimeType};base64,${data.toString("base64")}`;
            return { success: true, dataUrl };
        } catch (error) {
            console.error("[ageofscreen] Failed to import image:", error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle("import-random-image", async () => {
        try {
            const picturesPath = app.getPath('pictures');
            const dirents = await fs.promises.readdir(picturesPath, { withFileTypes: true });
            const imageFiles = dirents
                .filter(dirent => dirent.isFile())
                .map(dirent => dirent.name)
                .filter(f => {
                    const ext = path.extname(f).toLowerCase();
                    return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext);
                });

            if (imageFiles.length === 0) return { success: false, error: "No images found in Pictures folder" };

            const randomFile = imageFiles[Math.floor(Math.random() * imageFiles.length)];
            const filePath = path.join(picturesPath, randomFile);
            const data = await fs.promises.readFile(filePath);
            const ext = path.extname(filePath).slice(1).toLowerCase();
            const mimeType = ext === 'jpg' ? 'jpeg' : ext;
            const dataUrl = `data:image/${mimeType};base64,${data.toString("base64")}`;
            return { success: true, dataUrl };
        } catch (error) {
            console.error("[ageofscreen] Failed to import random image:", error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.on("close-main-window", () => {
        if (editorWindow && !editorWindow.isDestroyed()) {
            editorWindow.close();
        }
    });

    ipcMain.handle("get-window-sources", async () => {
        const sources = await desktopCapturer.getSources({
            types: ["window"],
            thumbnailSize: { width: 300, height: 200 },
        });

        return sources.map((source) => ({
            id: source.id,
            name: source.name,
            thumbnailDataUrl: source.thumbnail.toDataURL(),
            appIcon: source.appIcon ? source.appIcon.toDataURL() : undefined,
        }));
    });

    // --- Video Editor IPC Handlers ---
    ipcMain.on("video-editor-ready", (_event) => {
        console.log("[ageofscreen] video-editor-ready received");
        if (pendingVideoDataUrl && videoEditorWindow && !videoEditorWindow.isDestroyed()) {
            sendPendingMediaToVideoEditor("video-editor-ready");
        }

        if (pendingAgentSummary && videoEditorWindow && !videoEditorWindow.isDestroyed()) {
            videoEditorWindow.webContents.send("apply-agent-summary", pendingAgentSummary);
            pendingAgentSummary = null;
        }

        // Do not send window background - user controls padding bg only via palette
    });

    ipcMain.on("video-editor-media-consumed", (_event, consumedUrl?: string) => {
        if (!pendingVideoDataUrl) return;
        if (consumedUrl && consumedUrl !== pendingVideoDataUrl) return;
        console.log("[ageofscreen] Video editor consumed pending media");
        pendingVideoDataUrl = null;
        pendingMediaName = null;
        pendingVideoDeliveryInFlight = false;
    });

    ipcMain.handle("get-pending-editor-media", () => {
        const payload = getPendingVideoEditorMedia();
        console.log("[ageofscreen] get-pending-editor-media", payload ? "hit" : "empty");
        return payload;
    });

    ipcMain.on("video-editor-close", () => {
        closeVideoEditorWindow();
    });

    ipcMain.on("video-editor-maximize", () => {
        if (videoEditorWindow && !videoEditorWindow.isDestroyed()) {
            if (videoEditorWindow.isMaximized()) {
                videoEditorWindow.unmaximize();
            } else {
                videoEditorWindow.maximize();
            }
        }
    });

    ipcMain.on("video-editor-minimize", () => {
        if (videoEditorWindow && !videoEditorWindow.isDestroyed()) {
            videoEditorWindow.minimize();
        }
    });

    ipcMain.on("show-video-editor", (event, videoDataUrl: string, name?: string) => {
        console.log("[ageofscreen] Opening video editor with video", name ? `named: ${name}` : "");
        createVideoEditorWindow(videoDataUrl, name);
    });

    ipcMain.on("open-media-editor", () => {
        console.log("[ageofscreen] Opening media editor (manual trigger)");
        createVideoEditorWindow();
    });

    ipcMain.handle("save-video-direct", async (_event, videoDataUrl: string) => {
        try {
            const defaultName = `recording-${Date.now()}.webm`;
            const filePath = await (async () => {
                const { filePath: nextPath, canceled } = await dialog.showSaveDialog({
                    defaultPath: path.join(app.getPath("videos"), defaultName),
                    filters: [{ name: "Videos", extensions: ["webm"] }],
                });
                if (canceled || !nextPath) return null;
                await saveMediaSourceToPath(videoDataUrl, nextPath);
                return nextPath;
            })();

            if (!filePath) return { success: false, canceled: true };
            closeVideoEditorWindow();
            return { success: true, filePath };
        } catch (error) {
            console.error("[ageofscreen] Failed to save video:", error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle("auto-polish", async (_event, { videoSrc, backgroundColor, padding, trackingProfile }: { videoSrc: string; backgroundColor?: string; padding?: number; trackingProfile?: SmartTrackingProfile }) => {
        return runAutoPolishPreview({ videoSrc, backgroundColor, padding, trackingProfile });
    });

    ipcMain.handle("auto-polish-plan", async (_event, { videoSrc }: { videoSrc: string }) => {
        return runAutoPolishPlan({ videoSrc });
    });

    ipcMain.handle("export-video", async (event, { videoSrc, trimData }) => {
        try {
            let reportedProgress = 0;
            const sendExportProgress = (percent: number, phase: string = "rendering") => {
                const normalizedPercent = Math.max(0, Math.min(100, Math.round(percent)));
                if (normalizedPercent < reportedProgress) {
                    return;
                }
                reportedProgress = normalizedPercent;
                event.sender.send("export-progress", { percent: normalizedPercent, phase });
            };
            const entitlementState = getCurrentEntitlementState();
            const vr = await getVideoRenderer();
            const ffmpegAvailable = vr?.isAvailable() ?? false;

            // Determine if actual processing is needed
            const segments = trimData.segments || [];
            const hasCrop = trimData.crop && (trimData.crop.x > 0.5 || trimData.crop.y > 0.5 ||
                trimData.crop.width < 99 || trimData.crop.height < 99);
            const hasFrame = (trimData.videoPadding || 0) > 0;
            const hasAudioOverlays = (trimData.audioSegments || []).length > 0;
            const hasImageOverlays = (trimData.imageOverlays || []).length > 0;
            const hasImageClips = (trimData.imageClips || []).length > 0;
            const hasTextOverlays = (trimData.textOverlays || []).length > 0;
            const hasAnnotationOverlays = (trimData.annotationImageOverlays || []).length > 0;
            const hasEffects = (trimData.smartEffects || []).length > 0;
            const requestedPremiumVoice = Boolean(trimData.premiumVoice);
            const needsVoice = requestedPremiumVoice && entitlementState.canUseStudioVoice;
            const needsColorGrade = trimData.colorGrade && trimData.colorGrade !== 'none';
            // Check if segments actually trim the video (not just full export)
            const isTrimmed = segments.length > 1 ||
                (segments.length === 1 && (segments[0].startSeconds > 0.1 || (segments[0].endSeconds < 999990)));
            const needsProcessing = isTrimmed || hasCrop || hasFrame || hasAudioOverlays || hasImageOverlays || hasImageClips || hasTextOverlays || hasAnnotationOverlays || hasEffects || needsVoice || needsColorGrade;

            // Determine source path
            const isDataUrl = videoSrc.startsWith('data:');
            const sourcePath = isDataUrl ? videoSrc : ensurePhysicalMediaPath(videoSrc);

            // Determine extension - use FFmpeg when processing needed OR when free plan (watermark)
            if (!ffmpegAvailable) {
                return {
                    success: false,
                    error: 'FFmpeg is required for exports so ageofscreen can apply the watermark.',
                };
            }

            const addWatermark = ffmpegAvailable;
            const canUseFFmpeg = ffmpegAvailable && (needsProcessing || addWatermark);
            const sourceExt = isDataUrl
                ? (videoSrc.match(/^data:video\/([a-zA-Z0-9]+)/)?.[1]?.toLowerCase() || 'webm')
                : (path.extname(sourcePath).toLowerCase().replace('.', '') || 'mp4');
            const extension = canUseFFmpeg ? 'mp4' : sourceExt;

            // Default to Videos folder for manual exports, Downloads for agent mode.
            const exportFolder = shouldAutoSaveToDownloads() ? app.getPath('downloads') : app.getPath('videos');
            const defaultFileName = `ageofscreen-${trimData.platform || 'export'}-${Date.now()}.${extension}`;
            const savePath = await resolveExportSavePath({
                defaultFolder: exportFolder,
                defaultFileName,
                filters: [{ name: "Videos", extensions: [extension, 'mp4', 'webm', 'mov'] }],
            });

            if (!savePath) return { success: false, canceled: true };

            sendExportProgress(8, "preparing");

            const exportSafeEffectTypes = new Set(['zoom', '3d_tilt', 'card_flip', 'slow_zoom', 'breathing', 'blur_area', 'exposure']);
            const requestedEffectTypes = (trimData.smartEffects || []).map((effect: any) => effect.type);
            const skippedEffectTypes = requestedEffectTypes.filter((type: string) => !exportSafeEffectTypes.has(type));

            console.log('[ageofscreen] Export request:', {
                sourcePath: sourcePath.substring(0, 80),
                savePath,
                ffmpegAvailable,
                needsProcessing,
                hasCrop,
                hasEffects,
                hasImageOverlays,
                hasImageClips,
                hasTextOverlays,
                hasAnnotationOverlays,
                segments: segments.length,
                requestedEffectTypes,
                skippedEffectTypes
            });

            if (needsProcessing && !ffmpegAvailable) {
                // Warn user but still try to export without processing
                console.warn('[ageofscreen] FFmpeg not available - crop and trim will not be applied');
            }

            let renderInfo: any = null;
            if (canUseFFmpeg && vr) {
                // Use FFmpeg for trimming/cropping
                console.log('[ageofscreen] Exporting with FFmpeg...');

                let processingPath = sourcePath;
                if (isDataUrl) {
                    const tempDir = getageofscreenTempDir();
                    const tempPath = path.join(tempDir, `temp-${Date.now()}.webm`);
                    await writeDataUrlToFile(videoSrc, tempPath);
                    processingPath = tempPath;
                }

                // Use processVideo with crop, frame, audio support, effects, and watermark for free plan
                const exportSegments = segments.length > 0 ? segments : [{ startSeconds: 0, endSeconds: 999999 }];
                await vr.processVideo(
                    processingPath,
                    savePath,
                    exportSegments,
                    trimData.crop || null,
                    trimData.backgroundColor || null,
                    trimData.videoPadding || 0,
                    trimData.outputWidth && trimData.outputHeight ? { width: trimData.outputWidth, height: trimData.outputHeight } : null,
                    trimData.audioSegments || [],
                    addWatermark,
                    trimData.smartEffects || [],
                    trimData.quality === 'high' ? 'balanced' : (trimData.quality || 'balanced'),
                    trimData.transitionType || 'cut',
                    trimData.textOverlays || [],
                    trimData.annotationImageOverlays || [],
                    trimData.imageOverlays || [],
                    trimData.imageClips || [],
                    trimData.clipTransitions || [],
                    trimData.colorGrade || 'none',
                    needsVoice,
                    {
                        onProgress: (fraction: number) => {
                            sendExportProgress(10 + (Math.max(0, Math.min(1, fraction)) * 88), "rendering");
                        },
                    }
                );
                renderInfo = vr.getLastRenderInfo();

                if (isDataUrl) {
                    fs.promises.unlink(processingPath).catch(console.error);
                }
            } else {
                // Direct copy - no FFmpeg processing
                console.log('[ageofscreen] Direct file copy (no processing available)');

                sendExportProgress(45, "copying");
                await saveMediaSourceToPath(videoSrc, savePath);
                sendExportProgress(100, "done");

                // Notify user if features were not applied
                if (hasCrop || hasFrame || hasAudioOverlays || hasImageOverlays || hasImageClips || hasTextOverlays || hasAnnotationOverlays || isTrimmed) {
                    return {
                        success: true,
                        filePath: savePath,
                        warning: 'Some features (trim, crop, frame, overlays, audio) were not applied - FFmpeg is required. Install FFmpeg and try again.'
                    };
                }
            }
            sendExportProgress(100, "done");
            const warnings: string[] = [];
            if (requestedPremiumVoice && !entitlementState.canUseStudioVoice) {
                warnings.push(getStudioVoiceUpgradeMessage());
            }
            if (skippedEffectTypes.length > 0) {
                warnings.push(`Some effects are preview-only and were skipped in export: ${Array.from(new Set(skippedEffectTypes)).join(', ')}`);
            }
            if (renderInfo?.transitionFallbackMode === 'cut') {
                warnings.push('Some clip transitions were simplified to cuts during export fallback for reliability.');
            }
            if (renderInfo?.fallbackMode === 'reliable_subset') {
                const exported = new Set(renderInfo.exportedEffectTypes);
                const dropped = renderInfo.requestedEffectTypes.filter((type: string) => !exported.has(type));
                if (dropped.length > 0) {
                    warnings.push(`Some effects could not be rendered exactly and were dropped during export fallback: ${Array.from(new Set(dropped)).join(', ')}`);
                }
            } else if (renderInfo?.fallbackMode === 'no_effects' && renderInfo.requestedEffectTypes.length > 0) {
                warnings.push(`Effects could not be rendered and export was retried without effects: ${Array.from(new Set(renderInfo.requestedEffectTypes)).join(', ')}`);
            }

            if (warnings.length > 0) {
                return {
                    success: true,
                    filePath: savePath,
                    warning: warnings.join(' ')
                };
            }

            return { success: true, filePath: savePath };
        } catch (error) {
            console.error("[ageofscreen] Failed to export video:", error);
            return { success: false, error: (error as Error).message };
        }
    });

    // --- Media File Dialog (fast - returns file path only) ---
    ipcMain.handle("open-media-file", async (event, type: 'video' | 'image' | 'audio') => {
        if (!isSupportedMediaDialogType(type)) {
            throw new Error(`Unsupported media dialog type: ${String(type)}`);
        }
        const filters: { [key: string]: { name: string; extensions: string[] }[] } = {
            video: [{ name: "Videos", extensions: ["mp4", "webm", "mov", "avi", "mkv", "m4v"] }],
            image: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }],
            audio: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a", "flac", "aac"] }]
        };

        const { filePaths, canceled } = await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: filters[type] || []
        });

        if (canceled || filePaths.length === 0) {
            return null;
        }

        const filePath = filePaths[0];
        if (!isSupportedMediaFilePath(filePath)) {
            throw new Error(`Unsupported media file selected: ${filePath}`);
        }
        approveMediaPath(filePath);
        const fileName = path.basename(filePath);
        const cursorData = type === 'video'
            ? await loadCursorMetadataSidecar(filePath)
            : null;
        let duration: number | null = null;
        if (type === 'video' || type === 'audio') {
            const vr = await getVideoRenderer();
            const ffmpegPath = vr?.isAvailable?.() ? vr.getFFmpegPath?.() : null;
            duration = await probeMediaDuration(filePath, ffmpegPath ?? null);
        }

        console.log(`[ageofscreen] Selected ${type} file:`, fileName);
        return {
            filePath,
            fileName,
            duration: duration ?? undefined,
            cursorData: cursorData ?? undefined,
        };
    });

    ipcMain.handle("export-media", async (event, filePath: string, mediaType: string, _trimData: any) => {
        try {
            let reportedProgress = 0;
            const sendExportProgress = (percent: number, phase: string = "copying") => {
                const normalizedPercent = Math.max(0, Math.min(100, Math.round(percent)));
                if (normalizedPercent < reportedProgress) {
                    return;
                }
                reportedProgress = normalizedPercent;
                event.sender.send("export-progress", { percent: normalizedPercent, phase });
            };
            const sourcePath = ensurePhysicalMediaPath(filePath);

            const ext = path.extname(sourcePath).toLowerCase();
            const defaultName = `export-${Date.now()}${ext}`;

            const filterMap: { [key: string]: { name: string; extensions: string[] }[] } = {
                video: [{ name: "Videos", extensions: [ext.slice(1) || 'webm'] }],
                image: [{ name: "Images", extensions: [ext.slice(1) || 'png'] }],
                audio: [{ name: "Audio", extensions: [ext.slice(1) || 'mp3'] }]
            };

            const defaultFolder = mediaType === "image"
                ? app.getPath("pictures")
                : mediaType === "audio"
                    ? app.getPath("music")
                    : app.getPath("videos");
            const savePath = await resolveExportSavePath({
                defaultFolder,
                defaultFileName: defaultName,
                filters: filterMap[mediaType] || [],
            });

            if (!savePath) {
                return { success: false, canceled: true };
            }

            // For now, copy the file directly (full trim/crop would need ffmpeg)
            sendExportProgress(35, "copying");
            await saveMediaSourceToPath(filePath, savePath);
            sendExportProgress(100, "done");
            console.log(`[ageofscreen] Exported ${mediaType} to:`, savePath);
            return { success: true, filePath: savePath };
        } catch (error) {
            console.error("[ageofscreen] Failed to export media:", error);
            return { success: false, error: (error as Error).message };
        }
    });
};

// --- App Lifecycle ---
app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-attach-webview', (event) => {
        event.preventDefault();
    });
});

app.whenReady().then(async () => {
    if (process.platform === "win32") {
        app.setAppUserModelId("com.ageofscreen.app");
    }
    // Install privacy filter before any windows are created
    installShieldRequestFilter();
    installMediaPermissionHandlers();
    protocol.handle('ageofscreen-media', async (request) => {
        try {
            const url = request.url;
            const filePath = fromMediaFileUrl(url);
            
            if (!isSupportedMediaFilePath(filePath)) {
                console.warn('[ageofscreen] Blocked unsupported media protocol request:', filePath);
                return new Response('Unsupported media file type', { status: 415 });
            }
            if (!isApprovedMediaPath(filePath)) {
                console.warn('[ageofscreen] Blocked unapproved media protocol request:', filePath);
                return new Response('Media file not approved', { status: 403 });
            }

            // Verify file exists
            try {
                const stats = await fs.promises.stat(filePath);
                if (!stats.isFile()) {
                    return new Response('Media file not found', { status: 404 });
                }
            } catch (_fsErr) {
                console.warn('[ageofscreen] Media file not found on disk:', filePath);
                return new Response('Media file not found', { status: 404 });
            }

            return createMediaFileResponse(request, filePath);
        } catch (error) {
            console.error('[ageofscreen] Failed to resolve ageofscreen-media request:', request.url, error);
            return new Response('Internal error', { status: 500 });
        }
    });

    registerIpcHandlers();
    cachedEntitlementState = await getEntitlementProvider().initialize();
    cachedEntitlementState = await getEntitlementProvider().restoreIfNeeded();
    broadcastLicenseState(cachedEntitlementState);
    await cleanupBrokenWindowsAutoLaunchRegistration();
    ensureWindowsAutoLaunchRegistration();
    await createWindowsStoreDesktopShortcut();
    await ensureWindowsPrintScreenPreference();
    registerCaptureShortcut();
    createAppTray();
    createTriggerWindow();

    const onboardingState = getOnboardingState();
    const launchedFromWindowsStartup = isWindowsAutoLaunch();
    if (!onboardingState.hasCompletedOnboarding && RELEASE_PROFILE.name !== "dev") {
        setTimeout(() => {
            createIntroWindow();
        }, 220);
    } else if (launchedFromWindowsStartup) {
        setTimeout(() => {
            restoreTriggerWindowIfEnabled(40);
        }, MENU_PREWARM_DELAY_MS);
    } else if (RELEASE_PROFILE.name !== "dev") {
        setTimeout(() => {
            openAgeofScreenLauncher();
        }, 280);
    } else {
        setTimeout(() => {
            createMenuWindow({ show: false, bypassReopenGuard: true });
        }, MENU_PREWARM_DELAY_MS);
    }

    if (shieldMode === "agent_local") {
        setTimeout(() => maybeAutoStartAgentRecording("app startup"), 250);
    }

    // Register Alt+Z for Auto-Zoom toggle (only if feature flag allows)
    if (FEATURES.ENABLE_AUTO_ZOOM_ADVANCED) {
        globalShortcut.register('Alt+Z', () => {
            isAutoZoomEnabled = !isAutoZoomEnabled;
            console.log('[ageofscreen] Auto-Zoom toggled:', isAutoZoomEnabled);

            if (recordingWidget && !recordingWidget.isDestroyed()) {
                recordingWidget.webContents.send('auto-zoom-status', isAutoZoomEnabled);
            }
        });
    }

    // Register Alt+M for Media Editor
    globalShortcut.register('Alt+M', () => {
        console.log('[ageofscreen] Alt+M pressed: Opening media editor');
        createVideoEditorWindow();
    });

    app.on("activate", () => {

        if (BrowserWindow.getAllWindows().length === 0) {
            createTriggerWindow();
        } else if (!menuWindow || menuWindow.isDestroyed()) {
            createMenuWindow({ show: false, bypassReopenGuard: true });
        }
    });
});

app.on("window-all-closed", () => {
    const hasActiveWindows = triggerWindow && !triggerWindow.isDestroyed();
    if (!hasActiveWindows && process.platform !== "darwin") {
        app.quit();
    }
});

app.on("will-quit", () => {
    try {
        clearPrintScreenRegistrationRetries();
        globalShortcut.unregisterAll();
    } catch (error) {
        console.warn("[ageofscreen] Failed to unregister global shortcuts on quit:", error);
    }
});


(app as any).on('child-process-gone', (event: any, details: any) => {
    if (details.type === 'GPU') {
        console.warn('[ageofscreen] GPU Process Exit:', details);
    }
});

console.log("[ageofscreen] Main process initialized");
