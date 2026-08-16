/**
 * Schließt das oberste offene MUI-Overlay (Dialog, Drawer, Menu, Popover).
 *
 * Es gibt keine API, um „das oberste Modal" von außen zu schließen — MUI hält
 * den Offen-Zustand in der jeweiligen Komponente, nicht zentral. Der einzige
 * herstellerseitig unterstützte Weg von außen ist die Escape-Taste: `useModal`
 * hängt dafür einen `keydown`-Handler an den Modal-Root und prüft selbst über
 * den `ModalManager`, ob es das oberste Modal ist. Ein synthetisch verschickter
 * Escape-Druck nutzt genau diesen Pfad und funktioniert deshalb für alle 40+
 * Dialoge der App, ohne jeden einzelnen anzufassen.
 *
 * @returns `true`, wenn ein Overlay offen war — der Aufrufer darf den
 *   Zurück-Druck dann als erledigt betrachten. Das gilt auch für Dialoge mit
 *   `disableEscapeKeyDown`: die verweigern das Schließen bewusst, und ein
 *   durchfallender Zurück-Druck würde stattdessen die App beenden.
 */
export function closeTopmostModal(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  // Geschlossene Modals sind normalerweise ausgehängt; `keepMounted` lässt sie
  // stehen und markiert sie mit `MuiModal-hidden`. Das letzte verbliebene
  // Element ist das zuletzt geöffnete und damit das oberste.
  const modals = document.querySelectorAll<HTMLElement>(
    '.MuiModal-root:not(.MuiModal-hidden)',
  );
  const topmost = modals[modals.length - 1];
  if (!topmost) {
    return false;
  }

  topmost.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  );
  return true;
}
