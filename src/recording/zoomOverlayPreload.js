const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zoomOverlayAPI', {
    onMouseUpdate: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('mouse-update', listener);
        return () => ipcRenderer.removeListener('mouse-update', listener);
    },
});
