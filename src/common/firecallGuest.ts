/**
 * Einsatz-Gäste sind Benutzer, die ausschließlich über einen Share-Link
 * (`/einsatz/<id>?token=…`) Zugang zu einem einzelnen Einsatz haben. Erkennbar
 * sind sie am gesetzten `firecall`-Feld; `firecallWrite` steuert, ob sie den
 * Einsatz auch bearbeiten dürfen.
 */

/** Marker im Anzeigenamen, damit ein Gast auch ohne Filter erkennbar ist. */
export const GUEST_NAME_MARKER = 'Einsatz-Gast';

export interface FirecallGuestInfo {
  firecall?: string;
  firecallWrite?: boolean;
}

/** Trimmt den eingegebenen Gastnamen und normalisiert innere Whitespace-Folgen. */
export function normalizeGuestName(name?: string): string {
  return (name || '').trim().replace(/\s+/g, ' ');
}

/**
 * Baut den Anzeigenamen eines Einsatz-Gasts:
 * `"<Name> (Einsatz-Gast <Einsatz>)"`.
 *
 * @throws wenn kein Name angegeben wurde — der Name ist im Share-Dialog Pflicht.
 */
export function guestDisplayName(name: string, firecallName?: string): string {
  const guestName = normalizeGuestName(name);
  if (!guestName) {
    throw new Error('guest name is required');
  }
  const einsatz = normalizeGuestName(firecallName);
  return `${guestName} (${GUEST_NAME_MARKER}${einsatz ? ` ${einsatz}` : ''})`;
}

/** Ist dieser Benutzer ein über Share-Link angelegter Einsatz-Gast? */
export function isFirecallGuest(user?: FirecallGuestInfo): boolean {
  return !!user?.firecall;
}

/**
 * Darf dieser Benutzer den Einsatz bearbeiten?
 *
 * Nur Einsatz-Gäste können eingeschränkt sein — alle anderen Benutzer beziehen
 * ihr Schreibrecht über die Gruppenmitgliedschaft. Ein fehlendes
 * `firecallWrite` bedeutet Schreibzugriff, damit Gäste aus der Zeit vor diesem
 * Feature ihren bisherigen Zugriff behalten.
 */
export function guestCanWrite(user?: FirecallGuestInfo): boolean {
  if (!isFirecallGuest(user)) {
    return true;
  }
  return user?.firecallWrite !== false;
}
