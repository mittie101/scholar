const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    getApiKey: () => ipcRenderer.invoke('get-api-key'),
    setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
    deleteApiKey: () => ipcRenderer.invoke('delete-api-key'),
    getPrompts: () => ipcRenderer.invoke('get-prompts'),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    openFile: () => ipcRenderer.invoke('open-file'),
    saveFile: (content, path) => ipcRenderer.invoke('save-file', content, path),
    exportPDF: (content, metadata) => ipcRenderer.invoke('export-pdf', content, metadata),
    exportDOCX: (content, metadata) => ipcRenderer.invoke('export-docx', content, metadata),
    exportJSON: (data) => ipcRenderer.invoke('export-json', data)
});
