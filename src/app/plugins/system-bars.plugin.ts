import { Capacitor, registerPlugin } from '@capacitor/core';

export interface SystemBarsPlugin {
  setStyle(options: { style: 'light' | 'dark' }): Promise<void>;
}

// Check if plugin is already registered to avoid duplicate registration during HMR
function getSystemBarsPlugin(): SystemBarsPlugin {
  try {
    return (
      (Capacitor as any).Plugins?.SystemBars ??
      registerPlugin<SystemBarsPlugin>('SystemBars')
    );
  } catch {
    return registerPlugin<SystemBarsPlugin>('SystemBars');
  }
}

export const SystemBars = getSystemBarsPlugin();
