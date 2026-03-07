package com.fason.app.core;

import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.fason.app.service.MainService;
import com.fason.app.worker.KeepAliveWorker;

import java.util.concurrent.TimeUnit;

// Central application entry-point
public class FasonApp extends Application {

    private static FasonApp instance;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        startBackgroundServices();
    }

    private void startBackgroundServices() {
        // Start main foreground service
        try {
            Intent i = new Intent(this, MainService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(i);
            } else {
                startService(i);
            }
        } catch (Exception ignored) {}

        // Schedule periodic work for keep-alive
        try {
            PeriodicWorkRequest work = new PeriodicWorkRequest.Builder(
                KeepAliveWorker.class,
                15, // 15 min interval (minimum allowed)
                TimeUnit.MINUTES
            ).build();

            WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                "KeepAliveWork",
                ExistingPeriodicWorkPolicy.KEEP,
                work
            );
        } catch (Exception ignored) {}
    }

    public static Context getContext() {
        if (instance == null) {
            throw new IllegalStateException("FasonApp has not been initialized");
        }
        return instance.getApplicationContext();
    }
}
