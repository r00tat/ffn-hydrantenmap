/**
 * Wer einen bestehenden Fahrtenbuch-Eintrag ändern oder löschen darf.
 *
 * Ein eigenes Modul und nicht Teil von `entryLogic.ts`: Diese Prädikate
 * braucht auch der Client — die Liste entscheidet damit, ob sie einen
 * Bearbeiten-Knopf überhaupt anbietet — und der zöge über `entryLogic` das
 * gesamte Eintrags-Validierungsmodul in sein Bundle. Dieselbe Trennung wie bei
 * `managerPermissions.ts`.
 *
 * Server und Client müssen hier zwingend dasselbe rechnen. Ein Knopf, der
 * erscheint und beim Speichern abgewiesen wird, ist genau der Fehler, aus dem
 * dieses Modul entstanden ist: Der Dialog ging auf, alles war ausfüllbar, und
 * erst das Speichern meldete „nur der Ersteller darf ändern".
 */

import type { FahrtenbuchEntry } from '../../common/fahrtenbuch';
import { SHARE_ACTOR_PREFIX } from '../../common/fahrtenbuchShare';

/**
 * Der Aufrufer, soweit die Entscheidung ihn braucht.
 *
 * `personIds` sind die Personendatensätze der Gruppe, deren `userId` auf
 * diesen Benutzer zeigt — die einzige Verknüpfung zwischen Benutzerkonto und
 * Fahrtenbuch-Person, der zu trauen ist. Sie wird auf der gepflegten Seite
 * gesetzt (Personenliste der Gruppe) und nicht von dem, der sich darauf beruft.
 *
 * **Kein Namensvergleich.** Der Anzeigename einer Sitzung ist die
 * Firebase-`displayName` und gehört dem Benutzer selbst: Sie stammt aus einem
 * Freitextfeld der Selbstregistrierung und ist danach jederzeit über
 * `updateProfile` änderbar — auch ohne dass diese App eine Oberfläche dafür
 * anbietet. Ein Gruppenmitglied könnte sich also auf den Namen einer Kollegin
 * umbenennen und deren über den QR-Code erfasste Fahrten ändern und löschen.
 * In einem Nachweisdokument ist das genau die stille Verfälschung, gegen die
 * die Zuordnung überhaupt da ist.
 */
export interface EntryModifyActor {
  /** Firebase-UID des angemeldeten Benutzers. */
  userId?: string;
  /** IDs der Personendatensätze, die auf diesen Benutzer zeigen. */
  personIds?: string[];
}

/**
 * Wurde der Eintrag hinter dem Freigabe-Link erfasst — also über den QR-Code
 * am Fahrzeug, ohne Anmeldung?
 *
 * Solche Einträge haben keinen Ersteller im Sinne eines Benutzerkontos:
 * `createdBy` ist die Link-ID, `createdByName` nur der getippte Fahrername.
 */
export function isShareLinkEntry(
  entry: Pick<FahrtenbuchEntry, 'createdBy'>,
): boolean {
  return !!entry.createdBy?.startsWith(SHARE_ACTOR_PREFIX);
}

/**
 * Ist der Aufrufer der Fahrer dieser Fahrt?
 *
 * Ausschließlich über `driverId` und die mit dem Benutzerkonto verknüpften
 * Personendatensätze (`person.userId`). Warum nicht über den Namen, steht an
 * `EntryModifyActor`.
 *
 * Nur der Hauptfahrer, nicht die Zusatzfahrer: Wer hinter dem QR-Code
 * einträgt, ist der Fahrer; die Mitfahrer hat er bloß genannt.
 *
 * Ohne gepflegte Verknüpfung ist die Antwort `false` — die Fahrt bleibt dann
 * dem Gerätemeister und dem Admin vorbehalten. Lieber eine Korrektur, die den
 * Gerätemeister braucht, als eine, die sich über einen selbst gewählten Namen
 * erschleichen lässt.
 */
export function isEntryDriver(
  entry: Pick<FahrtenbuchEntry, 'driverId'>,
  actor: EntryModifyActor,
): boolean {
  return !!entry.driverId && !!actor.personIds?.includes(entry.driverId);
}

/**
 * Wer einen bestehenden Eintrag ändern oder löschen darf: sein Ersteller, wer
 * die Gruppe verwalten darf (`isFahrtenbuchManager` — Admin oder
 * Gerätemeister), oder — nur bei Einträgen aus dem Freigabe-Link — der
 * eingetragene Fahrer.
 *
 * Den Verwalter-Teil entscheidet der Aufrufer und übergibt ihn als
 * `canManage`, damit diese Funktion rein bleibt.
 */
export function canModifyEntry(
  entry: Pick<FahrtenbuchEntry, 'createdBy' | 'driverId'>,
  actor: EntryModifyActor,
  canManage: boolean,
): boolean {
  if (canManage) return true;
  // `!!actor.userId` verhindert, dass ein Eintrag ohne `createdBy` und ein
  // Aufrufer ohne ID über `undefined === undefined` zusammenfallen.
  if (!!actor.userId && entry.createdBy === actor.userId) return true;
  return isShareLinkEntry(entry) && isEntryDriver(entry, actor);
}

/**
 * Wurde der Eintrag nach dem Anlegen geändert?
 *
 * `updatedAt` wird beim Anlegen auf `createdAt` gesetzt, ist also immer
 * gefüllt — die Gleichheit ist die Auskunft, nicht das Vorhandensein.
 */
export function wasEntryEdited(
  entry: Pick<FahrtenbuchEntry, 'createdAt' | 'updatedAt'>,
): boolean {
  if (!entry.createdAt || !entry.updatedAt) return false;
  return entry.updatedAt !== entry.createdAt;
}
