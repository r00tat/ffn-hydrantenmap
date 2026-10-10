'use server';
import 'server-only';

import {
  FieldValue,
  type DocumentReference,
  type Transaction,
} from 'firebase-admin/firestore';
import { ApiException } from '../../app/api/errors';
import {
  BEKLEIDUNG_ARTIKEL_COLLECTION,
  BEKLEIDUNG_AUSGABE_COLLECTION,
  BEKLEIDUNG_BESTAND_COLLECTION,
  BEKLEIDUNG_IMPORT_LOCK_ID,
  BEKLEIDUNG_META_COLLECTION,
  BEKLEIDUNG_STUECK_COLLECTION,
  BEKLEIDUNG_WAESCHE_COLLECTION,
  bestandDocId,
  normalizeGroesse,
  normalizeTagNummer,
  type BekleidungArtikel,
  type BekleidungAusgabe,
  type BekleidungBestand,
  type BekleidungEigentum,
  type BekleidungFuehrung,
  type BekleidungKategorie,
  type BekleidungStatus,
  type BekleidungStueck,
  type BekleidungWaesche,
  type WaschProgramm,
} from '../../common/bekleidung';
import {
  BEKLEIDUNG_IMPORT_MAX_BYTES,
  buildImportPlan,
  buildImportPreview,
  findTagCollisions,
  importRowRef,
  parseBekleidungSheet,
  SHEET_DIENST,
  SHEET_EINSATZ,
  type ImportDecisions,
  type ImportPreview,
  type ImportRowDecision,
} from '../../common/bekleidungImport';
import { FAHRTENBUCH_PERSON_COLLECTION_ID } from '../../common/fahrtenbuch';
import { normalizePersonName } from '../../common/personNameMatch';
import { readXlsxSheetByName } from '../../common/xlsx';
import { firestore } from '../../server/firebase/admin';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import { actionBekleidungswartRequired } from './bekleidungGuard';

/*
 * Server Actions der Bekleidungsverwaltung.
 *
 * Gelesen wird im Client direkt aus Firestore (Regel mit `get()` auf das
 * Benutzerdokument), geschrieben ausschließlich hier — die Regeln sperren
 * alle fünf Sammlungen für Client-Schreibvorgänge.
 *
 * Grundregeln:
 * - Jede Action ruft zuerst `actionBekleidungswartRequired(groupId)`.
 * - Jede Zustandsänderung läuft in einer Transaktion, die den Status prüft.
 *   Firestore verlangt dort alle Lesevorgänge vor dem ersten Schreiben.
 * - Fehler werden als `ApiException` geworfen. Die Meldung ist
 *   maschinenlesbar (`alreadyIssued:<stueckId>`, `notEmpty`, …), damit die
 *   Oberfläche sie übersetzen kann.
 *
 * Ausnahme: `bekleidungMeta/import` ist die Sperre des Imports und wird von
 * keiner Regel freigegeben.
 */

// --- Hilfen ------------------------------------------------------------------

type Session = Awaited<ReturnType<typeof actionBekleidungswartRequired>>;

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

const artikelCol = (g: string) => groupRef(g).collection(BEKLEIDUNG_ARTIKEL_COLLECTION);
const stueckCol = (g: string) => groupRef(g).collection(BEKLEIDUNG_STUECK_COLLECTION);
const bestandCol = (g: string) => groupRef(g).collection(BEKLEIDUNG_BESTAND_COLLECTION);
const ausgabeCol = (g: string) => groupRef(g).collection(BEKLEIDUNG_AUSGABE_COLLECTION);
const waescheCol = (g: string) => groupRef(g).collection(BEKLEIDUNG_WAESCHE_COLLECTION);
const personCol = (g: string) => groupRef(g).collection(FAHRTENBUCH_PERSON_COLLECTION_ID);
const importLockRef = (g: string) =>
  groupRef(g).collection(BEKLEIDUNG_META_COLLECTION).doc(BEKLEIDUNG_IMPORT_LOCK_ID);

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

function badRequest(message: string): ApiException {
  return new ApiException(message, { status: 400 });
}

function conflict(message: string): ApiException {
  return new ApiException(message, { status: 409 });
}

function notFound(what: string, id: string): ApiException {
  return new ApiException(`${what} ${id} not found`, { status: 404 });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: unknown, what = 'datum'): asserts value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw badRequest(`invalid ${what}`);
  }
}

/** Getrimmt und Leerzeichen zusammengefasst; leer → `undefined`. */
function text(value: unknown, max = 500): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim().replace(/\s+/g, ' ');
  if (t.length > max) throw badRequest('text too long');
  return t.length > 0 ? t : undefined;
}

/** Entfernt `undefined` — Firestore lehnt es ab. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/** Optionales Feld setzen oder — leer — löschen (für `update`). */
function orDelete(value: unknown) {
  return value === undefined ? FieldValue.delete() : value;
}

function joinBemerkung(...parts: (string | undefined)[]): string | undefined {
  const joined = parts.filter(Boolean).join('; ');
  return joined || undefined;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function idList(value: unknown, what: string, max: number): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw badRequest(`invalid ${what}`);
  const ids = [...new Set(value)];
  if (ids.length > max) throw badRequest(`too many ${what}`);
  ids.forEach((id) => assertSafeId(id, what));
  return ids as string[];
}

const KATEGORIEN: BekleidungKategorie[] = ['einsatz', 'dienst'];
const FUEHRUNGEN: BekleidungFuehrung[] = ['einzeln', 'menge'];
const EIGENTUM: BekleidungEigentum[] = ['feuerwehr', 'privat'];
const PROGRAMME: WaschProgramm[] = ['standard', 'impraegnierung', 'sonstiges'];

function assertOneOf<T extends string>(value: unknown, allowed: T[], what: string): asserts value is T {
  if (!allowed.includes(value as T)) throw badRequest(`invalid ${what}`);
}

// Die Server-Action-Argumente sind Client-Eingabe: Snapshots werden zwar
// typisiert gelesen, Eingaben aber zur Laufzeit geprüft.
function asArtikel(data: unknown): BekleidungArtikel {
  return data as BekleidungArtikel;
}
function asStueck(data: unknown): BekleidungStueck {
  return data as BekleidungStueck;
}
function asAusgabe(data: unknown): BekleidungAusgabe {
  return data as BekleidungAusgabe;
}

/** Felder, die eine Ausgabe vom Stück löst. */
const CLEAR_ISSUE_FIELDS = {
  personId: FieldValue.delete(),
  ausgabeId: FieldValue.delete(),
  ausgegebenAm: FieldValue.delete(),
};

// --- Artikel -----------------------------------------------------------------

export interface ArtikelInput {
  kategorie: BekleidungKategorie;
  bezeichnung: string;
  hersteller?: string;
  fuehrung: BekleidungFuehrung;
  maxWaschgaenge?: number;
  aktiv: boolean;
}

/**
 * Legt einen Artikeltyp an oder ändert ihn. Die Führung lässt sich nicht
 * mehr umstellen, sobald Stücke, Bestand oder Ausgaben dazu existieren — die
 * vorhandenen Daten passten sonst nicht mehr zum Artikel.
 */
async function saveArtikelImpl(
  groupId: string,
  artikelId: string | undefined,
  input: ArtikelInput,
): Promise<{ id: string }> {
  const session = await actionBekleidungswartRequired(groupId);
  const actor = actorOf(session);

  assertOneOf(input?.kategorie, KATEGORIEN, 'kategorie');
  assertOneOf(input.fuehrung, FUEHRUNGEN, 'fuehrung');
  const bezeichnung = text(input.bezeichnung, 200);
  if (!bezeichnung) throw badRequest('bezeichnung required');
  const hersteller = text(input.hersteller, 200);
  let maxWaschgaenge: number | undefined;
  if (input.maxWaschgaenge !== undefined && input.maxWaschgaenge !== null) {
    if (!isPositiveInt(input.maxWaschgaenge)) throw badRequest('invalid maxWaschgaenge');
    // Wäschen gibt es nur für Einzelstücke.
    if (input.fuehrung === 'einzeln') maxWaschgaenge = input.maxWaschgaenge;
  }
  const fields = {
    kategorie: input.kategorie,
    bezeichnung,
    hersteller,
    fuehrung: input.fuehrung,
    maxWaschgaenge,
    aktiv: input.aktiv !== false,
  };

  if (artikelId === undefined) {
    const ref = artikelCol(groupId).doc();
    await ref.set(
      compact({
        ...fields,
        createdAt: actor.now,
        createdBy: actor.uid,
        updatedAt: actor.now,
        updatedBy: actor.uid,
      }),
    );
    return { id: ref.id };
  }

  assertSafeId(artikelId, 'artikelId');
  const ref = artikelCol(groupId).doc(artikelId);
  await firestore.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('artikel', artikelId);
    const current = asArtikel(snap.data());
    if (current.fuehrung !== fields.fuehrung) {
      const [stuecke, bestand, ausgaben] = await Promise.all([
        tx.get(stueckCol(groupId).where('artikelId', '==', artikelId).limit(1)),
        tx.get(bestandCol(groupId).where('artikelId', '==', artikelId).limit(1)),
        tx.get(ausgabeCol(groupId).where('artikelId', '==', artikelId).limit(1)),
      ]);
      if (!stuecke.empty || !bestand.empty || !ausgaben.empty) {
        throw conflict('fuehrungLocked');
      }
    }
    tx.update(ref, {
      kategorie: fields.kategorie,
      bezeichnung: fields.bezeichnung,
      hersteller: orDelete(fields.hersteller),
      fuehrung: fields.fuehrung,
      maxWaschgaenge: orDelete(fields.maxWaschgaenge),
      aktiv: fields.aktiv,
      updatedAt: actor.now,
      updatedBy: actor.uid,
    });
  });
  return { id: artikelId };
}

// --- Stücke ------------------------------------------------------------------

export interface StueckInput {
  groesse: string;
  charge?: string;
  tagNummer?: string;
  eigentum: BekleidungEigentum;
  lagerort?: string;
  bemerkung?: string;
}

function sanitizeStueckInput(input: StueckInput) {
  assertOneOf(input?.eigentum, EIGENTUM, 'eigentum');
  const groesse = text(input.groesse, 50);
  if (!groesse) throw badRequest('groesse required');
  const tagRaw = typeof input.tagNummer === 'string' ? input.tagNummer : '';
  const tagNummer = normalizeTagNummer(tagRaw);
  if (tagNummer && (tagNummer.length > 100 || tagNummer.includes('/'))) {
    throw badRequest('invalid tagNummer');
  }
  return {
    groesse,
    charge: text(input.charge, 100),
    tagNummer,
    eigentum: input.eigentum,
    lagerort: text(input.lagerort, 200),
    bemerkung: text(input.bemerkung, 2000),
  };
}

const MAX_NEW_STUECKE = 100;

/**
 * Legt ein oder mehrere Einzelstücke an. Mehrere Stücke auf einmal gibt es
 * nur ohne Tag-Nummer — die ist je Gruppe eindeutig.
 */
async function createStueckeImpl(
  groupId: string,
  input: StueckInput & { artikelId: string; anzahl: number },
): Promise<{ ids: string[] }> {
  const session = await actionBekleidungswartRequired(groupId);
  const actor = actorOf(session);

  assertSafeId(input?.artikelId, 'artikelId');
  const anzahl = input.anzahl;
  if (!isPositiveInt(anzahl) || anzahl > MAX_NEW_STUECKE) throw badRequest('invalid anzahl');
  const fields = sanitizeStueckInput(input);
  if (fields.tagNummer && anzahl > 1) throw badRequest('tagWithAnzahl');

  const artikelRef = artikelCol(groupId).doc(input.artikelId);
  const ids: string[] = [];
  await firestore.runTransaction(async (tx: Transaction) => {
    ids.length = 0;
    const artikelSnap = await tx.get(artikelRef);
    if (!artikelSnap.exists) throw notFound('artikel', input.artikelId);
    if (asArtikel(artikelSnap.data()).fuehrung !== 'einzeln') {
      throw conflict('artikelNotEinzeln');
    }
    if (fields.tagNummer) {
      const dup = await tx.get(
        stueckCol(groupId).where('tagNummer', '==', fields.tagNummer).limit(1),
      );
      if (!dup.empty) throw conflict(`tagExists:${fields.tagNummer}`);
    }
    for (let i = 0; i < anzahl; i++) {
      const ref = stueckCol(groupId).doc();
      ids.push(ref.id);
      tx.set(
        ref,
        compact({
          artikelId: input.artikelId,
          ...fields,
          status: 'lager' as BekleidungStatus,
          waschgaenge: 0,
          waschgaengeAltbestand: 0,
          createdAt: actor.now,
          createdBy: actor.uid,
          updatedAt: actor.now,
          updatedBy: actor.uid,
        }),
      );
    }
  });
  return { ids };
}

/** Stammdaten eines Stücks ändern; Status und Ausgabe bleiben unberührt. */
async function updateStueckImpl(
  groupId: string,
  stueckId: string,
  input: StueckInput,
): Promise<void> {
  const session = await actionBekleidungswartRequired(groupId);
  const actor = actorOf(session);

  assertSafeId(stueckId, 'stueckId');
  const fields = sanitizeStueckInput(input);
  const ref = stueckCol(groupId).doc(stueckId);

  await firestore.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('stueck', stueckId);
    const current = asStueck(snap.data());
    if (fields.tagNummer) {
      const dup = await tx.get(
        stueckCol(groupId).where('tagNummer', '==', fields.tagNummer),
      );
      if (dup.docs.some((d) => d.id !== stueckId)) {
        throw conflict(`tagExists:${fields.tagNummer}`);
      }
    }
    // Eine geänderte Größe gilt auch für die offene Ausgabe, sonst zeigte die
    // Person weiter die alte Größe. Gelesen wird vor dem ersten Schreiben.
    let openAusgabeId: string | undefined;
    if (current.ausgabeId && current.groesse !== fields.groesse) {
      const aSnap = await tx.get(ausgabeCol(groupId).doc(current.ausgabeId));
      if (aSnap.exists && !asAusgabe(aSnap.data()).zurueckAm) openAusgabeId = current.ausgabeId;
    }
    if (openAusgabeId) {
      tx.update(ausgabeCol(groupId).doc(openAusgabeId), {
        groesse: fields.groesse,
        updatedAt: actor.now,
        updatedBy: actor.uid,
      });
    }
    tx.update(ref, {
      groesse: fields.groesse,
      charge: orDelete(fields.charge),
      tagNummer: orDelete(fields.tagNummer),
      eigentum: fields.eigentum,
      lagerort: orDelete(fields.lagerort),
      bemerkung: orDelete(fields.bemerkung),
      updatedAt: actor.now,
      updatedBy: actor.uid,
    });
  });
}

// --- Ausgabe -----------------------------------------------------------------

export interface MengeLine {
  artikelId: string;
  groesse: string;
  menge: number;
}

export interface IssueInput {
  personId: string;
  datum: string;
  bemerkung?: string;
  stueckIds: string[];
  mengen: MengeLine[];
}

const MAX_ISSUE_STUECKE = 100;
const MAX_ISSUE_MENGEN = 50;

/**
 * Gibt Stücke und Mengen an eine Person aus — alles oder nichts in einer
 * Transaktion. Ein Stück muss im Lager liegen; ein noch ausgegebenes lehnt
 * der Server mit `alreadyIssued:<id>` ab (die Oberfläche bietet dann
 * „zurücknehmen und neu ausgeben"), ein ausgeschiedenes oder nicht
 * auffindbares mit `notAvailable:<id>:<status>`.
 */
async function issueImpl(
  groupId: string,
  input: IssueInput,
): Promise<{ ausgabeIds: string[] }> {
  const session = await actionBekleidungswartRequired(groupId);
  const actor = actorOf(session);

  assertSafeId(input?.personId, 'personId');
  assertDate(input.datum);
  const bemerkung = text(input.bemerkung, 2000);
  const stueckIds = idList(input.stueckIds, 'stueckIds', MAX_ISSUE_STUECKE);

  // Mengen je Artikel und Größe zusammenfassen.
  if (input.mengen !== undefined && !Array.isArray(input.mengen)) {
    throw badRequest('invalid mengen');
  }
  const mengen = new Map<string, MengeLine>();
  for (const line of input.mengen ?? []) {
    assertSafeId(line?.artikelId, 'artikelId');
    const groesse = text(line.groesse, 50);
    if (!groesse) throw badRequest('groesse required');
    if (!isPositiveInt(line.menge)) throw badRequest('invalid menge');
    const normalized = normalizeGroesse(groesse);
    const id = bestandDocId(line.artikelId, normalized);
    const entry = mengen.get(id);
    if (entry) entry.menge += line.menge;
    else mengen.set(id, { artikelId: line.artikelId, groesse: normalized, menge: line.menge });
  }
  if (mengen.size > MAX_ISSUE_MENGEN) throw badRequest('too many mengen');
  if (stueckIds.length === 0 && mengen.size === 0) throw badRequest('nothingToIssue');

  const ausgabeIds: string[] = [];
  await firestore.runTransaction(async (tx: Transaction) => {
    ausgabeIds.length = 0;
    // --- lesen ---
    const personSnap = await tx.get(personCol(groupId).doc(input.personId));
    if (!personSnap.exists) throw notFound('person', input.personId);
    if ((personSnap.data() as { active?: boolean }).active === false) {
      throw conflict('personInactive');
    }

    const stuecke: { id: string; data: BekleidungStueck }[] = [];
    for (const id of stueckIds) {
      const snap = await tx.get(stueckCol(groupId).doc(id));
      if (!snap.exists) throw notFound('stueck', id);
      const data = asStueck(snap.data());
      if (data.status === 'ausgegeben') throw conflict(`alreadyIssued:${id}`);
      if (data.status !== 'lager') throw conflict(`notAvailable:${id}:${data.status}`);
      stuecke.push({ id, data });
    }

    const bestaende: { id: string; line: MengeLine; anzahl: number }[] = [];
    for (const [id, line] of mengen) {
      const artikelSnap = await tx.get(artikelCol(groupId).doc(line.artikelId));
      if (!artikelSnap.exists) throw notFound('artikel', line.artikelId);
      if (asArtikel(artikelSnap.data()).fuehrung !== 'menge') {
        throw conflict('artikelNotMenge');
      }
      const bestandSnap = await tx.get(bestandCol(groupId).doc(id));
      const anzahl = bestandSnap.exists
        ? ((bestandSnap.data() as BekleidungBestand).anzahl ?? 0)
        : 0;
      if (anzahl < line.menge) {
        throw conflict(`insufficientStock:${line.artikelId}:${line.groesse}`);
      }
      bestaende.push({ id, line, anzahl });
    }

    // --- schreiben ---
    const stamps = {
      createdAt: actor.now,
      createdBy: actor.uid,
      updatedAt: actor.now,
      updatedBy: actor.uid,
    };
    for (const { id, data } of stuecke) {
      const ausgabeRef = ausgabeCol(groupId).doc();
      ausgabeIds.push(ausgabeRef.id);
      tx.set(
        ausgabeRef,
        compact<Omit<BekleidungAusgabe, 'id'>>({
          personId: input.personId,
          stueckId: id,
          artikelId: data.artikelId,
          groesse: data.groesse,
          menge: 1,
          ausgegebenAm: input.datum,
          bemerkung,
          quelle: 'app',
          ...stamps,
        }),
      );
      tx.update(stueckCol(groupId).doc(id), {
        status: 'ausgegeben',
        personId: input.personId,
        ausgabeId: ausgabeRef.id,
        ausgegebenAm: input.datum,
        updatedAt: actor.now,
        updatedBy: actor.uid,
      });
    }
    for (const { id, line, anzahl } of bestaende) {
      const ausgabeRef = ausgabeCol(groupId).doc();
      ausgabeIds.push(ausgabeRef.id);
      tx.set(
        ausgabeRef,
        compact<Omit<BekleidungAusgabe, 'id'>>({
          personId: input.personId,
          artikelId: line.artikelId,
          groesse: line.groesse,
          menge: line.menge,
          ausgegebenAm: input.datum,
          bemerkung,
          quelle: 'app',
          ...stamps,
        }),
      );
      tx.update(bestandCol(groupId).doc(id), {
        anzahl: anzahl - line.menge,
        updatedAt: actor.now,
        updatedBy: actor.uid,
      });
    }
  });
  return { ausgabeIds };
}

// --- Rücknahme ---------------------------------------------------------------

export interface ReturnInput {
  datum: string;
  bemerkung?: string;
  ziel: 'lager' | 'ausgeschieden';
  stueckIds: string[];
  mengen: { ausgabeId: string; menge: number }[];
}

/**
 * Nimmt Stücke und Mengen zurück. Ein Stück muss `ausgegeben` sein; ein
 * Stück aus dem Import ohne benannte Ausgabe wird nur umgestellt. Eine
 * Teilrücknahme einer Menge teilt die Ausgabe: Das Original behält den Rest
 * und bleibt offen, ein neuer, geschlossener Eintrag trägt die
 * zurückgenommene Menge. Eine private Mengen-Ausgabe (Import) wird nur
 * geschlossen — sie gehört nicht ins Lager der Feuerwehr, auch bei Ziel
 * `lager` nicht.
 */
async function returnItemsImpl(groupId: string, input: ReturnInput): Promise<void> {
  const session = await actionBekleidungswartRequired(groupId);
  const actor = actorOf(session);

  assertDate(input?.datum);
  assertOneOf(input.ziel, ['lager', 'ausgeschieden'], 'ziel');
  const bemerkung = text(input.bemerkung, 2000);
  const stueckIds = idList(input.stueckIds, 'stueckIds', MAX_ISSUE_STUECKE);
  if (input.mengen !== undefined && !Array.isArray(input.mengen)) {
    throw badRequest('invalid mengen');
  }
  const mengen = input.mengen ?? [];
  if (mengen.length > MAX_ISSUE_MENGEN) throw badRequest('too many mengen');
  const seen = new Set<string>();
  for (const line of mengen) {
    assertSafeId(line?.ausgabeId, 'ausgabeId');
    if (!isPositiveInt(line.menge)) throw badRequest('invalid menge');
    if (seen.has(line.ausgabeId)) throw badRequest('duplicate ausgabeId');
    seen.add(line.ausgabeId);
  }
  if (stueckIds.length === 0 && mengen.length === 0) throw badRequest('nothingToReturn');

  await firestore.runTransaction(async (tx: Transaction) => {
    // --- lesen ---
    const stuecke: { id: string; ausgabe?: { id: string; data: BekleidungAusgabe } }[] = [];
    for (const id of stueckIds) {
      const snap = await tx.get(stueckCol(groupId).doc(id));
      if (!snap.exists) throw notFound('stueck', id);
      const data = asStueck(snap.data());
      if (data.status !== 'ausgegeben') throw conflict(`notIssued:${id}`);
      let ausgabe: { id: string; data: BekleidungAusgabe } | undefined;
      if (data.ausgabeId) {
        const aSnap = await tx.get(ausgabeCol(groupId).doc(data.ausgabeId));
        if (aSnap.exists) ausgabe = { id: data.ausgabeId, data: asAusgabe(aSnap.data()) };
      }
      stuecke.push({ id, ausgabe });
    }

    const lines: { id: string; data: BekleidungAusgabe; menge: number }[] = [];
    for (const line of mengen) {
      const snap = await tx.get(ausgabeCol(groupId).doc(line.ausgabeId));
      if (!snap.exists) throw notFound('ausgabe', line.ausgabeId);
      const data = asAusgabe(snap.data());
      if (data.zurueckAm || data.stueckId) throw conflict(`notIssued:${line.ausgabeId}`);
      if (line.menge > data.menge) throw badRequest('invalid menge');
      lines.push({ id: line.ausgabeId, data, menge: line.menge });
    }

    // Zugang ins Lager je Bestandsdokument zusammenfassen.
    const deltas = new Map<string, { artikelId: string; groesse: string; delta: number; anzahl: number }>();
    if (input.ziel === 'lager') {
      for (const { data, menge } of lines) {
        if (data.eigentum === 'privat') continue;
        const groesse = normalizeGroesse(data.groesse);
        const id = bestandDocId(data.artikelId, groesse);
        const entry = deltas.get(id);
        if (entry) entry.delta += menge;
        else deltas.set(id, { artikelId: data.artikelId, groesse, delta: menge, anzahl: 0 });
      }
      for (const [id, entry] of deltas) {
        const snap = await tx.get(bestandCol(groupId).doc(id));
        entry.anzahl = snap.exists ? ((snap.data() as BekleidungBestand).anzahl ?? 0) : 0;
      }
    }

    // --- schreiben ---
    const updated = { updatedAt: actor.now, updatedBy: actor.uid };
    for (const { id, ausgabe } of stuecke) {
      if (ausgabe && !ausgabe.data.zurueckAm) {
        tx.update(ausgabeCol(groupId).doc(ausgabe.id), {
          zurueckAm: input.datum,
          bemerkung: orDelete(joinBemerkung(ausgabe.data.bemerkung, bemerkung)),
          ...updated,
        });
      }
      tx.update(stueckCol(groupId).doc(id), {
        status: input.ziel,
        ...CLEAR_ISSUE_FIELDS,
        ...updated,
      });
    }
    for (const { id, data, menge } of lines) {
      const closedBemerkung = joinBemerkung(data.bemerkung, bemerkung);
      if (menge === data.menge) {
        tx.update(ausgabeCol(groupId).doc(id), {
          zurueckAm: input.datum,
          bemerkung: orDelete(closedBemerkung),
          ...updated,
        });
      } else {
        tx.update(ausgabeCol(groupId).doc(id), { menge: data.menge - menge, ...updated });
        const rest = { ...data };
        delete rest.id;
        tx.set(
          ausgabeCol(groupId).doc(),
          compact<Omit<BekleidungAusgabe, 'id'>>({
            ...rest,
            menge,
            zurueckAm: input.datum,
            bemerkung: closedBemerkung,
            createdAt: actor.now,
            createdBy: actor.uid,
            ...updated,
          }),
        );
      }
    }
    for (const [id, entry] of deltas) {
      tx.set(bestandCol(groupId).doc(id), {
        artikelId: entry.artikelId,
        groesse: entry.groesse,
        anzahl: entry.anzahl + entry.delta,
        ...updated,
      });
    }
  });
}

// --- Status ------------------------------------------------------------------

const SETTABLE_STATUS: BekleidungStatus[] = ['ausgeschieden', 'nicht_auffindbar', 'lager'];

/**
 * Stellt den Status eines Stücks um (ausscheiden, nicht auffindbar, wieder
 * im Lager) und schließt eine offene Ausgabe mit `zurueckAm = datum`. Die
 * Bemerkung geht an die geschlossene Ausgabe, ohne Ausgabe ans Stück.
 */
async function setStueckStatusImpl(
  groupId: string,
  stueckId: string,
  status: 'ausgeschieden' | 'nicht_auffindbar' | 'lager',
  datum: string,
  bemerkung?: string,
): Promise<void> {
  const session = await actionBekleidungswartRequired(groupId);
  const actor = actorOf(session);

  assertSafeId(stueckId, 'stueckId');
  assertOneOf(status, SETTABLE_STATUS, 'status');
  assertDate(datum);
  const note = text(bemerkung, 2000);
  const ref = stueckCol(groupId).doc(stueckId);

  await firestore.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('stueck', stueckId);
    const stueck = asStueck(snap.data());
    let ausgabe: BekleidungAusgabe | undefined;
    if (stueck.ausgabeId) {
      const aSnap = await tx.get(ausgabeCol(groupId).doc(stueck.ausgabeId));
      if (aSnap.exists) ausgabe = asAusgabe(aSnap.data());
    }

    const updated = { updatedAt: actor.now, updatedBy: actor.uid };
    const closesAusgabe = stueck.ausgabeId && ausgabe && !ausgabe.zurueckAm;
    if (closesAusgabe) {
      tx.update(ausgabeCol(groupId).doc(stueck.ausgabeId!), {
        zurueckAm: datum,
        bemerkung: orDelete(joinBemerkung(ausgabe!.bemerkung, note)),
        ...updated,
      });
    }
    tx.update(ref, {
      status,
      ...CLEAR_ISSUE_FIELDS,
      ...(!closesAusgabe && note
        ? { bemerkung: joinBemerkung(stueck.bemerkung, note) }
        : {}),
      ...updated,
    });
  });
}

// --- Mengenbestand -----------------------------------------------------------

/**
 * Zugang (`delta > 0`) oder Korrektur des Mengenbestands je Artikel und
 * Größe. Der Bestand fällt nie unter 0. Eine Bemerkung wird angenommen,
 * aber (noch) nicht gespeichert — es gibt kein Buchungsprotokoll.
 */
async function adjustBestandImpl(
  groupId: string,
  input: { artikelId: string; groesse: string; delta: number; bemerkung?: string },
): Promise<void> {
  const session = await actionBekleidungswartRequired(groupId);
  const actor = actorOf(session);

  assertSafeId(input?.artikelId, 'artikelId');
  const groesseRaw = text(input.groesse, 50);
  if (!groesseRaw) throw badRequest('groesse required');
  const groesse = normalizeGroesse(groesseRaw);
  if (typeof input.delta !== 'number' || !Number.isInteger(input.delta) || input.delta === 0) {
    throw badRequest('invalid delta');
  }
  const ref = bestandCol(groupId).doc(bestandDocId(input.artikelId, groesse));

  await firestore.runTransaction(async (tx: Transaction) => {
    const artikelSnap = await tx.get(artikelCol(groupId).doc(input.artikelId));
    if (!artikelSnap.exists) throw notFound('artikel', input.artikelId);
    if (asArtikel(artikelSnap.data()).fuehrung !== 'menge') throw conflict('artikelNotMenge');
    const snap = await tx.get(ref);
    const anzahl = snap.exists ? ((snap.data() as BekleidungBestand).anzahl ?? 0) : 0;
    const next = anzahl + input.delta;
    if (next < 0) throw conflict(`insufficientStock:${input.artikelId}:${groesse}`);
    tx.set(ref, {
      artikelId: input.artikelId,
      groesse,
      anzahl: next,
      updatedAt: actor.now,
      updatedBy: actor.uid,
    });
  });
}

// --- Wäsche ------------------------------------------------------------------

const MAX_WAESCHE_STUECKE = 200;

/**
 * Erfasst einen Waschgang: zählt `waschgaenge` je Stück hoch und setzt
 * `letzteWaescheAm` auf das spätere von bisherigem und neuem Datum (eine
 * nachgetragene Wäsche verschiebt es nicht zurück). Eine erreichte
 * Höchstzahl sperrt nicht — die Warnung zeigt die Oberfläche.
 */
export interface WaescheInput {
  datum: string;
  programm: WaschProgramm;
  programmText?: string;
  stueckIds: string[];
  bemerkung?: string;
}

async function recordWaescheImpl(
  groupId: string,
  input: WaescheInput,
): Promise<{ id: string }> {
  const session = await actionBekleidungswartRequired(groupId);
  const actor = actorOf(session);

  assertDate(input?.datum);
  assertOneOf(input.programm, PROGRAMME, 'programm');
  const programmText = text(input.programmText, 200);
  if (input.programm === 'sonstiges' && !programmText) throw badRequest('programmTextRequired');
  const stueckIds = idList(input.stueckIds, 'stueckIds', MAX_WAESCHE_STUECKE);
  if (stueckIds.length === 0) throw badRequest('stueckIds required');
  const bemerkung = text(input.bemerkung, 2000);

  const ref = waescheCol(groupId).doc();
  await firestore.runTransaction(async (tx: Transaction) => {
    const stuecke: { id: string; data: BekleidungStueck }[] = [];
    for (const id of stueckIds) {
      const snap = await tx.get(stueckCol(groupId).doc(id));
      if (!snap.exists) throw notFound('stueck', id);
      stuecke.push({ id, data: asStueck(snap.data()) });
    }
    tx.set(
      ref,
      compact<Omit<BekleidungWaesche, 'id'>>({
        datum: input.datum,
        programm: input.programm,
        programmText: input.programm === 'sonstiges' ? programmText : undefined,
        stueckIds,
        bemerkung,
        createdAt: actor.now,
        createdBy: actor.uid,
      }),
    );
    for (const { id, data } of stuecke) {
      const letzte =
        data.letzteWaescheAm && data.letzteWaescheAm > input.datum
          ? data.letzteWaescheAm
          : input.datum;
      tx.update(stueckCol(groupId).doc(id), {
        waschgaenge: (data.waschgaenge ?? 0) + 1,
        letzteWaescheAm: letzte,
        updatedAt: actor.now,
        updatedBy: actor.uid,
      });
    }
  });
  return { id: ref.id };
}

// --- Personen ----------------------------------------------------------------

async function loadPersons(groupId: string): Promise<{ id: string; name: string }[]> {
  const snap = await personCol(groupId).get();
  return snap.docs.map((d) => ({
    id: d.id,
    name: String((d.data() as { name?: unknown }).name ?? ''),
  }));
}

function newPersonDoc(name: string, actor: Actor, active = true) {
  return {
    name,
    active,
    blaulichtSmsRecipientId: '',
    phone: '',
    email: '',
    note: '',
    createdAt: actor.now,
    createdBy: actor.uid,
    updatedAt: actor.now,
    updatedBy: actor.uid,
  };
}

/**
 * Legt eine Person der Gruppe an (neues Mitglied). Der Bekleidungswart darf
 * Personen nur anlegen, nicht ändern oder deaktivieren.
 */
async function createPersonForBekleidungImpl(
  groupId: string,
  name: string,
): Promise<{ id: string }> {
  const session = await actionBekleidungswartRequired(groupId);
  const actor = actorOf(session);

  const clean = text(name, 200);
  if (!clean) throw badRequest('name required');
  const key = normalizePersonName(clean);
  const persons = await loadPersons(groupId);
  if (persons.some((p) => normalizePersonName(p.name) === key)) {
    throw conflict('personExists');
  }
  const ref = personCol(groupId).doc();
  await ref.set(newPersonDoc(clean, actor));
  return { id: ref.id };
}

// --- Import ------------------------------------------------------------------

const BATCH_LIMIT = 450;

function decodeImportFile(fileBase64: unknown): Uint8Array {
  if (typeof fileBase64 !== 'string') throw badRequest('file missing');
  // Ein `FileReader.readAsDataURL` liefert das Präfix gleich mit.
  const b64 = fileBase64.replace(/^data:[^,]*,/, '').trim();
  if (Math.floor((b64.length * 3) / 4) > BEKLEIDUNG_IMPORT_MAX_BYTES) {
    throw new ApiException('fileTooLarge', { status: 413 });
  }
  const buffer = Buffer.from(b64, 'base64');
  if (buffer.length === 0) throw badRequest('file missing');
  return new Uint8Array(buffer);
}

/** Heutiges Datum in Österreich als `YYYY-MM-DD`. */
function todayVienna(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Liest beide Blätter und gleicht die Namen mit den Personen ab. */
async function prepareImport(
  groupId: string,
  fileBase64: unknown,
): Promise<{ preview: ImportPreview; persons: { id: string; name: string }[] }> {
  const data = decodeImportFile(fileBase64);
  let einsatz;
  let dienst;
  try {
    einsatz = parseBekleidungSheet(readXlsxSheetByName(data, SHEET_EINSATZ), 'einsatz');
    dienst = parseBekleidungSheet(readXlsxSheetByName(data, SHEET_DIENST), 'dienst');
  } catch (err) {
    throw badRequest((err as Error).message);
  }
  const persons = await loadPersons(groupId);
  return { preview: buildImportPreview(einsatz, dienst, persons), persons };
}

/** Vorschau des Imports — reines JSON, ohne Schreibvorgang. */
async function previewBekleidungImportImpl(
  groupId: string,
  fileBase64: string,
): Promise<ImportPreview> {
  await actionBekleidungswartRequired(groupId);
  const { preview } = await prepareImport(groupId, fileBase64);
  return preview;
}

/** Sammlungen, die für einen Import leer sein müssen. */
const IMPORT_TARGETS = [artikelCol, stueckCol, bestandCol, ausgabeCol, waescheCol];

/**
 * Darf importiert werden? Eine Sperre im Zustand `running` heißt, ein
 * anderer Import schreibt gerade; `done` heißt, es wurde schon importiert.
 * Ohne Sperre muss jede Bekleidungssammlung leer sein.
 */
function assertImportAllowed(
  lock: { exists: boolean; data: () => unknown },
  collections: { empty: boolean }[],
): void {
  if (lock.exists) {
    const state = (lock.data() as { state?: unknown } | undefined)?.state;
    throw conflict(state === 'running' ? 'importRunning' : 'notEmpty');
  }
  if (collections.some((s) => !s.empty)) throw conflict('notEmpty');
}

/** Vorabprüfung ohne Sperre — erspart das Lesen der Datei, wenn es eh nicht geht. */
async function precheckImport(groupId: string): Promise<void> {
  const [lock, ...collections] = await Promise.all([
    importLockRef(groupId).get(),
    ...IMPORT_TARGETS.map((col) => col(groupId).limit(1).get()),
  ]);
  assertImportAllowed(lock, collections);
}

function isAlreadyExists(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | undefined;
  return e?.code === 6 || e?.code === 'already-exists' || /ALREADY_EXISTS/.test(String(e?.message));
}

/**
 * Nimmt die Importsperre: In einer Transaktion wird die Sperre gelesen, die
 * Leere erneut geprüft und die Sperre mit `create` angelegt. Zwei
 * gleichzeitige Importe kommen so nicht beide durch — der zweite sieht die
 * Sperre (Wiederholung nach Konflikt) oder scheitert an `create`.
 */
async function acquireImportLock(groupId: string, actor: Actor): Promise<void> {
  try {
    await firestore.runTransaction(async (tx: Transaction) => {
      const lock = await tx.get(importLockRef(groupId));
      const collections = await Promise.all(
        IMPORT_TARGETS.map((col) => tx.get(col(groupId).limit(1))),
      );
      assertImportAllowed(lock, collections);
      tx.create(importLockRef(groupId), {
        state: 'running',
        startedAt: actor.now,
        startedBy: actor.uid,
      });
    });
  } catch (err) {
    if (isAlreadyExists(err)) throw conflict('importRunning');
    throw err;
  }
}

/**
 * Macht einen gescheiterten Import rückgängig: löscht alle Dokumente des
 * Plans (die IDs stehen vorab fest, auch die neuen Personen) und erst danach
 * die Sperre. Scheitert das Löschen, bleibt die Sperre auf `running` stehen —
 * besser als ein zweiter Import auf halb geschriebene Daten.
 */
async function rollbackImport(groupId: string, refs: DocumentReference[]): Promise<void> {
  try {
    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
      const batch = firestore.batch();
      for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref);
      await batch.commit();
    }
    await importLockRef(groupId).delete();
  } catch (err) {
    console.error('bekleidung import rollback failed, lock stays running', err);
  }
}

const IMPORT_STATUS: BekleidungStatus[] = ['lager', 'ausgegeben', 'ausgeschieden', 'nicht_auffindbar'];

/**
 * Bereinigung je Zeile prüfen: nur Zeilen der Datei, gültiger Status,
 * Block-Index als Zahl, Tag-Nummer als Text oder `null`. Ob der Block offen
 * ist, prüft `buildImportPlan`; ob eine Tag-Nummer doppelt bleibt, der Aufrufer.
 */
function sanitizeRowDecisions(
  raw: unknown,
  preview: ImportPreview,
): Record<string, ImportRowDecision> {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== 'object') throw badRequest('invalid row decisions');
  const refs = new Set(preview.rows.map(importRowRef));
  const rows: Record<string, ImportRowDecision> = {};
  for (const [ref, value] of Object.entries(raw)) {
    if (!refs.has(ref)) throw badRequest(`unknownRow:${ref}`);
    if (!value || typeof value !== 'object') throw badRequest('invalid row decision');
    const { status, keepOpen, tagNummer } = value as Record<string, unknown>;
    const decision: ImportRowDecision = {};
    if (status !== undefined) {
      assertOneOf(status, IMPORT_STATUS, 'status');
      decision.status = status;
    }
    if (keepOpen !== undefined) {
      if (!Number.isInteger(keepOpen) || (keepOpen as number) < 0) {
        throw badRequest('invalid keepOpen');
      }
      decision.keepOpen = keepOpen as number;
    }
    if (tagNummer === null) {
      decision.tagNummer = null;
    } else if (tagNummer !== undefined) {
      if (typeof tagNummer !== 'string') throw badRequest('invalid tagNummer');
      // Leer heißt: ohne Tag-Nummer führen.
      decision.tagNummer = text(tagNummer, 100) || null;
    }
    rows[ref] = decision;
  }
  return rows;
}

function sanitizeDecisions(
  decisions: ImportDecisions,
  groupPersons: { id: string; name: string }[],
  preview: ImportPreview,
): ImportDecisions {
  if (!decisions || typeof decisions !== 'object') throw badRequest('invalid decisions');
  const personIds = new Set(groupPersons.map((p) => p.id));
  // Ein neu anzulegender Name darf weder schon in der Gruppe stehen noch
  // zweimal im selben Import vorkommen — sonst entstünden Dubletten.
  const takenNames = new Set(groupPersons.map((p) => normalizePersonName(p.name)));
  const fuehrung: ImportDecisions['fuehrung'] = {};
  for (const [key, value] of Object.entries(decisions.fuehrung ?? {})) {
    assertOneOf(value, FUEHRUNGEN, 'fuehrung');
    fuehrung[key] = value;
  }
  const persons: ImportDecisions['persons'] = {};
  for (const [key, value] of Object.entries(decisions.persons ?? {})) {
    if (value && typeof value === 'object' && 'personId' in value) {
      assertSafeId(value.personId, 'personId');
      if (!personIds.has(value.personId)) throw badRequest(`unknownPerson:${value.personId}`);
      persons[key] = { personId: value.personId };
    } else if (value && typeof value === 'object' && 'create' in value) {
      const name = text(value.create, 200);
      if (!name) throw badRequest('invalid person name');
      const nameKey = normalizePersonName(name);
      if (takenNames.has(nameKey)) throw conflict('personExists');
      takenNames.add(nameKey);
      const active = (value as { active?: unknown }).active;
      if (active !== undefined && typeof active !== 'boolean') {
        throw badRequest('invalid person active');
      }
      persons[key] = active === false ? { create: name, active: false } : { create: name };
    } else {
      throw badRequest('invalid person decision');
    }
  }
  const rows = sanitizeRowDecisions(decisions.rows, preview);
  if (findTagCollisions(preview, rows).length > 0) throw conflict('tagExists');
  return { fuehrung, persons, rows };
}

/**
 * Einmaliger Import der zwei Bestandslisten in einen **leeren**
 * Bekleidungsbestand. Die Datei wird hier erneut gelesen — einem Plan aus
 * dem Browser wird nicht vertraut; vom Client kommen nur die Entscheidungen.
 *
 * Geschrieben wird in Batches (nicht in einer Transaktion: mehrere hundert
 * Stücke sprengen deren Grenze). Alle Dokument-IDs entstehen vorab, damit
 * Stück und offene Ausgabe sich gegenseitig referenzieren — und damit ein
 * gescheiterter Import sich vollständig zurückrollen lässt. Davor nimmt der
 * Import die Sperre `bekleidungMeta/import` (`running`), danach steht sie
 * auf `done`.
 */
export interface ImportResult {
  artikel: number;
  stuecke: number;
  ausgaben: number;
  personsCreated: number;
}

async function importBekleidungImpl(
  groupId: string,
  fileBase64: string,
  decisions: ImportDecisions,
): Promise<ImportResult> {
  const session = await actionBekleidungswartRequired(groupId);
  const actor = actorOf(session);

  await precheckImport(groupId);
  const { preview, persons } = await prepareImport(groupId, fileBase64);
  const clean = sanitizeDecisions(decisions, persons, preview);

  let plan;
  try {
    plan = buildImportPlan(preview, clean, todayVienna());
  } catch (err) {
    throw badRequest((err as Error).message);
  }

  // --- IDs vergeben ---
  const personIdByKey = new Map<string, string>();
  for (const [key, value] of Object.entries(clean.persons)) {
    if ('personId' in value) personIdByKey.set(key, value.personId);
  }
  const writes: { ref: DocumentReference; data: object }[] = [];
  for (const p of plan.personsToCreate) {
    const ref = personCol(groupId).doc();
    personIdByKey.set(p.key, ref.id);
    writes.push({ ref, data: newPersonDoc(p.name, actor, p.active) });
  }
  const personIdOf = (key: string) => {
    const id = personIdByKey.get(key);
    if (!id) throw badRequest(`personDecisionMissing:${key}`);
    return id;
  };

  const stamps = {
    createdAt: actor.now,
    createdBy: actor.uid,
    updatedAt: actor.now,
    updatedBy: actor.uid,
  };

  const artikelIdByKey = new Map<string, string>();
  for (const a of plan.artikel) {
    const ref = artikelCol(groupId).doc();
    artikelIdByKey.set(a.key, ref.id);
    const { key: _key, ...fields } = a;
    void _key;
    writes.push({ ref, data: compact({ ...fields, ...stamps }) });
  }
  const artikelIdOf = (key: string) => {
    const id = artikelIdByKey.get(key);
    if (!id) throw new ApiException(`artikel ${key} missing in plan`, { status: 500 });
    return id;
  };

  const stueckIdByTemp = new Map<string, string>();
  for (const s of plan.stuecke) stueckIdByTemp.set(s.tempId, stueckCol(groupId).doc().id);

  // Ausgaben zuerst, damit das Stück die ID seiner offenen Ausgabe kennt.
  const openAusgabeByTemp = new Map<string, string>();
  for (const a of plan.ausgaben) {
    const ref = ausgabeCol(groupId).doc();
    const { artikelKey, personKey, stueckTempId, ...fields } = a;
    const stueckId = stueckTempId ? stueckIdByTemp.get(stueckTempId) : undefined;
    if (stueckTempId && !fields.zurueckAm) openAusgabeByTemp.set(stueckTempId, ref.id);
    writes.push({
      ref,
      data: compact({
        ...fields,
        personId: personIdOf(personKey),
        artikelId: artikelIdOf(artikelKey),
        stueckId,
        ...stamps,
      }),
    });
  }

  for (const s of plan.stuecke) {
    const { tempId, artikelKey, personKey, ...fields } = s;
    const ref = stueckCol(groupId).doc(stueckIdByTemp.get(tempId)!);
    const ausgabeId = personKey ? openAusgabeByTemp.get(tempId) : undefined;
    writes.push({
      ref,
      data: compact({
        ...fields,
        artikelId: artikelIdOf(artikelKey),
        personId: personKey && ausgabeId ? personIdOf(personKey) : undefined,
        ausgabeId,
        ...stamps,
      }),
    });
  }

  for (const b of plan.bestand) {
    const artikelId = artikelIdOf(b.artikelKey);
    writes.push({
      ref: bestandCol(groupId).doc(bestandDocId(artikelId, b.groesse)),
      data: {
        artikelId,
        groesse: normalizeGroesse(b.groesse),
        anzahl: b.anzahl,
        updatedAt: actor.now,
        updatedBy: actor.uid,
      },
    });
  }

  const counts: ImportResult = {
    artikel: plan.artikel.length,
    stuecke: plan.stuecke.length,
    ausgaben: plan.ausgaben.length,
    personsCreated: plan.personsToCreate.length,
  };

  // --- sperren und schreiben ---
  await acquireImportLock(groupId, actor);
  try {
    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
      const batch = firestore.batch();
      for (const w of writes.slice(i, i + BATCH_LIMIT)) batch.set(w.ref, w.data);
      await batch.commit();
    }
    await importLockRef(groupId).update({
      state: 'done',
      finishedAt: new Date().toISOString(),
      counts,
    });
  } catch (err) {
    await rollbackImport(groupId, writes.map((w) => w.ref));
    throw err;
  }

  return counts;
}

// --- Exportierte Actions -----------------------------------------------------

/**
 * Erwartete Fehler (Status < 500) kommen als Ergebnis zurück, nicht als
 * Ausnahme: Next.js ersetzt die Meldung einer geworfenen Ausnahme im
 * Produktionsbuild durch einen allgemeinen Text, die Oberfläche braucht aber
 * den Code (`alreadyIssued:<id>`, `notEmpty`, …). Anders als bei den Geräten
 * gibt es hier keine Offline-Warteschlange, die auf eine Ausnahme angewiesen
 * wäre. Alles andere wird geloggt und weitergeworfen.
 */
export type BekleidungActionError = { success: false; error: string };

type ActionResult<T> = T | BekleidungActionError;

async function asResult<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ApiException && err.status < 500) {
      return { success: false, error: err.message };
    }
    console.error('bekleidung action failed', err);
    throw err;
  }
}

async function asVoidResult(
  run: () => Promise<void>,
): Promise<ActionResult<{ success: true }>> {
  return asResult(async () => {
    await run();
    return { success: true as const };
  });
}

export async function saveArtikel(
  groupId: string,
  artikelId: string | undefined,
  input: ArtikelInput,
): Promise<ActionResult<{ id: string }>> {
  return asResult(() => saveArtikelImpl(groupId, artikelId, input));
}

export async function createStuecke(
  groupId: string,
  input: StueckInput & { artikelId: string; anzahl: number },
): Promise<ActionResult<{ ids: string[] }>> {
  return asResult(() => createStueckeImpl(groupId, input));
}

export async function updateStueck(
  groupId: string,
  stueckId: string,
  input: StueckInput,
): Promise<ActionResult<{ success: true }>> {
  return asVoidResult(() => updateStueckImpl(groupId, stueckId, input));
}

export async function issue(
  groupId: string,
  input: IssueInput,
): Promise<ActionResult<{ ausgabeIds: string[] }>> {
  return asResult(() => issueImpl(groupId, input));
}

export async function returnItems(
  groupId: string,
  input: ReturnInput,
): Promise<ActionResult<{ success: true }>> {
  return asVoidResult(() => returnItemsImpl(groupId, input));
}

export async function setStueckStatus(
  groupId: string,
  stueckId: string,
  status: 'ausgeschieden' | 'nicht_auffindbar' | 'lager',
  datum: string,
  bemerkung?: string,
): Promise<ActionResult<{ success: true }>> {
  return asVoidResult(() => setStueckStatusImpl(groupId, stueckId, status, datum, bemerkung));
}

export async function adjustBestand(
  groupId: string,
  input: { artikelId: string; groesse: string; delta: number; bemerkung?: string },
): Promise<ActionResult<{ success: true }>> {
  return asVoidResult(() => adjustBestandImpl(groupId, input));
}

export async function recordWaesche(
  groupId: string,
  input: WaescheInput,
): Promise<ActionResult<{ id: string }>> {
  return asResult(() => recordWaescheImpl(groupId, input));
}

export async function createPersonForBekleidung(
  groupId: string,
  name: string,
): Promise<ActionResult<{ id: string }>> {
  return asResult(() => createPersonForBekleidungImpl(groupId, name));
}

export async function previewBekleidungImport(
  groupId: string,
  fileBase64: string,
): Promise<ActionResult<ImportPreview>> {
  return asResult(() => previewBekleidungImportImpl(groupId, fileBase64));
}

export async function importBekleidung(
  groupId: string,
  fileBase64: string,
  decisions: ImportDecisions,
): Promise<ActionResult<ImportResult>> {
  return asResult(() => importBekleidungImpl(groupId, fileBase64, decisions));
}
