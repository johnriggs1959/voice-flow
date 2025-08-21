// Privacy Manager - Handles user consent and data filtering
// Path: js/logging/privacy-manager.js

export class PrivacyManager {
    constructor(settingsManager) {
        this.settings = settingsManager;
        
        // Privacy configuration
        this.privacyConfig = {
            enableLogging: true,
            logConversations: true,
            logEvents: true,
            logAnalytics: true,
            anonymizeData: false,
            filterSensitiveData: true,
            retentionDays: 30
        };
        
        // Sensitive data patterns
        this.sensitivePatterns = [
            // Personal information
            /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
            /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
            /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // Phone number
            
            // API keys and tokens
            /\b(api[_-]?key|token|secret|password)[\s:=]+["']?[\w-]+["']?\b/gi,
            /\bBearer\s+[\w-]+\b/gi,
            
            // IP addresses
            /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
            
            // URLs with credentials
            /https?:\/\/[^:]+:[^@]+@[^\s]+/g
        ];
        
        // Words to filter in strict mode
        this.filterWords = new Set([
            'password', 'secret', 'token', 'key', 'api_key', 'apikey',
            'credential', 'auth', 'private', 'confidential'
        ]);
        
        // Initialize
        this.initialize();
    }
    
    // Initialize privacy settings
    initialize() {
        this.loadPrivacySettings();
        this.setupConsentTracking();
        console.log('PrivacyManager initialized');
    }
    
    // Load privacy settings from storage
    loadPrivacySettings() {
        const savedSettings = this.settings.getSetting('privacy', 'logging');
        if (savedSettings) {
            Object.assign(this.privacyConfig, savedSettings);
        }
    }
    
    // Setup consent tracking
    setupConsentTracking() {
        // Check for existing consent
        const consent = localStorage.getItem('ai-assistant-logging-consent');
        if (!consent) {
            // First time - ask for consent
            this.requestConsent();
        } else {
            const consentData = JSON.parse(consent);
            this.privacyConfig.enableLogging = consentData.granted;
            this.privacyConfig.consentDate = consentData.date;
        }
    }
    
    // Request user consent for logging
    requestConsent() {
        // This would typically show a modal or notification
        // For now, we'll default to enabled with ability to disable in settings
        const consentData = {
            granted: true,
            date: new Date().toISOString(),
            version: '1.0'
        };
        
        localStorage.setItem('ai-assistant-logging-consent', JSON.stringify(consentData));
        this.privacyConfig.enableLogging = true;
    }
    
    // Check if specific type of logging is allowed
    canLog(type) {
        if (!this.privacyConfig.enableLogging) {
            return false;
        }
        
        switch (type) {
            case 'conversation':
                return this.privacyConfig.logConversations;
            case 'events':
                return this.privacyConfig.logEvents;
            case 'analytics':
                return this.privacyConfig.logAnalytics;
            default:
                return true;
        }
    }
    
    // Sanitize data based on privacy settings
    sanitize(data) {
        if (!this.privacyConfig.filterSensitiveData) {
            return data;
        }
        
        if (typeof data === 'string') {
            return this.sanitizeString(data);
        } else if (typeof data === 'object' && data !== null) {
            return this.sanitizeObject(data);
        }
        
        return data;
    }
    
    // Sanitize string data
    sanitizeString(str) {
        let sanitized = str;
        
        // Replace sensitive patterns
        for (const pattern of this.sensitivePatterns) {
            sanitized = sanitized.replace(pattern, '[REDACTED]');
        }
        
        // Additional filtering for strict mode
        if (this.privacyConfig.anonymizeData) {
            // Check for filter words
            const words = sanitized.toLowerCase().split(/\s+/);
            for (const word of words) {
                if (this.filterWords.has(word)) {
                    // Replace the entire sentence containing the filter word
                    const sentences = sanitized.split(/[.!?]+/);
                    sanitized = sentences.map(sentence => {
                        if (sentence.toLowerCase().includes(word)) {
                            return '[CONTENT FILTERED]';
                        }
                        return sentence;
                    }).join('. ');
                    break;
                }
            }
        }
        
        return sanitized;
    }
    
    // Sanitize object data recursively
    sanitizeObject(obj) {
        const sanitized = {};
        
        for (const [key, value] of Object.entries(obj)) {
            // Check if key contains sensitive words
            const keySensitive = Array.from(this.filterWords).some(word => 
                key.toLowerCase().includes(word)
            );
            
            if (keySensitive && this.privacyConfig.anonymizeData) {
                sanitized[key] = '[REDACTED]';
            } else if (typeof value === 'string') {
                sanitized[key] = this.sanitizeString(value);
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                sanitized[key] = this.sanitizeObject(value);
            } else if (Array.isArray(value)) {
                sanitized[key] = value.map(item => 
                    typeof item === 'object' ? this.sanitizeObject(item) : this.sanitize(item)
                );
            } else {
                sanitized[key] = value;
            }
        }
        
        return sanitized;
    }
    
    // Anonymize user data
    anonymize(data) {
        if (!this.privacyConfig.anonymizeData) {
            return data;
        }
        
        const anonymized = { ...data };
        
        // Replace session IDs with hashed versions
        if (anonymized.sessionId) {
            anonymized.sessionId = this.hashString(anonymized.sessionId);
        }
        
        // Remove or hash user-specific information
        if (anonymized.context?.browser) {
            anonymized.context.browser = 'Unknown Browser';
        }
        
        // Remove precise timestamps
        if (anonymized.timestamp) {
            const date = new Date(anonymized.timestamp);
            date.setMinutes(0, 0, 0);
            anonymized.timestamp = date.toISOString();
        }
        
        return anonymized;
    }
    
    // Simple hash function for anonymization
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `anon_${Math.abs(hash).toString(36)}`;
    }
    
    // Update privacy settings
    updateSettings(settings) {
        Object.assign(this.privacyConfig, settings);
        this.settings.setSetting('privacy', 'logging', this.privacyConfig);
        console.log('Privacy settings updated:', this.privacyConfig);
    }
    
    // Revoke consent
    revokeConsent() {
        this.privacyConfig.enableLogging = false;
        
        const consentData = {
            granted: false,
            date: new Date().toISOString(),
            version: '1.0'
        };
        
        localStorage.setItem('ai-assistant-logging-consent', JSON.stringify(consentData));
        console.log('Logging consent revoked');
    }
    
    // Grant consent
    grantConsent() {
        this.privacyConfig.enableLogging = true;
        
        const consentData = {
            granted: true,
            date: new Date().toISOString(),
            version: '1.0'
        };
        
        localStorage.setItem('ai-assistant-logging-consent', JSON.stringify(consentData));
        console.log('Logging consent granted');
    }
    
    // Get data retention policy
    getRetentionPolicy() {
        return {
            days: this.privacyConfig.retentionDays,
            autoDelete: true,
            anonymizeBeforeDelete: this.privacyConfig.anonymizeData
        };
    }
    
    // Set data retention period
    setRetentionDays(days) {
        this.privacyConfig.retentionDays = days;
        this.updateSettings(this.privacyConfig);
    }
    
    // Check if data should be retained
    shouldRetain(timestamp) {
        const dataAge = Date.now() - new Date(timestamp).getTime();
        const maxAge = this.privacyConfig.retentionDays * 24 * 60 * 60 * 1000;
        return dataAge <= maxAge;
    }
    
    // Export privacy settings
    exportSettings() {
        return {
            config: this.privacyConfig,
            consentStatus: {
                granted: this.privacyConfig.enableLogging,
                date: this.privacyConfig.consentDate,
                retentionDays: this.privacyConfig.retentionDays
            },
            exportDate: new Date().toISOString()
        };
    }
    
    // Import privacy settings
    importSettings(settings) {
        if (settings.config) {
            this.updateSettings(settings.config);
        }
        return true;
    }
    
    // Get privacy report
    getPrivacyReport() {
        return {
            loggingEnabled: this.privacyConfig.enableLogging,
            dataTypes: {
                conversations: this.privacyConfig.logConversations,
                events: this.privacyConfig.logEvents,
                analytics: this.privacyConfig.logAnalytics
            },
            protection: {
                filterSensitive: this.privacyConfig.filterSensitiveData,
                anonymize: this.privacyConfig.anonymizeData
            },
            retention: {
                days: this.privacyConfig.retentionDays,
                autoDelete: true
            },
            consent: {
                status: this.privacyConfig.enableLogging ? 'granted' : 'revoked',
                date: this.privacyConfig.consentDate
            }
        };
    }
    
    // Cleanup
    cleanup() {
        // Save current settings
        this.updateSettings(this.privacyConfig);
        console.log('PrivacyManager cleanup completed');
    }
}
