import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

contextBridge.exposeInMainWorld("captureAPI", {
    // Send selection results (coordinates or cancellation) to the main process
    sendSelectionResult: (result: {
        cancelled: boolean;
        bounds?: { x: number; y: number; width: number; height: number };
        windowId?: string;
    }) => {
        ipcRenderer.send("capture-result", result);
    },
    // Function to register a callback for receiving screenshot data
    onScreenshotData: (
        callback: (event: IpcRendererEvent, dataUrl: string) => void
    ) => {
        const listener = (event: IpcRendererEvent, dataUrl: string) =>
            callback(event, dataUrl);
        ipcRenderer.on("screenshot-data", listener);
        // Return cleanup function
        return () => {
            ipcRenderer.removeListener("screenshot-data", listener);
        };
    },
    // NEW: Function to register a callback for receiving the capture mode
    onCaptureMode: (
        callback: (event: IpcRendererEvent, mode: "region" | "window") => void
    ) => {
        const listener = (event: IpcRendererEvent, mode: "region" | "window") =>
            callback(event, mode);
        ipcRenderer.on("capture-mode", listener);
        return () => {
            ipcRenderer.removeListener("capture-mode", listener);
        };
    },
    // NEW: Invoke getting window sources
    getWindowSources: () => ipcRenderer.invoke("get-window-sources"),
});
