import { CONFIG } from '../config.js';

export class StatusManager {
    constructor() {
        this.statusMessage = document.getElementById(CONFIG.ELEMENTS.statusMessage);
        this.llmDot = document.getElementById(CONFIG.ELEMENTS.llmDot);
        this.ttsDot = document.getElementById(CONFIG.ELEMENTS.ttsDot);
        this.sttDot = document.getElementById(CONFIG.ELEMENTS.sttDot);
        this.turnCount = document.getElementById(CONFIG.ELEMENTS.turnCount);
        
        // Performance metric elements (still used for collecting data)
        this.performanceElements = {
            sttTime: document.getElementById('sttTime'),
            llmTime: document.getElementById('llmTime'),
            ttsTime: document.getElementById('ttsTime'),
            downloadTime: document.getElementById('downloadTime'),
            totalTime: document.getElementById('totalTime')
        };
        
        // NEW: Message queue system for performance metrics
        this.messageQueue = [];
        this.currentTimeout = null;
        this.performanceMetrics = {
            stt: '--',
            llm: '--', 
            tts: '--',
            total: '--'
        };
        
        // ADDED: Default timeout duration for all status messages
        this.defaultTimeoutDuration = 5000; // 5 seconds - make this configurable if needed
    }
    
    // MODIFIED: Update main status message with optional timeout
    updateStatus(message, type = 'info', autoTimeout = false) {
        // Clear any queued performance metrics when new message comes in
        this.clearMessageQueue();
        
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message ${type}`;
        
        // Ensure the status message is visible when there's content
        if (message.trim() !== '') {
            this.statusMessage.style.display = 'block';
        }
        
        // ADDED: Apply timeout if requested
        if (autoTimeout) {
            this.currentTimeout = setTimeout(() => {
                this.showQueuedPerformanceMetrics();
            }, this.defaultTimeoutDuration);
        }
    }
    
    // Update service status indicators
    updateServiceStatus(service, isOnline) {
        const statusClass = isOnline ? 'status-dot online' : 'status-dot offline';
        
        switch (service) {
            case 'llm':
                this.llmDot.className = statusClass;
                break;
            case 'tts':
                this.ttsDot.className = statusClass;
                break;
            case 'stt':
                this.sttDot.className = statusClass;
                break;
        }
    }
    
    // Set service status to checking
    setServiceChecking(service) {
        const statusClass = 'status-dot checking';
        
        switch (service) {
            case 'llm':
                this.llmDot.className = statusClass;
                break;
            case 'tts':
                this.ttsDot.className = statusClass;
                break;
            case 'stt':
                this.sttDot.className = statusClass;
                break;
        }
    }
    
    // Update turn count display
    updateTurnCount(turnCount) {
        this.turnCount.textContent = `${turnCount} turn${turnCount !== 1 ? 's' : ''}`;
    }
    
    // Update performance metrics (now stores data for later display)
    updatePerformanceMetric(metric, timeInSeconds) {
        // Update the hidden elements for backward compatibility
        if (this.performanceElements[metric]) {
            const label = metric.replace('Time', '').toUpperCase();
            this.performanceElements[metric].textContent = `${label}: ${timeInSeconds.toFixed(2)}s`;
        }
        
        // Store metrics for status display
        const metricKey = metric.replace('Time', '').toLowerCase();
        if (['stt', 'llm', 'tts', 'total'].includes(metricKey)) {
            this.performanceMetrics[metricKey] = timeInSeconds.toFixed(2);
        }
    }
    
    // Reset all performance metrics
    resetPerformanceMetrics() {
        // Reset hidden elements
        for (const [key, element] of Object.entries(this.performanceElements)) {
            const label = key.replace('Time', '').toUpperCase();
            element.textContent = `${label}: --s`;
        }
        
        // Reset stored metrics
        this.performanceMetrics = {
            stt: '--',
            llm: '--', 
            tts: '--',
            total: '--'
        };
        
        // Clear any queued performance display
        this.clearMessageQueue();
    }
    
    // Calculate and update total time
    updateTotalTime(startTime, sttTimeSeconds = 0) {
        const totalTime = (performance.now() - startTime) / 1000;
        const adjustedTotal = totalTime + sttTimeSeconds;
        this.updatePerformanceMetric('totalTime', adjustedTotal);
    }
    
    // Get current STT time for total calculation
    getCurrentSTTTime() {
        const sttText = this.performanceElements.sttTime.textContent;
        if (sttText !== 'STT: --s') {
            const match = sttText.match(/(\d+\.?\d*)/);
            return match ? parseFloat(match[1]) : 0;
        }
        return 0;
    }
    
    // MODIFIED: Show success status with consistent timeout behavior
    showSuccess(message, autoClearDelay = null) {
        // Use default timeout if not specified
        const timeoutDuration = autoClearDelay !== null ? autoClearDelay : this.defaultTimeoutDuration;
        
        this.updateStatus(message, 'success');
        
        if (timeoutDuration > 0) {
            // Clear any existing timeout
            this.clearMessageQueue();
            
            // Set timeout to show performance metrics directly
            this.currentTimeout = setTimeout(() => {
                this.showQueuedPerformanceMetrics();
            }, timeoutDuration);
        }
    }
    
    // MODIFIED: Show error status with timeout
    showError(message, autoClearDelay = null) {
        // Use default timeout if not specified
        const timeoutDuration = autoClearDelay !== null ? autoClearDelay : this.defaultTimeoutDuration;
        
        this.updateStatus(message, 'error');
        
        if (timeoutDuration > 0) {
            // Clear any existing timeout
            this.clearMessageQueue();
            
            // Set timeout to clear error message
            this.currentTimeout = setTimeout(() => {
                this.showQueuedPerformanceMetrics();
            }, timeoutDuration);
        }
    }
    
    // MODIFIED: Show info status with timeout
    showInfo(message, autoClearDelay = null) {
        // Use default timeout if not specified
        const timeoutDuration = autoClearDelay !== null ? autoClearDelay : this.defaultTimeoutDuration;
        
        this.updateStatus(message, 'info');
        
        if (timeoutDuration > 0) {
            // Clear any existing timeout
            this.clearMessageQueue();
            
            // Set timeout to clear info message
            this.currentTimeout = setTimeout(() => {
                this.showQueuedPerformanceMetrics();
            }, timeoutDuration);
        }
    }
    
    // ADDED: Method to set global timeout duration
    setTimeoutDuration(duration) {
        this.defaultTimeoutDuration = duration;
    }
    
    // ADDED: Method to show persistent message (no timeout)
    showPersistent(message, type = 'info') {
        this.updateStatus(message, type, false);
    }
    
    // NEW: Clear message queue and timeouts
    clearMessageQueue() {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
        this.messageQueue = [];
    }
    
    // NEW: Queue performance metrics for display after success message
    queuePerformanceMetrics() {
        // Performance metrics will be shown after the next success message clears
        // The actual display happens in showSuccess() timeout
        console.log('Performance metrics queued for display');
    }
    
    // NEW: Display performance metrics in status area
    showQueuedPerformanceMetrics() {
        // Format metrics as single line
        const metricsText = `STT: ${this.performanceMetrics.stt}s | LLM: ${this.performanceMetrics.llm}s | TTS: ${this.performanceMetrics.tts}s | Total: ${this.performanceMetrics.total}s`;
        
        // Display in status area with info styling and performance-metrics class for mobile font sizing
        this.statusMessage.textContent = metricsText;
        this.statusMessage.className = 'status-message info performance-metrics';
        
        // Force the status message to be visible
        this.statusMessage.style.display = 'block';
        this.statusMessage.style.visibility = 'visible';
        
        console.log('Performance metrics displayed in status area:', metricsText);
    }
    
    // NEW: Check if performance metrics are currently displayed
    isShowingPerformanceMetrics() {
        return this.statusMessage.textContent.includes('STT:') && 
               this.statusMessage.textContent.includes('LLM:') && 
               this.statusMessage.textContent.includes('TTS:');
    }
}