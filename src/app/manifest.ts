import type { MetadataRoute } from 'next';
import { appIconPath, withEnvironmentPrefix } from '../common/appEnvironment';

/**
 * Als Route statt als statische `manifest.json`, damit `name` und `short_name`
 * die Dev-Kennzeichnung tragen können — der installierte Homescreen-Eintrag
 * heißt dann anders als der der Produktion. Next liefert das Ergebnis unter
 * `/manifest.webmanifest`; darauf zeigt der `<link rel="manifest">` im Layout.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: withEnvironmentPrefix('Einsatzkarte FFN'),
    short_name: withEnvironmentPrefix('Einsatzkarte'),
    theme_color: '#1976d2',
    background_color: '#ffffff',
    display: 'standalone',
    scope: '/',
    start_url: '/',
    // Weißer Hintergrund mit farbigem Logo — die Android-App hat das Motiv
    // weiß auf Blau, damit beide auf einem Homescreen unterscheidbar sind.
    icons: [
      {
        src: appIconPath('icon-192.png'),
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: appIconPath('icon-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: appIconPath('icon-maskable-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
