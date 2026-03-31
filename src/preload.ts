import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type {
    CaptureShortcutPreference,
    EntitlementState,
    OnboardingState,
    PurchaseProResult,
    UpgradeSource,
} from "./shared/licensing";

contextBridge.exposeInMainWorld("electronAPI", {
    onCaptureComplete: (callback: (dataUrl: string) => void) => {
        const listener = (_event: IpcRendererEvent, dataUrl: string) => callback(dataUrl);
        ipcRenderer.on("capture-complete", listener);
        return () => {
            ipcRenderer.removeListener("capture-complete", listener);
        };
    },
    onCaptureData: (callback: (event: any, data: any) => void) => {
        const listener = (event: IpcRendererEvent, data: any) => callback(event, data);
        ipcRenderer.on("capture-data", listener);
        return () => {
            ipcRenderer.removeListener("capture-data", listener);
        };
    },
    invokeCapture: (type: string) => ipcRenderer.invoke("invoke-capture", type),
    saveImageAs: (dataUrl: string) => ipcRenderer.invoke("save-image-as", dataUrl),
    importImage: () => ipcRenderer.invoke("import-image"),
    importRandomImage: () => ipcRenderer.invoke("import-random-image"),
    focusMainWindow: () => ipcRenderer.send("focus-main-window"),
    closeMainWindow: () => ipcRenderer.send("close-main-window"),

    // Recording APIs
    getScreenSources: () => ipcRenderer.invoke("get-screen-sources"),
    getWindowSources: () => ipcRenderer.invoke("get-window-sources"),
    getWindowBounds: (windowId: string) => ipcRenderer.invoke("get-window-bounds", windowId),
    showRecordingWidget: (config?: { liveMagnifierEnabled?: boolean; captureCursorData?: boolean; bounds?: { x: number; y: number; width: number; height: number } }) =>
        ipcRenderer.send("show-recording-widget", config),
    hideRecordingWidget: () => ipcRenderer.send("hide-recording-widget"),
    makeWidgetCaptureInvisible: () => ipcRenderer.send("make-widget-capture-invisible"),
    saveVideo: (buffer: ArrayBuffer) => ipcRenderer.invoke("save-video", buffer),
    saveTempVideo: (buffer: ArrayBuffer) => ipcRenderer.invoke("save-temp-video", buffer),
    deleteTempVideo: (filePath: string) => ipcRenderer.invoke("delete-temp-video", filePath),
    showVideoEditor: (videoDataUrl: string, name?: string) => ipcRenderer.send("show-video-editor", videoDataUrl, name),

    setCursorReplacementSafe: (safe: boolean) => ipcRenderer.send("recording-cursor-replacement-safe", safe),
    sendRecordingStatus: (status: boolean) => ipcRenderer.send("recording-status", status),
    sendRecordingProgress: (progress: number) => ipcRenderer.send("recording-progress", progress),
    onWidgetStopRecording: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on("stop-recording-requested", listener);
        return () => ipcRenderer.removeListener("stop-recording-requested", listener);
    },
    onWebcamUpdate: (callback: (data: any) => void) => {
        const listener = (_event: any, data: any) => callback(data);
        ipcRenderer.on("webcam-update", listener);
        return () => ipcRenderer.removeListener("webcam-update", listener);
    },
    onTypingZoomUpdate: (callback: (state: { isZoomed: boolean; x: number; y: number; changed: boolean }) => void) => {
        const listener = (_event: any, state: { isZoomed: boolean; x: number; y: number; changed: boolean }) => callback(state);
        ipcRenderer.on("typing-zoom-update", listener);
        return () => ipcRenderer.removeListener("typing-zoom-update", listener);
    },
    requestWebcamBroadcast: () => ipcRenderer.send("request-webcam-broadcast"),
    hideWebcamWindow: () => ipcRenderer.send("webcam-hide-camera"),
    showWebcamWindow: () => ipcRenderer.send("webcam-show-camera"),
    sendSourceStatus: (status: { screen: boolean; camera: boolean; mic: boolean }) => ipcRenderer.send("send-source-status", status),
    setEditAfterRecording: (enabled: boolean) => ipcRenderer.send("set-edit-after-recording", enabled),
    license: {
        getState: (): Promise<EntitlementState> => ipcRenderer.invoke("license:get-state"),
        refresh: (): Promise<EntitlementState> => ipcRenderer.invoke("license:refresh"),
        purchasePro: (source?: UpgradeSource): Promise<PurchaseProResult> => ipcRenderer.invoke("license:purchase-pro", source),
        onChanged: (callback: (state: EntitlementState) => void) => {
            const listener = (_event: IpcRendererEvent, state: EntitlementState) => callback(state);
            ipcRenderer.on("license:state-changed", listener);
            return () => ipcRenderer.removeListener("license:state-changed", listener);
        },
    },
    settings: {
        getOnboardingState: (): Promise<OnboardingState> => ipcRenderer.invoke("settings:get-onboarding-state"),
        completeOnboarding: (): Promise<OnboardingState> => ipcRenderer.invoke("settings:complete-onboarding"),
        setCaptureShortcut: (preference: CaptureShortcutPreference): Promise<OnboardingState> =>
            ipcRenderer.invoke("settings:set-capture-shortcut", preference),
    },
});
