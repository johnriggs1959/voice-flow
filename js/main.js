// Main application file - orchestrates all components with enhanced memory management and chat logging
import { CONFIG } from './config.js';
import { ApiService } from './services/api-service.js';
import { AudioService } from './services/audio-service.js';
import { UIManager } from './ui/ui-manager.js';
import { StatusManager } from './ui/status-manager.js';
import { SettingsManager } from './ui/settings-manager.js';
import { ConversationManager } from './utils/conversation.js';
import { measureTime, validateInput, retryWithBackoff } from './utils/helpers.js';
import { ChatLogger } from './logging/chat-logger.js';

class AIAssistantApp {
    constructor() {
        // Initialize managers
        this.ui = new UIManager();
        this.status = new StatusManager();
        this.conversation = new ConversationManager();
        this.audio = new AudioService();
        this.settings = new SettingsManager();
        
        // Initialize chat logger after settings manager
        this.chatLogger = new ChatLogger(this.settings);
        
        // Model warming state
        this.currentModel = null;
        this.modelWarmingInProgress = false;
        this.modelWarmupPromise = null;
        
        // Service check intervals
        this.serviceCheckInterval = null;
        this.memoryMonitorInterval = null;
        
        // Performance monitoring
        this.performanceStats = {
            totalRequests: 0,
            totalErrors: 0,
            averageResponseTime: 0,
            lastError: null
        };
        
        // Initialize application
        this.init();
    }
    
    async warmUpCurrentModel(modelName = null) {
        // UPDATED: Get model from settings if not provided
        const targetModel = modelName || this.settings.getSelectedModel();
        
        if (!targetModel) {
            console.warn('No model to warm up');
            return false;
        }
        
        // Don't warm up the same model twice
        if (this.currentModel === targetModel) {
            console.log(`Model ${targetModel} already warmed up`);
            return true;
        }
        
        // Don't start multiple warmup processes
        if (this.modelWarmingInProgress) {
            console.log('Model warming already in progress, waiting...');
            return await this.modelWarmupPromise;
        }
        
        this.modelWarmingInProgress = true;
        this.modelWarmupPromise = this._performModelWarmup(targetModel);
        
        const result = await this.modelWarmupPromise;
        
        this.modelWarmingInProgress = false;
        this.modelWarmupPromise = null;
        
        return result;
    }

    async init() {
        console.log('Initializing AI Assistant Application...');
        
        // Set audio element reference using new method
        this.updateAudioElementReference();
        
        // Check browser support
        this.checkBrowserSupport();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initialize services
        await this.initializeServices();
        
        // Initialize hidden dropdowns with settings values
        this.initializeHiddenDropdowns();
        
        // Start monitoring
        this.startServiceMonitoring();
        this.startMemoryMonitoring();
        
        // Focus input
        this.ui.focusInput();
        
        console.log('Application initialized successfully');
    }
    
    // Update audio element reference
    updateAudioElementReference() {
        const audioElement = this.ui.getAudioElement();
        if (audioElement) {
            this.audio.setAudioElement(audioElement);
        }
    }
    
    // Initialize hidden dropdowns with values from settings
    initializeHiddenDropdowns() {
        // Set voice selection from settings
        const savedVoice = this.settings.getSelectedVoice();
        const voiceSelect = document.getElementById('voiceSelect');
        if (voiceSelect && savedVoice) {
            voiceSelect.value = savedVoice;
            console.log(`Initialized voice select with: ${savedVoice}`);
        }
        
        // Set STT model from settings
        const savedSTTModel = this.settings.getSelectedSTTModel();
        const sttModelSelect = document.getElementById('sttModelSelect');
        if (sttModelSelect && savedSTTModel) {
            sttModelSelect.value = savedSTTModel;
            console.log(`Initialized STT model select with: ${savedSTTModel}`);
        }
    }
    
    // Private method to perform the actual warmup
    async _performModelWarmup(modelName) {
        try {
            // Check if model is already loaded
            const isLoaded = await ApiService.checkModelStatus(modelName);
            
            if (isLoaded) {
                console.log(`✅ Model ${modelName} already loaded`);
                this.currentModel = modelName;
                this.status.showInfo(`Model ${modelName} ready`);
                return true;
            }
            
            // Show warming status
            this.status.showInfo(`Warming up model: ${modelName}...`);
            
            // Perform warmup
            const success = await ApiService.warmUpModel(modelName);
            
            if (success) {
                this.currentModel = modelName;
                this.status.showSuccess(`Model ${modelName} ready`, 3000);
                return true;
            } else {
                this.status.showError(`Failed to warm up model: ${modelName}`);
                return false;
            }
            
        } catch (error) {
            console.error('Model warmup error:', error);
            this.status.showError(`Model warmup failed: ${error.message}`);
            return false;
        }
    }

    checkBrowserSupport() {
        const support = this.audio.checkMediaDevicesSupport();
        this.ui.updateMicButtonState(false, support.supported, support.reason);
        
        // Log browser capabilities for debugging
        console.log('Browser Support Check:', {
            mediaDevices: support.supported,
            reason: support.reason,
            userAgent: navigator.userAgent.substring(0, 100) + '...'
        });
    }
    
    setupEventListeners() {
        this.ui.setupEventListeners({
            onInputChange: () => {
                // Input change handler (already handled by UI manager)
            },
            onSubmit: () => {
                this.processQuestion();
            },
            onMicClick: () => {
                this.handleMicrophoneClick();
            },
            onClear: () => {
                this.clearConversation();
            }
        });
        
        // REMOVED: Model change listener from UI - now handled through settings

        // Settings button event listener
        const settingsButton = document.getElementById('settingsButton');
        if (settingsButton) {
            settingsButton.addEventListener('click', () => {
                this.settings.toggle();
            });
        }
        
        // Settings change listeners
        this.settings.addSettingChangeListener((event) => {
            this.handleSettingChange(event);
        });
        
        // Window events for cleanup and memory management
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
        
        // Handle memory warnings (if supported)
        if ('memory' in performance) {
            window.addEventListener('memorypressure', () => {
                console.warn('Memory pressure detected by browser');
                this.handleMemoryPressure();
            });
        }
        
        // Handle visibility changes to pause/resume monitoring
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseMonitoring();
            } else {
                this.resumeMonitoring();
            }
        });
    }
        
    // UPDATED: Handle setting changes including model selection
    handleSettingChange(event) {
        const { category, key, newValue } = event;
        
        console.log(`Setting changed: ${category}.${key} = ${newValue}`);
        
        // Handle specific setting changes
        if (category === 'audio') {
            if (key === 'volume' && this.audio.audioElement) {
                this.audio.audioElement.volume = newValue;
            } else if (key === 'voice') {
                // Update hidden voice select for compatibility
                const voiceSelect = document.getElementById('voiceSelect');
                if (voiceSelect) {
                    voiceSelect.value = newValue;
                }
                console.log(`Voice changed to: ${newValue}`);
            } else if (key === 'sttModel') {
                // Update hidden STT model select for compatibility
                const sttModelSelect = document.getElementById('sttModelSelect');
                if (sttModelSelect) {
                    sttModelSelect.value = newValue;
                }
                console.log(`STT model changed to: ${newValue}`);
            }
        } else if (category === 'model') {
            if (key === 'selectedModel' && newValue) {
                console.log(`Model changed to: ${newValue}`);
                // Warm up new model in background
                if (newValue !== this.currentModel) {
                    this.warmUpCurrentModel(newValue);
                }
            } else {
                // Log other model parameter changes for debugging
                console.log(`Model parameter updated: ${key} = ${newValue}`);
            }
        }
        
        // Additional setting handlers can be added here
    }
        
    async initializeServices() {
        try {
            // Check all services with timeout
            await Promise.race([
                this.checkAllServices(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Service check timeout')), 15000)
                )
            ]);
            
            // Load available models
            const models = await ApiService.fetchAvailableModels();
            
            if (models.length === 0) {
                this.status.showError('No models available. Please check that Ollama is running and has models installed.');
                console.error('No models available from Ollama');
            } else {
                // Update both UI and settings with available models
                this.ui.populateModelDropdown(models);
                this.settings.updateAvailableModels(models);
                this.status.showSuccess(`Loaded ${models.length} model(s)`);
                
                // Get the selected model from settings
                const selectedModel = this.settings.getSelectedModel();
                
                if (selectedModel) {
                    console.log(`Warming up selected model: ${selectedModel}`);
                    this.warmUpCurrentModel(selectedModel);
                } else {
                    // Warm up the first (default) model
                    const firstModel = models[0].name;
                    console.log(`Auto-warming first model: ${firstModel}`);
                    this.warmUpCurrentModel(firstModel);
                }
            }
            
        } catch (error) {
            console.error('Service initialization error:', error);
            this.status.showError('Failed to initialize services: ' + error.message);
            this.performanceStats.totalErrors++;
            this.performanceStats.lastError = error.message;
        }
    }
    
    async checkAllServices() {
        // Check LLM service
        this.status.setServiceChecking('llm');
        const llmOnline = await ApiService.checkOllamaStatus();
        this.status.updateServiceStatus('llm', llmOnline);
        
        // Check TTS service
        this.status.setServiceChecking('tts');
        const ttsOnline = await ApiService.checkTTSStatus();
        this.status.updateServiceStatus('tts', ttsOnline);
        
        // Check STT service
        this.status.setServiceChecking('stt');
        const sttOnline = await ApiService.checkSTTStatus();
        this.status.updateServiceStatus('stt', sttOnline);
    }
    
    startServiceMonitoring() {
        // Monitor main services
        this.serviceCheckInterval = setInterval(async () => {
            try {
                await this.checkAllServices();
            } catch (error) {
                console.error('Service monitoring error:', error);
            }
        }, CONFIG.SERVICE_CHECK_INTERVAL);
    }
    
    startMemoryMonitoring() {
        // Monitor memory usage every 2 minutes
        this.memoryMonitorInterval = setInterval(() => {
            this.monitorMemoryUsage();
        }, 2 * 60 * 1000);
    }
    
    pauseMonitoring() {
        if (this.serviceCheckInterval) {
            clearInterval(this.serviceCheckInterval);
            this.serviceCheckInterval = null;
        }
        if (this.memoryMonitorInterval) {
            clearInterval(this.memoryMonitorInterval);
            this.memoryMonitorInterval = null;
        }
        console.log('Monitoring paused (tab hidden)');
    }
    
    resumeMonitoring() {
        if (!this.serviceCheckInterval) {
            this.startServiceMonitoring();
        }
        if (!this.memoryMonitorInterval) {
            this.startMemoryMonitoring();
        }
        console.log('Monitoring resumed (tab visible)');
    }
    
    monitorMemoryUsage() {
        // Get memory stats from various components
        const conversationStats = this.conversation.getMemoryStats();
        const apiStats = ApiService.getRequestStats();
        const audioStats = this.audio.reportMemoryUsage(); // This will log to console
        
        // Check for memory pressure indicators
        const memoryPressure = (
            conversationStats.memoryPressure > 0.8 ||
            apiStats.activeRequests > 10 ||
            apiStats.cacheSize > 40
        );
        
        if (memoryPressure) {
            console.warn('Memory pressure detected, performing cleanup...');
            this.handleMemoryPressure();
        }
        
        // Log comprehensive memory stats every 10 minutes
        if (Date.now() % (10 * 60 * 1000) < 2 * 60 * 1000) {
            console.log('=== Memory Usage Report ===');
            console.log('Conversation:', conversationStats);
            console.log('API Service:', apiStats);
            console.log('Performance:', this.performanceStats);
            console.log('UI Messages:', {
                tracked: this.ui.getMessageCount(),
                inDOM: this.ui.getTotalMessagesInDOM()
            });
            
            // Browser memory info (if available)
            if (performance.memory) {
                console.log('Browser Memory:', {
                    used: `${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
                    total: `${(performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
                    limit: `${(performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`
                });
            }
        }
    }
    
    handleMemoryPressure() {
        console.log('Handling memory pressure...');
        
        // Clear API cache
        const clearedCache = ApiService.clearCache();
        
        // Force conversation pruning if needed
        const conversationStats = this.conversation.getMemoryStats();
        if (conversationStats.memoryPressure > 1.0) {
            this.conversation.performSmartPruning();
        }
        
        // Clean up old audio URLs
        this.audio.performPeriodicCleanup();
        
        // Cancel any non-essential requests
        const apiStats = ApiService.getRequestStats();
        if (apiStats.activeRequests > 5) {
            // Keep only the most recent requests
            console.log('Cancelling excess requests due to memory pressure');
        }
        
        this.status.showInfo(`Memory cleanup completed (cleared ${clearedCache} cache entries)`);
    }
    
    async handleMicrophoneClick() {
        const support = this.audio.checkMediaDevicesSupport();
        if (!support.supported) {
            this.status.showError(`Speech input unavailable: ${support.reason}`);
            return;
        }
        
        if (!this.audio.isRecording) {
            await this.startRecording();
        } else {
            this.stopRecording();
        }
    }
    
    async startRecording() {
        try {
            this.ui.updateMicButtonState(true);
            this.status.showInfo('Recording... Click microphone to stop');
            
            // Start recording and wait for it to complete
            const audioBlob = await this.audio.startRecording();
            
            // Recording completed, process it
            await this.processRecording(audioBlob);
            
        } catch (error) {
            console.error('Recording error:', error);
            this.status.showError(error.message);
            this.ui.updateMicButtonState(false);
            this.performanceStats.totalErrors++;
            this.performanceStats.lastError = error.message;
        }
    }
    
    stopRecording() {
        this.audio.stopRecording();
        this.ui.updateMicButtonState(false);
        this.status.showInfo('Transcribing...');
    }
    
    // Use settings manager for STT model with chat logging
    async processRecording(audioBlob) {
        try {
            // Start tracking performance for voice input
            this.chatLogger.startTurnTracking('voice');
            
            // Get STT model from settings instead of UI
            const sttModel = this.settings.getSelectedSTTModel();
            
            // Transcribe audio and measure time
            const { result: transcription, duration: sttDuration } = await measureTime(async () => {
                return await ApiService.transcribeAudio(audioBlob, sttModel);
            });
            
            // Track STT performance in logger
            this.chatLogger.trackSTTPerformance(sttDuration, sttModel);
            
            // Update UI with transcription
            this.ui.setInputValue(transcription);
            this.status.updatePerformanceMetric('sttTime', sttDuration);
            this.status.showInfo('Transcription complete - Processing question...');
            
            // Automatically process the question
            await this.processQuestion();
            
        } catch (error) {
            console.error('Transcription error:', error);
            this.status.showError('Transcription failed: ' + error.message);
            this.performanceStats.totalErrors++;
            this.performanceStats.lastError = error.message;
            
            // Log error event
            this.chatLogger.logEvent('transcription_error', {
                error: error.message,
                model: this.settings.getSelectedSTTModel()
            });
        } finally {
            this.ui.updateMicButtonState(false);
        }
    }
    
    // UPDATED: Process question with model from settings
    async processQuestion() {
        const question = this.ui.getInputValue();
        const validation = validateInput(question, CONFIG.MAX_INPUT_LENGTH);
        
        if (!validation.valid) {
            this.status.showError(validation.error);
            return;
        }
        
        // Get model from settings instead of UI
        const model = this.settings.getSelectedModel();
        if (!model) {
            this.status.showError('No model selected. Please select a model in Settings → Model.');
            this.ui.setInputState(true);
            return;
        }
        
        // Start turn tracking if not already started (for text input)
        if (!this.chatLogger.currentTurnMetrics.startTime) {
            this.chatLogger.startTurnTracking('text');
        }
        
        // Ensure model is warmed up before proceeding
        if (this.currentModel !== model) {
            this.status.showInfo('Preparing model...');
            const warmed = await this.warmUpCurrentModel(model);
            if (!warmed) {
                this.status.showError('Failed to prepare model. Please try again.');
                this.ui.setInputState(true);
                return;
            }
        }

        // Disable input and clear it
        this.ui.setInputState(false);
        this.ui.clearInput();
        
        // Show typing indicator
        this.ui.showTypingIndicator();
        this.status.showInfo('AI is thinking...');
        
        // Add to conversation
        this.conversation.addUserMessage(validation.text);
        
        const startTime = performance.now();
        this.performanceStats.totalRequests++;
        
        try {
            // Get AI response with timeout and dynamic parameters
            const { result: response, duration: llmDuration } = await measureTime(async () => {
                // Get voice from settings
                const voice = this.settings.getSelectedVoice();
                const messages = this.conversation.getMessagesWithSystem(voice);
                
                // Get current model parameters from settings
                const modelParams = this.settings.getModelParameters();
                
                console.log('Using model parameters:', modelParams);
                
                return await Promise.race([
                    ApiService.sendChatRequest(messages, model, modelParams),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('LLM request timeout')), 120000)
                    )
                ]);
            });
            
        // Track LLM performance in logger
        const modelParams = this.settings.getModelParameters();
        this.chatLogger.trackLLMPerformance(llmDuration, model, modelParams);

        // Hide typing indicator
        this.ui.hideTypingIndicator();

        this.status.updatePerformanceMetric('llmTime', llmDuration);
        this.conversation.addAssistantMessage(response);

        // Add messages to chat interface
        this.ui.updateCurrentExchange(validation.text, response);

        // UPDATED: Update turn count with explicit sync check
        const currentTurnCount = this.conversation.getTurnCount();
        this.status.updateTurnCount(currentTurnCount);

        // ADDED: Ensure UI message count doesn't get out of sync
        const uiMessageCount = this.ui.getTotalMessagesInDOM();
        const conversationMessageCount = this.conversation.messages.length;

        // Log for debugging if there's a mismatch
        if (Math.abs(uiMessageCount - conversationMessageCount) > 2) {
            console.warn(`Message count mismatch - UI: ${uiMessageCount}, Conversation: ${conversationMessageCount}, Turn count: ${currentTurnCount}`);
        }

        // Generate speech
        await this.generateAndPlaySpeech(response);
            
            // Complete turn tracking and log the full conversation turn
            const totalTime = (performance.now() - startTime) / 1000;
            this.chatLogger.completeTurnTracking(
                validation.text,
                response,
                {
                    voice: this.settings.getSelectedVoice(),
                    speechRate: this.settings.getSetting('audio', 'speechRate'),
                    autoplay: this.settings.getSetting('audio', 'autoplay'),
                    volume: this.settings.getSetting('audio', 'volume'),
                    theme: document.documentElement.getAttribute('data-theme'),
                    serviceStatus: {
                        llm: this.status.llmDot.classList.contains('online'),
                        tts: this.status.ttsDot.classList.contains('online'),
                        stt: this.status.sttDot.classList.contains('online')
                    }
                }
            );
            
            // Update performance stats
            this.performanceStats.averageResponseTime = 
                (this.performanceStats.averageResponseTime * (this.performanceStats.totalRequests - 1) + totalTime) / 
                this.performanceStats.totalRequests;
            
            // Update total time display
            const sttTime = this.status.getCurrentSTTTime();
            this.status.updateTotalTime(startTime, sttTime);
            
            // CHANGED: Queue performance metrics instead of displaying them immediately
            // This will show success message first, then performance metrics after it clears
            this.status.queuePerformanceMetrics();
            
        } catch (error) {
            console.error('Processing error:', error);
            this.status.showError('Error: ' + error.message);
            this.performanceStats.totalErrors++;
            this.performanceStats.lastError = error.message;
            
            // Log error event
            this.chatLogger.logEvent('processing_error', {
                error: error.message,
                model: model,
                stage: 'llm_response'
            });
            
            // Hide typing indicator on error
            this.ui.hideTypingIndicator();
            
            // Remove user message on error
            this.conversation.removeLastUserMessage();
        } finally {
            this.ui.setInputState(true);
        }
    }
    
    // Use settings manager for voice selection with TTS tracking
    async generateAndPlaySpeech(text) {
        try {
            // Get voice from settings instead of UI
            const voice = this.settings.getSelectedVoice();
            
            // Generate speech and measure time
            const { result: audioBlob, duration: ttsDuration } = await measureTime(async () => {
                return await Promise.race([
                    ApiService.generateSpeech(text, voice),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('TTS request timeout')), 60000)
                    )
                ]);
            });
            
            // Track TTS performance in logger
            this.chatLogger.trackTTSPerformance(ttsDuration, voice, audioBlob.size);
            
            this.status.updatePerformanceMetric('ttsTime', ttsDuration);
            
            // Download/create URL and measure time
            const { result: audioUrl, duration: downloadDuration } = await measureTime(async () => {
                return this.audio.createAudioUrl(audioBlob);
            });
            
            this.status.updatePerformanceMetric('downloadTime', downloadDuration);
            
            // Show audio player and attempt playback
            this.ui.toggleAudioPlayer(true);
            
            // Update audio element reference to latest message
            this.updateAudioElementReference();
            
            this.status.showInfo('Processing audio...');
            
            // Check autoplay setting
            const autoplay = this.settings.getSetting('audio', 'autoplay');
            // Get the speech rate setting
            const speechRate = this.settings.getSetting('audio', 'speechRate') || 1.0;
            
            let playResult = { success: false, message: 'Audio ready for manual play' };
            
            if (autoplay) {
                // Pass speech rate to audio service
                playResult = await this.audio.playAudio(audioUrl, speechRate);
            } else {
                // Just load the audio without playing, but still set speech rate
                if (this.audio.audioElement) {
                    this.audio.audioElement.src = audioUrl;
                    this.audio.audioElement.playbackRate = speechRate;
                }
                playResult = { success: true, message: 'Audio loaded (autoplay disabled)' };
            }
            
            if (playResult.success) {
                this.status.showSuccess('Response generated successfully');
            } else {
                this.status.showInfo(playResult.message);
            }
            
        } catch (error) {
            console.error('Speech generation error:', error);
            this.status.showError('Speech generation failed: ' + error.message);
            this.performanceStats.totalErrors++;
            this.performanceStats.lastError = error.message;
            
            // Log TTS error
            this.chatLogger.logEvent('tts_error', {
                error: error.message,
                voice: this.settings.getSelectedVoice()
            });
        }
    }
    
    // Export chat logs
    async exportChatLogs(format = 'json', options = {}) {
        try {
            const exportResult = await this.chatLogger.exportLogs(options);
            this.status.showSuccess(`Exported ${exportResult.records} records as ${exportResult.format}`);
            return exportResult;
        } catch (error) {
            console.error('Export failed:', error);
            this.status.showError('Failed to export logs: ' + error.message);
        }
    }
    
    // Get analytics summary
    getAnalytics() {
        return this.chatLogger.getAnalyticsSummary();
    }
        
    // Clear conversation including chat interface
    clearConversation() {
        // Stop any audio and clean up
        this.audio.cleanup();
        
        // Clear conversation state
        this.conversation.clear();
        
        // Reset chat interface
        this.ui.resetExchangeDisplay();
        this.status.updateTurnCount(0);
        this.status.resetPerformanceMetrics();
        
        // Clear some performance stats
        this.performanceStats.lastError = null;
        
        // Focus input
        this.ui.focusInput();
        
        this.status.showInfo('Conversation cleared');
        
        console.log(`Conversation cleared. Messages in DOM: ${this.ui.getTotalMessagesInDOM()}`);
    }
    
    cleanup() {
        console.log('Starting application cleanup...');
        
        // Clear intervals
        if (this.serviceCheckInterval) {
            clearInterval(this.serviceCheckInterval);
            this.serviceCheckInterval = null;
        }
        if (this.memoryMonitorInterval) {
            clearInterval(this.memoryMonitorInterval);
            this.memoryMonitorInterval = null;
        }
        
        // Cleanup all services
        this.audio.cleanup();
        this.conversation.cleanup();
        ApiService.cleanup();
        
        // Cleanup chat logger
        if (this.chatLogger) {
            this.chatLogger.cleanup();
        }
        
        // Cleanup settings
        if (this.settings) {
            this.settings.cleanup();
        }
        
        console.log('Application cleanup completed');
    }
    
    // Get application statistics with logging stats
    getAppStats() {
        return {
            performance: this.performanceStats,
            conversation: this.conversation.getMemoryStats(),
            api: ApiService.getRequestStats(),
            ui: {
                messageCount: this.ui.getMessageCount(),
                messagesInDOM: this.ui.getTotalMessagesInDOM()
            },
            settings: this.settings ? this.settings.getAllSettings() : {},
            logging: this.chatLogger ? {
                storage: this.chatLogger.getStorageStats(),
                analytics: this.chatLogger.getAnalyticsSummary()
            } : {},
            uptime: Date.now() - (window.appStartTime || Date.now())
        };
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.appStartTime = Date.now();
    window.aiAssistant = new AIAssistantApp();
    
    // Expose stats for debugging
    window.getAppStats = () => window.aiAssistant.getAppStats();
    
    // Expose cleanup for debugging
    window.forceCleanup = () => window.aiAssistant.handleMemoryPressure();
    
    // Expose chat debugging functions
    window.getChatStats = () => ({
        messages: window.aiAssistant.ui.getTotalMessagesInDOM(),
        tracked: window.aiAssistant.ui.getMessageCount(),
        conversationTurns: window.aiAssistant.conversation.getTurnCount()
    });
    
    // Expose logging functions for debugging
    window.exportLogs = (format) => window.aiAssistant.exportChatLogs(format);
    window.getAnalytics = () => window.aiAssistant.getAnalytics();
    window.clearOldLogs = () => window.aiAssistant.chatLogger.clearOldLogs();
});
