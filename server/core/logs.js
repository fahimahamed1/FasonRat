const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const config = require('./config');

// Log database
const logFile = path.join(config.dbPath, 'logs.json');
const logDb = low(new FileSync(logFile));
logDb.defaults({ logs: [], stats: { total: 0, cleared: 0 } }).write();

// Log types with colors
const TYPES = {
    INFO: { color: '#3b82f6', icon: 'ℹ' },
    SUCCESS: { color: '#22c55e', icon: '✓' },
    ERROR: { color: '#ef4444', icon: '✕' },
    WARNING: { color: '#f59e0b', icon: '⚠' },
    CONNECTION: { color: '#8b5cf6', icon: '🔗' },
    DISCONNECTION: { color: '#f97316', icon: '⏏' },
    COMMAND: { color: '#06b6d4', icon: '→' },
    DATA: { color: '#10b981', icon: '↓' },
    BUILD: { color: '#a855f7', icon: '⚙' },
    AUTH: { color: '#ec4899', icon: '🔐' },
    FILE: { color: '#6366f1', icon: '📁' },
    HTTP: { color: '#64748b', icon: '🌐' }
};

// Categories for filtering
const CATEGORIES = {
    SYSTEM: 'system',
    CLIENT: 'client',
    BUILD: 'build',
    AUTH: 'auth',
    DATA: 'data',
    FILE: 'file',
    ERROR: 'error',
    HTTP: 'http'
};

// Max logs to keep
const MAX_LOGS = 10000;

// Add log entry
function log(type, message, category = 'system', details = null) {
    try {
        const logType = (typeof type === 'string' ? type : type?.name || 'INFO').toUpperCase();
        
        const entry = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            time: new Date().toISOString(),
            timestamp: Date.now(),
            type: logType,
            category,
            message,
            details: details ? (typeof details === 'object' ? details : { value: details }) : null
        };
        
        // Add to database
        logDb.get('logs').push(entry).write();
        
        // Update stats
        logDb.update('stats.total', n => (n || 0) + 1).write();
        
        // Trim old logs if needed
        const count = logDb.get('logs').size().value();
        if (count > MAX_LOGS) {
            const toRemove = count - MAX_LOGS;
            logDb.get('logs').drop(toRemove).write();
        }
        
        // Console output with icon
        const typeInfo = TYPES[logType] || TYPES.INFO;
        const time = new Date().toLocaleTimeString();
        console.log(`[${time}] ${typeInfo.icon} [${logType}] [${category}] ${message}`);
        
        return entry;
    } catch (e) {
        console.error('Logger error:', e);
        return null;
    }
}

// Convenience methods
const logger = {
    info: (msg, category = 'system', details = null) => log('INFO', msg, category, details),
    success: (msg, category = 'system', details = null) => log('SUCCESS', msg, category, details),
    error: (msg, category = 'error', details = null) => log('ERROR', msg, category, details),
    warning: (msg, category = 'system', details = null) => log('WARNING', msg, category, details),
    systemError: (context, error) => log('ERROR', `${context}: ${error?.message || error}`, 'error', { 
        context, 
        error: error?.message || String(error),
        stack: error?.stack
    }),
    
    // Client events
    clientConnected: (id, ip, device) => log('CONNECTION', `Client ${id} connected`, 'client', { id, ip, device }),
    clientDisconnected: (id, reason = '') => log('DISCONNECTION', `Client ${id} disconnected`, 'client', { id, reason }),
    
    // Commands
    commandSent: (id, cmd, params = {}) => log('COMMAND', `→ ${id}: ${cmd}`, 'client', { id, cmd, params }),
    commandQueued: (id, cmd) => log('COMMAND', `⏳ ${id}: ${cmd} (queued)`, 'client', { id, cmd }),
    commandFailed: (id, cmd, error) => log('ERROR', `✕ ${id}: ${cmd} failed`, 'client', { id, cmd, error }),
    
    // Data received
    dataReceived: (id, type, count = null) => {
        const countStr = count !== null ? ` (${count})` : '';
        log('DATA', `↓ ${id}: ${type}${countStr}`, 'data', { id, type, count });
    },
    
    // Files
    fileSaved: (id, name, type) => log('FILE', `📁 Saved ${type} "${name}" from ${id}`, 'file', { id, name, type }),
    fileSaveFailed: (id, name, error) => log('ERROR', `📁 Failed "${name}" from ${id}`, 'file', { id, name, error }),
    
    // Auth
    loginSuccess: (ip) => log('AUTH', `✓ Login from ${ip}`, 'auth', { ip, success: true }),
    loginFailed: (ip) => log('WARNING', `✕ Failed login from ${ip}`, 'auth', { ip, success: false }),
    logout: (ip) => log('AUTH', `Logout from ${ip}`, 'auth', { ip }),
    
    // Build
    buildStart: (serverUrl) => log('BUILD', 'Starting build...', 'build', { serverUrl }),
    buildStep: (step, msg) => log('BUILD', `[${step}] ${msg}`, 'build', { step }),
    buildSuccess: (serverUrl) => log('SUCCESS', 'Build complete', 'build', { serverUrl }),
    buildFailed: (error) => log('ERROR', `Build failed: ${error}`, 'build', { error }),
    
    // HTTP
    httpRequest: (method, path, status, duration) => {
        const level = status >= 400 ? 'ERROR' : 'INFO';
        log(level, `${method} ${path} - ${status} (${duration}ms)`, 'http', { method, path, status, duration });
    }
};

// Get logs with filtering
function getLogs(options = {}) {
    try {
        const { limit = 100, type = null, category = null, search = null, since = null } = options;
        
        let query = logDb.get('logs');
        
        // Filter by type
        if (type && type !== 'all') {
            query = query.filter(l => l.type === type.toUpperCase());
        }
        
        // Filter by category
        if (category && category !== 'all') {
            query = query.filter(l => l.category === category);
        }
        
        // Filter by search term
        if (search) {
            const searchLower = search.toLowerCase();
            query = query.filter(l => 
                l.message.toLowerCase().includes(searchLower) ||
                (l.details && JSON.stringify(l.details).toLowerCase().includes(searchLower))
            );
        }
        
        // Filter by time
        if (since) {
            const sinceTime = new Date(since).getTime();
            query = query.filter(l => l.timestamp >= sinceTime);
        }
        
        return query
            .sortBy('timestamp')
            .reverse()
            .take(Math.min(limit, 1000))
            .value();
    } catch (e) {
        console.error('Get logs error:', e);
        return [];
    }
}

// Clear all logs
function clearLogs() {
    try {
        const count = logDb.get('logs').size().value();
        logDb.set('logs', []).write();
        logDb.update('stats.cleared', n => (n || 0) + count).write();
        log('INFO', `Logs cleared (${count} entries)`, 'system');
        return count;
    } catch (e) {
        console.error('Clear logs error:', e);
        return 0;
    }
}

// Get log statistics
function getStats() {
    try {
        const logs = logDb.get('logs').value();
        const now = Date.now();
        const today = new Date().setHours(0, 0, 0, 0);
        const hourAgo = now - 3600000;
        const dayAgo = now - 86400000;
        const weekAgo = now - 604800000;
        
        return {
            total: logs.length,
            today: logs.filter(l => l.timestamp >= today).length,
            lastHour: logs.filter(l => l.timestamp >= hourAgo).length,
            lastDay: logs.filter(l => l.timestamp >= dayAgo).length,
            lastWeek: logs.filter(l => l.timestamp >= weekAgo).length,
            errors: logs.filter(l => l.type === 'ERROR').length,
            warnings: logs.filter(l => l.type === 'WARNING').length,
            connections: logs.filter(l => l.type === 'CONNECTION').length,
            disconnections: logs.filter(l => l.type === 'DISCONNECTION').length,
            byType: logs.reduce((acc, l) => {
                acc[l.type] = (acc[l.type] || 0) + 1;
                return acc;
            }, {}),
            byCategory: logs.reduce((acc, l) => {
                acc[l.category] = (acc[l.category] || 0) + 1;
                return acc;
            }, {}),
            oldestLog: logs.length > 0 ? logs[0]?.time : null,
            newestLog: logs.length > 0 ? logs[logs.length - 1]?.time : null
        };
    } catch (e) {
        console.error('Get stats error:', e);
        return {
            total: 0,
            today: 0,
            lastHour: 0,
            errors: 0,
            warnings: 0
        };
    }
}

// Export for use in other modules
module.exports = { 
    log, 
    logger, 
    getLogs, 
    clearLogs, 
    getStats,
    TYPES,
    CATEGORIES 
};
