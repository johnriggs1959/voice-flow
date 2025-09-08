// Chat Logger - Main logging coordinator for conversation analytics
// Path: js/logging/chat-logger.js

import { CONFIG } from '../config.js';
import { generateId } from '../utils/helpers.js';
import { StorageManager } from './storage-manager.js';
import { AnalyticsCollector } from './analytics-collector.js';
import { DataExporter } from './data-exporter.js';
import { PrivacyManager } from './privacy-manager.js';

export class ChatLogger {
    constructor(settingsManager) {
        this.settings = settingsManager;
        this.storage = new StorageManager();
        this.analytics = new AnalyticsCollector();
        this.exporter = new DataExporter();
        this.privacy = new PrivacyManager(settingsManager);
        
        // Session management
        this.currentSessionId = null;
        this.sessionStartTime = null;
        this.turnNumber = 0;
        
        // Performance tracking
        this.currentTurnMetrics = {};
        
        // Logging state
        this.isLoggingEnabled = true;
        this.logBuffer = [];
        this.bufferFlushInterval = null;
        this.isFlushingBuffer = false;
        
        // Error tracking
        this.consecutiveFailures = 0;
        this.maxConsecutiveFailures = 5;
        this.backoffDelay = 1000; // Start with 1 second
        
        // Initialize
        this.initialize();
    }
    
    // Initialize logger
    initialize() {
        // Check if logging is enabled
        this.isLoggingEnabled = this.settings.getSetting('logging', 'enabled') !== false;
        
        if (!this.isLoggingEnabled) {
            console.log('Chat logging is disabled');
            return;
        }
        
        // Start new session
        this.startNewSession();
        
        // Setup buffer flushing with error handling
        this.setupBufferFlushing();
        
        // Load existing analytics
        this.analytics.loadAnalytics();
        
        console.log('ChatLogger initialized');
    }
    
    // Start a new logging session
    startNewSession() {
        // Generate new session ID
        this.currentSessionId = `sess_${Date.now()}_${generateId()}`;
        this.sessionStartTime = Date.now();
        this.turnNumber = 0;
        
        // Clear any pending metrics
        this.currentTurnMetrics = {};
        
        console.log(`Started new logging session: ${this.currentSessionId}`);
        
        // Log session start (with error handling)
        this.logEvent('session_start', {
            sessionId: this.currentSessionId,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            clearedPrevious: true // Flag to indicate this follows a clear operation
        }).catch(error => {
            console.warn('Failed to log session start:', error);
        });
    }
    
    // Setup buffer flushing for batch writes
    setupBufferFlushing() {
        // Clear any existing interval
        if (this.bufferFlushInterval) {
            clearInterval(this.bufferFlushInterval);
        }
        
        // Flush buffer every 30 seconds or when it reaches 10 entries
        this.bufferFlushInterval = setInterval(async () => {
            if (this.logBuffer.length > 0 && !this.isFlushingBuffer) {
                await this.flushBuffer();
            }
        }, 30000);
    }
    
    // Log conversation turn with full metadata
    async logConversationTurn(data) {
        if (!this.isLoggingEnabled || !this.privacy.canLog('conversation')) {
            return null;
        }
        
        try {
            this.turnNumber++;
            
            const logEntry = {
                sessionId: this.currentSessionId,
                turnNumber: this.turnNumber,
                timestamp: new Date().toISOString(),
                conversation: {
                    userInput: this.privacy.sanitize(data.userInput),
                    aiResponse: this.privacy.sanitize(data.aiResponse),
                    inputMethod: data.inputMethod || 'text' // Use explicit input method
                },
                modelConfig: {
                    model: data.model,
                    temperature: data.temperature,
                    topP: data.topP,
                    maxTokens: data.maxTokens,
                    seed: data.seed
                },
                audioConfig: {
                    voice: data.voice,
                    sttModel: data.sttModel,
                    speechRate: data.speechRate,
                    autoplay: data.autoplay,
                    volume: data.volume
                },
                performance: {
                    sttTime: data.sttTime || null,
                    llmTime: data.llmTime || null,
                    ttsTime: data.ttsTime || null,
                    downloadTime: data.downloadTime || null,
                    totalTime: data.totalTime || null,
                    audioFileSize: data.audioFileSize || null
                },
                context: {
                    theme: data.theme || document.documentElement.getAttribute('data-theme'),
                    browser: this.getBrowserInfo(),
                    serviceStatus: data.serviceStatus || {},
                    errorStates: data.errors || [],
                    memoryUsage: this.getMemoryInfo()
                },
                quality: {
                    userInputLength: data.userInput?.length || 0,
                    responseLength: data.aiResponse?.length || 0,
                    responseTime: data.totalTime || 0,
                    hasErrors: (data.errors?.length || 0) > 0
                }
            };
            
            console.log('Logging conversation turn with input method:', logEntry.conversation.inputMethod);
            
            // Add to buffer
            this.logBuffer.push(logEntry);
            
            // Update analytics (with error handling)
            try {
                this.analytics.addTurn(logEntry);
            } catch (error) {
                console.warn('Failed to update analytics:', error);
            }
            
            // FORCE immediate flush for each conversation to ensure IndexedDB is updated
            console.log('Forcing immediate flush to IndexedDB...');
            await this.flushBuffer();

            // Trigger UI update if settings modal is open
            if (window.aiAssistant?.settings?.modal?.classList.contains('active')) {
                window.aiAssistant.settings.updateStorageStats();
            }
            
            // Trigger analytics hooks (with error handling)
            try {
                this.processAnalyticsHooks(logEntry);
            } catch (error) {
                console.warn('Failed to process analytics hooks:', error);
            }
            
            return logEntry;
            
        } catch (error) {
            console.error('Failed to log conversation turn:', error);
            return null;
        }
    }
    
    // Start tracking performance for current turn
    startTurnTracking(inputMethod = 'text') {
        this.currentTurnMetrics = {
            startTime: performance.now(),
            inputMethod: inputMethod,
            timestamps: {
                start: Date.now()
            }
        };
    }
    
    // Track STT performance
    trackSTTPerformance(duration, model) {
        if (this.currentTurnMetrics) {
            this.currentTurnMetrics.sttTime = duration;
            this.currentTurnMetrics.sttModel = model;
            this.currentTurnMetrics.timestamps.sttComplete = Date.now();
        }
    }
    
    // Track LLM performance
    trackLLMPerformance(duration, model, params) {
        if (this.currentTurnMetrics) {
            this.currentTurnMetrics.llmTime = duration;
            this.currentTurnMetrics.model = model;
            this.currentTurnMetrics.modelParams = params;
            this.currentTurnMetrics.timestamps.llmComplete = Date.now();
        }
    }
    
    // Track TTS performance
    trackTTSPerformance(duration, voice, fileSize) {
        if (this.currentTurnMetrics) {
            this.currentTurnMetrics.ttsTime = duration;
            this.currentTurnMetrics.voice = voice;
            this.currentTurnMetrics.audioFileSize = fileSize;
            this.currentTurnMetrics.timestamps.ttsComplete = Date.now();
        }
    }
    
    // Complete turn tracking
    completeTurnTracking(userInput, aiResponse, additionalData = {}) {
        if (!this.currentTurnMetrics) return;
        
        try {
            const totalTime = (performance.now() - this.currentTurnMetrics.startTime) / 1000;
            
            const turnData = {
                userInput,
                aiResponse,
                inputMethod: this.currentTurnMetrics.inputMethod,
                sttTime: this.currentTurnMetrics.sttTime,
                llmTime: this.currentTurnMetrics.llmTime,
                ttsTime: this.currentTurnMetrics.ttsTime,
                totalTime,
                model: this.currentTurnMetrics.model,
                sttModel: this.currentTurnMetrics.sttModel,
                voice: this.currentTurnMetrics.voice,
                audioFileSize: this.currentTurnMetrics.audioFileSize,
                ...this.currentTurnMetrics.modelParams,
                ...additionalData
            };
            
            // Log the completed turn (async, don't wait)
            this.logConversationTurn(turnData).catch(error => {
                console.warn('Failed to complete turn tracking:', error);
            });
            
            // Reset metrics
            this.currentTurnMetrics = {};
            
        } catch (error) {
            console.error('Error completing turn tracking:', error);
            this.currentTurnMetrics = {};
        }
    }
    
    // Flush log buffer to storage with better error handling
    async flushBuffer() {
        if (this.logBuffer.length === 0 || this.isFlushingBuffer) {
            console.log('Flush skipped: buffer empty or already flushing');
            return;
        }
        
        this.isFlushingBuffer = true;
        const bufferCopy = [...this.logBuffer];
        
        console.log(`Attempting to flush ${bufferCopy.length} log entries to storage`);
        
        try {
            // Save to storage with retry logic
            const saved = await this.storage.saveLogs(bufferCopy, this.currentSessionId);
            
            if (saved) {
                console.log(`✓ Successfully flushed ${bufferCopy.length} log entries to IndexedDB`);
                this.logBuffer = [];
                this.consecutiveFailures = 0;
                this.backoffDelay = 1000; // Reset backoff
            } else {
                console.warn('Storage save returned false - logs not saved');
                throw new Error('Storage save operation failed');
            }
            
        } catch (error) {
            console.error('Failed to flush log buffer:', error);
            
            this.consecutiveFailures++;
            
            // If too many failures, clear some buffer to prevent memory issues
            if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
                console.warn(`Too many consecutive failures (${this.consecutiveFailures}), clearing old buffer entries`);
                // Keep only the most recent 20 entries
                this.logBuffer = this.logBuffer.slice(-20);
                this.consecutiveFailures = 0;
            } else {
                // Exponential backoff - increase delay
                this.backoffDelay = Math.min(this.backoffDelay * 2, 30000); // Max 30 seconds
                console.log(`Will retry buffer flush in ${this.backoffDelay}ms`);
                
                // Schedule retry
                setTimeout(() => {
                    if (this.logBuffer.length > 0) {
                        this.flushBuffer();
                    }
                }, this.backoffDelay);
            }
            
        } finally {
            this.isFlushingBuffer = false;
        }
    }
    
    // Process analytics hooks for real-time insights
    processAnalyticsHooks(logEntry) {
        try {
            // Check for quality thresholds
            if (logEntry.performance.totalTime > 10) {
                this.logEvent('slow_response', {
                    turnNumber: logEntry.turnNumber,
                    totalTime: logEntry.performance.totalTime
                }).catch(error => console.warn('Failed to log slow response event:', error));
            }
            
            // Track error patterns
            if (logEntry.quality.hasErrors) {
                this.analytics.trackError(logEntry.context.errorStates);
            }
            
            // REMOVED: Duplicate usage patterns call - this was causing double counting
            
        } catch (error) {
            console.warn('Error processing analytics hooks:', error);
        }
    }
    
    // Log custom event with error handling
    async logEvent(eventType, data) {
        if (!this.isLoggingEnabled || !this.privacy.canLog('events')) {
            return null;
        }
        
        try {
            const event = {
                type: eventType,
                sessionId: this.currentSessionId,
                timestamp: new Date().toISOString(),
                data: this.privacy.sanitize(data)
            };
            
            // Save event (async, with error handling)
            const savedEvent = await this.storage.saveEvent(event);
            
            // Track in analytics (with error handling)
            try {
                this.analytics.trackEvent(event);
            } catch (error) {
                console.warn('Failed to track event in analytics:', error);
            }
            
            return savedEvent;
            
        } catch (error) {
            console.error(`Failed to log event '${eventType}':`, error);
            return null;
        }
    }
    
    // Get browser information
    getBrowserInfo() {
        try {
            const ua = navigator.userAgent;
            let browser = 'Unknown';
            
            if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
            else if (ua.indexOf('Safari') > -1) browser = 'Safari';
            else if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
            else if (ua.indexOf('Edge') > -1) browser = 'Edge';
            
            return `${browser}/${navigator.platform}`;
        } catch (error) {
            return 'Unknown/Unknown';
        }
    }
    
    // Get memory information
    getMemoryInfo() {
        try {
            if (performance.memory) {
                return {
                    used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                    total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                    limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
                };
            }
            return null;
        } catch (error) {
            return null;
        }
    }
    
    // Export logs with error handling
    async exportLogs(options = {}) {
        try {
            const logs = await this.storage.getLogs(options);
            return this.exporter.export(logs, options.format || 'json');
        } catch (error) {
            console.error('Failed to export logs:', error);
            throw error;
        }
    }
    
    // Get analytics summary
    getAnalyticsSummary() {
        try {
            return this.analytics.getSummary();
        } catch (error) {
            console.error('Failed to get analytics summary:', error);
            return {
                error: error.message,
                totalTurns: 0,
                sessions: 0,
                performance: {}
            };
        }
    }
    
    // Clear old logs based on retention policy
    async clearOldLogs() {
        try {
            const retentionDays = this.settings.getSetting('logging', 'retentionDays') || 30;
            const cutoffDate = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
            
            const cleared = await this.storage.clearLogsBeforeDate(cutoffDate);
            console.log(`Cleared ${cleared} old log entries`);
            
            return cleared;
        } catch (error) {
            console.error('Failed to clear old logs:', error);
            return 0;
        }
    }
    
    // Enable/disable logging
    setLoggingEnabled(enabled) {
        this.isLoggingEnabled = enabled;
        this.settings.setSetting('logging', 'enabled', enabled);
        
        if (enabled) {
            this.startNewSession();
            this.setupBufferFlushing();
        } else {
            // Flush any remaining logs before disabling
            this.flushBuffer().catch(error => {
                console.warn('Failed to flush buffer while disabling logging:', error);
            });
            
            if (this.bufferFlushInterval) {
                clearInterval(this.bufferFlushInterval);
                this.bufferFlushInterval = null;
            }
        }
    }
    
    // Get storage statistics with error handling
    async getStorageStats() {
        try {
            return await this.storage.getStats();
        } catch (error) {
            console.error('Failed to get storage stats:', error);
            return {
                conversations: 0,
                events: 0,
                analytics: 0,
                error: error.message
            };
        }
    }
    
    // Cleanup with better error handling
    async cleanup() {
        console.log('Starting ChatLogger cleanup...');
        
        try {
            // Flush any remaining logs
            await this.flushBuffer();
            
            // Clear interval
            if (this.bufferFlushInterval) {
                clearInterval(this.bufferFlushInterval);
                this.bufferFlushInterval = null;
            }
            
            // Log session end (with error handling)
            if (this.currentSessionId && this.sessionStartTime) {
                await this.logEvent('session_end', {
                    sessionId: this.currentSessionId,
                    duration: Date.now() - this.sessionStartTime,
                    totalTurns: this.turnNumber
                }).catch(error => {
                    console.warn('Failed to log session end:', error);
                });
            }
            
            // Cleanup components
            await this.storage.cleanup();
            
            try {
                this.analytics.cleanup();
            } catch (error) {
                console.warn('Failed to cleanup analytics:', error);
            }
            
            try {
                this.privacy.cleanup();
            } catch (error) {
                console.warn('Failed to cleanup privacy manager:', error);
            }
            
            console.log('ChatLogger cleanup completed');
            
        } catch (error) {
            console.error('Error during ChatLogger cleanup:', error);
        }
    }
}
