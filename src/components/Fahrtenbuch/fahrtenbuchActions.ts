'use server';
import 'server-only';

import type { Group } from '../../app/groups/groupTypes';
import {
  FAHRTENBUCH_COLLECTION_ID,
  FAHRTENBUCH_VEHICLE_COLLECTION_ID,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { autoFillCounterEnds, roundTripKmFromMeters } from '../../common/fahrtenbuchAutoFill';
import { ApiException } from '../../app/api/errors';
import type { GeoPositionObject } from '../../common/geo';
import { SHARE_ACTOR_PREFIX } from '../../common/fahrtenbuchShare';
import { defaultPosition } from '../../hooks/constants';
import { firestore } from '../../server/firebase/admin';
import { resolveFahrtenbuchShareLink } from '../../server/auth/resolveFahrtenbuchShareLink';
import { computeRouteDistanceMeters } from '../actions/maps/routes';
import { FIRECALL_COLLECTION_ID, GROUP_COLLECTION_ID, type Firecall } from '../firebase/firestore';
import { actionGroupMemberRequired } from './authGuards';
import {
  buildEntryDocument,
  canModifyEntry,
  computeVehicleCache,
  survivingCounterSources,
  type FahrtenbuchEntryInput,
} from './entryLogic';
import { cachedRouteDistance, routeCacheEntry } from './firecallRoute';

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
 * Standort der Gruppe (Feuerwehrhaus) als Startpunkt der Einsatzkilometer.
 * Sowohl ein explizit zurückgesetzter (`null`) als auch ein nie gepflegter
 * (fehlendes Feld) Standort landen auf derselben Rückfallebene — siehe
 * `Group.standort`.
 */
async function loadGroupStandort(groupId: string): Promise<GeoPositionObject> {
  const doc = await firestore.collection(GROUP_COLLECTION_ID).doc(groupId).get();
  const standort = (doc.data() as Group | undefined)?.standort;
  return standort ?? defaultPosition;
}

/**
 * Löst die einfache Straßenstrecke vom Standort der Gruppe zum Einsatzort auf
 * und cacht sie am Einsatz-Dokument. Liefert `undefined`, wenn der Einsatz
 * nicht existiert, keiner passenden Gruppe gehört, keine Koordinaten hat oder
 * das Routing ausfällt — in all diesen Fällen bleibt der Kilometer-Endstand
 * dem Benutzer überlassen.
 */
async function resolveFirecallRouteDistance(
  groupId: string,
  firecallId: string,
  standort: GeoPositionObject,
): Promise<number | undefined> {
  const ref = firestore.collection(FIRECALL_COLLECTION_ID).doc(firecallId);
  const doc = await ref.get();
  if (!doc.exists) return undefined;
  const firecall = doc.data() as Firecall;

  // Der Guard der Action prüft nur, ob der Benutzer Mitglied *seiner* Gruppe
  // ist — nicht, welcher Gruppe dieser Einsatz gehört. Ohne diesen Vergleich
  // könnte ein Mitglied von Gruppe A einen Einsatz von Gruppe B lesen und
  // dessen Einsatz-Dokument mit einer fremden Route beschreiben.
  if (firecall.group !== groupId) return undefined;

  if (typeof firecall.lat !== 'number' || typeof firecall.lng !== 'number') {
    return undefined;
  }
  const einsatzort: GeoPositionObject = { lat: firecall.lat, lng: firecall.lng };

  const cached = cachedRouteDistance(firecall.fahrtenbuchRoute, standort, einsatzort);
  if (cached !== undefined) return cached;

  const distanceM = await computeRouteDistanceMeters(standort, einsatzort);
  if (distanceM === undefined) return undefined;

  await ref.set(
    { fahrtenbuchRoute: routeCacheEntry(standort, einsatzort, distanceM) },
    { merge: true },
  );
  return distanceM;
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
  /**
   * Gesamtstrecke in Kilometern, die in die Kilometerstände eingegangen ist.
   * Fehlt, wenn keine Route zu ermitteln war.
   */
  roundTripKm?: number;
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

    // Standort und Routendistanz werden vor der Eintragsschleife je Einsatz
    // genau einmal ermittelt — sonst löste jedes weitere Fahrzeug desselben
    // Einsatzes einen eigenen, redundanten Routing-Aufruf aus.
    const standort = await loadGroupStandort(groupId);
    const distances = new Map<string, number | undefined>();
    for (const firecallId of new Set(
      accepted.map((i) => i.firecallId).filter((id): id is string => !!id),
    )) {
      distances.set(
        firecallId,
        await resolveFirecallRouteDistance(groupId, firecallId, standort),
      );
    }

    const batch = firestore.batch();
    let created = 0;
    let roundTripKm: number | undefined;
    const writtenVehicleIds = new Set<string>();
    for (const input of accepted) {
      const vehicle = vehicles.get(input.vehicleId)!;
      const distanceM = input.firecallId ? distances.get(input.firecallId) : undefined;
      const entryRoundTripKm =
        distanceM !== undefined ? roundTripKmFromMeters(distanceM) : undefined;
      const filled = autoFillCounterEnds(
        vehicle.counters ?? [],
        input.counters ?? {},
        vehicle.lastCounters ?? {},
        entryRoundTripKm,
      );

      try {
        // Wirft, wenn nach dem Auffüllen immer noch ein Pflichtzähler fehlt —
        // meist, weil das Routing ausgefallen ist und niemand den
        // Kilometerstand von Hand nachgetragen hat. Diese Zeile wird
        // übersprungen, statt den ganzen Batch abzubrechen.
        const doc = buildEntryDocument(
          vehicle,
          { ...input, counters: filled.counters },
          groupId,
          actor,
          { counterSources: filled.counterSources, routeDistanceMeters: distanceM },
        );
        batch.set(entriesRef(groupId).doc(), doc);
        created += 1;
        writtenVehicleIds.add(input.vehicleId);
        if (entryRoundTripKm !== undefined) roundTripKm = entryRoundTripKm;
      } catch (err) {
        console.error('createFahrtenbuchEntries: Zeile übersprungen', err, {
          vehicleId: input.vehicleId,
          firecallId: input.firecallId,
        });
        skippedVehicleIds.push(input.vehicleId);
      }
    }

    // Ein leerer Batch darf nicht committet werden, und ein Fahrzeug ohne
    // tatsächlich geschriebenen Eintrag darf seinen Cache nicht neu bekommen.
    if (created > 0) {
      await batch.commit();
      for (const id of writtenVehicleIds) {
        await refreshVehicleCounters(groupId, id);
      }
    }
    return { success: true, created, skippedVehicleIds, roundTripKm };
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
    // `routeDistanceMeters` überlebt eine Bearbeitung immer — die Distanz zum
    // Einsatzort bleibt wahr, egal was jemand am Eintrag ändert. Die Herkunft
    // eines einzelnen Zählers überlebt nur, solange dessen Endstand
    // unverändert bleibt (`survivingCounterSources`) — sonst behauptete eine
    // bloße Korrektur der Hinweise weiterhin einen abgeleiteten Zähler.
    const rebuilt = buildEntryDocument(
      vehicle,
      input,
      groupId,
      {
        userId: existing.createdBy,
        userName: existing.createdByName,
        now: existing.createdAt,
      },
      {
        counterSources: survivingCounterSources(
          existing.counterSources,
          existing.counters,
          input.counters ?? {},
        ),
        routeDistanceMeters: existing.routeDistanceMeters,
      },
    );

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
