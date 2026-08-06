'use server';
import 'server-only';

import { renderToBuffer } from '@react-pdf/renderer';
import { getTranslations } from 'next-intl/server';
import type { Group } from '../../app/groups/groupTypes';
import {
  FAHRTENBUCH_COLLECTION_ID,
  FAHRTENBUCH_VEHICLE_COLLECTION_ID,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { firestore } from '../../server/firebase/admin';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import { actionErrorKey } from './actionErrorKey';
import { actionGroupMemberRequired } from './authGuards';
import FahrtenbuchPdf from './FahrtenbuchPdf';
import {
  buildFahrtenbuchExport,
  exportFileName,
  zonedDayRange,
  type ExportTranslate,
} from './fahrtenbuchExportModel';

/**
 * Obergrenze der ausgelesenen Fahrten. Ein Jahr einer Feuerwehr liegt bei
 * einigen hundert Einträgen; die Grenze fängt einen versehentlich riesigen
 * Zeitraum ab, bevor der Server ein PDF mit tausenden Seiten rendert. Der
 * Benutzer bekommt eine Meldung und keinen Timeout.
 */
const MAX_EXPORT_ENTRIES = 5000;

/**
 * Zeitzone der Tagesgrenzen und der Zeitangaben, wenn der Browser keine
 * mitschickt. Dieselbe Vorgabe wie in `src/i18n/request.ts`.
 */
const DEFAULT_TIME_ZONE = 'Europe/Vienna';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface FahrtenbuchExportRequest {
  groupId: string;
  /** Erster Tag des Zeitraums, `YYYY-MM-DD`. */
  from: string;
  /** Letzter Tag des Zeitraums, `YYYY-MM-DD`. */
  to: string;
  /** Die zu exportierenden Fahrzeuge. */
  vehicleIds: string[];
  /** IANA-Zone des Browsers, damit Tagesgrenzen und Uhrzeiten stimmen. */
  timeZone?: string;
}

export interface FahrtenbuchExportResult {
  success: boolean;
  /** Schlüssel unter `fahrtenbuch.errors` oder Klartext der Ausnahme. */
  error?: string;
  fileName?: string;
  /**
   * Das PDF als base64. Eine Server Action liefert keinen Stream; die
   * Alternative wäre eine API-Route mit ID-Token im Header (wie beim
   * Kostenersatz) — dafür ist hier nichts zu gewinnen, der Export ist eine
   * einzelne Antwort und die Action bringt die Gruppenprüfung schon mit.
   */
  pdfBase64?: string;
  /** Zahl der enthaltenen Fahrten — die Oberfläche meldet sie zurück. */
  entryCount?: number;
}

function entriesRef(groupId: string) {
  return firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(FAHRTENBUCH_COLLECTION_ID);
}

async function loadGroupName(groupId: string): Promise<string | undefined> {
  const doc = await firestore.collection(GROUP_COLLECTION_ID).doc(groupId).get();
  return (doc.data() as Group | undefined)?.name;
}

/**
 * Die gewählten Fahrzeuge in der Reihenfolge der Übersichtsseite. Unbekannte
 * IDs fallen weg — ein inzwischen gelöschtes Fahrzeug soll den Export nicht
 * abbrechen.
 */
async function loadSelectedVehicles(
  groupId: string,
  vehicleIds: string[],
): Promise<FahrtenbuchVehicle[]> {
  const snapshot = await firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(FAHRTENBUCH_VEHICLE_COLLECTION_ID)
    .get();
  const selected = new Set(vehicleIds);
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }) as FahrtenbuchVehicle)
    .filter((v) => selected.has(v.id as string))
    .sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        (a.name ?? '').localeCompare(b.name ?? ''),
    );
}

/**
 * Die Fahrten des Zeitraums. Absteigend abgefragt, weil genau dafür ein Index
 * besteht (`deleted`/`abfahrt DESC`); die Reihenfolge der Ausgabe stellt das
 * Modell her. Ohne Fahrzeugfilter in der Abfrage — die Auswahl wird im
 * Speicher angewandt, sonst bräuchte jedes Fahrzeug eine eigene Abfrage.
 */
async function loadEntries(
  groupId: string,
  fromIso: string,
  toIso: string,
): Promise<{ entries: FahrtenbuchEntry[]; truncated: boolean }> {
  const snapshot = await entriesRef(groupId)
    .where('deleted', '==', false)
    .where('abfahrt', '>=', fromIso)
    .where('abfahrt', '<=', toIso)
    .orderBy('abfahrt', 'desc')
    .limit(MAX_EXPORT_ENTRIES + 1)
    .get();
  const entries = snapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as FahrtenbuchEntry,
  );
  return {
    entries: entries.slice(0, MAX_EXPORT_ENTRIES),
    truncated: entries.length > MAX_EXPORT_ENTRIES,
  };
}

/**
 * Erzeugt den PDF-Export des Fahrtenbuchs für einen Zeitraum und eine Auswahl
 * von Fahrzeugen.
 */
export async function exportFahrtenbuchPdf(
  request: FahrtenbuchExportRequest,
): Promise<FahrtenbuchExportResult> {
  try {
    const { groupId, from, to, vehicleIds, timeZone } = request;
    const session = await actionGroupMemberRequired(groupId);

    // Action-Argumente sind Client-Eingabe: Tage und Zeitzone werden geprüft,
    // bevor daraus Abfragegrenzen und Dateiname entstehen.
    if (!DAY_RE.test(from ?? '') || !DAY_RE.test(to ?? '') || from > to) {
      return { success: false, error: 'exportRangeInvalid' };
    }
    if (!Array.isArray(vehicleIds) || vehicleIds.length === 0) {
      return { success: false, error: 'exportNoVehicles' };
    }

    const vehicles = await loadSelectedVehicles(groupId, vehicleIds);
    if (vehicles.length === 0) {
      return { success: false, error: 'exportNoVehicles' };
    }

    const zone = timeZone?.trim() || DEFAULT_TIME_ZONE;
    const { fromIso, toIso } = zonedDayRange(from, to, zone);
    const { entries, truncated } = await loadEntries(groupId, fromIso, toIso);
    if (truncated) {
      return { success: false, error: 'exportTooLarge' };
    }

    const groupName = await loadGroupName(groupId);
    const t = await getTranslations('fahrtenbuch');
    // `t` ist über den Katalog typisiert; das Modell arbeitet mit freien
    // Schlüsseln, damit es ohne next-intl testbar bleibt.
    const translate: ExportTranslate = (key, values) =>
      t(key as Parameters<typeof t>[0], values as never);

    const selectedIds = new Set(vehicles.map((v) => v.id));
    const model = buildFahrtenbuchExport(
      {
        vehicles,
        entries: entries.filter((e) => selectedIds.has(e.vehicleId)),
        from,
        to,
        timeZone: zone,
        groupName,
        generatedAt: new Date().toISOString(),
        generatedBy: session.user.name ?? undefined,
      },
      translate,
    );

    const pdf = await renderToBuffer(
      FahrtenbuchPdf({
        model,
        pageLabel: (page, total) => t('export.page', { page, total }),
      }),
    );

    return {
      success: true,
      fileName: exportFileName(from, to, groupName),
      pdfBase64: Buffer.from(pdf).toString('base64'),
      entryCount: model.sections.reduce((sum, s) => sum + s.rows.length, 0),
    };
  } catch (err) {
    console.error(`fahrtenbuch export failed`, err);
    return { success: false, error: actionErrorKey(err) };
  }
}
