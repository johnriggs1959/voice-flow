import { CONFIG } from '../config.js';

export class ConversationManager {
constructor() {
        this.messages = [];
        this.maxMemorySize = CONFIG.MAX_CONVERSATION_TURNS * 2; // pairs of user/assistant messages
        this.maxMessageLength = CONFIG.MAX_INPUT_LENGTH * 10; // reasonable limit for message content
        this.memoryPressureThreshold = 0.85; // CHANGED: Increased from 0.8 to 0.85 to prevent double pruning
        
        // Memory usage tracking
        this.totalCharacters = 0;
        this.maxTotalCharacters = this.maxMessageLength * this.maxMemorySize;
        
        // Message metadata for smarter pruning
        this.messageMetadata = new Map(); // messageIndex -> metadata
        
        // ADDED: Track last pruning time to prevent rapid successive pruning
        this.lastPruningTime = 0;
        this.pruningCooldown = 2000; // 2 second cooldown between pruning operations
        
        // Setup periodic memory check
        this.setupMemoryMonitoring();
    }
    
    // Add user message with memory management
    addUserMessage(content) {
        const cleanContent = this.sanitizeContent(content);
        const messageIndex = this.messages.length;
        
        // Add message with metadata
        this.messages.push({ 
            role: 'user', 
            content: cleanContent,
            timestamp: Date.now(),
            index: messageIndex
        });
        
        // Track metadata
        this.messageMetadata.set(messageIndex, {
            length: cleanContent.length,
            importance: this.calculateImportance(cleanContent, 'user'),
            timestamp: Date.now()
        });
        
        this.updateMemoryStats();
        this.checkMemoryPressure();
    }
    
    // Add assistant message with memory management
    addAssistantMessage(content) {
        const cleanContent = this.sanitizeContent(content);
        const messageIndex = this.messages.length;
        
        // Add message with metadata
        this.messages.push({ 
            role: 'assistant', 
            content: cleanContent,
            timestamp: Date.now(),
            index: messageIndex
        });
        
        // Track metadata
        this.messageMetadata.set(messageIndex, {
            length: cleanContent.length,
            importance: this.calculateImportance(cleanContent, 'assistant'),
            timestamp: Date.now()
        });
        
        this.updateMemoryStats();
        this.checkMemoryPressure();
    }
    
    // Sanitize content to prevent memory issues
    sanitizeContent(content) {
        if (typeof content !== 'string') {
            content = String(content);
        }
        
        // Limit individual message length
        if (content.length > this.maxMessageLength) {
            console.warn(`Message truncated from ${content.length} to ${this.maxMessageLength} characters`);
            content = content.substring(0, this.maxMessageLength) + '... [truncated]';
        }
        
        // Remove excessive whitespace
        content = content.replace(/\s+/g, ' ').trim();
        
        return content;
    }
    
    // Calculate message importance for smart pruning
    calculateImportance(content, role) {
        let importance = 1.0;
        
        // Longer messages might be more important
        if (content.length > 100) importance += 0.2;
        if (content.length > 300) importance += 0.3;
        
        // Questions and keywords increase importance
        const importantKeywords = [
            'explain', 'how', 'what', 'why', 'when', 'where', 'who',
            'define', 'describe', 'analyze', 'compare', 'summarize'
        ];
        
        const contentLower = content.toLowerCase();
        const keywordMatches = importantKeywords.filter(keyword => 
            contentLower.includes(keyword)
        ).length;
        
        importance += keywordMatches * 0.1;
        
        // User questions are generally more important than assistant responses
        if (role === 'user') importance += 0.2;
        
        // Recent messages are more important
        importance += 0.5; // Base recency bonus
        
        return Math.min(importance, 3.0); // Cap at 3.0
    }
    
    // Update memory statistics
    updateMemoryStats() {
        this.totalCharacters = this.messages.reduce((total, msg) => {
            return total + (msg.content ? msg.content.length : 0);
        }, 0);
    }
    
    // UPDATED: Enhanced memory pressure check with cooldown
    checkMemoryPressure() {
        const messageCount = this.messages.length;
        const characterRatio = this.totalCharacters / this.maxTotalCharacters;
        const messageRatio = messageCount / this.maxMemorySize;
        
        // Check if we're in cooldown period
        const now = Date.now();
        if (now - this.lastPruningTime < this.pruningCooldown) {
            console.log(`Pruning skipped - in cooldown period (${Math.round((this.pruningCooldown - (now - this.lastPruningTime)) / 1000)}s remaining)`);
            return;
        }
        
        // Check multiple pressure indicators - now more restrictive
        const isUnderPressure = (
            messageRatio > this.memoryPressureThreshold ||
            characterRatio > this.memoryPressureThreshold ||
            messageCount >= this.maxMemorySize // CHANGED: Only trigger at exact limit, not before
        );
        
        if (isUnderPressure) {
            console.log(`Memory pressure detected: ${messageCount}/${this.maxMemorySize} messages, ${this.totalCharacters}/${this.maxTotalCharacters} characters`);
            this.performSmartPruning();
            
            // ADDED: Update last pruning time
            this.lastPruningTime = now;
            
            // ADDED: Notify UI to sync its display after pruning
            this.notifyUIOfPruning();
        }
    }
    
    // NEW: Notify UI manager when we prune messages
    notifyUIOfPruning() {
        // Signal the UI manager that it should update its display
        // This helps keep the turn counter in sync
        if (window.aiAssistant && window.aiAssistant.ui) {
            // Update turn count immediately after pruning
            if (window.aiAssistant.status) {
                window.aiAssistant.status.updateTurnCount(this.getTurnCount());
            }
            console.log(`UI notified of pruning. New turn count: ${this.getTurnCount()}`);
        }
    }
    
    // UPDATED: More conservative pruning with better turn preservation
    performSmartPruning() {
        if (this.messages.length <= 8) {
            // Keep at least 4 exchanges (8 messages) instead of 3
            console.log('Pruning skipped - minimum message threshold not met');
            return;
        }
        
        // Even more conservative pruning - only remove when absolutely needed
        const targetCount = Math.floor(this.maxMemorySize * 0.85); // Changed from 0.8 to 0.85
        const messagesToRemove = Math.max(0, this.messages.length - targetCount);
        
        if (messagesToRemove < 2) {
            console.log('Pruning skipped - removal threshold not met');
            return; // Don't prune unless we can remove at least one complete pair
        }
        
        // Only remove complete pairs and be very conservative
        const pairsToRemove = Math.floor(messagesToRemove / 2);
        
        // Don't remove more than 2 pairs (4 messages) in one go
        const maxPairsToRemove = Math.min(2, Math.floor(this.messages.length / 10));
        const actualPairsToRemove = Math.min(pairsToRemove, maxPairsToRemove);
        
        if (actualPairsToRemove === 0) {
            console.log('Pruning skipped - no pairs eligible for removal');
            return;
        }
        
        // Create importance scores for message pairs (user + assistant)
        const pairs = [];
        for (let i = 0; i < this.messages.length - 1; i += 2) {
            if (this.messages[i].role === 'user' && 
                this.messages[i + 1]?.role === 'assistant') {
                
                const userMeta = this.messageMetadata.get(this.messages[i].index) || { importance: 1, timestamp: 0 };
                const assistantMeta = this.messageMetadata.get(this.messages[i + 1].index) || { importance: 1, timestamp: 0 };
                
                // Combined importance with recency decay
                const age = Date.now() - Math.max(userMeta.timestamp, assistantMeta.timestamp);
                const recencyFactor = Math.exp(-age / (30 * 60 * 1000)); // 30 minute half-life
                
                pairs.push({
                    startIndex: i,
                    endIndex: i + 1,
                    importance: (userMeta.importance + assistantMeta.importance) * recencyFactor,
                    age: age
                });
            }
        }
        
        if (pairs.length <= 3) {
            console.log('Pruning skipped - insufficient pairs for safe removal');
            return; // Keep at least 3 pairs
        }
        
        // Sort by importance (ascending) - remove least important first
        pairs.sort((a, b) => a.importance - b.importance);
        
        let removedCount = 0;
        
        // Only remove the least important pairs, and keep recent ones
        for (let i = 0; i < Math.min(actualPairsToRemove, pairs.length - 3); i++) {
            const pair = pairs[i];
            
            // Don't remove the three most recent pairs
            if (pair.endIndex >= this.messages.length - 6) continue;
            
            // Mark messages for removal
            this.messages[pair.startIndex] = null;
            this.messages[pair.endIndex] = null;
            
            // Clean up metadata
            this.messageMetadata.delete(this.messages[pair.startIndex]?.index);
            this.messageMetadata.delete(this.messages[pair.endIndex]?.index);
            
            removedCount += 2;
        }
        
        // Remove null entries
        this.messages = this.messages.filter(msg => msg !== null);
        
        // Update memory stats
        this.updateMemoryStats();
        
        console.log(`Pruned ${removedCount} messages. Remaining: ${this.messages.length} messages, ${this.totalCharacters} characters`);
        console.log(`New turn count after pruning: ${this.getTurnCount()}`);
    }
    
    // Remove last user message (for error handling) with cleanup
    removeLastUserMessage() {
        if (this.messages.length > 0 && this.messages[this.messages.length - 1].role === 'user') {
            const removedMessage = this.messages.pop();
            if (removedMessage?.index !== undefined) {
                this.messageMetadata.delete(removedMessage.index);
            }
            this.updateMemoryStats();
        }
    }
    
    // Enhanced conversation trimming (fallback method)
    trimConversation() {
        // This is a simpler fallback if smart pruning fails
        while (this.messages.length > this.maxMemorySize) {
            // Remove oldest pair
            if (this.messages.length >= 2) {
                const removed = this.messages.splice(0, 2);
                removed.forEach(msg => {
                    if (msg?.index !== undefined) {
                        this.messageMetadata.delete(msg.index);
                    }
                });
            } else {
                this.messages.splice(0, 1);
            }
        }
        this.updateMemoryStats();
    }
    
    // Get conversation messages with system message
    getMessagesWithSystem(voiceName) {
        const systemMessage = this.generateSystemMessage(voiceName);
        
        // Create a clean copy without metadata
        const cleanMessages = this.messages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
        
        return [
            { role: 'system', content: systemMessage },
            ...cleanMessages
        ];
    }
    
    // Generate optimized system message
    generateSystemMessage(voiceName) {
        const name = CONFIG.VOICE_NAMES[voiceName] || 'Assistant';
        // Get current date and time
        const now = new Date();
        const currentDate = now.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
        });
        // Keep system message concise to save memory
        return `You are ${name}, a voice assistant. Today is ${currentDate}. Reference previous topics when appropriate. Keep responses concise for natural speech. Use full words and speak numbers naturally: say "twenty-three degrees Fahrenheit" not "23F", "percent" not "%", "Doctor Smith" not "Dr. Smith". Always convert Roman numerals to spoken form in ALL contexts: for example, say "the third" not "III", "the second" not "II", "fifty-three" not "LIII", "thirty-eight" not "XXXVIII". For royalty and popes, use "the" before the number: "King Charles the third", "Queen Elizabeth the second". Always speak years in full: say "two thousand twenty-five" not "twenty-five".`;    }
    
    // Setup memory monitoring
    setupMemoryMonitoring() {
        // Monitor memory usage every 5 minutes
        this.memoryMonitorInterval = setInterval(() => {
            this.reportMemoryUsage();
            
            // Perform maintenance
            this.performMaintenance();
        }, 5 * 60 * 1000);
    }
    
    // Perform routine maintenance
    performMaintenance() {
        // Clean up orphaned metadata
        const validIndices = new Set(this.messages.map(msg => msg.index).filter(idx => idx !== undefined));
        
        for (const [index] of this.messageMetadata.entries()) {
            if (!validIndices.has(index)) {
                this.messageMetadata.delete(index);
            }
        }
        
        // Force garbage collection hint (if available)
        if (window.gc && typeof window.gc === 'function') {
            try {
                window.gc();
            } catch (e) {
                // Ignore - not available in production
            }
        }
    }
    
    // Report memory usage
    reportMemoryUsage() {
        const messageCount = this.messages.length;
        const metadataCount = this.messageMetadata.size;
        const averageMessageLength = messageCount > 0 ? this.totalCharacters / messageCount : 0;
        
        console.log(`Conversation Memory Usage:
            - Messages: ${messageCount}/${this.maxMemorySize}
            - Total characters: ${this.totalCharacters}/${this.maxTotalCharacters}
            - Average message length: ${averageMessageLength.toFixed(1)}
            - Metadata entries: ${metadataCount}
            - Memory pressure: ${((messageCount / this.maxMemorySize) * 100).toFixed(1)}%`);
    }
    
    // Get memory statistics
    getMemoryStats() {
        return {
            messageCount: this.messages.length,
            maxMessages: this.maxMemorySize,
            totalCharacters: this.totalCharacters,
            maxCharacters: this.maxTotalCharacters,
            memoryPressure: this.messages.length / this.maxMemorySize,
            metadataEntries: this.messageMetadata.size
        };
    }
    
    // Clear conversation with full cleanup
    clear() {
        this.messages.length = 0;
        this.messageMetadata.clear();
        this.totalCharacters = 0;
        
        console.log('Conversation cleared and memory freed');
    }
    
    // Cleanup method for shutdown
    cleanup() {
        console.log('Starting ConversationManager cleanup...');
        
        // Clear monitoring interval
        if (this.memoryMonitorInterval) {
            clearInterval(this.memoryMonitorInterval);
            this.memoryMonitorInterval = null;
        }
        
        // Clear all data
        this.clear();
        
        console.log('ConversationManager cleanup completed');
    }
    
    // UPDATED: Get turn count based on actual conversation state, not DOM
    getTurnCount() {
        // Always count based on our internal message array
        // This ensures consistency with our memory management
        return Math.ceil(this.messages.length / 2);
    }
    
    // Check if conversation is empty
    isEmpty() {
        return this.messages.length === 0;
    }
    
    // Get conversation history (for debugging or export)
    getHistory() {
        return this.messages.map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp
        }));
    }
    
    // Get last message
    getLastMessage() {
        return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
    }
    
    // Get last user message
    getLastUserMessage() {
        for (let i = this.messages.length - 1; i >= 0; i--) {
            if (this.messages[i].role === 'user') {
                return this.messages[i];
            }
        }
        return null;
    }
    
    // Get last assistant message
    getLastAssistantMessage() {
        for (let i = this.messages.length - 1; i >= 0; i--) {
            if (this.messages[i].role === 'assistant') {
                return this.messages[i];
            }
        }
        return null;
    }
}
