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
    adjustMarginsForEdgeToEdge: 'force',
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com'],
    },
  },
};

export default config;
