import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pipsplit.app',
  appName: 'PipSplit',
  webDir: 'dist/browser',
  server: {
    url: 'https://pipsplit.com',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com'],
    },
    EdgeToEdge: {
      backgroundColor: '#105208',
    },
    // Status/gesture bar colors stopped matching after Capacitor 8.4.2 ->
    // 8.5.2: core's built-in SystemBars plugin installs its own
    // window-insets handling, which fights the EdgeToEdge plugin above
    // (it owns the inset margins and the colored bar overlays). Turn core's
    // inset handling off so EdgeToEdge keeps sole ownership. Verified on a
    // real device (Pixel, Android 17).
    SystemBars: {
      insetsHandling: 'disable',
    },
  },
};

export default config;
