const path = require('path');

module.exports = {
    // Server config
    port: process.env.PORT || 22533,
    debug: process.env.NODE_ENV !== 'production',
    
    // Paths
    dbPath: path.join(__dirname, '../database'),
    downloadsPath: path.join(__dirname, '../database/client_downloads'),
    photosPath: path.join(__dirname, '../database/client_photos'),
    
    // Message keys (matching Android app)
    msg: {
        camera: '0xCA',
        files: '0xFI',
        calls: '0xCL',
        sms: '0xSM',
        mic: '0xMI',
        location: '0xLO',
        contacts: '0xCO',
        wifi: '0xWI',
        notification: '0xNO',
        clipboard: '0xCB',
        apps: '0xIN',
        permissions: '0xPM',
        checkPerm: '0xGP'
    },
    
    // Feature limits
    limits: {
        maxClients: 500,
        maxDownloads: 100,
        maxPhotos: 100,
        maxGpsHistory: 100,
        maxSmsHistory: 250,
        maxCallsHistory: 250,
        maxNotifications: 200,
        maxClipboardHistory: 200,
        maxFileSize: 50 * 1024 * 1024 // 50MB
    },
    
    // Socket config
    socket: {
        pingInterval: 25000,
        pingTimeout: 60000,
        maxHttpBufferSize: 50e6, // 50MB
        transports: ['websocket', 'polling'],
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    },
    
    // Rate limiting
    rateLimit: {
        windowMs: 60000, // 1 minute
        maxRequests: 100
    },
    
    // Build config
    build: {
        timeout: 300000, // 5 minutes
        defaultUrl: 'http://127.0.0.1:22533',
        defaultHome: 'https://google.com'
    },
    
    // Security
    security: {
        sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
        loginAttempts: 5,
        loginLockout: 15 * 60 * 1000 // 15 minutes
    }
};
