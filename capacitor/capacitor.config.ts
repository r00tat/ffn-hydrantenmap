import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'at.ffn.einsatzkarte',
  appName: 'FFN Einsatzkarte',
  webDir: 'empty',
  server: {
    url: 'https://einsatz.ffn.at',
    cleartext: true,
  },
};

export default config;
