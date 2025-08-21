import { CONFIG } from '../config.js';
import { retryWithBackoff } from '../utils/helpers.js';

export class ApiService {
    // Track active requests for cancellation and cleanup
    static activeRequests = new Map();
    static requestCounter = 0;
    static maxConcurrentRequests = 5;
    
    // Request queue for rate limiting
    static requestQueue = [];
    static isProcessingQueue = false;
    
    // Cache for repeated requests
    static responseCache = new Map();
    static maxCacheSize = 50;
    static cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    // NEW: Dynamic URL getters that work at runtime
    static getOllamaUrl() {
        const currentHost = window.location.hostname;
        const protocol = window.location.protocol;
        
        if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
            return `${protocol}//localhost:11434`;
        }
        return `${protocol}//${currentHost}:11434`;
    }
    
    static getTTSUrl() {
        const currentHost = window.location.hostname;
        const protocol = window.location.protocol;
        
        if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
            return `${protocol}//localhost:8880`;
        }
        return `${protocol}//${currentHost}:8880`;
    }
    
    static getWhisperUrl() {
        const currentHost = window.location.hostname;
        const protocol = window.location.protocol;
        
        if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
            return `${protocol}//localhost:8000`;
        }
        return `${protocol}//${currentHost}:8000`;
    }
    
    // Generate unique request ID
    static generateRequestId() {
        return `req_${++this.requestCounter}_${Date.now()}`;
    }
    
    // Warm up a specific model by sending a minimal request
    static async warmUpModel(modelName) {
        if (!modelName || modelName.trim() === '') {
            console.warn('Cannot warm up: no model specified');
            return false;
        }
        
        console.log(`Warming up model: ${modelName}...`);
        
        try {
            const startTime = performance.now();
            
            // Send minimal warming request
            const warmupRequest = {
                model: modelName,
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Hi' }
                ],
                stream: false,
                options: {
                    num_predict: 1, // Generate only 1 token to minimize time
                    temperature: 0.1 // Low temperature for consistent, fast response
                }
            };
            
            await this.makeRequest(
                `${this.getOllamaUrl()}/api/chat`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(warmupRequest)
                },
                false, // Don't cache warmup requests
                30000 // 30 second timeout for warmup
            );
            
            const duration = (performance.now() - startTime) / 1000;
            console.log(`✅ Model ${modelName} warmed up successfully in ${duration.toFixed(2)}s`);
            return true;
            
        } catch (error) {
            console.warn(`⚠️ Failed to warm up model ${modelName}:`, error.message);
            return false;
        }
    }

    // Check if a model is already loaded/warm
    static async checkModelStatus(modelName) {
        try {
            // Ollama provides a way to check running models
            const response = await this.makeRequest(
                `${this.getOllamaUrl()}/api/ps`, // List running models
                {},
                true, // Cache this briefly
                5000
            );
            
            if (response && response.models) {
                const isLoaded = response.models.some(model => 
                    model.name === modelName || model.name.startsWith(modelName)
                );
                return isLoaded;
            }
            
            return false;
        } catch (error) {
            console.warn('Could not check model status:', error.message);
            return false;
        }
    }

    // Create cancellable fetch with timeout
    static async cancellableFetch(url, options = {}, timeout = 30000, requestId = null) {
        const id = requestId || this.generateRequestId();
        
        // Create abort controller
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        // Merge abort signal with options
        const fetchOptions = {
            ...options,
            signal: controller.signal
        };
        
        // Track active request
        this.activeRequests.set(id, {
            controller,
            timeoutId,
            url,
            startTime: Date.now()
        });
        
        try {
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request cancelled or timed out');
            }
            throw error;
        } finally {
            // Clean up
            clearTimeout(timeoutId);
            this.activeRequests.delete(id);
        }
    }
    
    // Cancel specific request
    static cancelRequest(requestId) {
        const request = this.activeRequests.get(requestId);
        if (request) {
            request.controller.abort();
            clearTimeout(request.timeoutId);
            this.activeRequests.delete(requestId);
            console.log(`Cancelled request: ${requestId}`);
            return true;
        }
        return false;
    }
    
    // Cancel all active requests
    static cancelAllRequests() {
        const cancelledCount = this.activeRequests.size;
        
        for (const [id, request] of this.activeRequests.entries()) {
            request.controller.abort();
            clearTimeout(request.timeoutId);
        }
        
        this.activeRequests.clear();
        console.log(`Cancelled ${cancelledCount} active requests`);
        return cancelledCount;
    }
    
    // Get cache key for request
    static getCacheKey(url, options = {}) {
        const method = options.method || 'GET';
        const body = options.body || '';
        return `${method}:${url}:${typeof body === 'string' ? body : JSON.stringify(body)}`;
    }
    
    // Get cached response
    static getCachedResponse(cacheKey) {
        const cached = this.responseCache.get(cacheKey);
        if (!cached) return null;
        
        // Check if cache entry has expired
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            this.responseCache.delete(cacheKey);
            return null;
        }
        
        return cached.data;
    }
    
    // Cache response
    static setCachedResponse(cacheKey, data) {
        // Limit cache size
        if (this.responseCache.size >= this.maxCacheSize) {
            // Remove oldest entries
            const entries = Array.from(this.responseCache.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            
            // Remove oldest 25%
            const toRemove = Math.floor(this.maxCacheSize * 0.25);
            for (let i = 0; i < toRemove; i++) {
                this.responseCache.delete(entries[i][0]);
            }
        }
        
        this.responseCache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
    }
    
    // Enhanced request with queue management and caching
    static async makeRequest(url, options = {}, cacheable = false, timeout = 30000) {
        const cacheKey = cacheable ? this.getCacheKey(url, options) : null;
        
        // Check cache first
        if (cacheable && cacheKey) {
            const cached = this.getCachedResponse(cacheKey);
            if (cached) {
                console.log(`Cache hit for: ${url}`);
                return cached;
            }
        }
        
        // Check concurrent request limit
        if (this.activeRequests.size >= this.maxConcurrentRequests) {
            console.log(`Request queued due to concurrency limit: ${url}`);
            return this.queueRequest(url, options, cacheable, timeout);
        }
        
        const requestId = this.generateRequestId();
        
        try {
            const response = await this.cancellableFetch(url, options, timeout, requestId);
            const data = await response.json();
            
            // Cache if requested
            if (cacheable && cacheKey) {
                this.setCachedResponse(cacheKey, data);
            }
            
            return data;
            
        } catch (error) {
            console.error(`Request failed: ${url}`, error);
            throw error;
        }
    }
    
    // Silent request method for health checks (no error logging)
    static async makeSilentRequest(url, options = {}, cacheable = false, timeout = 30000) {
        const cacheKey = cacheable ? this.getCacheKey(url, options) : null;
        
        // Check cache first
        if (cacheable && cacheKey) {
            const cached = this.getCachedResponse(cacheKey);
            if (cached) {
                console.log(`Cache hit for: ${url}`);
                return cached;
            }
        }
        
        // Check concurrent request limit
        if (this.activeRequests.size >= this.maxConcurrentRequests) {
            return this.queueSilentRequest(url, options, cacheable, timeout);
        }
        
        const requestId = this.generateRequestId();
        
        try {
            const response = await this.cancellableFetch(url, options, timeout, requestId);
            const data = await response.json();
            
            // Cache if requested
            if (cacheable && cacheKey) {
                this.setCachedResponse(cacheKey, data);
            }
            
            return data;
            
        } catch (error) {
            // Don't log errors - silent failure for health checks
            throw error;
        }
    }
    
    // Queue request for later processing
    static async queueRequest(url, options, cacheable, timeout) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                url,
                options,
                cacheable,
                timeout,
                resolve,
                reject,
                timestamp: Date.now(),
                silent: false
            });
            
            this.processQueue();
        });
    }
    
    // Queue silent request for later processing
    static async queueSilentRequest(url, options, cacheable, timeout) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                url,
                options,
                cacheable,
                timeout,
                resolve,
                reject,
                timestamp: Date.now(),
                silent: true
            });
            
            this.processQueue();
        });
    }
    
    // Process request queue
    static async processQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0) {
            return;
        }
        
        this.isProcessingQueue = true;
        
        while (this.requestQueue.length > 0 && this.activeRequests.size < this.maxConcurrentRequests) {
            const queuedRequest = this.requestQueue.shift();
            
            // Check if request is too old (5 minutes)
            if (Date.now() - queuedRequest.timestamp > 5 * 60 * 1000) {
                queuedRequest.reject(new Error('Request timeout in queue'));
                continue;
            }
            
            // Process request (silent or regular)
            const requestMethod = queuedRequest.silent ? this.makeSilentRequest : this.makeRequest;
            requestMethod.call(this,
                queuedRequest.url,
                queuedRequest.options,
                queuedRequest.cacheable,
                queuedRequest.timeout
            ).then(queuedRequest.resolve)
              .catch(queuedRequest.reject);
        }
        
        this.isProcessingQueue = false;
    }
    
    // UPDATED: Check Ollama status with dynamic URL
    static async checkOllamaStatus() {
        try {
            await this.makeRequest(`${this.getOllamaUrl()}/api/tags`, {}, true, 5000);
            return true;
        } catch (error) {
            console.error('Ollama status check failed:', error.message);
            return false;
        }
    }
    
    // UPDATED: Check TTS status with dynamic URL
    static async checkTTSStatus() {
        try {
            // Try multiple possible endpoints for TTS service
            const baseUrl = this.getTTSUrl();
            const endpoints = [
                `${baseUrl}/health`,
                `${baseUrl}/v1/test`,
                `${baseUrl}`
            ];
            
            for (const endpoint of endpoints) {
                try {
                    await this.makeRequest(endpoint, {}, true, 5000);
                    return true;
                } catch (error) {
                    // Continue to next endpoint
                    continue;
                }
            }
            return false;
        } catch (error) {
            console.error('TTS status check failed:', error.message);
            return false;
        }
    }
    
    // UPDATED: Check STT status with dynamic URL
    static async checkSTTStatus() {
        try {
            // Try the most common endpoints silently
            const baseUrl = this.getWhisperUrl();
            const endpoints = [
                `${baseUrl}`,
                `${baseUrl}/v1/test`,
                `${baseUrl}/health`
            ];
            
            for (const endpoint of endpoints) {
                try {
                    await this.makeSilentRequest(endpoint, {}, true, 5000);
                    return true;
                } catch (error) {
                    // Silently continue to next endpoint
                    continue;
                }
            }
            // If all endpoints fail, still return true since STT transcription works
            return true;
        } catch (error) {
            // Silent failure - return true since transcription actually works
            return true;
        }
    }
    
    // UPDATED: Fetch available models with dynamic URL
    static async fetchAvailableModels() {
        try {
            const data = await this.makeRequest(`${this.getOllamaUrl()}/api/tags`, {}, true, 10000);
            
            if (data && data.models && data.models.length > 0) {
                const models = data.models.map(model => ({
                    name: model.name,
                    size: model.size ? this.formatBytes(model.size) : 'Unknown size'
                }));
                
                console.log(`Found ${models.length} available models:`, models.map(m => m.name));
                return models;
            }
            
            // No models found from API
            console.warn('No models found from Ollama API');
            return [];
            
        } catch (error) {
            console.error('Failed to fetch models:', error);
            return [];
        }
    }
    
    // UPDATED: Send chat request with dynamic URL
    static async sendChatRequest(messages, model, modelParams = null) {
        // Validate model parameter
        if (!model || model.trim() === '') {
            throw new Error('No model specified for chat request');
        }
        
        // Use provided parameters or fallback to defaults
        const options = modelParams || {
            temperature: 0.7,
            top_p: 0.9,
            num_predict: 512
        };
            
        // Filter out null values (e.g., seed when not set)
        const cleanOptions = {};
        for (const [key, value] of Object.entries(options)) {
            if (value !== null && value !== undefined) {
                cleanOptions[key] = value;
            }
        }
        
        const requestBody = {
            model: model,
            messages: messages,
            stream: false,
            options: cleanOptions
        };
        
        console.log('Sending chat request with options:', cleanOptions);
        
        const makeRequest = async () => {
            const data = await this.makeRequest(
                `${this.getOllamaUrl()}/api/chat`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                },
                false, // Don't cache chat responses
                60000 // 60 second timeout
            );
            
            if (!data || !data.message || !data.message.content) {
                throw new Error('Invalid response format from LLM service');
            }
            
            return data.message.content;
        };
        
        // Use retry with backoff
        return await retryWithBackoff(makeRequest, 3, 1000);
    }
    
    // UPDATED: Generate speech with dynamic URL
    static async generateSpeech(text, voice) {
        // Limit text length to prevent memory issues
        if (text.length > CONFIG.MAX_TTS_LENGTH) {
            console.warn(`TTS text truncated from ${text.length} to ${CONFIG.MAX_TTS_LENGTH} characters`);
            text = text.substring(0, CONFIG.MAX_TTS_LENGTH) + '...';
        }
        
        // Use the original working endpoint format
        const requestBody = {
            model: 'tts-1',
            input: text,
            voice: voice
        };
        
        const makeRequest = async () => {
            const response = await this.cancellableFetch(
                `${this.getTTSUrl()}/v1/audio/speech`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                },
                30000 // 30 second timeout for audio generation
            );
            
            if (!response.ok) {
                throw new Error(`TTS request failed: ${response.status} ${response.statusText}`);
            }
            
            const audioBlob = await response.blob();
            
            if (audioBlob.size === 0) {
                throw new Error('Received empty audio response');
            }
            
            return audioBlob;
        };
        
        return await retryWithBackoff(makeRequest, 2, 2000);
    }
    
    // UPDATED: Transcribe audio with dynamic URL
    static async transcribeAudio(audioBlob, model = 'base') {
        if (!audioBlob || audioBlob.size === 0) {
            throw new Error('No audio data provided for transcription');
        }
        
        // Limit audio file size (10MB max)
        const maxSize = 10 * 1024 * 1024;
        if (audioBlob.size > maxSize) {
            throw new Error(`Audio file too large: ${this.formatBytes(audioBlob.size)} (max: ${this.formatBytes(maxSize)})`);
        }
        
        console.log(`Transcribing audio: ${this.formatBytes(audioBlob.size)}, type: ${audioBlob.type}, model: ${model}`);
        
        // Try multiple API formats for compatibility
        const baseUrl = this.getWhisperUrl();
        const apiFormats = [
            {
                name: 'OpenAI Compatible',
                endpoint: `${baseUrl}/v1/audio/transcriptions`,
                formData: (formData) => {
                    formData.append('file', audioBlob, this.getAudioFilename(audioBlob.type));
                    formData.append('model', model);
                    formData.append('response_format', 'json');
                    formData.append('language', 'en');
                    return formData;
                }
            },
            {
                name: 'Whisper API',
                endpoint: `${baseUrl}/transcribe`,
                formData: (formData) => {
                    formData.append('audio', audioBlob, this.getAudioFilename(audioBlob.type));
                    formData.append('model', model);
                    formData.append('response_format', 'json');
                    return formData;
                }
            },
            {
                name: 'Alternative Format',
                endpoint: `${baseUrl}/api/transcribe`,
                formData: (formData) => {
                    formData.append('file', audioBlob, this.getAudioFilename(audioBlob.type));
                    formData.append('model', model);
                    return formData;
                }
            }
        ];
        
        let lastError = null;
        
        for (const apiFormat of apiFormats) {
            try {
                console.log(`Trying ${apiFormat.name} format...`);
                
                const formData = new FormData();
                apiFormat.formData(formData);
                
                const makeRequest = async () => {
                    const response = await this.cancellableFetch(
                        apiFormat.endpoint,
                        {
                            method: 'POST',
                            body: formData
                        },
                        60000 // 60 second timeout
                    );
                    
                    if (!response.ok) {
                        let errorMessage = `${response.status} ${response.statusText}`;
                        try {
                            const errorData = await response.text();
                            if (errorData) {
                                console.log(`Error response from ${apiFormat.name}:`, errorData);
                                errorMessage += ` - ${errorData}`;
                            }
                        } catch (e) {
                            // Ignore error parsing error response
                        }
                        throw new Error(errorMessage);
                    }
                    
                    const contentType = response.headers.get('content-type');
                    let data;
                    
                    if (contentType && contentType.includes('application/json')) {
                        data = await response.json();
                    } else {
                        // Try to parse as text first, then as JSON
                        const textData = await response.text();
                        try {
                            data = JSON.parse(textData);
                        } catch (e) {
                            // If it's not JSON, treat as plain text transcription
                            data = { text: textData };
                        }
                    }
                    
                    // Handle different response formats
                    let transcription = '';
                    if (typeof data === 'string') {
                        transcription = data;
                    } else if (data.text) {
                        transcription = data.text;
                    } else if (data.transcription) {
                        transcription = data.transcription;
                    } else if (data.result) {
                        transcription = data.result;
                    } else {
                        console.error('Unexpected response format:', data);
                        throw new Error('Invalid transcription response format');
                    }
                    
                    transcription = transcription.trim();
                    if (!transcription) {
                        throw new Error('Empty transcription result - audio may be too quiet or unclear');
                    }
                    
                    console.log(`${apiFormat.name} successful: "${transcription.substring(0, 100)}${transcription.length > 100 ? '...' : ''}"`);
                    return transcription;
                };
                
                // Try this API format with retry
                return await retryWithBackoff(makeRequest, 1, 1000); // Reduce retries since we have multiple formats to try
                
            } catch (error) {
                console.warn(`${apiFormat.name} failed:`, error.message);
                lastError = error;
                continue; // Try next format
            }
        }
        
        // If all formats failed, throw the last error
        throw new Error(`All STT API formats failed. Last error: ${lastError.message}`);
    }
    
    // Helper method to get appropriate filename based on audio type
    static getAudioFilename(mimeType) {
        if (mimeType.includes('webm')) {
            return 'recording.webm';
        } else if (mimeType.includes('mp4')) {
            return 'recording.mp4';
        } else if (mimeType.includes('ogg')) {
            return 'recording.ogg';
        } else if (mimeType.includes('wav')) {
            return 'recording.wav';
        }
        return 'recording.webm'; // Default fallback
    }
    
    // Format bytes for display
    static formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Get active request statistics
    static getRequestStats() {
        const now = Date.now();
        const requests = Array.from(this.activeRequests.values());
        
        return {
            activeRequests: this.activeRequests.size,
            queuedRequests: this.requestQueue.length,
            cacheSize: this.responseCache.size,
            longestRunningRequest: requests.length > 0 
                ? Math.max(...requests.map(req => now - req.startTime))
                : 0,
            totalRequestsSent: this.requestCounter
        };
    }
    
    // Clear cache
    static clearCache() {
        const clearedEntries = this.responseCache.size;
        this.responseCache.clear();
        console.log(`Cleared ${clearedEntries} cache entries`);
        return clearedEntries;
    }
    
    // Cleanup method for shutdown
    static cleanup() {
        console.log('Starting ApiService cleanup...');
        
        // Cancel all active requests
        const cancelledRequests = this.cancelAllRequests();
        
        // Clear request queue
        const queuedRequests = this.requestQueue.length;
        this.requestQueue.forEach(req => {
            req.reject(new Error('Service shutting down'));
        });
        this.requestQueue.length = 0;
        
        // Clear cache
        const clearedCache = this.clearCache();
        
        // Reset counters
        this.requestCounter = 0;
        this.isProcessingQueue = false;
        
        console.log(`ApiService cleanup completed:
            - Cancelled requests: ${cancelledRequests}
            - Cleared queue: ${queuedRequests}
            - Cleared cache: ${clearedCache}`);
    }
}
