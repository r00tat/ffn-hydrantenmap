'use server';
import 'server-only';

import { actionAdminRequired } from '../../app/auth';
import {
  FAHRTENBUCH_CONFIG_COLLECTION_ID,
  FAHRTENBUCH_PERSON_COLLECTION_ID,
  FAHRTENBUCH_VEHICLE_COLLECTION_ID,
  normalizePersonName,
  VEHICLE_PRESETS,
  type FahrtenbuchConfig,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
  type VehiclePresetId,
} from '../../common/fahrtenbuch';
import { getDefaultVehicles } from '../../common/defaultKostenersatzRates';
import type { GeoPositionObject } from '../../common/geo';
import {
  KOSTENERSATZ_VEHICLES_COLLECTION,
  type KostenersatzVehicle,
} from '../../common/kostenersatz';
import { listUsers } from '../../app/api/users/listUsers';
import { firestore } from '../../server/firebase/admin';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import {
  actionFahrtenbuchManagerRequired,
  assertFahrtenbuchGroup,
} from './authGuards';
import { planInactivePersons } from './fahrtenbuchImportPlan';
import {
  matchPersonsToUsers,
  type PersonUserCandidate,
  type PersonUserLink,
  type PersonUserMatch,
} from './personUserMatch';
import {
  fieldsForChanges,
  parseRecipientCsv,
  planPersonCsvImport,
  resolvePersonImportSelection,
  type PersonImportPlanRow,
  type PersonImportSelection,
  type RecipientCsvError,
} from './personCsvImport';
import {
  planVehicleImport,
  resolveVehicleImportSelection,
  sanitizeCounterDefinitions,
  sanitizeFuelTypes,
  sanitizeMangelEmails,
  sanitizeSortOrder,
  sanitizeStandort,
  type VehicleImportPlanRow,
} from './stammdatenLogic';

function personsRef(groupId: string) {
  return firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(FAHRTENBUCH_PERSON_COLLECTION_ID);
}

function vehiclesRef(groupId: string) {
  return firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(FAHRTENBUCH_VEHICLE_COLLECTION_ID);
}

async function loadVehicles(groupId: string): Promise<FahrtenbuchVehicle[]> {
  const snapshot = await vehiclesRef(groupId).get();
  return snapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as FahrtenbuchVehicle,
  );
}

async function loadPersons(groupId: string): Promise<FahrtenbuchPerson[]> {
  const snapshot = await personsRef(groupId).get();
  return snapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as FahrtenbuchPerson,
  );
}

function stamps(userId: string) {
  const now = new Date().toISOString();
  return { createdAt: now, createdBy: userId, updatedAt: now, updatedBy: userId };
}

export interface StammdatenResult {
  success: boolean;
  error?: string;
  id?: string;
}

export async function saveFahrtenbuchVehicle(
  groupId: string,
  vehicleId: string | undefined,
  data: Pick<
    FahrtenbuchVehicle,
    | 'name'
    | 'kennzeichen'
    | 'active'
    | 'counters'
    | 'fuelTypes'
    | 'kostenersatzVehicleId'
    | 'sortOrder'
  >,
): Promise<StammdatenResult> {
  try {
    const session = await actionFahrtenbuchManagerRequired(groupId);
    const now = new Date().toISOString();
    const payload = {
      name: data.name.trim(),
      kennzeichen: data.kennzeichen?.trim() ?? '',
      active: data.active !== false,
      // Server-Action-Argumente sind Client-Eingabe, der Pick<>-Typ ist zur
      // Laufzeit weg — daher hier bereinigen statt roh zu speichern.
      counters: sanitizeCounterDefinitions(data.counters),
      fuelTypes: sanitizeFuelTypes(data.fuelTypes),
      kostenersatzVehicleId:
        typeof data.kostenersatzVehicleId === 'string'
          ? data.kostenersatzVehicleId.trim()
          : '',
      sortOrder: sanitizeSortOrder(data.sortOrder),
      updatedAt: now,
      updatedBy: session.user.id,
    };

    if (vehicleId) {
      await vehiclesRef(groupId).doc(vehicleId).set(payload, { merge: true });
      return { success: true, id: vehicleId };
    }
    const ref = await vehiclesRef(groupId).add({
      ...payload,
      createdAt: now,
      createdBy: session.user.id,
    });
    return { success: true, id: ref.id };
  } catch (err) {
    console.error('saveFahrtenbuchVehicle failed', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteFahrtenbuchVehicle(
  groupId: string,
  vehicleId: string,
): Promise<StammdatenResult> {
  try {
    await actionFahrtenbuchManagerRequired(groupId);
    await vehiclesRef(groupId).doc(vehicleId).delete();
    return { success: true, id: vehicleId };
  } catch (err) {
    console.error('deleteFahrtenbuchVehicle failed', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function saveFahrtenbuchPerson(
  groupId: string,
  personId: string | undefined,
  data: Pick<
    FahrtenbuchPerson,
    'name' | 'active' | 'blaulichtSmsRecipientId' | 'phone' | 'email' | 'note'
  >,
): Promise<StammdatenResult> {
  try {
    const session = await actionFahrtenbuchManagerRequired(groupId);
    const now = new Date().toISOString();
    const payload = {
      name: data.name.trim(),
      active: data.active !== false,
      blaulichtSmsRecipientId: data.blaulichtSmsRecipientId?.trim() ?? '',
      phone: data.phone?.trim() ?? '',
      email: data.email?.trim() ?? '',
      note: data.note?.trim() ?? '',
      updatedAt: now,
      updatedBy: session.user.id,
    };

    if (personId) {
      await personsRef(groupId).doc(personId).set(payload, { merge: true });
      return { success: true, id: personId };
    }
    const ref = await personsRef(groupId).add({
      ...payload,
      createdAt: now,
      createdBy: session.user.id,
    });
    return { success: true, id: ref.id };
  } catch (err) {
    console.error('saveFahrtenbuchPerson failed', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteFahrtenbuchPerson(
  groupId: string,
  personId: string,
): Promise<StammdatenResult> {
  try {
    await actionFahrtenbuchManagerRequired(groupId);
    await personsRef(groupId).doc(personId).delete();
    return { success: true, id: personId };
  } catch (err) {
    console.error('deleteFahrtenbuchPerson failed', err);
    return { success: false, error: (err as Error).message };
  }
}

/** Quelle wie in `useKostenersatzVehicles`: Firestore, sonst die Defaults. */
async function loadKostenersatzVehicles(): Promise<KostenersatzVehicle[]> {
  const snapshot = await firestore
    .collection(KOSTENERSATZ_VEHICLES_COLLECTION)
    .get();
  if (snapshot.empty) return getDefaultVehicles();
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }) as KostenersatzVehicle)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** Vorschau für den Import-Dialog. */
export async function previewVehicleImport(
  groupId: string,
): Promise<{ success: boolean; rows: VehicleImportPlanRow[]; error?: string }> {
  try {
    await actionFahrtenbuchManagerRequired(groupId);
    const [source, existing] = await Promise.all([
      loadKostenersatzVehicles(),
      loadVehicles(groupId),
    ]);
    return { success: true, rows: planVehicleImport(source, existing) };
  } catch (err) {
    console.error('previewVehicleImport failed', err);
    return { success: false, rows: [], error: (err as Error).message };
  }
}

/** Legt die ausgewählten Fahrzeuge an. Bereits vorhandene werden übersprungen. */
export async function importVehiclesFromKostenersatz(
  groupId: string,
  selection: { sourceId: string; preset: VehiclePresetId }[],
): Promise<{
  success: boolean;
  created: number;
  skipped: number;
  error?: string;
}> {
  try {
    const session = await actionFahrtenbuchManagerRequired(groupId);
    const [source, existing] = await Promise.all([
      loadKostenersatzVehicles(),
      loadVehicles(groupId),
    ]);
    const rows = planVehicleImport(source, existing);
    const { create, skipped } = resolveVehicleImportSelection(rows, selection);

    if (create.length > 0) {
      const batch = firestore.batch();
      for (const row of create) {
        batch.set(vehiclesRef(groupId).doc(), {
          name: row.name,
          kennzeichen: '',
          active: true,
          counters: VEHICLE_PRESETS[row.preset],
          fuelTypes: [],
          kostenersatzVehicleId: row.sourceId,
          sortOrder: row.sortOrder ?? 0,
          ...stamps(session.user.id),
        });
      }
      await batch.commit();
    }

    return { success: true, created: create.length, skipped };
  } catch (err) {
    console.error('importVehiclesFromKostenersatz failed', err);
    return {
      success: false,
      created: 0,
      skipped: 0,
      error: (err as Error).message,
    };
  }
}

export interface PersonImportPreview {
  success: boolean;
  rows: PersonImportPlanRow[];
  missing: { personId: string; name: string }[];
  /** Verworfene Zeilen und Dateifehler aus dem Parser. */
  parseErrors: RecipientCsvError[];
  error?: string;
}

/**
 * Vorschau des Personen-Imports. Der Dialog schickt den Dateiinhalt; geparst
 * und geplant wird auf dem Server — auf demselben Weg wie beim Import, damit
 * die Vorschau nicht von der Auswirkung abweichen kann.
 */
export async function previewPersonCsvImport(
  groupId: string,
  csvText: string,
): Promise<PersonImportPreview> {
  try {
    await actionFahrtenbuchManagerRequired(groupId);
    const { records, errors } = parseRecipientCsv(csvText);
    const plan = planPersonCsvImport(records, await loadPersons(groupId));
    return {
      success: true,
      rows: plan.rows,
      missing: plan.missing,
      parseErrors: errors,
    };
  } catch (err) {
    console.error('previewPersonCsvImport failed', err);
    return {
      success: false,
      rows: [],
      missing: [],
      parseErrors: [],
      error: (err as Error).message,
    };
  }
}

export interface PersonImportResult {
  success: boolean;
  created: number;
  linked: number;
  updated: number;
  deactivated: number;
  skipped: number;
  error?: string;
}

/**
 * Übernimmt die ausgewählten Empfänger. Der Plan wird aus dem mitgeschickten
 * Dateiinhalt neu erstellt; die Auswahl bestimmt nur, welche Zeilen daraus
 * angewendet werden. Abgänge werden deaktiviert, nie gelöscht — vergangene
 * Fahrten zeigen weiter auf die Person.
 */
export async function importPersonsFromCsv(
  groupId: string,
  csvText: string,
  selection: PersonImportSelection,
): Promise<PersonImportResult> {
  try {
    const session = await actionFahrtenbuchManagerRequired(groupId);
    const { records } = parseRecipientCsv(csvText);
    const plan = planPersonCsvImport(records, await loadPersons(groupId));
    // Server-Action-Argumente sind Client-Eingabe — der Typ ist zur Laufzeit
    // weg, also darf hier nichts als Array vorausgesetzt werden.
    const resolved = resolvePersonImportSelection(plan, {
      recipientIds: Array.isArray(selection?.recipientIds)
        ? selection.recipientIds
        : [],
      deactivatePersonIds: Array.isArray(selection?.deactivatePersonIds)
        ? selection.deactivatePersonIds
        : [],
    });

    const touched =
      resolved.create.length +
      resolved.link.length +
      resolved.update.length +
      resolved.deactivate.length;

    if (touched > 0) {
      const now = new Date().toISOString();
      const touch = { updatedAt: now, updatedBy: session.user.id };
      const batch = firestore.batch();

      for (const record of resolved.create) {
        batch.set(personsRef(groupId).doc(), {
          name: record.name,
          active: true,
          blaulichtSmsRecipientId: record.id,
          phone: record.phone,
          email: record.email,
          note: record.note,
          ...stamps(session.user.id),
        });
      }
      // Geschrieben wird nur, was die Vorschau als Änderung ausgewiesen hat —
      // eine leere CSV-Spalte darf einen gepflegten Wert nicht löschen. Beim
      // Verknüpfen kommt die Empfänger-ID dazu; der Name bleibt stehen, er hat
      // den Treffer ja erzeugt.
      for (const item of resolved.link) {
        batch.set(
          personsRef(groupId).doc(item.personId),
          {
            blaulichtSmsRecipientId: item.record.id,
            ...fieldsForChanges(item.record, item.changes),
            ...touch,
          },
          { merge: true },
        );
      }
      for (const item of resolved.update) {
        batch.set(
          personsRef(groupId).doc(item.personId),
          { ...fieldsForChanges(item.record, item.changes), ...touch },
          { merge: true },
        );
      }
      for (const personId of resolved.deactivate) {
        batch.set(
          personsRef(groupId).doc(personId),
          { active: false, ...touch },
          { merge: true },
        );
      }
      await batch.commit();
    }

    return {
      success: true,
      created: resolved.create.length,
      linked: resolved.link.length,
      updated: resolved.update.length,
      deactivated: resolved.deactivate.length,
      skipped: resolved.skipped,
    };
  } catch (err) {
    console.error('importPersonsFromCsv failed', err);
    return {
      success: false,
      created: 0,
      linked: 0,
      updated: 0,
      deactivated: 0,
      skipped: 0,
      error: (err as Error).message,
    };
  }
}

export interface InactivePersonsResult {
  success: boolean;
  /**
   * Normalisierter Name → Personen-ID. Enthält auch die schon vorhandenen
   * Personen: Der Aufrufer braucht für jeden gemeldeten Namen eine ID, nicht
   * nur für die neu angelegten.
   */
  personIds: Record<string, string>;
  created: number;
  error?: string;
}

/**
 * Legt für Fahrernamen aus einem Import Personen an — **deaktiviert**.
 *
 * Ein importiertes Fahrtenbuch reicht Jahre zurück und nennt Fahrer, die
 * längst ausgetreten sind. Ohne Person hinge deren Fahrt an einem bloßen
 * Namen und wäre über keine Auswertung mehr zu finden; als aktive Person
 * stünde ein Ausgetretener wieder in jeder Fahrerauswahl. Deaktiviert
 * angelegt trifft beides zu: verknüpfbar, aber nicht mehr auswählbar. Wer noch
 * fährt, wird im Personen-Tab aktiviert.
 *
 * Bereits vorhandene Namen werden nicht angefasst — insbesondere wird eine
 * aktive Person nicht durch einen Import deaktiviert.
 */
export async function createInactivePersons(
  groupId: string,
  names: string[],
): Promise<InactivePersonsResult> {
  try {
    const session = await actionFahrtenbuchManagerRequired(groupId);
    // Server-Action-Argumente sind Client-Eingabe — der Typ ist zur Laufzeit
    // weg, also darf hier nichts als Array vorausgesetzt werden.
    const list = (Array.isArray(names) ? names : []).filter(
      (name): name is string => typeof name === 'string',
    );
    // Ein Firestore-Batch fasst 500 Schreibvorgänge. Mehr Fahrer als das kann
    // ein einzelnes Fahrzeug-Fahrtenbuch nicht plausibel nennen; die Grenze
    // ist der Riegel gegen eine manipulierte Anfrage.
    if (list.length > 400) {
      return { success: false, personIds: {}, created: 0, error: 'tooManyPersons' };
    }

    const plan = planInactivePersons(list, await loadPersons(groupId));
    const personIds = { ...plan.existing };
    if (plan.create.length > 0) {
      const batch = firestore.batch();
      for (const name of plan.create) {
        const ref = personsRef(groupId).doc();
        batch.set(ref, {
          name,
          active: false,
          blaulichtSmsRecipientId: '',
          phone: '',
          email: '',
          note: '',
          ...stamps(session.user.id),
        });
        personIds[normalizePersonName(name)] = ref.id;
      }
      await batch.commit();
    }

    return { success: true, personIds, created: plan.create.length };
  } catch (err) {
    console.error('createInactivePersons failed', err);
    return {
      success: false,
      personIds: {},
      created: 0,
      error: (err as Error).message,
    };
  }
}

/**
 * Speichert das Feuerwehrhaus der Gruppe. Nur für echte Mandanten.
 */
export async function saveFahrtenbuchGroupStandort(
  groupId: string,
  standort: GeoPositionObject | undefined,
): Promise<StammdatenResult> {
  try {
    const session = await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);

    const sanitized = sanitizeStandort(standort);
    // Kein Standort ist erlaubt (Zurücksetzen); ein übergebener, aber
    // ungültiger nicht — den lehnt die Action ab, statt ihn still zu
    // verwerfen.
    if (standort && !sanitized) {
      return { success: false, error: 'standortInvalid' };
    }

    const now = new Date().toISOString();
    await firestore
      .collection(GROUP_COLLECTION_ID)
      .doc(groupId)
      // `merge: true`, damit Name und Beschreibung der Gruppe unberührt
      // bleiben. Bedeutung von `null` hier: siehe `Group.standort`.
      .set(
        { standort: sanitized ?? null, updatedAt: now, updatedBy: session.user.id },
        { merge: true },
      );

    return { success: true, id: groupId };
  } catch (err) {
    console.error('saveFahrtenbuchGroupStandort failed', err);
    return { success: false, error: (err as Error).message };
  }
}

function configRef(groupId: string) {
  return firestore.collection(FAHRTENBUCH_CONFIG_COLLECTION_ID).doc(groupId);
}

export interface MangelEmailsQueryResult {
  success: boolean;
  emails: string[];
  error?: string;
}

/**
 * Die Empfänger der Mangel-Benachrichtigung dieser Gruppe.
 *
 * Nur über diese Action zu bekommen: Die Collection ist für Clients gesperrt,
 * damit nicht jedes Gruppenmitglied die Adresse des Fahrzeugverantwortlichen
 * auslesen kann (siehe `FAHRTENBUCH_CONFIG_COLLECTION_ID`). Ein Snapshot-Hook
 * wie beim Standort ist deshalb kein Weg.
 */
export async function getFahrtenbuchMangelEmails(
  groupId: string,
): Promise<MangelEmailsQueryResult> {
  try {
    await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);

    const doc = await configRef(groupId).get();
    if (!doc.exists) return { success: true, emails: [] };
    const stored = (doc.data() as FahrtenbuchConfig | undefined)?.mangelEmails;
    return {
      success: true,
      // Nur filtern, nicht validieren: Ein Altbestand soll im Formular
      // sichtbar und damit korrigierbar sein, nicht unsichtbar verschwinden.
      emails: Array.isArray(stored)
        ? stored.filter((value): value is string => typeof value === 'string')
        : [],
    };
  } catch (err) {
    console.error('getFahrtenbuchMangelEmails failed', err);
    return { success: false, emails: [], error: (err as Error).message };
  }
}

/**
 * Speichert die Empfänger der Mangel-Benachrichtigung. Eine leere Liste
 * schaltet die Benachrichtigung ab; eine ungültige Adresse wird abgelehnt und
 * nicht still verworfen (siehe `sanitizeMangelEmails`).
 */
export async function saveFahrtenbuchMangelEmails(
  groupId: string,
  emails: string[],
): Promise<StammdatenResult> {
  try {
    const session = await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);

    const { emails: sanitized, error } = sanitizeMangelEmails(emails);
    if (error) return { success: false, error };

    await configRef(groupId).set(
      {
        groupId,
        mangelEmails: sanitized,
        updatedAt: new Date().toISOString(),
        updatedBy: session.user.id,
      },
      // `merge: true`, damit spätere Felder dieses Konfigurationsdokuments von
      // einer Änderung an den Empfängern nicht mitgelöscht werden.
      { merge: true },
    );

    return { success: true, id: groupId };
  } catch (err) {
    console.error('saveFahrtenbuchMangelEmails failed', err);
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Vorschlag, welche Benutzerkonten zu welcher Person gehören — für den
 * Admin-Dialog „Bestehende Benutzer zuordnen".
 *
 * **Admin und nicht Gerätemeister.** Die Antwort führt Namen und
 * E-Mail-Adressen aller Benutzerkonten der App auf, also weit über die Gruppe
 * hinaus. Personen zu pflegen darf der Gerätemeister; einen Verteiler über alle
 * Konten zu sehen ist etwas anderes.
 *
 * Herausgegeben wird nur, was der Dialog zum Entscheiden braucht: Anzeigename,
 * E-Mail und drei Merkmale (gesperrt, freigeschaltet, in der Gruppe). Kein
 * Telefon, keine Tokens, kein Rest des Benutzerdokuments.
 */
export async function proposePersonUserLinks(
  groupId: string,
): Promise<StammdatenResult & { matches?: PersonUserMatch[] }> {
  try {
    await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);

    const [personSnapshot, users] = await Promise.all([
      personsRef(groupId).get(),
      listUsers(),
    ]);
    const persons = personSnapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as FahrtenbuchPerson,
    );
    const candidates: PersonUserCandidate[] = users.map((user) => ({
      uid: user.uid,
      displayName: user.displayName ?? undefined,
      email: user.email ?? undefined,
      disabled: user.disabled === true,
      isAuthorized: (user as { isAuthorized?: boolean }).isAuthorized === true,
      inGroup:
        (user as { groups?: string[] }).groups?.includes(groupId) === true,
    }));

    return { success: true, matches: matchPersonsToUsers(persons, candidates) };
  } catch (err) {
    console.error('proposePersonUserLinks failed', err);
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Speichert die vom Admin bestätigten Zuordnungen.
 *
 * Die Kontenliste je Person wird **gesetzt und nicht ergänzt** — nur so lässt
 * sich eine falsche Zuordnung im Dialog auch wieder wegnehmen. Eine leere Liste
 * ist deshalb das Lösen der Verknüpfung.
 *
 * Zwei Prüfungen, die der Dialog nicht ersetzen kann:
 *
 * - **Jede UID muss ein Konto sein.** Sonst stünde am Personendatensatz eine
 *   Kennung, die niemandem gehört, und irgendwann gehörte sie jemandem.
 * - **Ein Konto gehört höchstens einer Person je Gruppe.** Zwei Personen mit
 *   demselben Konto hieße, dass zwei Fahrer denselben Eintrag ändern dürfen,
 *   und keiner von beiden wäre es sicher.
 */
export async function savePersonUserLinks(
  groupId: string,
  links: PersonUserLink[],
): Promise<StammdatenResult> {
  try {
    const session = await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);

    const knownUids = new Set((await listUsers()).map((user) => user.uid));
    const seen = new Map<string, string>();
    const sanitized = links.map((link) => {
      const userIds = [...new Set(link.userIds.filter((uid) => !!uid))];
      for (const uid of userIds) {
        if (!knownUids.has(uid)) {
          throw new Error(`unknown user account ${uid}`);
        }
        const owner = seen.get(uid);
        if (owner && owner !== link.personId) {
          throw new Error(
            `user account ${uid} is claimed by two persons (${owner}, ${link.personId})`,
          );
        }
        seen.set(uid, link.personId);
      }
      return { personId: link.personId, userIds };
    });

    // Wer nicht im Dialog stand, wird nicht angefasst: Der Aufrufer schickt die
    // Zeilen, die er gesehen hat, und ein Batch über alle Personen würde die
    // Verknüpfungen der übrigen stillschweigend leeren.
    const now = new Date().toISOString();
    const batch = firestore.batch();
    for (const link of sanitized) {
      batch.set(
        personsRef(groupId).doc(link.personId),
        { userIds: link.userIds, updatedAt: now, updatedBy: session.user.id },
        { merge: true },
      );
    }
    await batch.commit();
    return { success: true };
  } catch (err) {
    console.error('savePersonUserLinks failed', err);
    return { success: false, error: (err as Error).message };
  }
}
