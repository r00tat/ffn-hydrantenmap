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
import {
  KOSTENERSATZ_VEHICLES_COLLECTION,
  type KostenersatzVehicle,
} from '../../common/kostenersatz';
import {
  fetchBlaulichtSmsRecipients,
  type BlaulichtSmsRecipientRecord,
} from '../../server/blaulichtsms/fetchRecipients';
import { firestore } from '../../server/firebase/admin';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import { assertFahrtenbuchGroup } from './authGuards';
import {
  planPersonSync,
  planVehicleImport,
  resolveVehicleImportSelection,
  sanitizeCounterDefinitions,
  sanitizeFuelTypes,
  sanitizeSortOrder,
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
    'name' | 'active' | 'blaulichtSmsRecipientId' | 'note'
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

/** Empfängerliste für das Autocomplete im Personen-Dialog. */
export async function listBlaulichtSmsRecipients(groupId: string): Promise<{
  success: boolean;
  recipients: BlaulichtSmsRecipientRecord[];
  error?: string;
}> {
  try {
    await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);
    return { success: true, recipients: await fetchBlaulichtSmsRecipients(groupId) };
  } catch (err) {
    console.error('listBlaulichtSmsRecipients failed', err);
    return { success: false, recipients: [], error: (err as Error).message };
  }
}

export async function syncPersonsFromBlaulichtSms(groupId: string): Promise<{
  success: boolean;
  created: number;
  linked: number;
  ambiguous: { blaulichtSmsRecipientId: string; name: string }[];
  error?: string;
}> {
  try {
    const session = await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);
    const [recipients, existing] = await Promise.all([
      fetchBlaulichtSmsRecipients(groupId),
      loadPersons(groupId),
    ]);
    const plan = planPersonSync(recipients, existing);

    if (plan.create.length > 0 || plan.link.length > 0) {
      const batch = firestore.batch();
      for (const item of plan.create) {
        batch.set(personsRef(groupId).doc(), {
          name: item.name,
          active: true,
          blaulichtSmsRecipientId: item.blaulichtSmsRecipientId,
          note: '',
          ...stamps(session.user.id),
        });
      }
      const now = new Date().toISOString();
      for (const item of plan.link) {
        batch.set(
          personsRef(groupId).doc(item.personId),
          {
            blaulichtSmsRecipientId: item.blaulichtSmsRecipientId,
            updatedAt: now,
            updatedBy: session.user.id,
          },
          { merge: true },
        );
      }
      await batch.commit();
    }

    return {
      success: true,
      created: plan.create.length,
      linked: plan.link.length,
      ambiguous: plan.ambiguous,
    };
  } catch (err) {
    console.error('syncPersonsFromBlaulichtSms failed', err);
    return {
      success: false,
      created: 0,
      linked: 0,
      ambiguous: [],
      error: (err as Error).message,
    };
  }
}
