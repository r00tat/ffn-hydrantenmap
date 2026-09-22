import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Diagnose-Schalter, nur im Debug-Build gesetzt (`capacitor/build.sh`).
 *
 * Beides gehoert **nicht** in einen ausgelieferten Build: `loggingBehavior`
 * schreibt jede `console.*`-Zeile der WebView nach logcat — auch die aus der
 * Anmeldung —, und `webContentsDebuggingEnabled` oeffnet die WebView fuer
 * `chrome://inspect` samt Browserspeicher, in dem die Firebase-Auth-Persistenz
 * liegt. Auf einem Geraet mit aktivem USB-Debugging waere das ein fertiger
 * Weg zur Sitzung des Benutzers.
 */
const diagnostics = process.env.CAP_DIAGNOSTICS === '1';

const config: CapacitorConfig = {
  appId: 'at.ffnd.einsatzkarte',
  appName: 'FFN Einsatzkarte',
  webDir: 'empty',
  // Voreinstellung ist `debug`, und damit endet jede Fehlersuche an einem
  // ausgelieferten Build im Nichts: Ein `adb logcat` zeigt zwar Play Services
  // und den Credential Manager, aber keine einzige Zeile aus der Anmeldung
  // selbst — genau die Schicht, in der die Firebase-Anmeldung stattfindet.
  // Dass der Login auf einem Geraet nicht wiederkommt, war deshalb am Geraet
  // nicht zu belegen, sondern nur aus dem Quelltext zu erschliessen.
  loggingBehavior: diagnostics ? 'production' : 'none',
  android: {
    // Erlaubt `chrome://inspect`. Setzt zusaetzlich USB-Debugging und
    // physischen Zugriff auf das entsperrte Geraet voraus.
    webContentsDebuggingEnabled: diagnostics,
  },
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
