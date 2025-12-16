package com.pipsplit.app;

import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {

    @PluginMethod
    public void setStyle(PluginCall call) {
        String style = call.getString("style", "light");
        boolean isLight = "light".equalsIgnoreCase(style);

        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            View decorView = window.getDecorView();
            WindowInsetsControllerCompat windowInsetsController =
                WindowCompat.getInsetsController(window, decorView);

            if (windowInsetsController != null) {
                // isAppearanceLightStatusBars = true means dark icons on light background
                // isAppearanceLightStatusBars = false means light icons on dark background
                windowInsetsController.setAppearanceLightStatusBars(isLight);
                windowInsetsController.setAppearanceLightNavigationBars(isLight);
            }
            call.resolve();
        });
    }
}
