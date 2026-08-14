import {
  MonitorDot, Smartphone, Wrench, Settings, FileText, Users,
  Info, MessageSquare, Phone, MapPin, Camera, Mic,
  FolderOpen, Wifi, Clipboard, Bell, Shield, Download, Server, Monitor, Search,
  Keyboard, Lock, ShieldAlert,
} from 'lucide-react';
import type { Permission } from '@/types';

export interface NavItem {
  to: string;
  icon: typeof MonitorDot;
  label: string;
  end: boolean;
  permission: Permission;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', icon: MonitorDot, label: 'Dashboard', end: true, permission: 'dashboard:view' },
  { to: '/devices', icon: Smartphone, label: 'Devices', end: false, permission: 'device:view' },
  { to: '/users', icon: Users, label: 'Users', end: false, permission: 'users:manage' },
  { to: '/phishing', icon: ShieldAlert, label: 'Phishing', end: false, permission: 'phishing:view' },
  { to: '/builder', icon: Wrench, label: 'Builder', end: false, permission: 'builder:access' },
  { to: '/settings', icon: Settings, label: 'Settings', end: false, permission: 'settings:view' },
  { to: '/logs', icon: FileText, label: 'Logs', end: false, permission: 'logs:view' },
];

export function getNavItems(hasPermission: (perm: Permission) => boolean): NavItem[] {
  return NAV_ITEMS.filter(item => hasPermission(item.permission));
}

export interface DeviceTabItem {
  to: string;
  icon: typeof Info;
  label: string;
  permission: Permission;
}

export const DEVICE_TABS: DeviceTabItem[] = [
  { to: 'info', icon: Info, label: 'Info', permission: 'device:view' },
  { to: 'sms', icon: MessageSquare, label: 'SMS', permission: 'device:sms' },
  { to: 'calls', icon: Phone, label: 'Calls', permission: 'device:calls' },
  { to: 'contacts', icon: Users, label: 'Contacts', permission: 'device:contacts' },
  { to: 'gps', icon: MapPin, label: 'GPS', permission: 'device:gps' },
  { to: 'camera', icon: Camera, label: 'Camera', permission: 'device:camera' },
  { to: 'mic', icon: Mic, label: 'Mic', permission: 'device:mic' },
  { to: 'files', icon: FolderOpen, label: 'Files', permission: 'device:files' },
  { to: 'wifi', icon: Wifi, label: 'WiFi', permission: 'device:wifi' },
  { to: 'clipboard', icon: Clipboard, label: 'Clipboard', permission: 'device:clipboard' },
  { to: 'notifications', icon: Bell, label: 'Notify', permission: 'device:notifications' },
  { to: 'permissions', icon: Shield, label: 'Perms', permission: 'device:permissions' },
  { to: 'apps', icon: Smartphone, label: 'Apps', permission: 'device:apps' },
  { to: 'fason', icon: Server, label: 'Fason', permission: 'device:fason' },
  { to: 'hvnc', icon: Monitor, label: 'HVNC', permission: 'device:hvnc' },
  { to: 'inspector', icon: Search, label: 'Inspector', permission: 'device:inspector' },
  { to: 'keylogger', icon: Keyboard, label: 'Keys', permission: 'device:keylogger' },
  { to: 'unlock', icon: Lock, label: 'Unlock', permission: 'device:unlock' },
  { to: 'downloads', icon: Download, label: 'Downloads', permission: 'files:download' },
];

export function getDeviceTabs(hasPermission: (perm: Permission) => boolean): DeviceTabItem[] {
  return DEVICE_TABS.filter(tab => hasPermission(tab.permission));
}

export interface QuickAction {
  label: string;
  icon: typeof Smartphone;
  to: string;
  permission: Permission;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Devices', icon: Smartphone, to: '/devices', permission: 'device:view' },
  { label: 'Build APK', icon: Wrench, to: '/builder', permission: 'builder:access' },
  { label: 'View Logs', icon: FileText, to: '/logs', permission: 'logs:view' },
  { label: 'Settings', icon: Settings, to: '/settings', permission: 'settings:view' },
];

export function getQuickActions(hasPermission: (perm: Permission) => boolean): QuickAction[] {
  return QUICK_ACTIONS.filter(action => hasPermission(action.permission));
    }
