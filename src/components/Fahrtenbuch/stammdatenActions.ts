'use server';
import 'server-only';

import { actionAdminRequired } from '../../app/auth';
import {
  FAHRTENBUCH_PERSON_COLLECTION_ID,
  FAHRTENBUCH_VEHICLE_COLLECTION_ID,
  VEHICLE_PRESETS,
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
import { firestore } from '../../server/firebase/admin';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import { assertFahrtenbuchGroup } from './authGuards';
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
    const session = await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);
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
    await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);
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
    const session = await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);
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
    await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);
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
    await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);
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
    const session = await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);
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
    await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);
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
    const session = await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);
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

/**
 * Speichert das Feuerwehrhaus der Gruppe. Wie die übrigen Stammdaten-Actions
 * nur für Admins, und nur für echte Mandanten.
 */
export async function saveFahrtenbuchGroupStandort(
  groupId: string,
  standort: GeoPositionObject | undefined,
): Promise<StammdatenResult> {
  try {
    await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);

    const sanitized = sanitizeStandort(standort);
    if (standort && !sanitized) {
      return { success: false, error: 'standortInvalid' };
    }

    await firestore
      .collection(GROUP_COLLECTION_ID)
      .doc(groupId)
      // `merge: true`, damit Name und Beschreibung der Gruppe unberührt bleiben.
      // `null` löscht den Standort, `undefined` würde das Feld stehen lassen.
      .set({ standort: sanitized ?? null }, { merge: true });

    return { success: true, id: groupId };
  } catch (err) {
    console.error('saveFahrtenbuchGroupStandort failed', err);
    return { success: false, error: (err as Error).message };
  }
}
