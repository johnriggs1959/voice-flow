import { CONFIG } from '../config.js';

export class AudioService {
    constructor() {
        this.audioElement = null;
        this.mediaRecorder = null;
        this.mediaStream = null;
        this.isRecording = false;
        this.recordingPromise = null;
        this.recordingResolve = null;
        this.recordingTimeout = null;
        
        // Memory management for audio URLs
        this.audioUrls = new Set();
        this.urlCleanupTimeouts = new Map();
        
        // Track event listeners for cleanup
        this.eventListeners = new Map();
        
        // Auto-cleanup timer
        this.setupPeriodicCleanup();
    }
    
    // Set audio element reference and setup its event listeners
    setAudioElement(audioElement) {
        if (this.audioElement) {
            this.removeAudioEventListeners();
        }
        
        this.audioElement = audioElement;
        this.setupAudioEventListeners();
    }
    
    // Setup audio element event listeners with cleanup tracking
    setupAudioEventListeners() {
        if (!this.audioElement) return;
        
        const listeners = {
            'loadeddata': () => {
                console.log('Audio loaded, attempting autoplay...');
            },
            'canplaythrough': () => {
                console.log('Audio can play through');
            },
            'error': (e) => {
                console.error('Audio playback error:', e);
            },
            'ended': () => {
                console.log('Audio playback ended');
                // Auto-cleanup URL after playback ends
                this.scheduleUrlCleanup(this.audioElement.src, CONFIG.AUDIO_CLEANUP_DELAY);
            }
        };
        
        // Add listeners and track them for cleanup
        for (const [event, handler] of Object.entries(listeners)) {
            this.audioElement.addEventListener(event, handler);
            this.eventListeners.set(`audio_${event}`, { element: this.audioElement, event, handler });
        }
    }
    
    // Remove audio element event listeners
    removeAudioEventListeners() {
        for (const [key, { element, event, handler }] of this.eventListeners.entries()) {
            if (key.startsWith('audio_')) {
                element.removeEventListener(event, handler);
                this.eventListeners.delete(key);
            }
        }
    }
    
    // Enhanced URL creation with automatic tracking
    createAudioUrl(audioBlob) {
        const url = URL.createObjectURL(audioBlob);
        this.audioUrls.add(url);
        
        // Schedule automatic cleanup after a reasonable time (5 minutes)
        this.scheduleUrlCleanup(url, 5 * 60 * 1000);
        
        console.log(`Created audio URL: ${url} (Total URLs: ${this.audioUrls.size})`);
        return url;
    }
    
    // Schedule URL cleanup with timeout tracking
    scheduleUrlCleanup(url, delay) {
        // Clear existing timeout if present
        if (this.urlCleanupTimeouts.has(url)) {
            clearTimeout(this.urlCleanupTimeouts.get(url));
        }
        
        const timeoutId = setTimeout(() => {
            this.cleanupUrl(url);
            this.urlCleanupTimeouts.delete(url);
        }, delay);
        
        this.urlCleanupTimeouts.set(url, timeoutId);
    }
    
    // Clean up a specific URL
    cleanupUrl(url) {
        if (this.audioUrls.has(url)) {
            try {
                URL.revokeObjectURL(url);
                this.audioUrls.delete(url);
                console.log(`Cleaned up audio URL: ${url} (Remaining: ${this.audioUrls.size})`);
            } catch (error) {
                console.warn('Error revoking URL:', error);
            }
        }
        
        // Clear any pending timeout
        if (this.urlCleanupTimeouts.has(url)) {
            clearTimeout(this.urlCleanupTimeouts.get(url));
            this.urlCleanupTimeouts.delete(url);
        }
    }
    
    // Periodic cleanup to prevent memory leaks
    setupPeriodicCleanup() {
        // Run cleanup every 10 minutes
        this.cleanupInterval = setInterval(() => {
            this.performPeriodicCleanup();
        }, 10 * 60 * 1000);
    }
    
    // Perform periodic cleanup of unused resources
    performPeriodicCleanup() {
        const urlCount = this.audioUrls.size;
        const timeoutCount = this.urlCleanupTimeouts.size;
        
        if (urlCount > 0 || timeoutCount > 0) {
            console.log(`Periodic cleanup check: ${urlCount} URLs, ${timeoutCount} timeouts`);
            
            // Clean up URLs that are no longer referenced by audio element
            if (this.audioElement && this.audioElement.src) {
                const currentSrc = this.audioElement.src;
                for (const url of this.audioUrls) {
                    if (url !== currentSrc) {
                        this.cleanupUrl(url);
                    }
                }
            }
        }
        
        // Report memory usage (for debugging)
        this.reportMemoryUsage();
    }
    
    // Report current memory usage
    reportMemoryUsage() {
        console.log(`Audio Service Memory Usage:
            - Tracked URLs: ${this.audioUrls.size}
            - Cleanup timeouts: ${this.urlCleanupTimeouts.size}
            - Event listeners: ${this.eventListeners.size}
            - Recording active: ${this.isRecording}
            - Media stream active: ${!!this.mediaStream}`);
    }
    
    // Enhanced recording with better resource management
    async startRecording() {
        if (this.isRecording) {
            throw new Error('Recording already in progress');
        }
        
        try {
            // Clean up any existing stream
            this.stopMediaStream();
            
            // Get media stream
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            // Determine best MIME type
            const mimeType = this.getBestMimeType();
            
            // Create media recorder
            this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });
            
            const audioChunks = [];
            
            // Setup recording promise
            this.recordingPromise = new Promise((resolve, reject) => {
                this.recordingResolve = resolve;
                
                // Setup event listeners with cleanup tracking
                const recordingListeners = {
                    'dataavailable': (event) => {
                        if (event.data.size > 0) {
                            audioChunks.push(event.data);
                        }
                    },
                    'stop': () => {
                        const audioBlob = new Blob(audioChunks, { type: mimeType });
                        this.cleanupRecordingResources();
                        resolve(audioBlob);
                    },
                    'error': (error) => {
                        this.cleanupRecordingResources();
                        reject(error);
                    }
                };
                
                // Add listeners and track them
                for (const [event, handler] of Object.entries(recordingListeners)) {
                    this.mediaRecorder.addEventListener(event, handler);
                    this.eventListeners.set(`recording_${event}`, { 
                        element: this.mediaRecorder, 
                        event, 
                        handler 
                    });
                }
                
                // Setup recording timeout
                this.recordingTimeout = setTimeout(() => {
                    if (this.isRecording) {
                        console.warn('Recording timeout reached');
                        this.stopRecording();
                    }
                }, CONFIG.RECORDING_TIMEOUT);
            });
            
            // Start recording
            this.mediaRecorder.start(100); // Collect data every 100ms
            this.isRecording = true;
            
            console.log('Recording started with MIME type:', mimeType);
            return this.recordingPromise;
            
        } catch (error) {
            this.cleanupRecordingResources();
            throw new Error(`Failed to start recording: ${error.message}`);
        }
    }
    
    // Stop recording with proper cleanup
    stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) {
            return;
        }
        
        try {
            if (this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
        } catch (error) {
            console.error('Error stopping media recorder:', error);
            this.cleanupRecordingResources();
        }
    }
    
    // Clean up recording resources
    cleanupRecordingResources() {
        this.isRecording = false;
        
        // Clear recording timeout
        if (this.recordingTimeout) {
            clearTimeout(this.recordingTimeout);
            this.recordingTimeout = null;
        }
        
        // Remove recording event listeners
        for (const [key, { element, event, handler }] of this.eventListeners.entries()) {
            if (key.startsWith('recording_') && element) {
                try {
                    element.removeEventListener(event, handler);
                } catch (error) {
                    console.warn('Error removing recording event listener:', error);
                }
                this.eventListeners.delete(key);
            }
        }
        
        // Clean up media recorder
        if (this.mediaRecorder) {
            try {
                if (this.mediaRecorder.state !== 'inactive') {
                    this.mediaRecorder.stop();
                }
            } catch (error) {
                console.warn('Error stopping media recorder during cleanup:', error);
            }
            this.mediaRecorder = null;
        }
        
        // Stop media stream
        this.stopMediaStream();
        
        // Reset promise references
        this.recordingPromise = null;
        this.recordingResolve = null;
    }
    
    // Stop and clean up media stream
    stopMediaStream() {
        if (this.mediaStream) {
            try {
                this.mediaStream.getTracks().forEach(track => {
                    track.stop();
                    console.log(`Stopped ${track.kind} track`);
                });
            } catch (error) {
                console.warn('Error stopping media stream tracks:', error);
            }
            this.mediaStream = null;
        }
    }
    
    // Get best supported MIME type
    getBestMimeType() {
        for (const mimeType of CONFIG.AUDIO_MIME_TYPES) {
            if (MediaRecorder.isTypeSupported(mimeType)) {
                return mimeType;
            }
        }
        return 'audio/webm'; // Fallback
    }
    
    // Enhanced audio playback with better error handling
    async playAudio(audioUrl, speechRate = 1.0) {
    if (!this.audioElement) {
        return { success: false, message: 'No audio element available' };
    }
    
    try {
        // Clean up previous audio URL if different
        if (this.audioElement.src && this.audioElement.src !== audioUrl) {
            this.scheduleUrlCleanup(this.audioElement.src, CONFIG.AUDIO_CLEANUP_DELAY);
        }
        
        this.audioElement.src = audioUrl;
        
        // Apply speech rate
        this.audioElement.playbackRate = speechRate;
        console.log(`Setting audio playback rate to: ${speechRate}x`);
        
        // Try to play with timeout
        const playPromise = this.audioElement.play();
        
        if (playPromise !== undefined) {
            await Promise.race([
                playPromise,
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Play timeout')), 5000)
                )
            ]);
            return { success: true, message: `Audio playing at ${speechRate}x speed` };
        }
        
        return { success: true, message: 'Audio loaded (autoplay may be blocked)' };
        
    } catch (error) {
        console.error('Audio playback error:', error);
        return { 
            success: false, 
            message: `Playback failed: ${error.message}. Audio file is ready for manual play.` 
        };
    }
}
    
    // Check media devices support
    checkMediaDevicesSupport() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return { 
                supported: false, 
                reason: 'MediaDevices API not supported' 
            };
        }
        
        if (!window.isSecureContext) {
            return { 
                supported: false, 
                reason: 'Secure context required (HTTPS or localhost)' 
            };
        }
        
        if (typeof MediaRecorder === 'undefined') {
            return { 
                supported: false, 
                reason: 'MediaRecorder not supported' 
            };
        }
        
        return { supported: true };
    }
    
    // Comprehensive cleanup method
    cleanup() {
        console.log('Starting AudioService cleanup...');
        
        // Stop any active recording
        if (this.isRecording) {
            this.stopRecording();
        }
        
        // Clean up all URLs immediately
        for (const url of this.audioUrls) {
            try {
                URL.revokeObjectURL(url);
            } catch (error) {
                console.warn('Error revoking URL during cleanup:', error);
            }
        }
        this.audioUrls.clear();
        
        // Clear all cleanup timeouts
        for (const timeoutId of this.urlCleanupTimeouts.values()) {
            clearTimeout(timeoutId);
        }
        this.urlCleanupTimeouts.clear();
        
        // Remove all event listeners
        for (const [key, { element, event, handler }] of this.eventListeners.entries()) {
            try {
                element.removeEventListener(event, handler);
            } catch (error) {
                console.warn(`Error removing event listener ${key}:`, error);
            }
        }
        this.eventListeners.clear();
        
        // Clear periodic cleanup interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        // Reset audio element
        if (this.audioElement) {
            this.audioElement.src = '';
            this.audioElement.load();
        }
        
        // Clean up recording resources
        this.cleanupRecordingResources();
        
        console.log('AudioService cleanup completed');
    }
}
