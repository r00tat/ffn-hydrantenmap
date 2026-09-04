'use server';
import 'server-only';

import {
  ATEMSCHUTZ_GERAET_TYPEN,
  FUELLSTATION_STANDORTE,
  geraetLabel,
  type AtemschutzGeraet,
  type AtemschutzGeraetTyp,
  type FuellstationStandort,
} from '../../common/atemschutz';
import { parse as parseCsv } from 'csv-parse/sync';
import {
  abgleich,
  rowsToGeraete,
  type ImportPlanZeile,
} from '../../common/atemschutzImport';
import { readXlsxSheet } from '../../common/xlsx';
import {
  buildMangelDocument,
  FAHRTENBUCH_MANGEL_COLLECTION_ID,
} from '../../common/mangel';
import {
  actionGroupAdminRequired,
  actionUserRequired,
} from '../../app/auth';
import { firestore } from '../../server/firebase/admin';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import { geraeteRef, loadGeraet, loadGeraete } from './atemschutzStammdaten';

export interface AtemschutzActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

/** Die Felder, die der Verwaltungsdialog schreiben darf. */
export type GeraetInput = Pick<
  AtemschutzGeraet,
  | 'typ'
  | 'bezeichnung'
  | 'feuerwehr'
  | 'nummer'
  | 'inventarNr'
  | 'zusatzInventarNr'
  | 'seriennummer'
  | 'externeId'
  | 'barcodes'
  | 'nenndruck'
  | 'volumenLiter'
  | 'material'
  | 'hersteller'
  | 'baujahr'
  | 'active'
  | 'bemerkung'
  | 'standort'
  | 'vehicleId'
  | 'vehicleName'
>;

function trimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/**
 * Baut das zu speichernde Dokument aus der Client-Eingabe.
 *
 * Server-Action-Argumente sind Client-Eingabe und der `Pick<>`-Typ ist zur
 * Laufzeit weg — deshalb hier bereinigen statt roh zu speichern, dieselbe
 * Vorsicht wie in `saveFahrtenbuchVehicle`. Leere Felder werden weggelassen
 * statt als leerer String gespeichert: `lookupKeys` filtert sie ohnehin, und
 * ein leerer String im Dokument sieht aus wie eine gepflegte Angabe.
 */
function buildGeraetPayload(input: GeraetInput): Record<string, unknown> {
  const typ: AtemschutzGeraetTyp = ATEMSCHUTZ_GERAET_TYPEN.includes(input.typ)
    ? input.typ
    : 'zubehoer';

  const payload: Record<string, unknown> = {
    typ,
    bezeichnung: trimmed(input.bezeichnung) ?? '',
    feuerwehr: trimmed(input.feuerwehr) ?? '',
    active: input.active !== false,
  };

  const optionalStrings: (keyof GeraetInput)[] = [
    'nummer',
    'inventarNr',
    'zusatzInventarNr',
    'seriennummer',
    'externeId',
    'material',
    'hersteller',
    'bemerkung',
    'vehicleId',
    'vehicleName',
  ];
  for (const key of optionalStrings) {
    const value = trimmed(input[key]);
    if (value) payload[key] = value;
  }

  const barcodes = Array.isArray(input.barcodes)
    ? [
        ...new Set(
          input.barcodes
            .map((b) => trimmed(b))
            .filter((b): b is string => !!b),
        ),
      ]
    : [];
  if (barcodes.length > 0) payload.barcodes = barcodes;

  const nenndruck = positiveNumber(input.nenndruck);
  if (nenndruck) payload.nenndruck = nenndruck;
  const volumen = positiveNumber(input.volumenLiter);
  if (volumen) payload.volumenLiter = volumen;
  const baujahr = positiveNumber(input.baujahr);
  if (baujahr) payload.baujahr = baujahr;

  // Nur ein gültiger Wert wird übernommen. Ein Standort an einer Maske wäre
  // ebenso sinnlos wie ein erfundener String im Feld.
  if (
    typ === 'fuellstation' &&
    FUELLSTATION_STANDORTE.includes(input.standort as FuellstationStandort)
  ) {
    payload.standort = input.standort;
  }

  return payload;
}

export async function saveAtemschutzGeraet(
  groupId: string,
  geraetId: string | undefined,
  input: GeraetInput,
): Promise<AtemschutzActionResult> {
  try {
    const session = await actionGroupAdminRequired(groupId);
    const now = new Date().toISOString();
    const payload = {
      ...buildGeraetPayload(input),
      updatedAt: now,
      updatedBy: session.user.id,
    };

    if (geraetId) {
      await geraeteRef(groupId).doc(geraetId).set(payload, { merge: true });
      return { success: true, id: geraetId };
    }
    const ref = await geraeteRef(groupId).add({
      ...payload,
      createdAt: now,
      createdBy: session.user.id,
    });
    return { success: true, id: ref.id };
  } catch (err) {
    console.error('saveAtemschutzGeraet failed', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteAtemschutzGeraet(
  groupId: string,
  geraetId: string,
): Promise<AtemschutzActionResult> {
  try {
    await actionGroupAdminRequired(groupId);
    await geraeteRef(groupId).doc(geraetId).delete();
    return { success: true, id: geraetId };
  } catch (err) {
    console.error('deleteAtemschutzGeraet failed', err);
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Lernt einen gescannten Code an einem Gerät an.
 *
 * Eigene Action und nicht `saveAtemschutzGeraet` mit voller Eingabe: Der
 * Anlern-Knopf steht im Einsatzdialog, wo niemand die übrigen Stammdaten in
 * der Hand hat — ein Rundlauf über das ganze Dokument würde dort Felder
 * überschreiben, die der Dialog gar nicht kennt.
 */
export async function addAtemschutzBarcode(
  groupId: string,
  geraetId: string,
  code: string,
): Promise<AtemschutzActionResult> {
  try {
    const session = await actionGroupAdminRequired(groupId);
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      return { success: false, error: 'codeMissing' };
    }
    const ref = geraeteRef(groupId).doc(geraetId);
    const doc = await ref.get();
    if (!doc.exists) {
      return { success: false, error: 'geraetNotFound' };
    }
    const existing = (doc.data() as AtemschutzGeraet).barcodes ?? [];
    if (existing.includes(trimmedCode)) {
      return { success: true, id: geraetId };
    }
    await ref.set(
      {
        barcodes: [...existing, trimmedCode],
        updatedAt: new Date().toISOString(),
        updatedBy: session.user.id,
      },
      { merge: true },
    );
    return { success: true, id: geraetId };
  } catch (err) {
    console.error('addAtemschutzBarcode failed', err);
    return { success: false, error: (err as Error).message };
  }
}

/** Obergrenze der Importdatei — ein Riegel gegen eine manipulierte Anfrage. */
const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const IMPORT_MAX_ZEILEN = 5000;

export interface ImportPreviewResult {
  success: boolean;
  error?: string;
  plan?: ImportPlanZeile[];
}

/**
 * CSV mit denselben Spaltennamen wie der XLSX-Export.
 *
 * `columns: false` ist Absicht: `rowsToGeraete` erwartet ein Raster mit
 * Kopfzeile, damit XLSX und CSV denselben Weg gehen und die Spaltenerkennung
 * nur an einer Stelle steht.
 */
function readCsvRows(buffer: Uint8Array): string[][] {
  const text = new TextDecoder('utf-8').decode(buffer);
  // Der Export einer deutschsprachigen Tabellenkalkulation trennt mit
  // Semikolon; eine Datei mit Komma kommt trotzdem vor.
  const delimiter = text.slice(0, 500).includes(';') ? ';' : ',';
  return parseCsv(text, {
    delimiter,
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];
}

/**
 * Liest die hochgeladene Datei und gleicht sie gegen den Bestand ab — ohne zu
 * schreiben.
 *
 * Vorschau und Import sind zwei Actions und nicht eine mit `dryRun`-Flag: Der
 * Benutzer entscheidet zwischen beiden Aufrufen je Zeile *neu*, *aktualisieren*
 * oder *überspringen*. Ein einziger Aufruf müsste diese Entscheidung erraten.
 *
 * Anders als beim Hydranten-Import wird das Ergebnis **nicht** serverseitig
 * zwischengespeichert: Der Plan sind einige hundert flache Objekte, die der
 * Client ohnehin anzeigt und bearbeitet — ein Cache mit Sitzungs-ID wäre hier
 * nur eine zweite Stelle, an der er veralten kann.
 */
export async function previewAtemschutzImport(
  groupId: string,
  formData: FormData,
): Promise<ImportPreviewResult> {
  try {
    await actionGroupAdminRequired(groupId);

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { success: false, error: 'fileMissing' };
    }
    if (file.size > IMPORT_MAX_BYTES) {
      return { success: false, error: 'fileTooLarge' };
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const rows = file.name.toLowerCase().endsWith('.csv')
      ? readCsvRows(buffer)
      : readXlsxSheet(buffer);

    if (rows.length > IMPORT_MAX_ZEILEN) {
      return { success: false, error: 'tooManyRows' };
    }

    const zeilen = rowsToGeraete(rows);
    const bestand = await loadGeraete(groupId);
    return { success: true, plan: abgleich(zeilen, bestand) };
  } catch (err) {
    console.error('previewAtemschutzImport failed', err);
    return { success: false, error: (err as Error).message };
  }
}

export interface ImportResult {
  success: boolean;
  error?: string;
  created?: number;
  updated?: number;
}

/**
 * Schreibt die vom Benutzer bestätigten Zeilen.
 *
 * Der Client schickt den bearbeiteten Plan zurück — die übersprungenen Zeilen
 * hat er bereits entfernt. Die Aktion prüft nur noch, dass eine
 * `update`-Zeile auch tatsächlich eine `existingId` trägt: Ohne diese Schranke
 * legte ein manipulierter Aufruf mit `status: 'update'` und fehlender ID
 * stillschweigend Dubletten an.
 */
export async function importAtemschutzGeraete(
  groupId: string,
  plan: ImportPlanZeile[],
): Promise<ImportResult> {
  try {
    const session = await actionGroupAdminRequired(groupId);
    if (!Array.isArray(plan) || plan.length > IMPORT_MAX_ZEILEN) {
      return { success: false, error: 'tooManyRows' };
    }

    const now = new Date().toISOString();
    const ref = geraeteRef(groupId);
    let created = 0;
    let updated = 0;

    // Firestore begrenzt einen Batch auf 500 Schreibvorgänge.
    const CHUNK = 400;
    for (let i = 0; i < plan.length; i += CHUNK) {
      const batch = ref.firestore.batch();
      for (const zeile of plan.slice(i, i + CHUNK)) {
        const payload = {
          ...buildGeraetPayload(zeile.geraet as GeraetInput),
          updatedAt: now,
          updatedBy: session.user.id,
        };
        if (zeile.status === 'update' && zeile.existingId) {
          batch.set(ref.doc(zeile.existingId), payload, { merge: true });
          updated += 1;
        } else {
          batch.set(ref.doc(), {
            ...payload,
            createdAt: now,
            createdBy: session.user.id,
          });
          created += 1;
        }
      }
      await batch.commit();
    }

    return { success: true, created, updated };
  } catch (err) {
    console.error('importAtemschutzGeraete failed', err);
    return { success: false, error: (err as Error).message };
  }
}

export interface AtemschutzMangelInput {
  geraetId: string;
  description: string;
  /** Bereits hochgeladene Bilder als Storage-Pfade. */
  images?: string[];
}

/**
 * Meldet einen Mangel an einem Ausrüstungsstück.
 *
 * `actionUserRequired()` und **nicht** `actionGroupAdminRequired()`: Am
 * Sammelplatz fällt der Mangel auf, und wer ihn bemerkt, verwaltet die Gruppe
 * in aller Regel nicht. Die
 * Stammdaten bleiben davon unberührt — geschrieben wird nur in die
 * Mängel-Collection. Die Gruppenzugehörigkeit wird geprüft, sonst könnte ein
 * beliebiger angemeldeter Benutzer in fremde Gruppen schreiben.
 */
export async function createAtemschutzMangel(
  groupId: string,
  input: AtemschutzMangelInput,
): Promise<AtemschutzActionResult> {
  try {
    const session = await actionUserRequired();
    if (!session.user?.groups?.includes(groupId)) {
      return { success: false, error: 'notInGroup' };
    }

    // Lädt das Gerät auch, um seinen Namen ins Dokument zu kopieren: Die
    // Mängelliste soll ohne Join lesbar sein — dieselbe Bauweise wie
    // `Mangel.vehicleName`.
    const geraet = await loadGeraet(groupId, input.geraetId);
    const name = geraetLabel(geraet);

    const doc = buildMangelDocument(
      {
        itemType: 'atemschutz',
        itemId: input.geraetId,
        description: input.description,
        images: input.images,
      },
      { type: 'atemschutz', id: input.geraetId, name },
      groupId,
      {
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? '',
        now: new Date().toISOString(),
      },
    );

    const ref = await firestore
      .collection(GROUP_COLLECTION_ID)
      .doc(groupId)
      .collection(FAHRTENBUCH_MANGEL_COLLECTION_ID)
      .add(doc);
    return { success: true, id: ref.id };
  } catch (err) {
    console.error('createAtemschutzMangel failed', err);
    return { success: false, error: (err as Error).message };
  }
}
