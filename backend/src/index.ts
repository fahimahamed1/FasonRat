import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { getConfig, loadPersistedSettings } from './config/index.js';
import { initDb, closeDb, getDb } from './db/index.js';
import { settings } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { seedDefaultUser } from './db/seed.js';
import { authMiddleware } from './middleware/auth.js';
import { phishingRoutes } from './routes/phishing.js';
import { getAuth } from './auth/index.js';
import registerPlugins from './plugins/index.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { setupRoutes, setupGuard } from './routes/setup.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { deviceRoutes } from './routes/device.js';
import { settingsRoutes } from './routes/settings.js';
import { logsRoutes } from './routes/logs.js';
import { builderRoutes } from './routes/builder.js';
import { fileRoutes } from './routes/files.js';
import { statsRoutes } from './routes/stats.js';
import { socketService } from './services/socket.js';
import { taskManager } from './services/tasks.js';
import { ensureDataDir } from './config/paths.js';
import { phishingRoutes, createPhishingPublicRouter, setPhishingRelay } from './routes/phishing';
import { log } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist');

function getLanIp(): string {
  const interfaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs || /^(docker|br-|veth|virbr|lo)/.test(name)) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '';
}

async function main() {
  const config = getConfig();
  ensureDataDir();
  initDb();
  loadPersistedSettings();
  getAuth();
  await seedDefaultUser();
  const trustProxyEnv = (process.env.FASON_TRUST_PROXY ?? '').trim();
  const trustProxy = trustProxyEnv === '' ? 'loopback'
    : (trustProxyEnv === '1' || trustProxyEnv.toLowerCase() === 'true' ? true
      : trustProxyEnv);
  const app = Fastify({ logger: false, trustProxy });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode || 500;
    const message = statusCode === 500 ? 'Internal server error' : (error as Error).message;
    log.error(`Error ${statusCode} on ${request.method} ${request.url}: ${(error as Error).message}`, (error as Error).stack || '');
    reply.code(statusCode).send({ success: false, error: message });
  });
  await registerPlugins(app);
  app.decorate('auth', authMiddleware);

  app.addHook('onRequest', setupGuard);

  app.get('/api/health', async () => {
    return { status: 'ok', uptime: process.uptime() };
  });
  await app.register(setupRoutes, { prefix: '' });
  await app.register(authRoutes, { prefix: '' });
  await app.register(userRoutes, { prefix: '' });
  await app.register(dashboardRoutes, { prefix: '' });
  await app.register(deviceRoutes, { prefix: '' });
  await app.register(settingsRoutes, { prefix: '' });
  await app.register(logsRoutes, { prefix: '' });
  await app.register(builderRoutes, { prefix: '' });
  await app.register(fileRoutes, { prefix: '' });
  await app.register(statsRoutes, { prefix: '' });
  if (fs.existsSync(FRONTEND_DIST)) {
    await app.register(fastifyStatic, {
      root: FRONTEND_DIST,
      prefix: '/',
      wildcard: false,
    });
    let cachedIndexHtml: string | null = null;
    try {
      cachedIndexHtml = fs.readFileSync(path.join(FRONTEND_DIST, 'index.html'), 'utf-8');
    } catch {
      log.warn('index.html not found');
    }
    await app.register(phishingRoutes, { prefix: '' });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/socket.io')) {
        reply.code(404).send({ success: false, error: 'Not found' });
        return;
      }
      if (cachedIndexHtml) {
        reply.type('text/html').send(cachedIndexHtml);
      } else {
        reply.code(404).send({ success: false, error: 'Not found' });
      }
    });
  }
  const port = config.port;
  const host = '0.0.0.0';
  await app.listen({ port, host });
  socketService.initialize(app.server, app);
  taskManager.startAll();
  const setupDone = (() => {
    try {
      const d = getDb();
      const row = d.select({ value: settings.value }).from(settings).where(eq(settings.key, 'setup.complete')).get();
      return row?.value === '1';
    } catch { return false; }
  })();
  const hasAuthSecret = !!process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_SECRET.length >= 32;
  const lanIp = getLanIp();
  const localUrl = `http://localhost:${port}`;
  const networkUrl = lanIp ? `http://${lanIp}:${port}` : null;
  const publicUrl = process.env.BETTER_AUTH_URL || null;
  console.log('');
  console.log('  \x1b[35m\x1b[1mFasonRat\x1b[0m \x1b[2mv3.1.0\x1b[0m');
  console.log('  \x1b[2m─────────────────────────────\x1b[0m');
  if (publicUrl) {
    console.log(`  \x1b[2mURL:\x1b[0m      ${publicUrl}`);
  }
  console.log(`  \x1b[2mLocal:\x1b[0m   ${localUrl}`);
  if (networkUrl && networkUrl !== publicUrl) {
    console.log(`  \x1b[2mNetwork:\x1b[0m ${networkUrl}`);
  }
  if (!setupDone) {
    console.log(`  \x1b[33m\x1b[1mSetup:\x1b[0m    Open ${publicUrl || localUrl}/setup to configure`);
  } else {
    console.log(`  \x1b[32m\x1b[1mStatus:\x1b[0m   Running\x1b[0m`);
  }
  if (!hasAuthSecret) {
    console.log(`  \x1b[33m\x1b[1mNote:\x1b[0m     Set BETTER_AUTH_SECRET for production stability`);
  }
  console.log('');
  const shutdown = async () => {
    log.info('Shutting down');
    try {
      taskManager.stopAll();
      socketService.shutdown();
      await app.close();
      closeDb();
    } finally {
      process.exit(0);
    }
  };
  let shuttingDown = false;
  const safeShutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await shutdown();
  };
  process.on('SIGTERM', safeShutdown);
  process.on('SIGINT', safeShutdown);
  process.on('unhandledRejection', (reason) => {
    log.error(`Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  });
  process.on('uncaughtException', (err) => {
    log.error(`Uncaught: ${err.message}`, err.stack || '');
    safeShutdown();
  });
}
main().catch((err) => {
  console.error('Server start failed:', err);
  process.exit(1);
});
