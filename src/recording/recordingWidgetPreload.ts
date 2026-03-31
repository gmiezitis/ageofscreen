/**
 * Recording Widget Preload Script
 * 
 * Provides secure IPC bridge for the recording widget.
 * Replaces direct nodeIntegration access for better security.
 */

import { contextBridge, ipcRenderer } from 'electron';

// Expose a secure API to the recording widget renderer
contextBridge.exposeInMainWorld('recordingWidgetAPI', {
    getFeatureFlags: () => ipcRenderer.invoke('get-feature-flags'),
    // Send IPC messages to main process
    showWebcam: () => {
        console.log('[RecordingWidgetPreload] Sending menu-camera');
        ipcRenderer.send('menu-camera');
    },

    toggleDrawingOverlay: (enabled: boolean) => {
        console.log('[RecordingWidgetPreload] Sending toggle-drawing-overlay:', enabled);
        ipcRenderer.send('toggle-drawing-overlay', enabled);
    },

    setDrawingColor: (color: string) => {
        console.log('[RecordingWidgetPreload] Sending set-drawing-color:', color);
        ipcRenderer.send('set-drawing-color', color);
    },

    stopRecording: () => {
        console.log('[RecordingWidgetPreload] Sending widget-stop-recording');
        ipcRenderer.send('widget-stop-recording');
    },

    toggleTeleprompter: () => {
        console.log('[RecordingWidgetPreload] Sending toggle-teleprompter-request');
        ipcRenderer.send('toggle-teleprompter-request');
    },

    toggleZoom: () => {
        console.log('[RecordingWidgetPreload] Sending toggle-camera-zoom');
        ipcRenderer.send('toggle-camera-zoom');
    },

    sendHoverState: (isHovered: boolean) => {
        ipcRenderer.send('widget-hover', isHovered);
    },

    setEditAfterRecording: (enabled: boolean) => {
        ipcRenderer.send('set-edit-after-recording', enabled);
    },


    // Listen for external commands if needed
    onDrawingToggled: (callback: (enabled: boolean) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, enabled: boolean) => callback(enabled);
        ipcRenderer.on('drawing-toggled', listener);
        return () => ipcRenderer.removeListener('drawing-toggled', listener);
    },

    onTimerSync: (callback: (startTime: number) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, startTime: number) => callback(startTime);
        ipcRenderer.on('timer-sync', listener);
        return () => ipcRenderer.removeListener('timer-sync', listener);
    },

    onZoomToPoint: (callback: (data: { x: number; y: number; active: boolean }) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, data: { x: number; y: number; active: boolean }) => callback(data);
        ipcRenderer.on('zoom-to-point', listener);
        return () => ipcRenderer.removeListener('zoom-to-point', listener);
    },

    onAutoZoomStatus: (callback: (enabled: boolean) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, enabled: boolean) => callback(enabled);
        ipcRenderer.on('auto-zoom-status', listener);
        return () => ipcRenderer.removeListener('auto-zoom-status', listener);
    },
    onRecordingProgress: (callback: (progress: number) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, progress: number) => callback(progress);
        ipcRenderer.on('recording-progress', listener);
        return () => ipcRenderer.removeListener('recording-progress', listener);
    },

    setWindowBackground: (color: string) => {
        console.log('[RecordingWidgetPreload] Sending set-window-background:', color);
        ipcRenderer.send('set-window-background', color);
    },

    onRecordingSettings: (callback: (config: { recordingMode: string; windowBackground?: string }) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, config: { recordingMode: string; windowBackground?: string }) => callback(config);
        ipcRenderer.on('recording-settings', listener);
        // Request initial settings
        ipcRenderer.send('get-recording-settings');
        return () => ipcRenderer.removeListener('recording-settings', listener);
    },

    onCaptureHealth: (callback: (metrics: { droppedFrames: number; bufferErrors: number; effectiveFps: number | null; status: string }) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, metrics: { droppedFrames: number; bufferErrors: number; effectiveFps: number | null; status: string }) => callback(metrics);
        ipcRenderer.on('capture-health', listener);
        return () => ipcRenderer.removeListener('capture-health', listener);
    },
    onSourceStatus: (callback: (status: { screen: boolean; camera: boolean; mic: boolean }) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, status: { screen: boolean; camera: boolean; mic: boolean }) => callback(status);
        ipcRenderer.on('source-status', listener);
        return () => ipcRenderer.removeListener('source-status', listener);
    },
});

console.log('[RecordingWidgetPreload] Preload script loaded successfully');
