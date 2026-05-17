import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import { TimerWidgetPayload } from "../focus/types";
import type { AgentJob, AgentJobResult, ShieldMode, ShieldState, AgentRecordingRequest } from "../shared/agent";
import type {
    EntitlementState,
    OnboardingState,
    PurchaseProResult,
    UpgradeSource,
} from "../shared/licensing";
import type { MenuOpenedPayload } from "./menuLifecycle";

let pendingMenuOpenedPayload: MenuOpenedPayload | null = null;

ipcRenderer.on("menu-opened", (_event: IpcRendererEvent, payload: MenuOpenedPayload) => {
    pendingMenuOpenedPayload = payload;
});

export interface IMenuElectronAPI {
    hideMenu: () => void;
    consumeMenuOpened: () => MenuOpenedPayload | null;
    triggerSnip: () => void;
    triggerFullscreen: () => void;
    triggerWindow: () => void;
    triggerFocus: () => void;
    triggerRecord: () => void;
    toggleCamera: (shape?: string, size?: number, name?: string, borderColor?: string, borderWidth?: number, glowEnabled?: boolean, audioMeterEnabled?: boolean) => void;
    showTeleprompter: (text: string, speed: number) => void;
    timerWidget: {
        show: (payload: TimerWidgetPayload) => void;
        hide: () => void;
        onStopRequested: (callback: () => void) => () => void;
    };
    focusBlocking: {
        startMonitoring: (blockedItems: string[]) => void;
        stopMonitoring: () => void;
    };
    getScreenSources: () => Promise<any[]>;
    getWindowSources: () => Promise<any[]>;
    getWindowBounds: (windowId: string) => Promise<{ x: number, y: number, width: number, height: number } | null>;
    showRecordingWidget: (config?: { liveMagnifierEnabled?: boolean; captureCursorData?: boolean }) => void;
    hideRecordingWidget: () => void;
    saveVideo: (buffer: ArrayBuffer) => Promise<any>;
    saveTempVideo: (buffer: ArrayBuffer) => Promise<{ filePath?: string, error?: string }>;
    makeWidgetCaptureInvisible: () => void;
    showVideoEditor: (videoDataUrl: string, name?: string) => void;
    openMediaEditor: () => void;
    openMediaFile: (type: 'video' | 'image' | 'audio') => Promise<{ filePath: string, fileName: string } | null>;
    exportMedia: (filePath: string, mediaType: string, trimData: any) => Promise<any>;

    onMenuOpened: (callback: (payload: MenuOpenedPayload) => void) => () => void;
    onStartRecordingRequested: (callback: (config?: AgentRecordingRequest) => void) => () => void;
    onStopRecordingRequested: (callback: () => void) => () => void;
    onWidgetStopRecording: (callback: () => void) => () => void;
    sendRecordingStatus: (status: boolean) => void;
    sendRecordingProgress: (progress: number) => void;
    sendCaptureHealth: (metrics: { droppedFrames: number; bufferErrors: number; effectiveFps: number | null; status: string }) => void;
    setEditAfterRecording: (enabled: boolean) => void;
    onZoomToPoint: (callback: (data: { x: number; y: number; active: boolean }) => void) => () => void;
    onWebcamUpdate: (callback: (data: any) => void) => () => void;
    onDrawingStrokeUpdate: (callback: (data: { strokes: any[]; screenWidth: number; screenHeight: number }) => void) => () => void;
    onEditAfterRecordingChanged: (callback: (enabled: boolean) => void) => () => void;
    shield: {
        getState: () => Promise<ShieldState>;
        setMode: (mode: ShieldMode) => Promise<ShieldState>;
        onBlocked: (callback: (data: { url: string; hostname?: string }) => void) => () => void;
        onState: (callback: (data: ShieldState) => void) => () => void;
    };
    license: {
        getState: () => Promise<EntitlementState>;
        refresh: () => Promise<EntitlementState>;
        purchasePro: (source?: UpgradeSource) => Promise<PurchaseProResult>;
        onChanged: (callback: (state: EntitlementState) => void) => () => void;
    };
    settings: {
        getOnboardingState: () => Promise<OnboardingState>;
        completeOnboarding: () => Promise<OnboardingState>;
        onChanged: (callback: (state: OnboardingState) => void) => () => void;
    };
    agent: {
        runJob: (job: AgentJob) => Promise<AgentJobResult>;
    };
}

const menuAPI: IMenuElectronAPI = {
    hideMenu: () => ipcRenderer.send("menu-hide"),
    consumeMenuOpened: () => {
        const payload = pendingMenuOpenedPayload;
        pendingMenuOpenedPayload = null;
        return payload;
    },
    triggerSnip: () => ipcRenderer.send("menu-snip"),
    triggerFullscreen: () => ipcRenderer.send("menu-fullscreen"),
    triggerWindow: () => ipcRenderer.send("menu-window"),
    triggerFocus: () => ipcRenderer.send("menu-focus"),
    triggerRecord: () => ipcRenderer.send("menu-record"),
    toggleCamera: (shape?: string, size?: number, name?: string, borderColor?: string, borderWidth?: number, glowEnabled?: boolean, audioMeterEnabled?: boolean) => ipcRenderer.send("menu-camera", shape, size, name, borderColor, borderWidth, glowEnabled, audioMeterEnabled),
    showTeleprompter: (text: string, speed: number) => ipcRenderer.send("show-teleprompter", text, speed),
    timerWidget: {
        show: (payload: TimerWidgetPayload) => ipcRenderer.send("timer-widget-show", payload),
        hide: () => ipcRenderer.send("timer-widget-hide"),
        onStopRequested: (callback: () => void) => {
            const channel = "timer-widget-stop-requested";
            const listener = () => callback();
            ipcRenderer.on(channel, listener);
            return () => {
                ipcRenderer.removeListener(channel, listener);
            };
        }
    },
    focusBlocking: {
        startMonitoring: (blockedItems: string[]) => ipcRenderer.send("focus-blocking-start", blockedItems),
        stopMonitoring: () => ipcRenderer.send("focus-blocking-stop"),
    },
    getScreenSources: () => ipcRenderer.invoke("get-screen-sources"),
    getWindowSources: () => ipcRenderer.invoke("get-window-sources"),
    getWindowBounds: (windowId: string) => ipcRenderer.invoke("get-window-bounds", windowId),
    showRecordingWidget: (config?: { liveMagnifierEnabled?: boolean; captureCursorData?: boolean }) => ipcRenderer.send("show-recording-widget", config),
    hideRecordingWidget: () => ipcRenderer.send("hide-recording-widget"),
    saveVideo: (buffer: ArrayBuffer) => ipcRenderer.invoke("save-video", buffer),
    saveTempVideo: (buffer: ArrayBuffer) => ipcRenderer.invoke("save-temp-video", buffer),
    makeWidgetCaptureInvisible: () => ipcRenderer.send("make-widget-capture-invisible"),
    showVideoEditor: (videoDataUrl: string, name?: string) => ipcRenderer.send("show-video-editor", videoDataUrl, name),
    openMediaEditor: () => ipcRenderer.send("open-media-editor"),
    openMediaFile: (type: 'video' | 'image' | 'audio') => ipcRenderer.invoke("open-media-file", type),
    exportMedia: (filePath: string, mediaType: string, trimData: any) => ipcRenderer.invoke("export-media", filePath, mediaType, trimData),

    onMenuOpened: (callback: (payload: MenuOpenedPayload) => void) => {
        const listener = (_event: IpcRendererEvent, payload: MenuOpenedPayload) => {
            pendingMenuOpenedPayload = null;
            callback(payload);
        };
        ipcRenderer.on("menu-opened", listener);
        return () => ipcRenderer.removeListener("menu-opened", listener);
    },
    onStartRecordingRequested: (callback: (config?: AgentRecordingRequest) => void) => {
        const listener = (_event: IpcRendererEvent, config?: AgentRecordingRequest) => callback(config);
        ipcRenderer.on("start-recording-requested", listener);
        return () => ipcRenderer.removeListener("start-recording-requested", listener);
    },
    onStopRecordingRequested: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on("stop-recording-requested", listener);
        return () => ipcRenderer.removeListener("stop-recording-requested", listener);
    },
    onWidgetStopRecording: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on("stop-recording-requested", listener);
        return () => ipcRenderer.removeListener("stop-recording-requested", listener);
    },
    sendRecordingStatus: (status: boolean) => ipcRenderer.send("recording-status", status),
    sendRecordingProgress: (progress: number) => ipcRenderer.send("recording-progress", progress),
    sendCaptureHealth: (metrics: { droppedFrames: number; bufferErrors: number; effectiveFps: number | null; status: string }) =>
        ipcRenderer.send("capture-health-update", metrics),
    setEditAfterRecording: (enabled: boolean) => ipcRenderer.send("set-edit-after-recording", enabled),
    onZoomToPoint: (callback: (data: { x: number; y: number; active: boolean }) => void) => {
        const listener = (_event: any, data: { x: number; y: number; active: boolean }) => callback(data);
        ipcRenderer.on("zoom-to-point", listener);
        return () => ipcRenderer.removeListener("zoom-to-point", listener);
    },
    onWebcamUpdate: (callback: (data: any) => void) => {
        const listener = (_event: any, data: any) => callback(data);
        ipcRenderer.on("webcam-update", listener);
        return () => ipcRenderer.removeListener("webcam-update", listener);
    },
    onDrawingStrokeUpdate: (callback: (data: { strokes: any[]; screenWidth: number; screenHeight: number }) => void) => {
        const listener = (_event: any, data: any) => callback(data);
        ipcRenderer.on("drawing-stroke-update", listener);
        return () => ipcRenderer.removeListener("drawing-stroke-update", listener);
    },
    onEditAfterRecordingChanged: (callback: (enabled: boolean) => void) => {
        const listener = (_event: any, enabled: boolean) => callback(enabled);
        ipcRenderer.on("edit-after-recording-changed", listener);
        return () => ipcRenderer.removeListener("edit-after-recording-changed", listener);
    },
    shield: {
        getState: () => ipcRenderer.invoke("shield:get-state"),
        setMode: (mode: ShieldMode) => ipcRenderer.invoke("shield:set-mode", mode),
        onBlocked: (callback: (data: { url: string; hostname?: string }) => void) => {
            ipcRenderer.send("shield:subscribe");
            const listener = (_event: IpcRendererEvent, data: { url: string; hostname?: string }) => callback(data);
            ipcRenderer.on("shield:blocked", listener);
            return () => ipcRenderer.removeListener("shield:blocked", listener);
        },
        onState: (callback: (data: ShieldState) => void) => {
            ipcRenderer.send("shield:subscribe");
            const listener = (_event: IpcRendererEvent, data: ShieldState) => callback(data);
            ipcRenderer.on("shield:state", listener);
            return () => ipcRenderer.removeListener("shield:state", listener);
        }
    },
    license: {
        getState: () => ipcRenderer.invoke("license:get-state"),
        refresh: () => ipcRenderer.invoke("license:refresh"),
        purchasePro: (source?: UpgradeSource) => ipcRenderer.invoke("license:purchase-pro", source),
        onChanged: (callback: (state: EntitlementState) => void) => {
            const listener = (_event: IpcRendererEvent, state: EntitlementState) => callback(state);
            ipcRenderer.on("license:state-changed", listener);
            return () => ipcRenderer.removeListener("license:state-changed", listener);
        },
    },
    settings: {
        getOnboardingState: () => ipcRenderer.invoke("settings:get-onboarding-state"),
        completeOnboarding: () => ipcRenderer.invoke("settings:complete-onboarding"),
        onChanged: (callback: (state: OnboardingState) => void) => {
            const listener = (_event: IpcRendererEvent, state: OnboardingState) => callback(state);
            ipcRenderer.on("settings:onboarding-state-changed", listener);
            return () => ipcRenderer.removeListener("settings:onboarding-state-changed", listener);
        },
    },
    agent: {
        runJob: (job: AgentJob) => ipcRenderer.invoke("agent:run-job", job),
    }
};

contextBridge.exposeInMainWorld("menuAPI", menuAPI);
contextBridge.exposeInMainWorld("electronAPI", menuAPI);

console.log("ageofscreen Menu Preload Script Loaded");
