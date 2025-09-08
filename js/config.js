// Configuration constants for AI Assistant Voice Interface
export const CONFIG = {
    // REMOVED: Dynamic URLs since ApiService now handles this
    // These are now just for reference/fallback - ApiService uses its own dynamic methods
    
    // Default settings
    MAX_CONVERSATION_TURNS: 20,
    MAX_INPUT_LENGTH: 500,
    MAX_TTS_LENGTH: 2500,  // Increased to 2500 characters 
    
    // Timing constants
    RECORDING_TIMEOUT: 30000, // 30 seconds
    SERVICE_CHECK_INTERVAL: 10000, // 10 seconds
    AUDIO_CLEANUP_DELAY: 1000, // 1 second
    PLAYBACK_DELAY: 100, // 100ms
    
    // Voice name mapping for identity purposes
    VOICE_NAMES: {
        'af_heart': 'Heart',
        'af_bella': 'Bella',
        'af_sarah': 'Sarah',
        'am_adam': 'Adam',
        'af_alloy': 'Alloy',
        'af_aoede': 'Aoede',
        'bf_alice': 'Alice',
        'bf_emma': 'Emma',
        'bf_lily': 'Lily',
        'bm_daniel': 'Daniel',
        'bm_fable': 'Fable',
        'bm_george': 'George',
        'bm_lewis': 'Lewis'
    },
    
    // MediaRecorder MIME types (in order of preference)
    AUDIO_MIME_TYPES: ['audio/webm', 'audio/mp4', 'audio/ogg'],
    
    // STT API compatibility settings
    STT_ENDPOINTS: {
        transcribe: '/v1/audio/transcriptions', // OpenAI-compatible
        transcribeAlt: '/transcribe',           // Alternative endpoint
        health: '/health',                      // Health check
        models: '/v1/models'                    // Models endpoint
    },
    
    // DOM element IDs (for reference) - UPDATED: Added settings button
    ELEMENTS: {
        questionInput: 'questionInput',
        statusMessage: 'statusMessage',
        llmDot: 'llm-dot',
        ttsDot: 'tts-dot',
        sttDot: 'stt-dot',
        modelSelect: 'modelSelect',
        sttModelSelect: 'sttModelSelect',
        voiceSelect: 'voiceSelect',
        micButton: 'micButton',
        clearButton: 'clearButton',
        turnCount: 'turnCount',
        questionDisplay: 'questionDisplay',
        responseDisplay: 'responseDisplay',
        audioElement: 'audioElement',
        audioPlayer: 'audioPlayer',
        settingsButton: 'settingsButton' // NEW: Settings button ID
    },
    
    // UPDATED: Theme configuration - Removed high-contrast, changed default to dark
    THEMES: {
        DEFAULT: 'dark',
        AVAILABLE: ['current', 'dark', 'light']
    },
    
    // UPDATED: Settings configuration - Changed default theme to dark
    SETTINGS: {
        STORAGE_KEY: 'ai-assistant-settings',
        THEME_STORAGE_KEY: 'ai-assistant-theme',
        DEFAULT_SETTINGS: {
            appearance: {
                theme: 'dark',
                animations: true,
                reducedMotion: false
            },
            audio: {
                autoplay: true,
                volume: 0.8,
                speechRate: 1.0
            },
            privacy: {
                saveHistory: true,
                analytics: false
            }
        }
    }
};
