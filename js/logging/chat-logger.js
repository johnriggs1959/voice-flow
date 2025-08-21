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
        
        // Setup buffer flushing
        this.setupBufferFlushing();
        
        // Load existing analytics
        this.analytics.loadAnalytics();
        
        console.log('ChatLogger initialized');
    }
    
    // Start a new logging session
    startNewSession() {
        this.currentSessionId = `sess_${Date.now()}_${generateId()}`;
        this.sessionStartTime = Date.now();
        this.turnNumber = 0;
        
        console.log(`Started new logging session: ${this.currentSessionId}`);
        
        // Log session start
        this.logEvent('session_start', {
            sessionId: this.currentSessionId,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language
        });
    }
    
    // Setup buffer flushing for batch writes
    setupBufferFlushing() {
        // Flush buffer every 30 seconds or when it reaches 10 entries
        this.bufferFlushInterval = setInterval(() => {
            if (this.logBuffer.length > 0) {
                this.flushBuffer();
            }
        }, 30000);
    }
    
    // Log conversation turn with full metadata
    async logConversationTurn(data) {
        if (!this.isLoggingEnabled || !this.privacy.canLog('conversation')) {
            return;
        }
        
        this.turnNumber++;
        
        const logEntry = {
            sessionId: this.currentSessionId,
            turnNumber: this.turnNumber,
            timestamp: new Date().toISOString(),
            conversation: {
                userInput: this.privacy.sanitize(data.userInput),
                aiResponse: this.privacy.sanitize(data.aiResponse),
                inputMethod: data.inputMethod || 'text'
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
        
        // Add to buffer
        this.logBuffer.push(logEntry);
        
        // Update analytics
        this.analytics.addTurn(logEntry);
        
        // Flush if buffer is getting large
        if (this.logBuffer.length >= 10) {
            await this.flushBuffer();
        }
        
        // Trigger analytics hooks
        this.processAnalyticsHooks(logEntry);
        
        return logEntry;
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
        
        // Log the completed turn
        this.logConversationTurn(turnData);
        
        // Reset metrics
        this.currentTurnMetrics = {};
    }
    
    // Flush log buffer to storage
    async flushBuffer() {
        if (this.logBuffer.length === 0) return;
        
        try {
            // Save to storage
            const saved = await this.storage.saveLogs(this.logBuffer, this.currentSessionId);
            
            if (saved) {
                console.log(`Flushed ${this.logBuffer.length} log entries to storage`);
                this.logBuffer = [];
            }
        } catch (error) {
            console.error('Failed to flush log buffer:', error);
            
            // Keep only last 50 entries if storage fails
            if (this.logBuffer.length > 50) {
                this.logBuffer = this.logBuffer.slice(-50);
            }
        }
    }
    
    // Process analytics hooks for real-time insights
    processAnalyticsHooks(logEntry) {
        // Check for quality thresholds
        if (logEntry.performance.totalTime > 10) {
            this.logEvent('slow_response', {
                turnNumber: logEntry.turnNumber,
                totalTime: logEntry.performance.totalTime
            });
        }
        
        // Track error patterns
        if (logEntry.quality.hasErrors) {
            this.analytics.trackError(logEntry.context.errorStates);
        }
        
        // Track usage patterns
        this.analytics.updateUsagePatterns({
            hour: new Date().getHours(),
            dayOfWeek: new Date().getDay(),
            inputMethod: logEntry.conversation.inputMethod,
            model: logEntry.modelConfig.model
        });
    }
    
    // Log custom event
    logEvent(eventType, data) {
        if (!this.isLoggingEnabled || !this.privacy.canLog('events')) {
            return;
        }
        
        const event = {
            type: eventType,
            sessionId: this.currentSessionId,
            timestamp: new Date().toISOString(),
            data: this.privacy.sanitize(data)
        };
        
        this.storage.saveEvent(event);
        this.analytics.trackEvent(event);
    }
    
    // Get browser information
    getBrowserInfo() {
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        
        if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
        else if (ua.indexOf('Safari') > -1) browser = 'Safari';
        else if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
        else if (ua.indexOf('Edge') > -1) browser = 'Edge';
        
        return `${browser}/${navigator.platform}`;
    }
    
    // Get memory information
    getMemoryInfo() {
        if (performance.memory) {
            return {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
            };
        }
        return null;
    }
    
    // Export logs
    async exportLogs(options = {}) {
        const logs = await this.storage.getLogs(options);
        return this.exporter.export(logs, options.format || 'json');
    }
    
    // Get analytics summary
    getAnalyticsSummary() {
        return this.analytics.getSummary();
    }
    
    // Clear old logs based on retention policy
    async clearOldLogs() {
        const retentionDays = this.settings.getSetting('logging', 'retentionDays') || 30;
        const cutoffDate = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
        
        const cleared = await this.storage.clearLogsBeforeDate(cutoffDate);
        console.log(`Cleared ${cleared} old log entries`);
        
        return cleared;
    }
    
    // Enable/disable logging
    setLoggingEnabled(enabled) {
        this.isLoggingEnabled = enabled;
        this.settings.setSetting('logging', 'enabled', enabled);
        
        if (enabled) {
            this.startNewSession();
            this.setupBufferFlushing();
        } else {
            this.flushBuffer();
            if (this.bufferFlushInterval) {
                clearInterval(this.bufferFlushInterval);
                this.bufferFlushInterval = null;
            }
        }
    }
    
    // Get storage statistics
    getStorageStats() {
        return this.storage.getStats();
    }
    
    // Cleanup
    async cleanup() {
        console.log('Starting ChatLogger cleanup...');
        
        // Flush any remaining logs
        await this.flushBuffer();
        
        // Clear interval
        if (this.bufferFlushInterval) {
            clearInterval(this.bufferFlushInterval);
            this.bufferFlushInterval = null;
        }
        
        // Log session end
        this.logEvent('session_end', {
            sessionId: this.currentSessionId,
            duration: Date.now() - this.sessionStartTime,
            totalTurns: this.turnNumber
        });
        
        // Cleanup components
        await this.storage.cleanup();
        this.analytics.cleanup();
        this.privacy.cleanup();
        
        console.log('ChatLogger cleanup completed');
    }
}
