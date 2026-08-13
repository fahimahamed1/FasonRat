import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb, dbHelpers } from '../db/index.js';
import { user as userTable, settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../auth/index.js';
import { ALL_PERMISSIONS } from '../types/index.js';
import { log } from '../utils/logger.js';
import crypto from 'crypto';

const SETUP_COMPLETE_KEY = 'setup.complete';
const DEVICE_SECRET_MIN_LEN = 8;
const DEVICE_SECRET_MAX_LEN = 256;

export function isSetupComplete(): boolean {
  try {
    const d = getDb();
    const row = d.select({ value: settings.value }).from(settings).where(eq(settings.key, SETUP_COMPLETE_KEY)).get();
    return row?.value === '1';
  } catch {
    return false;
  }
}

export function checkSetupSteps() {
  const d = getDb();
  const adminRow = d.select({ id: userTable.id, deviceSecret: userTable.deviceSecret }).from(userTable).where(eq(userTable.role, 'admin')).get();
  const hasAdmin = !!adminRow;
  const hasDeviceSecret = !!(adminRow?.deviceSecret && adminRow.deviceSecret.length >= 8);
  return {
    admin: hasAdmin,
    deviceSecret: hasDeviceSecret,
  };
}

function generateDeviceSecret(): string {
  return crypto.randomBytes(24).toString('base64url');
}

function persistSetting(key: string, value: string): void {
  const d = getDb();
  d.insert(settings).values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date().toISOString() } })
    .run();
}

export async function setupGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const url = request.url.split('?')[0];
  if (url.startsWith('/api/setup') || url === '/api/health' || url.startsWith('/api/auth/better')) {
    return;
  }
  if (url.startsWith('/api/') && !isSetupComplete()) {
    reply.code(503).send({
      success: false,
      error: 'Setup required',
      code: 'SETUP_REQUIRED',
    });
  }
}

let setupInProgress = false;

export async function setupRoutes(app: FastifyInstance) {
  app.get('/api/setup/status', async () => {
    const steps = checkSetupSteps();
    const complete = isSetupComplete() || Object.values(steps).every(Boolean);
    return { success: true, data: { complete, steps } };
  });

  app.post('/api/setup/complete', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 hour' },
    },
  }, async (request, reply) => {
    if (setupInProgress) {
      return reply.code(409).send({ success: false, error: 'Setup is already in progress' });
    }
    if (isSetupComplete()) {
      return reply.code(403).send({ success: false, error: 'Setup has already been completed' });
    }
    setupInProgress = true;
    try {
    const body = (request.body || {}) as {
      admin?: { username?: string; email?: string; password?: string };
      deviceSecret?: string;
      generateDeviceSecret?: boolean;
    };
    if (!body.admin || !body.admin.username || !body.admin.email || !body.admin.password) {
      return reply.code(400).send({ success: false, error: 'Admin credentials are required' });
    }
    const { username, email, password } = body.admin;
    const { validateUsername, validatePasswordStrength, validateEmail } = await import('../utils/helpers.js');
    const usernameCheck = validateUsername(username);
    if (!usernameCheck.valid) return reply.code(400).send({ success: false, error: usernameCheck.message });
    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) return reply.code(400).send({ success: false, error: emailCheck.message });
    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) return reply.code(400).send({ success: false, error: passwordCheck.message });
    let finalDeviceSecret = '';
    if (body.generateDeviceSecret) {
      finalDeviceSecret = generateDeviceSecret();
    } else if (typeof body.deviceSecret === 'string' && body.deviceSecret.length > 0) {
      if (body.deviceSecret.length < DEVICE_SECRET_MIN_LEN) {
        return reply.code(400).send({ success: false, error: `Device secret must be at least ${DEVICE_SECRET_MIN_LEN} characters` });
      }
      if (body.deviceSecret.length > DEVICE_SECRET_MAX_LEN) {
        return reply.code(400).send({ success: false, error: `Device secret must be at most ${DEVICE_SECRET_MAX_LEN} characters` });
      }
      if (/[\r\n=]/.test(body.deviceSecret)) {
        return reply.code(400).send({ success: false, error: 'Device secret must not contain newlines or "=" characters' });
      }
      finalDeviceSecret = body.deviceSecret;
    } else {
      return reply.code(400).send({ success: false, error: 'Device secret is required - choose auto-generate or enter one manually' });
    }
    const d = getDb();
    const existingUser = d.select({ id: userTable.id }).from(userTable)
      .where(eq(userTable.email, email.toLowerCase())).get();
    if (existingUser) {
      return reply.code(409).send({ success: false, error: 'A user with this email already exists' });
    }
    const existingUsername = d.select({ id: userTable.id }).from(userTable)
      .where(eq(userTable.username, username.toLowerCase())).get();
    if (existingUsername) {
      return reply.code(409).send({ success: false, error: 'This username is already taken' });
    }
    try {
      const auth = getAuth();
      const signUpRes: any = await auth.api.signUpEmail({
        body: {
          email: email.toLowerCase(),
          password,
          name: username.toLowerCase(),
          username: username.toLowerCase(),
        },
      } as any);
      const userId = signUpRes?.user?.id;
      if (!userId) {
        throw new Error('Failed to create admin account');
      }
      d.update(userTable).set({
        role: 'admin',
        isDefault: 1,
        permissions: JSON.stringify(ALL_PERMISSIONS),
        deviceSecret: finalDeviceSecret,
        updatedAt: new Date(),
      }).where(eq(userTable.id, userId)).run();
      dbHelpers.invalidateDeviceSecretsCache();
    } catch (err) {
      log.error(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
      return reply.code(500).send({ success: false, error: 'Failed to create admin account' });
    }
    persistSetting(SETUP_COMPLETE_KEY, '1');
    persistSetting('seed.defaultAdmin.done', '1');
    dbHelpers.addLog('SYSTEM', 'SETUP', 'Initial setup completed via setup wizard');
    return {
      success: true,
      data: {
        adminCreated: true,
        deviceSecretConfigured: !!finalDeviceSecret,
        deviceSecret: body.generateDeviceSecret ? finalDeviceSecret : undefined,
      },
    };
    } finally {
      setupInProgress = false;
    }
  });
}
