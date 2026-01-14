import { Capacitor, registerPlugin } from '@capacitor/core';

export interface SystemBarsPlugin {
  setStyle(options: { style: 'light' | 'dark' }): Promise<void>;
}

// Check if plugin is already registered to avoid duplicate registration during HMR
let SystemBars: SystemBarsPlugin;
try {
  // Try to get existing plugin instance
  const existingPlugin = (Capacitor as any).Plugins?.SystemBars;
  if (existingPlugin) {
    SystemBars = existingPlugin;
  } else {
    SystemBars = registerPlugin<SystemBarsPlugin>('SystemBars');
  }
} catch {
  SystemBars = registerPlugin<SystemBarsPlugin>('SystemBars');
}

export { SystemBars };
