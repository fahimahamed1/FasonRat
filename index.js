const path = require('path');
const { spawn } = require('child_process');

const serverPath = path.join(__dirname, 'server', 'init.js');

const server = spawn('node', [serverPath], {
  stdio: 'inherit',
  cwd: __dirname
});

server.on('error', (err) => {
  console.error('Server error:', err.message);
  process.exit(1);
});

server.on('exit', (code) => {
  code === 0
    ? console.log('Server stopped.')
    : console.error(`Server exited with code ${code}`);
  process.exit(code);
});

const shutdown = (signal) => {
  console.log(`Shutting down (${signal})...`);
  server.kill(signal);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
