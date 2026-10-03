'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  ATEMSCHUTZ_AUSGABE_COLLECTION_ID,
  ATEMSCHUTZ_GERAET_COLLECTION_ID,
  ATEMSCHUTZ_TRUPP_COLLECTION_ID,
} from '../common/atemschutz';
import {
  FAHRTENBUCH_PERSON_COLLECTION_ID,
  FAHRTENBUCH_VEHICLE_COLLECTION_ID,
} from '../common/fahrtenbuch';
import {
  GROUP_CONFIG_COLLECTION_ID,
  GROUP_STAMMDATEN_DOC,
} from '../common/groupStammdaten';
import { FIRECALL_MAP_LAYERS_COLLECTION_ID } from '../common/mapLayers';
import { queryClusters } from '../components/firebase/clusterQuery';
import { firestore } from '../components/firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_CREW_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FIRECALL_LAYERS_COLLECTION_ID,
  FIRECALL_LOCATIONS_COLLECTION_ID,
  GROUP_COLLECTION_ID,
} from '../components/firebase/firestore';

/**
 * Den Firestore-Cache für den Offline-Fall vorwärmen.
 *
 * Der persistente Cache (`persistentLocalCache`) beantwortet offline jede
 * Abfrage — aber nur mit Dokumenten, die schon einmal geladen wurden. Wer den
 * Einsatz öffnet und dann ohne Netz auf die Atemschutz-Seite wechselt, sähe
 * dort sonst eine leere Liste statt der Trupps. Deshalb wird beim Öffnen eines
 * Einsatzes alles, was die Einsatzseiten brauchen, **einmal** vom Server
 * gelesen.
 *
 * Bewusst ganze Untersammlungen ohne Filter: Offline wertet das SDK jede
 * Abfrage lokal gegen die Dokumente im Cache aus. Es genügt also, dass die
 * Dokumente dort liegen — die Abfragen der Seiten selbst müssen nicht
 * wörtlich vorweggenommen werden.
 *
 * Einmalige `getDocs`/`getDoc`, keine Listener: Sie legen die Dokumente in
 * den Cache und stören bestehende `onSnapshot`-Listener nicht. Jede Abfrage
 * steht für sich; eine verweigerte (Fahrtenbuch-Sammlungen liest nur, wer
 * dort Mitglied ist) bricht die anderen nicht ab.
 */

export interface WarmupResult {
  ok: string[];
  failed: string[];
}

/** Einsätze der letzten Wochen, die in die Einsatzliste vorgewärmt werden. */
export const WARMUP_FIRECALL_LIST_DAYS = 28;

/** Umkreis der vorgewärmten Hydranten-Cluster um den Einsatzort. */
export const WARMUP_CLUSTER_RADIUS_M = 3000;

/** Obergrenze der Werte einer `in`-Abfrage in Firestore. */
const FIRESTORE_IN_LIMIT = 30;

const FIRECALL_SUBCOLLECTIONS = [
  FIRECALL_ITEMS_COLLECTION_ID,
  FIRECALL_LAYERS_COLLECTION_ID,
  FIRECALL_CREW_COLLECTION_ID,
  FIRECALL_LOCATIONS_COLLECTION_ID,
  FIRECALL_MAP_LAYERS_COLLECTION_ID,
  ATEMSCHUTZ_TRUPP_COLLECTION_ID,
  ATEMSCHUTZ_AUSGABE_COLLECTION_ID,
];

/**
 * Die Untersammlungen eines Einsatzes, die vorgewärmt werden.
 *
 * Elemente (`item`) tragen auch das Einsatztagebuch und die Fahrzeuge des
 * Einsatzes; `crew` die Besatzung/Personen. Der Verlauf (`history`) fehlt
 * bewusst: Er ist groß und offline nicht gefragt.
 */
export function firecallWarmupPaths(firecallId: string): string[] {
  return FIRECALL_SUBCOLLECTIONS.map(
    (name) => `${FIRECALL_COLLECTION_ID}/${firecallId}/${name}`,
  );
}

async function runAll(
  tasks: Array<[label: string, run: () => Promise<unknown>]>,
): Promise<WarmupResult> {
  const results = await Promise.allSettled(tasks.map(([, run]) => run()));
  const ok: string[] = [];
  const failed: string[] = [];
  results.forEach((result, index) => {
    const label = tasks[index][0];
    if (result.status === 'fulfilled') {
      ok.push(label);
    } else {
      failed.push(label);
      console.debug(`[warmup] ${label} nicht vorgewärmt`, result.reason);
    }
  });
  return { ok, failed };
}

function collectionTask(
  path: string,
): [string, () => Promise<unknown>] {
  const [first, ...rest] = path.split('/');
  return [path, () => getDocs(query(collection(firestore, first, ...rest)))];
}

function docTask(path: string): [string, () => Promise<unknown>] {
  const [first, ...rest] = path.split('/');
  return [path, () => getDoc(doc(firestore, first, ...rest))];
}

/** Einsatz-Dokument und alle Untersammlungen eines Einsatzes. */
export function warmFirecallCache(firecallId: string): Promise<WarmupResult> {
  return runAll([
    docTask(`${FIRECALL_COLLECTION_ID}/${firecallId}`),
    ...firecallWarmupPaths(firecallId).map(collectionTask),
  ]);
}

export interface GroupWarmupOptions {
  /** Gruppe des Einsatzes: Gerätebestand, Stammdaten, Fahrzeuge, Personen. */
  groupId?: string;
  /** Gruppen des Benutzers: Einsatzliste. */
  groups: string[];
  /** Einsatzort: Hydranten-Cluster im Umkreis. */
  center?: { lat: number; lng: number };
  now?: Date;
}

/** Gruppendaten, Einsatzliste der letzten Wochen, Hydranten der Umgebung. */
export function warmGroupCache(
  options: GroupWarmupOptions,
): Promise<WarmupResult> {
  const { groupId, groups, center, now = new Date() } = options;
  const tasks: Array<[string, () => Promise<unknown>]> = [];

  if (groupId) {
    const base = `${GROUP_COLLECTION_ID}/${groupId}`;
    tasks.push(
      collectionTask(`${base}/${ATEMSCHUTZ_GERAET_COLLECTION_ID}`),
      collectionTask(`${base}/${FAHRTENBUCH_VEHICLE_COLLECTION_ID}`),
      collectionTask(`${base}/${FAHRTENBUCH_PERSON_COLLECTION_ID}`),
      docTask(`${base}/${GROUP_CONFIG_COLLECTION_ID}/${GROUP_STAMMDATEN_DOC}`),
    );
  }

  if (groups.length > 0) {
    const cutoff = new Date(
      now.getTime() - WARMUP_FIRECALL_LIST_DAYS * 86_400_000,
    ).toISOString();
    for (let at = 0; at < groups.length; at += FIRESTORE_IN_LIMIT) {
      const chunk = groups.slice(at, at + FIRESTORE_IN_LIMIT);
      tasks.push([
        `${FIRECALL_COLLECTION_ID}?groups=${chunk.join(',')}`,
        () =>
          getDocs(
            query(
              collection(firestore, FIRECALL_COLLECTION_ID),
              // Gleiche Reihenfolge der Bedingungen wie die Einsatzliste,
              // damit derselbe zusammengesetzte Index trägt.
              where('deleted', '==', false),
              where('group', 'in', chunk),
              where('date', '>=', cutoff),
              orderBy('date', 'desc'),
            ),
          ),
      ]);
    }
  }

  if (center) {
    tasks.push([
      'clusters6',
      () => queryClusters(center, WARMUP_CLUSTER_RADIUS_M),
    ]);
  }

  return runAll(tasks);
}

/** Laufende oder abgeschlossene Vorwärmungen dieses Seitenlebens. */
const inFlight = new Map<string, Promise<WarmupResult | undefined>>();

export function resetWarmupForTests(): void {
  inFlight.clear();
}

/**
 * Führt eine Vorwärmung je Schlüssel nur einmal aus — auch wenn mehrere
 * Komponenten sie gleichzeitig anstoßen. Scheitert sie vollständig (etwa weil
 * die Verbindung mittendrin abriss), darf sie beim nächsten Anlass erneut
 * laufen.
 */
export function warmOnce(
  key: string,
  run: () => Promise<WarmupResult>,
): Promise<WarmupResult | undefined> {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = run().then(
    (result) => {
      if (result.ok.length === 0 && result.failed.length > 0) {
        inFlight.delete(key);
      }
      return result;
    },
    (error) => {
      console.debug(`[warmup] ${key} gescheitert`, error);
      inFlight.delete(key);
      return undefined;
    },
  );
  inFlight.set(key, promise);
  return promise;
}
