'use server';
import 'server-only';

import { getTranslations } from 'next-intl/server';
import { actionGroupAdminRequired } from '../../app/auth';
import type { Group } from '../../app/groups/groupTypes';
import {
  fuellungSperre,
  geraetKennung,
  zweckOf,
  type AtemschutzFuellung,
  type FuellungZweck,
} from '../../common/atemschutz';
import { fuellungDublettenSchluessel, type CsvFuellung } from '../../common/fuellprotokollCsv';
import { zonedDayRange } from '../../common/zonedDay';
import { firestore } from '../../server/firebase/admin';
import { actionErrorKey } from '../Fahrtenbuch/actionErrorKey';
import { actionGroupMemberRequired } from '../Fahrtenbuch/authGuards';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import { loadGeraete } from './atemschutzStammdaten';
import {
  buildFuellprotokollExport,
  type FuellprotokollTranslate,
} from './fuellprotokollExportModel';
import { renderFuellprotokollPdf } from './renderFuellprotokollPdf';
import { fuellungRef } from './rechnungStore';

/**
 * Obergrenze der Zeilen eines Ausdrucks. Ein Jahr einer Feuerwehr liegt bei
 * einigen hundert Füllungen; die Grenze fängt einen versehentlich riesigen
 * Ausschnitt ab, bevor er den Renderer beschäftigt.
 */
const MAX_EXPORT_ZEILEN = 3000;

/** Obergrenze einer Importdatei — ein Riegel gegen eine manipulierte Anfrage. */
const MAX_IMPORT_ZEILEN = 3000;

/**
 * Zeitzone der Tagesgrenzen und Zeitangaben, wenn der Browser keine mitschickt.
 * Dieselbe Vorgabe wie in `src/i18n/request.ts`.
 */
const DEFAULT_TIME_ZONE = 'Europe/Vienna';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function loadGroupName(groupId: string): Promise<string> {
  const doc = await firestore.collection(GROUP_COLLECTION_ID).doc(groupId).get();
  return (doc.data() as Group | undefined)?.name ?? groupId;
}

/**
 * Die Füllungen eines Zeitraums, serverseitig gefiltert.
 *
 * Einsatz *und* Zeitraum in derselben Abfrage geht mit dem vorhandenen Index
 * `firecallId ASC, zeitpunkt DESC`: eine Gleichheitsbedingung plus ein Bereich
 * auf dem Sortierfeld. Zweck und Verrechnen filtert der Server danach im
 * Speicher — jede weitere Gleichheitsbedingung bräuchte einen eigenen Index,
 * und die Menge ist durch `MAX_EXPORT_ZEILEN` ohnehin beschränkt.
 */
async function loadFuellungen(
  groupId: string,
  fromIso: string,
  toIso: string,
  firecallId?: string,
): Promise<{ fuellungen: AtemschutzFuellung[]; truncated: boolean }> {
  let query = fuellungRef(groupId).where('zeitpunkt', '>=', fromIso);
  if (firecallId !== undefined) {
    query = query.where('firecallId', '==', firecallId);
  }
  const snapshot = await query
    .where('zeitpunkt', '<=', toIso)
    .orderBy('zeitpunkt', 'asc')
    .limit(MAX_EXPORT_ZEILEN + 1)
    .get();

  const alle = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as AtemschutzFuellung);
  return {
    fuellungen: alle.slice(0, MAX_EXPORT_ZEILEN),
    truncated: alle.length > MAX_EXPORT_ZEILEN,
  };
}

export interface FuellprotokollExportRequest {
  groupId: string;
  /** Erster Tag des Zeitraums, `YYYY-MM-DD`. */
  from: string;
  /** Letzter Tag des Zeitraums, `YYYY-MM-DD`. */
  to: string;
  /** `undefined` = alle, `''` = nur Stationsfüllungen, sonst die Einsatz-ID. */
  firecallId?: string;
  /** Anzeigename des Einsatzes, für die Kopfzeile des Ausdrucks. */
  firecallName?: string;
  zweck?: FuellungZweck;
  nurVerrechnen?: boolean;
  /** Zeitzone des Browsers — bestimmt Tagesgrenzen und Uhrzeiten. */
  timeZone?: string;
}

export interface FuellprotokollExportResult {
  success: boolean;
  error?: string;
  fileName?: string;
  /** Das PDF als base64 — eine Server Action liefert keinen Stream. */
  pdfBase64?: string;
  zeilen?: number;
}

function exportFileName(from: string, to: string, groupName: string): string {
  const slug = groupName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `fuellprotokoll_${slug || 'gruppe'}_${from}_${to}.pdf`;
}

/**
 * Erzeugt den Ausdruck des Füllprotokolls für einen Zeitraum und die gesetzten
 * Filter.
 *
 * Lesen darf ihn **jedes Gruppenmitglied** — dieselbe Grenze wie beim Lesen der
 * Liste. Der Ausdruck enthält nichts, was am Bildschirm nicht ohnehin steht.
 */
export async function exportFuellprotokollPdf(
  request: FuellprotokollExportRequest,
): Promise<FuellprotokollExportResult> {
  try {
    const { groupId, from, to, firecallId, firecallName, zweck, nurVerrechnen } = request;
    const session = await actionGroupMemberRequired(groupId);

    // Action-Argumente sind Client-Eingabe: Tage und Zeitzone werden geprüft,
    // bevor daraus Abfragegrenzen und ein Dateiname entstehen.
    if (!DAY_RE.test(from ?? '') || !DAY_RE.test(to ?? '') || from > to) {
      return { success: false, error: 'exportRangeInvalid' };
    }

    const zone = request.timeZone?.trim() || DEFAULT_TIME_ZONE;
    const { fromIso, toIso } = zonedDayRange(from, to, zone);

    const { fuellungen, truncated } = await loadFuellungen(groupId, fromIso, toIso, firecallId);
    // Ein stillschweigend gekürzter Nachweis wäre schlimmer als eine Absage.
    if (truncated) return { success: false, error: 'exportTooLarge' };

    const gefiltert = fuellungen
      .filter((f) => !zweck || zweckOf(f) === zweck)
      .filter((f) => !nurVerrechnen || f.verrechnen);

    const [groupName, geraete, t] = await Promise.all([
      loadGroupName(groupId),
      loadGeraete(groupId),
      getTranslations('atemschutz'),
    ]);

    // `t` ist über den Katalog typisiert; das Modell arbeitet mit freien
    // Schlüsseln, damit es ohne next-intl testbar bleibt.
    const translate: FuellprotokollTranslate = (key, values) =>
      t(key as Parameters<typeof t>[0], values as never);

    const kennungById = new Map<string, string>();
    for (const g of geraete) {
      const kennung = geraetKennung(g);
      if (g.id && kennung) kennungById.set(g.id, kennung);
    }

    const model = buildFuellprotokollExport(
      {
        fuellungen: gefiltert,
        kennungById,
        from,
        to,
        timeZone: zone,
        groupName,
        ...(firecallId !== undefined ? { einsatzFilter: firecallName ?? '' } : {}),
        ...(zweck ? { zweckFilter: zweck } : {}),
        ...(nurVerrechnen ? { nurVerrechnen: true } : {}),
        generatedAt: new Date().toISOString(),
        generatedBy: session.user.name ?? undefined,
      },
      translate,
    );

    const pdf = await renderFuellprotokollPdf(model, (page, total) =>
      t('export.page', { page, total }),
    );

    return {
      success: true,
      fileName: exportFileName(from, to, groupName),
      pdfBase64: Buffer.from(pdf).toString('base64'),
      zeilen: model.rows.length,
    };
  } catch (err) {
    console.error('fuellprotokoll export failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

export interface FuellungAdminResult {
  success: boolean;
  error?: string;
}

/**
 * Die Felder, die ein Gruppen-Admin an einer fremden Zeile ändern darf — genau
 * die des Dialogs. `createdBy`, `rechnungId` und die Zeitstempel stehen
 * bewusst nicht darin: Wer eine fremde Zeile korrigiert, wird nicht ihr
 * Erfasser, und eine Rechnungszuordnung ist keine Eingabe.
 */
export type FuellungAdminPatch = Partial<
  Pick<
    AtemschutzFuellung,
    | 'geraetId'
    | 'flaschenNummer'
    | 'feuerwehr'
    | 'anzahl'
    | 'startdruck'
    | 'enddruck'
    | 'gefuelltVon'
    | 'zeitpunkt'
    | 'sichtkontrolle'
    | 'bemerkung'
    | 'firecallId'
    | 'firecallName'
    | 'fuellstationId'
    | 'fuellstationName'
    | 'verrechnen'
    | 'zweck'
  >
>;

const ERLAUBTE_PATCH_FELDER = new Set<string>([
  'geraetId',
  'flaschenNummer',
  'feuerwehr',
  'anzahl',
  'startdruck',
  'enddruck',
  'gefuelltVon',
  'zeitpunkt',
  'sichtkontrolle',
  'mangelId',
  'bemerkung',
  'firecallId',
  'firecallName',
  'fuellstationId',
  'fuellstationName',
  'verrechnen',
  'zweck',
]);

/**
 * Ändert eine Füllung, die dem Benutzer nicht gehört.
 *
 * Warum überhaupt eine Server Action, wo sonst der Client schreibt: Die
 * Gruppen-Admin-Rolle steckt in keinem Custom Claim und ist für die
 * Firestore-Regeln nicht sichtbar (siehe berechtigungen.md). Die Regel lässt
 * deshalb nur den Erfasser an seine eigene Zeile; alles darüber hinaus geht
 * über das Admin SDK. Der Verlust der Offline-Fähigkeit ist hier hinnehmbar —
 * eine fremde Zeile korrigiert man am Schreibtisch, nicht am Sammelplatz.
 */
export async function updateFremdeFuellung(
  groupId: string,
  fuellungId: string,
  patch: FuellungAdminPatch,
): Promise<FuellungAdminResult> {
  try {
    const session = await actionGroupAdminRequired(groupId);

    const ref = fuellungRef(groupId).doc(fuellungId);
    const doc = await ref.get();
    if (!doc.exists) return { success: false, error: 'fuellungGone' };

    // Dieselbe Entscheidung wie im Client, nur hier verbindlich: Eine
    // abgerechnete Zeile ändert auch der Gruppen-Admin nicht.
    const sperre = fuellungSperre({
      fuellung: doc.data() as AtemschutzFuellung,
      uid: session.user.id,
      istGruppenAdmin: true,
    });
    if (sperre) return { success: false, error: 'fuellungVerrechnet' };

    const sauber = Object.fromEntries(
      Object.entries(patch ?? {}).filter(
        ([key, value]) => ERLAUBTE_PATCH_FELDER.has(key) && value !== undefined,
      ),
    );
    if (Object.keys(sauber).length === 0) {
      return { success: false, error: 'saveFailed' };
    }

    await ref.update({
      ...sauber,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.id,
    });
    return { success: true };
  } catch (err) {
    console.error('updateFremdeFuellung failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

/** Löscht eine fremde Zeile. Dieselben Schranken wie beim Ändern. */
export async function deleteFremdeFuellung(
  groupId: string,
  fuellungId: string,
): Promise<FuellungAdminResult> {
  try {
    const session = await actionGroupAdminRequired(groupId);

    const ref = fuellungRef(groupId).doc(fuellungId);
    const doc = await ref.get();
    if (!doc.exists) return { success: true };

    const sperre = fuellungSperre({
      fuellung: doc.data() as AtemschutzFuellung,
      uid: session.user.id,
      istGruppenAdmin: true,
    });
    if (sperre) return { success: false, error: 'fuellungVerrechnet' };

    await ref.delete();
    return { success: true };
  } catch (err) {
    console.error('deleteFremdeFuellung failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

export interface FuellungImportZeile {
  /** Zeilennummer in der Datei — für die Vorschau. */
  zeile: number;
  fuellung: CsvFuellung;
  /** `duplicate` heißt: steht schon so im Protokoll. */
  status: 'new' | 'duplicate';
}

export interface FuellungImportPreviewResult {
  success: boolean;
  error?: string;
  plan?: FuellungImportZeile[];
}

/**
 * Alle Dublettenschlüssel des Bestands im Zeitraum der Datei.
 *
 * Nur der Zeitraum und nicht das ganze Protokoll: Ein Nachtrag umfasst
 * typischerweise ein Jahr, der Bestand kann zehn sein. Die Grenzen kommen aus
 * der Datei selbst, deshalb kann keine Dublette außerhalb liegen.
 */
async function bestandsSchluessel(groupId: string, zeilen: CsvFuellung[]): Promise<Set<string>> {
  const zeitpunkte = zeilen.map((z) => z.zeitpunkt).sort();
  const von = zeitpunkte[0];
  const bis = zeitpunkte[zeitpunkte.length - 1];
  // Eine Minute Luft an beiden Enden: Der Schlüssel vergleicht auf die Minute,
  // die Abfrage auf die Millisekunde.
  const puffer = 60_000;
  const snapshot = await fuellungRef(groupId)
    .where('zeitpunkt', '>=', new Date(Date.parse(von) - puffer).toISOString())
    .where('zeitpunkt', '<=', new Date(Date.parse(bis) + puffer).toISOString())
    .orderBy('zeitpunkt', 'asc')
    .limit(MAX_IMPORT_ZEILEN * 2)
    .get();

  return new Set(
    snapshot.docs.map((d) => fuellungDublettenSchluessel(d.data() as AtemschutzFuellung)),
  );
}

/**
 * Gleicht die eingelesenen Zeilen gegen den Bestand ab, ohne zu schreiben.
 *
 * Die Datei wird **im Browser** zerlegt und kommt hier bereits als Liste an:
 * Datum und Uhrzeit stehen als Ortszeit in der Datei, und der Server läuft in
 * UTC — jede hier gelesene Uhrzeit läge um den Zonenversatz daneben. Siehe
 * `fuellprotokollCsv.ts`.
 */
export async function previewFuellungImport(
  groupId: string,
  zeilen: FuellungImportZeile[],
): Promise<FuellungImportPreviewResult> {
  try {
    await actionGroupAdminRequired(groupId);
    if (!Array.isArray(zeilen) || zeilen.length === 0) {
      return { success: false, error: 'fileEmpty' };
    }
    if (zeilen.length > MAX_IMPORT_ZEILEN) {
      return { success: false, error: 'tooManyRows' };
    }

    const bestand = await bestandsSchluessel(
      groupId,
      zeilen.map((z) => z.fuellung),
    );
    // Dubletten *innerhalb* der Datei zählen mit: Wer eine Zeile zweimal
    // untereinander stehen hat, will keine zwei Dokumente.
    const gesehen = new Set<string>();

    const plan = zeilen.map((z) => {
      const key = fuellungDublettenSchluessel(z.fuellung);
      const doppelt = bestand.has(key) || gesehen.has(key);
      gesehen.add(key);
      return { ...z, status: doppelt ? ('duplicate' as const) : ('new' as const) };
    });

    return { success: true, plan };
  } catch (err) {
    console.error('previewFuellungImport failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

export interface FuellungImportResult {
  success: boolean;
  error?: string;
  created?: number;
  skipped?: number;
}

/**
 * Schreibt die als neu erkannten Zeilen.
 *
 * Der Abgleich läuft hier **noch einmal** und nicht nur in der Vorschau:
 * Zwischen beiden Aufrufen kann jemand dieselbe Datei eingespielt haben, und
 * der Client könnte den Status ohnehin frei setzen.
 */
export async function importFuellungen(
  groupId: string,
  zeilen: FuellungImportZeile[],
): Promise<FuellungImportResult> {
  try {
    const session = await actionGroupAdminRequired(groupId);
    if (!Array.isArray(zeilen) || zeilen.length === 0) {
      return { success: false, error: 'fileEmpty' };
    }
    if (zeilen.length > MAX_IMPORT_ZEILEN) {
      return { success: false, error: 'tooManyRows' };
    }

    const bestand = await bestandsSchluessel(
      groupId,
      zeilen.map((z) => z.fuellung),
    );
    const gesehen = new Set<string>();
    const now = new Date().toISOString();
    const ref = fuellungRef(groupId);

    const zuSchreiben: AtemschutzFuellung[] = [];
    let skipped = 0;
    for (const { fuellung } of zeilen) {
      const key = fuellungDublettenSchluessel(fuellung);
      if (bestand.has(key) || gesehen.has(key)) {
        skipped += 1;
        continue;
      }
      gesehen.add(key);
      zuSchreiben.push({
        ...(fuellung.flaschenNummer ? { flaschenNummer: fuellung.flaschenNummer } : {}),
        ...(fuellung.feuerwehr ? { feuerwehr: fuellung.feuerwehr } : {}),
        anzahl: fuellung.anzahl,
        ...(fuellung.startdruck !== undefined ? { startdruck: fuellung.startdruck } : {}),
        enddruck: fuellung.enddruck,
        gefuelltVon: fuellung.gefuelltVon,
        zeitpunkt: fuellung.zeitpunkt,
        ...(fuellung.sichtkontrolle ? { sichtkontrolle: fuellung.sichtkontrolle } : {}),
        ...(fuellung.bemerkung ? { bemerkung: fuellung.bemerkung } : {}),
        // Der Einsatzbezug bleibt leer: In der Datei steht nur ein Name, und
        // eine geratene Einsatz-ID wäre schlimmer als keine. Der Name selbst
        // bleibt als `firecallName` stehen, damit der Nachtrag lesbar ist.
        firecallId: '',
        ...(fuellung.firecallName ? { firecallName: fuellung.firecallName } : {}),
        ...(fuellung.fuellstationName ? { fuellstationName: fuellung.fuellstationName } : {}),
        verrechnen: fuellung.verrechnen,
        zweck: fuellung.zweck,
        createdAt: now,
        createdBy: session.user.id,
        updatedAt: now,
        updatedBy: session.user.id,
      });
    }

    // Firestore begrenzt einen Batch auf 500 Schreibvorgänge.
    const CHUNK = 400;
    for (let i = 0; i < zuSchreiben.length; i += CHUNK) {
      const batch = firestore.batch();
      for (const doc of zuSchreiben.slice(i, i + CHUNK)) {
        batch.set(ref.doc(), doc);
      }
      await batch.commit();
    }

    return { success: true, created: zuSchreiben.length, skipped };
  } catch (err) {
    console.error('importFuellungen failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}
