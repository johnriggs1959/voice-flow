// Storage Manager - Handles local file operations for chat logs
// Path: js/logging/storage-manager.js

export class StorageManager {
    constructor() {
        // IndexedDB for structured storage
        this.dbName = 'AIAssistantLogs';
        this.dbVersion = 1;
        this.db = null;
        
        // Storage quotas
        this.maxStorageSize = 100 * 1024 * 1024; // 100MB
        this.storageWarningThreshold = 0.8; // Warn at 80% usage
        
        // Initialize database
        this.initDatabase();
    }
    
    // Initialize IndexedDB
    async initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB initialized successfully');
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object stores
                if (!db.objectStoreNames.contains('conversations')) {
                    const conversationStore = db.createObjectStore('conversations', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    conversationStore.createIndex('sessionId', 'sessionId', { unique: false });
                    conversationStore.createIndex('timestamp', 'timestamp', { unique: false });
                    conversationStore.createIndex('turnNumber', 'turnNumber', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('events')) {
                    const eventStore = db.createObjectStore('events', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    eventStore.createIndex('type', 'type', { unique: false });
                    eventStore.createIndex('sessionId', 'sessionId', { unique: false });
                    eventStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('analytics')) {
                    const analyticsStore = db.createObjectStore('analytics', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    analyticsStore.createIndex('date', 'date', { unique: false });
                    analyticsStore.createIndex('type', 'type', { unique: false });
                }
                
                console.log('IndexedDB schema created/updated');
            };
        });
    }
    
    // Save logs to IndexedDB
    async saveLogs(logs, sessionId) {
        if (!this.db) {
            await this.initDatabase();
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['conversations'], 'readwrite');
            const store = transaction.objectStore('conversations');
            
            let savedCount = 0;
            
            logs.forEach(log => {
                const request = store.add(log);
                
                request.onsuccess = () => {
                    savedCount++;
                    if (savedCount === logs.length) {
                        resolve(true);
                    }
                };
                
                request.onerror = () => {
                    console.error('Failed to save log:', request.error);
                };
            });
            
            transaction.oncomplete = () => {
                console.log(`Saved ${savedCount} logs to IndexedDB`);
                this.checkStorageQuota();
            };
            
            transaction.onerror = () => {
                reject(transaction.error);
            };
        });
    }
    
    // Save event to IndexedDB
    async saveEvent(event) {
        if (!this.db) {
            await this.initDatabase();
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            
            const request = store.add(event);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    // Get logs with filtering options
    async getLogs(options = {}) {
        if (!this.db) {
            await this.initDatabase();
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['conversations'], 'readonly');
            const store = transaction.objectStore('conversations');
            
            let request;
            const logs = [];
            
            // Apply filters
            if (options.sessionId) {
                const index = store.index('sessionId');
                request = index.openCursor(IDBKeyRange.only(options.sessionId));
            } else if (options.dateRange) {
                const index = store.index('timestamp');
                const range = IDBKeyRange.bound(
                    options.dateRange.start,
                    options.dateRange.end
                );
                request = index.openCursor(range);
            } else {
                request = store.openCursor();
            }
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                
                if (cursor) {
                    // Apply additional filters
                    let include = true;
                    
                    if (options.model && cursor.value.modelConfig?.model !== options.model) {
                        include = false;
                    }
                    
                    if (options.inputMethod && cursor.value.conversation?.inputMethod !== options.inputMethod) {
                        include = false;
                    }
                    
                    if (include) {
                        logs.push(cursor.value);
                    }
                    
                    cursor.continue();
                } else {
                    // Apply limit if specified
                    if (options.limit && logs.length > options.limit) {
                        resolve(logs.slice(0, options.limit));
                    } else {
                        resolve(logs);
                    }
                }
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    // Export logs as JSONL for streaming
    async exportAsJSONL(logs) {
        const jsonlLines = logs.map(log => JSON.stringify(log)).join('\n');
        return new Blob([jsonlLines], { type: 'application/x-ndjson' });
    }
    
    // Export logs as JSON
    async exportAsJSON(logs) {
        const data = {
            exportDate: new Date().toISOString(),
            version: '1.0',
            logs: logs
        };
        return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    }
    
    // Check storage quota
    async checkStorageQuota() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const usage = estimate.usage || 0;
            const quota = estimate.quota || this.maxStorageSize;
            const percentUsed = usage / quota;
            
            if (percentUsed > this.storageWarningThreshold) {
                console.warn(`Storage usage high: ${(percentUsed * 100).toFixed(1)}%`);
                
                // Trigger automatic cleanup of old logs
                await this.performStorageCleanup();
            }
            
            return {
                used: usage,
                quota: quota,
                percentUsed: percentUsed
            };
        }
        
        return null;
    }
    
    // Perform storage cleanup
    async performStorageCleanup() {
        // Remove logs older than 30 days by default
        const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['conversations'], 'readwrite');
            const store = transaction.objectStore('conversations');
            const index = store.index('timestamp');
            
            let deletedCount = 0;
            
            const request = index.openCursor(IDBKeyRange.upperBound(cutoffDate));
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                
                if (cursor) {
                    store.delete(cursor.primaryKey);
                    deletedCount++;
                    cursor.continue();
                } else {
                    console.log(`Cleaned up ${deletedCount} old log entries`);
                    resolve(deletedCount);
                }
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    // Clear logs before a specific date
    async clearLogsBeforeDate(timestamp) {
        if (!this.db) {
            await this.initDatabase();
        }
        
        const cutoffDate = new Date(timestamp).toISOString();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['conversations'], 'readwrite');
            const store = transaction.objectStore('conversations');
            const index = store.index('timestamp');
            
            let deletedCount = 0;
            
            const request = index.openCursor(IDBKeyRange.upperBound(cutoffDate));
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                
                if (cursor) {
                    store.delete(cursor.primaryKey);
                    deletedCount++;
                    cursor.continue();
                } else {
                    resolve(deletedCount);
                }
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    // Get storage statistics
    async getStats() {
        if (!this.db) {
            await this.initDatabase();
        }
        
        const stats = {
            conversations: 0,
            events: 0,
            analytics: 0,
            oldestEntry: null,
            newestEntry: null,
            storageUsage: null
        };
        
        // Count conversations
        const conversationCount = await this.countRecords('conversations');
        stats.conversations = conversationCount;
        
        // Count events
        const eventCount = await this.countRecords('events');
        stats.events = eventCount;
        
        // Count analytics
        const analyticsCount = await this.countRecords('analytics');
        stats.analytics = analyticsCount;
        
        // Get date range
        const dateRange = await this.getDateRange();
        stats.oldestEntry = dateRange.oldest;
        stats.newestEntry = dateRange.newest;
        
        // Get storage usage
        const storageInfo = await this.checkStorageQuota();
        stats.storageUsage = storageInfo;
        
        return stats;
    }
    
    // Count records in a store
    async countRecords(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    // Get date range of logs
    async getDateRange() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['conversations'], 'readonly');
            const store = transaction.objectStore('conversations');
            const index = store.index('timestamp');
            
            let oldest = null;
            let newest = null;
            
            // Get oldest
            const oldestRequest = index.openCursor(null, 'next');
            oldestRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    oldest = cursor.value.timestamp;
                }
                
                // Get newest
                const newestRequest = index.openCursor(null, 'prev');
                newestRequest.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        newest = cursor.value.timestamp;
                    }
                    resolve({ oldest, newest });
                };
            };
            
            oldestRequest.onerror = () => {
                reject(oldestRequest.error);
            };
        });
    }
    
    // Clear all data
    async clearAllData() {
        if (!this.db) {
            return;
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(
                ['conversations', 'events', 'analytics'],
                'readwrite'
            );
            
            transaction.objectStore('conversations').clear();
            transaction.objectStore('events').clear();
            transaction.objectStore('analytics').clear();
            
            transaction.oncomplete = () => {
                console.log('All log data cleared');
                resolve();
            };
            
            transaction.onerror = () => {
                reject(transaction.error);
            };
        });
    }
    
    // Cleanup
    async cleanup() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        console.log('StorageManager cleanup completed');
    }
}
