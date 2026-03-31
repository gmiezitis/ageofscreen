import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { TimerWidgetPayload, TimerWidgetAlert } from "./types";

interface ITimerWidgetPreloadAPI {
    requestStop: () => void;
    onData: (callback: (payload: TimerWidgetPayload) => void) => () => void;
    onAlert: (callback: (alert: TimerWidgetAlert) => void) => () => void;
}

const timerWidgetAPI: ITimerWidgetPreloadAPI = {
    requestStop: () => ipcRenderer.send("focus-widget-stop-clicked"),
    onData: (callback) => {
        const listener = (_event: IpcRendererEvent, payload: TimerWidgetPayload) => {
            callback(payload);
        };
        ipcRenderer.on("focus-widget-data", listener);
        return () => {
            ipcRenderer.removeListener("focus-widget-data", listener);
        };
    },
    onAlert: (callback) => {
        const listener = (_event: IpcRendererEvent, alert: TimerWidgetAlert) => {
            callback(alert);
        };
        ipcRenderer.on("focus-widget-alert", listener);
        return () => {
            ipcRenderer.removeListener("focus-widget-alert", listener);
        };
    },
};

contextBridge.exposeInMainWorld("timerWidgetAPI", timerWidgetAPI);
