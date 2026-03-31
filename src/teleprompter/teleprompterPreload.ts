import { contextBridge, ipcRenderer } from "electron";

const SEND_CHANNELS = new Set([
    "teleprompter-close",
    "teleprompter-minimize",
]);

const ON_CHANNELS = new Set([
    "teleprompter-set-text",
    "teleprompter-set-speed",
    "teleprompter-play",
    "teleprompter-pause",
    "teleprompter-reset",
]);

contextBridge.exposeInMainWorld("teleprompterAPI", {
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
});

