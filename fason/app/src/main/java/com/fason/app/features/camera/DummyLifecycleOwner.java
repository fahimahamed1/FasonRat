package com.fason.app.features.camera;

import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.LifecycleOwner;
import androidx.lifecycle.LifecycleRegistry;

// LifecycleOwner for background camera operations
public class DummyLifecycleOwner implements LifecycleOwner {

    private static DummyLifecycleOwner instance;
    private final LifecycleRegistry registry;

    private DummyLifecycleOwner() {
        registry = new LifecycleRegistry(this);
        registry.setCurrentState(Lifecycle.State.RESUMED);
    }

    public static synchronized DummyLifecycleOwner get() {
        if (instance == null) {
            instance = new DummyLifecycleOwner();
        }
        return instance;
    }

    @Override
    public Lifecycle getLifecycle() {
        return registry;
    }
}
