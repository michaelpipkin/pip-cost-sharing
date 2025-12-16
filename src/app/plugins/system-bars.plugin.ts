import { registerPlugin } from '@capacitor/core';

export interface SystemBarsPlugin {
  setStyle(options: { style: 'light' | 'dark' }): Promise<void>;
}

const SystemBars = registerPlugin<SystemBarsPlugin>('SystemBars');

export { SystemBars };
