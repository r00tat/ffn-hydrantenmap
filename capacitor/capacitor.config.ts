import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'at.ffnd.einsatzkarte',
  appName: 'FFN Einsatzkarte',
  webDir: 'empty',
  server: {
    url: 'https://einsatz.ffnd.at',
    cleartext: true,
    allowNavigation: [
      '*.nip.io',
      '*.nip.io:3000',
      '*.ffnd.at',
      '192-168-1-226.nip.io:3000',
    ],
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
