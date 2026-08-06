'use client';

import { guestCanWrite, isFirecallGuest } from '../common/firecallGuest';
import useFirebaseLogin from './useFirebaseLogin';

/**
 * Darf der angemeldete Benutzer den Einsatz bearbeiten?
 *
 * Nur Einsatz-Gäste (Zugang über einen Share-Link) können eingeschränkt sein —
 * alle anderen Benutzer beziehen ihr Schreibrecht über die Gruppen­mitgliedschaft
 * und werden hier immer als schreibberechtigt gemeldet. Die Durchsetzung liegt
 * bei den Firestore-Rules und den Server Actions; dieser Hook dient dazu,
 * Bedienelemente auszublenden, die ohnehin scheitern würden.
 */
export default function useFirecallWriteAccess(): boolean {
  const { firecall, firecallWrite } = useFirebaseLogin();
  return guestCanWrite({ firecall, firecallWrite });
}

/**
 * Gegenstück zu `useFirecallWriteAccess` für Hinweise an den Benutzer: `true`
 * nur für Einsatz-Gäste mit ausschließlichem Lesezugriff.
 */
export function useIsReadOnlyFirecallGuest(): boolean {
  const { firecall, firecallWrite } = useFirebaseLogin();
  const guest = { firecall, firecallWrite };
  return isFirecallGuest(guest) && !guestCanWrite(guest);
}
