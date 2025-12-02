package com.pipsplit.app;

import android.os.Bundle;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Configure status bar to use dark icons on light background
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);

        View decorView = window.getDecorView();
        WindowInsetsControllerCompat windowInsetsController =
            WindowCompat.getInsetsController(window, decorView);

        if (windowInsetsController != null) {
            // Set status bar to use dark icons (for light background)
            windowInsetsController.setAppearanceLightStatusBars(true);
        }

        // Set status bar color to white
        window.setStatusBarColor(0xFFFFFFFF);
    }
}
