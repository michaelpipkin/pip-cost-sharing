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
};

export default config;
