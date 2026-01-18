const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    getApiKey: () => ipcRenderer.invoke('get-api-key'),
    setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
    deleteApiKey: () => ipcRenderer.invoke('delete-api-key'),
    getPrompts: () => ipcRenderer.invoke('get-prompts'),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    saveCustomPrompt: (prompt) => ipcRenderer.invoke('save-custom-prompt', prompt),
    deleteCustomPrompt: (promptId) => ipcRenderer.invoke('delete-custom-prompt', promptId),
    saveDraftBackup: (data) => ipcRenderer.invoke('save-draft-backup', data),
    loadDraftBackup: () => ipcRenderer.invoke('load-draft-backup'),
    deleteDraftBackup: () => ipcRenderer.invoke('delete-draft-backup'),
    openFile: () => ipcRenderer.invoke('open-file'),
    saveFile: (content, path) => ipcRenderer.invoke('save-file', content, path),
    exportPDF: (content, metadata) => ipcRenderer.invoke('export-pdf', content, metadata),
    exportDOCX: (content, metadata) => ipcRenderer.invoke('export-docx', content, metadata),
    exportJSON: (data) => ipcRenderer.invoke('export-json', data)
});
