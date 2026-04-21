import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'at.ffnd.einsatzkarte',
  appName: 'FFN Einsatzkarte',
  webDir: 'empty',
  server: {
    url: 'https://einsatz.ffnd.at',
    cleartext: true,
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
