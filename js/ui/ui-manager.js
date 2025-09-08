import { CONFIG } from '../config.js';

export class UIManager {
    constructor() {
        this.elements = {};
        this.initializeElements();
        this.messageCount = 0; // Track total messages for limiting
    }
    
    // Initialize DOM element references
    initializeElements() {
        for (const [key, id] of Object.entries(CONFIG.ELEMENTS)) {
            this.elements[key] = document.getElementById(id);
        }
        
        // Additional elements not in config
        this.elements.charCounter = document.querySelector('.char-counter');
        
        // Chat interface elements
        this.elements.conversationMessages = document.getElementById('conversationMessages');
        this.elements.conversationEmpty = document.getElementById('conversationEmpty');
    }
    
    // Enhanced formatting method with Roman numeral support
    formatAIResponse(text) {
        // Basic markdown parsing for better readability
        let formatted = text;
        
        // First, normalize line endings and fix numbered lists that lack spaces
        formatted = formatted.replace(/\r\n/g, '\n');
        formatted = formatted.replace(/(\d+)\.([A-Z])/g, '$1. $2'); // Fix "1.The" to "1. The"
        
        // IMPORTANT: Only convert asterisks to bullets if they're NOT followed by a space and number
        // This prevents "* 1. Item" from being processed as a bullet point
        formatted = formatted.replace(/^\*\s+(?!\d+\.)/gm, '• ');
        
        // Fix inline asterisks that should be emphasis (not at line start)
        formatted = formatted.replace(/(?<!^)\*([^*\n]+)\*(?!\*)/gm, '_$1_');
        
        // Add line breaks before numbered lists that follow headers with colons
        formatted = formatted.replace(/(:)\n(\d+\.)/g, '$1\n\n$2');
        
        // Add line breaks before Roman numeral lists
        formatted = formatted.replace(/(:)\s*([IVX]+\.)/g, '$1\n\n$2');
        
        // Ensure Roman numerals at start of lines are on new lines
        formatted = formatted.replace(/([.!?])\s+([IVX]+\.\s+[A-Z])/g, '$1\n\n$2');
        
        // Escape HTML to prevent XSS
        formatted = formatted.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Process code blocks FIRST (before other replacements)
        formatted = formatted.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || 'plaintext';
            const trimmedCode = code.trim();
            return `<div class="code-block" data-language="${language}"><pre><code>${trimmedCode}</code></pre></div>`;
        });
        
        // Convert inline code (after code blocks to avoid conflicts)
        formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        
        // Split into lines for processing
        const lines = formatted.split('\n');
        const processedLines = [];
        let inNumberedList = false;
        let inRomanList = false;
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            
            // Skip empty lines
            if (line === '') {
                processedLines.push('');
                inNumberedList = false;
                inRomanList = false;
                continue;
            }
            
            // Skip if line is part of a code block (already processed)
            if (line.includes('<div class="code-block"') || line.includes('</div>')) {
                processedLines.push(line);
                inNumberedList = false;
                inRomanList = false;
                continue;
            }
            
            // Check for Roman numeral lists (I., II., III., IV., V., etc.)
            const romanMatch = line.match(/^([IVX]+)\.\s+(.*)$/);
            if (romanMatch) {
                processedLines.push(`<div class="list-item numbered roman"><span class="list-marker">${romanMatch[1]}.</span><span class="list-content">${romanMatch[2]}</span></div>`);
                inRomanList = true;
                inNumberedList = false;
                continue;
            }
            
            // Check for numbered lists (1., 2., 3., etc.)
            const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/);
            if (numberedMatch) {
                processedLines.push(`<div class="list-item numbered"><span class="list-marker">${numberedMatch[1]}.</span><span class="list-content">${numberedMatch[2]}</span></div>`);
                inNumberedList = true;
                inRomanList = false;
                continue;
            }
            
            // Check for letter lists (a., b., c., A., B., C.)
            const letterMatch = line.match(/^([a-zA-Z])\.\s+(.*)$/);
            if (letterMatch && line.length > 3) { // Avoid matching single letters with periods
                processedLines.push(`<div class="list-item numbered letter"><span class="list-marker">${letterMatch[1]}.</span><span class="list-content">${letterMatch[2]}</span></div>`);
                inNumberedList = true;
                inRomanList = false;
                continue;
            }
            
            // Process bullet points ONLY if:
            // 1. We're not in a numbered/roman list
            // 2. The line actually starts with a bullet marker
            // 3. It's not a numbered list item that was incorrectly marked with a bullet
            if (!inNumberedList && !inRomanList && /^[•\-+]\s/.test(line) && !/^[•\-+]\s*\d+\./.test(line)) {
                const content = line.replace(/^[•\-+]\s+/, '');
                processedLines.push(`<div class="list-item bullet"><span class="list-marker">•</span><span class="list-content">${content}</span></div>`);
                continue;
            }
            
            // If line doesn't match any list pattern, we're out of lists
            if (!romanMatch && !numberedMatch && !letterMatch && !/^[•\-+]\s/.test(line)) {
                inNumberedList = false;
                inRomanList = false;
            }
            
            // Convert bold text (handle both ** and __)
            line = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            line = line.replace(/__([^_]+)__/g, '<strong>$1</strong>');
            
            // Convert italic text (handle both * and _)
            line = line.replace(/(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
            line = line.replace(/(?<!_)_(?!_)([^_]+)(?<!_)_(?!_)/g, '<em>$1</em>');
            
            processedLines.push(line);
        }
        
        // Join lines back together
        formatted = processedLines.join('\n');
        
        // Group consecutive lines into paragraphs, but preserve special elements
        const finalLines = formatted.split('\n');
        const paragraphs = [];
        let currentParagraph = [];
        
        for (let line of finalLines) {
            // Check if this is a special element that should stand alone
            if (line.includes('<div class="list-item') || 
                line.includes('<div class="code-block"') ||
                line.includes('</div>') ||
                line.trim() === '') {
                
                // Flush current paragraph if it exists
                if (currentParagraph.length > 0) {
                    paragraphs.push(`<p>${currentParagraph.join('<br>')}</p>`);
                    currentParagraph = [];
                }
                
                // Add special element or empty line
                if (line.trim() !== '') {
                    paragraphs.push(line);
                } else if (paragraphs.length > 0 && !paragraphs[paragraphs.length - 1].includes('</p>')) {
                    // Add spacing between sections
                    paragraphs.push('<div class="spacer"></div>');
                }
            } else {
                // Add to current paragraph
                currentParagraph.push(line);
            }
        }
        
        // Flush any remaining paragraph
        if (currentParagraph.length > 0) {
            paragraphs.push(`<p>${currentParagraph.join('<br>')}</p>`);
        }
        
        // Join all paragraphs and wrap in container
        return `<div class="formatted-response">${paragraphs.join('\n')}</div>`;
    }
    
    // Character counter update
    updateCharCounter() {
        const chars = this.elements.questionInput.value.length;
        this.elements.charCounter.textContent = `${chars}/${CONFIG.MAX_INPUT_LENGTH} characters`;
    }
    
    // UPDATED: Populate model dropdown - now just updates hidden element for compatibility
    populateModelDropdown(models) {
        // Update the hidden select for backward compatibility
        if (this.elements.modelSelect) {
            this.elements.modelSelect.innerHTML = '';
            
            if (models.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No models available';
                option.disabled = true;
                option.selected = true;
                this.elements.modelSelect.appendChild(option);
                console.warn('No models available to populate dropdown');
                return;
            }
            
            // Get saved model preference from settings
            let savedModel = null;
            if (window.aiAssistant && window.aiAssistant.settings) {
                savedModel = window.aiAssistant.settings.getSelectedModel();
            }
            
            // If no saved model in settings, check localStorage (legacy)
            if (!savedModel) {
                savedModel = localStorage.getItem('ai-assistant-selected-model');
            }
            
            models.forEach((model, index) => {
                const option = document.createElement('option');
                option.value = model.name;
                option.textContent = `${model.name} (${model.size})`;
                
                // Select saved model if it exists, otherwise first model
                if (savedModel && model.name === savedModel) {
                    option.selected = true;
                    console.log(`Restored saved model: ${model.name}`);
                } else if (!savedModel && index === 0) {
                    option.selected = true;
                    console.log(`Auto-selected first available model: ${model.name}`);
                }
                
                this.elements.modelSelect.appendChild(option);
            });
            
            // Update settings manager with available models
            if (window.aiAssistant && window.aiAssistant.settings) {
                window.aiAssistant.settings.updateAvailableModels(models);
            }
            
            const selectedModel = this.getSelectedModel();
            console.log(`Model set to: ${selectedModel}`);
        }
    }   
    
    // Update microphone button state
    updateMicButtonState(isRecording, isSupported = true, reason = '') {
        const button = this.elements.micButton;
        
        if (!isSupported) {
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
            button.title = `Speech input unavailable: ${reason}`;
            return;
        }
        
        if (isRecording) {
            button.classList.add('recording');
            button.title = 'Click to stop recording';
        } else {
            button.classList.remove('recording');
            button.title = 'Click to record voice';
        }
    }
    
    // Update input state (enabled/disabled)
    setInputState(enabled) {
        this.elements.questionInput.disabled = !enabled;
        if (enabled) {
            this.elements.questionInput.focus();
        }
    }

    // Add message to chat interface
    addChatMessage(message, isUser, isLatest = false) {
        // Hide empty state if showing
        this.hideEmptyState();
        
        // Create message container
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
        
        // Create message bubble
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        
        // Format AI responses, but not user messages
        if (!isUser) {
            bubbleDiv.innerHTML = this.formatAIResponse(message);
        } else {
            bubbleDiv.textContent = message;
        }
        
        // Create timestamp
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString([], {
            hour: '2-digit', 
            minute: '2-digit'
        });
        
        // Append elements
        messageDiv.appendChild(bubbleDiv);
        messageDiv.appendChild(timeDiv);
        
        // Add to messages container
        this.elements.conversationMessages.appendChild(messageDiv);
        this.messageCount++;
        
        // Auto-scroll to bottom
        this.scrollToBottom();
        
        // Limit message history (20 exchanges = 40 messages max)
        this.limitMessageHistory();
        
        console.log(`Added ${isUser ? 'user' : 'AI'} message${isLatest ? ' (latest)' : ''}`);
    }
    
    // Hide empty state
    hideEmptyState() {
        if (this.elements.conversationEmpty) {
            this.elements.conversationEmpty.style.display = 'none';
        }
    }
    
    // Show empty state
    showEmptyState() {
        if (this.elements.conversationEmpty) {
            this.elements.conversationEmpty.style.display = 'flex';
        }
    }
    
    // Auto-scroll to bottom of chat
    scrollToBottom() {
        if (this.elements.conversationMessages) {
            this.elements.conversationMessages.scrollTop = 
                this.elements.conversationMessages.scrollHeight;
        }
    }
    
    // Limit message history to 20 exchanges (40 messages)
    limitMessageHistory() {
        const messages = this.elements.conversationMessages.querySelectorAll('.message');
        const maxMessages = 40; // 20 exchanges
        
        if (messages.length > maxMessages) {
            const toRemove = messages.length - maxMessages;
            for (let i = 0; i < toRemove; i++) {
                if (messages[i]) {
                    messages[i].remove();
                    this.messageCount--;
                }
            }
            console.log(`Removed ${toRemove} old messages to maintain limit`);
        }
    }
    
    // Replace old exchange display with chat messages
    updateCurrentExchange(question, response) {
        // Add user message
        this.addChatMessage(question, true, false);
        
        // Add AI response (mark as latest for audio handling)
        this.addChatMessage(response, false, true);
        
        // Update old display elements for backward compatibility
        if (this.elements.questionDisplay) {
            this.elements.questionDisplay.textContent = question;
        }
        if (this.elements.responseDisplay) {
            this.elements.responseDisplay.textContent = response;
        }
    }
    
    // Show/hide audio player (use hidden element only)
    toggleAudioPlayer(show) {
        // Only show the hidden audio player for compatibility
        if (this.elements.audioPlayer) {
            this.elements.audioPlayer.style.display = show ? 'block' : 'none';
        }
        
        // Log audio status for debugging
        console.log(`Audio player ${show ? 'enabled' : 'disabled'} (hidden element)`);
    }
    
    // Clear input field
    clearInput() {
        this.elements.questionInput.value = '';
        this.updateCharCounter();
    }
    
    // Reset conversation display
    resetExchangeDisplay() {
        // Clear chat messages
        if (this.elements.conversationMessages) {
            this.elements.conversationMessages.innerHTML = '';
            
            // Re-add empty state
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'conversation-empty';
            emptyDiv.id = 'conversationEmpty';
            emptyDiv.innerHTML = `
                <div class="empty-icon">💬</div>
                <div class="empty-text">Start a conversation by typing a message or using voice input below</div>
            `;
            this.elements.conversationMessages.appendChild(emptyDiv);
            this.elements.conversationEmpty = emptyDiv;
        }
        
        // Reset message count
        this.messageCount = 0;
        
        // Reset old display for compatibility
        if (this.elements.questionDisplay) {
            this.elements.questionDisplay.textContent = 'No question yet';
        }
        if (this.elements.responseDisplay) {
            this.elements.responseDisplay.textContent = 'No response yet';
        }
        
        // Hide audio player
        this.toggleAudioPlayer(false);
        
        console.log('Conversation display reset');
    }
    
    // Get current input value
    getInputValue() {
        return this.elements.questionInput.value.trim();
    }
    
    // Set input value
    setInputValue(value) {
        this.elements.questionInput.value = value;
        this.updateCharCounter();
    }
    
    // UPDATED: Get selected model - now gets from settings manager
    getSelectedModel() {
        // First try to get from settings manager
        if (window.aiAssistant && window.aiAssistant.settings) {
            const modelFromSettings = window.aiAssistant.settings.getSelectedModel();
            if (modelFromSettings) {
                return modelFromSettings;
            }
        }
        
        // Fallback to hidden select element if settings not available
        const selectedValue = this.elements.modelSelect?.value;
        
        // If no model selected or empty value, return null
        if (!selectedValue || selectedValue === '') {
            console.warn('No model selected');
            return null;
        }
        
        return selectedValue;
    }
    
    // Setup event listeners
    setupEventListeners(callbacks) {
        // Input character counter
        this.elements.questionInput.addEventListener('input', () => {
            this.updateCharCounter();
            if (callbacks.onInputChange) callbacks.onInputChange();
        });
        
        // Enter key handling (Shift+Enter for new line, Enter to submit)
        this.elements.questionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (callbacks.onSubmit) callbacks.onSubmit();
            }
        });
        
        // Microphone button
        this.elements.micButton.addEventListener('click', () => {
            if (callbacks.onMicClick) callbacks.onMicClick();
        });
        
        // Clear button
        this.elements.clearButton.addEventListener('click', () => {
            if (callbacks.onClear) callbacks.onClear();
        });
    }
    
    // Focus input field
    focusInput() {
        this.elements.questionInput.focus();
    }
    
    // Get audio element (use hidden element only)
    getAudioElement() {
        // Always return the original hidden audio element
        // This ensures consistent audio playback without visible controls in chat
        return this.elements.audioElement;
    }
    
    // Get message count for debugging
    getMessageCount() {
        return this.messageCount;
    }
    
    // Get total messages in DOM (for debugging)
    getTotalMessagesInDOM() {
        if (this.elements.conversationMessages) {
            return this.elements.conversationMessages.querySelectorAll('.message').length;
        }
        return 0;
    }
    
    // Force scroll to specific message (for future use)
    scrollToMessage(messageIndex) {
        const messages = this.elements.conversationMessages.querySelectorAll('.message');
        if (messages[messageIndex]) {
            messages[messageIndex].scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }
    }
    
    // Add typing indicator (enhanced)
    showTypingIndicator() {
        // Remove existing typing indicator
        this.hideTypingIndicator();
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message ai-message typing-indicator';
        typingDiv.id = 'typingIndicator';
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        bubbleDiv.innerHTML = `
            <span class="typing-dots">
                <span>●</span>
                <span>●</span>
                <span>●</span>
            </span>
        `;
        
        typingDiv.appendChild(bubbleDiv);
        this.elements.conversationMessages.appendChild(typingDiv);
        this.scrollToBottom();
        
        console.log('Typing indicator shown');
    }
    
    // Hide typing indicator
    hideTypingIndicator() {
        const existing = document.getElementById('typingIndicator');
        if (existing) {
            existing.remove();
            console.log('Typing indicator hidden');
        }
    }
    
    // Add visual feedback for audio status
    showAudioFeedback(message) {
        // Could add a small audio icon or status to the latest AI message
        // For now, just log the status
        console.log(`Audio feedback: ${message}`);
    }
    
    // Check if chat has messages
    hasMessages() {
        return this.messageCount > 0;
    }
    
    // Get latest message element (for future enhancements)
    getLatestMessage() {
        const messages = this.elements.conversationMessages.querySelectorAll('.message');
        return messages.length > 0 ? messages[messages.length - 1] : null;
    }
}
