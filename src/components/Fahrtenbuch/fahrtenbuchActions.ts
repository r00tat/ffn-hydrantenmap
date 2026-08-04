'use server';
import 'server-only';

import {
  FAHRTENBUCH_COLLECTION_ID,
  FAHRTENBUCH_VEHICLE_COLLECTION_ID,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { ApiException } from '../../app/api/errors';
import { SHARE_ACTOR_PREFIX } from '../../common/fahrtenbuchShare';
import { firestore } from '../../server/firebase/admin';
import { resolveFahrtenbuchShareLink } from '../../server/auth/resolveFahrtenbuchShareLink';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import { actionGroupMemberRequired } from './authGuards';
import {
  buildEntryDocument,
  canModifyEntry,
  computeVehicleCache,
  type FahrtenbuchEntryInput,
} from './entryLogic';

export interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

/**
 * Übersetzt eine geworfene Ausnahme in einen Fehlerschlüssel unter
 * `fahrtenbuch.errors`. Ohne diese Zuordnung landete der englische Text der
 * `ApiException` ("user is not a member of group ffnd") ungefiltert in der
 * deutschen Oberfläche. Der Originalfehler bleibt im Serverlog.
 */
function actionErrorKey(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (
    /not a member of group/.test(message) ||
    /is not a valid Fahrtenbuch group/.test(message)
  ) {
    return 'notInGroup';
  }
  // `actionUserRequired` wirft bei fehlender Anmeldung oder entzogener
  // Freigabe eine übersetzte Meldung — der Status ist das verlässliche Signal.
  if (err instanceof ApiException && (err.status === 401 || err.status === 403)) {
    return 'notLoggedIn';
  }
  return message;
}

/**
 * Fehlerschlüssel für den anmeldefreien Share-Pfad — eine geschlossene Menge.
 *
 * `actionErrorKey` gibt Unbekanntes als `err.message` zurück, und die
 * Oberfläche rendert unbekannte Schlüssel wörtlich über `errors.saveFailed`.
 * Am angemeldeten Pfad ist das gewollt (sprechende Meldungen für Mitglieder),
 * gegenüber einem anonymen Besucher ist es ein Leck: `vehicle v9 not found in
 * group ffnd` bestätigt die Gruppen-ID und verrät, welche Fahrzeug-IDs
 * existieren — ein Enumerationsorakel. Deshalb hier eine eigene Zuordnung, die
 * nur diese vier Schlüssel kennt und nie einen Detailtext durchreicht. Der
 * Originalfehler steht im `console.error` des Aufrufers.
 */
function shareErrorKey(err: unknown): string {
  if (err instanceof ApiException && err.status === 404) return 'linkInvalid';
  const message = err instanceof Error ? err.message : String(err);
  if (/^vehicle .* not found in group /.test(message)) return 'vehicleNotFound';
  if (/^invalid fahrtenbuch entry: /.test(message)) return 'invalidEntry';
  return 'shareSaveFailed';
}

function entriesRef(groupId: string) {
  return firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(FAHRTENBUCH_COLLECTION_ID);
}

function vehicleRef(groupId: string, vehicleId: string) {
  return firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(FAHRTENBUCH_VEHICLE_COLLECTION_ID)
    .doc(vehicleId);
}

async function loadVehicle(
  groupId: string,
  vehicleId: string,
): Promise<FahrtenbuchVehicle> {
  const doc = await vehicleRef(groupId, vehicleId).get();
  if (!doc.exists) {
    throw new Error(`vehicle ${vehicleId} not found in group ${groupId}`);
  }
  return { id: doc.id, ...doc.data() } as FahrtenbuchVehicle;
}

/**
 * Schreibt den Cache der jüngsten Fahrt am Fahrzeug neu — Zählerstände,
 * Zeitpunkt, Fahrer und Defekt-Hinweis. Wird nach jedem Create, Update und
 * Delete aufgerufen, damit der Cache nicht driftet.
 *
 * Fahrer und Defekt-Hinweis gehören hierher und nicht in die Übersichtsseite:
 * die lädt nur ein Fenster der jüngsten Fahrten der Gruppe und könnte den
 * sicherheitsrelevanten Defekt-Hinweis eines lange nicht bewegten Fahrzeugs
 * sonst stillschweigend verlieren.
 */
async function refreshVehicleCounters(groupId: string, vehicleId: string) {
  const snapshot = await entriesRef(groupId)
    .where('vehicleId', '==', vehicleId)
    .where('deleted', '==', false)
    .orderBy('abfahrt', 'desc')
    .limit(1)
    .get();

  const latest = snapshot.docs[0]?.data() as FahrtenbuchEntry | undefined;
  await vehicleRef(groupId, vehicleId).set(computeVehicleCache(latest), {
    merge: true,
  });
}

export async function createFahrtenbuchEntry(
  groupId: string,
  input: FahrtenbuchEntryInput,
): Promise<ActionResult> {
  try {
    const session = await actionGroupMemberRequired(groupId);
    const vehicle = await loadVehicle(groupId, input.vehicleId);

    const doc = buildEntryDocument(vehicle, input, groupId, {
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? '',
      now: new Date().toISOString(),
    });

    const ref = await entriesRef(groupId).add(doc);
    await refreshVehicleCounters(groupId, input.vehicleId);
    return { success: true, id: ref.id };
  } catch (err) {
    console.error('createFahrtenbuchEntry failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

export interface CreateEntriesResult {
  success: boolean;
  created: number;
  /**
   * Fahrzeuge, für die zu diesem Einsatz schon ein Eintrag bestand — sie
   * wurden übersprungen, damit die Oberfläche das melden kann.
   */
  skippedVehicleIds: string[];
  error?: string;
}

/**
 * Fahrzeuge, die zu diesem Einsatz bereits einen (nicht gelöschten) Eintrag
 * haben. Der Client prüft dasselbe über seinen Snapshot; das hier ist der
 * Riegel gegen zwei Geräte, die die Sammelerfassung gleichzeitig offen haben.
 */
async function vehiclesWithEntryForFirecall(
  groupId: string,
  firecallId: string,
): Promise<Set<string>> {
  const snapshot = await entriesRef(groupId)
    .where('firecallId', '==', firecallId)
    .where('deleted', '==', false)
    .get();
  return new Set(
    snapshot.docs.map((doc) => (doc.data() as FahrtenbuchEntry).vehicleId),
  );
}

/** Legt mehrere Einträge an — die Sammelerfassung im Einsatz. */
export async function createFahrtenbuchEntries(
  groupId: string,
  inputs: FahrtenbuchEntryInput[],
): Promise<CreateEntriesResult> {
  try {
    const session = await actionGroupMemberRequired(groupId);
    // Ein Firestore-Batch fasst maximal 500 Schreibvorgänge; 400 lässt Luft.
    if (inputs.length > 400) {
      return {
        success: false,
        created: 0,
        skippedVehicleIds: [],
        error: 'tooManyEntries',
      };
    }
    const now = new Date().toISOString();
    const actor = {
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? '',
      now,
    };

    // Je Einsatz einmal nachsehen, welche Fahrzeuge schon erfasst sind.
    const taken = new Map<string, Set<string>>();
    for (const firecallId of new Set(
      inputs.map((i) => i.firecallId).filter((id): id is string => !!id),
    )) {
      taken.set(
        firecallId,
        await vehiclesWithEntryForFirecall(groupId, firecallId),
      );
    }

    const accepted: FahrtenbuchEntryInput[] = [];
    const skippedVehicleIds: string[] = [];
    for (const input of inputs) {
      const covered = input.firecallId ? taken.get(input.firecallId) : undefined;
      if (covered?.has(input.vehicleId)) {
        skippedVehicleIds.push(input.vehicleId);
        continue;
      }
      // Auch innerhalb desselben Aufrufs darf ein Fahrzeug nur einmal
      // vorkommen — zwei Zeilen können auf dasselbe Fahrzeug zeigen.
      covered?.add(input.vehicleId);
      accepted.push(input);
    }

    if (accepted.length === 0) {
      return { success: true, created: 0, skippedVehicleIds };
    }

    const vehicleIds = [...new Set(accepted.map((i) => i.vehicleId))];
    const vehicles = new Map<string, FahrtenbuchVehicle>();
    for (const id of vehicleIds) {
      vehicles.set(id, await loadVehicle(groupId, id));
    }

    const batch = firestore.batch();
    for (const input of accepted) {
      const vehicle = vehicles.get(input.vehicleId)!;
      const doc = buildEntryDocument(vehicle, input, groupId, actor);
      batch.set(entriesRef(groupId).doc(), doc);
    }
    await batch.commit();

    for (const id of vehicleIds) {
      await refreshVehicleCounters(groupId, id);
    }
    return { success: true, created: accepted.length, skippedVehicleIds };
  } catch (err) {
    console.error('createFahrtenbuchEntries failed', err);
    return {
      success: false,
      created: 0,
      skippedVehicleIds: [],
      error: actionErrorKey(err),
    };
  }
}

export async function updateFahrtenbuchEntry(
  groupId: string,
  entryId: string,
  input: FahrtenbuchEntryInput,
): Promise<ActionResult> {
  try {
    const session = await actionGroupMemberRequired(groupId);
    const existingDoc = await entriesRef(groupId).doc(entryId).get();
    if (!existingDoc.exists) {
      return { success: false, error: 'entry not found' };
    }
    const existing = existingDoc.data() as FahrtenbuchEntry;
    // Der Neuaufbau setzt immer `deleted: false` und schreibt mit merge:false —
    // eine Bearbeitung darf einen gelöschten Eintrag nicht stillschweigend
    // wiederherstellen.
    if (existing.deleted) {
      return { success: false, error: 'entryDeleted' };
    }
    if (!canModifyEntry(existing, session.user.id, session.user.isAdmin)) {
      return { success: false, error: 'notAllowed' };
    }

    const vehicle = await loadVehicle(groupId, input.vehicleId);
    const now = new Date().toISOString();
    // Ohne fünftes Argument verliert eine Bearbeitung derzeit die Herkunft
    // abgeleiteter Zählerstände: `routeDistanceMeters` soll eine Bearbeitung
    // immer überleben (die Distanz zum Einsatzort bleibt wahr), die Herkunft
    // eines einzelnen Zählers nur, solange dessen Endstand unverändert
    // bleibt. Die Übernahme dieser Werte aus `existing` steht noch aus.
    const rebuilt = buildEntryDocument(vehicle, input, groupId, {
      userId: existing.createdBy,
      userName: existing.createdByName,
      now: existing.createdAt,
    });

    await entriesRef(groupId)
      .doc(entryId)
      .set(
        { ...rebuilt, updatedAt: now, updatedBy: session.user.id },
        { merge: false },
      );

    await refreshVehicleCounters(groupId, input.vehicleId);
    if (existing.vehicleId !== input.vehicleId) {
      await refreshVehicleCounters(groupId, existing.vehicleId);
    }
    return { success: true, id: entryId };
  } catch (err) {
    console.error('updateFahrtenbuchEntry failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

/** Soft-Delete — ein Fahrtenbuch ist ein Nachweisdokument. */
export async function deleteFahrtenbuchEntry(
  groupId: string,
  entryId: string,
): Promise<ActionResult> {
  try {
    const session = await actionGroupMemberRequired(groupId);
    const existingDoc = await entriesRef(groupId).doc(entryId).get();
    if (!existingDoc.exists) {
      return { success: false, error: 'entry not found' };
    }
    const existing = existingDoc.data() as FahrtenbuchEntry;
    // Ein zweites Löschen würde nur `updatedAt`/`updatedBy` überschreiben und
    // damit die Löschspur auf den zweiten Benutzer umschreiben.
    if (existing.deleted) {
      return { success: false, error: 'entryDeleted' };
    }
    if (!canModifyEntry(existing, session.user.id, session.user.isAdmin)) {
      return { success: false, error: 'notAllowed' };
    }

    await entriesRef(groupId).doc(entryId).update({
      deleted: true,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.id,
    });
    await refreshVehicleCounters(groupId, existing.vehicleId);
    return { success: true, id: entryId };
  } catch (err) {
    console.error('deleteFahrtenbuchEntry failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

/**
 * Erfassung über einen geteilten Link — ohne Anmeldung. Der Token ersetzt die
 * Sitzung; alles danach ist derselbe Pfad wie bei `createFahrtenbuchEntry`,
 * damit Validierung, Zählerlogik und Fahrzeug-Cache nicht auseinanderlaufen.
 */
export async function createFahrtenbuchEntryViaShareLink(
  token: string,
  input: FahrtenbuchEntryInput,
): Promise<ActionResult> {
  try {
    const link = await resolveFahrtenbuchShareLink(token);
    const vehicle = await loadVehicle(link.groupId, input.vehicleId);

    const doc = buildEntryDocument(
      vehicle,
      {
        ...input,
        // Die Gastseite lädt keine Einsätze. Ein mitgeschickter Einsatzbezug
        // wäre untergeschoben, also wird er hier verworfen und nicht bloß
        // clientseitig weggelassen.
        firecallId: undefined,
        firecallName: undefined,
      },
      link.groupId,
      {
        // Kein Benutzer dahinter: Das Präfix macht die Herkunft im Eintrag
        // sichtbar und sperrt gleichzeitig `canModifyEntry` für alle außer
        // Admins. Dahinter steht die nicht geheime `linkId` und nicht der
        // Token — Einträge sind für jedes Gruppenmitglied lesbar, und wer die
        // Gruppe verlässt, behielte sonst einen dauerhaften Schreibkanal.
        userId: `${SHARE_ACTOR_PREFIX}${link.linkId}`,
        userName: input.driverName?.trim() ?? '',
        now: new Date().toISOString(),
      },
    );

    const ref = await entriesRef(link.groupId).add(doc);
    await refreshVehicleCounters(link.groupId, input.vehicleId);
    return { success: true, id: ref.id };
  } catch (err) {
    console.error('createFahrtenbuchEntryViaShareLink failed', err);
    return { success: false, error: shareErrorKey(err) };
  }
}
