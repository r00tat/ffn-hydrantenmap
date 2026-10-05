'use server';
import 'server-only';

import {
  FieldValue,
  type DocumentReference,
  type Transaction,
} from 'firebase-admin/firestore';
import { ApiException } from '../../app/api/errors';
import {
  actionUserAuthorizedForFirecall,
  actionUserRequired,
} from '../../app/auth';
import {
  deviationKey,
  GERAET_BESTAND_COLLECTION,
  GERAET_BUCHUNG_COLLECTION,
  GERAET_COLLECTION,
  GERAET_EINSATZ_COLLECTION,
  GERAET_MATERIAL_TYPEN,
  isContainer,
  isValidMenge,
  lagerortKey,
  type Geraet,
  type GeraetBestand,
  type GeraetBuchung,
  type GeraetBuchungArt,
  type GeraetEinsatz,
  type GeraetLagerort,
} from '../../common/geraet';
import {
  applyStockDelta,
  capVerbrauchTarget,
  isOutdatedEntry,
  reconcileVerbrauch,
  type VerbrauchExpectation,
} from '../../common/geraetBestandLogic';
import {
  GERAET_IMPORT_MAX_BYTES,
  parseGeraetExport,
  planGeraetImport,
  type GeraetImportPlan,
  type ParsedGeraet,
  type ParsedGeraetBestand,
} from '../../common/geraetImport';
import { readXlsxSheet } from '../../common/xlsx';
import { firestore } from '../../server/firebase/admin';
import { actionFahrtenbuchManagerRequired } from '../Fahrtenbuch/authGuards';
import { FIRECALL_COLLECTION_ID, GROUP_COLLECTION_ID } from '../firebase/firestore';
import type { NachbestellungItem } from './buildNachbestellungEmail';
import { notifyNachbestellung } from './notifyNachbestellung';

/*
 * Server Actions für Geräte und Lagerartikel (Issue #844).
 *
 * Gelesen wird im Client direkt aus Firestore (Gruppenmitglieder dürfen
 * lesen); geschrieben wird ausschließlich hier — die Firestore-Regeln sperren
 * `geraet`, `geraetBestand` und `geraetBuchung` für Client-Schreibvorgänge.
 *
 * Grundregeln:
 * - Jede Action ruft zuerst ihren Guard. Pflege (Stammdaten, Bestand, Import)
 *   verlangt Gruppen-Admin oder Gerätemeister
 *   (`actionFahrtenbuchManagerRequired`, schließt die Mandanten-Sperre ein),
 *   der Verbrauch im Einsatz die Einsatzberechtigung mit Schreibrecht.
 * - Jede Bestandsänderung läuft in einer Transaktion, die `geraetBestand.anzahl`
 *   und `geraet.bestandGesamt` gemeinsam ändert — so bleibt der Gesamtbestand
 *   die Summe der Lagerorte. Einzige Ausnahme ist der Import (Batches, siehe
 *   dort), der dieselbe Summe über `FieldValue.increment` hält.
 * - Die Nachbestellmail geht erst **nach** dem Commit hinaus und nur beim
 *   Übergang unter den Mindestbestand (`applyStockDelta`). Ein Mailfehler
 *   lässt die Buchung stehen.
 * - Fehler werden geworfen (`ApiException`), nicht als Ergebnisobjekt
 *   zurückgegeben: Die Offline-Warteschlange erkennt einen Fehlschlag nur an
 *   einer Ausnahme.
 */

// --- Hilfen ------------------------------------------------------------------

type Session = Awaited<ReturnType<typeof actionUserRequired>>;

interface Actor {
  uid: string;
  now: string;
}

function actorOf(session: Session): Actor {
  return { uid: session.user.id, now: new Date().toISOString() };
}

function groupRef(groupId: string) {
  return firestore.collection(GROUP_COLLECTION_ID).doc(groupId);
}

function geraetCol(groupId: string) {
  return groupRef(groupId).collection(GERAET_COLLECTION);
}

function bestandCol(groupId: string) {
  return groupRef(groupId).collection(GERAET_BESTAND_COLLECTION);
}

function buchungCol(groupId: string) {
  return groupRef(groupId).collection(GERAET_BUCHUNG_COLLECTION);
}

/**
 * Eine ID aus dem Browser wird Teil eines Dokumentpfads. Mit Schrägstrich
 * zeigte sie auf ein anderes Dokument, `.` und `..` ließen das SDK werfen.
 */
function assertSafeId(id: unknown, what: string): asserts id is string {
  if (
    typeof id !== 'string' ||
    !id.trim() ||
    id.includes('/') ||
    id === '.' ||
    id === '..' ||
    id.length > 200
  ) {
    throw new ApiException(`invalid ${what}`, { status: 400 });
  }
}

function notFound(what: string, id: string): ApiException {
  return new ApiException(`${what} ${id} not found`, { status: 404 });
}

function trimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

/** Entfernt `undefined` — Firestore lehnt es ab. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/** Rundet Gleitkommareste weg, wie `applyStockDelta`. */
function clean(value: number): number {
  return Math.round(value * 1e9) / 1e9 || 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function geraetSnapshot(id: string, data: unknown): Geraet {
  return { ...(data as Geraet), id };
}

function bestandSnapshot(id: string, data: unknown): GeraetBestand {
  return { ...(data as GeraetBestand), id };
}

function nachbestellungItem(geraet: Geraet, bestandGesamt: number): NachbestellungItem {
  return compact({
    geraetId: geraet.id,
    bezeichnung: geraet.bezeichnung,
    inventarNr: geraet.inventarNr,
    bestandGesamt,
    mindestbestand: geraet.mindestbestand ?? 0,
    einheit: geraet.einheit,
  });
}

interface StockPatch {
  patch: Record<string, unknown>;
  bestandGesamt: number;
  /** Gesetzt, wenn diese Änderung den Mindestbestand unterschreitet. */
  crossed?: NachbestellungItem;
}

/**
 * Die Änderung am Artikel für eine Bestandsänderung um `delta`: neuer
 * Gesamtbestand und Nachbestell-Zeitpunkt (gesetzt oder gelöscht).
 */
function stockPatch(geraet: Geraet, delta: number, actor: Actor): StockPatch {
  const result = applyStockDelta(
    {
      bestandGesamt: geraet.bestandGesamt ?? 0,
      mindestbestand: geraet.mindestbestand,
      nachbestellenSeit: geraet.nachbestellenSeit ?? null,
    },
    delta,
    actor.now,
  );
  return {
    patch: {
      bestandGesamt: result.bestandGesamt,
      nachbestellenSeit: result.nachbestellenSeit ?? FieldValue.delete(),
      updatedAt: actor.now,
      updatedBy: actor.uid,
    },
    bestandGesamt: result.bestandGesamt,
    crossed: result.crossedBelow
      ? nachbestellungItem(geraet, result.bestandGesamt)
      : undefined,
  };
}

type NewBuchung = Omit<GeraetBuchung, 'id' | 'createdAt' | 'createdBy'>;

function buchungDoc(input: NewBuchung, actor: Actor): Omit<GeraetBuchung, 'id'> {
  return compact({
    ...input,
    bemerkung: trimmed(input.bemerkung),
    createdAt: actor.now,
    createdBy: actor.uid,
  });
}

/** Mailfehler dürfen die schon geschriebene Buchung nie scheitern lassen. */
async function notifyAfterCommit(
  args: Parameters<typeof notifyNachbestellung>[0],
): Promise<void> {
  if (args.items.length === 0) return;
  try {
    await notifyNachbestellung(args);
  } catch (err) {
    console.error('geraeteActions: Nachbestellmail gescheitert', err, {
      groupId: args.groupId,
    });
  }
}

// --- Lagerort ----------------------------------------------------------------

const LAGERORT_ARTEN: GeraetLagerort['art'][] = ['fahrzeug', 'raum', 'container', 'set'];

/**
 * Bereinigt einen Lagerort aus dem Browser. Behalten werden nur die Felder,
 * die zur Art gehören — ein „Raum" an einem Fahrzeug-Lagerort wäre beim
 * nächsten Import eine Abweichung, die niemand versteht.
 */
function sanitizeLagerort(input: unknown): GeraetLagerort {
  const raw = (input ?? {}) as Partial<Record<keyof GeraetLagerort, unknown>>;
  const art = raw.art as GeraetLagerort['art'];
  if (!LAGERORT_ARTEN.includes(art)) {
    throw new ApiException('invalid lagerort', { status: 400 });
  }
  const lagerort: GeraetLagerort =
    art === 'fahrzeug'
      ? compact({ art, fahrzeug: trimmed(raw.fahrzeug), laderaum: trimmed(raw.laderaum) })
      : art === 'raum'
        ? compact({ art, standort: trimmed(raw.standort), raum: trimmed(raw.raum) })
        : art === 'container'
          ? compact({ art, containerId: trimmed(raw.containerId) })
          : { art };
  if (art === 'fahrzeug' && !lagerort.fahrzeug) {
    throw new ApiException('invalid lagerort: fahrzeug missing', { status: 400 });
  }
  if (art === 'raum' && !lagerort.standort && !lagerort.raum) {
    throw new ApiException('invalid lagerort: raum missing', { status: 400 });
  }
  if (art === 'container') {
    if (!lagerort.containerId) {
      throw new ApiException('invalid lagerort: container missing', { status: 400 });
    }
    assertSafeId(lagerort.containerId, 'containerId');
  }
  const bemerkung = trimmed(raw.bemerkung);
  if (bemerkung) lagerort.bemerkung = bemerkung;
  const vehicleId = trimmed(raw.vehicleId);
  if (vehicleId) {
    assertSafeId(vehicleId, 'vehicleId');
    lagerort.vehicleId = vehicleId;
  }
  return lagerort;
}

// --- Stammdaten --------------------------------------------------------------

/**
 * Eingabe von `saveGeraet`. Ohne `id` wird angelegt, mit `id` geändert.
 *
 * Beim Ändern gilt nur, was im Objekt steht: Fehlt ein Feld, bleibt es; ist es
 * `null` oder ein leerer String, wird es gelöscht. Berechnete Felder
 * (`bestandGesamt`, `nachbestellenSeit`, `importedAt`, Zeitstempel) und die
 * Sybos-ID werden ignoriert — sie ändern nur Buchungen und der Import.
 */
export type SaveGeraetInput = {
  [K in keyof Geraet]?: Geraet[K] | null | '';
} & { id?: string };

const TEXT_FIELDS = [
  'kategorie',
  'klasse1',
  'klasse2',
  'klasse3',
  'inventarNr',
  'zusatzInventarNr',
  'seriennummer',
  'hersteller',
  'herstellerTyp',
  'besitzer',
  'bemerkung',
  'einheit',
  'kostenersatzRateId',
] as const satisfies readonly (keyof Geraet)[];

/**
 * Übersetzt die Eingabe in ein Patch. `undefined` im Ergebnis heißt „löschen";
 * beim Anlegen wird es weggelassen, beim Ändern zu `FieldValue.delete()`.
 */
function geraetPatch(input: SaveGeraetInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);

  if (has('bezeichnung')) {
    const bezeichnung = trimmed(input.bezeichnung);
    if (!bezeichnung) {
      throw new ApiException('invalid geraet: bezeichnung missing', { status: 400 });
    }
    patch.bezeichnung = bezeichnung;
  }
  for (const field of TEXT_FIELDS) {
    if (has(field)) patch[field] = trimmed(input[field]);
  }
  if (has('materialTyp')) {
    const value = input.materialTyp;
    if (value === null || value === undefined || value === '') {
      patch.materialTyp = undefined;
    } else if (GERAET_MATERIAL_TYPEN.includes(value)) {
      patch.materialTyp = value;
    }
  }
  if (has('einheitVerwendungsnachweis')) {
    const value = input.einheitVerwendungsnachweis;
    patch.einheitVerwendungsnachweis = value === 'stk' || value === 'h' ? value : undefined;
  }
  if (has('barcodes')) {
    const barcodes = Array.isArray(input.barcodes)
      ? [
          ...new Set(
            input.barcodes.map((b) => trimmed(b)).filter((b): b is string => !!b),
          ),
        ]
      : [];
    patch.barcodes = barcodes.length > 0 ? barcodes : undefined;
  }
  if (has('baujahr')) {
    const value = input.baujahr;
    patch.baujahr =
      isFiniteNumber(value) && Number.isInteger(value) && value > 1900 ? value : undefined;
  }
  if (has('mindestbestand')) {
    const value = input.mindestbestand;
    patch.mindestbestand = isFiniteNumber(value) && value >= 0 ? value : undefined;
  }
  if (has('verbrauchsmaterial') && typeof input.verbrauchsmaterial === 'boolean') {
    patch.verbrauchsmaterial = input.verbrauchsmaterial;
  }
  if (has('active') && typeof input.active === 'boolean') {
    patch.active = input.active;
  }
  return patch;
}

/**
 * Legt einen Artikel an oder ändert seine Stammdaten.
 *
 * Ändert sich der Mindestbestand, wird `nachbestellenSeit` neu bestimmt —
 * ohne Mail: Den Mindestbestand über den Bestand zu heben, ist kein
 * Verbrauch, nur eine neue Einschätzung, und die Liste „Nachzubestellen"
 * zeigt den Artikel ohnehin.
 */
export async function saveGeraet(
  groupId: string,
  input: SaveGeraetInput,
): Promise<{ id: string }> {
  const session = await actionFahrtenbuchManagerRequired(groupId);
  const actor = actorOf(session);
  if (!input || typeof input !== 'object') {
    throw new ApiException('invalid geraet', { status: 400 });
  }

  if (input.id === undefined || input.id === null || input.id === '') {
    if (!trimmed(input.bezeichnung)) {
      throw new ApiException('invalid geraet: bezeichnung missing', { status: 400 });
    }
    const patch = geraetPatch(input);
    const ref = geraetCol(groupId).doc();
    const min = patch.mindestbestand as number | undefined;
    const stock = applyStockDelta({ bestandGesamt: 0, mindestbestand: min }, 0, actor.now);
    await ref.set(
      compact({
        verbrauchsmaterial: false,
        active: true,
        ...patch,
        bestandGesamt: 0,
        nachbestellenSeit: stock.nachbestellenSeit ?? undefined,
        createdAt: actor.now,
        createdBy: actor.uid,
        updatedAt: actor.now,
        updatedBy: actor.uid,
      }),
    );
    return { id: ref.id };
  }

  const id = input.id;
  assertSafeId(id, 'geraetId');
  const ref = geraetCol(groupId).doc(id);
  await firestore.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('geraet', id);
    const current = geraetSnapshot(id, snap.data());

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(geraetPatch(input))) {
      patch[key] = value === undefined ? FieldValue.delete() : value;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'mindestbestand')) {
      const min = geraetPatch({ mindestbestand: input.mindestbestand }).mindestbestand as
        | number
        | undefined;
      const stock = applyStockDelta(
        {
          bestandGesamt: current.bestandGesamt ?? 0,
          mindestbestand: min,
          nachbestellenSeit: current.nachbestellenSeit ?? null,
        },
        0,
        actor.now,
      );
      patch.nachbestellenSeit = stock.nachbestellenSeit ?? FieldValue.delete();
    }
    patch.updatedAt = actor.now;
    patch.updatedBy = actor.uid;
    tx.update(ref, patch);
  });
  return { id };
}

/** Höchstzahl der Schreibvorgänge je Batch — Firestore erlaubt 500. */
const BATCH_LIMIT = 450;

/**
 * Löscht einen Artikel — oder deaktiviert ihn, wenn er schon gebucht wurde.
 *
 * Eine Buchung ist Protokoll und bleibt; ihr Artikel muss dafür lesbar
 * bleiben. Import-Buchungen zählen nicht: Sie sind nur die Herkunft des
 * Anfangsbestands und gehen mit dem Artikel.
 */
export async function deleteGeraet(
  groupId: string,
  geraetId: string,
): Promise<{ id: string; deleted: boolean }> {
  const session = await actionFahrtenbuchManagerRequired(groupId);
  const actor = actorOf(session);
  assertSafeId(geraetId, 'geraetId');

  const ref = geraetCol(groupId).doc(geraetId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('geraet', geraetId);

  const bookings = await buchungCol(groupId).where('geraetId', '==', geraetId).get();
  const hasRealBookings = bookings.docs.some(
    (d) => (d.data() as GeraetBuchung).art !== 'import',
  );
  if (hasRealBookings) {
    await ref.update({ active: false, updatedAt: actor.now, updatedBy: actor.uid });
    return { id: geraetId, deleted: false };
  }

  const bestaende = await bestandCol(groupId).where('geraetId', '==', geraetId).get();
  const refs: DocumentReference[] = [
    ...bestaende.docs.map((d) => d.ref),
    ...bookings.docs.map((d) => d.ref),
    ref,
  ];
  // Der Artikel zuletzt: Scheitert ein Batch, bleibt er sichtbar und das
  // Löschen lässt sich wiederholen.
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = firestore.batch();
    for (const r of refs.slice(i, i + BATCH_LIMIT)) batch.delete(r);
    await batch.commit();
  }
  return { id: geraetId, deleted: true };
}

// --- Bestand -----------------------------------------------------------------

/**
 * Legt einen Lagerort für einen Artikel an. Eine Anfangsmenge wird als
 * `inventur` gebucht — sie ist ein gezählter Ist-Wert.
 */
export async function createGeraetBestand(
  groupId: string,
  geraetId: string,
  lagerort: GeraetLagerort,
  anzahl?: number,
): Promise<{ id: string }> {
  const session = await actionFahrtenbuchManagerRequired(groupId);
  const actor = actorOf(session);
  assertSafeId(geraetId, 'geraetId');
  const place = sanitizeLagerort(lagerort);
  const key = lagerortKey(place);
  const menge = anzahl ?? 0;
  if (!isValidMenge(menge)) {
    throw new ApiException('invalid anzahl', { status: 400 });
  }

  const geraetRef = geraetCol(groupId).doc(geraetId);
  const ref = bestandCol(groupId).doc();
  const crossed = await firestore.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(geraetRef);
    if (!snap.exists) throw notFound('geraet', geraetId);
    if (place.containerId) {
      // Die Bezeichnung kommt vom Container-Artikel, nicht aus dem Browser —
      // und nur ein Artikel der Kategorie „Container" taugt als Lagerort.
      if (place.containerId === geraetId) {
        throw new ApiException('invalid lagerort: container cannot hold itself', {
          status: 400,
        });
      }
      const containerSnap = await tx.get(geraetCol(groupId).doc(place.containerId));
      const container = containerSnap.data() as Partial<Geraet> | undefined;
      if (!containerSnap.exists || !container || !isContainer(container)) {
        throw new ApiException(`invalid lagerort: container ${place.containerId} not found`, {
          status: 400,
        });
      }
      place.container = trimmed(container.bezeichnung) ?? place.containerId;
    }
    const duplicate = await tx.get(
      bestandCol(groupId)
        .where('geraetId', '==', geraetId)
        .where('lagerortKey', '==', key),
    );
    if (!duplicate.empty) {
      throw new ApiException(`bestand ${key} exists for geraet ${geraetId}`, {
        status: 409,
      });
    }
    const geraet = geraetSnapshot(geraetId, snap.data());

    tx.create(ref, {
      geraetId,
      lagerortKey: key,
      lagerort: place,
      anzahl: menge,
      updatedAt: actor.now,
      updatedBy: actor.uid,
    });
    if (menge === 0) return undefined;
    tx.set(
      buchungCol(groupId).doc(),
      buchungDoc({ geraetId, bestandId: ref.id, art: 'inventur', menge }, actor),
    );
    const stock = stockPatch(geraet, menge, actor);
    tx.update(geraetRef, stock.patch);
    return stock.crossed;
  });

  if (crossed) await notifyAfterCommit({ groupId, items: [crossed] });
  return { id: ref.id };
}

export type BookGeraetBestandInput =
  | { art: 'zugang'; bestandId: string; menge: number; bemerkung?: string }
  | {
      art: 'umbuchung';
      bestandId: string;
      zielBestandId: string;
      menge: number;
      bemerkung?: string;
    }
  | { art: 'inventur'; bestandId: string; istWert: number; bemerkung?: string };

export interface BookGeraetBestandResult {
  buchungId: string;
  bestandGesamt: number;
}

/**
 * Bucht am Bestand eines Lagerorts: Zugang, Umbuchung, Inventur.
 *
 * Vorzeichen der Buchung: Zugang positiv, Inventur die Differenz zum
 * bisherigen Stand, Umbuchung **negativ am Quell-Lagerort** (`bestandId`) mit
 * dem Ziel in `zielBestandId` — der Gesamtbestand bleibt dabei gleich.
 */
export async function bookGeraetBestand(
  groupId: string,
  input: BookGeraetBestandInput,
): Promise<BookGeraetBestandResult> {
  const session = await actionFahrtenbuchManagerRequired(groupId);
  const actor = actorOf(session);
  if (!input || typeof input !== 'object') {
    throw new ApiException('invalid buchung', { status: 400 });
  }
  assertSafeId(input.bestandId, 'bestandId');
  if (input.art === 'zugang' || input.art === 'umbuchung') {
    if (!isValidMenge(input.menge) || input.menge <= 0) {
      throw new ApiException('invalid menge', { status: 400 });
    }
  } else if (input.art === 'inventur') {
    if (!isValidMenge(input.istWert)) {
      throw new ApiException('invalid istWert', { status: 400 });
    }
  } else {
    throw new ApiException('invalid buchung art', { status: 400 });
  }
  if (input.art === 'umbuchung') {
    assertSafeId(input.zielBestandId, 'zielBestandId');
    if (input.zielBestandId === input.bestandId) {
      throw new ApiException('invalid umbuchung: same bestand', { status: 400 });
    }
  }

  const buchungRef = buchungCol(groupId).doc();
  const { bestandGesamt, crossed } = await firestore.runTransaction(
    async (tx: Transaction) => {
      const sourceRef = bestandCol(groupId).doc(input.bestandId);
      const sourceSnap = await tx.get(sourceRef);
      if (!sourceSnap.exists) throw notFound('bestand', input.bestandId);
      const source = bestandSnapshot(sourceSnap.id, sourceSnap.data());

      let targetRef: DocumentReference | undefined;
      let target: GeraetBestand | undefined;
      if (input.art === 'umbuchung') {
        targetRef = bestandCol(groupId).doc(input.zielBestandId);
        const targetSnap = await tx.get(targetRef);
        if (!targetSnap.exists) throw notFound('bestand', input.zielBestandId);
        target = bestandSnapshot(targetSnap.id, targetSnap.data());
        if (target.geraetId !== source.geraetId) {
          throw new ApiException('invalid umbuchung: different geraet', { status: 400 });
        }
      }

      assertSafeId(source.geraetId, 'geraetId');
      const geraetRef = geraetCol(groupId).doc(source.geraetId);
      const geraetSnap = await tx.get(geraetRef);
      if (!geraetSnap.exists) throw notFound('geraet', source.geraetId);
      const geraet = geraetSnapshot(geraetSnap.id, geraetSnap.data());

      const stamp = { updatedAt: actor.now, updatedBy: actor.uid };
      const base = { geraetId: source.geraetId, bestandId: source.id, bemerkung: input.bemerkung };

      if (input.art === 'umbuchung') {
        if (!targetRef || !target) throw notFound('bestand', input.zielBestandId);
        tx.update(sourceRef, { anzahl: clean((source.anzahl ?? 0) - input.menge), ...stamp });
        tx.update(targetRef, { anzahl: clean((target.anzahl ?? 0) + input.menge), ...stamp });
        tx.set(
          buchungRef,
          buchungDoc(
            { ...base, art: 'umbuchung', menge: -input.menge, zielBestandId: target.id },
            actor,
          ),
        );
        return { bestandGesamt: geraet.bestandGesamt ?? 0, crossed: undefined };
      }

      const delta =
        input.art === 'zugang' ? input.menge : clean(input.istWert - (source.anzahl ?? 0));
      const art: GeraetBuchungArt = input.art;
      tx.update(sourceRef, { anzahl: clean((source.anzahl ?? 0) + delta), ...stamp });
      tx.set(buchungRef, buchungDoc({ ...base, art, menge: delta }, actor));
      const stock = stockPatch(geraet, delta, actor);
      tx.update(geraetRef, stock.patch);
      return { bestandGesamt: stock.bestandGesamt, crossed: stock.crossed };
    },
  );

  if (crossed) await notifyAfterCommit({ groupId, items: [crossed] });
  return { buchungId: buchungRef.id, bestandGesamt };
}

// --- Verbrauch im Einsatz ----------------------------------------------------

/** Die Erwartung aus dem Browser: nur die zwei bekannten Formen. */
function sanitizeExpectation(expect: unknown): VerbrauchExpectation | undefined {
  if (expect === undefined || expect === null) return undefined;
  if (typeof expect === 'object') {
    const raw = expect as { deleted?: unknown; syncRev?: unknown };
    if (raw.deleted === true) return { deleted: true };
    if (isFiniteNumber(raw.syncRev)) return { syncRev: raw.syncRev };
  }
  throw new ApiException('invalid expectation', { status: 400 });
}

/**
 * Gleicht den Bestand an einen `geraetEinsatz`-Eintrag an.
 *
 * Der Eintrag wird im Client lokal geschrieben und ist offline sofort
 * sichtbar; diese Action holt das Abbuchen nach — über die Warteschlange
 * (`geraetVerbrauchQueue.ts`), online sofort, offline beim Reconnect.
 *
 * Sie liest den Eintrag **am Server** und bucht nur die Differenz zu allen
 * bisherigen Buchungen mit seiner ID (`reconcileVerbrauch`). Darum ist sie
 * idempotent und deckt auch Ändern (Differenz, Lagerortwechsel als Storno
 * plus Verbrauch) und Löschen (Storno) ab. Ein nur zugeordnetes Gerät bucht
 * nichts.
 *
 * Gebucht wird in der Gruppe des Einsatzes; ein Eintrag mit anderer Gruppe
 * wird abgelehnt — sonst buchte ein Einsatz der einen Feuerwehr im Lager der
 * anderen. Aufrufen darf nur ein Mitglied dieser Gruppe: Ein Einsatz-Gast mit
 * Schreibrecht könnte die Gruppe am Einsatz umschreiben (die Regel für
 * `call/{doc}` vergleicht sie nicht) und so im Lager einer fremden Gruppe
 * buchen. Gäste lesen die Artikel ohnehin nicht und brauchen den Abgleich nie.
 *
 * `expect` ist der Stand, den der Client geschrieben hat (`syncRev`, oder
 * „gelöscht"). Liest der Server einen älteren, ist die Änderung noch nicht
 * angekommen — dann wird mit 409 abgelehnt statt den alten Stand zu buchen,
 * und die Warteschlange wiederholt (`isOutdatedEntry`).
 *
 * Abgebucht wird nur Verbrauchsmaterial eines aktiven Artikels; sonst bleibt
 * höchstens stehen, was schon gebucht war (`capVerbrauchTarget`). Die Menge
 * eines Eintrags muss gültig sein (`isValidMenge`) — der Eintrag stammt vom
 * Client.
 */
export async function syncGeraetVerbrauch(
  firecallId: string,
  einsatzEintragId: string,
  expect?: VerbrauchExpectation,
): Promise<{ deltas: number }> {
  const firecall = await actionUserAuthorizedForFirecall(firecallId, {
    requireWrite: true,
    requireGroupMember: true,
  });
  const session = await actionUserRequired();
  const actor = actorOf(session);
  assertSafeId(einsatzEintragId, 'einsatzEintragId');
  const expectation = sanitizeExpectation(expect);
  const groupId = firecall.group;
  if (!groupId) {
    throw new ApiException(`firecall ${firecallId} has no group`, { status: 400 });
  }

  const entryRef = firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .collection(GERAET_EINSATZ_COLLECTION)
    .doc(einsatzEintragId);

  const { deltas, crossed } = await firestore.runTransaction(async (tx: Transaction) => {
    // Alle Lesevorgänge vor dem ersten Schreiben — Regel der Transaktion.
    const entrySnap = await tx.get(entryRef);
    const entry = entrySnap.exists
      ? ({ ...(entrySnap.data() as GeraetEinsatz), id: entrySnap.id } as GeraetEinsatz)
      : undefined;
    if (entry && entry.groupId !== groupId) {
      throw new ApiException(
        `geraetEinsatz ${einsatzEintragId} belongs to group ${entry.groupId}, not to the firecall group`,
        { status: 403 },
      );
    }
    if (isOutdatedEntry(entry, expectation)) {
      throw new ApiException(
        `geraetEinsatz ${einsatzEintragId} is not yet in the expected state, retry later`,
        { status: 409 },
      );
    }

    const bookedSnap = await tx.get(
      buchungCol(groupId).where('einsatzEintragId', '==', einsatzEintragId),
    );
    const booked = bookedSnap.docs
      .map((d) => d.data() as GeraetBuchung)
      .filter((b) => b.firecallId === firecallId);

    const bookedMengen = booked.map((b) => ({ bestandId: b.bestandId, menge: b.menge }));

    const geraete = new Map<string, Geraet>();
    let target: { bestandId: string; menge: number } | null = null;
    if (entry && entry.art === 'verbraucht' && trimmed(entry.bestandId)) {
      assertSafeId(entry.bestandId, 'bestandId');
      if (!isValidMenge(entry.menge ?? 0)) {
        throw new ApiException(`geraetEinsatz ${einsatzEintragId}: invalid menge`, {
          status: 400,
        });
      }
      assertSafeId(entry.geraetId, 'geraetId');
      const geraetSnap = await tx.get(geraetCol(groupId).doc(entry.geraetId));
      const entryGeraet = geraetSnap.exists
        ? geraetSnapshot(entry.geraetId, geraetSnap.data())
        : undefined;
      if (entryGeraet) geraete.set(entryGeraet.id, entryGeraet);
      const bookable =
        entryGeraet?.verbrauchsmaterial === true && entryGeraet.active !== false;
      target = capVerbrauchTarget(
        { bestandId: entry.bestandId, menge: entry.menge ?? 0 },
        bookedMengen,
        bookable,
      );
    }

    const changes = reconcileVerbrauch(target, bookedMengen);

    const bestaende = new Map<string, GeraetBestand>();
    for (const { bestandId } of changes) {
      assertSafeId(bestandId, 'bestandId');
      const snap = await tx.get(bestandCol(groupId).doc(bestandId));
      if (!snap.exists) throw notFound('bestand', bestandId);
      bestaende.set(bestandId, bestandSnapshot(bestandId, snap.data()));
    }
    // Nur prüfbar, wenn am Ziel gebucht wird — sonst wurde es schon beim
    // ersten Abgleich geprüft.
    const targetBestand = target ? bestaende.get(target.bestandId) : undefined;
    if (target && entry && targetBestand && targetBestand.geraetId !== entry.geraetId) {
      throw new ApiException(
        `bestand ${target.bestandId} does not belong to geraet ${entry.geraetId}`,
        { status: 400 },
      );
    }

    for (const b of bestaende.values()) {
      if (geraete.has(b.geraetId)) continue;
      assertSafeId(b.geraetId, 'geraetId');
      const snap = await tx.get(geraetCol(groupId).doc(b.geraetId));
      if (!snap.exists) throw notFound('geraet', b.geraetId);
      geraete.set(b.geraetId, geraetSnapshot(b.geraetId, snap.data()));
    }

    const totals = new Map<string, number>();
    for (const { bestandId, delta } of changes) {
      const b = bestaende.get(bestandId)!;
      tx.update(bestandCol(groupId).doc(bestandId), {
        anzahl: clean((b.anzahl ?? 0) + delta),
        updatedAt: actor.now,
        updatedBy: actor.uid,
      });
      tx.set(
        buchungCol(groupId).doc(),
        buchungDoc(
          {
            geraetId: b.geraetId,
            bestandId,
            art: delta < 0 ? 'verbrauch' : 'storno',
            menge: delta,
            firecallId,
            einsatzEintragId,
          },
          actor,
        ),
      );
      totals.set(b.geraetId, (totals.get(b.geraetId) ?? 0) + delta);
    }

    const crossedItems: NachbestellungItem[] = [];
    for (const [geraetId, delta] of totals) {
      if (clean(delta) === 0) continue;
      const stock = stockPatch(geraete.get(geraetId)!, clean(delta), actor);
      tx.update(geraetCol(groupId).doc(geraetId), stock.patch);
      if (stock.crossed) crossedItems.push(stock.crossed);
    }

    if (entry && entry.gebucht !== true) tx.update(entryRef, { gebucht: true });
    return { deltas: changes.length, crossed: crossedItems };
  });

  if (crossed.length > 0) {
    await notifyAfterCommit({
      groupId,
      firecallId,
      firecallName: firecall.name,
      items: crossed,
    });
  }
  return { deltas };
}

// --- Import ------------------------------------------------------------------

/**
 * Obergrenzen gegen eine manipulierte Anfrage (Geräte-Export: 1106 Zeilen).
 * Die Dateigröße begrenzt schon das Body-Limit der Server Action; die eigene
 * Prüfung bleibt, falls es einmal angehoben wird.
 */
const IMPORT_MAX_BYTES = GERAET_IMPORT_MAX_BYTES;
const IMPORT_MAX_ROWS = 20_000;

function decodeImportFile(fileBase64: unknown): Uint8Array {
  if (typeof fileBase64 !== 'string') {
    throw new ApiException('file missing', { status: 400 });
  }
  // Ein `FileReader.readAsDataURL` liefert das Präfix gleich mit.
  const b64 = fileBase64.replace(/^data:[^,]*,/, '').trim();
  if (Math.floor((b64.length * 3) / 4) > IMPORT_MAX_BYTES) {
    throw new ApiException('file too large', { status: 413 });
  }
  const buffer = Buffer.from(b64, 'base64');
  if (buffer.length === 0) throw new ApiException('file missing', { status: 400 });
  return new Uint8Array(buffer);
}

interface ImportContext {
  parsed: ParsedGeraet[];
  errors: string[];
  plan: GeraetImportPlan;
  geraeteById: Map<string, Geraet>;
  /** Geparster Artikel je Dokument-ID (für neue Lagerorte aus Abweichungen). */
  parsedByGeraetId: Map<string, ParsedGeraet>;
}

/**
 * Liest die Datei und gleicht sie gegen den Bestand der Gruppe ab.
 *
 * „Buchungen seit dem letzten Import" heißt: eine Buchung außer `import`,
 * jünger als `importedAt` des Artikels. Ein Artikel ohne `importedAt` (von
 * Hand angelegt) hat jede seiner Buchungen „seither". Geladen werden deshalb
 * nur die Buchungen ab dem ältesten Importzeitpunkt — oder alle, wenn ein
 * Artikel keinen hat.
 */
async function prepareImport(groupId: string, fileBase64: unknown): Promise<ImportContext> {
  const rows = readXlsxSheet(decodeImportFile(fileBase64));
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new ApiException('too many rows', { status: 413 });
  }
  const { artikel: parsed, errors, withBestand } = parseGeraetExport(rows);

  const [geraeteSnap, bestaendeSnap] = await Promise.all([
    geraetCol(groupId).get(),
    bestandCol(groupId).get(),
  ]);
  const geraete = geraeteSnap.docs.map((d) => geraetSnapshot(d.id, d.data()));
  const bestaende = bestaendeSnap.docs.map((d) => bestandSnapshot(d.id, d.data()));
  const geraeteById = new Map(geraete.map((g) => [g.id, g]));

  let bookings: GeraetBuchung[] = [];
  if (geraete.length > 0) {
    const since = geraete.every((g) => g.importedAt)
      ? geraete.map((g) => g.importedAt as string).sort()[0]
      : '';
    const snap = await buchungCol(groupId).where('createdAt', '>', since).get();
    bookings = snap.docs
      .map((d) => d.data() as GeraetBuchung)
      .filter((b) => b.art !== 'import');
  }
  const bookedSince = new Set<string>();
  for (const b of bookings) {
    const g = geraeteById.get(b.geraetId);
    if (!g) continue;
    if (!g.importedAt || (b.createdAt ?? '') > g.importedAt) bookedSince.add(g.id);
  }

  const plan = planGeraetImport(
    parsed,
    {
      geraete,
      bestaende,
      hasBookingsSinceImport: (geraetId) => bookedSince.has(geraetId),
    },
    { withBestand },
  );

  // Dieselbe Zuordnung wie im Abgleich: Sybos-ID, ersatzweise Dokument-ID.
  const byExterneId = new Map<string, string>();
  for (const g of geraete) {
    const key = g.externeId || g.id;
    if (!byExterneId.has(key)) byExterneId.set(key, g.id);
  }
  for (const g of geraete) if (!byExterneId.has(g.id)) byExterneId.set(g.id, g.id);
  const parsedByGeraetId = new Map<string, ParsedGeraet>();
  for (const a of parsed) {
    parsedByGeraetId.set(byExterneId.get(a.externeId) ?? a.externeId, a);
  }

  return { parsed, errors, plan, geraeteById, parsedByGeraetId };
}

export type GeraetImportPreview = GeraetImportPlan & {
  /** Meldungen des Parsers, je Zeile mit Nummer — auf Deutsch. */
  errors: string[];
};

/**
 * Vorschau des Imports — schreibt nichts. Die Abweichungen (`deviations`)
 * zeigt die Seite je Lagerort an; übernommen werden sie nur, wenn ihr
 * `deviationKey` in `acceptDeviations` von `importGeraete` steht.
 */
export async function previewGeraetImport(
  groupId: string,
  fileBase64: string,
): Promise<GeraetImportPreview> {
  await actionFahrtenbuchManagerRequired(groupId);
  const { plan, errors } = await prepareImport(groupId, fileBase64);
  return { ...plan, errors };
}

export interface GeraetImportSummary {
  created: number;
  updated: number;
  unchanged: number;
  bestandCreated: number;
  bestandUpdated: number;
  deviationsAccepted: number;
  deviationsRejected: number;
  inactive: number;
  bookings: number;
  errors: string[];
}

type ImportWrite =
  | { kind: 'set'; ref: DocumentReference; data: Record<string, unknown>; merge?: boolean }
  | { kind: 'update'; ref: DocumentReference; data: Record<string, unknown> };

/**
 * Führt den Import aus. Die Datei wird erneut gelesen und abgeglichen — der
 * Plan kommt nicht aus dem Browser, nur die Entscheidung über die
 * Abweichungen.
 *
 * - Neue Artikel: Dokument-ID = Sybos-ID, `verbrauchsmaterial` aus der
 *   Kategorie vorbelegt, Bestände mit Buchung `import`.
 * - Vorhandene Artikel: Stammdaten aus der Datei, in Sybos geleerte Felder
 *   werden gelöscht; händisch gepflegte Felder bleiben. Geänderte Bestände
 *   ohne Buchungen seit dem letzten Import als `import`, zugestimmte
 *   Abweichungen als `inventur`.
 * - `importedAt` wird bei allen Artikeln der Datei fortgeschrieben — **außer**
 *   bei verworfenen Abweichungen: Sonst hielte der nächste Import den
 *   App-Bestand für unberührt und überschriebe ihn mit dem veralteten
 *   Sybos-Wert, den hier gerade jemand abgelehnt hat.
 *
 * Geschrieben wird in Batches (≤ 450 Operationen), jeder Artikel mit allen
 * seinen Beständen und Buchungen im selben Batch. Bestände und Gesamtbestand
 * ändern sich per `FieldValue.increment` um dieselbe Differenz, sodass die
 * Summe auch bei einem gleichzeitigen Verbrauch stimmt.
 */
export async function importGeraete(
  groupId: string,
  fileBase64: string,
  acceptDeviations: string[],
): Promise<GeraetImportSummary> {
  const session = await actionFahrtenbuchManagerRequired(groupId);
  const actor = actorOf(session);
  if (
    !Array.isArray(acceptDeviations) ||
    acceptDeviations.length > IMPORT_MAX_ROWS ||
    !acceptDeviations.every((k) => typeof k === 'string')
  ) {
    throw new ApiException('invalid acceptDeviations', { status: 400 });
  }
  const accept = new Set(acceptDeviations);
  const { plan, errors, geraeteById, parsedByGeraetId } = await prepareImport(
    groupId,
    fileBase64,
  );

  const summary: GeraetImportSummary = {
    created: 0,
    updated: plan.update.length,
    unchanged: plan.unchanged.length,
    bestandCreated: 0,
    bestandUpdated: 0,
    deviationsAccepted: 0,
    deviationsRejected: 0,
    inactive: plan.inactive.length,
    bookings: 0,
    errors: [...errors],
  };

  const writes = new Map<string, ImportWrite[]>();
  const push = (geraetId: string, write: ImportWrite) => {
    const list = writes.get(geraetId) ?? [];
    list.push(write);
    writes.set(geraetId, list);
  };
  const stamp = { updatedAt: actor.now, updatedBy: actor.uid };
  const deltas = new Map<string, number>();
  const addDelta = (geraetId: string, delta: number) =>
    deltas.set(geraetId, clean((deltas.get(geraetId) ?? 0) + delta));
  const rejected = new Set<string>();
  const created = new Set<string>();

  const book = (geraetId: string, bestandId: string, art: GeraetBuchungArt, menge: number) => {
    if (menge === 0) return;
    push(geraetId, {
      kind: 'set',
      ref: buchungCol(groupId).doc(),
      data: buchungDoc({ geraetId, bestandId, art, menge }, actor),
    });
    summary.bookings += 1;
  };
  const createBestand = (
    geraetId: string,
    b: ParsedGeraetBestand,
    anzahl: number,
    art: GeraetBuchungArt,
  ) => {
    const ref = bestandCol(groupId).doc();
    push(geraetId, {
      kind: 'set',
      ref,
      data: {
        geraetId,
        lagerortKey: b.lagerortKey,
        lagerort: compact(b.lagerort),
        anzahl,
        ...stamp,
      },
    });
    book(geraetId, ref.id, art, anzahl);
  };

  // Neue Artikel.
  for (const artikel of plan.create) {
    const id = artikel.externeId;
    try {
      assertSafeId(id, 'externeId');
    } catch {
      summary.errors.push(`ID „${id}" ist als Dokument-ID unbrauchbar — übersprungen`);
      continue;
    }
    created.add(id);
    summary.created += 1;
    const bestandGesamt = clean(artikel.bestaende.reduce((s, b) => s + b.anzahl, 0));
    push(id, {
      kind: 'set',
      ref: geraetCol(groupId).doc(id),
      data: compact({
        ...artikel.stammdaten,
        externeId: id,
        verbrauchsmaterial: artikel.suggestedConsumable,
        bestandGesamt,
        importedAt: actor.now,
        createdAt: actor.now,
        createdBy: actor.uid,
        ...stamp,
      }),
    });
  }

  for (const b of plan.bestandCreate) {
    if (!created.has(b.geraetId) && !geraeteById.has(b.geraetId)) continue;
    createBestand(b.geraetId, b, b.anzahl, 'import');
    summary.bestandCreated += 1;
    if (!created.has(b.geraetId)) addDelta(b.geraetId, b.anzahl);
  }

  for (const b of plan.bestandUpdate) {
    const delta = clean(b.imported - b.current);
    push(b.geraetId, {
      kind: 'update',
      ref: bestandCol(groupId).doc(b.bestandId),
      data: { anzahl: FieldValue.increment(delta), ...stamp },
    });
    book(b.geraetId, b.bestandId, 'import', delta);
    addDelta(b.geraetId, delta);
    summary.bestandUpdated += 1;
  }

  for (const d of plan.deviations) {
    if (!accept.has(deviationKey(d))) {
      rejected.add(d.geraetId);
      summary.deviationsRejected += 1;
      continue;
    }
    const delta = clean(d.imported - d.current);
    if (d.bestandId) {
      push(d.geraetId, {
        kind: 'update',
        ref: bestandCol(groupId).doc(d.bestandId),
        data: { anzahl: FieldValue.increment(delta), ...stamp },
      });
      book(d.geraetId, d.bestandId, 'inventur', delta);
    } else {
      const parsedBestand = parsedByGeraetId
        .get(d.geraetId)
        ?.bestaende.find((b) => b.lagerortKey === d.lagerortKey);
      if (!parsedBestand) continue;
      createBestand(d.geraetId, parsedBestand, d.imported, 'inventur');
    }
    addDelta(d.geraetId, delta);
    summary.deviationsAccepted += 1;
  }

  // Vorhandene Artikel: Stammdaten, Gesamtbestand und Importzeitpunkt in einem
  // Schreibvorgang je Artikel.
  const crossed: NachbestellungItem[] = [];
  const updatesById = new Map(plan.update.map((u) => [u.geraetId, u]));
  const existingIds = new Set([...plan.update.map((u) => u.geraetId), ...plan.unchanged]);
  for (const geraetId of existingIds) {
    const geraet = geraeteById.get(geraetId);
    if (!geraet) continue;
    const patch: Record<string, unknown> = {};
    const update = updatesById.get(geraetId);
    if (update) {
      Object.assign(patch, compact({ ...update.stammdaten }), stamp);
      for (const field of update.removedFields) patch[field] = FieldValue.delete();
    }
    if (!rejected.has(geraetId)) patch.importedAt = actor.now;

    const delta = deltas.get(geraetId) ?? 0;
    if (delta !== 0) {
      const stock = stockPatch(geraet, delta, actor);
      Object.assign(patch, stock.patch, { bestandGesamt: FieldValue.increment(delta) });
      if (stock.crossed) crossed.push(stock.crossed);
    }
    if (Object.keys(patch).length === 0) continue;
    push(geraetId, {
      kind: 'set',
      ref: geraetCol(groupId).doc(geraetId),
      data: patch,
      merge: true,
    });
  }

  // Batches packen — die Schreibvorgänge eines Artikels nie getrennt.
  const batches: ImportWrite[][] = [];
  let current: ImportWrite[] = [];
  for (const list of writes.values()) {
    if (current.length > 0 && current.length + list.length > BATCH_LIMIT) {
      batches.push(current);
      current = [];
    }
    if (list.length > BATCH_LIMIT) {
      // Ein Artikel mit Hunderten Lagerorten — kommt praktisch nicht vor. Dann
      // lieber aufteilen als am Limit von Firestore scheitern.
      for (let i = 0; i < list.length; i += BATCH_LIMIT) {
        batches.push(list.slice(i, i + BATCH_LIMIT));
      }
      continue;
    }
    current.push(...list);
  }
  if (current.length > 0) batches.push(current);

  for (const ops of batches) {
    const batch = firestore.batch();
    for (const op of ops) {
      if (op.kind === 'update') batch.update(op.ref, op.data);
      else if (op.merge) batch.set(op.ref, op.data, { merge: true });
      else batch.set(op.ref, op.data);
    }
    await batch.commit();
  }

  if (crossed.length > 0) await notifyAfterCommit({ groupId, items: crossed });
  return summary;
}
