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
  formatCharge,
  formatLagerort,
  GERAET_BESTAND_COLLECTION,
  GERAET_BUCHUNG_COLLECTION,
  GERAET_CHARGE_MAX_TEXT,
  GERAET_CHARGEN_MAX,
  GERAET_COLLECTION,
  GERAET_EINSATZ_COLLECTION,
  GERAET_LAGERORT_UNBESTIMMT,
  GERAET_MATERIAL_TYPEN,
  GERAET_SET_COLLECTION,
  isBestandBuchung,
  isContainer,
  isValidMenge,
  lagerortKey,
  type Geraet,
  type GeraetBestand,
  type GeraetBuchung,
  type GeraetBuchungArt,
  type GeraetCharge,
  type GeraetChargeTeil,
  type GeraetEinsatz,
  type GeraetFeldAenderung,
  type GeraetLagerort,
  type GeraetSet,
  type GeraetSetItem,
} from '../../common/geraet';
import {
  applyStockDelta,
  capVerbrauchTarget,
  isOutdatedEntry,
  reconcileVerbrauch,
  type VerbrauchExpectation,
  type VerbrauchTarget,
} from '../../common/geraetBestandLogic';
import {
  allocateFefo,
  applyChargeDelta,
  chargePots,
  restOhneCharge,
  shrinkChargen,
  sortFefo,
  validChargenTeile,
} from '../../common/geraetCharge';
import {
  GERAET_IMPORT_FIELDS,
  GERAET_IMPORT_MAX_BYTES,
  parseGeraetExport,
  planGeraetImport,
  type GeraetImportPlan,
  type ParsedGeraet,
  type ParsedGeraetBestand,
} from '../../common/geraetImport';
import { diffFields } from '../../common/geraetProtokoll';
import {
  normalizeSetCodes,
  validateGeraetSet,
  type GeraetSetInput,
} from '../../common/geraetSet';
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
  /** Anzeigename für das Protokoll: Name, sonst E-Mail, sonst leer. */
  name: string;
  now: string;
}

function actorOf(session: Session): Actor {
  return {
    uid: session.user.id,
    name: session.user.name ?? session.user.email ?? '',
    now: new Date().toISOString(),
  };
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

function setCol(groupId: string) {
  return groupRef(groupId).collection(GERAET_SET_COLLECTION);
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

type NewBuchung = Omit<GeraetBuchung, 'id' | 'createdAt' | 'createdBy' | 'createdByName'>;

function buchungDoc(input: NewBuchung, actor: Actor): Omit<GeraetBuchung, 'id'> {
  return compact({
    ...input,
    bemerkung: trimmed(input.bemerkung),
    createdAt: actor.now,
    createdBy: actor.uid,
    // Ohne Namen kein leerer Text — die Anzeige zeigt dann „—".
    createdByName: trimmed(actor.name),
  });
}

/** Ein Protokolleintrag ohne Mengenänderung (`menge: 0`). */
function protokollDoc(
  input: Omit<NewBuchung, 'menge'>,
  actor: Actor,
): Omit<GeraetBuchung, 'id'> {
  return buchungDoc({ ...input, menge: 0 }, actor);
}

/**
 * Der Lagerort als Text zum Buchungszeitpunkt — die Historie bleibt lesbar,
 * auch wenn der Lagerort später umbenannt oder gelöscht wird.
 */
function lagerortTextOf(lagerort: GeraetLagerort | undefined): string | undefined {
  return lagerort ? trimmed(formatLagerort(lagerort)) : undefined;
}

/** Protokollierte Angaben eines Lagerorts: das Ziel (formatiert) und die Bemerkung. */
const LAGERORT_LOG_FIELDS = ['lagerort', 'bemerkung'] as const;

type LagerortLog = { lagerort?: GeraetLagerort; bemerkung?: string };

function lagerortLog(lagerort: GeraetLagerort | undefined): LagerortLog {
  return { lagerort, bemerkung: lagerort?.bemerkung };
}

function diffLagerort(
  before: GeraetLagerort | undefined,
  after: GeraetLagerort | undefined,
): GeraetFeldAenderung[] {
  return diffFields<LagerortLog>(
    before ? lagerortLog(before) : undefined,
    lagerortLog(after),
    LAGERORT_LOG_FIELDS,
  );
}

/**
 * Die Aufteilung eines Bestands als Feldwert: eine leere Map wird gelöscht
 * statt als `{}` stehen zu bleiben — „keine Chargen" hat genau eine Form.
 */
function chargenValue(map: Record<string, number>): Record<string, number> | FieldValue {
  return Object.keys(map).length > 0 ? map : FieldValue.delete();
}

/** Gleiche Aufteilung? Fehlende Einträge und `0` gelten als gleich. */
function sameChargen(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const key of keys) {
    if ((a?.[key] ?? 0) !== (b?.[key] ?? 0)) return false;
  }
  return true;
}

/**
 * Chargen gibt es nur bei Verbrauchsmaterial. Ein Gerät (Kupplungsschlüssel)
 * hat keine Lose, und eine Chargenangabe dort ist ein Fehler im Aufrufer.
 */
function assertConsumable(geraet: Geraet): void {
  if (geraet.verbrauchsmaterial !== true) {
    throw new ApiException(`geraet ${geraet.id} is not a consumable — no chargen`, {
      status: 400,
    });
  }
}

/**
 * Eine Charge des Artikels, die noch bebucht werden darf. Eine archivierte
 * Charge ist ausgebucht oder leer — ein Zugang oder eine Umbuchung darauf
 * holte sie still zurück, ohne dass sie in den Listen wieder auftaucht.
 */
function activeChargeOf(geraet: Geraet, chargeId: string): GeraetCharge {
  const charge = (geraet.chargen ?? []).find((c) => c.id === chargeId);
  if (!charge) {
    throw new ApiException(`charge ${chargeId} does not belong to geraet ${geraet.id}`, {
      status: 400,
    });
  }
  if (charge.archiviert) {
    throw new ApiException(`charge ${chargeId} is archived`, { status: 400 });
  }
  return charge;
}

/**
 * Prüft eine Aufteilung aus dem Browser (chargeId → Menge): jede Menge gültig
 * (`isValidMenge`), jede Charge eine des Artikels. Eine archivierte Charge ist
 * nur mit `0` erlaubt — sie darf geleert, aber nicht wieder befüllt werden.
 * Ergebnis ohne Nullen.
 */
function sanitizeChargenMap(
  geraet: Geraet,
  input: unknown,
): Record<string, number> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiException('invalid chargen', { status: 400 });
  }
  const known = new Map((geraet.chargen ?? []).map((c) => [c.id, c]));
  const result: Record<string, number> = {};
  for (const [chargeId, menge] of Object.entries(input as Record<string, unknown>)) {
    if (!isValidMenge(menge)) {
      throw new ApiException(`invalid menge for charge ${chargeId}`, { status: 400 });
    }
    const charge = known.get(chargeId);
    if (!charge) {
      throw new ApiException(`charge ${chargeId} does not belong to geraet ${geraet.id}`, {
        status: 400,
      });
    }
    if (menge === 0) continue;
    if (charge.archiviert) {
      throw new ApiException(`charge ${chargeId} is archived`, { status: 400 });
    }
    result[chargeId] = menge;
  }
  return result;
}

/**
 * Die Töpfe beider Aufteilungen in Anzeige-Reihenfolge: die Chargen des
 * Artikels nach FEFO, danach unbekannte Einträge (sollte es nicht geben).
 */
function chargeIdsInOrder(
  geraet: Geraet,
  ...maps: (Record<string, number> | undefined)[]
): string[] {
  const present = new Set(maps.flatMap((m) => Object.keys(m ?? {})));
  const ordered = sortFefo(geraet.chargen ?? [])
    .map((c) => c.id)
    .filter((id) => present.has(id));
  return [...ordered, ...[...present].filter((id) => !ordered.includes(id))];
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
 * Ebenso `chargen`: Die Chargen pflegt `saveGeraetCharge` je Eintrag in einer
 * Transaktion — ein ganzes Array aus dem Dialog überschriebe eine Charge, die
 * ein Zugang mit neuer Charge gerade angelegt hat.
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
  'vorlage',
  'zubehoer',
  'lebensdauerEinheit',
  'versicherung',
  'polizzenummer',
  'kasko',
] as const satisfies readonly (keyof Geraet)[];

const DATE_FIELDS = ['anschaffungsDatum', 'verfuegbarVon', 'verfuegbarBis'] as const satisfies
  readonly (keyof Geraet)[];

/**
 * Die Stammdaten, deren Änderung protokolliert wird: alles, was `geraetPatch`
 * schreibt — ohne die berechneten Felder und die Zeitstempel.
 */
const STAMMDATEN_FIELDS = [
  'bezeichnung',
  ...TEXT_FIELDS,
  'materialTyp',
  'einheitVerwendungsnachweis',
  'barcodes',
  'baujahr',
  ...DATE_FIELDS,
  'baumonat',
  'lebensdauer',
  'einkaufspreis',
  'mindestbestand',
  'ablaufVorlaufTage',
  'verbrauchsmaterial',
  'active',
] as const satisfies readonly (keyof Geraet)[];

/** `YYYY-MM-DD` und ein echtes Datum — sonst `undefined` (löschen). */
function isoDate(value: unknown): string | undefined {
  const text = trimmed(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text) ? text : undefined;
}

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
  for (const field of DATE_FIELDS) {
    if (has(field)) patch[field] = isoDate(input[field]);
  }
  if (has('baumonat')) {
    const value = input.baumonat;
    patch.baumonat =
      isFiniteNumber(value) && Number.isInteger(value) && value >= 1 && value <= 12
        ? value
        : undefined;
  }
  if (has('lebensdauer')) {
    const value = input.lebensdauer;
    patch.lebensdauer = isFiniteNumber(value) && value > 0 ? value : undefined;
  }
  if (has('einkaufspreis')) {
    const value = input.einkaufspreis;
    patch.einkaufspreis = isFiniteNumber(value) && value >= 0 ? value : undefined;
  }
  if (has('mindestbestand')) {
    const value = input.mindestbestand;
    patch.mindestbestand = isFiniteNumber(value) && value >= 0 ? value : undefined;
  }
  if (has('ablaufVorlaufTage')) {
    // Ganze Tage, höchstens zehn Jahre — ohne Angabe gilt der Standard.
    const value = input.ablaufVorlaufTage;
    patch.ablaufVorlaufTage =
      isFiniteNumber(value) && Number.isInteger(value) && value >= 0 && value <= 3650
        ? value
        : undefined;
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
    const data = compact({
      verbrauchsmaterial: false,
      active: true,
      ...patch,
      bestandGesamt: 0,
      nachbestellenSeit: stock.nachbestellenSeit ?? undefined,
      createdAt: actor.now,
      createdBy: actor.uid,
      updatedAt: actor.now,
      updatedBy: actor.uid,
    });
    const batch = firestore.batch();
    batch.set(ref, data);
    batch.set(
      buchungCol(groupId).doc(),
      protokollDoc(
        {
          geraetId: ref.id,
          art: 'angelegt',
          aenderungen: diffFields<Geraet>(undefined, data as Partial<Geraet>, STAMMDATEN_FIELDS),
        },
        actor,
      ),
    );
    await batch.commit();
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
    const after: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(geraetPatch(input))) {
      patch[key] = value === undefined ? FieldValue.delete() : value;
      after[key] = value;
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
    const aenderungen = diffFields<Geraet>(current, after as Partial<Geraet>, STAMMDATEN_FIELDS);
    if (aenderungen.length > 0) {
      tx.set(
        buchungCol(groupId).doc(),
        protokollDoc({ geraetId: id, art: 'stammdaten', aenderungen }, actor),
      );
    }
  });
  return { id };
}

/** Höchstzahl der Schreibvorgänge je Batch — Firestore erlaubt 500. */
const BATCH_LIMIT = 450;

/**
 * Markiert mehrere Artikel auf einmal als Verbrauchsmaterial oder als Gerät.
 *
 * Der Sybos-Export sagt nicht, was verbraucht wird — nach einem Import ist
 * jeder Artikel ein Gerät und die Verbrauchsartikel sind von Hand
 * auszuwählen. Beim Abschalten fallen wie in `saveGeraet` Mindestbestand und
 * offene Nachbestellung weg; sie gelten nur für Verbrauchsmaterial. Artikel,
 * die den Wert schon haben, und unbekannte IDs bleiben unberührt.
 */
export async function setGeraeteVerbrauchsmaterial(
  groupId: string,
  geraetIds: string[],
  verbrauchsmaterial: boolean,
): Promise<{ updated: number }> {
  const session = await actionFahrtenbuchManagerRequired(groupId);
  const actor = actorOf(session);
  if (!Array.isArray(geraetIds) || typeof verbrauchsmaterial !== 'boolean') {
    throw new ApiException('invalid verbrauchsmaterial selection', { status: 400 });
  }
  const ids = [...new Set(geraetIds)];
  for (const id of ids) assertSafeId(id, 'geraetId');

  const refs = ids.map((id) => geraetCol(groupId).doc(id));
  const snaps = await Promise.all(refs.map((ref) => ref.get()));
  const changed = snaps.filter(
    (snap) =>
      snap.exists &&
      !!(snap.data() as Partial<Geraet>).verbrauchsmaterial !== verbrauchsmaterial,
  );

  const patch: Record<string, unknown> = {
    verbrauchsmaterial,
    updatedAt: actor.now,
    updatedBy: actor.uid,
  };
  if (!verbrauchsmaterial) {
    patch.mindestbestand = FieldValue.delete();
    patch.nachbestellenSeit = FieldValue.delete();
  }
  // Je Artikel zwei Schreibvorgänge: das Update und sein Protokolleintrag.
  const perBatch = Math.floor(BATCH_LIMIT / 2);
  for (let i = 0; i < changed.length; i += perBatch) {
    const batch = firestore.batch();
    for (const snap of changed.slice(i, i + perBatch)) {
      const before = snap.data() as Partial<Geraet>;
      const after: Partial<Geraet> = {
        verbrauchsmaterial,
        mindestbestand: verbrauchsmaterial ? before.mindestbestand : undefined,
      };
      batch.update(snap.ref, patch);
      batch.set(
        buchungCol(groupId).doc(),
        protokollDoc(
          {
            geraetId: snap.id,
            art: 'stammdaten',
            aenderungen: diffFields<Geraet>(
              { verbrauchsmaterial: !!before.verbrauchsmaterial, mindestbestand: before.mindestbestand },
              after,
              ['verbrauchsmaterial', 'mindestbestand'],
            ),
          },
          actor,
        ),
      );
    }
    await batch.commit();
  }
  return { updated: changed.length };
}

/**
 * Löscht einen Artikel — oder deaktiviert ihn, wenn er schon gebucht wurde.
 *
 * Eine Mengenbuchung ist Protokoll und bleibt; ihr Artikel muss dafür lesbar
 * bleiben. Import-Buchungen zählen nicht: Sie sind nur die Herkunft des
 * Anfangsbestands und gehen mit dem Artikel. Ebenso reine Protokolleinträge
 * ohne Menge (Stammdaten, Chargen, Lagerorte …): Sie beschreiben nur den
 * Artikel selbst und werden mit ihm gelöscht.
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
  const hasRealBookings = bookings.docs.some((d) => {
    const art = (d.data() as GeraetBuchung).art;
    return isBestandBuchung(art) && art !== 'import';
  });
  if (hasRealBookings) {
    const current = snap.data() as Partial<Geraet>;
    const aenderungen = diffFields<Geraet>(
      { active: current.active !== false },
      { active: false },
      ['active'],
    );
    const batch = firestore.batch();
    batch.update(ref, { active: false, updatedAt: actor.now, updatedBy: actor.uid });
    // Schon deaktiviert: nichts Neues zu protokollieren.
    if (aenderungen.length > 0) {
      batch.set(
        buchungCol(groupId).doc(),
        protokollDoc({ geraetId, art: 'archiviert', aenderungen }, actor),
      );
    }
    await batch.commit();
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

// --- Chargen -----------------------------------------------------------------

/**
 * Eingabe einer Charge aus dem Browser. Ohne `id` wird angelegt, mit `id`
 * geändert. `archiviert`, `createdAt` und `createdBy` setzt nur der Server.
 */
export type GeraetChargeInput = Partial<
  Omit<GeraetCharge, 'archiviert' | 'createdAt' | 'createdBy'>
>;

const CHARGE_TEXT_FIELDS = [
  'bezeichnung',
  'produktionsNummer',
  'kommentar',
] as const satisfies readonly (keyof GeraetCharge)[];

const CHARGE_DATE_FIELDS = ['einkaufsDatum', 'ablaufDatum'] as const satisfies
  readonly (keyof GeraetCharge)[];

type ChargeFields = Pick<
  GeraetCharge,
  (typeof CHARGE_TEXT_FIELDS)[number] | (typeof CHARGE_DATE_FIELDS)[number]
>;

/** Die protokollierten Angaben einer Charge, in Anzeige-Reihenfolge. */
const CHARGE_LOG_FIELDS = [
  'bezeichnung',
  'produktionsNummer',
  'einkaufsDatum',
  'ablaufDatum',
  'kommentar',
] as const satisfies readonly (keyof ChargeFields)[];

/** Ein getrimmter Text bis `GERAET_CHARGE_MAX_TEXT` Zeichen, sonst 400. */
function limitedText(value: unknown, what: string): string | undefined {
  const text = trimmed(value);
  if (text !== undefined && text.length > GERAET_CHARGE_MAX_TEXT) {
    throw new ApiException(`invalid ${what}: too long`, { status: 400 });
  }
  return text;
}

/** Wirft 400, wenn der Artikel schon die Höchstzahl an Chargen hat. */
function assertChargeCapacity(chargen: GeraetCharge[]): void {
  if (chargen.length >= GERAET_CHARGEN_MAX) {
    throw new ApiException('invalid charge: too many chargen', { status: 400 });
  }
}

/**
 * Bereinigt eine Charge aus dem Browser: Texte getrimmt (leer fällt weg, zu
 * lang ist 400), Daten nur als `YYYY-MM-DD` (sonst verworfen — ein falsches
 * Ablaufdatum brächte die FEFO-Reihenfolge durcheinander). Alles andere wird
 * ignoriert.
 */
function sanitizeChargeInput(input: unknown): { id?: string; fields: ChargeFields } {
  if (!input || typeof input !== 'object') {
    throw new ApiException('invalid charge', { status: 400 });
  }
  const raw = input as Record<string, unknown>;
  const fields: ChargeFields = {};
  for (const field of CHARGE_TEXT_FIELDS) fields[field] = limitedText(raw[field], field);
  for (const field of CHARGE_DATE_FIELDS) fields[field] = isoDate(raw[field]);
  let id: string | undefined;
  if (raw.id !== undefined && raw.id !== null && raw.id !== '') {
    assertSafeId(raw.id, 'chargeId');
    id = raw.id;
  }
  return { id, fields: compact(fields) };
}

/** Eine neue Charge mit Server-ID und Ersteller. */
function newCharge(fields: ChargeFields, actor: Actor): GeraetCharge {
  return compact({
    ...fields,
    id: crypto.randomUUID(),
    createdAt: actor.now,
    createdBy: actor.uid,
  });
}

/** Das Array mit der Charge `chargeId` als archiviert. */
function archivedIn(chargen: GeraetCharge[], chargeId: string): GeraetCharge[] {
  return chargen.map((c) => (c.id === chargeId ? { ...c, archiviert: true } : c));
}

function chargeNotFound(geraetId: string, chargeId: string): ApiException {
  return notFound(`charge of geraet ${geraetId}`, chargeId);
}

/**
 * Ein Zugang beim Anlegen einer Charge: `bestandId` ist ein Lagerort des
 * Artikels, `null` der Lagerort „ohne Lagerort" (wird bei Bedarf angelegt).
 */
export interface GeraetChargeZugang {
  bestandId: string | null;
  menge: number;
}

/**
 * Prüft die Zugänge aus dem Browser: Menge größer 0, jeder Lagerort höchstens
 * einmal — zwei Zeilen für denselben Ort wären ein Tippfehler, keine Absicht.
 */
function sanitizeChargeZugaenge(input: unknown): GeraetChargeZugang[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    throw new ApiException('invalid zugaenge', { status: 400 });
  }
  const seen = new Set<string | null>();
  return input.map((raw) => {
    const { bestandId, menge } = (raw ?? {}) as Partial<GeraetChargeZugang>;
    if (bestandId !== null) assertSafeId(bestandId, 'bestandId');
    if (!isValidMenge(menge) || menge <= 0) {
      throw new ApiException('invalid zugang menge', { status: 400 });
    }
    if (seen.has(bestandId)) {
      throw new ApiException('invalid zugaenge: duplicate bestand', { status: 400 });
    }
    seen.add(bestandId);
    return { bestandId, menge };
  });
}

/**
 * Legt eine Charge an einem Verbrauchsmaterial an oder ändert sie.
 *
 * Die Chargen liegen als Array am Artikel; geschrieben wird in einer
 * Transaktion auf dem Artikel-Dokument, damit zwei gleichzeitige Änderungen
 * (oder ein Zugang mit neuer Charge) einander nicht überschreiben. Beim
 * Ändern ersetzt die Eingabe alle pflegbaren Felder — der Dialog schickt die
 * ganze Charge; Archiv-Kennzeichen und Ersteller bleiben.
 *
 * Beim Anlegen kann gleich die gelieferte Menge mitkommen (`zugaenge`): je
 * Lagerort ein Zugang auf die neue Charge, in derselben Transaktion — eine
 * Charge ohne Menge, deren Zugang danach scheitert, bliebe sonst halb stehen.
 * Ohne Lagerort landet die Menge am Lagerort „ohne Lagerort"; von dort wird
 * sie später umgebucht. Beim Ändern gibt es keinen Zugang (400).
 */
export async function saveGeraetCharge(
  groupId: string,
  geraetId: string,
  input: GeraetChargeInput,
  zugaenge?: GeraetChargeZugang[],
): Promise<{ id: string }> {
  const session = await actionFahrtenbuchManagerRequired(groupId);
  const actor = actorOf(session);
  assertSafeId(geraetId, 'geraetId');
  const { id: chargeId, fields } = sanitizeChargeInput(input);
  const zugangList = sanitizeChargeZugaenge(zugaenge);
  if (chargeId !== undefined && zugangList.length > 0) {
    throw new ApiException('invalid zugaenge: only for a new charge', { status: 400 });
  }

  const ref = geraetCol(groupId).doc(geraetId);
  const { id, crossed } = await firestore.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('geraet', geraetId);
    const geraet = geraetSnapshot(geraetId, snap.data());
    assertConsumable(geraet);

    // Erst alles lesen, dann schreiben — Firestore verlangt die Reihenfolge.
    const targets: { ref: DocumentReference; bestand?: GeraetBestand; menge: number }[] = [];
    for (const zugang of zugangList) {
      if (zugang.bestandId === null) {
        const found = await findBestaendeByKey(
          tx,
          groupId,
          geraetId,
          lagerortKey(GERAET_LAGERORT_UNBESTIMMT),
        );
        const existing = found.find((b) => b.archiviert !== true) ?? found[0];
        targets.push({
          ref: existing ? bestandCol(groupId).doc(existing.id) : bestandCol(groupId).doc(),
          bestand: existing,
          menge: zugang.menge,
        });
        continue;
      }
      const bestandRef = bestandCol(groupId).doc(zugang.bestandId);
      const bestandSnap = await tx.get(bestandRef);
      if (!bestandSnap.exists) throw notFound('bestand', zugang.bestandId);
      const bestand = bestandSnapshot(bestandSnap.id, bestandSnap.data());
      if (bestand.geraetId !== geraetId || bestand.archiviert === true) {
        throw new ApiException('invalid zugang: bestand of another geraet', { status: 400 });
      }
      targets.push({ ref: bestandRef, bestand, menge: zugang.menge });
    }

    const chargen = [...(geraet.chargen ?? [])];
    let id: string;
    let aenderungen: GeraetFeldAenderung[];
    if (chargeId === undefined) {
      assertChargeCapacity(chargen);
      const charge = newCharge(fields, actor);
      chargen.push(charge);
      id = charge.id;
      aenderungen = diffFields<ChargeFields>(undefined, fields, CHARGE_LOG_FIELDS);
    } else {
      const index = chargen.findIndex((c) => c.id === chargeId);
      if (index < 0) throw chargeNotFound(geraetId, chargeId);
      const old = chargen[index];
      chargen[index] = compact({
        ...fields,
        id: old.id,
        archiviert: old.archiviert,
        createdAt: old.createdAt,
        createdBy: old.createdBy,
      });
      id = chargeId;
      aenderungen = diffFields<ChargeFields>(old, fields, CHARGE_LOG_FIELDS);
    }
    // Neu angelegt immer, geändert nur bei einem echten Unterschied.
    if (chargeId === undefined || aenderungen.length > 0) {
      tx.set(
        buchungCol(groupId).doc(),
        protokollDoc(
          {
            geraetId,
            art: 'charge',
            chargeId: id,
            bemerkung: chargeId === undefined ? 'angelegt' : 'geändert',
            aenderungen: aenderungen.length > 0 ? aenderungen : undefined,
          },
          actor,
        ),
      );
    }

    const stamp = { updatedAt: actor.now, updatedBy: actor.uid };
    let delta = 0;
    for (const target of targets) {
      const { bestand, menge } = target;
      if (!bestand) {
        const place = GERAET_LAGERORT_UNBESTIMMT;
        tx.create(target.ref, {
          geraetId,
          lagerortKey: lagerortKey(place),
          lagerort: place,
          anzahl: menge,
          chargen: { [id]: menge },
          ...stamp,
        });
        delta += menge;
      } else if (bestand.archiviert === true) {
        // Ein archivierter „ohne Lagerort" kommt zurück, wie beim Anlegen
        // eines Lagerorts — sein alter Rest zählt nicht mehr.
        tx.update(target.ref, {
          anzahl: menge,
          chargen: { [id]: menge },
          archiviert: FieldValue.delete(),
          ...stamp,
        });
        delta += menge - (bestand.anzahl ?? 0);
      } else {
        tx.update(target.ref, {
          anzahl: clean((bestand.anzahl ?? 0) + menge),
          chargen: chargenValue(applyChargeDelta(bestand.chargen, id, menge)),
          ...stamp,
        });
        delta += menge;
      }
      tx.set(
        buchungCol(groupId).doc(),
        buchungDoc(
          {
            geraetId,
            bestandId: target.ref.id,
            art: 'zugang',
            menge,
            chargeId: id,
            lagerortText: lagerortTextOf(bestand?.lagerort ?? GERAET_LAGERORT_UNBESTIMMT),
          },
          actor,
        ),
      );
    }

    if (targets.length === 0) {
      tx.update(ref, { chargen, ...stamp });
      return { id, crossed: undefined };
    }
    const stock = stockPatch(geraet, clean(delta), actor);
    tx.update(ref, { ...stock.patch, chargen });
    return { id, crossed: stock.crossed };
  });

  if (crossed) await notifyAfterCommit({ groupId, items: [crossed] });
  return { id };
}

/**
 * Archiviert eine Charge — nur, wenn an keinem (nicht archivierten) Lagerort
 * mehr etwas von ihr liegt. Sonst verschwände Bestand aus den Listen, der
 * physisch noch im Lager steht; dafür gibt es „Charge ausbuchen"
 * (`ausbuchenGeraetCharge`), das den Rest als Inventur protokolliert.
 */
export async function archiveGeraetCharge(
  groupId: string,
  geraetId: string,
  chargeId: string,
): Promise<{ id: string }> {
  const session = await actionFahrtenbuchManagerRequired(groupId);
  const actor = actorOf(session);
  assertSafeId(geraetId, 'geraetId');
  assertSafeId(chargeId, 'chargeId');

  const ref = geraetCol(groupId).doc(geraetId);
  await firestore.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('geraet', geraetId);
    const geraet = geraetSnapshot(geraetId, snap.data());
    const chargen = geraet.chargen ?? [];
    const charge = chargen.find((c) => c.id === chargeId);
    if (!charge) throw chargeNotFound(geraetId, chargeId);

    const bestaende = await tx.get(bestandCol(groupId).where('geraetId', '==', geraetId));
    const withStock = bestaende.docs
      .map((d) => bestandSnapshot(d.id, d.data()))
      .filter((b) => !b.archiviert && (b.chargen?.[chargeId] ?? 0) !== 0);
    if (withStock.length > 0) {
      throw new ApiException(
        `charge ${chargeId} still has stock at ${withStock.length} bestand(e) — use ausbuchenGeraetCharge`,
        { status: 409 },
      );
    }
    tx.update(ref, {
      chargen: archivedIn(chargen, chargeId),
      updatedAt: actor.now,
      updatedBy: actor.uid,
    });
    if (!charge.archiviert) {
      tx.set(
        buchungCol(groupId).doc(),
        protokollDoc({ geraetId, art: 'charge', chargeId, bemerkung: 'archiviert' }, actor),
      );
    }
  });
  return { id: chargeId };
}

/**
 * Bucht eine Charge an allen Lagerorten aus (abgelaufen, zurückgerufen,
 * entsorgt) und archiviert sie danach.
 *
 * Je Lagerort mit Bestand dieser Charge eine Inventur-Buchung über die
 * Menge der Charge, mit `chargeId` — die Buchung belegt, wohin die Menge
 * verschwunden ist. `anzahl` und `bestandGesamt` sinken um dieselbe Menge, die
 * Nachbestellmail folgt wie bei jeder Buchung nach dem Commit. Ein negativer
 * Topf wird nur aus der Aufteilung entfernt — ohne Buchung, `anzahl` bleibt.
 */
export async function ausbuchenGeraetCharge(
  groupId: string,
  geraetId: string,
  chargeId: string,
  bemerkung?: string,
): Promise<{ id: string; bookings: number }> {
  const session = await actionFahrtenbuchManagerRequired(groupId);
  const actor = actorOf(session);
  assertSafeId(geraetId, 'geraetId');
  assertSafeId(chargeId, 'chargeId');
  const zusatz = limitedText(bemerkung, 'bemerkung');

  const ref = geraetCol(groupId).doc(geraetId);
  const { bookings, crossed } = await firestore.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('geraet', geraetId);
    const geraet = geraetSnapshot(geraetId, snap.data());
    const chargen = geraet.chargen ?? [];
    const charge = chargen.find((c) => c.id === chargeId);
    if (!charge) throw chargeNotFound(geraetId, chargeId);
    const bestaendeSnap = await tx.get(bestandCol(groupId).where('geraetId', '==', geraetId));
    const bestaende = bestaendeSnap.docs.map((d) => bestandSnapshot(d.id, d.data()));

    const text = `Charge ausgebucht: ${formatCharge(charge)}${zusatz ? ` – ${zusatz}` : ''}`;
    const stamp = { updatedAt: actor.now, updatedBy: actor.uid };
    let total = 0;
    let count = 0;
    for (const b of bestaende) {
      if (!b.chargen || !Object.hasOwn(b.chargen, chargeId)) continue;
      const menge = b.chargen[chargeId];
      const map = { ...b.chargen };
      delete map[chargeId];
      if (!isFiniteNumber(menge) || menge <= 0) {
        // Ein negativer (oder kaputter) Topf ist keine Ware im Lager: Er fällt
        // nur aus der Aufteilung, `anzahl` bleibt und es gibt keine Buchung.
        tx.update(bestandCol(groupId).doc(b.id), { chargen: chargenValue(map), ...stamp });
        continue;
      }
      tx.update(bestandCol(groupId).doc(b.id), {
        anzahl: clean((b.anzahl ?? 0) - menge),
        chargen: chargenValue(map),
        ...stamp,
      });
      tx.set(
        buchungCol(groupId).doc(),
        buchungDoc(
          {
            geraetId,
            bestandId: b.id,
            art: 'inventur',
            menge: -menge,
            chargeId,
            bemerkung: text,
            lagerortText: lagerortTextOf(b.lagerort),
          },
          actor,
        ),
      );
      total = clean(total - menge);
      count += 1;
    }

    const patch: Record<string, unknown> = { chargen: archivedIn(chargen, chargeId), ...stamp };
    let stockCrossed: NachbestellungItem | undefined;
    if (total !== 0) {
      const stock = stockPatch(geraet, total, actor);
      Object.assign(patch, stock.patch);
      stockCrossed = stock.crossed;
    }
    tx.update(ref, patch);
    if (!charge.archiviert) {
      tx.set(
        buchungCol(groupId).doc(),
        protokollDoc({ geraetId, art: 'charge', chargeId, bemerkung: 'archiviert' }, actor),
      );
    }
    return { bookings: count, crossed: stockCrossed };
  });

  if (crossed) await notifyAfterCommit({ groupId, items: [crossed] });
  return { id: chargeId, bookings };
}

// --- Sets --------------------------------------------------------------------

/** Höchstzahl der Inhalte und Codes eines Sets — schützt die Dokumentgröße. */
const SET_MAX_ENTRIES = 200;

/**
 * Die Eingabe aus dem Browser in die Form, die `validateGeraetSet` prüft:
 * IDs werden Teil von Dokumentpfaden und müssen sicher sein, Texte getrimmt,
 * Codes normalisiert.
 */
function sanitizeSetInput(input: unknown): GeraetSetInput {
  if (!input || typeof input !== 'object') {
    throw new ApiException('invalid geraetSet', { status: 400 });
  }
  const raw = input as Partial<GeraetSetInput>;
  const inhalt: unknown[] = Array.isArray(raw.inhalt) ? raw.inhalt : [];
  const codes = Array.isArray(raw.codes)
    ? raw.codes.filter((c): c is string => typeof c === 'string')
    : [];
  if (inhalt.length > SET_MAX_ENTRIES || codes.length > SET_MAX_ENTRIES) {
    throw new ApiException('invalid geraetSet: too many entries', { status: 400 });
  }
  const items = inhalt.map((item): GeraetSetItem => {
    const { geraetId, menge, bestandId } = (item ?? {}) as Partial<GeraetSetItem>;
    assertSafeId(geraetId, 'geraetId');
    if (bestandId !== undefined && bestandId !== '') assertSafeId(bestandId, 'bestandId');
    return compact({
      geraetId,
      menge: menge === undefined || menge === null ? undefined : menge,
      bestandId: bestandId || undefined,
    });
  });
  const artikelId = trimmed(raw.sybosSetArtikelId);
  if (artikelId) assertSafeId(artikelId, 'sybosSetArtikelId');
  return {
    id: raw.id || undefined,
    name: trimmed(raw.name) ?? '',
    sybosSetArtikelId: artikelId,
    codes: normalizeSetCodes(codes),
    inhalt: items,
    active: raw.active !== false,
    bemerkung: trimmed(raw.bemerkung),
  };
}

type SetMembership = Pick<GeraetSet, 'inhalt' | 'sybosSetArtikelId'>;

/**
 * Die Protokolleinträge einer Änderung der Set-Zugehörigkeit: je Artikel, der
 * hinzukommt oder wegfällt, und am gebundenen Set-Artikel. `after` fehlt beim
 * Löschen des Sets. Eine Änderung nur am Namen, an Codes oder am Lagerort
 * eines Inhalts ist keine Änderung der Zugehörigkeit.
 */
function setMembershipEntries(
  name: string,
  before: SetMembership | undefined,
  after: SetMembership | undefined,
): { geraetId: string; bemerkung: string }[] {
  const text = (what: string) => `Set „${name}": ${what}`;
  const beforeIds = new Set((before?.inhalt ?? []).map((i) => i.geraetId));
  const afterIds = new Set((after?.inhalt ?? []).map((i) => i.geraetId));
  const entries: { geraetId: string; bemerkung: string }[] = [];
  const boundBefore = before?.sybosSetArtikelId;
  const boundAfter = after?.sybosSetArtikelId;

  if (!after) {
    for (const id of beforeIds) entries.push({ geraetId: id, bemerkung: text('gelöscht') });
    if (boundBefore) entries.push({ geraetId: boundBefore, bemerkung: text('gelöscht') });
    return entries;
  }

  const added = [...afterIds].filter((id) => !beforeIds.has(id));
  const removed = [...beforeIds].filter((id) => !afterIds.has(id));
  for (const id of added) entries.push({ geraetId: id, bemerkung: text('hinzugefügt') });
  for (const id of removed) entries.push({ geraetId: id, bemerkung: text('entfernt') });
  if (boundBefore !== boundAfter) {
    if (boundAfter) entries.push({ geraetId: boundAfter, bemerkung: text('verknüpft') });
    if (boundBefore) {
      entries.push({ geraetId: boundBefore, bemerkung: text('Verknüpfung gelöst') });
    }
  } else if (boundAfter && (added.length > 0 || removed.length > 0)) {
    entries.push({ geraetId: boundAfter, bemerkung: text('Inhalt geändert') });
  }
  return entries;
}

/**
 * Legt ein Set an oder ändert es.
 *
 * Geprüft wird mit derselben Logik wie im Dialog (`validateGeraetSet`), aber
 * gegen den Stand der Gruppe am Server — einschließlich der Eindeutigkeit der
 * Codes über Artikel und andere aktive Sets. Gelesen wird die ganze Gruppe;
 * bei einigen hundert Artikeln ist das günstiger als je Code eine Abfrage.
 */
export async function saveGeraetSet(
  groupId: string,
  input: GeraetSetInput,
): Promise<{ id: string }> {
  const session = await actionFahrtenbuchManagerRequired(groupId);
  const actor = actorOf(session);
  const clean = sanitizeSetInput(input);
  const id = clean.id;
  if (id !== undefined) assertSafeId(id, 'setId');

  const [geraeteSnap, bestandSnap, setSnap] = await Promise.all([
    geraetCol(groupId).get(),
    bestandCol(groupId).get(),
    setCol(groupId).get(),
  ]);
  const geraete = geraeteSnap.docs.map((d) => geraetSnapshot(d.id, d.data()));
  const bestaende = bestandSnap.docs
    .map((d) => bestandSnapshot(d.id, d.data()))
    .filter((b) => b.archiviert !== true);
  const sets = setSnap.docs.map((d) => ({ ...(d.data() as GeraetSet), id: d.id }));
  if (id !== undefined && !sets.some((s) => s.id === id)) throw notFound('geraetSet', id);

  const errors = validateGeraetSet(clean, { geraete, sets, bestaende });
  if (errors.length > 0) {
    throw new ApiException(`invalid geraetSet: ${errors.map((e) => e.code).join(', ')}`, {
      status: 400,
    });
  }

  const fields = {
    name: clean.name,
    codes: clean.codes,
    inhalt: clean.inhalt,
    active: clean.active,
    updatedAt: actor.now,
    updatedBy: actor.uid,
  };
  // Das Set und die Protokolleinträge in einem Batch: höchstens 2 × 200
  // Inhalte plus Set-Artikel — unter dem Limit.
  const batch = firestore.batch();
  const ref = id === undefined ? setCol(groupId).doc() : setCol(groupId).doc(id);
  if (id === undefined) {
    batch.set(
      ref,
      compact({
        ...fields,
        sybosSetArtikelId: clean.sybosSetArtikelId,
        bemerkung: clean.bemerkung,
        createdAt: actor.now,
        createdBy: actor.uid,
      }),
    );
  } else {
    batch.update(ref, {
      ...fields,
      sybosSetArtikelId: clean.sybosSetArtikelId ?? FieldValue.delete(),
      bemerkung: clean.bemerkung ?? FieldValue.delete(),
    });
  }
  const known = new Set(geraete.map((g) => g.id));
  const before = id === undefined ? undefined : sets.find((s) => s.id === id);
  for (const entry of setMembershipEntries(clean.name, before, clean)) {
    // Ein inzwischen gelöschter Artikel bekommt keinen verwaisten Eintrag.
    if (!known.has(entry.geraetId)) continue;
    batch.set(
      buchungCol(groupId).doc(),
      protokollDoc({ geraetId: entry.geraetId, art: 'set', bemerkung: entry.bemerkung }, actor),
    );
  }
  await batch.commit();
  return { id: ref.id };
}

/**
 * Löscht ein Set. Einträge im Einsatz behalten `setName`; ihr `setId` zeigt
 * danach ins Leere — gruppiert wird über `setZuordnungId`.
 */
export async function deleteGeraetSet(
  groupId: string,
  setId: string,
): Promise<{ id: string }> {
  const session = await actionFahrtenbuchManagerRequired(groupId);
  const actor = actorOf(session);
  assertSafeId(setId, 'setId');
  const ref = setCol(groupId).doc(setId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('geraetSet', setId);
  const set = snap.data() as GeraetSet;
  const entries = setMembershipEntries(set.name, set, undefined);
  // Wie in `saveGeraetSet`: Ein inzwischen gelöschter Artikel bekommt keinen
  // verwaisten Eintrag. Die IDs stammen aus dem gespeicherten Set; geprüft
  // wird trotzdem, bevor sie Teil eines Pfads werden.
  const ids = [...new Set(entries.map((e) => e.geraetId))];
  for (const id of ids) assertSafeId(id, 'geraetId');
  const articleSnaps =
    ids.length > 0
      ? await firestore.getAll(...ids.map((id) => geraetCol(groupId).doc(id)))
      : [];
  const known = new Set(articleSnaps.filter((s) => s.exists).map((s) => s.id));
  const batch = firestore.batch();
  batch.delete(ref);
  for (const entry of entries) {
    if (!known.has(entry.geraetId)) continue;
    batch.set(
      buchungCol(groupId).doc(),
      protokollDoc({ geraetId: entry.geraetId, art: 'set', bemerkung: entry.bemerkung }, actor),
    );
  }
  await batch.commit();
  return { id: setId };
}

// --- Bestand -----------------------------------------------------------------

/**
 * Legt einen Lagerort für einen Artikel an. Eine Anfangsmenge wird als
 * `inventur` gebucht — sie ist ein gezählter Ist-Wert. Das Anlegen selbst
 * steht immer als Protokolleintrag `lagerort` in der Historie, auch mit
 * Anfangsmenge: So sieht jeder Lagerort gleich aus.
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
  const { id, crossed } = await firestore.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(geraetRef);
    if (!snap.exists) throw notFound('geraet', geraetId);
    await resolveContainer(tx, groupId, geraetId, place);
    const duplicates = await findBestaendeByKey(tx, groupId, geraetId, key);
    // Ein archivierter Lagerort mit demselben Schlüssel kommt zurück — ein
    // zweiter daneben wäre beim nächsten Import nicht unterscheidbar.
    const archived = duplicates.find((b) => b.archiviert === true);
    if (duplicates.length > 0 && !archived) {
      throw new ApiException(`bestand ${key} exists for geraet ${geraetId}`, {
        status: 409,
      });
    }
    const geraet = geraetSnapshot(geraetId, snap.data());
    const stamp = { updatedAt: actor.now, updatedBy: actor.uid };

    let ref: DocumentReference;
    let delta = menge;
    if (archived) {
      ref = bestandCol(groupId).doc(archived.id);
      delta = clean(menge - (archived.anzahl ?? 0));
      tx.update(ref, { lagerort: place, anzahl: menge, archiviert: FieldValue.delete(), ...stamp });
    } else {
      ref = bestandCol(groupId).doc();
      tx.create(ref, { geraetId, lagerortKey: key, lagerort: place, anzahl: menge, ...stamp });
    }
    const lagerortText = lagerortTextOf(place);
    tx.set(
      buchungCol(groupId).doc(),
      protokollDoc(
        {
          geraetId,
          bestandId: ref.id,
          art: 'lagerort',
          bemerkung: 'angelegt',
          lagerortText,
          aenderungen: diffLagerort(undefined, place),
        },
        actor,
      ),
    );
    if (delta === 0) return { id: ref.id, crossed: undefined };
    tx.set(
      buchungCol(groupId).doc(),
      buchungDoc(
        { geraetId, bestandId: ref.id, art: 'inventur', menge: delta, lagerortText },
        actor,
      ),
    );
    const stock = stockPatch(geraet, delta, actor);
    tx.update(geraetRef, stock.patch);
    return { id: ref.id, crossed: stock.crossed };
  });

  if (crossed) await notifyAfterCommit({ groupId, items: [crossed] });
  return { id };
}

/**
 * Setzt bei einem Container-Lagerort die Bezeichnung vom Container-Artikel —
 * nicht aus dem Browser —, und nur ein Artikel der Kategorie „Container" taugt
 * als Lagerort.
 */
async function resolveContainer(
  tx: Transaction,
  groupId: string,
  geraetId: string,
  place: GeraetLagerort,
): Promise<void> {
  if (!place.containerId) return;
  if (place.containerId === geraetId) {
    throw new ApiException('invalid lagerort: container cannot hold itself', { status: 400 });
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

async function findBestaendeByKey(
  tx: Transaction,
  groupId: string,
  geraetId: string,
  key: string,
): Promise<GeraetBestand[]> {
  const snap = await tx.get(
    bestandCol(groupId).where('geraetId', '==', geraetId).where('lagerortKey', '==', key),
  );
  return snap.docs.map((d) => bestandSnapshot(d.id, d.data()));
}

/**
 * Ändert den Lagerort eines Bestands — Menge und Buchungen bleiben, sie hängen
 * an der ID. Der neue Schlüssel ist ab dann die Import-Identität: Führt Sybos
 * den alten Lagerort weiter, legt der nächste Import ihn wieder an.
 */
export async function updateGeraetBestand(
  groupId: string,
  bestandId: string,
  lagerort: GeraetLagerort,
): Promise<{ id: string }> {
  const session = await actionFahrtenbuchManagerRequired(groupId);
  const actor = actorOf(session);
  assertSafeId(bestandId, 'bestandId');
  const place = sanitizeLagerort(lagerort);
  const key = lagerortKey(place);

  const ref = bestandCol(groupId).doc(bestandId);
  await firestore.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('bestand', bestandId);
    const current = bestandSnapshot(bestandId, snap.data());
    assertSafeId(current.geraetId, 'geraetId');
    await resolveContainer(tx, groupId, current.geraetId, place);
    const duplicates = await findBestaendeByKey(tx, groupId, current.geraetId, key);
    if (duplicates.some((b) => b.id !== bestandId)) {
      throw new ApiException(`bestand ${key} exists for geraet ${current.geraetId}`, {
        status: 409,
      });
    }
    tx.update(ref, {
      lagerort: place,
      lagerortKey: key,
      updatedAt: actor.now,
      updatedBy: actor.uid,
    });
    const aenderungen = diffLagerort(current.lagerort, place);
    if (aenderungen.length > 0) {
      tx.set(
        buchungCol(groupId).doc(),
        protokollDoc(
          {
            geraetId: current.geraetId,
            bestandId,
            art: 'lagerort',
            bemerkung: 'geändert',
            lagerortText: lagerortTextOf(place),
            aenderungen,
          },
          actor,
        ),
      );
    }
  });
  return { id: bestandId };
}

/**
 * Löscht einen Lagerort. Ein Restbestand wird als Inventur ausgebucht, die
 * Bemerkung nennt den Lagerort — die Buchung überdauert ihn. Mit Chargen
 * je Topf eine Buchung (Charge mit `chargeId`, der Rest ohne), damit die
 * Herkunft jeder ausgebuchten Menge im Protokoll steht.
 *
 * Hat ein Einsatz aus dem Lagerort verbraucht, wird er nur archiviert: Der
 * Einsatz zeigt ihn weiter, und das Löschen des Verbrauchs bucht dorthin
 * zurück (`syncGeraetVerbrauch` holt ihn dann zurück).
 */
export async function deleteGeraetBestand(
  groupId: string,
  bestandId: string,
): Promise<{ id: string; deleted: boolean }> {
  const session = await actionFahrtenbuchManagerRequired(groupId);
  const actor = actorOf(session);
  assertSafeId(bestandId, 'bestandId');

  const ref = bestandCol(groupId).doc(bestandId);
  const { deleted, crossed } = await firestore.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('bestand', bestandId);
    const current = bestandSnapshot(bestandId, snap.data());
    assertSafeId(current.geraetId, 'geraetId');
    const geraetRef = geraetCol(groupId).doc(current.geraetId);
    const geraetSnap = await tx.get(geraetRef);
    if (!geraetSnap.exists) throw notFound('geraet', current.geraetId);
    const geraet = geraetSnapshot(current.geraetId, geraetSnap.data());
    const bookings = await tx.get(buchungCol(groupId).where('bestandId', '==', bestandId));
    const usedInFirecall = bookings.docs.some((d) => {
      const art = (d.data() as GeraetBuchung).art;
      return art === 'verbrauch' || art === 'storno';
    });

    const delta = clean(-(current.anzahl ?? 0));
    const lagerortText = lagerortTextOf(current.lagerort);
    let stockCrossed: NachbestellungItem | undefined;
    if (delta !== 0) {
      const bemerkung = `Lagerort gelöscht: ${formatLagerort(current.lagerort)}`;
      for (const pot of chargePots(current, geraet.chargen ?? [])) {
        if (pot.menge === 0) continue;
        tx.set(
          buchungCol(groupId).doc(),
          buchungDoc(
            {
              geraetId: current.geraetId,
              bestandId,
              art: 'inventur',
              menge: clean(-pot.menge),
              chargeId: pot.chargeId ?? undefined,
              bemerkung,
              lagerortText,
            },
            actor,
          ),
        );
      }
      const stock = stockPatch(geraet, delta, actor);
      tx.update(geraetRef, stock.patch);
      stockCrossed = stock.crossed;
    }
    if (usedInFirecall) {
      tx.update(ref, {
        anzahl: 0,
        chargen: FieldValue.delete(),
        archiviert: true,
        updatedAt: actor.now,
        updatedBy: actor.uid,
      });
    } else {
      tx.delete(ref);
    }
    // Auch archiviert gilt der Lagerort als gelöscht — er fehlt in den Listen.
    tx.set(
      buchungCol(groupId).doc(),
      protokollDoc(
        {
          geraetId: current.geraetId,
          bestandId,
          art: 'lagerort',
          bemerkung: 'gelöscht',
          lagerortText,
          aenderungen: diffLagerort(current.lagerort, undefined),
        },
        actor,
      ),
    );
    return { deleted: !usedInFirecall, crossed: stockCrossed };
  });

  if (crossed) await notifyAfterCommit({ groupId, items: [crossed] });
  return { id: bestandId, deleted };
}

/**
 * Aufteilung eines Lagerorts auf Chargen setzen — ohne Mengenänderung.
 *
 * Für den Bestand, der vor den Chargen da war (oder ohne Chargenangabe
 * zugebucht wurde): Er liegt als „Rest ohne Charge" am Lagerort und wird hier
 * nachträglich den Losen zugeordnet. `chargen` ist die ganze neue Aufteilung;
 * was fehlt oder `0` ist, fällt in den Rest. Mehr als `anzahl` lässt sich
 * nicht zuordnen. `anzahl` und `bestandGesamt` bleiben gleich; die Buchung
 * `aufteilung` (Menge 0) nennt in der Bemerkung je Topf vorher → nachher.
 */
export async function aufteilenGeraetBestand(
  groupId: string,
  bestandId: string,
  chargen: Record<string, number>,
): Promise<{ id: string; buchungId?: string }> {
  const session = await actionFahrtenbuchManagerRequired(groupId);
  const actor = actorOf(session);
  assertSafeId(bestandId, 'bestandId');

  const ref = bestandCol(groupId).doc(bestandId);
  const buchungId = await firestore.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('bestand', bestandId);
    const current = bestandSnapshot(bestandId, snap.data());
    assertSafeId(current.geraetId, 'geraetId');
    const geraetSnap = await tx.get(geraetCol(groupId).doc(current.geraetId));
    if (!geraetSnap.exists) throw notFound('geraet', current.geraetId);
    const geraet = geraetSnapshot(current.geraetId, geraetSnap.data());
    assertConsumable(geraet);

    const next = sanitizeChargenMap(geraet, chargen);
    const anzahl = current.anzahl ?? 0;
    const sum = clean(Object.values(next).reduce((a, b) => a + b, 0));
    // Leeren geht immer — auch bei negativem Bestand (Verbrauch vor Zugang).
    if (sum > 0 && sum > anzahl) {
      throw new ApiException(`chargen (${sum}) exceed anzahl (${anzahl})`, { status: 400 });
    }
    if (sameChargen(current.chargen, next)) return undefined;

    const byId = new Map((geraet.chargen ?? []).map((c) => [c.id, c]));
    const changes: string[] = [];
    for (const id of chargeIdsInOrder(geraet, current.chargen, next)) {
      const before = current.chargen?.[id] ?? 0;
      const after = next[id] ?? 0;
      if (before === after) continue;
      const charge = byId.get(id);
      changes.push(`${charge ? formatCharge(charge) : id}: ${before}→${after}`);
    }
    const restBefore = restOhneCharge(current);
    const restAfter = restOhneCharge({ anzahl, chargen: next });
    if (restBefore !== restAfter) changes.push(`ohne Charge: ${restBefore}→${restAfter}`);

    tx.update(ref, {
      chargen: chargenValue(next),
      updatedAt: actor.now,
      updatedBy: actor.uid,
    });
    const buchungRef = buchungCol(groupId).doc();
    tx.set(
      buchungRef,
      buchungDoc(
        {
          geraetId: current.geraetId,
          bestandId,
          art: 'aufteilung',
          menge: 0,
          bemerkung: changes.join(', '),
          lagerortText: lagerortTextOf(current.lagerort),
        },
        actor,
      ),
    );
    return buchungRef.id;
  });
  return compact({ id: bestandId, buchungId });
}

export type BookGeraetBestandInput =
  | {
      art: 'zugang';
      bestandId: string;
      menge: number;
      bemerkung?: string;
      /** Zugang auf eine vorhandene, nicht archivierte Charge. */
      chargeId?: string;
      /** Zugang mit einer neuen Charge, angelegt in derselben Transaktion. */
      neueCharge?: GeraetChargeInput;
    }
  | {
      art: 'umbuchung';
      bestandId: string;
      zielBestandId: string;
      menge: number;
      bemerkung?: string;
      /** Ohne Angabe wird nach FEFO auf die Chargen am Quell-Lagerort verteilt. */
      chargeId?: string;
    }
  | {
      art: 'inventur';
      bestandId: string;
      istWert: number;
      bemerkung?: string;
      /**
       * Gezählt je Charge. Zusammen mit `istWertOhneCharge` ergibt das den
       * Ist-Wert; `istWert` wird dann ignoriert.
       */
      istWertJeCharge?: Record<string, number>;
      istWertOhneCharge?: number;
    };

export interface BookGeraetBestandResult {
  buchungId: string;
  bestandGesamt: number;
}

/** Eine Chargen-ID aus dem Browser: fehlt (`undefined`) oder sicher. */
function optionalChargeId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  assertSafeId(value, 'chargeId');
  return value;
}

/**
 * Bucht am Bestand eines Lagerorts: Zugang, Umbuchung, Inventur.
 *
 * Vorzeichen der Buchung: Zugang positiv, Inventur die Differenz zum
 * bisherigen Stand, Umbuchung **negativ am Quell-Lagerort** (`bestandId`) mit
 * dem Ziel in `zielBestandId` — der Gesamtbestand bleibt dabei gleich.
 *
 * Chargen (nur bei Verbrauchsmaterial, sonst 400):
 * - Zugang mit `chargeId` oder `neueCharge` erhöht `anzahl` und den Anteil
 *   der Charge; ohne wächst nur der Rest ohne Charge.
 * - Umbuchung: Der Anteil wandert mit. Mit `chargeId` höchstens deren
 *   Bestand am Quell-Lagerort (sonst 400). Ohne `chargeId` wird nach FEFO
 *   verteilt (`allocateFefo`) — wer ins Fahrzeug umlagert, nimmt die zuerst
 *   ablaufende Ware. Je bewegtem Topf eine Buchung; zurückgegeben wird die
 *   erste.
 * - Inventur mit `istWertJeCharge` setzt Aufteilung und `anzahl` und bucht je
 *   geändertem Topf die Differenz. Ohne Chargenangabe schrumpft die
 *   Aufteilung mit (`shrinkChargen`), damit sie nie über `anzahl` liegt.
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

  let chargeId: string | undefined;
  let neueCharge: ChargeFields | undefined;
  let istWertJeCharge: Record<string, unknown> | undefined;
  let istWert = 0;
  if (input.art === 'zugang' || input.art === 'umbuchung') {
    if (!isValidMenge(input.menge) || input.menge <= 0) {
      throw new ApiException('invalid menge', { status: 400 });
    }
    chargeId = optionalChargeId(input.chargeId);
    if (input.art === 'zugang' && input.neueCharge !== undefined && input.neueCharge !== null) {
      if (chargeId !== undefined) {
        throw new ApiException('invalid zugang: chargeId and neueCharge', { status: 400 });
      }
      neueCharge = sanitizeChargeInput(input.neueCharge).fields;
    }
  } else if (input.art === 'inventur') {
    if (input.istWertJeCharge !== undefined || input.istWertOhneCharge !== undefined) {
      const raw = input.istWertJeCharge;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new ApiException('invalid istWertJeCharge', { status: 400 });
      }
      const ohne = input.istWertOhneCharge ?? 0;
      if (!isValidMenge(ohne) || !Object.values(raw).every((v) => isValidMenge(v))) {
        throw new ApiException('invalid istWert', { status: 400 });
      }
      istWertJeCharge = raw;
      istWert = clean(Object.values(raw as Record<string, number>).reduce((a, b) => a + b, ohne));
    } else {
      istWert = input.istWert;
    }
    if (!isValidMenge(istWert)) {
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
  const hasChargeFields =
    chargeId !== undefined || neueCharge !== undefined || istWertJeCharge !== undefined;

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
      if (hasChargeFields) assertConsumable(geraet);
      if (chargeId !== undefined) activeChargeOf(geraet, chargeId);

      const stamp = { updatedAt: actor.now, updatedBy: actor.uid };
      const base = {
        geraetId: source.geraetId,
        bestandId: source.id,
        bemerkung: input.bemerkung,
        lagerortText: lagerortTextOf(source.lagerort),
      };
      // Die erste Buchung trägt die ID, die zurückgegeben wird.
      let firstBuchung = true;
      const writeBuchung = (data: NewBuchung) => {
        tx.set(firstBuchung ? buchungRef : buchungCol(groupId).doc(), buchungDoc(data, actor));
        firstBuchung = false;
      };

      if (input.art === 'umbuchung') {
        if (!targetRef || !target) throw notFound('bestand', input.zielBestandId);
        // Eine ausdrücklich gewählte Charge geht nur bis zu ihrem Bestand am
        // Quell-Lagerort; der Überhang bliebe sonst als negativer Topf zurück.
        if (chargeId !== undefined && input.menge > (source.chargen?.[chargeId] ?? 0)) {
          throw new ApiException('umbuchung exceeds charge stock', { status: 400 });
        }
        const teile: GeraetChargeTeil[] =
          chargeId !== undefined
            ? [{ chargeId, menge: input.menge }]
            : allocateFefo(source, geraet.chargen ?? [], input.menge);
        let sourceMap = source.chargen ?? {};
        let targetMap = target.chargen ?? {};
        for (const teil of teile) {
          sourceMap = applyChargeDelta(sourceMap, teil.chargeId, -teil.menge);
          targetMap = applyChargeDelta(targetMap, teil.chargeId, teil.menge);
          writeBuchung({
            ...base,
            art: 'umbuchung',
            menge: clean(-teil.menge),
            chargeId: teil.chargeId ?? undefined,
            zielBestandId: target.id,
          });
        }
        const moved = teile.some((t) => t.chargeId !== null);
        tx.update(sourceRef, {
          anzahl: clean((source.anzahl ?? 0) - input.menge),
          ...(moved ? { chargen: chargenValue(sourceMap) } : {}),
          ...stamp,
        });
        tx.update(targetRef, {
          anzahl: clean((target.anzahl ?? 0) + input.menge),
          ...(moved ? { chargen: chargenValue(targetMap) } : {}),
          ...stamp,
        });
        return { bestandGesamt: geraet.bestandGesamt ?? 0, crossed: undefined };
      }

      const geraetExtra: Record<string, unknown> = {};
      const anzahlBefore = source.anzahl ?? 0;
      let delta: number;
      let nextMap: Record<string, number> | undefined;

      if (input.art === 'zugang') {
        delta = input.menge;
        let zugangCharge = chargeId;
        if (neueCharge) {
          assertChargeCapacity(geraet.chargen ?? []);
          const charge = newCharge(neueCharge, actor);
          geraetExtra.chargen = [...(geraet.chargen ?? []), charge];
          zugangCharge = charge.id;
        }
        if (zugangCharge !== undefined) {
          nextMap = applyChargeDelta(source.chargen, zugangCharge, delta);
        }
        writeBuchung({ ...base, art: 'zugang', menge: delta, chargeId: zugangCharge });
      } else if (istWertJeCharge) {
        const counted = sanitizeChargenMap(geraet, istWertJeCharge);
        delta = clean(istWert - anzahlBefore);
        nextMap = counted;
        for (const id of chargeIdsInOrder(geraet, source.chargen, counted)) {
          const diff = clean((counted[id] ?? 0) - (source.chargen?.[id] ?? 0));
          if (diff !== 0) writeBuchung({ ...base, art: 'inventur', menge: diff, chargeId: id });
        }
        const restDiff = clean(
          restOhneCharge({ anzahl: istWert, chargen: counted }) - restOhneCharge(source),
        );
        if (restDiff !== 0 || firstBuchung) {
          writeBuchung({ ...base, art: 'inventur', menge: restDiff });
        }
      } else {
        delta = clean(istWert - anzahlBefore);
        const shrunk = shrinkChargen(source, geraet.chargen ?? [], istWert);
        if (!sameChargen(source.chargen, shrunk)) nextMap = shrunk;
        writeBuchung({ ...base, art: 'inventur', menge: delta });
      }

      tx.update(sourceRef, {
        anzahl: clean(anzahlBefore + delta),
        ...(nextMap ? { chargen: chargenValue(nextMap) } : {}),
        ...stamp,
      });
      const stock = stockPatch(geraet, delta, actor);
      tx.update(geraetRef, { ...stock.patch, ...geraetExtra });
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
 *
 * Chargen: Abgeglichen wird je Topf (Lagerort und Charge). Die Aufteilung
 * `entry.chargen` gilt nur, wenn sie stimmig ist (`validChargenTeile`: Summe
 * gleich der Menge, jede Charge eine des Artikels — auch eine archivierte,
 * denn der Eintrag kann älter sein als das Archivieren). Sonst geht alles auf
 * den Rest ohne Charge, und das wird geloggt: Lieber stimmt die Summe am
 * Lagerort als eine erfundene Charge. Ein Lagerort kann so mehrere Änderungen
 * in einem Lauf bekommen (je Charge eine) — sie werden an einer Arbeitskopie
 * gesammelt und mit einem Schreibvorgang je Lagerort geschrieben; zwei
 * Updates aus demselben Snapshot überschrieben einander.
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
    // Nur Verbrauch und Storno: Unter derselben `einsatzEintragId` liegen auch
    // Protokolleinträge der Zuordnung, die keinen Bestand bewegen.
    const booked = bookedSnap.docs
      .map((d) => d.data() as GeraetBuchung)
      .filter(
        (b): b is GeraetBuchung & { bestandId: string } =>
          b.firecallId === firecallId &&
          (b.art === 'verbrauch' || b.art === 'storno') &&
          typeof b.bestandId === 'string',
      );

    const bookedMengen = booked.map((b) => ({
      bestandId: b.bestandId,
      menge: b.menge,
      chargeId: b.chargeId ?? null,
    }));

    const geraete = new Map<string, Geraet>();
    let target: VerbrauchTarget | null = null;
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
      let teile: GeraetChargeTeil[] | undefined;
      if (entry.chargen !== undefined && entry.chargen !== null) {
        const chargeIds = (entryGeraet?.chargen ?? []).map((c) => c.id);
        if (validChargenTeile(entry.chargen, entry.menge ?? 0, chargeIds)) {
          teile = entry.chargen.map((t) => ({ chargeId: t.chargeId, menge: t.menge }));
        } else {
          console.warn('geraeteActions: Chargen-Aufteilung verworfen, Rest ohne Charge', {
            groupId,
            firecallId,
            einsatzEintragId,
          });
        }
      }
      target = capVerbrauchTarget(
        { bestandId: entry.bestandId, menge: entry.menge ?? 0, teile },
        bookedMengen,
        bookable,
      );
    }

    const changes = reconcileVerbrauch(target, bookedMengen);

    const bestaende = new Map<string, GeraetBestand>();
    for (const { bestandId } of changes) {
      if (bestaende.has(bestandId)) continue;
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

    // Arbeitskopie je Lagerort: Mehrere Töpfe desselben Lagerorts werden
    // nacheinander angewandt und am Ende einmal geschrieben.
    const working = new Map<string, { anzahl: number; chargen: Record<string, number> }>();
    const totals = new Map<string, number>();
    for (const { bestandId, chargeId, delta } of changes) {
      const b = bestaende.get(bestandId)!;
      const w = working.get(bestandId) ?? { anzahl: b.anzahl ?? 0, chargen: b.chargen ?? {} };
      w.anzahl = clean(w.anzahl + delta);
      w.chargen = applyChargeDelta(w.chargen, chargeId, delta);
      working.set(bestandId, w);
      tx.set(
        buchungCol(groupId).doc(),
        buchungDoc(
          {
            geraetId: b.geraetId,
            bestandId,
            art: delta < 0 ? 'verbrauch' : 'storno',
            menge: delta,
            chargeId: chargeId ?? undefined,
            firecallId,
            firecallName: trimmed(firecall.name),
            firecallArt: firecall.art ?? 'einsatz',
            einsatzEintragId,
            lagerortText: lagerortTextOf(b.lagerort),
          },
          actor,
        ),
      );
      totals.set(b.geraetId, (totals.get(b.geraetId) ?? 0) + delta);
    }
    for (const [bestandId, w] of working) {
      const b = bestaende.get(bestandId)!;
      tx.update(bestandCol(groupId).doc(bestandId), {
        anzahl: w.anzahl,
        ...(sameChargen(b.chargen, w.chargen) ? {} : { chargen: chargenValue(w.chargen) }),
        // Was in einen archivierten Lagerort zurückkommt, muss sichtbar sein.
        ...(b.archiviert && w.anzahl !== 0 ? { archiviert: FieldValue.delete() } : {}),
        updatedAt: actor.now,
        updatedBy: actor.uid,
      });
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

/**
 * Protokolliert die Zuordnung eines Geräts im Einsatz in der Historie des
 * Artikels — eine „nachholen"-Action wie `syncGeraetVerbrauch`, über die
 * Warteschlange `geraetZuordnungQueue.ts` angestoßen nach dem Anlegen und
 * Löschen eines Eintrags mit `art: 'zugeordnet'`.
 *
 * Sie liest den Eintrag am Server und die bisherigen Protokolleinträge
 * `zuordnung`/`zuordnungEnde` mit seiner ID und schreibt nur, was fehlt:
 * - Eintrag zugeordnet, zuletzt nicht `zuordnung` → `zuordnung`.
 * - Eintrag weg (oder kein Zuordnungseintrag mehr), zuletzt `zuordnung` →
 *   `zuordnungEnde` mit dem Artikel der früheren Buchung.
 * Darum idempotent, und ein Erwartungsstand wie beim Verbrauch ist unnötig:
 * Sieht der Server den Eintrag noch nicht, schreibt er nichts; der
 * nächste Aufruf holt es nach. Offline zugeordnet und vor dem Abgleich
 * wieder entfernt ergibt keinen Eintrag.
 *
 * Gruppe und Berechtigung wie bei `syncGeraetVerbrauch`.
 */
export async function syncGeraetZuordnung(
  firecallId: string,
  einsatzEintragId: string,
): Promise<{ written: 'zuordnung' | 'zuordnungEnde' | null }> {
  const firecall = await actionUserAuthorizedForFirecall(firecallId, {
    requireWrite: true,
    requireGroupMember: true,
  });
  const session = await actionUserRequired();
  const actor = actorOf(session);
  assertSafeId(einsatzEintragId, 'einsatzEintragId');
  const groupId = firecall.group;
  if (!groupId) {
    throw new ApiException(`firecall ${firecallId} has no group`, { status: 400 });
  }

  const entryRef = firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .collection(GERAET_EINSATZ_COLLECTION)
    .doc(einsatzEintragId);

  const written = await firestore.runTransaction(async (tx: Transaction) => {
    const entrySnap = await tx.get(entryRef);
    const entry = entrySnap.exists ? (entrySnap.data() as GeraetEinsatz) : undefined;
    if (entry && entry.groupId !== groupId) {
      throw new ApiException(
        `geraetEinsatz ${einsatzEintragId} belongs to group ${entry.groupId}, not to the firecall group`,
        { status: 403 },
      );
    }

    const bookedSnap = await tx.get(
      buchungCol(groupId).where('einsatzEintragId', '==', einsatzEintragId),
    );
    const last = bookedSnap.docs
      .map((d) => d.data() as GeraetBuchung)
      .filter(
        (b) =>
          b.firecallId === firecallId && (b.art === 'zuordnung' || b.art === 'zuordnungEnde'),
      )
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
      .at(-1);

    const assigned = entry?.art === 'zugeordnet';
    let art: 'zuordnung' | 'zuordnungEnde' | null = null;
    let geraetId: string | undefined;
    let bemerkung: string | undefined;
    if (assigned && last?.art !== 'zuordnung') {
      assertSafeId(entry.geraetId, 'geraetId');
      // Kein Protokoll an einem Artikel, den es in der Gruppe nicht gibt.
      const geraetSnap = await tx.get(geraetCol(groupId).doc(entry.geraetId));
      if (geraetSnap.exists) {
        art = 'zuordnung';
        geraetId = entry.geraetId;
        bemerkung = entry.bemerkung;
      }
    } else if (!assigned && last?.art === 'zuordnung') {
      art = 'zuordnungEnde';
      geraetId = last.geraetId;
    }
    if (!art || !geraetId) return null;

    tx.set(
      buchungCol(groupId).doc(),
      protokollDoc(
        {
          geraetId,
          art,
          firecallId,
          firecallName: trimmed(firecall.name),
          firecallArt: firecall.art ?? 'einsatz',
          einsatzEintragId,
          bemerkung,
        },
        actor,
      ),
    );
    return art;
  });
  return { written };
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
  /** Die gelesenen Bestände je ID — für die Aufteilung auf Chargen. */
  bestaendeById: Map<string, GeraetBestand>;
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
      // Protokolleinträge ohne Menge (z. B. Stammdaten aus dem Import selbst)
      // sind keine Buchung, die der Import überschreiben würde.
      .filter((b) => isBestandBuchung(b.art) && b.art !== 'import');
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

  const bestaendeById = new Map(bestaende.map((b) => [b.id, b]));
  return { parsed, errors, plan, geraeteById, bestaendeById, parsedByGeraetId };
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
  const { plan, errors, geraeteById, bestaendeById, parsedByGeraetId } = await prepareImport(
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

  const book = (
    geraetId: string,
    bestandId: string,
    art: GeraetBuchungArt,
    menge: number,
    lagerort: GeraetLagerort | undefined,
  ) => {
    if (menge === 0) return;
    push(geraetId, {
      kind: 'set',
      ref: buchungCol(groupId).doc(),
      data: buchungDoc(
        { geraetId, bestandId, art, menge, lagerortText: lagerortTextOf(lagerort) },
        actor,
      ),
    });
    summary.bookings += 1;
  };
  /** Protokolleintrag zu den Stammdaten — gezählt wird er nicht als Buchung. */
  const logStammdaten = (
    geraetId: string,
    art: 'angelegt' | 'stammdaten',
    aenderungen: GeraetFeldAenderung[],
  ) => {
    if (aenderungen.length === 0) return;
    push(geraetId, {
      kind: 'set',
      ref: buchungCol(groupId).doc(),
      data: protokollDoc({ geraetId, art, aenderungen }, actor),
    });
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
    book(geraetId, ref.id, art, anzahl, b.lagerort);
  };

  /**
   * Sinkt `anzahl` eines Lagerorts mit Chargen, schrumpft die Aufteilung mit
   * (`shrinkChargen`) — sonst läge mehr auf Chargen, als am Lagerort ist.
   * Gerechnet wird vom gelesenen Stand aus, `anzahl` selbst ändert sich per
   * `increment`; bei einem gleichzeitigen Verbrauch kann die Aufteilung
   * deshalb um diesen abweichen, die Summe bleibt richtig.
   */
  const shrinkPatch = (
    geraetId: string,
    bestandId: string,
    current: number,
    imported: number,
  ): Record<string, unknown> => {
    const b = bestaendeById.get(bestandId);
    if (!b?.chargen || Object.keys(b.chargen).length === 0) return {};
    const shrunk = shrinkChargen(
      { anzahl: current, chargen: b.chargen },
      geraeteById.get(geraetId)?.chargen ?? [],
      imported,
    );
    return sameChargen(b.chargen, shrunk) ? {} : { chargen: chargenValue(shrunk) };
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
    const data = compact({
      ...artikel.stammdaten,
      externeId: id,
      verbrauchsmaterial: artikel.suggestedConsumable,
      bestandGesamt,
      importedAt: actor.now,
      createdAt: actor.now,
      createdBy: actor.uid,
      ...stamp,
    });
    push(id, { kind: 'set', ref: geraetCol(groupId).doc(id), data });
    logStammdaten(
      id,
      'angelegt',
      diffFields<Geraet>(undefined, data as Partial<Geraet>, [
        ...GERAET_IMPORT_FIELDS,
        'verbrauchsmaterial',
      ]),
    );
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
      data: {
        anzahl: FieldValue.increment(delta),
        ...shrinkPatch(b.geraetId, b.bestandId, b.current, b.imported),
        archiviert: FieldValue.delete(),
        ...stamp,
      },
    });
    book(b.geraetId, b.bestandId, 'import', delta, bestaendeById.get(b.bestandId)?.lagerort);
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
        data: {
          anzahl: FieldValue.increment(delta),
          ...shrinkPatch(d.geraetId, d.bestandId, d.current, d.imported),
          archiviert: FieldValue.delete(),
          ...stamp,
        },
      });
      book(d.geraetId, d.bestandId, 'inventur', delta, bestaendeById.get(d.bestandId)?.lagerort);
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
      const after: Record<string, unknown> = { ...geraet, ...update.stammdaten };
      for (const field of update.removedFields) {
        patch[field] = FieldValue.delete();
        after[field] = undefined;
      }
      // Nur die Felder, die der Import setzt — händisch gepflegte bleiben.
      logStammdaten(
        geraetId,
        'stammdaten',
        diffFields<Geraet>(geraet, after as Partial<Geraet>, GERAET_IMPORT_FIELDS),
      );
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
