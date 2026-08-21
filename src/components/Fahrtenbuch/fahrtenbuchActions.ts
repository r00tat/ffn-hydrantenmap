'use server';
import 'server-only';

import type { Group } from '../../app/groups/groupTypes';
import {
  FAHRTENBUCH_COLLECTION_ID,
  FAHRTENBUCH_VEHICLE_COLLECTION_ID,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import {
  autoFillCounterEnds,
  estimatedDistance,
  routeDistance,
  type RoundTripDistance,
} from '../../common/fahrtenbuchAutoFill';
import { ApiException } from '../../app/api/errors';
import type { GeoPositionObject } from '../../common/geo';
import { SHARE_ACTOR_PREFIX } from '../../common/fahrtenbuchShare';
import { defaultPosition } from '../../hooks/constants';
import { firestore } from '../../server/firebase/admin';
import { resolveFahrtenbuchShareLink } from '../../server/auth/resolveFahrtenbuchShareLink';
import { computeRouteLegsMeters } from '../actions/maps/routes';
import { FIRECALL_COLLECTION_ID, GROUP_COLLECTION_ID, type Firecall } from '../firebase/firestore';
import { actionErrorKey } from './actionErrorKey';
import { actionGroupMemberRequired } from './authGuards';
import {
  buildEntryDocument,
  canModifyEntry,
  survivingCounterSources,
  type FahrtenbuchEntryInput,
} from './entryLogic';
import { cachedRouteLegs, routeCacheEntry } from './firecallRoute';
import { createMangelForEntry, refreshVehicleCache } from './mangelStore';
import { notifyMangel } from './notifyMangel';

export interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
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
 * Löst die Gesamtstrecke vom Standort der Gruppe zum Einsatzort und zurück auf
 * und cacht die gefahrene Route am Einsatz-Dokument.
 *
 * Hin- und Rückweg werden getrennt gemessen; die Begründung steht an
 * `computeRouteLegsMeters`.
 *
 * Fällt das Routing aus, wird auf die Luftlinien-Schätzung zurückgefallen und
 * das Ergebnis als `'estimate'` gekennzeichnet: Ein grober, als grob erkennbarer
 * Kilometerstand ist für den Nachweis mehr wert als eine Fahrt, die gar nicht
 * erfasst wurde. Geschätzte Werte werden **nicht** gecacht — sonst behielte ein
 * einzelner Routing-Ausfall die Schätzung für alle späteren Fahrzeuge desselben
 * Einsatzes bei, obwohl die API längst wieder antwortet.
 *
 * `undefined` bleibt für die Fälle, in denen auch nicht geschätzt werden kann:
 * Der Einsatz existiert nicht, gehört einer anderen Gruppe oder hat keine
 * Koordinaten. Dann bleibt der Kilometer-Endstand dem Benutzer überlassen.
 */
async function resolveFirecallDistance(
  groupId: string,
  firecallId: string,
  standort: GeoPositionObject,
): Promise<RoundTripDistance | undefined> {
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

  const cached = cachedRouteLegs(firecall.fahrtenbuchRoute, standort, einsatzort);
  if (cached) {
    return routeDistance(cached.outboundMeters, cached.returnMeters);
  }

  const legs = await computeRouteLegsMeters(standort, einsatzort);
  if (legs === undefined) {
    console.warn(
      'resolveFirecallDistance: keine Route — es wird geschätzt und nicht gecacht',
      { groupId, firecallId },
    );
    return estimatedDistance(standort, einsatzort);
  }

  await ref.set(
    { fahrtenbuchRoute: routeCacheEntry(standort, einsatzort, legs) },
    { merge: true },
  );
  return routeDistance(legs.outboundMeters, legs.returnMeters);
}

/**
 * Meldet einen mit der Fahrt erfassten Mangel an die Empfänger der Gruppe.
 *
 * Best-effort und bewusst nach dem Schreiben: Die Fahrt steht im Fahrtenbuch,
 * und eine ausgefallene Mail darf sie nicht als gescheitert melden — der
 * Benutzer würde sie sonst ein zweites Mal eintragen. Dieselbe Haltung wie
 * beim Bug-Report; der Fehler steht im Log.
 *
 * Nur beim Anlegen, nicht beim Bearbeiten: Eine Korrektur an einer schon
 * gemeldeten Fahrt soll keine zweite Mail auslösen. Auch nicht beim Import —
 * eine Fahrt von vor zwei Jahren löst keinen Werkstatttermin mehr aus.
 */
async function notifyMangelIfReported(
  groupId: string,
  entry: FahrtenbuchEntry,
  vehicle: FahrtenbuchVehicle,
): Promise<void> {
  if (!entry.defekt) return;
  try {
    await notifyMangel({ groupId, entry, vehicle });
  } catch (err) {
    console.error('Mangel-Benachrichtigung fehlgeschlagen', err, {
      groupId,
      vehicleId: entry.vehicleId,
    });
  }
}

/**
 * Legt zu einer Fahrt mit Defekt den zugehörigen Mangel an — den Vorgang, der
 * ab jetzt seinen eigenen Status, Verlauf und ein Behebungsdatum trägt.
 *
 * Best-effort und nach dem Schreiben, aus demselben Grund wie die Mail: Die
 * Fahrt steht im Fahrtenbuch, und ein fehlgeschlagener Folgeschritt darf sie
 * nicht als gescheitert melden — der Benutzer trüge sie sonst ein zweites Mal
 * ein. Der Fehler steht im Log; der Mangel lässt sich über die Mängelseite von
 * Hand nachtragen.
 *
 * Nur beim Anlegen, nie beim Bearbeiten oder Importieren: Ab der Meldung hat
 * der Mangel sein eigenes Leben, und eine Korrektur an der Fahrt darf einen
 * längst bearbeiteten Mangel weder zurücksetzen noch verdoppeln. Eine Fahrt von
 * vor zwei Jahren löst zudem keine Reparatur mehr aus — dieselbe Haltung wie
 * bei der Mail.
 */
async function createMangelIfReported(
  groupId: string,
  entryId: string,
  entry: FahrtenbuchEntry,
  vehicle: FahrtenbuchVehicle,
  actor: { userId: string; userName: string; now: string },
): Promise<void> {
  if (!entry.defekt) return;
  try {
    await createMangelForEntry({ groupId, entryId, entry, vehicle, actor });
  } catch (err) {
    console.error('Mangel konnte nicht angelegt werden', err, {
      groupId,
      entryId,
      vehicleId: entry.vehicleId,
    });
  }
}

export interface FirecallDistanceResult {
  success: boolean;
  /** Gesamtstrecke (Hin- und Rückweg) in ganzen Kilometern. */
  roundTripKm?: number;
  /**
   * Woher die Strecke stammt. Muss mit: Eine geschätzte Strecke gehört im
   * Fahrtenbuch nachgesehen, eine gefahrene nicht.
   */
  source?: 'route' | 'estimate';
  error?: string;
}

/**
 * Die Gesamtstrecke vom Standort der Gruppe zum Einsatzort und zurück — für den
 * Knopf „Fahrtstrecke berechnen" im Eintrags-Dialog.
 *
 * Die Sammelerfassung holt sich diese Strecke beim Speichern selbst; beim
 * einzelnen Eintrag musste den Kilometerstand bisher jeder von Hand ausrechnen.
 * Derselbe `resolveFirecallDistance`-Pfad, also auch derselbe Routen-Cache am
 * Einsatz — der Knopf kostet ab dem zweiten Fahrzeug keinen API-Aufruf mehr.
 *
 * `noFirecallRoute`, wenn nichts zu ermitteln war: Einsatz einer anderen
 * Gruppe, gelöscht oder ohne Koordinaten.
 */
export async function firecallRoundTripDistance(
  groupId: string,
  firecallId: string,
): Promise<FirecallDistanceResult> {
  try {
    await actionGroupMemberRequired(groupId);
    const standort = await loadGroupStandort(groupId);
    const distance = await resolveFirecallDistance(
      groupId,
      firecallId,
      standort,
    );
    if (!distance) return { success: false, error: 'noFirecallRoute' };
    return {
      success: true,
      roundTripKm: distance.roundTripKm,
      source: distance.source,
    };
  } catch (err) {
    console.error('firecallRoundTripDistance failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

export interface EntryWriteOptions {
  /**
   * Ein als Duplikat erkannter Eintrag wird trotzdem geschrieben.
   *
   * Ohne das Flag lehnt die Action ab. Die Schranke gehört hierher und nicht
   * allein in den Dialog: Zwei Geräte können dieselbe Fahrt gleichzeitig offen
   * haben, und eine doppelt erfasste Fahrt verdoppelt nicht nur die Kilometer,
   * sondern verschiebt über den Zähler-Cache alle folgenden Zählerstände.
   *
   * Bestätigt wird bewusst nicht stillschweigend: Es gibt Einsätze, bei denen
   * ein Fahrzeug tatsächlich zweimal ausfährt.
   */
  confirmDuplicate?: boolean;
}

/** Fahrt eines Einsatzes, so weit der Duplikatscheck sie braucht. */
interface FirecallEntryRef {
  id: string;
  vehicleId: string;
}

/**
 * Die nicht gelöschten Fahrten eines Einsatzes.
 *
 * Gefiltert wird nur über `firecallId` und `deleted` — das Fahrzeug kommt im
 * Speicher dazu. Damit reicht der bestehende Index, und dieselbe Abfrage
 * bedient Duplikatscheck, Sammelerfassung und Zähler am Einsatz.
 */
async function entriesForFirecall(
  groupId: string,
  firecallId: string,
): Promise<FirecallEntryRef[]> {
  const snapshot = await entriesRef(groupId)
    .where('firecallId', '==', firecallId)
    .where('deleted', '==', false)
    .get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    vehicleId: (doc.data() as FahrtenbuchEntry).vehicleId,
  }));
}

/**
 * Ob dieses Fahrzeug zu diesem Einsatz schon eine andere Fahrt hat.
 *
 * `excludeEntryId` ist die bearbeitete Fahrt selbst — ohne sie meldete jede
 * Bearbeitung ihr eigenes Dokument als Duplikat.
 */
async function hasEntryForFirecallVehicle(
  groupId: string,
  firecallId: string,
  vehicleId: string,
  excludeEntryId?: string,
): Promise<boolean> {
  const entries = await entriesForFirecall(groupId, firecallId);
  return entries.some(
    (e) => e.vehicleId === vehicleId && e.id !== excludeEntryId,
  );
}

/**
 * Schreibt die Anzahl erfasster Fahrten an das Einsatz-Dokument.
 *
 * Denormalisiert wie schon der Routen-Cache `fahrtenbuchRoute`, und aus
 * demselben Grund: Die Einsatz-Übersicht zeigt alle Einsätze der Gruppe auf
 * einmal. Eine Abfrage je Karte wären dutzende Listener; ein Feld am Einsatz
 * ist mit den Karten schon geladen. Gezählt wird jedes Mal aus dem Bestand
 * statt hoch- und heruntergezählt — ein Zähler, der driftet, wäre schlimmer
 * als keiner.
 *
 * Nur die Anzahl, keine Fahrzeug- oder Fahrernamen: Das Einsatz-Dokument liest
 * jedes Gruppenmitglied, das Fahrtenbuch nur wer dort Mitglied ist.
 *
 * Ein Fehler bleibt hier: Der Zähler ist eine Anzeigehilfe, die erfasste Fahrt
 * ist der Nachweis. Ein Wurf würde sonst eine geschriebene Fahrt als
 * gescheitert melden.
 */
async function refreshFirecallEntryCount(groupId: string, firecallId: string) {
  try {
    const ref = firestore.collection(FIRECALL_COLLECTION_ID).doc(firecallId);
    const doc = await ref.get();
    if (!doc.exists) return;
    // Wie bei `resolveFirecallDistance`: Der Guard der Action prüft nur die
    // eigene Gruppenmitgliedschaft, nicht wem dieser Einsatz gehört.
    if ((doc.data() as Firecall).group !== groupId) return;
    const entries = await entriesForFirecall(groupId, firecallId);
    await ref.set({ fahrtenbuchEntryCount: entries.length }, { merge: true });
  } catch (err) {
    console.error('refreshFirecallEntryCount failed', err, {
      groupId,
      firecallId,
    });
  }
}

export async function createFahrtenbuchEntry(
  groupId: string,
  input: FahrtenbuchEntryInput,
  options: EntryWriteOptions = {},
): Promise<ActionResult> {
  try {
    const session = await actionGroupMemberRequired(groupId);
    const vehicle = await loadVehicle(groupId, input.vehicleId);

    const actor = {
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? '',
      now: new Date().toISOString(),
    };
    const doc = buildEntryDocument(vehicle, input, groupId, actor);

    // Gegen `doc.firecallId` geprüft, nicht gegen die Eingabe: Ob die
    // Verknüpfung am Dokument landet, entscheidet `buildEntryDocument` über den
    // Zweck. Nur was gespeichert wird, kann ein Duplikat sein.
    if (
      doc.firecallId &&
      !options.confirmDuplicate &&
      (await hasEntryForFirecallVehicle(groupId, doc.firecallId, doc.vehicleId))
    ) {
      return { success: false, error: 'duplicateFirecallEntry' };
    }

    const ref = await entriesRef(groupId).add(doc);
    await refreshVehicleCache(groupId, input.vehicleId);
    if (doc.firecallId) {
      await refreshFirecallEntryCount(groupId, doc.firecallId);
    }
    await createMangelIfReported(groupId, ref.id, doc, vehicle, actor);
    await notifyMangelIfReported(groupId, doc, vehicle);
    return { success: true, id: ref.id };
  } catch (err) {
    console.error('createFahrtenbuchEntry failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

/**
 * Zieht den Fahrtenzähler am Einsatz nach.
 *
 * Für Einsätze aus der Zeit vor dem Zähler: Ihre Fahrten stehen im
 * Fahrtenbuch, das Feld am Einsatz fehlt, und die Übersicht könnte sie nicht
 * als erfasst zeigen. Aufgerufen wird das dort, wo die Fahrten dieses Einsatzes
 * ohnehin geladen sind — auf der Einsatzseite.
 *
 * Die übergebene Anzahl wird bewusst nicht entgegengenommen: Gezählt wird
 * serverseitig aus dem Bestand. Ein Client, der eine Zahl behaupten dürfte,
 * könnte die Übersicht beliebig färben.
 */
export async function syncFirecallEntryCount(
  groupId: string,
  firecallId: string,
): Promise<ActionResult> {
  try {
    await actionGroupMemberRequired(groupId);
    await refreshFirecallEntryCount(groupId, firecallId);
    return { success: true };
  } catch (err) {
    console.error('syncFirecallEntryCount failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

export interface CreateEntriesResult {
  success: boolean;
  created: number;
  /**
   * Fahrzeuge, für die zu diesem Einsatz schon ein Eintrag bestand — sie
   * wurden übersprungen, damit die Oberfläche das melden kann. Ihre Fahrt
   * steht bereits im Fahrtenbuch; es fehlt nichts.
   */
  skippedVehicleIds: string[];
  /**
   * Fahrzeuge, deren Zeile der Server nicht schreiben konnte — meist, weil das
   * Routing ausgefallen ist und damit kein Kilometer-Endstand zu ermitteln
   * war. Abgrenzung zu `skippedVehicleIds`: Dort ist die Fahrt schon erfasst,
   * hier fehlt sie und muss von Hand nachgetragen werden. Die beiden dürfen
   * nicht zusammenfallen — sonst meldete die Oberfläche eine fehlende Fahrt
   * als bereits gebucht.
   */
  failedVehicleIds: string[];
  /**
   * Gesamtstrecke in Kilometern, die in die Kilometerstände eingegangen ist.
   * Fehlt, wenn gar keine Strecke zu ermitteln war (etwa ein Einsatz ohne
   * Koordinaten) oder wenn kein Zähler daraus abgeleitet wurde.
   */
  roundTripKm?: number;
  /**
   * Woher `roundTripKm` stammt. Muss in der Meldung sichtbar werden: Eine
   * geschätzte Strecke gehört im Fahrtenbuch nachgesehen, eine gefahrene nicht.
   */
  distanceSource?: 'route' | 'estimate';
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
  const entries = await entriesForFirecall(groupId, firecallId);
  return new Set(entries.map((entry) => entry.vehicleId));
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
        failedVehicleIds: [],
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
      return {
        success: true,
        created: 0,
        skippedVehicleIds,
        failedVehicleIds: [],
      };
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
    const distances = new Map<string, RoundTripDistance | undefined>();
    for (const firecallId of new Set(
      accepted.map((i) => i.firecallId).filter((id): id is string => !!id),
    )) {
      distances.set(
        firecallId,
        await resolveFirecallDistance(groupId, firecallId, standort),
      );
    }

    const batch = firestore.batch();
    let created = 0;
    let roundTripKm: number | undefined;
    let distanceSource: 'route' | 'estimate' | undefined;
    const failedVehicleIds: string[] = [];
    const writtenVehicleIds = new Set<string>();
    const writtenFirecallIds = new Set<string>();
    for (const input of accepted) {
      const vehicle = vehicles.get(input.vehicleId)!;
      const distance = input.firecallId ? distances.get(input.firecallId) : undefined;
      const filled = autoFillCounterEnds(
        vehicle.counters ?? [],
        input.counters ?? {},
        vehicle.lastCounters ?? {},
        distance,
      );

      try {
        // `countersOptional`: Ein fehlender Zählerstand darf die Fahrt nicht
        // verhindern — der Startstand eines nie erfassten Fahrzeugs ist
        // unbekannt, und dann lässt sich auch kein Endstand ableiten. Der
        // Eintrag entsteht ohne Kilometer und wird von Hand nachgetragen.
        // Widersprüchliche Angaben werfen weiterhin; die Zeile fällt dann aus,
        // ohne den Batch mitzunehmen, und zählt zu den fehlgeschlagenen.
        const doc = buildEntryDocument(
          vehicle,
          { ...input, counters: filled.counters },
          groupId,
          actor,
          {
            derivation: {
              counterSources: filled.counterSources,
              routeOutboundMeters: distance?.outboundMeters,
              routeReturnMeters: distance?.returnMeters,
            },
            countersOptional: true,
          },
        );
        batch.set(entriesRef(groupId).doc(), doc);
        created += 1;
        writtenVehicleIds.add(input.vehicleId);
        if (doc.firecallId) writtenFirecallIds.add(doc.firecallId);
        // Nur melden, wenn die Strecke auch in einen Zählerstand eingegangen
        // ist. Sonst behauptete die Oberfläche „20 km je Fahrzeug", obwohl nur
        // ein Boot gespeichert wurde oder alle Fahrer ihren Endstand selbst
        // eingetippt haben.
        const sources = Object.values(filled.counterSources);
        if (distance && (sources.includes('route') || sources.includes('estimate'))) {
          roundTripKm = distance.roundTripKm;
          distanceSource = distance.source;
        }
      } catch (err) {
        console.error('createFahrtenbuchEntries: Zeile nicht gespeichert', err, {
          vehicleId: input.vehicleId,
          firecallId: input.firecallId,
        });
        failedVehicleIds.push(input.vehicleId);
      }
    }

    // Ein leerer Batch darf nicht committet werden, und ein Fahrzeug ohne
    // tatsächlich geschriebenen Eintrag darf seinen Cache nicht neu bekommen.
    if (created > 0) {
      await batch.commit();
      for (const id of writtenVehicleIds) {
        await refreshVehicleCache(groupId, id);
      }
      for (const id of writtenFirecallIds) {
        await refreshFirecallEntryCount(groupId, id);
      }
    }
    return {
      success: true,
      created,
      skippedVehicleIds,
      failedVehicleIds,
      roundTripKm,
      distanceSource,
    };
  } catch (err) {
    console.error('createFahrtenbuchEntries failed', err);
    return {
      success: false,
      created: 0,
      skippedVehicleIds: [],
      failedVehicleIds: [],
      error: actionErrorKey(err),
    };
  }
}

export interface ImportEntriesResult {
  success: boolean;
  created: number;
  /** Serverseitig als bereits vorhanden erkannt und übersprungen. */
  duplicates: number;
  /** Zeilen, die die Validierung nicht bestanden haben. */
  failed: number;
  error?: string;
}

/**
 * Kalendertag der Abfahrt in der Zeitzone des laufenden Prozesses.
 *
 * Die Vorschau in `fahrtenbuchImportPlan` bildet denselben Schlüssel im
 * Browser und damit in der Zeitzone des Benutzers, dieser Code auf dem Server
 * und damit meist in UTC — dieselbe Fahrt kann beiden Seiten also auf
 * verschiedene Tage fallen. Jede Seite bleibt für sich stimmig, weil Bestand
 * und Eingabe jeweils durch dieselbe Funktion laufen; und weil zusätzlich der
 * Start-Kilometerstand übereinstimmen muss, ist eine Fehlzuordnung praktisch
 * ausgeschlossen. Beim Verschieben der Regel auf einen absoluten Zeitpunkt
 * müssen beide Seiten gemeinsam wandern.
 */
function localDayKey(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Der Kilometerzähler des Fahrzeugs — die Einheit entscheidet, nicht die ID. */
function kmCounterId(vehicle: FahrtenbuchVehicle | undefined): string | undefined {
  const counters = vehicle?.counters ?? [];
  return (
    counters.find((c) => c.unit === 'km')?.id ??
    counters.find((c) => c.id === 'km')?.id
  );
}

/**
 * Der Dublettenschlüssel einer Fahrt: Fahrzeug, Kalendertag der Abfahrt und
 * Start-Kilometerstand.
 *
 * Ohne Startstand gibt es keinen Schlüssel und damit keine Dublettenprüfung —
 * `vehicleId|Tag|''` fasste sonst alle Fahrten eines Anhängers oder Bootes an
 * einem Tag zu einer einzigen zusammen, und jede weitere fiele stillschweigend
 * weg. Von den beiden Fehlern ist das der schlechtere: Eine doppelt erfasste
 * Fahrt steht im Fahrtenbuch und lässt sich löschen, eine nie geschriebene
 * fehlt unbemerkt.
 */
function dedupKey(
  vehicleId: string,
  abfahrt: string,
  start: number | undefined,
): string | undefined {
  return start === undefined
    ? undefined
    : `${vehicleId}|${localDayKey(abfahrt)}|${start}`;
}

/**
 * Übernimmt Fahrten aus einem importierten Fahrtenbuch.
 *
 * Bewusst getrennt von `createFahrtenbuchEntries`: deren Dedup hängt an
 * `firecallId`, den importierte Zeilen nicht haben, und deren
 * `autoFillCounterEnds` würde einen fehlenden Endstand aus einer Routendistanz
 * errechnen. Bei einer Fahrt von vor zwei Jahren wäre das eine erfundene
 * Angabe in einem Nachweisdokument. Hier wird nichts aufgefüllt — was nicht
 * vollständig ist, fällt aus und wird gezählt.
 */
export async function importFahrtenbuchEntries(
  groupId: string,
  inputs: FahrtenbuchEntryInput[],
): Promise<ImportEntriesResult> {
  try {
    const session = await actionGroupMemberRequired(groupId);
    if (inputs.length > 1000) {
      return {
        success: false,
        created: 0,
        duplicates: 0,
        failed: 0,
        error: 'tooManyEntries',
      };
    }
    if (inputs.length === 0) {
      return { success: true, created: 0, duplicates: 0, failed: 0 };
    }

    const now = new Date().toISOString();
    const actor = {
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? '',
      now,
    };

    const vehicleIds = [...new Set(inputs.map((i) => i.vehicleId))];
    const vehicles = new Map<string, FahrtenbuchVehicle>();
    for (const id of vehicleIds) {
      vehicles.set(id, await loadVehicle(groupId, id));
    }

    // Bestand je Fahrzeug einmal laden. Der Riegel gegen einen Doppelklick
    // und gegen einen zweiten Lauf derselben Datei — die Vorschau prüft
    // dasselbe, ist aber nur ein Vorschlag des Clients.
    const taken = new Set<string>();
    for (const id of vehicleIds) {
      const snapshot = await entriesRef(groupId)
        .where('vehicleId', '==', id)
        .where('deleted', '==', false)
        .get();
      const kmId = kmCounterId(vehicles.get(id));
      for (const doc of snapshot.docs) {
        const entry = doc.data() as FahrtenbuchEntry;
        const start = kmId ? entry.counters?.[kmId]?.start : undefined;
        const key = dedupKey(id, entry.abfahrt, start);
        if (key) taken.add(key);
      }
    }

    let created = 0;
    let duplicates = 0;
    let failed = 0;
    const written = new Set<string>();
    // Ein Firestore-Batch fasst 500 Schreibvorgänge; 200 lässt Luft.
    const CHUNK = 200;

    for (let offset = 0; offset < inputs.length; offset += CHUNK) {
      const batch = firestore.batch();
      let inBatch = 0;
      // Fahrzeuge und Dublettenschlüssel dieses Blocks getrennt sammeln: Beide
      // gelten erst, wenn der Block auch committet ist.
      const blockVehicleIds = new Set<string>();
      const blockKeys: string[] = [];
      for (const input of inputs.slice(offset, offset + CHUNK)) {
        const vehicle = vehicles.get(input.vehicleId);
        const kmId = kmCounterId(vehicle);
        const start = kmId ? input.counters?.[kmId]?.start : undefined;
        // Ohne Startstand gibt es keinen Schlüssel — die Zeile läuft dann
        // immer in den Schreibpfad (siehe `dedupKey`).
        const key = dedupKey(input.vehicleId, input.abfahrt, start);
        if (key && taken.has(key)) {
          duplicates += 1;
          continue;
        }
        // Auch innerhalb desselben Aufrufs: dieselbe Zeile darf nicht zweimal
        // durchkommen, wenn die Datei sie doppelt enthält.
        if (key) {
          taken.add(key);
          blockKeys.push(key);
        }

        try {
          // Ohne `derivation`: importierte Stände sind abgelesen, nicht
          // abgeleitet. Wirft bei einer unvollständigen Zeile — die fällt
          // aus, statt aufgefüllt zu werden.
          const doc = buildEntryDocument(vehicle!, input, groupId, actor);
          batch.set(entriesRef(groupId).doc(), doc);
          inBatch += 1;
          blockVehicleIds.add(input.vehicleId);
        } catch (err) {
          console.error('importFahrtenbuchEntries: Zeile nicht gespeichert', err, {
            vehicleId: input.vehicleId,
            abfahrt: input.abfahrt,
          });
          failed += 1;
          // Der eben belegte Schlüssel wird wieder frei: Diese Fahrt steht
          // nicht im Fahrtenbuch, eine zweite Kopie derselben Zeile ist keine
          // Dublette, sondern scheitert für sich.
          if (key) taken.delete(key);
        }
      }
      if (inBatch === 0) continue;

      try {
        await batch.commit();
        created += inBatch;
        for (const id of blockVehicleIds) written.add(id);
      } catch (err) {
        // Ein gescheiterter Block darf die folgenden nicht aufhalten und die
        // schon geschriebenen nicht entwerten — dieselbe Haltung wie bei der
        // einzelnen Zeile: Was durchgeht, geht durch; was scheitert, wird
        // gezählt und gemeldet. Ohne das meldete ein Fehler im zweiten Block
        // „nichts importiert", der Benutzer startete den Import neu, und jede
        // Zeile ohne Startkilometerstand — die einzige, die kein Dublettenriegel
        // schützt — stünde danach doppelt im Fahrtenbuch.
        console.error('importFahrtenbuchEntries: Block nicht gespeichert', err, {
          offset,
          count: inBatch,
        });
        failed += inBatch;
        // Die Schlüssel dieses Blocks wieder freigeben: Nichts davon steht im
        // Fahrtenbuch, eine spätere Kopie derselben Zeile soll ihre Chance
        // behalten.
        for (const key of blockKeys) taken.delete(key);
      }
    }

    // Erst am Ende, sonst schriebe jeder Block den Cache neu. Ein Fehler hier
    // darf den Import nicht als gescheitert melden: Die Fahrten stehen bereits
    // im Fahrtenbuch, der Cache ist ein abgeleiteter Wert und wird von der
    // nächsten Fahrt ohnehin neu geschrieben.
    for (const id of written) {
      try {
        await refreshVehicleCache(groupId, id);
      } catch (err) {
        console.error('importFahrtenbuchEntries: Fahrzeug-Cache nicht aufgefrischt', err, {
          vehicleId: id,
        });
      }
    }
    return { success: true, created, duplicates, failed };
  } catch (err) {
    console.error('importFahrtenbuchEntries failed', err);
    return {
      success: false,
      created: 0,
      duplicates: 0,
      failed: 0,
      error: actionErrorKey(err),
    };
  }
}

export async function updateFahrtenbuchEntry(
  groupId: string,
  entryId: string,
  input: FahrtenbuchEntryInput,
  options: EntryWriteOptions = {},
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
    // Die gemessenen Wegstrecken überleben eine Bearbeitung immer — die
    // Entfernung zum Einsatzort bleibt wahr, egal was jemand am Eintrag ändert.
    // Das alte `routeDistanceMeters` wird mitgeführt, damit ein Eintrag aus der
    // Zeit vor der getrennten Messung seinen Nachweis nicht durch eine
    // Bearbeitung verliert. Die Herkunft eines einzelnen Zählers überlebt nur,
    // solange dessen Endstand unverändert bleibt (`survivingCounterSources`) —
    // sonst behauptete eine bloße Korrektur der Hinweise weiterhin einen
    // abgeleiteten Zähler.
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
        derivation: {
          counterSources: survivingCounterSources(
            existing.counterSources,
            existing.counters,
            input.counters ?? {},
          ),
          routeOutboundMeters: existing.routeOutboundMeters,
          routeReturnMeters: existing.routeReturnMeters,
          routeDistanceMeters: existing.routeDistanceMeters,
        },
      },
    );

    // Eine Bearbeitung kann eine Fahrt in eine schon belegte
    // Einsatz/Fahrzeug-Kombination hineinschieben — auch das ist ein Duplikat.
    if (
      rebuilt.firecallId &&
      !options.confirmDuplicate &&
      (await hasEntryForFirecallVehicle(
        groupId,
        rebuilt.firecallId,
        rebuilt.vehicleId,
        entryId,
      ))
    ) {
      return { success: false, error: 'duplicateFirecallEntry' };
    }

    await entriesRef(groupId)
      .doc(entryId)
      .set(
        { ...rebuilt, updatedAt: now, updatedBy: session.user.id },
        { merge: false },
      );

    await refreshVehicleCache(groupId, input.vehicleId);
    if (existing.vehicleId !== input.vehicleId) {
      await refreshVehicleCache(groupId, existing.vehicleId);
    }
    // Beide Einsätze: Wird die Verknüpfung umgehängt oder entfernt, ist auch
    // der Zähler des vorigen Einsatzes falsch geworden.
    for (const firecallId of new Set(
      [existing.firecallId, rebuilt.firecallId].filter(
        (id): id is string => !!id,
      ),
    )) {
      await refreshFirecallEntryCount(groupId, firecallId);
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
    await refreshVehicleCache(groupId, existing.vehicleId);
    if (existing.firecallId) {
      await refreshFirecallEntryCount(groupId, existing.firecallId);
    }
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

    // Kein Benutzer dahinter: Das Präfix macht die Herkunft im Eintrag
    // sichtbar und sperrt gleichzeitig `canModifyEntry` für alle außer
    // Admins. Dahinter steht die nicht geheime `linkId` und nicht der
    // Token — Einträge sind für jedes Gruppenmitglied lesbar, und wer die
    // Gruppe verlässt, behielte sonst einen dauerhaften Schreibkanal.
    const actor = {
      userId: `${SHARE_ACTOR_PREFIX}${link.linkId}`,
      userName: input.driverName?.trim() ?? '',
      now: new Date().toISOString(),
    };

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
      actor,
    );

    const ref = await entriesRef(link.groupId).add(doc);
    await refreshVehicleCache(link.groupId, input.vehicleId);
    // Auch über den Freigabelink: Wer den QR-Code am Fahrzeug nutzt, ist meist
    // genau die Person, die den Mangel bemerkt hat. Die Mail weist die Herkunft
    // aus (siehe `buildMangelEmail`), damit die Empfängerin weiß, dass hinter
    // dem Namen kein angemeldetes Mitglied steht.
    await createMangelIfReported(link.groupId, ref.id, doc, vehicle, actor);
    await notifyMangelIfReported(link.groupId, doc, vehicle);
    return { success: true, id: ref.id };
  } catch (err) {
    console.error('createFahrtenbuchEntryViaShareLink failed', err);
    return { success: false, error: shareErrorKey(err) };
  }
}
