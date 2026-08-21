'use client';

import type { MultiPointItem } from '../../../firebase/firestore';
import { ensureConnectionRouting } from './ensureConnectionRouting';
import { ensureConnectionElevation } from './foerderung/ensureConnectionElevation';

/**
 * Zieht die abgeleiteten Angaben einer Leitung nach: erst den Straßenverlauf,
 * dann das Höhenprofil.
 *
 * Die Reihenfolge ist der Grund, dass es diese Datei gibt.
 * Das Höhenprofil wird entlang `displayPositions()` abgetastet — also entlang
 * des gerouteten Verlaufs. Liefe es auf der unveränderten Kopie im Speicher,
 * tastete es die Geometrie von **vor** dem Routing ab, und das Profil gehörte
 * zu einer Linie, die die Karte nicht zeichnet. Deshalb werden die Änderungen
 * des Routings hier ins Element zusammengeführt, bevor das Höhenprofil läuft.
 *
 * Der Pendelverkehr braucht hier keinen eigenen Schritt: Seine Fahrstrecke ist
 * diese Leitung, geroutet mit dem Profil `drive`. Das erledigt derselbe erste
 * Schritt.
 *
 * Wirft nicht: Jeder Schritt fängt seine Fehler selbst ab und hinterlässt einen
 * gekennzeichneten Ersatzzustand (Luftlinie, Handeingabe).
 */
export async function ensureConnectionDerived(
  firecallId: string,
  item: MultiPointItem
): Promise<void> {
  const routing = await ensureConnectionRouting(firecallId, item);
  await ensureConnectionElevation(firecallId, { ...item, ...routing });
}
