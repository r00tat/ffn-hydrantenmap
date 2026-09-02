/**
 * Das Austauschformat des Füllprotokolls — Export und Import lesen dieselbe
 * Tabelle.
 *
 * Ein einziges Format für beide Richtungen, weil es für den Import keine
 * fremde Quelle gibt: Nachgetragen werden Altbestände aus Excel-Listen, die
 * jede Wehr anders geführt hat. Statt ein fremdes Layout zu erraten, gibt der
 * Export die Vorlage vor — wer nachträgt, exportiert einmal, füllt die Zeilen
 * auf und spielt die Datei zurück.
 *
 * **Ortszeit, nicht UTC.** Datum und Uhrzeit stehen so in der Datei, wie sie in
 * der Liste stehen, und werden beim Einlesen wieder als Ortszeit gelesen.
 * Deshalb laufen Formatierung *und* Auswertung im Browser: Auf dem Server
 * (Cloud Run läuft in UTC) verschöbe sich jede eingelesene Uhrzeit um den
 * Zonenversatz. Der Server bekommt nur noch fertige Zeitpunkte.
 *
 * Kein CSV-Paket: Gelesen wird ein Format, das dieselbe Anwendung erzeugt hat;
 * die paar Zeilen Parser sind billiger als eine Abhängigkeit im Client-Bundle
 * — dieselbe Abwägung wie beim XLSX-Leser in `xlsx.ts`.
 */

import {
  FUELLUNG_ZWECKE,
  MAX_FUELLUNG_ANZAHL,
  normalizeCode,
  SICHTKONTROLLE_WERTE,
  zweckOf,
  type AtemschutzFuellung,
  type FuellungZweck,
  type Sichtkontrolle,
} from './atemschutz';

/**
 * Die Kopfzeile. Deutsch und nicht als Schlüssel: Die Datei wird in einer
 * Tabellenkalkulation geöffnet und von Hand ergänzt — dort ist „Enddruck"
 * lesbar und `enddruck` nicht.
 */
export const FUELLPROTOKOLL_CSV_SPALTEN = [
  'Datum',
  'Uhrzeit',
  'Flasche',
  'Feuerwehr',
  'Anzahl',
  'Startdruck',
  'Enddruck',
  'Gefüllt von',
  'Füllstation',
  'Einsatz',
  'Zweck',
  'Verrechnen',
  'Sichtkontrolle',
  'Bemerkung',
] as const;

/** Ohne diese drei ist eine Zeile keine Füllung. */
const PFLICHTSPALTEN = ['Datum', 'Enddruck', 'Gefüllt von'];

const ZWECK_LABEL: Record<FuellungZweck, string> = {
  einsatz: 'Einsatz',
  uebung: 'Übung',
  sonstiges: 'Sonstiges',
};

const SICHTKONTROLLE_LABEL: Record<Sichtkontrolle, string> = {
  offen: 'offen',
  ok: 'in Ordnung',
  mangel: 'Mangel',
};

function zweiStellig(value: number): string {
  return String(value).padStart(2, '0');
}

/** `2026-09-02T14:35:00Z` → `02.09.2026` in der Zone des Browsers. */
export function csvDatum(zeitpunkt: string): string {
  const d = new Date(zeitpunkt);
  if (Number.isNaN(d.getTime())) return '';
  return [zweiStellig(d.getDate()), zweiStellig(d.getMonth() + 1), d.getFullYear()].join('.');
}

/** Dieselbe Zeit als `16:35`. */
export function csvUhrzeit(zeitpunkt: string): string {
  const d = new Date(zeitpunkt);
  if (Number.isNaN(d.getTime())) return '';
  return `${zweiStellig(d.getHours())}:${zweiStellig(d.getMinutes())}`;
}

export interface CsvZeileKontext {
  /**
   * Die Kennung aus den Stammdaten. Die Liste schlägt sie ebenso nach — am
   * Dokument steht nur, was beim Erfassen getippt wurde, und eine umbenannte
   * Flasche liefe damit auseinander.
   */
  kennung?: string;
}

/** Eine Füllung als Zeile der Tabelle, in der Reihenfolge der Kopfzeile. */
export function fuellungCsvZeile(f: AtemschutzFuellung, kontext: CsvZeileKontext = {}): string[] {
  return [
    csvDatum(f.zeitpunkt),
    csvUhrzeit(f.zeitpunkt),
    kontext.kennung ?? f.flaschenNummer ?? '',
    f.feuerwehr ?? '',
    String(f.anzahl ?? 1),
    f.startdruck != null ? String(f.startdruck) : '',
    String(f.enddruck ?? ''),
    f.gefuelltVon ?? '',
    f.fuellstationName ?? '',
    f.firecallName ?? '',
    ZWECK_LABEL[zweckOf(f)],
    f.verrechnen ? 'ja' : 'nein',
    f.sichtkontrolle ? SICHTKONTROLLE_LABEL[f.sichtkontrolle] : '',
    f.bemerkung ?? '',
  ];
}

/**
 * Zerlegt eine CSV-Datei in ein Raster.
 *
 * Trennzeichen wird erkannt, nicht vorgeschrieben: Eine deutschsprachige
 * Tabellenkalkulation schreibt Semikolon, ein Export aus einem anderen Werkzeug
 * Komma — dieselbe Erkennung wie beim Geräteimport.
 */
export function parseCsvRaster(text: string): string[][] {
  const ohneBom = text.replace(/^﻿/, '');
  const kopfzeile = ohneBom.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = kopfzeile.includes(';') ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let feld = '';
  let inQuotes = false;

  for (let i = 0; i < ohneBom.length; i += 1) {
    const c = ohneBom[i];
    if (inQuotes) {
      if (c === '"') {
        // Ein verdoppeltes Anführungszeichen ist ein Zeichen, kein Ende.
        if (ohneBom[i + 1] === '"') {
          feld += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        feld += c;
      }
      continue;
    }
    if (c === '"' && feld === '') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(feld);
      feld = '';
    } else if (c === '\n') {
      row.push(feld);
      rows.push(row);
      row = [];
      feld = '';
    } else if (c !== '\r') {
      feld += c;
    }
  }
  if (feld !== '' || row.length > 0) {
    row.push(feld);
    rows.push(row);
  }
  // Zeilen, in denen nur Trennzeichen stehen, sind aus der Tabellen-
  // kalkulation nachgeschleppter Rand und keine Daten.
  return rows.filter((r) => r.some((z) => z.trim() !== ''));
}

/** Die Felder, die der Import je Zeile setzen darf. */
export interface CsvFuellung {
  zeitpunkt: string;
  flaschenNummer?: string;
  feuerwehr?: string;
  anzahl: number;
  startdruck?: number;
  enddruck: number;
  gefuelltVon: string;
  fuellstationName?: string;
  firecallName?: string;
  zweck: FuellungZweck;
  verrechnen: boolean;
  sichtkontrolle?: Sichtkontrolle;
  bemerkung?: string;
}

export interface CsvZeileErgebnis {
  /** Zeilennummer in der Datei, die Kopfzeile mitgezählt. */
  zeile: number;
  fuellung?: CsvFuellung;
  /** Übersetzungsschlüssel unter `atemschutz.fuellprotokollImport.errors`. */
  fehler?: string;
}

export interface CsvImportErgebnis {
  zeilen: CsvZeileErgebnis[];
  /** Gesetzt, wenn die Datei als Ganzes nicht zu lesen ist. */
  fehler?: string;
}

function zahl(value: string): number | undefined {
  const roh = value.trim().replace(',', '.');
  if (!roh) return undefined;
  const n = Number(roh);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * `ja`, `x`, `1`, `wahr`, `true` — alles, was in einer von Hand gepflegten
 * Spalte „Verrechnen" auftaucht. Alles andere heißt nein: Ein unverstandenes
 * Wort darf keine Rechnung auslösen.
 */
function jaNein(value: string): boolean {
  return ['ja', 'j', 'x', '1', 'true', 'wahr', 'yes'].includes(value.trim().toLowerCase());
}

function zweckAus(value: string): FuellungZweck | undefined {
  const key = value.trim().toLowerCase();
  if (!key) return undefined;
  const direkt = FUELLUNG_ZWECKE.find((z) => z === key);
  if (direkt) return direkt;
  const treffer = FUELLUNG_ZWECKE.find((z) => ZWECK_LABEL[z].toLowerCase() === key);
  // „Ubung" ohne Umlaut kommt aus jeder zweiten Liste.
  if (!treffer && key.startsWith('ub')) return 'uebung';
  return treffer;
}

function sichtkontrolleAus(value: string): Sichtkontrolle | undefined {
  const key = value.trim().toLowerCase();
  if (!key) return undefined;
  const direkt = SICHTKONTROLLE_WERTE.find((s) => s === key);
  if (direkt) return direkt;
  return SICHTKONTROLLE_WERTE.find((s) => SICHTKONTROLLE_LABEL[s].toLowerCase() === key);
}

/**
 * `02.09.2026` + `16:35` als Zeitpunkt in der Zone des Browsers.
 *
 * `new Date(y, m, d, h, min)` rechnet in Ortszeit — genau das ist hier
 * gewollt. Der ISO-String, der herauskommt, ist wieder UTC und damit das, was
 * am Dokument steht.
 */
export function csvZeitpunkt(datum: string, uhrzeit: string): string | undefined {
  const teile = datum.trim().split(/[.\-/]/);
  if (teile.length !== 3) return undefined;
  // `2026-09-02` und `02.09.2026` sind beide zu erwarten: Das erste Feld ist
  // das Jahr, wenn es vierstellig ist.
  const vierstelligZuerst = teile[0].length === 4;
  const jahr = Number(vierstelligZuerst ? teile[0] : teile[2]);
  const monat = Number(teile[1]);
  const tag = Number(vierstelligZuerst ? teile[2] : teile[0]);
  if (!Number.isInteger(jahr) || !Number.isInteger(monat) || !Number.isInteger(tag)) {
    return undefined;
  }

  const [stundeRoh = '0', minuteRoh = '0'] = uhrzeit.trim().split(':');
  const stunde = Number(stundeRoh) || 0;
  const minute = Number(minuteRoh) || 0;

  const d = new Date(jahr, monat - 1, tag, stunde, minute, 0, 0);
  if (Number.isNaN(d.getTime())) return undefined;
  // `new Date(2026, 12, 40)` rollt still weiter — ein Tippfehler soll nicht
  // stillschweigend im Folgemonat landen.
  if (d.getFullYear() !== jahr || d.getMonth() !== monat - 1 || d.getDate() !== tag) {
    return undefined;
  }
  return d.toISOString();
}

/**
 * Liest die Datei. Jede Zeile kommt einzeln zurück — mit Füllung *oder* mit
 * Fehler: Eine kaputte Zeile darf den Import der übrigen nicht verhindern,
 * muss aber sichtbar bleiben.
 */
export function parseFuellprotokollCsv(text: string): CsvImportErgebnis {
  const raster = parseCsvRaster(text);
  if (raster.length === 0) return { zeilen: [], fehler: 'fileEmpty' };

  const kopf = raster[0].map((h) => h.trim());
  const index = (name: string) => kopf.findIndex((h) => h === name);
  const fehlend = PFLICHTSPALTEN.filter((name) => index(name) < 0);
  if (fehlend.length > 0) return { zeilen: [], fehler: 'columnsMissing' };

  const spalte = new Map<string, number>(
    FUELLPROTOKOLL_CSV_SPALTEN.map((name) => [name, index(name)]),
  );
  const wert = (row: string[], name: string): string => {
    const i = spalte.get(name) ?? -1;
    return i >= 0 ? (row[i] ?? '').trim() : '';
  };

  const zeilen: CsvZeileErgebnis[] = raster.slice(1).map((row, i) => {
    const nummer = i + 2;
    const zeitpunkt = csvZeitpunkt(wert(row, 'Datum'), wert(row, 'Uhrzeit'));
    if (!zeitpunkt) return { zeile: nummer, fehler: 'dateInvalid' };

    const enddruck = zahl(wert(row, 'Enddruck'));
    if (enddruck === undefined || enddruck <= 0) {
      return { zeile: nummer, fehler: 'enddruckInvalid' };
    }

    const gefuelltVon = wert(row, 'Gefüllt von');
    if (!gefuelltVon) return { zeile: nummer, fehler: 'gefuelltVonMissing' };

    const flaschenNummer = wert(row, 'Flasche');
    const feuerwehr = wert(row, 'Feuerwehr');
    if (!flaschenNummer && !feuerwehr) {
      return { zeile: nummer, fehler: 'identifierMissing' };
    }

    // Eine Zeile mit Flaschennummer ist genau eine Flasche — dieselbe Regel
    // wie im Dialog. Ohne Nummer zählt die Spalte „Anzahl".
    const anzahlRoh = zahl(wert(row, 'Anzahl')) ?? 1;
    const anzahl = flaschenNummer ? 1 : Math.trunc(anzahlRoh);
    if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > MAX_FUELLUNG_ANZAHL) {
      return { zeile: nummer, fehler: 'anzahlInvalid' };
    }

    const startdruck = zahl(wert(row, 'Startdruck'));
    if (startdruck !== undefined && startdruck > enddruck) {
      return { zeile: nummer, fehler: 'startdruckAboveEnddruck' };
    }

    const firecallName = wert(row, 'Einsatz');
    const sichtkontrolle = sichtkontrolleAus(wert(row, 'Sichtkontrolle'));
    const fuellung: CsvFuellung = {
      zeitpunkt,
      ...(flaschenNummer ? { flaschenNummer } : {}),
      ...(feuerwehr ? { feuerwehr } : {}),
      anzahl,
      ...(startdruck !== undefined ? { startdruck } : {}),
      enddruck,
      gefuelltVon,
      ...(wert(row, 'Füllstation') ? { fuellstationName: wert(row, 'Füllstation') } : {}),
      ...(firecallName ? { firecallName } : {}),
      zweck: zweckAus(wert(row, 'Zweck')) ?? (firecallName ? 'einsatz' : 'sonstiges'),
      verrechnen: jaNein(wert(row, 'Verrechnen')),
      ...(sichtkontrolle ? { sichtkontrolle } : {}),
      ...(wert(row, 'Bemerkung') ? { bemerkung: wert(row, 'Bemerkung') } : {}),
    };
    return { zeile: nummer, fuellung };
  });

  return { zeilen };
}

/**
 * Der Schlüssel, an dem eine Dublette erkannt wird: dieselbe Flasche derselben
 * Wehr in derselben Minute.
 *
 * Die Minute und nicht die Sekunde, weil die Datei nur Minuten trägt — ein
 * Reimport derselben Datei fände sonst nie eine Dublette. Und über
 * `normalizeCode`, damit `2.16.19` und `2-16-19` dieselbe Flasche sind.
 *
 * Bewusst *ohne* Enddruck und Anzahl: Wer eine Zeile korrigiert und die Datei
 * erneut einspielt, will keine zweite Zeile daneben.
 */
export function fuellungDublettenSchluessel(f: {
  flaschenNummer?: string;
  feuerwehr?: string;
  zeitpunkt: string;
}): string {
  const minute = new Date(f.zeitpunkt);
  return [
    normalizeCode(f.flaschenNummer ?? ''),
    normalizeCode(f.feuerwehr ?? ''),
    Number.isNaN(minute.getTime()) ? f.zeitpunkt : minute.toISOString().slice(0, 16),
  ].join('|');
}

/** Eine Zeile für den CSV-Text: Anführungszeichen nur, wo sie nötig sind. */
function csvFeld(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Der fertige Dateiinhalt.
 *
 * Semikolon als Trennzeichen und ein BOM davor: Ohne beides öffnet Excel im
 * deutschsprachigen Raum die Datei in einer einzigen Spalte und zerlegt jeden
 * Umlaut.
 */
export function buildFuellprotokollCsv(zeilen: string[][]): string {
  return (
    '﻿' +
    [FUELLPROTOKOLL_CSV_SPALTEN as readonly string[], ...zeilen]
      .map((row) => row.map(csvFeld).join(';'))
      .join('\r\n')
  );
}
