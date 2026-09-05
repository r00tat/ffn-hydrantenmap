import type { MetadataRoute } from 'next';
import { withEnvironmentPrefix } from '../common/appEnvironment';

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
    icons: [
      {
        src: '/app-icon.png',
        sizes: '144x144',
        type: 'image/png',
      },
    ],
  };
}
