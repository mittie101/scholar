// Global state
let apiKey = null;
let config = null;
let settings = null;
let currentFile = null;
let originalInput = '';
let polishedOutput = ''; // Store polished text for diff toggle
let versionHistory = []; // Store last 5 polish versions
let currentVersionIndex = -1;
let customDictionary = []; // Custom terminology dictionary
let retryAttempts = 0;
const MAX_RETRIES = 3;
const MAX_VERSIONS = 5;
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds
let autoSaveTimer = null;

// Debug: Check if window.electron is available
console.log('Renderer script loaded');
console.log('window.electron available:', typeof window.electron !== 'undefined');

// Initialize app
async function init() {
    console.log('Init function called');
    try {
        console.log('Fetching API key, prompts, and settings...');
        [apiKey, config, settings] = await Promise.all([
            window.electron.getApiKey(),
            window.electron.getPrompts(),
            window.electron.getSettings()
        ]);
        
        console.log('Data loaded:', { hasApiKey: !!apiKey, hasConfig: !!config, hasSettings: !!settings });
        
        if (config) {
            populateModeSelector();
            updateModeDescription();
        }
        
        if (settings) {
            applySettings();
            loadDictionary();
        }
        
        updateApiStatus();
        console.log('About to setup event listeners...');
        setupEventListeners();
        console.log('Event listeners setup complete');
        updateWordCounts();
        updateCostEstimate();
        checkDraftBackup();
        startAutoSave();
        console.log('Initialization complete!');
    } catch (error) {
        console.error('Init error:', error);
        alert('Error initializing application: ' + error.message);
    }
}

// Auto-save functionality
function startAutoSave() {
    autoSaveTimer = setInterval(async () => {
        const input = document.getElementById('inputText').value.trim();
        const output = document.getElementById('outputText');
        const outputText = output.textContent || output.innerText;
        
        if (input || (outputText && !outputText.includes('Polished text will appear here'))) {
            await window.electron.saveDraftBackup({
                input,
                output: outputText.includes('Polished text will appear here') ? '' : outputText,
                timestamp: new Date().toISOString()
            });
        }
    }, AUTO_SAVE_INTERVAL);
}

// Check for draft backup on startup
async function checkDraftBackup() {
    const backup = await window.electron.loadDraftBackup();
    if (backup.success && backup.data) {
        const restore = confirm(`Found auto-saved draft from ${new Date(backup.data.timestamp).toLocaleString()}. Restore it?`);
        if (restore) {
            if (backup.data.input) {
                document.getElementById('inputText').value = backup.data.input;
            }
            if (backup.data.output) {
                document.getElementById('outputText').textContent = backup.data.output;
                document.getElementById('acceptBtn').disabled = false;
                document.getElementById('copyOutputBtn').disabled = false;
                document.getElementById('exportMenuBtn').disabled = false;
            }
            updateWordCounts();
        }
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
    
    // Add custom prompts if any
    if (config.customModes && config.customModes.length > 0) {
        const divider = document.createElement('option');
        divider.disabled = true;
        divider.textContent = '──── Custom Modes ────';
        selector.appendChild(divider);
        
        config.customModes.forEach(custom => {
            const option = document.createElement('option');
            option.value = `custom_${custom.id}`;
            option.textContent = custom.label;
            selector.appendChild(option);
        });
    }
    
    if (settings && settings.selectedMode) {
        selector.value = settings.selectedMode;
    }
}

// Update mode description
function updateModeDescription() {
    const mode = document.getElementById('modeSelector').value;
    const desc = document.getElementById('modeDescription');
    
    if (mode.startsWith('custom_')) {
        const customId = mode.replace('custom_', '');
        const custom = config.customModes.find(c => c.id === customId);
        if (custom) {
            desc.textContent = custom.description;
        }
    } else if (config && config.modes[mode]) {
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
    console.log('Setting up event listeners...');
    
    try {
        // Polish button
        const polishBtn = document.getElementById('polishBtn');
        const acceptBtn = document.getElementById('acceptBtn');
        if (polishBtn) {
            polishBtn.addEventListener('click', () => {
                clearVersionHistory(); // Clear when starting new polish
                handlePolish();
            });
        }
        if (acceptBtn) acceptBtn.addEventListener('click', handleAcceptChanges);
        console.log('Polish buttons:', !!polishBtn, !!acceptBtn);
        
        // File operations
        const openFileBtn = document.getElementById('openFileBtn');
        const saveFileBtn = document.getElementById('saveFileBtn');
        const clearInputBtn = document.getElementById('clearInputBtn');
        const copyOutputBtn = document.getElementById('copyOutputBtn');
        
        if (openFileBtn) openFileBtn.addEventListener('click', handleOpenFile);
        if (saveFileBtn) saveFileBtn.addEventListener('click', () => handleSaveFile(false));
        if (clearInputBtn) clearInputBtn.addEventListener('click', handleClearInput);
        if (copyOutputBtn) copyOutputBtn.addEventListener('click', handleCopyOutput);
        console.log('File buttons:', !!openFileBtn, !!saveFileBtn, !!clearInputBtn, !!copyOutputBtn);
        
        // Export menu
        const exportMenuBtn = document.getElementById('exportMenuBtn');
        const exportTxtBtn = document.getElementById('exportTxtBtn');
        const exportDocxBtn = document.getElementById('exportDocxBtn');
        const exportPdfBtn = document.getElementById('exportPdfBtn');
        const exportJsonBtn = document.getElementById('exportJsonBtn');
        
        if (exportMenuBtn) exportMenuBtn.addEventListener('click', toggleExportMenu);
        if (exportTxtBtn) exportTxtBtn.addEventListener('click', () => handleExport('txt'));
        if (exportDocxBtn) exportDocxBtn.addEventListener('click', () => handleExport('docx'));
        if (exportPdfBtn) exportPdfBtn.addEventListener('click', () => handleExport('pdf'));
        if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => handleExport('json'));
        console.log('Export buttons:', !!exportMenuBtn, !!exportTxtBtn);
        
        // Close export menu when clicking outside
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('exportMenu');
            const btn = document.getElementById('exportMenuBtn');
            if (menu && !menu.contains(e.target) && e.target !== btn) {
                menu.classList.remove('active');
            }
        });
        
        // Settings
        const settingsBtn = document.getElementById('settingsBtn');
        const closeModalBtn = document.getElementById('closeModalBtn');
        const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
        const testApiKeyBtn = document.getElementById('testApiKeyBtn');
        const deleteApiKeyBtn = document.getElementById('deleteApiKeyBtn');
        const darkModeToggle = document.getElementById('darkModeToggle');
        const resetStatsBtn = document.getElementById('resetStatsBtn');
        
        if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
        if (closeModalBtn) closeModalBtn.addEventListener('click', closeSettings);
        if (saveApiKeyBtn) saveApiKeyBtn.addEventListener('click', handleSaveApiKey);
        if (testApiKeyBtn) testApiKeyBtn.addEventListener('click', handleTestApiKey);
        if (deleteApiKeyBtn) deleteApiKeyBtn.addEventListener('click', handleDeleteApiKey);
        if (darkModeToggle) darkModeToggle.addEventListener('change', handleDarkModeToggle);
        if (resetStatsBtn) resetStatsBtn.addEventListener('click', handleResetStats);
        
        // Dictionary
        const addDictBtn = document.getElementById('addDictBtn');
        if (addDictBtn) addDictBtn.addEventListener('click', addDictionaryTerm);
        
        console.log('Settings buttons:', !!settingsBtn, !!closeModalBtn, !!saveApiKeyBtn);
        
        // Mode selector
        const modeSelector = document.getElementById('modeSelector');
        if (modeSelector) {
            modeSelector.addEventListener('change', () => {
                updateModeDescription();
                updateSettings({ selectedMode: modeSelector.value });
            });
        }
        
        // Model and dialect selectors
        const modelSelector = document.getElementById('modelSelector');
        const dialectSelector = document.getElementById('dialectSelector');
        
        if (modelSelector) {
            modelSelector.addEventListener('change', () => {
                updateSettings({ selectedModel: modelSelector.value });
                updateCostEstimate();
            });
        }
        
        if (dialectSelector) {
            dialectSelector.addEventListener('change', () => {
                updateSettings({ selectedDialect: dialectSelector.value });
            });
        }
        console.log('Selectors:', !!modeSelector, !!modelSelector, !!dialectSelector);
        
        // Input changes
        const inputText = document.getElementById('inputText');
        if (inputText) {
            inputText.addEventListener('input', () => {
                updateWordCounts();
                updateCostEstimate();
            });
        }
        console.log('Input text:', !!inputText);
        
        // Modal close on outside click
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target.id === 'settingsModal') {
                    closeSettings();
                }
            });
        }
        
        // Diff toggle
        const showDiffCheck = document.getElementById('showDiffCheck');
        if (showDiffCheck) {
            showDiffCheck.addEventListener('change', () => {
                if (originalInput && polishedOutput) {
                    displayOutput(polishedOutput);
                }
            });
        }
        
        // Version dropdown
        const versionDropdown = document.getElementById('versionDropdown');
        if (versionDropdown) {
            versionDropdown.addEventListener('change', (e) => {
                const selectedIndex = parseInt(e.target.value);
                restoreVersion(selectedIndex);
            });
        }
        
        console.log('Event listeners setup complete!');
    } catch (error) {
        console.error('Error setting up event listeners:', error);
        alert('Error setting up buttons: ' + error.message);
    }
}

// Smart chunking for long documents

// Smart chunking for long documents
function chunkText(text, maxTokens = 3000) {
    const paragraphs = text.split(/\n\n+/);
    const chunks = [];
    let currentChunk = [];
    let currentLength = 0;
    
    for (const para of paragraphs) {
        const paraLength = Math.ceil(para.length / 4); // Rough token estimate
        
        if (currentLength + paraLength > maxTokens && currentChunk.length > 0) {
            chunks.push(currentChunk.join('\n\n'));
            currentChunk = [para];
            currentLength = paraLength;
        } else {
            currentChunk.push(para);
            currentLength += paraLength;
        }
    }
    
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'));
    }
    
    return chunks;
}

// Polish text with streaming and chunking
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
    
    // Clear output
    const outputDiv = document.getElementById('outputText');
    outputDiv.innerHTML = '';
    
    // Determine if we need chunking
    const estimatedTokens = Math.ceil(input.length / 4);
    const needsChunking = estimatedTokens > 3000;
    
    if (needsChunking) {
        showToast('Processing Large Document', 'Breaking into sections for optimal quality...', 'processing');
    } else {
        showToast('Polishing Text', 'Streaming results...', 'processing');
    }
    
    try {
        let polished;
        
        if (needsChunking) {
            polished = await polishTextChunked(input, outputDiv);
        } else {
            polished = await polishTextStreaming(input, outputDiv);
        }
        
        // Store polished output for diff toggle
        polishedOutput = polished;
        
        // Save to version history
        saveVersion(polished, input);
        
        // Apply diff highlighting if enabled
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
        
        document.getElementById('acceptBtn').disabled = false;
        document.getElementById('copyOutputBtn').disabled = false;
        document.getElementById('exportMenuBtn').disabled = false;
        
        // Calculate and display improvement percentage
        let improvement = 0;
        try {
            improvement = calculateImprovement(input, polished);
            console.log('Improvement calculated:', improvement);
        } catch (e) {
            console.error('Error calculating improvement:', e);
            improvement = 0;
        }
        
        // Update permanent improvement display
        document.getElementById('improvementPercent').textContent = `${improvement}%`;
        document.getElementById('improvementItem').style.display = 'block';
        
        // Hide any existing toast
        const toast = document.getElementById('toast');
        toast.classList.remove('show');
        
        retryAttempts = 0; // Reset retry counter on success
        
    } catch (error) {
        if (retryAttempts < MAX_RETRIES) {
            retryAttempts++;
            showToast(
                'Connection Issue', 
                `Retrying (${retryAttempts}/${MAX_RETRIES})...`, 
                'error', 
                3000
            );
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Retry the operation
            document.getElementById('polishBtn').disabled = false;
            indicator.classList.remove('active');
            handlePolish();
            return;
        }
        
        showToast('Error', error.message + ` - Check auto-saved draft in settings.`, 'error', 7000);
        retryAttempts = 0;
    } finally {
        indicator.classList.remove('active');
        document.getElementById('polishBtn').disabled = false;
    }
}

// Stream polishing for normal-sized texts
async function polishTextStreaming(text, outputDiv) {
    const mode = document.getElementById('modeSelector').value;
    const dialect = document.getElementById('dialectSelector').value;
    const model = document.getElementById('modelSelector').value;
    const latexProtect = document.getElementById('latexProtectCheck').checked;
    
    // Apply dictionary protection
    const { protected: protectedText, tokenMap } = protectTextWithDictionary(text);
    
    let systemPrompt = config.base_protocol.replace('{{DIALECT}}', dialect);
    
    if (mode.startsWith('custom_')) {
        const customId = mode.replace('custom_', '');
        const custom = config.customModes.find(c => c.id === customId);
        if (custom) {
            systemPrompt += `\n\nSPECIFIC FIELD INSTRUCTIONS:\n${custom.system_instruction}`;
        }
    } else {
        systemPrompt += `\n\nSPECIFIC FIELD INSTRUCTIONS:\n${config.modes[mode].system_instruction}`;
    }
    
    if (latexProtect && config.latex_protection) {
        systemPrompt += `\n\n${config.latex_protection.system_instruction}`;
    }
    
    const temperature = mode.startsWith('custom_') 
        ? (config.customModes.find(c => c.id === mode.replace('custom_', ''))?.temperature || 0.7)
        : config.modes[mode].temperature;
    
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
                { role: 'user', content: protectedText }  // Send protected text
            ],
            temperature: temperature,
            max_tokens: 4000,
            stream: true
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'API request failed');
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices[0]?.delta?.content || '';
                    if (content) {
                        accumulated += content;
                        outputDiv.textContent = accumulated;
                        updateWordCounts();
                    }
                } catch (e) {
                    // Skip malformed JSON
                }
            }
        }
    }
    
    // Restore protected terms before returning
    const restored = restoreProtectedTerms(accumulated.trim(), tokenMap);
    return restored;
}

// Chunked polishing for large documents
async function polishTextChunked(text, outputDiv) {
    const chunks = chunkText(text, 3000);
    let polishedChunks = [];
    
    for (let i = 0; i < chunks.length; i++) {
        showToast(
            'Processing Large Document', 
            `Section ${i + 1} of ${chunks.length}...`, 
            'processing'
        );
        
        const polished = await polishTextStreaming(chunks[i], outputDiv);
        polishedChunks.push(polished);
        
        // Show accumulated result
        const accumulated = polishedChunks.join('\n\n');
        outputDiv.textContent = accumulated;
        updateWordCounts();
    }
    
    return polishedChunks.join('\n\n');
}

// Calculate improvement percentage using simple word comparison
function calculateImprovement(original, polished) {
    try {
        console.log('Calculating improvement...');
        
        // Split into words
        const originalWords = original.split(/\s+/).filter(w => w.trim());
        const polishedWords = polished.split(/\s+/).filter(w => w.trim());
        
        let changedWords = 0;
        const maxLength = Math.max(originalWords.length, polishedWords.length);
        
        // Compare word by word
        for (let i = 0; i < maxLength; i++) {
            if (originalWords[i] !== polishedWords[i]) {
                changedWords++;
            }
        }
        
        const percent = originalWords.length > 0 
            ? Math.round((changedWords / originalWords.length) * 100)
            : 0;
        
        console.log('Improvement calculated:', percent + '%');
        return Math.min(percent, 100); // Cap at 100%
    } catch (e) {
        console.error('Error calculating improvement:', e);
        return 0;
    }
}

// Display output with robust diff
function displayOutput(polished) {
    console.log('displayOutput called');
    const outputDiv = document.getElementById('outputText');
    const showDiff = document.getElementById('showDiffCheck').checked;
    
    console.log('Show diff enabled:', showDiff);
    console.log('Has originalInput:', !!originalInput);
    
    if (showDiff && originalInput) {
        console.log('Creating diff view...');
        console.log('Original length:', originalInput.length);
        console.log('Polished length:', polished.length);
        const diffHtml = createRobustDiff(originalInput, polished);
        console.log('Diff HTML length:', diffHtml.length);
        console.log('Diff HTML sample:', diffHtml.substring(0, 200));
        outputDiv.innerHTML = diffHtml;
    } else {
        console.log('Showing plain text (diff disabled or no original)');
        outputDiv.textContent = polished;
    }
    
    updateWordCounts();
}

// Save version to history
function saveVersion(polishedText, originalText) {
    const version = {
        polished: polishedText,
        original: originalText,
        timestamp: new Date().toLocaleTimeString(),
        index: versionHistory.length
    };
    
    // Add to history
    versionHistory.push(version);
    
    // Keep only last MAX_VERSIONS
    if (versionHistory.length > MAX_VERSIONS) {
        versionHistory.shift();
        // Re-index remaining versions
        versionHistory.forEach((v, i) => v.index = i);
    }
    
    currentVersionIndex = versionHistory.length - 1;
    
    // Update dropdown
    updateVersionDropdown();
}

// Update version dropdown UI
function updateVersionDropdown() {
    const dropdown = document.getElementById('versionDropdown');
    const selector = document.getElementById('versionSelector');
    
    if (versionHistory.length === 0) {
        selector.style.display = 'none';
        return;
    }
    
    selector.style.display = 'flex';
    selector.style.alignItems = 'center';
    selector.style.gap = '8px';
    
    // Clear and rebuild options
    dropdown.innerHTML = '';
    
    // Add versions in reverse order (newest first)
    for (let i = versionHistory.length - 1; i >= 0; i--) {
        const version = versionHistory[i];
        const option = document.createElement('option');
        option.value = i;
        
        if (i === versionHistory.length - 1) {
            option.textContent = `Version ${i + 1} (Current) - ${version.timestamp}`;
        } else {
            option.textContent = `Version ${i + 1} - ${version.timestamp}`;
        }
        
        dropdown.appendChild(option);
    }
    
    dropdown.value = currentVersionIndex;
}

// Restore a version from history
function restoreVersion(index) {
    if (index < 0 || index >= versionHistory.length) return;
    
    const version = versionHistory[index];
    currentVersionIndex = index;
    
    // Update the display
    polishedOutput = version.polished;
    originalInput = version.original;
    displayOutput(version.polished);
    
    // Update dropdown selection
    document.getElementById('versionDropdown').value = index;
}

// Clear version history (when starting new polish)
function clearVersionHistory() {
    versionHistory = [];
    currentVersionIndex = -1;
    document.getElementById('versionSelector').style.display = 'none';
}

// Create robust diff with diff-match-patch
function createRobustDiff(original, polished) {
    try {
        const dmp = new diff_match_patch();
        const diffs = dmp.diff_main(original, polished);
        dmp.diff_cleanupSemantic(diffs);
        
        let html = '';
        diffs.forEach(([op, text]) => {
            const escaped = escapeHtml(text);
            if (op === -1) { // DELETE
                html += `<span class="diff-removed">${escaped}</span>`;
            } else if (op === 1) { // INSERT
                html += `<span class="diff-added">${escaped}</span>`;
            } else { // EQUAL
                html += escaped;
            }
        });
        
        return html;
    } catch (e) {
        console.error('Diff error:', e);
        return escapeHtml(polished);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show toast notification
function showToast(title, message, type = 'info', duration = null) {
    console.log('showToast called:', { title, message, type, duration });
    const toast = document.getElementById('toast');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = toast.querySelector('.toast-icon');
    
    // Clear previous state
    toast.classList.remove('hiding', 'success', 'error');
    
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    
    // Set icon based on type
    if (type === 'success') {
        toastIcon.textContent = '✓';
        toast.classList.add('success');
    } else if (type === 'error') {
        toastIcon.textContent = '✗';
        toast.classList.add('error');
    } else if (type === 'processing') {
        toastIcon.textContent = '✨';
    } else {
        toastIcon.textContent = 'ℹ';
    }
    
    toast.classList.add('show');
    console.log('Toast classes:', toast.className);
    
    // Auto hide after duration
    if (duration) {
        setTimeout(() => {
            hideToast();
        }, duration);
    }
}

// Hide toast
function hideToast() {
    const toast = document.getElementById('toast');
    toast.classList.add('hiding');
    setTimeout(() => {
        toast.classList.remove('show', 'hiding');
    }, 200); // Match the CSS transition duration
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

// Handle export with enhanced PDF options
async function handleExport(format) {
    const output = document.getElementById('outputText');
    
    // Get clean text - if diff is showing (innerHTML), extract text; otherwise use textContent
    let text;
    if (output.innerHTML.includes('diff-')) {
        // Diff is showing - create temp div to strip HTML
        const temp = document.createElement('div');
        temp.innerHTML = output.innerHTML;
        text = temp.textContent || temp.innerText;
    } else {
        // Plain text
        text = output.textContent || output.innerText;
    }
    
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
            const metadata = await showMetadataModal(format);
            if (!metadata) return;
            
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

// Enhanced metadata modal with PDF formatting options
function showMetadataModal(format) {
    return new Promise((resolve) => {
        const modal = document.getElementById('metadataModal');
        const titleInput = document.getElementById('metaTitle');
        const authorInput = document.getElementById('metaAuthor');
        const subjectInput = document.getElementById('metaSubject');
        
        // Show/hide PDF-specific options
        const pdfOptions = document.getElementById('pdfFormattingOptions');
        if (pdfOptions) {
            pdfOptions.style.display = format === 'pdf' ? 'block' : 'none';
        }
        
        titleInput.value = '';
        authorInput.value = '';
        subjectInput.value = '';
        
        modal.classList.add('active');
        titleInput.focus();
        
        const confirmHandler = () => {
            cleanup();
            
            const metadata = {
                title: titleInput.value.trim(),
                author: authorInput.value.trim(),
                subject: subjectInput.value.trim()
            };
            
            if (format === 'pdf') {
                metadata.formatting = {
                    doubleSpaced: document.getElementById('doubleSpacingCheck')?.checked || false,
                    lineNumbers: document.getElementById('lineNumbersCheck')?.checked || false,
                    font: document.getElementById('fontSelect')?.value || 'times'
                };
            }
            
            resolve(metadata);
        };
        
        const cancelHandler = () => {
            cleanup();
            resolve(null);
        };
        
        const cleanup = () => {
            modal.classList.remove('active');
            document.getElementById('confirmMetadataBtn').removeEventListener('click', confirmHandler);
            document.getElementById('cancelMetadataBtn').removeEventListener('click', cancelHandler);
            document.getElementById('closeMetadataBtn').removeEventListener('click', cancelHandler);
        };
        
        document.getElementById('confirmMetadataBtn').addEventListener('click', confirmHandler);
        document.getElementById('cancelMetadataBtn').addEventListener('click', cancelHandler);
        document.getElementById('closeMetadataBtn').addEventListener('click', cancelHandler);
        
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
    
    const result = await window.electron.setApiKey(key);
    if (result.success) {
        apiKey = key;
        updateApiStatus();
        alert('API key saved securely in OS keychain');
    } else {
        alert('Failed to save API key');
    }
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
    if (confirm('Delete saved API key from secure storage?')) {
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
    
    const cost = calculateCost(text, text) * 2;
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

// Load diff-match-patch library
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/diff-match-patch@1.0.5/index.js';
document.head.appendChild(script);

// ==================== CUSTOM DICTIONARY FUNCTIONS ====================

// Load dictionary from settings
function loadDictionary() {
    if (settings && settings.customDictionary) {
        customDictionary = settings.customDictionary;
    } else {
        customDictionary = [];
    }
    updateDictionaryUI();
}

// Update dictionary UI
function updateDictionaryUI() {
    const listDiv = document.getElementById('dictionaryList');
    if (!listDiv) return;
    
    if (customDictionary.length === 0) {
        listDiv.innerHTML = '<div class="dictionary-empty">No custom terms added yet</div>';
        return;
    }
    
    listDiv.innerHTML = '';
    customDictionary.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'dictionary-item';
        
        const termSpan = document.createElement('span');
        termSpan.className = 'dictionary-term';
        termSpan.textContent = entry.term;
        
        const arrow = document.createElement('span');
        arrow.className = 'dictionary-arrow';
        arrow.textContent = entry.replacement ? '→' : '🔒';
        
        const replacementSpan = document.createElement('span');
        replacementSpan.className = 'dictionary-replacement';
        replacementSpan.textContent = entry.replacement || '(preserve as-is)';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'dictionary-delete';
        deleteBtn.textContent = '×';
        deleteBtn.onclick = () => removeDictionaryTerm(index);
        
        item.appendChild(termSpan);
        item.appendChild(arrow);
        item.appendChild(replacementSpan);
        item.appendChild(deleteBtn);
        
        listDiv.appendChild(item);
    });
}

// Add term to dictionary
async function addDictionaryTerm() {
    const termInput = document.getElementById('dictTermInput');
    const replacementInput = document.getElementById('dictReplacementInput');
    
    const term = termInput.value.trim();
    if (!term) {
        alert('Please enter a term to protect');
        return;
    }
    
    const replacement = replacementInput.value.trim();
    
    // Check if term already exists
    if (customDictionary.some(entry => entry.term === term)) {
        alert('This term already exists in the dictionary');
        return;
    }
    
    customDictionary.push({
        term: term,
        replacement: replacement || null
    });
    
    // Save to settings
    await saveDictionaryToSettings();
    
    // Clear inputs
    termInput.value = '';
    replacementInput.value = '';
    
    // Update UI
    updateDictionaryUI();
}

// Remove term from dictionary
async function removeDictionaryTerm(index) {
    customDictionary.splice(index, 1);
    await saveDictionaryToSettings();
    updateDictionaryUI();
}

// Save dictionary to settings
async function saveDictionaryToSettings() {
    settings.customDictionary = customDictionary;
    await window.electron.saveSettings(settings);
}

// Protect text with dictionary (before sending to API)
function protectTextWithDictionary(text) {
    let protected = text;
    const tokenMap = new Map();
    
    customDictionary.forEach((entry, index) => {
        const token = `__DICT_TOKEN_${index}__`;
        const regex = new RegExp(escapeRegex(entry.term), 'gi');
        
        // Store original matches to preserve case
        const matches = [];
        protected = protected.replace(regex, (match) => {
            matches.push(match);
            return token;
        });
        
        tokenMap.set(token, { entry, matches });
    });
    
    return { protected, tokenMap };
}

// Restore protected terms (after receiving from API)
function restoreProtectedTerms(text, tokenMap) {
    let restored = text;
    
    tokenMap.forEach((data, token) => {
        const { entry, matches } = data;
        let matchIndex = 0;
        
        const regex = new RegExp(escapeRegex(token), 'g');
        restored = restored.replace(regex, () => {
            if (entry.replacement) {
                // Use replacement
                return entry.replacement;
            } else {
                // Preserve original (use matched case)
                const original = matches[matchIndex] || entry.term;
                matchIndex++;
                return original;
            }
        });
    });
    
    return restored;
}

// Escape special regex characters
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
