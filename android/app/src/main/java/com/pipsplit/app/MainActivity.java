package com.pipsplit.app;

import android.os.Bundle;
import android.view.View;
import android.view.Window;
import androidx.activity.EdgeToEdge;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register custom plugin before calling super.onCreate
        registerPlugin(SystemBarsPlugin.class);

        super.onCreate(savedInstanceState);

        // Enable edge-to-edge
        EdgeToEdge.enable(this);

        // Configure initial window appearance for light theme (dark background, light icons)
        Window window = getWindow();
        View decorView = window.getDecorView();
        WindowInsetsControllerCompat windowInsetsController =
            WindowCompat.getInsetsController(window, decorView);

        if (windowInsetsController != null) {
            // Set status bar to use light icons (for dark/primary background)
            windowInsetsController.setAppearanceLightStatusBars(false);
            windowInsetsController.setAppearanceLightNavigationBars(false);
        }
    }
}
