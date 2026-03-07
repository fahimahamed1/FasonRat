const { logger } = require('./logs');
const db = require('./db');
const config = require('./config');
const clients = require('./clients');

// Background task manager
class TaskManager {
    constructor() {
        this.tasks = {};
        this.intervals = {};
        this.running = false;
        logger.info('Task manager initialized');
    }

    // Register a periodic task
    register(name, intervalMs, taskFn, options = {}) {
        if (this.tasks[name]) {
            logger.warning(`Task ${name} already registered`, 'system');
            return;
        }

        this.tasks[name] = { 
            interval: intervalMs, 
            fn: taskFn, 
            running: false,
            lastRun: null,
            errorCount: 0,
            ...options
        };
        
        logger.info(`Task registered: ${name} (${intervalMs}ms)`, 'system');
    }

    // Start all registered tasks
    startAll() {
        Object.keys(this.tasks).forEach(name => this.start(name));
        this.running = true;
        logger.info('All background tasks started', 'system');
    }

    // Start specific task
    start(name) {
        const task = this.tasks[name];
        if (!task || this.intervals[name]) return;

        // Run immediately
        this.runTask(name);

        // Schedule periodic runs
        this.intervals[name] = setInterval(() => this.runTask(name), task.interval);
        logger.info(`Task started: ${name}`, 'system');
    }

    // Stop specific task
    stop(name) {
        if (this.intervals[name]) {
            clearInterval(this.intervals[name]);
            delete this.intervals[name];
            logger.info(`Task stopped: ${name}`, 'system');
        }
    }

    // Run task with error handling
    async runTask(name) {
        const task = this.tasks[name];
        if (!task || task.running) return;

        task.running = true;
        task.lastRun = new Date().toISOString();
        
        try {
            await task.fn();
            task.errorCount = 0;
        } catch (e) {
            task.errorCount++;
            logger.systemError(`Task ${name} failed`, e);
            
            // Stop task if too many errors
            if (task.errorCount >= 5 && task.stopOnError !== false) {
                logger.warning(`Task ${name} stopped due to repeated errors`, 'system');
                this.stop(name);
            }
        }
        
        task.running = false;
    }

    // Stop all tasks
    stopAll() {
        Object.keys(this.intervals).forEach(name => this.stop(name));
        this.running = false;
        logger.info('All background tasks stopped', 'system');
    }

    // Get task status
    getStatus() {
        return Object.keys(this.tasks).map(name => ({
            name,
            running: this.tasks[name].running,
            interval: this.tasks[name].interval,
            lastRun: this.tasks[name].lastRun,
            errorCount: this.tasks[name].errorCount
        }));
    }
}

// Create singleton instance
const taskManager = new TaskManager();

// Utility for formatting bytes (defined before use)
const utils = {
    formatBytes(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};

// Register cleanup task - removes stale client data
taskManager.register('cleanup', 3600000, async () => {
    logger.info('Running cleanup task...', 'system');
    
    // Clean up old client data
    clients.cleanup(30 * 24 * 60 * 60 * 1000); // 30 days
    
    // Clean up old backups
    db.cleanupBackups();
    
    logger.info('Cleanup task completed', 'system');
});

// Register heartbeat check - verifies client connections
taskManager.register('heartbeat', 30000, async () => {
    if (!global.io) return;
    
    try {
        const sockets = await global.io.fetchSockets();
        const connectedIds = new Set(
            sockets
                .map(s => s.handshake?.query?.id)
                .filter(Boolean)
        );

        // Update client online status
        const allClients = db.getClientIds();
        let updated = 0;
        
        allClients.forEach(id => {
            const client = clients.get(id);
            const isOnline = connectedIds.has(id);
            
            if (client && client.online !== isOnline) {
                if (isOnline) {
                    // Client reconnected
                    clients.connect(null, id, { online: true });
                } else {
                    clients.disconnect(id);
                }
                updated++;
            }
        });
        
        if (updated > 0) {
            logger.info(`Heartbeat: updated ${updated} clients`, 'system');
        }
    } catch (e) {
        logger.systemError('Heartbeat check failed', e);
    }
}, { stopOnError: false });

// Register log rotation - keeps logs manageable
taskManager.register('logRotate', 86400000, async () => {
    logger.info('Running log rotation...', 'system');
    
    // Get log stats
    const stats = require('./logs').getStats();
    
    // If too many logs, trim old ones
    if (stats.total > 50000) {
        const { logger: log } = require('./logs');
        // This would need a trim function in logs.js
        logger.info('Log rotation check: ' + stats.total + ' logs', 'system');
    }
});

// Register database maintenance
taskManager.register('dbMaintenance', 3600000, async () => {
    logger.info('Running database maintenance...', 'system');
    
    // Trim client data
    db.getClientIds().forEach(id => {
        db.trimClientData(id);
    });
    
    // Get stats
    const stats = db.getStats();
    logger.info(`DB maintenance: ${stats.clientCount} clients, ${utils.formatBytes(stats.totalSize)}`, 'system');
});

module.exports = taskManager;
