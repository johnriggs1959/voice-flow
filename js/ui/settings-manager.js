// Settings Manager - Handles settings UI and persistence
import { ThemeManager } from '../themes/theme-manager.js';

export class SettingsManager {
    constructor() {
        this.isOpen = false;
        this.currentTab = 'appearance';
        this.settings = new Map();
        this.eventListeners = new Map();
        
        // Initialize theme manager
        this.themeManager = new ThemeManager();
        
        // Store available models
        this.availableModels = [];
        
        // Initialize settings structure
        this.initializeSettings();
        
        // Load saved settings
        this.loadSettings();
        
        // Create modal DOM
        this.createModal();
        
        // Setup event listeners
        this.setupEventListeners();
        
        console.log('SettingsManager initialized');
    }
    
    // UPDATED: Initialize default settings structure - Added selectedModel
    initializeSettings() {
        this.settings.set('appearance', {
            theme: 'dark',
            animations: true,
            reducedMotion: false
        });
        
        this.settings.set('audio', {
            autoplay: true,
            volume: 0.8,
            speechRate: 1.0,
            sttModel: 'base',
            voice: 'af_heart'
        });
        
        this.settings.set('privacy', {
            saveHistory: true,
            analytics: false
        });
        
        // UPDATED: Model parameters section with selectedModel
        this.settings.set('model', {
            selectedModel: null, // Will be set when models are loaded
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 512,
            seed: null
        });

        // Add logging settings
        this.settings.set('logging', {
            enabled: true,
            conversations: true,
            events: true,
            analytics: true,
            retentionDays: 30,
            anonymize: false,
            filterSensitive: true
        });
    }
    
    // Load settings from localStorage
    loadSettings() {
        try {
            const saved = localStorage.getItem('ai-assistant-settings');
            if (saved) {
                const parsedSettings = JSON.parse(saved);
                
                // Merge with defaults
                for (const [category, values] of Object.entries(parsedSettings)) {
                    if (this.settings.has(category)) {
                        const currentSettings = this.settings.get(category);
                        this.settings.set(category, { ...currentSettings, ...values });
                    }
                }
                
                console.log('Settings loaded from localStorage');
            }
            
            // Load legacy settings
            this.loadLegacySettings();
        } catch (error) {
            console.warn('Failed to load settings:', error);
        }
    }
    
    // UPDATED: Load legacy settings including model selection
    loadLegacySettings() {
        try {
            // Migrate voice setting
            const savedVoice = localStorage.getItem('ai-assistant-selected-voice');
            if (savedVoice) {
                this.setSetting('audio', 'voice', savedVoice);
                localStorage.removeItem('ai-assistant-selected-voice');
                console.log('Migrated voice setting:', savedVoice);
            }
            
            // Migrate STT model setting
            const savedSTTModel = localStorage.getItem('ai-assistant-selected-stt-model');
            if (savedSTTModel) {
                this.setSetting('audio', 'sttModel', savedSTTModel);
                localStorage.removeItem('ai-assistant-selected-stt-model');
                console.log('Migrated STT model setting:', savedSTTModel);
            }
            
            // Migrate AI model selection
            const savedModel = localStorage.getItem('ai-assistant-selected-model');
            if (savedModel) {
                this.setSetting('model', 'selectedModel', savedModel);
                localStorage.removeItem('ai-assistant-selected-model');
                console.log('Migrated model selection:', savedModel);
            }
        } catch (error) {
            console.warn('Failed to load legacy settings:', error);
        }
    }
    
    // NEW: Update available models
    updateAvailableModels(models) {
        this.availableModels = models || [];
        
        // If no model is selected, select the first one
        const currentModel = this.getSetting('model', 'selectedModel');
        if (!currentModel && models && models.length > 0) {
            this.setSetting('model', 'selectedModel', models[0].name);
        }
        
        // Update the model dropdown in settings if it exists
        this.updateModelDropdown();
    }
    
    // NEW: Update model dropdown in settings
    updateModelDropdown() {
        const modelSelect = document.getElementById('settingsModelSelect');
        if (!modelSelect) return;
        
        modelSelect.innerHTML = '';
        
        if (this.availableModels.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No models available - Check Ollama connection';
            option.disabled = true;
            option.selected = true;
            modelSelect.appendChild(option);
            return;
        }
        
        const currentModel = this.getSetting('model', 'selectedModel');
        
        this.availableModels.forEach((model) => {
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = `${model.name} (${model.size})`;
            
            if (model.name === currentModel) {
                option.selected = true;
            }
            
            modelSelect.appendChild(option);
        });
    }
    
    // NEW: Get selected model
    getSelectedModel() {
        return this.getSetting('model', 'selectedModel');
    }
    
    // Save settings to localStorage
    saveSettings() {
        try {
            const settingsObject = Object.fromEntries(this.settings);
            localStorage.setItem('ai-assistant-settings', JSON.stringify(settingsObject));
            console.log('Settings saved to localStorage');
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }
    
    // Get setting value
    getSetting(category, key) {
        const categorySettings = this.settings.get(category);
        return categorySettings ? categorySettings[key] : undefined;
    }
    
    // Set setting value
    setSetting(category, key, value) {
        if (!this.settings.has(category)) {
            this.settings.set(category, {});
        }
        
        const categorySettings = this.settings.get(category);
        const oldValue = categorySettings[key];
        categorySettings[key] = value;
        
        // Save to localStorage
        this.saveSettings();
        
        // Notify listeners
        this.notifySettingChange(category, key, value, oldValue);
        
        // Handle special settings
        this.handleSpecialSetting(category, key, value);
    }
    
    // UPDATED: Handle special settings including model selection
    handleSpecialSetting(category, key, value) {
        if (category === 'appearance' && key === 'theme') {
            this.themeManager.applyTheme(value);
        } else if (category === 'audio') {
            if (key === 'voice') {
                const mainVoiceSelect = document.getElementById('voiceSelect');
                if (mainVoiceSelect) {
                    mainVoiceSelect.value = value;
                }
            } else if (key === 'sttModel') {
                const mainSTTSelect = document.getElementById('sttModelSelect');
                if (mainSTTSelect) {
                    mainSTTSelect.value = value;
                }
            }
        } else if (category === 'model' && key === 'selectedModel') {
            // Update the hidden main UI model select for compatibility
            const mainModelSelect = document.getElementById('modelSelect');
            if (mainModelSelect) {
                mainModelSelect.value = value;
            }
            console.log(`Model changed to: ${value}`);
        }
    }
    
    // Create modal DOM structure
    createModal() {
        const modalHTML = `
            <div class="settings-modal" id="settingsModal" role="dialog" aria-labelledby="settingsTitle" aria-hidden="true">
                <div class="settings-modal-content">
                    <div class="settings-modal-header">
                        <h2 class="settings-modal-title" id="settingsTitle">Settings</h2>
                        <button class="settings-modal-close" id="settingsClose" aria-label="Close settings">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="settings-modal-body">
                        <div class="settings-tabs">
                            <button class="settings-tab active" data-tab="appearance" id="tabAppearance">
                                Appearance
                            </button>
                            <button class="settings-tab" data-tab="model" id="tabModel">
                                Model
                            </button>
                            <button class="settings-tab" data-tab="audio" id="tabAudio">
                                Audio
                            </button>
                            <button class="settings-tab" data-tab="logging" id="tabLogging">
                                Logging
                            </button>
                            <button class="settings-tab" data-tab="privacy" id="tabPrivacy">
                                Privacy
                            </button>
                        </div>
                        <div class="settings-tab-content active" data-content="appearance">
                            ${this.createAppearanceTab()}
                        </div>
                        <div class="settings-tab-content" data-content="model">
                            ${this.createModelTab()}
                        </div>
                        <div class="settings-tab-content" data-content="audio">
                            ${this.createAudioTab()}
                        </div>
                        <div class="settings-tab-content" data-content="logging">
                            ${this.createLoggingTab()}
                        </div>
                        <div class="settings-tab-content" data-content="privacy">
                            ${this.createPrivacyTab()}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add to document
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Store references
        this.modal = document.getElementById('settingsModal');
        this.modalContent = this.modal.querySelector('.settings-modal-content');
        this.closeButton = document.getElementById('settingsClose');
        this.tabs = this.modal.querySelectorAll('.settings-tab');
        this.tabContents = this.modal.querySelectorAll('.settings-tab-content');
    }
    
    // Create logging tab
    createLoggingTab() {
        const loggingEnabled = this.getSetting('logging', 'enabled');
        const retentionDays = this.getSetting('logging', 'retentionDays');
        
        return `
            <div class="settings-section">
                <h3 class="settings-section-title">Chat Logging</h3>
                <div class="settings-field">
                    <label class="settings-field-label">
                        <input type="checkbox" id="loggingEnabled" ${loggingEnabled ? 'checked' : ''}>
                        Enable chat logging
                    </label>
                    <div class="settings-field-description">
                        Save conversation data locally for analytics and future RAG implementation
                    </div>
                </div>
                
                <div class="settings-field">
                    <label class="settings-field-label">
                        <input type="checkbox" id="logConversations" ${this.getSetting('logging', 'conversations') ? 'checked' : ''} ${!loggingEnabled ? 'disabled' : ''}>
                        Log conversations
                    </label>
                    <div class="settings-field-description">
                        Store user inputs and AI responses with metadata
                    </div>
                </div>
                
                <div class="settings-field">
                    <label class="settings-field-label">
                        <input type="checkbox" id="logEvents" ${this.getSetting('logging', 'events') ? 'checked' : ''} ${!loggingEnabled ? 'disabled' : ''}>
                        Log system events
                    </label>
                    <div class="settings-field-description">
                        Track errors, session starts/ends, and other events
                    </div>
                </div>
                
                <div class="settings-field">
                    <label class="settings-field-label">
                        <input type="checkbox" id="logAnalytics" ${this.getSetting('logging', 'analytics') ? 'checked' : ''} ${!loggingEnabled ? 'disabled' : ''}>
                        Enable analytics
                    </label>
                    <div class="settings-field-description">
                        Collect performance metrics and usage patterns
                    </div>
                </div>
            </div>
            
            <div class="settings-section">
                <h3 class="settings-section-title">Data Protection</h3>
                <div class="settings-field">
                    <label class="settings-field-label">
                        <input type="checkbox" id="filterSensitive" ${this.getSetting('logging', 'filterSensitive') ? 'checked' : ''}>
                        Filter sensitive data
                    </label>
                    <div class="settings-field-description">
                        Automatically redact emails, phone numbers, API keys, and other sensitive information
                    </div>
                </div>
                
                <div class="settings-field">
                    <label class="settings-field-label">
                        <input type="checkbox" id="anonymizeData" ${this.getSetting('logging', 'anonymize') ? 'checked' : ''}>
                        Anonymize logged data
                    </label>
                    <div class="settings-field-description">
                        Hash session IDs and remove identifying information
                    </div>
                </div>
                
                <div class="settings-field">
                    <label class="settings-field-label" for="retentionDays">
                        Data retention: <span id="retentionValue">${retentionDays}</span> days
                    </label>
                    <input type="range" id="retentionDays" min="1" max="90" step="1" value="${retentionDays}" class="parameter-slider">
                    <div class="settings-field-description">
                        Automatically delete logs older than this period
                    </div>
                </div>
            </div>
            
            <div class="settings-section">
                <h3 class="settings-section-title">Data Management</h3>
                <div class="settings-field">
                    <button class="btn-secondary" id="exportLogsButton">
                        Export Logs
                    </button>
                    <div class="settings-field-description">
                        Download conversation logs in JSON, JSONL, CSV, or Markdown format
                    </div>
                </div>
                
                <div class="settings-field">
                    <button class="btn-secondary" id="viewAnalyticsButton">
                        View Analytics
                    </button>
                    <div class="settings-field-description">
                        See usage patterns, performance metrics, and insights
                    </div>
                </div>
                
                <div class="settings-field">
                    <button class="btn-secondary" id="clearLogsButton">
                        Clear Old Logs
                    </button>
                    <div class="settings-field-description">
                        Remove logs older than retention period to free up space
                    </div>
                </div>
                
                <div class="settings-field">
                    <button class="btn-secondary" id="clearAllLogsButton">
                        Clear All Logs
                    </button>
                    <div class="settings-field-description">
                        Permanently delete all stored conversation logs and analytics
                    </div>
                </div>
            </div>
            
            <div class="settings-section" id="storageStats">
                <h3 class="settings-section-title">Storage Statistics</h3>
                <div class="settings-field">
                    <div id="storageStatsContent">
                        Loading storage information...
                    </div>
                </div>
            </div>
        `;
    }

    // Create appearance tab content
    createAppearanceTab() {
        const themes = this.themeManager.getAllThemes();
        const currentTheme = this.themeManager.getCurrentTheme();
        
        const themeOptions = themes.map(theme => `
            <label class="theme-option ${theme.key === currentTheme ? 'selected' : ''}" data-theme="${theme.key}">
                <input type="radio" name="theme" value="${theme.key}" ${theme.key === currentTheme ? 'checked' : ''}>
                <div class="theme-preview">
                    <div class="theme-preview-header"></div>
                    <div class="theme-preview-content"></div>
                    <div class="theme-preview-accent"></div>
                </div>
                <div class="theme-name">${theme.name}</div>
            </label>
        `).join('');
        
        return `
            <div class="settings-section">
                <h3 class="settings-section-title">Color Theme</h3>
                <div class="settings-field">
                    <label class="settings-field-label">Choose your preferred color scheme</label>
                    <div class="theme-selector">
                        ${themeOptions}
                    </div>
                    <div class="settings-field-description">
                        Changes apply immediately and are saved automatically
                    </div>
                </div>
            </div>
            
            <div class="settings-section">
                <h3 class="settings-section-title">Animations</h3>
                <div class="settings-field">
                    <label class="settings-field-label">
                        <input type="checkbox" id="animationsEnabled" ${this.getSetting('appearance', 'animations') ? 'checked' : ''}>
                        Enable animations and transitions
                    </label>
                    <div class="settings-field-description">
                        Disable for better performance or reduced motion preference
                    </div>
                </div>
            </div>
        `;
    }
    
    // UPDATED: Create model parameters tab with model selection
    createModelTab() {
        const selectedModel = this.getSetting('model', 'selectedModel');
        const temperature = this.getSetting('model', 'temperature');
        const topP = this.getSetting('model', 'topP');
        const maxTokens = this.getSetting('model', 'maxTokens');
        const seed = this.getSetting('model', 'seed');
        
        return `
            <div class="settings-section">
                <h3 class="settings-section-title">AI Model Selection</h3>
                <div class="settings-field">
                    <label class="settings-field-label" for="settingsModelSelect">
                        Active Model
                    </label>
                    <select id="settingsModelSelect" class="settings-select">
                        <option>Loading models...</option>
                    </select>
                    <div class="settings-field-description">
                        Choose the AI model for generating responses
                    </div>
                </div>
            </div>
            
            <div class="settings-section">
                <h3 class="settings-section-title">Response Generation</h3>
                <div class="settings-field">
                    <label class="settings-field-label" for="temperatureSlider">
                        Temperature: <span id="temperatureValue">${temperature}</span>
                    </label>
                    <input type="range" id="temperatureSlider" min="0" max="2" step="0.1" value="${temperature}" class="parameter-slider">
                    <div class="settings-field-description">
                        Controls creativity and randomness (0.0 = focused, 2.0 = creative)
                    </div>
                </div>
                
                <div class="settings-field">
                    <label class="settings-field-label" for="topPSlider">
                        Top-P: <span id="topPValue">${topP}</span>
                    </label>
                    <input type="range" id="topPSlider" min="0.1" max="1" step="0.05" value="${topP}" class="parameter-slider">
                    <div class="settings-field-description">
                        Controls response diversity (0.1 = focused, 1.0 = diverse)
                    </div>
                </div>
                
                <div class="settings-field">
                    <label class="settings-field-label" for="maxTokensSlider">
                        Max Tokens: <span id="maxTokensValue">${maxTokens}</span>
                    </label>
                    <input type="range" id="maxTokensSlider" min="100" max="2048" step="50" value="${maxTokens}" class="parameter-slider">
                    <div class="settings-field-description">
                        Maximum response length in tokens (100 = short, 2048 = very long)
                    </div>
                </div>
            </div>
            
            <div class="settings-section">
                <h3 class="settings-section-title">Reproducibility</h3>
                <div class="settings-field">
                    <label class="settings-field-label" for="seedInput">
                        Seed (optional)
                    </label>
                    <input type="number" id="seedInput" value="${seed || ''}" placeholder="Random seed" class="seed-input">
                    <div class="settings-field-description">
                        Set a number for reproducible responses (leave empty for randomness)
                    </div>
                </div>
            </div>
            
            <div class="settings-section">
                <h3 class="settings-section-title">Quick Actions</h3>
                <div class="settings-field">
                    <button class="btn-secondary" id="resetModelParams">
                        Reset to Defaults
                    </button>
                    <div class="settings-field-description">
                        Restore all model parameters to their default values
                    </div>
                </div>
            </div>
        `;
    }
    
    // Create audio tab content
    createAudioTab() {
        const currentVoice = this.getSetting('audio', 'voice');
        const currentSTTModel = this.getSetting('audio', 'sttModel');
        const isMuted = this.getSetting('audio', 'muted') || false;
        
        return `
            <div class="settings-section">
                <h3 class="settings-section-title">Audio Output</h3>
                <div class="settings-field">
                    <label class="settings-field-label">
                        <input type="checkbox" id="muteEnabled" ${isMuted ? 'checked' : ''}>
                        Mute audio output
                    </label>
                    <div class="settings-field-description">
                        Disable all audio playback from the AI assistant
                    </div>
                </div>
            </div>
            
            <div class="settings-section">
                <h3 class="settings-section-title">Speech Recognition</h3>
                <div class="settings-field">
                    <label class="settings-field-label" for="settingsSTTModelSelect">
                        Recognition Model
                    </label>
                    <select id="settingsSTTModelSelect" class="settings-select">
                        <option value="tiny" ${currentSTTModel === 'tiny' ? 'selected' : ''}>Tiny (Fastest, Lower Accuracy)</option>
                        <option value="base" ${currentSTTModel === 'base' ? 'selected' : ''}>Base (Balanced Speed & Accuracy)</option>
                        <option value="small" ${currentSTTModel === 'small' ? 'selected' : ''}>Small (Good Accuracy)</option>
                        <option value="medium" ${currentSTTModel === 'medium' ? 'selected' : ''}>Medium (Better Accuracy)</option>
                        <option value="large" ${currentSTTModel === 'large' ? 'selected' : ''}>Large (Best Accuracy, Slower)</option>
                    </select>
                    <div class="settings-field-description">
                        Choose the speech recognition model - larger models are more accurate but slower
                    </div>
                </div>
                
                <div class="settings-field">
                    <label class="settings-field-label" for="settingsVoiceSelect">
                        Voice Selection
                    </label>
                    <select id="settingsVoiceSelect" class="settings-select">
                        <option value="af_heart" ${currentVoice === 'af_heart' ? 'selected' : ''}>Heart (Female, American)</option>
                        <option value="af_bella" ${currentVoice === 'af_bella' ? 'selected' : ''}>Bella (Female, American)</option>
                        <option value="af_sarah" ${currentVoice === 'af_sarah' ? 'selected' : ''}>Sarah (Female, American)</option>
                        <option value="am_adam" ${currentVoice === 'am_adam' ? 'selected' : ''}>Adam (Male, American)</option>
                        <option value="af_alloy" ${currentVoice === 'af_alloy' ? 'selected' : ''}>Alloy (Female, American)</option>
                        <option value="af_aoede" ${currentVoice === 'af_aoede' ? 'selected' : ''}>Aoede (Female, American)</option>
                        <option value="bf_alice" ${currentVoice === 'bf_alice' ? 'selected' : ''}>Alice (Female, British)</option>
                        <option value="bf_emma" ${currentVoice === 'bf_emma' ? 'selected' : ''}>Emma (Female, British)</option>
                        <option value="bf_lily" ${currentVoice === 'bf_lily' ? 'selected' : ''}>Lily (Female, British)</option>
                        <option value="bm_daniel" ${currentVoice === 'bm_daniel' ? 'selected' : ''}>Daniel (Male, British)</option>
                        <option value="bm_fable" ${currentVoice === 'bm_fable' ? 'selected' : ''}>Fable (Male, British)</option>
                        <option value="bm_george" ${currentVoice === 'bm_george' ? 'selected' : ''}>George (Male, British)</option>
                        <option value="bm_lewis" ${currentVoice === 'bm_lewis' ? 'selected' : ''}>Lewis (Male, British)</option>
                    </select>
                    <div class="settings-field-description">
                        Choose the voice for AI responses - different accents and genders available
                    </div>
                </div>
            </div>
            
            <div class="settings-section">
                <h3 class="settings-section-title">Playback</h3>
                <div class="settings-field">
                    <label class="settings-field-label">
                        <input type="checkbox" id="autoplayEnabled" ${this.getSetting('audio', 'autoplay') ? 'checked' : ''}>
                        Auto-play AI responses
                    </label>
                    <div class="settings-field-description">
                        Automatically play generated speech when responses are ready
                    </div>
                </div>
                <div class="settings-field">
                    <label class="settings-field-label" for="volumeSlider">
                        Volume: <span id="volumeValue">${Math.round(this.getSetting('audio', 'volume') * 100)}%</span>
                    </label>
                    <input type="range" id="volumeSlider" min="0" max="1" step="0.1" value="${this.getSetting('audio', 'volume')}" class="volume-slider">
                </div>
                <div class="settings-field">
                    <label class="settings-field-label" for="speechRateSlider">
                        Speech Rate: <span id="speechRateValue">${this.getSetting('audio', 'speechRate')}x</span>
                    </label>
                    <input type="range" id="speechRateSlider" min="0.5" max="2" step="0.1" value="${this.getSetting('audio', 'speechRate')}" class="speech-rate-slider">
                    <div class="settings-field-description">
                        Adjust how fast the AI speaks (0.5x = slower, 2x = faster)
                    </div>
                </div>
            </div>
        `;
    }
    
    // Create privacy tab content
    createPrivacyTab() {
        return `
            <div class="settings-section">
                <h3 class="settings-section-title">Data Storage</h3>
                <div class="settings-field">
                    <label class="settings-field-label">
                        <input type="checkbox" id="saveHistoryEnabled" ${this.getSetting('privacy', 'saveHistory') ? 'checked' : ''}>
                        Save conversation history
                    </label>
                    <div class="settings-field-description">
                        Keep your conversations in browser storage for continuity
                    </div>
                </div>
            </div>
            
            <div class="settings-section">
                <h3 class="settings-section-title">Analytics</h3>
                <div class="settings-field">
                    <label class="settings-field-label">
                        <input type="checkbox" id="analyticsEnabled" ${this.getSetting('privacy', 'analytics') ? 'checked' : ''}>
                        Allow usage analytics
                    </label>
                    <div class="settings-field-description">
                        Help improve the application by sharing anonymous usage data
                    </div>
                </div>
            </div>
            
            <div class="settings-section">
                <h3 class="settings-section-title">Data Management</h3>
                <div class="settings-field">
                    <button class="btn-secondary" id="clearDataButton">
                        Clear All Data
                    </button>
                    <div class="settings-field-description">
                        Remove all stored settings, themes, and conversation history
                    </div>
                </div>
            </div>
        `;
    }
    
    // UPDATED: Setup event listeners to handle new audio controls and model selector
    setupEventListeners() {
        // Modal close events
        this.closeButton.addEventListener('click', () => this.close());
        
        // Close on overlay click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });
        
        // Escape key to close
        this.eventListeners.set('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
        document.addEventListener('keydown', this.eventListeners.get('keydown'));
        
        // Tab switching
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
                // Update model dropdown when switching to model tab
                if (tab.dataset.tab === 'model') {
                    this.updateModelDropdown();
                }
                // ADDED: Update storage stats when switching to logging tab
                if (tab.dataset.tab === 'logging') {
                    setTimeout(() => {
                        this.updateStorageStats();
                    }, 100);
                }
            });
        });
        
        // Theme selection
        this.modal.addEventListener('change', (e) => {
            if (e.target.name === 'theme') {
                console.log('Theme radio button changed to:', e.target.value);
                this.handleThemeChange(e.target.value);
            }
        });
        
        // Settings changes - use event delegation
        this.modal.addEventListener('change', (e) => {
            this.handleSettingChange(e);
        });
        
        // Real-time slider updates including model parameters
        this.modal.addEventListener('input', (e) => {
            if (e.target.id === 'volumeSlider') {
                const volumeValue = document.getElementById('volumeValue');
                if (volumeValue) {
                    volumeValue.textContent = `${Math.round(e.target.value * 100)}%`;
                }
            } else if (e.target.id === 'speechRateSlider') {
                const speechRateValue = document.getElementById('speechRateValue');
                if (speechRateValue) {
                    speechRateValue.textContent = `${e.target.value}x`;
                }
            } else if (e.target.id === 'temperatureSlider') {
                const temperatureValue = document.getElementById('temperatureValue');
                if (temperatureValue) {
                    temperatureValue.textContent = e.target.value;
                }
            } else if (e.target.id === 'topPSlider') {
                const topPValue = document.getElementById('topPValue');
                if (topPValue) {
                    topPValue.textContent = e.target.value;
                }
            } else if (e.target.id === 'maxTokensSlider') {
                const maxTokensValue = document.getElementById('maxTokensValue');
                if (maxTokensValue) {
                    maxTokensValue.textContent = e.target.value;
                }
            } else if (e.target.id === 'retentionDays') {
                const retentionValue = document.getElementById('retentionValue');
                if (retentionValue) {
                    retentionValue.textContent = e.target.value;
                }
            }
        });
        
        // Button clicks
        this.modal.addEventListener('click', (e) => {
            if (e.target.id === 'clearDataButton') {
                this.handleClearData();
            } else if (e.target.id === 'resetModelParams') {
                this.handleResetModelParams();
            } else if (e.target.id === 'exportLogsButton') {
                this.handleExportLogs();
            } else if (e.target.id === 'viewAnalyticsButton') {
                this.handleViewAnalytics();
            } else if (e.target.id === 'clearLogsButton') {
                this.handleClearOldLogs();
            } else if (e.target.id === 'clearAllLogsButton') {
                this.handleClearAllLogs();
            }
        });
        
        // Update storage stats when logging tab is shown
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                if (tab.dataset.tab === 'logging') {
                    this.updateStorageStats();
                }
            });
        });
    }
    
    // Handle theme change
    handleThemeChange(themeKey) {
        console.log(`Theme change requested: ${themeKey}`);
        
        // CRITICAL: Save to the separate theme key that index.html reads
        try {
            localStorage.setItem('ai-assistant-theme', themeKey);
            console.log(`Theme saved to localStorage: ${themeKey}`);
        } catch (error) {
            console.error('Failed to save theme to localStorage:', error);
        }
        
        // Update theme manager (this also saves it, but to the same key for redundancy)
        this.themeManager.applyTheme(themeKey);
        
        // Update setting in the settings object too
        this.setSetting('appearance', 'theme', themeKey);
        
        // Update UI selection
        this.updateThemeSelection(themeKey);
    }
    
    // Update theme selection UI
    updateThemeSelection(selectedTheme) {
        const themeOptions = this.modal.querySelectorAll('.theme-option');
        themeOptions.forEach(option => {
            if (option.dataset.theme === selectedTheme) {
                option.classList.add('selected');
                option.querySelector('input').checked = true;
            } else {
                option.classList.remove('selected');
                option.querySelector('input').checked = false;
            }
        });
    }
    
    // UPDATED: Handle general setting changes including new audio settings and model selector
    handleSettingChange(e) {
        const { id, type, checked, value } = e.target;
        
        switch (id) {
            case 'animationsEnabled':
                this.setSetting('appearance', 'animations', checked);
                break;
            case 'autoplayEnabled':
                this.setSetting('audio', 'autoplay', checked);
                break;
            case 'volumeSlider':
                this.setSetting('audio', 'volume', parseFloat(value));
                break;
            case 'speechRateSlider':
                this.setSetting('audio', 'speechRate', parseFloat(value));
                if (window.aiAssistant && window.aiAssistant.audio && window.aiAssistant.audio.audioElement) {
                    window.aiAssistant.audio.audioElement.playbackRate = parseFloat(value);
                    console.log(`Updated playback rate to: ${value}x`);
                }
                break;
            case 'saveHistoryEnabled':
                this.setSetting('privacy', 'saveHistory', checked);
                break;
            case 'analyticsEnabled':
                this.setSetting('privacy', 'analytics', checked);
                break;
            // Model parameter handlers
            case 'settingsModelSelect':
                this.setSetting('model', 'selectedModel', value);
                // Trigger model warm-up
                if (window.aiAssistant) {
                    window.aiAssistant.warmUpCurrentModel(value);
                }
                break;
            case 'temperatureSlider':
                this.setSetting('model', 'temperature', parseFloat(value));
                break;
            case 'topPSlider':
                this.setSetting('model', 'topP', parseFloat(value));
                break;
            case 'maxTokensSlider':
                this.setSetting('model', 'maxTokens', parseInt(value));
                break;
            case 'seedInput':
                const seedValue = value.trim();
                this.setSetting('model', 'seed', seedValue ? parseInt(seedValue) : null);
                break;
            // Audio setting handlers
            case 'settingsVoiceSelect':
                this.setSetting('audio', 'voice', value);
                break;
            case 'settingsSTTModelSelect':
                this.setSetting('audio', 'sttModel', value);
                break;
            // Logging settings
            case 'loggingEnabled':
                this.setSetting('logging', 'enabled', checked);
                // Enable/disable other logging checkboxes
                document.querySelectorAll('#logConversations, #logEvents, #logAnalytics').forEach(el => {
                    el.disabled = !checked;
                });
                // Update chat logger if it exists
                if (window.aiAssistant?.chatLogger) {
                    window.aiAssistant.chatLogger.setLoggingEnabled(checked);
                }
                break;
            case 'logConversations':
                this.setSetting('logging', 'conversations', checked);
                break;
            case 'logEvents':
                this.setSetting('logging', 'events', checked);
                break;
            case 'logAnalytics':
                this.setSetting('logging', 'analytics', checked);
                break;
            case 'filterSensitive':
                this.setSetting('logging', 'filterSensitive', checked);
                if (window.aiAssistant?.chatLogger?.privacy) {
                    window.aiAssistant.chatLogger.privacy.updateSettings({
                        filterSensitiveData: checked
                    });
                }
                break;
            case 'anonymizeData':
                this.setSetting('logging', 'anonymize', checked);
                if (window.aiAssistant?.chatLogger?.privacy) {
                    window.aiAssistant.chatLogger.privacy.updateSettings({
                        anonymizeData: checked
                    });
                }
                break;
            case 'retentionDays':
                this.setSetting('logging', 'retentionDays', parseInt(value));
                const retentionValue = document.getElementById('retentionValue');
                if (retentionValue) {
                    retentionValue.textContent = value;
                }
                if (window.aiAssistant?.chatLogger?.privacy) {
                    window.aiAssistant.chatLogger.privacy.setRetentionDays(parseInt(value));
                }
                break;


            case 'muteEnabled':
                this.setSetting('audio', 'muted', checked);
                // Update the main app's mute state if the change came from settings
                if (window.aiAssistant) {
                    window.aiAssistant.isMuted = checked;
                    window.aiAssistant.updateMuteButtonVisual();
                    window.aiAssistant.applyMuteToCurrentAudio();
                    // Show status message
                    const status = checked ? 'muted' : 'unmuted';
                    if (window.aiAssistant.status) {
                        window.aiAssistant.status.showInfo(`Audio ${status} via settings`);
                    }
                    console.log(`Mute state changed via settings to: ${checked}`);
                }
                break;                
        }
    }
    
    // Handle reset model parameters
    handleResetModelParams() {
        if (confirm('Reset all model parameters to defaults?')) {
            // Reset to default values
            this.setSetting('model', 'temperature', 0.7);
            this.setSetting('model', 'topP', 0.9);
            this.setSetting('model', 'maxTokens', 512);
            this.setSetting('model', 'seed', null);
            
            // Update UI elements
            this.updateModelParametersUI();
            
            // Show confirmation
            if (window.aiAssistant && window.aiAssistant.status) {
                window.aiAssistant.status.showSuccess('Model parameters reset to defaults');
            }
        }
    }
    
    // Update model parameters UI elements
    updateModelParametersUI() {
        const temperatureSlider = document.getElementById('temperatureSlider');
        const topPSlider = document.getElementById('topPSlider');
        const maxTokensSlider = document.getElementById('maxTokensSlider');
        const seedInput = document.getElementById('seedInput');
        
        const temperatureValue = document.getElementById('temperatureValue');
        const topPValue = document.getElementById('topPValue');
        const maxTokensValue = document.getElementById('maxTokensValue');
        
        if (temperatureSlider) {
            const temp = this.getSetting('model', 'temperature');
            temperatureSlider.value = temp;
            if (temperatureValue) temperatureValue.textContent = temp;
        }
        
        if (topPSlider) {
            const topP = this.getSetting('model', 'topP');
            topPSlider.value = topP;
            if (topPValue) topPValue.textContent = topP;
        }
        
        if (maxTokensSlider) {
            const maxTokens = this.getSetting('model', 'maxTokens');
            maxTokensSlider.value = maxTokens;
            if (maxTokensValue) maxTokensValue.textContent = maxTokens;
        }
        
        if (seedInput) {
            const seed = this.getSetting('model', 'seed');
            seedInput.value = seed || '';
        }
    }
    
    // Handle clear data
    handleClearData() {
        if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
            try {
                // Clear localStorage
                localStorage.removeItem('ai-assistant-settings');
                localStorage.removeItem('ai-assistant-theme');
                
                // Reset to defaults (dark theme)
                this.initializeSettings();
                this.themeManager.applyTheme('dark');
                
                // Close modal and show success message
                this.close();
                
                // Notify user
                if (window.aiAssistant && window.aiAssistant.status) {
                    window.aiAssistant.status.showSuccess('All data cleared successfully');
                }
                
                console.log('All data cleared');
            } catch (error) {
                console.error('Failed to clear data:', error);
                alert('Failed to clear data. Please try again.');
            }
        }
    }
    
    // Handler methods for logging
    async handleExportLogs() {
        const format = await this.showExportDialog();
        if (format && window.aiAssistant?.chatLogger) {
            try {
                const result = await window.aiAssistant.chatLogger.exportLogs({ format });
                this.showNotification(`Exported ${result.records} records as ${result.filename}`, 'success');
            } catch (error) {
                this.showNotification(`Export failed: ${error.message}`, 'error');
            }
        }
    }

    async handleViewAnalytics() {
        if (window.aiAssistant?.chatLogger) {
            const analytics = window.aiAssistant.chatLogger.getAnalyticsSummary();
            this.showAnalyticsModal(analytics);
        }
    }

    async handleClearOldLogs() {
        if (confirm('Clear all logs older than the retention period?')) {
            if (window.aiAssistant?.chatLogger) {
                const cleared = await window.aiAssistant.chatLogger.clearOldLogs();
                this.showNotification(`Cleared ${cleared} old log entries`, 'success');
                this.updateStorageStats();
            }
        }
    }

    async handleClearAllLogs() {
        if (confirm('Are you sure you want to delete ALL conversation logs? This cannot be undone.')) {
            if (confirm('This will permanently delete all logs and analytics. Continue?')) {
                try {
                    if (window.aiAssistant?.chatLogger) {
                        // 1. Clear IndexedDB storage (conversations, events, analytics)
                        await window.aiAssistant.chatLogger.storage.clearAllData();
                        
                        // 2. Clear in-memory analytics data structures
                        window.aiAssistant.chatLogger.analytics.reset();
                        
                        // 3. Clear localStorage analytics state
                        localStorage.removeItem('ai-assistant-analytics-state');
                        localStorage.removeItem('ai-assistant-analytics-aggregated');
                        
                        // 4. Clear any buffered logs
                        window.aiAssistant.chatLogger.logBuffer = [];
                        
                        // 5. Start fresh session (resets session tracking)
                        window.aiAssistant.chatLogger.startNewSession();
                        
                        this.showNotification('All logs and analytics cleared successfully', 'success');
                    } else {
                        // Fallback if chatLogger not available
                        localStorage.removeItem('ai-assistant-analytics-state');
                        localStorage.removeItem('ai-assistant-analytics-aggregated');
                        this.showNotification('Cleared available analytics data', 'success');
                    }
                    
                    // 6. Update storage stats display
                    this.updateStorageStats();
                    
                } catch (error) {
                    console.error('Error clearing all logs:', error);
                    this.showNotification(`Failed to clear all logs: ${error.message}`, 'error');
                }
            }
        }
    }

    // Helper method to update storage stats
    async updateStorageStats() {
        const statsElement = document.getElementById('storageStatsContent');
        if (!statsElement) return;
        
        if (window.aiAssistant?.chatLogger) {
            try {
                // Get fresh stats after clearing
                const storageStats = await window.aiAssistant.chatLogger.getStorageStats();
                const analyticsData = window.aiAssistant.chatLogger.getAnalyticsSummary();
                
                const analyticsCount = analyticsData?.quality?.totalTurns || 0;
                
                let html = '<div class="storage-stats-grid">';
                
                html += `
                    <div class="stat-item">
                        <div class="stat-label">Conversations:</div>
                        <div class="stat-value">${storageStats?.conversations || 0}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Events:</div>
                        <div class="stat-value">${storageStats?.events || 0}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Analytics:</div>
                        <div class="stat-value">${analyticsCount}</div>
                    </div>
                `;
                
                if (storageStats?.storageUsage) {
                    const used = ((storageStats.storageUsage.used || 0) / 1024 / 1024).toFixed(2);
                    const quota = ((storageStats.storageUsage.quota || 0) / 1024 / 1024).toFixed(0);
                    const percent = ((storageStats.storageUsage.percentUsed || 0) * 100).toFixed(1);
                    
                    html += `
                        <div class="stat-item">
                            <div class="stat-label">Storage Used:</div>
                            <div class="stat-value">${used} MB / ${quota} MB (${percent}%)</div>
                        </div>
                    `;
                }
                
                if (storageStats?.oldestEntry || storageStats?.newestEntry) {
                    const oldest = storageStats.oldestEntry ? new Date(storageStats.oldestEntry).toLocaleDateString() : 'N/A';
                    const newest = storageStats.newestEntry ? new Date(storageStats.newestEntry).toLocaleDateString() : 'N/A';
                    
                    html += `
                        <div class="stat-item">
                            <div class="stat-label">Date Range:</div>
                            <div class="stat-value">${oldest} - ${newest}</div>
                        </div>
                    `;
                } else {
                    // Show "No data" when everything is cleared
                    html += `
                        <div class="stat-item">
                            <div class="stat-label">Date Range:</div>
                            <div class="stat-value">No data</div>
                        </div>
                    `;
                }
                
                html += '</div>';
                
                // Add a timestamp of when stats were last updated
                html += `<div class="stats-updated" style="margin-top: 1rem; font-size: 0.8rem; color: var(--text-secondary);">
                    Updated: ${new Date().toLocaleTimeString()}
                </div>`;
                
                statsElement.innerHTML = html;
                
            } catch (error) {
                console.error('Error updating storage stats:', error);
                statsElement.innerHTML = '<p style="color: var(--text-error);">Error loading storage statistics</p>';
            }
        } else {
            statsElement.innerHTML = '<p>Logging system not initialized</p>';
        }
    }

    // Show export dialog
    showExportDialog() {
        return new Promise(resolve => {
            const formats = ['json', 'jsonl', 'csv', 'markdown'];
            
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10002;
            `;
            
            const dialog = document.createElement('div');
            dialog.className = 'export-dialog-content';
            dialog.style.cssText = `
                background: var(--modal-bg, rgba(20, 20, 20, 0.95));
                border: 1px solid var(--modal-border, rgba(255, 255, 255, 0.1));
                border-radius: 1rem;
                padding: 2rem;
                max-width: 400px;
                width: 90%;
                max-width: 400px;
            `;
            
            dialog.innerHTML = `
                <h3 style="margin: 0 0 1.5rem 0; color: var(--text-primary);">Select Export Format</h3>
                <div class="export-options" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1.5rem;">
                    ${formats.map(format => `
                        <button class="export-option btn-secondary" data-format="${format}" style="padding: 0.75rem 1rem; cursor: pointer;">
                            ${format.toUpperCase()}
                        </button>
                    `).join('')}
                </div>
                <button class="export-cancel btn-secondary" style="width: 100%; padding: 0.75rem; cursor: pointer;">Cancel</button>
            `;
            
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            
            const cleanup = () => {
                document.body.removeChild(overlay);
            };
            
            dialog.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.target.classList.contains('export-option')) {
                    const format = e.target.dataset.format;
                    cleanup();
                    resolve(format);
                } else if (e.target.classList.contains('export-cancel')) {
                    cleanup();
                    resolve(null);
                }
            });
            
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cleanup();
                    resolve(null);
                }
            });
        });
    }

    // Show analytics modal
    showAnalyticsModal(analytics) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10002;
        `;
        
        const modal = document.createElement('div');
        modal.className = 'analytics-modal-content';
        modal.style.cssText = `
            background: var(--modal-bg, rgba(20, 20, 20, 0.95));
            border: 1px solid var(--modal-border, rgba(255, 255, 255, 0.1));
            border-radius: 1rem;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
        `;
        
        modal.innerHTML = `
            <div class="analytics-header" style="padding: 1.5rem; border-bottom: 1px solid var(--border-primary); display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin: 0; color: var(--text-primary);">Analytics Summary</h2>
                <button class="analytics-close" style="background: none; border: none; color: var(--text-secondary); font-size: 1.5rem; cursor: pointer;">&times;</button>
            </div>
            <div class="analytics-body" style="flex: 1; overflow-y: auto; padding: 1.5rem;">
                ${this.formatAnalytics(analytics)}
            </div>
            <div class="analytics-footer" style="padding: 1rem 1.5rem; border-top: 1px solid var(--border-primary); display: flex; justify-content: flex-end;">
                <button class="btn-secondary" id="exportAnalyticsBtn">Export Report</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        const cleanup = () => {
            document.body.removeChild(overlay);
        };
        
        modal.querySelector('.analytics-close').addEventListener('click', cleanup);
        
        modal.querySelector('#exportAnalyticsBtn').addEventListener('click', async () => {
            if (window.aiAssistant?.chatLogger?.exporter) {
                const blob = await window.aiAssistant.chatLogger.exporter.exportAnalyticsReport(analytics, 'markdown');
                window.aiAssistant.chatLogger.exporter.downloadBlob(blob, 'analytics-report.md');
            }
            cleanup();
        });
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cleanup();
            }
        });
    }

    // Show notification
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // Format analytics for display
    formatAnalytics(analytics) {
        let html = '<div class="analytics-sections">';
        
        html += `
            <div class="analytics-section">
                <h3>Sessions</h3>
                <p>Total: ${analytics.sessions.total}</p>
                <p>Active: ${analytics.sessions.active}</p>
            </div>
        `;
        
        html += `
            <div class="analytics-section">
                <h3>Quality Metrics</h3>
                <p>Total Turns: ${analytics.quality.totalTurns}</p>
                <p>Avg Response Time: ${analytics.quality.averageResponseTime.toFixed(2)}s</p>
                <p>Success Rate: ${(analytics.quality.successRate * 100).toFixed(1)}%</p>
            </div>
        `;
        
        html += `
            <div class="analytics-section">
                <h3>Usage Patterns</h3>
                <p>Peak Hour: ${analytics.usage.peakHour}:00</p>
                <p>Text: ${analytics.usage.patterns.inputMethods.text} | Voice: ${analytics.usage.patterns.inputMethods.voice}</p>
            </div>
        `;
        
        if (analytics.models && analytics.models.length > 0) {
            html += `
                <div class="analytics-section">
                    <h3>Model Performance</h3>
                    ${analytics.models.map(m => `
                        <p>${m.model}: ${m.turns} turns, ${m.averageResponseTime}s avg</p>
                    `).join('')}
                </div>
            `;
        }
        
        html += '</div>';
        return html;
    }

    // Get model parameters for API calls
    getModelParameters() {
        return {
            temperature: this.getSetting('model', 'temperature'),
            top_p: this.getSetting('model', 'topP'),
            num_predict: this.getSetting('model', 'maxTokens'),
            seed: this.getSetting('model', 'seed')
        };
    }
    
    // Get voice and STT model from settings
    getSelectedVoice() {
        return this.getSetting('audio', 'voice') || 'af_heart';
    }
    
    getSelectedSTTModel() {
        return this.getSetting('audio', 'sttModel') || 'base';
    }
    
    // Switch tabs
    switchTab(tabName) {
        // Update tab buttons
        this.tabs.forEach(tab => {
            if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
            } else {
                tab.classList.remove('active');
                tab.setAttribute('aria-selected', 'false');
            }
        });
        
        // Update tab content
        this.tabContents.forEach(content => {
            if (content.dataset.content === tabName) {
                content.classList.add('active');
                content.setAttribute('aria-hidden', 'false');
            } else {
                content.classList.remove('active');
                content.setAttribute('aria-hidden', 'true');
            }
        });
        
        this.currentTab = tabName;
    }
    
    // Open settings modal
    open() {
        if (this.isOpen) return;
        
        this.isOpen = true;
        this.modal.classList.add('active');
        this.modal.setAttribute('aria-hidden', 'false');
        
        // Focus management
        const firstFocusable = this.modal.querySelector('.settings-tab');
        if (firstFocusable) {
            firstFocusable.focus();
        }
        
        // ADDED: Update stats if opening directly to logging tab
        if (this.currentTab === 'logging') {
            setTimeout(() => {
                this.updateStorageStats();
            }, 100);
        }

        // Trap focus within modal
        this.setupFocusTrap();
        
        console.log('Settings modal opened');
    }
    
    // Close settings modal
    close() {
        if (!this.isOpen) return;
        
        this.isOpen = false;
        this.modal.classList.remove('active');
        this.modal.setAttribute('aria-hidden', 'true');
        
        // Remove focus trap
        this.removeFocusTrap();
        
        console.log('Settings modal closed');
    }
    
    // Toggle settings modal
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
    
    // Setup focus trap for accessibility
    setupFocusTrap() {
        const focusableElements = this.modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        this.focusTrapHandler = (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            }
        };
        
        this.modal.addEventListener('keydown', this.focusTrapHandler);
    }
    
    // Remove focus trap
    removeFocusTrap() {
        if (this.focusTrapHandler) {
            this.modal.removeEventListener('keydown', this.focusTrapHandler);
            this.focusTrapHandler = null;
        }
    }
    
    // Add setting change listener
    addSettingChangeListener(callback) {
        if (typeof callback === 'function') {
            if (!this.settingChangeListeners) {
                this.settingChangeListeners = new Set();
            }
            this.settingChangeListeners.add(callback);
        }
    }
    
    // Remove setting change listener
    removeSettingChangeListener(callback) {
        if (this.settingChangeListeners) {
            this.settingChangeListeners.delete(callback);
        }
    }
    
    // Notify setting change listeners
    notifySettingChange(category, key, newValue, oldValue) {
        if (this.settingChangeListeners) {
            const event = {
                category,
                key,
                newValue,
                oldValue,
                timestamp: Date.now()
            };
            
            this.settingChangeListeners.forEach(callback => {
                try {
                    callback(event);
                } catch (error) {
                    console.error('Error in setting change listener:', error);
                }
            });
        }
    }
    
    // Get all settings
    getAllSettings() {
        return Object.fromEntries(this.settings);
    }
    
    // Export settings
    exportSettings() {
        return {
            settings: this.getAllSettings(),
            theme: this.themeManager.exportSettings(),
            timestamp: Date.now(),
            version: '1.0'
        };
    }
    
    // Import settings
    importSettings(data) {
        try {
            if (data.settings) {
                for (const [category, values] of Object.entries(data.settings)) {
                    for (const [key, value] of Object.entries(values)) {
                        this.setSetting(category, key, value);
                    }
                }
            }
            
            if (data.theme) {
                this.themeManager.importSettings(data.theme);
            }
            
            return { success: true, message: 'Settings imported successfully' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    // Cleanup
    cleanup() {
        console.log('Starting SettingsManager cleanup...');
        
        // Remove event listeners
        for (const [event, handler] of this.eventListeners.entries()) {
            document.removeEventListener(event, handler);
        }
        this.eventListeners.clear();
        
        // Remove focus trap
        this.removeFocusTrap();
        
        // Cleanup theme manager
        if (this.themeManager) {
            this.themeManager.cleanup();
        }
        
        // Remove modal from DOM
        if (this.modal && this.modal.parentNode) {
            this.modal.parentNode.removeChild(this.modal);
        }
        
        // Clear listeners
        if (this.settingChangeListeners) {
            this.settingChangeListeners.clear();
        }
        
        console.log('SettingsManager cleanup completed');
    }
}
