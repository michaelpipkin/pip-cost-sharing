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
        super.onCreate(savedInstanceState);

        // Enable edge-to-edge
        EdgeToEdge.enable(this);

        // Configure window appearance
        Window window = getWindow();
        View decorView = window.getDecorView();
        WindowInsetsControllerCompat windowInsetsController =
            WindowCompat.getInsetsController(window, decorView);

        if (windowInsetsController != null) {
            // Set status bar to use dark icons (for light background)
            windowInsetsController.setAppearanceLightStatusBars(true);
            windowInsetsController.setAppearanceLightNavigationBars(true);
        }
    }
}
