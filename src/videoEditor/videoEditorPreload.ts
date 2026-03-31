import { contextBridge, ipcRenderer } from "electron";
import type { EntitlementState, PurchaseProResult, UpgradeSource } from "../shared/licensing";

const SEND_CHANNELS = new Set([
    "video-editor-ready",
    "video-editor-media-consumed",
    "video-editor-maximize",
    "video-editor-minimize",
    "video-editor-close",
]);

const ON_CHANNELS = new Set([
    "load-video",
    "update-background-color",
    "apply-agent-summary",
]);

const INVOKE_CHANNELS = new Set([
    "open-media-file",
    "delete-temp-video",
    "export-video",
    "export-media",
    "auto-polish",
    "auto-polish-plan",
    "get-pending-editor-media",
    "license:get-state",
    "license:refresh",
    "license:purchase-pro",
]);

contextBridge.exposeInMainWorld("videoEditorAPI", {
    send: (channel: string, ...args: any[]): void => {
        if (SEND_CHANNELS.has(channel)) {
            ipcRenderer.send(channel, ...args);
        }
    },
    on: (channel: string, callback: (...args: any[]) => void): (() => void) => {
        if (!ON_CHANNELS.has(channel)) {
            return (): void => { };
        }
        const listener = (_event: any, ...args: any[]) => callback(...args);
        ipcRenderer.on(channel, listener);
        return (): void => { ipcRenderer.removeListener(channel, listener); };
    },
    invoke: (channel: string, ...args: any[]): Promise<any> => {
        if (!INVOKE_CHANNELS.has(channel)) {
            return Promise.reject(new Error(`Blocked IPC channel: ${channel}`));
        }
        return ipcRenderer.invoke(channel, ...args);
    },
    license: {
        getState: (): Promise<EntitlementState> => ipcRenderer.invoke("license:get-state"),
        refresh: (): Promise<EntitlementState> => ipcRenderer.invoke("license:refresh"),
        purchasePro: (source?: UpgradeSource): Promise<PurchaseProResult> => ipcRenderer.invoke("license:purchase-pro", source),
        onChanged: (callback: (state: EntitlementState) => void) => {
            const listener = (_event: any, state: EntitlementState) => callback(state);
            ipcRenderer.on("license:state-changed", listener);
            return (): void => { ipcRenderer.removeListener("license:state-changed", listener); };
        },
    },
});

