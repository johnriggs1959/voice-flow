// Data Exporter - Handles data export and download functionality
// Path: js/logging/data-exporter.js

export class DataExporter {
    constructor() {
        this.supportedFormats = ['json', 'jsonl', 'csv', 'markdown'];
        this.compressionEnabled = true;
    }
    
    // Main export function
    async export(data, format = 'json', options = {}) {
        if (!this.supportedFormats.includes(format)) {
            throw new Error(`Unsupported format: ${format}. Supported formats: ${this.supportedFormats.join(', ')}`);
        }
        
        let blob;
        let filename;
        
        switch (format) {
            case 'json':
                blob = await this.exportAsJSON(data, options);
                filename = this.generateFilename('json');
                break;
            
            case 'jsonl':
                blob = await this.exportAsJSONL(data, options);
                filename = this.generateFilename('jsonl');
                break;
            
            case 'csv':
                blob = await this.exportAsCSV(data, options);
                filename = this.generateFilename('csv');
                break;
            
            case 'markdown':
                blob = await this.exportAsMarkdown(data, options);
                filename = this.generateFilename('md');
                break;
            
            default:
                throw new Error(`Format ${format} not implemented`);
        }
        
        // Compress if enabled and size is significant
        if (this.compressionEnabled && blob.size > 1024 * 1024) { // > 1MB
            blob = await this.compressBlob(blob);
            filename += '.gz';
        }
        
        // Trigger download
        this.downloadBlob(blob, filename);
        
        return {
            format,
            filename,
            size: blob.size,
            records: Array.isArray(data) ? data.length : 1
        };
    }
    
    // Export as JSON
    async exportAsJSON(data, options = {}) {
        const exportData = {
            metadata: {
                exportDate: new Date().toISOString(),
                version: '1.0',
                recordCount: Array.isArray(data) ? data.length : 1,
                options
            },
            data: data
        };
        
        const jsonString = options.pretty 
            ? JSON.stringify(exportData, null, 2)
            : JSON.stringify(exportData);
        
        return new Blob([jsonString], { type: 'application/json' });
    }
    
    // Export as JSONL (JSON Lines)
    async exportAsJSONL(data, options = {}) {
        if (!Array.isArray(data)) {
            data = [data];
        }
        
        const lines = data.map(item => JSON.stringify(item));
        
        // Add metadata as first line if requested
        if (options.includeMetadata) {
            const metadata = {
                _metadata: true,
                exportDate: new Date().toISOString(),
                recordCount: data.length
            };
            lines.unshift(JSON.stringify(metadata));
        }
        
        const jsonlString = lines.join('\n');
        return new Blob([jsonlString], { type: 'application/x-ndjson' });
    }
    
    // Export as CSV
    async exportAsCSV(data, options = {}) {
        if (!Array.isArray(data)) {
            data = [data];
        }
        
        if (data.length === 0) {
            return new Blob(['No data to export'], { type: 'text/csv' });
        }
        
        // Flatten nested objects for CSV
        const flatData = data.map(item => this.flattenObject(item));
        
        // Get all unique headers
        const headers = new Set();
        flatData.forEach(item => {
            Object.keys(item).forEach(key => headers.add(key));
        });
        
        const headerArray = Array.from(headers);
        
        // Build CSV content
        const csvLines = [];
        
        // Add headers
        csvLines.push(this.escapeCSVRow(headerArray));
        
        // Add data rows
        flatData.forEach(item => {
            const row = headerArray.map(header => {
                const value = item[header] || '';
                return this.escapeCSVValue(String(value));
            });
            csvLines.push(row.join(','));
        });
        
        const csvString = csvLines.join('\n');
        return new Blob([csvString], { type: 'text/csv' });
    }
    
    // Export as Markdown
    async exportAsMarkdown(data, options = {}) {
        if (!Array.isArray(data)) {
            data = [data];
        }
        
        let markdown = '# AI Assistant Chat Logs\n\n';
        markdown += `**Export Date:** ${new Date().toISOString()}\n`;
        markdown += `**Total Conversations:** ${data.length}\n\n`;
        markdown += '---\n\n';
        
        // Group by session if available
        const sessions = this.groupBySession(data);
        
        for (const [sessionId, turns] of sessions.entries()) {
            markdown += `## Session: ${sessionId}\n\n`;
            markdown += `**Turns:** ${turns.length}\n`;
            
            if (turns.length > 0) {
                const firstTurn = turns[0];
                const lastTurn = turns[turns.length - 1];
                markdown += `**Duration:** ${firstTurn.timestamp} to ${lastTurn.timestamp}\n\n`;
            }
            
            // Add conversation turns
            turns.forEach((turn, index) => {
                markdown += `### Turn ${turn.turnNumber || index + 1}\n\n`;
                
                // User input
                if (turn.conversation?.userInput) {
                    markdown += `**User:** ${turn.conversation.userInput}\n\n`;
                }
                
                // AI response
                if (turn.conversation?.aiResponse) {
                    markdown += `**Assistant:** ${turn.conversation.aiResponse}\n\n`;
                }
                
                // Audio configuration (Voice & STT Model)
                if (turn.audioConfig) {
                    markdown += `**Audio Configuration:**\n`;
                    if (turn.audioConfig.voice) {
                        // Convert voice code to readable name
                        const voiceNames = {
                            'af_heart': 'Heart (Female, American)',
                            'af_bella': 'Bella (Female, American)',
                            'af_sarah': 'Sarah (Female, American)',
                            'am_adam': 'Adam (Male, American)',
                            'af_alloy': 'Alloy (Female, American)',
                            'af_aoede': 'Aoede (Female, American)',
                            'bf_alice': 'Alice (Female, British)',
                            'bf_emma': 'Emma (Female, British)',
                            'bf_lily': 'Lily (Female, British)',
                            'bm_daniel': 'Daniel (Male, British)',
                            'bm_fable': 'Fable (Male, British)',
                            'bm_george': 'George (Male, British)',
                            'bm_lewis': 'Lewis (Male, British)'
                        };
                        markdown += `- Voice: ${voiceNames[turn.audioConfig.voice] || turn.audioConfig.voice}\n`;
                    }
                    if (turn.audioConfig.sttModel) {
                        const sttModelNames = {
                            'tiny': 'Tiny (Fastest)',
                            'base': 'Base (Balanced)',
                            'small': 'Small (Good)',
                            'medium': 'Medium (Better)',
                            'large': 'Large (Best)'
                        };
                        markdown += `- STT Model: ${sttModelNames[turn.audioConfig.sttModel] || turn.audioConfig.sttModel}\n`;
                    }
                    if (turn.audioConfig.speechRate && turn.audioConfig.speechRate !== 1.0) {
                        markdown += `- Speech Rate: ${turn.audioConfig.speechRate}x\n`;
                    }
                    markdown += '\n';
                }
                
                // Performance metrics
                if (turn.performance) {
                    markdown += `**Performance:**\n`;
                    if (turn.performance.sttTime) {
                        markdown += `- STT: ${turn.performance.sttTime.toFixed(3)}s\n`;
                    }
                    if (turn.performance.llmTime) {
                        markdown += `- LLM: ${turn.performance.llmTime.toFixed(3)}s\n`;
                    }
                    if (turn.performance.ttsTime) {
                        markdown += `- TTS: ${turn.performance.ttsTime.toFixed(3)}s\n`;
                    }
                    markdown += `- Total: ${turn.performance.totalTime.toFixed(3)}s\n\n`;
                }
                
                // Model info
                if (turn.modelConfig) {
                    markdown += `**Model:** ${turn.modelConfig.model}`;
                    if (turn.modelConfig.temperature !== undefined) {
                        markdown += ` (temp: ${turn.modelConfig.temperature}`;
                        if (turn.modelConfig.topP !== undefined) {
                            markdown += `, top-p: ${turn.modelConfig.topP}`;
                        }
                        markdown += ')';
                    }
                    markdown += '\n\n';
                }
                
                markdown += '---\n\n';
            });
        }
        
        return new Blob([markdown], { type: 'text/markdown' });
    }
    
    // Flatten nested object for CSV export
    flattenObject(obj, prefix = '') {
        const flattened = {};
        
        for (const [key, value] of Object.entries(obj)) {
            const newKey = prefix ? `${prefix}.${key}` : key;
            
            if (value === null || value === undefined) {
                flattened[newKey] = '';
            } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                Object.assign(flattened, this.flattenObject(value, newKey));
            } else if (Array.isArray(value)) {
                flattened[newKey] = value.join('; ');
            } else if (value instanceof Date) {
                flattened[newKey] = value.toISOString();
            } else {
                flattened[newKey] = value;
            }
        }
        
        return flattened;
    }
    
    // Group data by session
    groupBySession(data) {
        const sessions = new Map();
        
        data.forEach(item => {
            const sessionId = item.sessionId || 'unknown';
            if (!sessions.has(sessionId)) {
                sessions.set(sessionId, []);
            }
            sessions.get(sessionId).push(item);
        });
        
        // Sort turns within each session
        for (const turns of sessions.values()) {
            turns.sort((a, b) => {
                if (a.turnNumber && b.turnNumber) {
                    return a.turnNumber - b.turnNumber;
                }
                return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
            });
        }
        
        return sessions;
    }
    
    // Escape CSV value
    escapeCSVValue(value) {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }
    
    // Escape CSV row
    escapeCSVRow(row) {
        return row.map(value => this.escapeCSVValue(String(value))).join(',');
    }
    
    // Compress blob using CompressionStream API
    async compressBlob(blob) {
        if (!window.CompressionStream) {
            console.warn('CompressionStream API not available, skipping compression');
            return blob;
        }
        
        try {
            const stream = blob.stream();
            const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
            return new Blob([await new Response(compressedStream).blob()]);
        } catch (error) {
            console.error('Compression failed:', error);
            return blob;
        }
    }
    
    // Generate filename with timestamp
    generateFilename(extension) {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        return `ai-assistant-logs_${dateStr}_${timeStr}.${extension}`;
    }
    
    // Download blob as file
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
    }
    
    // Export analytics report
    async exportAnalyticsReport(analytics, format = 'markdown') {
        if (format === 'markdown') {
            return this.exportAnalyticsAsMarkdown(analytics);
        } else if (format === 'json') {
            return this.exportAsJSON(analytics, { pretty: true });
        }
        
        throw new Error(`Unsupported analytics format: ${format}`);
    }
    
    // Export analytics as Markdown report
    async exportAnalyticsAsMarkdown(analytics) {
        let markdown = '# AI Assistant Analytics Report\n\n';
        markdown += `**Generated:** ${new Date().toISOString()}\n\n`;
        
        // Sessions summary
        markdown += '## Sessions\n\n';
        markdown += `- Total Sessions: ${analytics.sessions.total}\n`;
        markdown += `- Active Sessions: ${analytics.sessions.active}\n\n`;
        
        // Usage patterns
        markdown += '## Usage Patterns\n\n';
        markdown += `- Peak Hour: ${analytics.usage.peakHour}:00\n`;
        markdown += `- Peak Day: ${this.getDayName(analytics.usage.peakDay)}\n`;
        markdown += `- Input Methods: Text (${analytics.usage.patterns.inputMethods.text}), Voice (${analytics.usage.patterns.inputMethods.voice})\n\n`;
        
        // Quality metrics
        markdown += '## Quality Metrics\n\n';
        markdown += `- Total Turns: ${analytics.quality.totalTurns}\n`;
        markdown += `- Average Response Time: ${analytics.quality.averageResponseTime.toFixed(2)}s\n`;
        markdown += `- Average Response Length: ${Math.round(analytics.quality.averageResponseLength)} chars\n`;
        markdown += `- Success Rate: ${(analytics.quality.successRate * 100).toFixed(1)}%\n\n`;
        
        // Model performance
        if (analytics.models && analytics.models.length > 0) {
            markdown += '## Model Performance\n\n';
            markdown += '| Model | Turns | Avg Response Time | Error Rate | P50 | P95 |\n';
            markdown += '|-------|-------|-------------------|------------|-----|-----|\n';
            
            analytics.models.forEach(model => {
                markdown += `| ${model.model} | ${model.turns} | ${model.averageResponseTime}s | ${(parseFloat(model.errorRate) * 100).toFixed(2)}% | ${model.responseTimeP50}s | ${model.responseTimeP95}s |\n`;
            });
            markdown += '\n';
        }
        
        // Topics
        if (analytics.topics && analytics.topics.length > 0) {
            markdown += '## Topic Distribution\n\n';
            analytics.topics.forEach(topic => {
                markdown += `- **${topic.topic}**: ${topic.count} (${topic.percentage}%)\n`;
            });
            markdown += '\n';
        }
        
        // Errors
        if (analytics.errors && analytics.errors.length > 0) {
            markdown += '## Error Analysis\n\n';
            analytics.errors.forEach(error => {
                markdown += `- **${error.type}**: ${error.count} occurrences (${(parseFloat(error.rate) * 100).toFixed(2)}% rate)\n`;
            });
            markdown += '\n';
        }
        
        return new Blob([markdown], { type: 'text/markdown' });
    }
    
    // Helper to get day name
    getDayName(dayIndex) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[dayIndex] || 'Unknown';
    }
}
