const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Secure storage using OS keychain
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');
const encryptedKeyPath = path.join(userDataPath, 'secure_key.dat');

function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (error) {
        console.error('Error loading config:', error);
    }
    return {
        apiKey: null,
        settings: {
            darkMode: false,
            diffHighlight: true,
            totalPolishes: 0,
            totalSpent: 0,
            selectedModel: 'gpt-4o-mini',
            selectedMode: 'standard',
            selectedDialect: 'US English',
            customPrompts: []
        }
    };
}

function saveConfig(config) {
    try {
        // Don't save API key in plain config
        const configToSave = { ...config, apiKey: null };
        fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving config:', error);
        return false;
    }
}

// Secure API key management
function saveApiKeySecurely(key) {
    try {
        if (!safeStorage.isEncryptionAvailable()) {
            console.warn('Encryption not available, falling back to plain storage');
            config.apiKey = key;
            return saveConfig(config);
        }
        
        const buffer = safeStorage.encryptString(key);
        fs.writeFileSync(encryptedKeyPath, buffer);
        return true;
    } catch (error) {
        console.error('Error saving API key:', error);
        return false;
    }
}

function loadApiKeySecurely() {
    try {
        if (!fs.existsSync(encryptedKeyPath)) {
            return null;
        }
        
        if (!safeStorage.isEncryptionAvailable()) {
            return config.apiKey || null;
        }
        
        const buffer = fs.readFileSync(encryptedKeyPath);
        return safeStorage.decryptString(buffer);
    } catch (error) {
        console.error('Error loading API key:', error);
        return null;
    }
}

function deleteApiKeySecurely() {
    try {
        if (fs.existsSync(encryptedKeyPath)) {
            fs.unlinkSync(encryptedKeyPath);
        }
        config.apiKey = null;
        return true;
    } catch (error) {
        console.error('Error deleting API key:', error);
        return false;
    }
}

let config = loadConfig();

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        title: 'ScholarDraft Pro',
        backgroundColor: '#f5f5f7'
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC Handlers
ipcMain.handle('get-api-key', () => {
    return loadApiKeySecurely();
});

ipcMain.handle('set-api-key', (event, key) => {
    const success = saveApiKeySecurely(key);
    return { success };
});

ipcMain.handle('delete-api-key', () => {
    const success = deleteApiKeySecurely();
    return { success };
});

ipcMain.handle('get-prompts', () => {
    try {
        const promptPath = path.join(__dirname, 'prompts.json');
        const prompts = JSON.parse(fs.readFileSync(promptPath, 'utf8'));
        
        // Add custom prompts from settings
        if (config.settings.customPrompts && config.settings.customPrompts.length > 0) {
            prompts.customModes = config.settings.customPrompts;
        }
        
        return prompts;
    } catch (error) {
        console.error('Error loading prompts:', error);
        return null;
    }
});

ipcMain.handle('get-settings', () => {
    return config.settings;
});

ipcMain.handle('save-settings', (event, settings) => {
    config.settings = settings;
    saveConfig(config);
    return { success: true };
});

// Custom prompt management
ipcMain.handle('save-custom-prompt', (event, prompt) => {
    if (!config.settings.customPrompts) {
        config.settings.customPrompts = [];
    }
    
    const index = config.settings.customPrompts.findIndex(p => p.id === prompt.id);
    if (index >= 0) {
        config.settings.customPrompts[index] = prompt;
    } else {
        config.settings.customPrompts.push(prompt);
    }
    
    saveConfig(config);
    return { success: true };
});

ipcMain.handle('delete-custom-prompt', (event, promptId) => {
    if (config.settings.customPrompts) {
        config.settings.customPrompts = config.settings.customPrompts.filter(p => p.id !== promptId);
        saveConfig(config);
    }
    return { success: true };
});

// Auto-save draft recovery
ipcMain.handle('save-draft-backup', (event, data) => {
    try {
        const backupPath = path.join(userDataPath, 'draft_backup.json');
        fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), 'utf8');
        return { success: true };
    } catch (error) {
        console.error('Error saving draft backup:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('load-draft-backup', () => {
    try {
        const backupPath = path.join(userDataPath, 'draft_backup.json');
        if (fs.existsSync(backupPath)) {
            const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
            return { success: true, data };
        }
        return { success: false, error: 'No backup found' };
    } catch (error) {
        console.error('Error loading draft backup:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('delete-draft-backup', () => {
    try {
        const backupPath = path.join(userDataPath, 'draft_backup.json');
        if (fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
        }
        return { success: true };
    } catch (error) {
        console.error('Error deleting draft backup:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Draft',
        filters: [
            { name: 'Text Files', extensions: ['txt', 'md'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        try {
            const content = fs.readFileSync(result.filePaths[0], 'utf8');
            return { success: true, content, filePath: result.filePaths[0] };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, canceled: true };
});

ipcMain.handle('save-file', async (event, content, suggestedPath) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Draft',
        defaultPath: suggestedPath || 'draft.txt',
        filters: [
            { name: 'Text Files', extensions: ['txt', 'md'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!result.canceled && result.filePath) {
        try {
            fs.writeFileSync(result.filePath, content, 'utf8');
            return { success: true, filePath: result.filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, canceled: true };
});

// Enhanced PDF export with academic formatting
ipcMain.handle('export-pdf', async (event, content, metadata) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export as PDF',
        defaultPath: 'polished-text.pdf',
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (!result.canceled && result.filePath) {
        try {
            let PDFDocument;
            
            try {
                PDFDocument = require('pdfkit');
            } catch (err) {
                return { 
                    success: false, 
                    error: 'PDFKit library not installed. Please run: npm install pdfkit' 
                };
            }
            
            const options = {
                margins: { top: 72, bottom: 72, left: 72, right: 72 },
                size: 'LETTER',
                bufferPages: true
            };
            
            // Apply formatting options if provided
            if (metadata && metadata.formatting) {
                if (metadata.formatting.doubleSpaced) {
                    options.lineGap = 6;
                }
            }
            
            const doc = new PDFDocument(options);
            const stream = fs.createWriteStream(result.filePath);
            doc.pipe(stream);
            
            // Add metadata
            if (metadata) {
                doc.info.Title = metadata.title || 'Polished Academic Text';
                doc.info.Author = metadata.author || '';
                doc.info.Subject = metadata.subject || '';
            }
            
            // Add title
            if (metadata && metadata.title) {
                doc.fontSize(18).font('Helvetica-Bold').text(metadata.title, { align: 'center' });
                doc.moveDown(2);
            }
            
            // Select font based on metadata
            let bodyFont = 'Times-Roman';
            if (metadata && metadata.formatting && metadata.formatting.font) {
                const fontMap = {
                    'times': 'Times-Roman',
                    'arial': 'Helvetica',
                    'calibri': 'Helvetica'
                };
                bodyFont = fontMap[metadata.formatting.font] || 'Times-Roman';
            }
            
            // Add content with line numbers if requested
            doc.fontSize(12).font(bodyFont);
            
            const paragraphs = content.split(/\n\n+/);
            const showLineNumbers = metadata && metadata.formatting && metadata.formatting.lineNumbers;
            
            if (showLineNumbers) {
                let lineNumber = 1;
                paragraphs.forEach((para, index) => {
                    if (para.trim()) {
                        const lines = para.trim().split('\n');
                        lines.forEach(line => {
                            const x = doc.x;
                            doc.text(`${lineNumber}`, 20, doc.y, { width: 30, align: 'right', continued: true });
                            doc.text(`  ${line}`, x, doc.y, { align: 'justify', lineGap: metadata.formatting.doubleSpaced ? 6 : 2 });
                            lineNumber++;
                        });
                        if (index < paragraphs.length - 1) {
                            doc.moveDown();
                        }
                    }
                });
            } else {
                paragraphs.forEach((para, index) => {
                    if (para.trim()) {
                        doc.text(para.trim(), { 
                            align: 'justify', 
                            lineGap: metadata && metadata.formatting && metadata.formatting.doubleSpaced ? 6 : 2 
                        });
                        if (index < paragraphs.length - 1) {
                            doc.moveDown();
                        }
                    }
                });
            }
            
            // Add page numbers
            const pages = doc.bufferedPageRange();
            for (let i = 0; i < pages.count; i++) {
                doc.switchToPage(i);
                doc.fontSize(10).text(
                    `Page ${i + 1} of ${pages.count}`,
                    0,
                    doc.page.height - 50,
                    { align: 'center' }
                );
            }
            
            doc.end();
            
            return new Promise((resolve) => {
                stream.on('finish', () => {
                    resolve({ success: true, filePath: result.filePath });
                });
                stream.on('error', (error) => {
                    resolve({ success: false, error: error.message });
                });
            });
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, canceled: true };
});

// Export to DOCX
ipcMain.handle('export-docx', async (event, content, metadata) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export as DOCX',
        defaultPath: 'polished-text.docx',
        filters: [{ name: 'Word Documents', extensions: ['docx'] }]
    });

    if (!result.canceled && result.filePath) {
        try {
            let Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType;
            
            try {
                const docx = require('docx');
                Document = docx.Document;
                Packer = docx.Packer;
                Paragraph = docx.Paragraph;
                TextRun = docx.TextRun;
                HeadingLevel = docx.HeadingLevel;
                AlignmentType = docx.AlignmentType;
            } catch (err) {
                return { 
                    success: false, 
                    error: 'DOCX library not installed. Please run: npm install docx' 
                };
            }
            
            const children = [];
            
            // Add title if provided
            if (metadata && metadata.title) {
                children.push(
                    new Paragraph({
                        text: metadata.title,
                        heading: HeadingLevel.HEADING_1,
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 400 }
                    })
                );
            }
            
            // Add content paragraphs
            const paragraphs = content.split(/\n\n+/);
            paragraphs.forEach(para => {
                if (para.trim()) {
                    children.push(
                        new Paragraph({
                            children: [new TextRun(para.trim())],
                            spacing: { after: 200, line: 360 },
                            alignment: AlignmentType.JUSTIFIED
                        })
                    );
                }
            });
            
            const doc = new Document({
                sections: [{
                    properties: {
                        page: {
                            margin: {
                                top: 1440,
                                right: 1440,
                                bottom: 1440,
                                left: 1440
                            }
                        }
                    },
                    children: children
                }]
            });
            
            const buffer = await Packer.toBuffer(doc);
            fs.writeFileSync(result.filePath, buffer);
            
            return { success: true, filePath: result.filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, canceled: true };
});

// Export to JSON
ipcMain.handle('export-json', async (event, data) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export as JSON',
        defaultPath: 'polished-text.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (!result.canceled && result.filePath) {
        try {
            fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8');
            return { success: true, filePath: result.filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, canceled: true };
});
