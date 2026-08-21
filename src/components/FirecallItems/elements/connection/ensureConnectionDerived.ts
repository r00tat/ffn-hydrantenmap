'use client';

import type { MultiPointItem } from '../../../firebase/firestore';
import { ensureConnectionRouting } from './ensureConnectionRouting';
import { ensureConnectionElevation } from './foerderung/ensureConnectionElevation';
import { ensureConnectionPendelRoute } from './pendel/ensureConnectionPendelRoute';

/**
 * Zieht die abgeleiteten Angaben einer Leitung nach: erst den Straßenverlauf,
 * dann das Höhenprofil, dann die Fahrtroute des Pendelverkehrs.
 *
 * Die Reihenfolge der ersten beiden ist der Grund, dass es diese Datei gibt.
 * Das Höhenprofil wird entlang `displayPositions()` abgetastet — also entlang
 * des gerouteten Verlaufs. Liefe es auf der unveränderten Kopie im Speicher,
 * tastete es die Geometrie von **vor** dem Routing ab, und das Profil gehörte
 * zu einer Linie, die die Karte nicht zeichnet. Deshalb werden die Änderungen
 * des Routings hier ins Element zusammengeführt, bevor das Höhenprofil läuft.
 *
 * Die Fahrtroute hängt dagegen nur an den **Enden** der Leitung und nicht am
 * Straßenverlauf des Schlauchs — sie käme mit jeder Reihenfolge zum gleichen
 * Ergebnis. Sie steht zuletzt, weil sie am seltensten gebraucht wird: nur bei
 * Pendelverkehr oder Vergleich.
 *
 * Wirft nicht: Jeder Schritt fängt seine Fehler selbst ab und hinterlässt einen
 * gekennzeichneten Ersatzzustand (Luftlinie, Handeingabe, Umwegfaktor).
 */
export async function ensureConnectionDerived(
  firecallId: string,
  item: MultiPointItem
): Promise<void> {
  const routing = await ensureConnectionRouting(firecallId, item);
  const withRouting = { ...item, ...routing };
  await ensureConnectionElevation(firecallId, withRouting);
  await ensureConnectionPendelRoute(firecallId, withRouting);
}
