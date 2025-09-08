// Storage Manager - Handles local file operations for chat logs
// Path: js/logging/storage-manager.js

export class StorageManager {
    constructor() {
        // IndexedDB for structured storage
        this.dbName = 'AIAssistantLogs';
        this.dbVersion = 1;
        this.db = null;
        this.dbPromise = null;
        this.isInitializing = false;
        
        // Storage quotas
        this.maxStorageSize = 100 * 1024 * 1024; // 100MB
        this.storageWarningThreshold = 0.8; // Warn at 80% usage
        
        // Connection management
        this.lastActivity = Date.now();
        this.connectionTimeout = 30000; // 30 seconds timeout
        this.keepAliveInterval = null;
        
        // Initialize database
        this.initDatabase();
        this.startKeepAlive();
    }
    
    // Initialize IndexedDB with better error handling and connection management
    async initDatabase() {
        if (this.isInitializing) {
            return this.dbPromise;
        }
        
        this.isInitializing = true;
        this.dbPromise = new Promise((resolve, reject) => {
            // Close existing connection if any
            if (this.db) {
                this.db.close();
                this.db = null;
            }
            
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                this.isInitializing = false;
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                this.lastActivity = Date.now();
                
                // Handle unexpected close
                this.db.onclose = () => {
                    console.warn('IndexedDB connection closed unexpectedly');
                    this.db = null;
                };
                
                // Handle version change (another tab upgraded the DB)
                this.db.onversionchange = () => {
                    console.warn('IndexedDB version changed by another tab');
                    this.db.close();
                    this.db = null;
                };
                
                // Handle errors
                this.db.onerror = (event) => {
                    console.error('IndexedDB error:', event);
                };
                
                console.log('IndexedDB initialized successfully');
                this.isInitializing = false;
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
            
            request.onblocked = () => {
                console.warn('IndexedDB upgrade blocked by another tab');
            };
        });
        
        try {
            await this.dbPromise;
            return this.db;
        } catch (error) {
            this.isInitializing = false;
            throw error;
        }
    }
    
    // Ensure database connection is active
    async ensureConnection() {
        // Check if database exists and is not closed
        if (!this.db || this.db.objectStoreNames === undefined) {
            console.log('Database connection lost, reinitializing...');
            await this.initDatabase();
        }
        
        this.lastActivity = Date.now();
        return this.db;
    }
    
    // Start keep-alive mechanism
    startKeepAlive() {
        // Check connection every 10 seconds
        this.keepAliveInterval = setInterval(async () => {
            const timeSinceLastActivity = Date.now() - this.lastActivity;
            
            // If inactive for more than connection timeout, close to free resources
            if (timeSinceLastActivity > this.connectionTimeout && this.db) {
                console.log('Closing inactive database connection');
                this.db.close();
                this.db = null;
            }
        }, 10000);
    }
    
    // Save logs to IndexedDB with retry mechanism
    async saveLogs(logs, sessionId) {
        let retryCount = 0;
        const maxRetries = 3;
        
        console.log(`Attempting to save ${logs.length} logs to IndexedDB for session ${sessionId}`);
        
        while (retryCount < maxRetries) {
            try {
                const db = await this.ensureConnection();
                
                return await new Promise((resolve, reject) => {
                    const transaction = db.transaction(['conversations'], 'readwrite');
                    const store = transaction.objectStore('conversations');
                    
                    let savedCount = 0;
                    let hasError = false;
                    
                    // Handle transaction errors
                    transaction.onerror = () => {
                        console.error('Transaction error:', transaction.error);
                        if (!hasError) {
                            hasError = true;
                            reject(transaction.error);
                        }
                    };
                    
                    transaction.onabort = () => {
                        console.error('Transaction aborted');
                        if (!hasError) {
                            hasError = true;
                            reject(new Error('Transaction aborted'));
                        }
                    };
                    
                    transaction.oncomplete = () => {
                        if (!hasError) {
                            console.log(`✓ Successfully saved ${savedCount} logs to IndexedDB`);
                            this.checkStorageQuota();
                            resolve(true);
                        }
                    };
                    
                    // Add all logs
                    logs.forEach((log, index) => {
                        const request = store.add(log);
                        
                        request.onsuccess = () => {
                            savedCount++;
                            console.log(`Log ${index + 1}/${logs.length} saved with ID: ${request.result}`);
                        };
                        
                        request.onerror = () => {
                            console.error(`Failed to save log ${index + 1}:`, request.error);
                            if (!hasError) {
                                hasError = true;
                                reject(request.error);
                            }
                        };
                    });
                });
                
            } catch (error) {
                retryCount++;
                console.error(`Save attempt ${retryCount} failed:`, error);
                
                if (retryCount >= maxRetries) {
                    console.error('All save attempts failed, giving up');
                    throw error;
                }
                
                // Reset connection for retry
                if (this.db) {
                    this.db.close();
                    this.db = null;
                }
                
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
            }
        }
    }
    
    // Save event to IndexedDB with retry mechanism
    async saveEvent(event) {
        try {
            const db = await this.ensureConnection();
            
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['events'], 'readwrite');
                const store = transaction.objectStore('events');
                
                const request = store.add(event);
                
                request.onsuccess = () => {
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    reject(request.error);
                };
                
                transaction.onerror = () => {
                    reject(transaction.error);
                };
            });
        } catch (error) {
            console.error('Failed to save event:', error);
            // Don't throw here to prevent breaking the application
            return null;
        }
    }
    
    // Get logs with filtering options
    async getLogs(options = {}) {
        try {
            const db = await this.ensureConnection();
            
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['conversations'], 'readonly');
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
                
                transaction.onerror = () => {
                    reject(transaction.error);
                };
            });
        } catch (error) {
            console.error('Failed to get logs:', error);
            return [];
        }
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
        try {
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
        } catch (error) {
            console.error('Failed to check storage quota:', error);
            return null;
        }
    }
    
    // Perform storage cleanup
    async performStorageCleanup() {
        try {
            // Remove logs older than 30 days by default
            const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            
            const db = await this.ensureConnection();
            
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['conversations'], 'readwrite');
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
                
                transaction.onerror = () => {
                    reject(transaction.error);
                };
            });
        } catch (error) {
            console.error('Failed to perform storage cleanup:', error);
            return 0;
        }
    }
    
    // Clear logs before a specific date
    async clearLogsBeforeDate(timestamp) {
        try {
            const db = await this.ensureConnection();
            const cutoffDate = new Date(timestamp).toISOString();
            
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['conversations'], 'readwrite');
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
        } catch (error) {
            console.error('Failed to clear old logs:', error);
            return 0;
        }
    }
    
    // Get storage statistics
    async getStats() {
        try {
            const db = await this.ensureConnection();
            
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
        } catch (error) {
            console.error('Failed to get storage stats:', error);
            return {
                conversations: 0,
                events: 0,
                analytics: 0,
                oldestEntry: null,
                newestEntry: null,
                storageUsage: null,
                error: error.message
            };
        }
    }
    
    // Count records in a store
    async countRecords(storeName) {
        try {
            const db = await this.ensureConnection();
            
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.count();
                
                request.onsuccess = () => {
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error(`Failed to count records in ${storeName}:`, error);
            return 0;
        }
    }
    
    // Get date range of logs
    async getDateRange() {
        try {
            const db = await this.ensureConnection();
            
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['conversations'], 'readonly');
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
        } catch (error) {
            console.error('Failed to get date range:', error);
            return { oldest: null, newest: null };
        }
    }
    
    // Clear all data
    async clearAllData() {
        try {
            const db = await this.ensureConnection();
            
            console.log('Clearing all IndexedDB data...');
            
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(
                    ['conversations', 'events', 'analytics'],
                    'readwrite'
                );
                
                let clearedStores = 0;
                const totalStores = 3;
                
                const checkComplete = () => {
                    clearedStores++;
                    console.log(`Cleared store ${clearedStores}/${totalStores}`);
                    if (clearedStores === totalStores) {
                        console.log('✓ All IndexedDB stores cleared');
                        
                        // Force a storage quota check to update usage stats
                        setTimeout(() => {
                            this.checkStorageQuota().then(() => {
                                console.log('✓ Storage quota refreshed after clear');
                            });
                        }, 1000);
                        
                        resolve();
                    }
                };
                
                // Clear each store
                const conversationsClear = transaction.objectStore('conversations').clear();
                conversationsClear.onsuccess = checkComplete;
                conversationsClear.onerror = () => {
                    console.error('Failed to clear conversations store');
                    reject(conversationsClear.error);
                };
                
                const eventsClear = transaction.objectStore('events').clear();
                eventsClear.onsuccess = checkComplete;
                eventsClear.onerror = () => {
                    console.error('Failed to clear events store');
                    reject(eventsClear.error);
                };
                
                const analyticsClear = transaction.objectStore('analytics').clear();
                analyticsClear.onsuccess = checkComplete;
                analyticsClear.onerror = () => {
                    console.error('Failed to clear analytics store');
                    reject(analyticsClear.error);
                };
                
                transaction.onerror = () => {
                    console.error('Transaction error during clearAllData:', transaction.error);
                    reject(transaction.error);
                };
                
                transaction.onabort = () => {
                    console.error('Transaction aborted during clearAllData');
                    reject(new Error('Clear operation was aborted'));
                };
            });
        } catch (error) {
            console.error('Failed to clear all data:', error);
            throw error;
        }
    }
    
    // Cleanup
    async cleanup() {
        console.log('Starting StorageManager cleanup...');
        
        // Clear keep-alive interval
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        
        // Close database connection
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        
        console.log('StorageManager cleanup completed');
    }
}
