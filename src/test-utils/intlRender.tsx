import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ReactElement, ReactNode } from 'react';
import deMessages from '../../messages/de.json';

/**
 * Das Theme der Tests: MUIs Standardtheme ohne Animationen. Die App selbst
 * ruft nirgends `createTheme` auf und läuft auf demselben Standardtheme,
 * deshalb ändert das an der Darstellung nichts außer den Übergängen.
 *
 * Der Grund ist die Bestimmtheit, nicht die Geschwindigkeit. Die teuersten
 * Testdateien sind Dialog-Tests, die mit `userEvent` ganze MUI-Formulare
 * durchfahren; jedes Öffnen und Schließen eines Select oder Dialogs lief
 * bisher durch eine echte Transition. Damit ist ein geschlossenes Menü sofort
 * aus dem DOM, statt die nächste Abfrage manchmal zu überleben und sie mit
 * „Found multiple elements" scheitern zu lassen.
 *
 * Zeit spart es auch, aber wenig: Zusammen mit `pool: 'threads'`
 * (vitest.config.ts) rund 4% Wanduhr über die ganze Suite; der Anteil dieses
 * Themes daran liegt unter dem Rauschen einer Entwicklermaschine. Die Kosten
 * der Dialog-Tests stecken im MUI-Render unter jsdom — in FahrtenbuchDialog
 * sind es 29 Tests à etwa 150ms, gleichmäßig verteilt, ohne dominierenden
 * Einzeltest. An dieser Stelle ist mit Stellschrauben nichts mehr zu holen.
 */
export const testTheme = createTheme({
  transitions: { create: () => 'none' },
  components: {
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiDialog: { defaultProps: { transitionDuration: 0 } },
    MuiMenu: { defaultProps: { transitionDuration: 0 } },
    MuiPopover: { defaultProps: { transitionDuration: 0 } },
  },
});

/**
 * Dieselbe Zeitzone, die `src/i18n/request.ts` der App gibt.
 *
 * Ohne sie fällt next-intl auf die Zeitzone der Umgebung zurück und meldet das
 * je Formatierung als `IntlError: ENVIRONMENT_FALLBACK` — über die Suite rund
 * 1150 Zeilen, die im CI-Log alles Übrige zudecken. Wichtiger als der Lärm ist
 * die Bestimmtheit: Der CI-Runner läuft auf UTC, Entwicklermaschinen hier auf
 * Europe/Vienna. Jede Zusicherung auf eine über next-intl formatierte Uhrzeit
 * käme sonst je Maschine anders heraus — im Sommer zwei Stunden daneben.
 */
const TEST_TIME_ZONE = 'Europe/Vienna';

export function IntlWrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={testTheme}>
      <NextIntlClientProvider
        locale="de"
        messages={deMessages}
        timeZone={TEST_TIME_ZONE}
      >
        {children}
      </NextIntlClientProvider>
    </ThemeProvider>
  );
}

/**
 * Render a component wrapped in NextIntlClientProvider using the de.json
 * catalog. Use this in any test that touches a component which calls
 * `useTranslations()`.
 */
export function renderWithIntl(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  return render(ui, { wrapper: IntlWrapper, ...options });
}
