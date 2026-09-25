import { createTheme } from '@mui/material/styles';

/** Blau des Logos, Hauptfarbe der App. */
export const BRAND_PRIMARY = '#1976d2';

/**
 * Rot des Logos (Flamme, Schild). Nur als Markenakzent verwendet — etwa als
 * Unterkante der Kopfleiste —, nicht als `secondary`: Rot bleibt in der
 * Oberfläche den Fehlern und Warnungen vorbehalten (Atemschutzüberwachung,
 * Löschen, Fehlermeldungen), die sonst zwischen gewöhnlichen Aktionen
 * untergingen.
 */
export const BRAND_ACCENT = '#d32f2f';

export const appTheme = createTheme({
  palette: {
    primary: { main: BRAND_PRIMARY },
    // Neutraler Zweitakzent: Registrieren im Login, „Zurück zu live" im
    // Verlauf, Hervorhebungen und Reihen in den Fahrtenbuch-Diagrammen, die
    // korrigierte Linie im Dosisleistungs-Nomogramm.
    secondary: { main: '#455a64' },
    error: { main: BRAND_ACCENT },
  },
});
