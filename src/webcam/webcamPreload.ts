import { contextBridge, ipcRenderer } from "electron";

const ON_CHANNELS = new Set([
    "recording-status",
    "recording-progress",
    "update-shape",
    "update-border-color",
    "update-border-width",
    "update-glow-enabled",
    "update-presenter-name",
    "update-mic-status",
    "update-audio-meter-visibility",
    "drawing-status",
    "stop-stream",
    "window-visibility",
]);

const SEND_CHANNELS = new Set([
    "webcam-controls-hover",
    "webcam-resize-start",
    "webcam-resize-absolute"
]);

contextBridge.exposeInMainWorld("webcamAPI", {
    on: (channel: string, callback: (...args: any[]) => void): (() => void) => {
        if (!ON_CHANNELS.has(channel)) {
            return (): void => { };
        }
        const listener = (_event: any, ...args: any[]) => callback(...args);
        ipcRenderer.on(channel, listener);
        return (): void => { ipcRenderer.removeListener(channel, listener); };
    },
    resizeStart: (screenX: number, screenY: number): void => {
        ipcRenderer.send('webcam-resize-start', { screenX, screenY });
    },
    resizeWindowAbsolute: (screenX: number, screenY: number, edge: string): void => {
        ipcRenderer.send('webcam-resize-absolute', { screenX, screenY, edge });
    },
    send: (channel: string, ...args: any[]): void => {
        if (SEND_CHANNELS.has(channel)) {
            ipcRenderer.send(channel, ...args);
        }
    },
});
