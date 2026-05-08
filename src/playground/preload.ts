import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

export type ScreenPlaygroundInitPayload = {
    screenshotDataUrl: string;
    display: {
        width: number;
        height: number;
        scaleFactor: number;
    };
};

export interface ScreenPlaygroundAPI {
    onInit: (callback: (payload: ScreenPlaygroundInitPayload) => void) => () => void;
    close: () => void;
}

const api: ScreenPlaygroundAPI = {
    onInit: (callback) => {
        const listener = (_event: IpcRendererEvent, payload: ScreenPlaygroundInitPayload) => callback(payload);
        ipcRenderer.on("screen-playground:init", listener);
        return () => ipcRenderer.removeListener("screen-playground:init", listener);
    },
    close: () => ipcRenderer.send("screen-playground:close"),
};

contextBridge.exposeInMainWorld("screenPlaygroundAPI", api);
