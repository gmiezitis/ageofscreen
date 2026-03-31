import { contextBridge, ipcRenderer } from 'electron';

// Expose IPC methods to the drawing overlay renderer
contextBridge.exposeInMainWorld('drawingAPI', {
    // Send IPC messages
    send: (channel: string, ...args: any[]) => {
        const validChannels = [
            'toggle-drawing-overlay',
            'forward-scroll',
            'drawing-stroke-update', // New channel for stroke data
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, ...args);
        }
    },

    // Listen for drawing color changes
    onColorChange: (callback: (color: string) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, color: string) => callback(color);
        ipcRenderer.on('set-drawing-color', listener);
        return () => ipcRenderer.removeListener('set-drawing-color', listener);
    },
});

console.log('[DrawingOverlayPreload] Preload script loaded');

