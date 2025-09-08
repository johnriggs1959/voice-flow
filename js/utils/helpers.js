// Utility helper functions

// Measure execution time of async functions
export async function measureTime(asyncFunction) {
    const startTime = performance.now();
    const result = await asyncFunction();
    const duration = (performance.now() - startTime) / 1000;
    return { result, duration };
}

// Debounce function to limit function calls
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function to limit function execution frequency
export function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Create a delay (useful for testing or artificial delays)
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry async function with exponential backoff
export async function retryWithBackoff(asyncFunction, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await asyncFunction();
        } catch (error) {
            lastError = error;
            
            if (attempt === maxRetries) {
                throw lastError;
            }
            
            // Exponential backoff: baseDelay * 2^(attempt-1)
            const delayMs = baseDelay * Math.pow(2, attempt - 1);
            console.warn(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`, error.message);
            await delay(delayMs);
        }
    }
    
    throw lastError;
}

// Validate input text
export function validateInput(text, maxLength = 500) {
    if (!text || typeof text !== 'string') {
        return { valid: false, error: 'Input must be a non-empty string' };
    }
    
    const trimmed = text.trim();
    if (trimmed.length === 0) {
        return { valid: false, error: 'Input cannot be empty' };
    }
    
    if (trimmed.length > maxLength) {
        return { valid: false, error: `Input exceeds maximum length of ${maxLength} characters` };
    }
    
    return { valid: true, text: trimmed };
}

// Format time duration for display
export function formatDuration(seconds) {
    if (seconds < 1) {
        return `${(seconds * 1000).toFixed(0)}ms`;
    } else if (seconds < 60) {
        return `${seconds.toFixed(2)}s`;
    } else {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
    }
}

// Safe JSON parse with error handling
export function safeJsonParse(jsonString, defaultValue = null) {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.warn('Failed to parse JSON:', error.message);
        return defaultValue;
    }
}

// Check if device is likely mobile
export function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Check if browser supports a specific feature
export function checkBrowserSupport() {
    return {
        mediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        mediaRecorder: typeof MediaRecorder !== 'undefined',
        audioContext: !!(window.AudioContext || window.webkitAudioContext),
        secureContext: window.isSecureContext,
        serviceWorker: 'serviceWorker' in navigator,
        localStorage: typeof Storage !== 'undefined'
    };
}

// Generate unique ID
export function generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Clean up text for speech synthesis
export function cleanTextForSpeech(text) {
    return text
        // Remove markdown emphasis markers FIRST (before other replacements)
        .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')  // Remove *, **, *** (asterisks for emphasis)
        .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')    // Remove _, __, ___ (underscores for emphasis)
        
        // Remove markdown code blocks and inline code
        .replace(/```[^`]*```/g, '')              // Remove code blocks
        .replace(/`([^`]+)`/g, '$1')              // Remove inline code backticks
        
        // Remove markdown headers
        .replace(/^#{1,6}\s+/gm, '')              // Remove # headers
        
        // Remove markdown links but keep the text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [text](url) -> text
        
        // Remove markdown lists markers
        .replace(/^[\*\-\+]\s+/gm, '')            // Remove bullet points
        .replace(/^\d+\.\s+/gm, '')               // Remove numbered lists
        
        // Remove HTML tags if any
        .replace(/<[^>]*>/g, '')
        
        // Convert common abbreviations
        .replace(/\bDr\./g, 'Doctor')
        .replace(/\bMr\./g, 'Mister')
        .replace(/\bMrs\./g, 'Missus')
        .replace(/\bMs\./g, 'Miss')
        .replace(/\bProf\./g, 'Professor')
        .replace(/\bSt\./g, 'Saint')
        .replace(/\bAve\./g, 'Avenue')
        .replace(/\bBlvd\./g, 'Boulevard')
        
        // Convert symbols to words
        .replace(/&/g, 'and')
        .replace(/%/g, 'percent')
        .replace(/\$/g, 'dollars')
        .replace(/#/g, 'number')
        .replace(/@/g, 'at')
        
        // Remove quotation marks (they don't read well in TTS)
        .replace(/["'"'"]/g, '')
        
        // Handle ellipsis
        .replace(/\.{3,}/g, '...')
        
        // Remove or replace special characters that don't read well
        .replace(/[^\w\s.,!?;:\-]/g, ' ')
        
        // Clean up multiple spaces
        .replace(/\s+/g, ' ')
        .trim();
}