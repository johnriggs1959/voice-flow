// Analytics Collector - Aggregates and analyzes conversation data
// Path: js/logging/analytics-collector.js

export class AnalyticsCollector {
    constructor() {
        // Analytics data structures
        this.sessionAnalytics = new Map();
        this.modelPerformance = new Map();
        this.usagePatterns = {
            hourly: new Array(24).fill(0),
            daily: new Array(7).fill(0),
            inputMethods: { text: 0, voice: 0 }
        };
        this.errorPatterns = new Map();
        this.topicCategories = new Map();
        
        // Quality metrics
        this.qualityMetrics = {
            averageResponseTime: 0,
            averageResponseLength: 0,
            averageUserInputLength: 0,
            successRate: 1.0,
            totalTurns: 0
        };
        
        // Real-time metrics
        this.realtimeMetrics = {
            lastHourTurns: [],
            last24HoursTurns: [],
            responseTimeHistory: []
        };
        
        // Initialize
        this.initialize();
    }
    
    // Initialize analytics
    initialize() {
        // Load saved analytics from localStorage
        this.loadAnalytics();
        
        // Setup periodic aggregation
        this.setupPeriodicAggregation();
        
        console.log('AnalyticsCollector initialized');
    }
    
    // Add conversation turn to analytics
    addTurn(logEntry) {
        try {
            // Validate log entry
            if (!this.validateLogEntry(logEntry)) {
                console.warn('Invalid log entry provided to analytics collector');
                return;
            }
            
            // Update session analytics
            this.updateSessionAnalytics(logEntry);
            
            // Update model performance
            this.updateModelPerformance(logEntry);
            
            // Update usage patterns
            this.updateUsagePatterns(logEntry);
            
            // Update quality metrics
            this.updateQualityMetrics(logEntry);
            
            // Update real-time metrics
            this.updateRealtimeMetrics(logEntry);
            
            // Extract topics (placeholder for NLP integration)
            this.extractTopics(logEntry);
            
            // Save analytics periodically
            if (this.qualityMetrics.totalTurns % 10 === 0) {
                this.saveAnalytics();
            }
        } catch (error) {
            console.error('Error in analytics addTurn:', error);
        }
    }
    
    // ADDED: Validate log entry structure
    validateLogEntry(logEntry) {
        if (!logEntry || typeof logEntry !== 'object') {
            return false;
        }
        
        // Check for required basic properties
        if (!logEntry.timestamp || !logEntry.sessionId) {
            console.warn('Log entry missing timestamp or sessionId');
            return false;
        }
        
        return true;
    }
    
    // ADDED: Helper method to safely get nested properties
    safeGet(obj, path, defaultValue = null) {
        try {
            return path.split('.').reduce((current, key) => current?.[key], obj) ?? defaultValue;
        } catch {
            return defaultValue;
        }
    }
    
    // ADDED: Helper method to determine input method from available data
    determineInputMethod(logEntry) {
        // Check if there's STT performance data (indicates voice input)
        const sttTime = this.safeGet(logEntry, 'performance.sttTime', 0);
        if (sttTime > 0) {
            return 'voice';
        }
        
        // Check audio config for voice indicators
        const voice = this.safeGet(logEntry, 'audioConfig.voice');
        if (voice) {
            return 'voice';
        }
        
        // Check for conversation input method (if available)
        const inputMethod = this.safeGet(logEntry, 'conversation.inputMethod');
        if (inputMethod) {
            return inputMethod;
        }
        
        // Default to text input
        return 'text';
    }
    
    // UPDATED: Update session analytics with defensive checks
    updateSessionAnalytics(logEntry) {
        try {
            const sessionId = logEntry.sessionId;
            
            if (!this.sessionAnalytics.has(sessionId)) {
                this.sessionAnalytics.set(sessionId, {
                    startTime: logEntry.timestamp,
                    endTime: logEntry.timestamp,
                    turnCount: 0,
                    totalResponseTime: 0,
                    errors: 0,
                    models: new Set(),
                    voices: new Set(),
                    inputMethods: new Set()
                });
            }
            
            const session = this.sessionAnalytics.get(sessionId);
            session.endTime = logEntry.timestamp;
            session.turnCount++;
            session.totalResponseTime += this.safeGet(logEntry, 'performance.totalTime', 0);
            session.models.add(this.safeGet(logEntry, 'modelConfig.model', 'unknown'));
            session.voices.add(this.safeGet(logEntry, 'audioConfig.voice', 'unknown'));
            
            // FIXED: Use helper method to determine input method
            const inputMethod = this.determineInputMethod(logEntry);
            session.inputMethods.add(inputMethod);
            
            if (this.safeGet(logEntry, 'quality.hasErrors', false)) {
                session.errors++;
            }
        } catch (error) {
            console.error('Error updating session analytics:', error);
        }
    }
    
    // UPDATED: Update model performance metrics with defensive checks
    updateModelPerformance(logEntry) {
        try {
            const model = this.safeGet(logEntry, 'modelConfig.model', 'unknown');
            
            if (!this.modelPerformance.has(model)) {
                this.modelPerformance.set(model, {
                    totalTurns: 0,
                    totalResponseTime: 0,
                    averageResponseTime: 0,
                    totalTokens: 0,
                    errors: 0,
                    temperatures: [],
                    topPs: [],
                    responseTimeDistribution: []
                });
            }
            
            const perf = this.modelPerformance.get(model);
            perf.totalTurns++;
            
            const llmTime = this.safeGet(logEntry, 'performance.llmTime', 0);
            perf.totalResponseTime += llmTime;
            perf.averageResponseTime = perf.totalResponseTime / perf.totalTurns;
            perf.totalTokens += this.safeGet(logEntry, 'quality.responseLength', 0);
            
            const temperature = this.safeGet(logEntry, 'modelConfig.temperature');
            if (temperature !== null) {
                perf.temperatures.push(temperature);
            }
            
            const topP = this.safeGet(logEntry, 'modelConfig.topP');
            if (topP !== null) {
                perf.topPs.push(topP);
            }
            
            perf.responseTimeDistribution.push(llmTime);
            
            if (this.safeGet(logEntry, 'quality.hasErrors', false)) {
                perf.errors++;
            }
            
            // Keep only last 100 entries for distribution
            if (perf.responseTimeDistribution.length > 100) {
                perf.responseTimeDistribution.shift();
            }
        } catch (error) {
            console.error('Error updating model performance:', error);
        }
    }
    
    // UPDATED: Update usage patterns with defensive checks
    updateUsagePatterns(logEntry) {
        try {
            const date = new Date(logEntry.timestamp);
            const hour = date.getHours();
            const dayOfWeek = date.getDay();
            
            this.usagePatterns.hourly[hour]++;
            this.usagePatterns.daily[dayOfWeek]++;
            
            // FIXED: Use helper method to determine input method
            const inputMethod = this.determineInputMethod(logEntry);
            this.usagePatterns.inputMethods[inputMethod]++;
        } catch (error) {
            console.error('Error updating usage patterns:', error);
        }
    }
    
    // UPDATED: Update quality metrics with defensive checks
    updateQualityMetrics(logEntry) {
        try {
            const n = this.qualityMetrics.totalTurns;
            
            // Update running averages
            const totalTime = this.safeGet(logEntry, 'performance.totalTime', 0);
            this.qualityMetrics.averageResponseTime = 
                (this.qualityMetrics.averageResponseTime * n + totalTime) / (n + 1);
            
            const responseLength = this.safeGet(logEntry, 'quality.responseLength', 0);
            this.qualityMetrics.averageResponseLength = 
                (this.qualityMetrics.averageResponseLength * n + responseLength) / (n + 1);
            
            const userInputLength = this.safeGet(logEntry, 'quality.userInputLength', 0);
            this.qualityMetrics.averageUserInputLength = 
                (this.qualityMetrics.averageUserInputLength * n + userInputLength) / (n + 1);
            
            // Update success rate
            if (this.safeGet(logEntry, 'quality.hasErrors', false)) {
                this.qualityMetrics.successRate = 
                    (this.qualityMetrics.successRate * n + 0) / (n + 1);
            } else {
                this.qualityMetrics.successRate = 
                    (this.qualityMetrics.successRate * n + 1) / (n + 1);
            }
            
            this.qualityMetrics.totalTurns++;
        } catch (error) {
            console.error('Error updating quality metrics:', error);
        }
    }
    
    // UPDATED: Update real-time metrics with defensive checks
    updateRealtimeMetrics(logEntry) {
        try {
            const now = Date.now();
            const timestamp = new Date(logEntry.timestamp).getTime();
            const responseTime = this.safeGet(logEntry, 'performance.totalTime', 0);
            
            // Add to last hour (keep only entries from last hour)
            this.realtimeMetrics.lastHourTurns.push({
                timestamp,
                responseTime
            });
            
            this.realtimeMetrics.lastHourTurns = this.realtimeMetrics.lastHourTurns.filter(
                turn => now - turn.timestamp < 3600000 // 1 hour
            );
            
            // Add to last 24 hours
            this.realtimeMetrics.last24HoursTurns.push({
                timestamp,
                responseTime
            });
            
            this.realtimeMetrics.last24HoursTurns = this.realtimeMetrics.last24HoursTurns.filter(
                turn => now - turn.timestamp < 86400000 // 24 hours
            );
            
            // Response time history (keep last 50)
            this.realtimeMetrics.responseTimeHistory.push(responseTime);
            if (this.realtimeMetrics.responseTimeHistory.length > 50) {
                this.realtimeMetrics.responseTimeHistory.shift();
            }
        } catch (error) {
            console.error('Error updating realtime metrics:', error);
        }
    }
    
    // UPDATED: Extract topics from conversation with defensive checks
    extractTopics(logEntry) {
        try {
            let text = '';
            
            // Try multiple ways to get conversation text
            const conversationUserInput = this.safeGet(logEntry, 'conversation.userInput', '');
            const conversationAiResponse = this.safeGet(logEntry, 'conversation.aiResponse', '');
            
            if (conversationUserInput || conversationAiResponse) {
                text = (conversationUserInput + ' ' + conversationAiResponse).toLowerCase();
            } else {
                // Try alternative property names
                const userInput = this.safeGet(logEntry, 'userInput', '') || 
                                 this.safeGet(logEntry, 'question', '') ||
                                 this.safeGet(logEntry, 'input', '');
                const aiResponse = this.safeGet(logEntry, 'aiResponse', '') || 
                                  this.safeGet(logEntry, 'response', '') ||
                                  this.safeGet(logEntry, 'output', '');
                text = (userInput + ' ' + aiResponse).toLowerCase();
            }
            
            if (!text.trim()) {
                // Don't log warning every time if no conversation text is available
                return;
            }
            
            const topicKeywords = {
                'technical': ['code', 'programming', 'software', 'debug', 'error', 'function', 'api'],
                'general': ['explain', 'what', 'how', 'why', 'tell', 'describe'],
                'creative': ['story', 'poem', 'write', 'creative', 'imagine', 'design'],
                'data': ['analyze', 'data', 'statistics', 'chart', 'graph', 'metrics'],
                'help': ['help', 'assist', 'support', 'problem', 'issue', 'fix']
            };
            
            for (const [category, keywords] of Object.entries(topicKeywords)) {
                const matches = keywords.filter(keyword => text.includes(keyword)).length;
                if (matches > 0) {
                    const count = this.topicCategories.get(category) || 0;
                    this.topicCategories.set(category, count + 1);
                }
            }
        } catch (error) {
            console.error('Error extracting topics:', error);
        }
    }
    
    // Track error patterns
    trackError(errors) {
        try {
            if (!errors || errors.length === 0) return;
            
            errors.forEach(error => {
                const errorType = error.type || 'unknown';
                const count = this.errorPatterns.get(errorType) || 0;
                this.errorPatterns.set(errorType, count + 1);
            });
        } catch (error) {
            console.error('Error tracking errors:', error);
        }
    }
    
    // Track custom event
    trackEvent(event) {
        try {
            // This can be extended to track specific events
            console.log('Event tracked:', event.type);
        } catch (error) {
            console.error('Error tracking event:', error);
        }
    }
    
    // Get analytics summary
    getSummary() {
        try {
            const now = Date.now();
            
            return {
                sessions: {
                    total: this.sessionAnalytics.size,
                    active: Array.from(this.sessionAnalytics.values()).filter(
                        s => now - new Date(s.endTime).getTime() < 3600000
                    ).length
                },
                models: this.getModelSummary(),
                usage: {
                    patterns: this.usagePatterns,
                    peakHour: this.usagePatterns.hourly.indexOf(Math.max(...this.usagePatterns.hourly)),
                    peakDay: this.usagePatterns.daily.indexOf(Math.max(...this.usagePatterns.daily))
                },
                quality: this.qualityMetrics,
                realtime: {
                    lastHourTurns: this.realtimeMetrics.lastHourTurns.length,
                    last24HoursTurns: this.realtimeMetrics.last24HoursTurns.length,
                    averageResponseTimeLast50: this.calculateAverage(this.realtimeMetrics.responseTimeHistory)
                },
                topics: Array.from(this.topicCategories.entries()).map(([topic, count]) => ({
                    topic,
                    count,
                    percentage: (count / Math.max(this.qualityMetrics.totalTurns, 1) * 100).toFixed(1)
                })),
                errors: Array.from(this.errorPatterns.entries()).map(([type, count]) => ({
                    type,
                    count,
                    rate: (count / Math.max(this.qualityMetrics.totalTurns, 1)).toFixed(4)
                }))
            };
        } catch (error) {
            console.error('Error getting analytics summary:', error);
            return {
                sessions: { total: 0, active: 0 },
                models: [],
                usage: { patterns: this.usagePatterns, peakHour: 0, peakDay: 0 },
                quality: this.qualityMetrics,
                realtime: { lastHourTurns: 0, last24HoursTurns: 0, averageResponseTimeLast50: 0 },
                topics: [],
                errors: []
            };
        }
    }
    
    // Get model performance summary
    getModelSummary() {
        try {
            const summary = [];
            
            for (const [model, perf] of this.modelPerformance.entries()) {
                summary.push({
                    model,
                    turns: perf.totalTurns,
                    averageResponseTime: perf.averageResponseTime.toFixed(2),
                    errorRate: (perf.errors / Math.max(perf.totalTurns, 1)).toFixed(4),
                    averageTemperature: this.calculateAverage(perf.temperatures).toFixed(2),
                    averageTopP: this.calculateAverage(perf.topPs).toFixed(2),
                    responseTimeP50: this.calculatePercentile(perf.responseTimeDistribution, 50).toFixed(2),
                    responseTimeP95: this.calculatePercentile(perf.responseTimeDistribution, 95).toFixed(2)
                });
            }
            
            return summary;
        } catch (error) {
            console.error('Error getting model summary:', error);
            return [];
        }
    }
    
    // Calculate average
    calculateAverage(arr) {
        if (!arr || arr.length === 0) return 0;
        try {
            return arr.reduce((a, b) => a + b, 0) / arr.length;
        } catch {
            return 0;
        }
    }
    
    // Calculate percentile
    calculatePercentile(arr, percentile) {
        if (!arr || arr.length === 0) return 0;
        
        try {
            const sorted = [...arr].sort((a, b) => a - b);
            const index = Math.ceil((percentile / 100) * sorted.length) - 1;
            return sorted[Math.max(0, index)];
        } catch {
            return 0;
        }
    }
    
    // Get insights and recommendations
    getInsights() {
        try {
            const insights = [];
            
            // Response time insights
            if (this.qualityMetrics.averageResponseTime > 5) {
                insights.push({
                    type: 'performance',
                    severity: 'warning',
                    message: 'Average response time is high. Consider using a smaller model or optimizing parameters.',
                    metric: `${this.qualityMetrics.averageResponseTime.toFixed(2)}s average`
                });
            }
            
            // Error rate insights
            const errorRate = 1 - this.qualityMetrics.successRate;
            if (errorRate > 0.1) {
                insights.push({
                    type: 'reliability',
                    severity: 'error',
                    message: 'High error rate detected. Check service status and error logs.',
                    metric: `${(errorRate * 100).toFixed(1)}% error rate`
                });
            }
            
            // Usage pattern insights
            const peakHour = this.usagePatterns.hourly.indexOf(Math.max(...this.usagePatterns.hourly));
            insights.push({
                type: 'usage',
                severity: 'info',
                message: `Peak usage occurs at ${peakHour}:00. Consider pre-warming models before this time.`,
                metric: `${this.usagePatterns.hourly[peakHour]} turns at peak`
            });
            
            // Model performance comparison
            const modelPerf = this.getModelSummary();
            if (modelPerf.length > 1) {
                const bestModel = modelPerf.reduce((best, current) => 
                    parseFloat(current.averageResponseTime) < parseFloat(best.averageResponseTime) ? current : best
                );
                insights.push({
                    type: 'optimization',
                    severity: 'info',
                    message: `${bestModel.model} has the best response time performance.`,
                    metric: `${bestModel.averageResponseTime}s average`
                });
            }
            
            return insights;
        } catch (error) {
            console.error('Error getting insights:', error);
            return [];
        }
    }
    
    // Setup periodic aggregation
    setupPeriodicAggregation() {
        try {
            // Aggregate analytics every 5 minutes
            this.aggregationInterval = setInterval(() => {
                this.aggregateAnalytics();
            }, 5 * 60 * 1000);
        } catch (error) {
            console.error('Error setting up periodic aggregation:', error);
        }
    }
    
    // Aggregate analytics for long-term storage
    aggregateAnalytics() {
        try {
            const summary = this.getSummary();
            const insights = this.getInsights();
            
            // Save aggregated data
            const aggregatedData = {
                timestamp: new Date().toISOString(),
                summary,
                insights
            };
            
            // Store in localStorage for now (can be sent to server later)
            const existing = localStorage.getItem('ai-assistant-analytics-aggregated');
            const data = existing ? JSON.parse(existing) : [];
            data.push(aggregatedData);
            
            // Keep only last 7 days of aggregated data
            const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const filtered = data.filter(d => new Date(d.timestamp).getTime() > cutoff);
            
            localStorage.setItem('ai-assistant-analytics-aggregated', JSON.stringify(filtered));
        } catch (error) {
            console.error('Failed to aggregate analytics:', error);
        }
    }
    
    // Load analytics from storage
    loadAnalytics() {
        try {
            const saved = localStorage.getItem('ai-assistant-analytics-state');
            if (saved) {
                const data = JSON.parse(saved);
                
                // Restore metrics
                if (data.qualityMetrics) {
                    Object.assign(this.qualityMetrics, data.qualityMetrics);
                }
                
                if (data.usagePatterns) {
                    Object.assign(this.usagePatterns, data.usagePatterns);
                }
                
                console.log('Analytics loaded from storage');
            }
        } catch (error) {
            console.error('Failed to load analytics:', error);
        }
    }
    
    // Save analytics to storage
    saveAnalytics() {
        try {
            const data = {
                qualityMetrics: this.qualityMetrics,
                usagePatterns: this.usagePatterns,
                timestamp: new Date().toISOString()
            };
            
            localStorage.setItem('ai-assistant-analytics-state', JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save analytics:', error);
        }
    }
    
    // Reset analytics
    reset() {
        try {
            this.sessionAnalytics.clear();
            this.modelPerformance.clear();
            this.errorPatterns.clear();
            this.topicCategories.clear();
            
            this.usagePatterns = {
                hourly: new Array(24).fill(0),
                daily: new Array(7).fill(0),
                inputMethods: { text: 0, voice: 0 }
            };
            
            this.qualityMetrics = {
                averageResponseTime: 0,
                averageResponseLength: 0,
                averageUserInputLength: 0,
                successRate: 1.0,
                totalTurns: 0
            };
            
            this.realtimeMetrics = {
                lastHourTurns: [],
                last24HoursTurns: [],
                responseTimeHistory: []
            };
            
            this.saveAnalytics();
            console.log('Analytics reset');
        } catch (error) {
            console.error('Error resetting analytics:', error);
        }
    }
    
    // Cleanup
    cleanup() {
        try {
            if (this.aggregationInterval) {
                clearInterval(this.aggregationInterval);
                this.aggregationInterval = null;
            }
            
            this.saveAnalytics();
            console.log('AnalyticsCollector cleanup completed');
        } catch (error) {
            console.error('Error in analytics cleanup:', error);
        }
    }
}
