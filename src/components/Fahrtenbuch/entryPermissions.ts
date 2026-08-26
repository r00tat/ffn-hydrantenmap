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

import { normalizePersonName, type FahrtenbuchEntry } from '../../common/fahrtenbuch';
import { SHARE_ACTOR_PREFIX } from '../../common/fahrtenbuchShare';

/**
 * Der Aufrufer, soweit die Entscheidung ihn braucht.
 *
 * `personIds` sind die Personendatensätze der Gruppe, deren `userId` auf
 * diesen Benutzer zeigt — die belastbare Verknüpfung zwischen Benutzerkonto
 * und Fahrtenbuch-Person. Sie ist heute in kaum einem Datensatz gepflegt,
 * deshalb der Namensvergleich als Rückfall; sobald sie gepflegt ist, gewinnt
 * sie.
 */
export interface EntryModifyActor {
  /** Firebase-UID des angemeldeten Benutzers. */
  userId?: string;
  /** Anzeigename des angemeldeten Benutzers (`session.user.name`). */
  userName?: string;
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
 * Zwei Wege, in dieser Reihenfolge:
 *
 * 1. Über `driverId` und die verknüpften Personendatensätze — eine geprüfte
 *    Zuordnung.
 * 2. Über den Namen. `normalizePersonName` vergleicht wortweise sortiert,
 *    damit „Schennet Adrian" aus BlaulichtSMS und „Adrian Schennet" aus der
 *    Personenliste dieselbe Person sind.
 *
 * Nur der Hauptfahrer, nicht die Zusatzfahrer: Wer hinter dem QR-Code
 * einträgt, ist der Fahrer; die Mitfahrer hat er bloß genannt.
 *
 * Der Namensvergleich ist bewusst die schwächere Auskunft und wird deshalb nur
 * bei Einträgen ohne Ersteller herangezogen (siehe `canModifyEntry`). Hinter
 * dem Freigabe-Link ist der Fahrername freie Eingabe — wer dort einen fremden
 * Namen tippt, verschenkt das Änderungsrecht an diese Person, er nimmt sich
 * aber keines.
 */
export function isEntryDriver(
  entry: Pick<FahrtenbuchEntry, 'driverId' | 'driverName'>,
  actor: EntryModifyActor,
): boolean {
  if (entry.driverId && actor.personIds?.includes(entry.driverId)) return true;
  const driver = normalizePersonName(entry.driverName ?? '');
  const user = normalizePersonName(actor.userName ?? '');
  return !!driver && driver === user;
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
  entry: Pick<FahrtenbuchEntry, 'createdBy' | 'driverId' | 'driverName'>,
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
