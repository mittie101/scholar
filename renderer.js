// Global state
let apiKey = null;
let config = null;
let settings = null;
let currentFile = null;
let originalInput = '';

// Initialize app
async function init() {
    try {
        [apiKey, config, settings] = await Promise.all([
            window.electron.getApiKey(),
            window.electron.getPrompts(),
            window.electron.getSettings()
        ]);
        
        if (config) {
            populateModeSelector();
            updateModeDescription();
        }
        
        if (settings) {
            applySettings();
        }
        
        updateApiStatus();
        setupEventListeners();
        updateWordCounts();
        updateCostEstimate();
    } catch (error) {
        console.error('Init error:', error);
        alert('Error initializing application');
    }
}

// Populate mode selector from config
function populateModeSelector() {
    const selector = document.getElementById('modeSelector');
    selector.innerHTML = '';
    
    Object.entries(config.modes).forEach(([key, mode]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = mode.label;
        selector.appendChild(option);
    });
    
    if (settings && settings.selectedMode) {
        selector.value = settings.selectedMode;
    }
}

// Update mode description
function updateModeDescription() {
    const mode = document.getElementById('modeSelector').value;
    const desc = document.getElementById('modeDescription');
    if (config && config.modes[mode]) {
        desc.textContent = config.modes[mode].description;
    }
}

// Apply saved settings
function applySettings() {
    if (settings.darkMode) {
        document.body.classList.add('dark-mode');
        document.getElementById('darkModeToggle').checked = true;
    }
    
    if (settings.selectedModel) {
        document.getElementById('modelSelector').value = settings.selectedModel;
    }
    
    if (settings.selectedDialect) {
        document.getElementById('dialectSelector').value = settings.selectedDialect;
    }
    
    document.getElementById('totalPolishes').textContent = settings.totalPolishes || 0;
    document.getElementById('totalSpent').textContent = `$${(settings.totalSpent || 0).toFixed(3)}`;
}

// Update API status
function updateApiStatus() {
    const dot = document.getElementById('apiStatusDot');
    const text = document.getElementById('apiStatusText');
    const polishBtn = document.getElementById('polishBtn');
    
    if (apiKey && apiKey.startsWith('sk-')) {
        dot.classList.add('connected');
        text.textContent = 'API Connected';
        polishBtn.disabled = false;
    } else {
        dot.classList.remove('connected');
        text.textContent = 'No API Key';
        polishBtn.disabled = true;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Polish button
    document.getElementById('polishBtn').addEventListener('click', handlePolish);
    document.getElementById('acceptBtn').addEventListener('click', handleAcceptChanges);
    
    // File operations
    document.getElementById('openFileBtn').addEventListener('click', handleOpenFile);
    document.getElementById('saveFileBtn').addEventListener('click', () => handleSaveFile(false));
    document.getElementById('clearInputBtn').addEventListener('click', handleClearInput);
    document.getElementById('copyOutputBtn').addEventListener('click', handleCopyOutput);
    
    // Export menu
    document.getElementById('exportMenuBtn').addEventListener('click', toggleExportMenu);
    document.getElementById('exportTxtBtn').addEventListener('click', () => handleExport('txt'));
    document.getElementById('exportDocxBtn').addEventListener('click', () => handleExport('docx'));
    document.getElementById('exportPdfBtn').addEventListener('click', () => handleExport('pdf'));
    document.getElementById('exportJsonBtn').addEventListener('click', () => handleExport('json'));
    
    // Close export menu when clicking outside
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('exportMenu');
        const btn = document.getElementById('exportMenuBtn');
        if (!menu.contains(e.target) && e.target !== btn) {
            menu.classList.remove('active');
        }
    });
    
    // Settings
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('closeModalBtn').addEventListener('click', closeSettings);
    document.getElementById('saveApiKeyBtn').addEventListener('click', handleSaveApiKey);
    document.getElementById('testApiKeyBtn').addEventListener('click', handleTestApiKey);
    document.getElementById('deleteApiKeyBtn').addEventListener('click', handleDeleteApiKey);
    document.getElementById('darkModeToggle').addEventListener('change', handleDarkModeToggle);
    document.getElementById('resetStatsBtn').addEventListener('click', handleResetStats);
    
    // Mode selector
    document.getElementById('modeSelector').addEventListener('change', () => {
        updateModeDescription();
        updateSettings({ selectedMode: document.getElementById('modeSelector').value });
    });
    
    // Model and dialect selectors
    document.getElementById('modelSelector').addEventListener('change', () => {
        updateSettings({ selectedModel: document.getElementById('modelSelector').value });
        updateCostEstimate();
    });
    
    document.getElementById('dialectSelector').addEventListener('change', () => {
        updateSettings({ selectedDialect: document.getElementById('dialectSelector').value });
    });
    
    // Input changes
    document.getElementById('inputText').addEventListener('input', () => {
        updateWordCounts();
        updateCostEstimate();
    });
    
    // Modal close on outside click
    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target.id === 'settingsModal') {
            closeSettings();
        }
    });
}

// Polish text
async function handlePolish() {
    const input = document.getElementById('inputText').value.trim();
    
    if (!input) {
        showToast('Error', 'Please enter some text to polish', 'error');
        return;
    }
    
    originalInput = input;
    const indicator = document.getElementById('processingIndicator');
    indicator.classList.add('active');
    document.getElementById('polishBtn').disabled = true;
    
    // Show toast with progress
    showToast('Polishing Text', 'Analyzing your text...', 'processing');
    
    try {
        const polished = await polishTextWithProgress(input);
        displayOutput(polished);
        
        // Calculate cost
        const cost = calculateCost(input, polished);
        document.getElementById('lastCost').textContent = `$${cost.toFixed(4)}`;
        document.getElementById('lastCostItem').style.display = 'block';
        
        // Update stats
        settings.totalPolishes++;
        settings.totalSpent += cost;
        await updateSettings(settings);
        applySettings();
        
        // Stats updated in settings already
        
        document.getElementById('acceptBtn').disabled = false;
        document.getElementById('copyOutputBtn').disabled = false;
        document.getElementById('exportMenuBtn').disabled = false;
        
        // Hide progress toast first
        hideToast();
        
        // Show success toast with improvement percentage after a brief delay
        setTimeout(() => {
            const improvement = calculateImprovement(input, polished);
            const wordCount = polished.trim().split(/\s+/).length;
            showToast(
                '✨ Polishing Complete!', 
                `${improvement}% of text improved • ${wordCount} words polished • Cost: $${cost.toFixed(4)}`,
                'success', 
                5000
            );
        }, 300);
        
    } catch (error) {
        showToast('Error', error.message, 'error', 5000);
    } finally {
        indicator.classList.remove('active');
        document.getElementById('polishBtn').disabled = false;
    }
}

// Polish text with streaming progress simulation
async function polishTextWithProgress(text) {
    // Start progress animation
    updateToastProgress(0);
    
    // Simulate progress while waiting for API
    const progressInterval = setInterval(() => {
        const currentProgress = parseInt(document.getElementById('toastProgress').style.width) || 0;
        if (currentProgress < 90) {
            updateToastProgress(currentProgress + 10);
        }
    }, 500);
    
    try {
        const polished = await polishText(text);
        clearInterval(progressInterval);
        updateToastProgress(100);
        return polished;
    } catch (error) {
        clearInterval(progressInterval);
        throw error;
    }
}

// Calculate improvement percentage (word changes)
function calculateImprovement(original, polished) {
    const originalWords = original.split(/\s+/);
    const polishedWords = polished.split(/\s+/);
    
    let changedWords = 0;
    const maxLength = Math.max(originalWords.length, polishedWords.length);
    
    for (let i = 0; i < maxLength; i++) {
        if (originalWords[i] !== polishedWords[i]) {
            changedWords++;
        }
    }
    
    const improvementPercent = Math.round((changedWords / originalWords.length) * 100);
    return Math.min(improvementPercent, 100);
}

// Show toast notification
function showToast(title, message, type = 'info', duration = null) {
    const toast = document.getElementById('toast');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = toast.querySelector('.toast-icon');
    
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    
    // Set icon based on type
    if (type === 'success') {
        toastIcon.textContent = '✓';
        toast.classList.add('success');
        toast.classList.remove('error');
    } else if (type === 'error') {
        toastIcon.textContent = '✗';
        toast.classList.add('error');
        toast.classList.remove('success');
    } else if (type === 'processing') {
        toastIcon.textContent = '✨';
        toast.classList.remove('success', 'error');
    } else {
        toastIcon.textContent = 'ℹ';
        toast.classList.remove('success', 'error');
    }
    
    toast.classList.add('show');
    
    // Auto hide after duration
    if (duration) {
        setTimeout(() => {
            hideToast();
        }, duration);
    }
}

// Hide toast
function hideToast() {
    setTimeout(() => {
        document.getElementById('toast').classList.remove('show');
        updateToastProgress(0);
    }, 500);
}

// Update toast progress bar
function updateToastProgress(percent) {
    const progressBar = document.getElementById('toastProgress');
    progressBar.style.width = percent + '%';
}


// Call OpenAI API
async function polishText(text) {
    const mode = document.getElementById('modeSelector').value;
    const dialect = document.getElementById('dialectSelector').value;
    const model = document.getElementById('modelSelector').value;
    const latexProtect = document.getElementById('latexProtectCheck').checked;
    
    let systemPrompt = config.base_protocol.replace('{{DIALECT}}', dialect);
    systemPrompt += `\n\nSPECIFIC FIELD INSTRUCTIONS:\n${config.modes[mode].system_instruction}`;
    
    if (latexProtect && config.latex_protection) {
        systemPrompt += `\n\n${config.latex_protection.system_instruction}`;
    }
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ],
            temperature: config.modes[mode].temperature,
            max_tokens: 4000
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'API request failed');
    }
    
    const data = await response.json();
    return data.choices[0].message.content.trim();
}

// Display output with optional diff
function displayOutput(polished) {
    const outputDiv = document.getElementById('outputText');
    const showDiff = document.getElementById('showDiffCheck').checked;
    
    if (showDiff) {
        outputDiv.innerHTML = createDiff(originalInput, polished);
    } else {
        outputDiv.textContent = polished;
    }
    
    updateWordCounts();
}

// Create simple word-level diff
function createDiff(original, polished) {
    const originalWords = original.split(/\b/);
    const polishedWords = polished.split(/\b/);
    
    let result = '';
    polishedWords.forEach(word => {
        if (!originalWords.includes(word) && word.trim()) {
            result += `<span class="diff-added">${escapeHtml(word)}</span>`;
        } else {
            result += escapeHtml(word);
        }
    });
    
    return result;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Accept changes
function handleAcceptChanges() {
    const output = document.getElementById('outputText');
    const text = output.textContent || output.innerText;
    document.getElementById('inputText').value = text;
    
    output.innerHTML = '<div class="placeholder"><h3>Polished text will appear here</h3><p>Select a field-specific mode and click "Polish Text" to begin</p></div>';
    
    document.getElementById('acceptBtn').disabled = true;
    document.getElementById('copyOutputBtn').disabled = true;
    document.getElementById('exportMenuBtn').disabled = true;
    
    updateWordCounts();
}

// File operations
async function handleOpenFile() {
    const result = await window.electron.openFile();
    if (result.success) {
        document.getElementById('inputText').value = result.content;
        currentFile = result.filePath;
        document.getElementById('currentFileName').textContent = result.filePath.split(/[\\/]/).pop();
        updateWordCounts();
        showToast('File Opened', `Loaded: ${result.filePath.split(/[\\/]/).pop()}`, 'success', 2000);
    }
}

async function handleSaveFile(isOutput) {
    const text = isOutput 
        ? document.getElementById('outputText').textContent 
        : document.getElementById('inputText').value;
    
    if (!text.trim()) {
        showToast('Error', 'No content to save', 'error', 3000);
        return;
    }
    
    const result = await window.electron.saveFile(text, currentFile);
    if (result.success) {
        currentFile = result.filePath;
        document.getElementById('currentFileName').textContent = result.filePath.split(/[\\/]/).pop();
        showToast('Saved', `File saved successfully`, 'success', 2000);
    }
}

function handleClearInput() {
    if (confirm('Clear all input text?')) {
        document.getElementById('inputText').value = '';
        currentFile = null;
        document.getElementById('currentFileName').textContent = '';
        updateWordCounts();
        showToast('Cleared', 'Input text cleared', 'info', 2000);
    }
}

function handleCopyOutput() {
    const output = document.getElementById('outputText');
    const text = output.textContent || output.innerText;
    
    if (!text || text.includes('Polished text will appear here')) {
        showToast('Error', 'No output to copy', 'error', 3000);
        return;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied', 'Text copied to clipboard', 'success', 2000);
    }).catch(() => {
        showToast('Error', 'Failed to copy', 'error', 3000);
    });
}

// Toggle export menu
function toggleExportMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById('exportMenu');
    menu.classList.toggle('active');
}

// Handle export in different formats
async function handleExport(format) {
    const output = document.getElementById('outputText');
    const text = output.textContent || output.innerText;
    
    // Close menu
    document.getElementById('exportMenu').classList.remove('active');
    
    if (!text || text.includes('Polished text will appear here')) {
        showToast('Error', 'No output to export', 'error', 3000);
        return;
    }
    
    try {
        let result;
        
        if (format === 'txt') {
            result = await window.electron.saveFile(text, currentFile);
            
        } else if (format === 'docx' || format === 'pdf') {
            // Show metadata modal
            const metadata = await showMetadataModal(format);
            if (!metadata) return; // User cancelled
            
            if (format === 'docx') {
                result = await window.electron.exportDOCX(text, metadata);
            } else {
                result = await window.electron.exportPDF(text, metadata);
            }
            
        } else if (format === 'json') {
            const jsonData = {
                original: originalInput,
                polished: text,
                metadata: {
                    mode: document.getElementById('modeSelector').value,
                    model: document.getElementById('modelSelector').value,
                    dialect: document.getElementById('dialectSelector').value,
                    timestamp: new Date().toISOString(),
                    wordCount: {
                        original: originalInput.trim().split(/\s+/).length,
                        polished: text.trim().split(/\s+/).length
                    }
                }
            };
            result = await window.electron.exportJSON(jsonData);
        }
        
        if (result && result.success) {
            showToast('Exported', `Successfully exported as ${format.toUpperCase()}`, 'success', 3000);
        } else if (result && !result.canceled) {
            showToast('Export Failed', result.error || 'Unknown error', 'error', 5000);
        }
    } catch (error) {
        showToast('Export Error', error.message, 'error', 5000);
    }
}

// Show metadata modal and return promise with metadata or null if cancelled
function showMetadataModal(format) {
    return new Promise((resolve) => {
        const modal = document.getElementById('metadataModal');
        const titleInput = document.getElementById('metaTitle');
        const authorInput = document.getElementById('metaAuthor');
        const subjectInput = document.getElementById('metaSubject');
        
        // Clear previous values
        titleInput.value = '';
        authorInput.value = '';
        subjectInput.value = '';
        
        // Show modal
        modal.classList.add('active');
        titleInput.focus();
        
        // Handle confirm
        const confirmHandler = () => {
            cleanup();
            resolve({
                title: titleInput.value.trim(),
                author: authorInput.value.trim(),
                subject: subjectInput.value.trim()
            });
        };
        
        // Handle cancel
        const cancelHandler = () => {
            cleanup();
            resolve(null);
        };
        
        // Cleanup function
        const cleanup = () => {
            modal.classList.remove('active');
            document.getElementById('confirmMetadataBtn').removeEventListener('click', confirmHandler);
            document.getElementById('cancelMetadataBtn').removeEventListener('click', cancelHandler);
            document.getElementById('closeMetadataBtn').removeEventListener('click', cancelHandler);
        };
        
        // Add event listeners
        document.getElementById('confirmMetadataBtn').addEventListener('click', confirmHandler);
        document.getElementById('cancelMetadataBtn').addEventListener('click', cancelHandler);
        document.getElementById('closeMetadataBtn').addEventListener('click', cancelHandler);
        
        // Handle Enter key
        const enterHandler = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                confirmHandler();
            }
        };
        titleInput.addEventListener('keydown', enterHandler);
        authorInput.addEventListener('keydown', enterHandler);
        subjectInput.addEventListener('keydown', enterHandler);
    });
}


// Settings modal
function openSettings() {
    document.getElementById('settingsModal').classList.add('active');
    document.getElementById('apiKeyInput').value = apiKey || '';
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
}

async function handleSaveApiKey() {
    const key = document.getElementById('apiKeyInput').value.trim();
    
    if (!key) {
        alert('Please enter an API key');
        return;
    }
    
    if (!key.startsWith('sk-')) {
        alert('Invalid API key format (should start with sk-)');
        return;
    }
    
    await window.electron.setApiKey(key);
    apiKey = key;
    updateApiStatus();
    alert('API key saved securely');
}

async function handleTestApiKey() {
    const testKey = document.getElementById('apiKeyInput').value || apiKey;
    
    if (!testKey) {
        alert('No API key to test');
        return;
    }
    
    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${testKey}` }
        });
        
        if (response.ok) {
            alert('✓ API key is valid!');
        } else {
            alert('✗ API key is invalid');
        }
    } catch (error) {
        alert('Connection failed: ' + error.message);
    }
}

async function handleDeleteApiKey() {
    if (confirm('Delete saved API key?')) {
        await window.electron.deleteApiKey();
        apiKey = null;
        document.getElementById('apiKeyInput').value = '';
        updateApiStatus();
        alert('API key deleted');
    }
}

function handleDarkModeToggle() {
    const enabled = document.getElementById('darkModeToggle').checked;
    document.body.classList.toggle('dark-mode', enabled);
    updateSettings({ darkMode: enabled });
}

async function handleResetStats() {
    if (confirm('Reset all statistics?')) {
        await window.electron.resetStats();
        settings.totalPolishes = 0;
        settings.totalSpent = 0;
        await updateSettings(settings);
        applySettings();
        alert('Statistics reset');
    }
}

// Update settings
async function updateSettings(updates) {
    settings = { ...settings, ...updates };
    await window.electron.saveSettings(settings);
}

// Word counts
function updateWordCounts() {
    const input = document.getElementById('inputText').value;
    const output = document.getElementById('outputText');
    const outputText = output.textContent || output.innerText;
    
    const inputWords = input.trim() ? input.trim().split(/\s+/).length : 0;
    const outputWords = outputText.includes('Polished text will appear here') ? 0 : 
        outputText.trim().split(/\s+/).filter(w => w.length > 0).length;
    
    document.getElementById('inputWordCount').textContent = `${inputWords} words`;
    document.getElementById('outputWordCount').textContent = `${outputWords} words`;
}

// Cost estimation
function updateCostEstimate() {
    const text = document.getElementById('inputText').value;
    const model = document.getElementById('modelSelector').value;
    
    if (!text || !config) {
        document.getElementById('costEstimate').textContent = '$0.0000';
        return;
    }
    
    const cost = calculateCost(text, text) * 2; // Estimate double for output
    document.getElementById('costEstimate').textContent = `$${cost.toFixed(4)}`;
}

function calculateCost(inputText, outputText) {
    const model = document.getElementById('modelSelector').value;
    const pricing = config.cost_estimates[model];
    
    if (!pricing) return 0;
    
    const inputTokens = Math.ceil(inputText.length / 4);
    const outputTokens = Math.ceil(outputText.length / 4);
    
    const inputCost = (inputTokens / 1000000) * pricing.input_per_1m;
    const outputCost = (outputTokens / 1000000) * pricing.output_per_1m;
    
    return inputCost + outputCost;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
