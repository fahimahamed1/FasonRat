const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');

const config = require('./core/config');
const routes = require('./core/routes');
const initSocket = require('./core/socket');
const { logger } = require('./core/logs');
const taskManager = require('./core/tasks');

// Startup message
console.log(`
╔═════════════════════════════════════════════════╗
║              Fason Control Panel                ║
║          Android Remote Administration          ║
╚═════════════════════════════════════════════════╝
`);

logger.info('Server starting...', 'system');

// Initialize directories
config.init();

// Create Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'web/views'));

// Static files
app.use(express.static(path.join(__dirname, 'web/public')));

// Routes
app.use(routes);

// Error handling middleware
app.use((err, req, res, next) => {
    logger.systemError('Unhandled error', err);
    res.status(500).render('error', { 
        error: config.debug ? err.message : 'Internal server error' 
    });
});

// Initialize Socket.IO
initSocket(server);

// Start background tasks
taskManager.startAll();

// Start server
server.listen(config.port, () => {
    console.log(`
╔═══════════════════════════════════════╗
║          Server Started               ║
╠═══════════════════════════════════════╣
║  Panel:  http://localhost:${config.port}        ║
║  Mode:   ${config.debug ? 'Development      ' : 'Production       '}          ║
╚═══════════════════════════════════════╝
`);
    logger.success(`Server listening on port ${config.port}`, 'system');
});

// Handle process events
process.on('uncaughtException', (err) => {
    logger.systemError('Uncaught exception', err);
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled rejection: ${reason}`, 'error', { reason });
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('Server shutting down (SIGTERM)', 'system');
    taskManager.stopAll();
    server.close(() => {
        logger.info('Server closed', 'system');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('Server shutting down (SIGINT)', 'system');
    taskManager.stopAll();
    server.close(() => {
        logger.info('Server closed', 'system');
        process.exit(0);
    });
});
