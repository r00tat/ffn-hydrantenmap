/**
 * Aufbereitung eines Einsatzes für die Übernahme nach Sybos.
 *
 * Die Funktionen liefern **fertigen Text** und keine Strukturen: Jedes Feld
 * der Seite wird einzeln kopiert und in Sybos eingefügt, was hier steht, landet
 * dort wörtlich. Der Text ist deshalb deutsch — Sybos ist es auch, und die
 * Werte sind Daten des Einsatzberichts, keine Bedienoberfläche.
 *
 * Siehe docs/sybos-uebertrag.md.
 */
import moment from 'moment';
import { parseTimestamp } from '../../../common/time-format';
import {
  CrewAssignment,
  Diary,
  Firecall,
  FirecallItem,
  FirecallLocation,
  GeschaeftsbuchEintrag,
  NON_DISPLAYABLE_ITEMS,
  Rohr,
} from '../../firebase/firestore';
import { calculateStrength, StrengthRow } from '../fahrzeuge-utils';

/** Datum und Uhrzeit ohne Sekunden — so, wie Sybos sie erwartet. */
export const SYBOS_TIME_FORMAT = 'DD.MM.YYYY HH:mm';

export function formatSybosTime(timestamp?: string): string {
  const m = parseTimestamp(timestamp);
  return m ? m.format(SYBOS_TIME_FORMAT) : '';
}

export function formatDauer(start?: string, end?: string): string {
  const s = parseTimestamp(start);
  const e = parseTimestamp(end);
  if (!s || !e) return '';
  const minutes = Math.round(moment.duration(e.diff(s)).asMinutes());
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  return [h > 0 ? `${h} h` : '', min > 0 ? `${min} min` : '']
    .filter(Boolean)
    .join(' ');
}

/** Zeitpunkte als sortierbare Millisekunden, ungültige fallen heraus. */
function times(values: (string | undefined)[]): number[] {
  return values
    .map((v) => parseTimestamp(v)?.valueOf())
    .filter((v): v is number => v !== undefined);
}

function isoOf(ms?: number): string | undefined {
  return ms === undefined ? undefined : moment(ms).format();
}

type Unit = FirecallItem & {
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;
};

function units(items: FirecallItem[]): Unit[] {
  return items.filter(
    (i) => i.type === 'vehicle' || i.type === 'tacticalUnit'
  ) as Unit[];
}

/**
 * Die vier Zeitpunkte des Einsatzes.
 *
 * Steht ein Zeitpunkt am Einsatz selbst, gilt er; sonst wird er aus den
 * Einsatzmitteln abgeleitet — erste Alarmierung, erstes Eintreffen, letztes
 * Abrücken. So steht auch bei einem Einsatz, an dem nur die Fahrzeuge
 * gepflegt wurden, eine Einsatzdauer da.
 */
export function einsatzZeiten(firecall: Firecall, items: FirecallItem[]) {
  const u = units(items);
  const alarmierung = times(u.map((v) => v.alarmierung));
  const eintreffen = times(u.map((v) => v.eintreffen));
  const abruecken = times(u.map((v) => v.abruecken));

  const beginn = firecall.date;
  const ende =
    firecall.abruecken ??
    isoOf(abruecken.length ? Math.max(...abruecken) : undefined);
  return {
    beginn,
    alarmierung:
      firecall.alarmierung ??
      isoOf(alarmierung.length ? Math.min(...alarmierung) : undefined),
    eintreffen:
      firecall.eintreffen ??
      isoOf(eintreffen.length ? Math.min(...eintreffen) : undefined),
    ende,
  };
}

export function formatAddress(loc: FirecallLocation): string {
  const street = [loc.street, loc.number].filter(Boolean).join(' ');
  return [street, loc.city].filter(Boolean).join(', ');
}

export type BasisKey =
  | 'name'
  | 'fw'
  | 'beginn'
  | 'alarmierung'
  | 'eintreffen'
  | 'ende'
  | 'dauer'
  | 'einsatzort'
  | 'beschreibung';

export interface BasisField {
  key: BasisKey;
  value: string;
}

export function buildBasisdaten({
  firecall,
  items,
  locations,
}: {
  firecall: Firecall;
  items: FirecallItem[];
  locations: FirecallLocation[];
}): BasisField[] {
  const zeiten = einsatzZeiten(firecall, items);
  const addresses = locations.map(formatAddress).filter(Boolean);
  const einsatzort =
    addresses.length > 0
      ? addresses.join('; ')
      : firecall.lat != null && firecall.lng != null
        ? `${firecall.lat}, ${firecall.lng}`
        : '';

  const fields: BasisField[] = [
    { key: 'name', value: firecall.name || '' },
    { key: 'fw', value: firecall.fw || '' },
    { key: 'beginn', value: formatSybosTime(zeiten.beginn) },
    { key: 'alarmierung', value: formatSybosTime(zeiten.alarmierung) },
    { key: 'eintreffen', value: formatSybosTime(zeiten.eintreffen) },
    { key: 'ende', value: formatSybosTime(zeiten.ende) },
    {
      key: 'dauer',
      value: formatDauer(zeiten.beginn ?? zeiten.alarmierung, zeiten.ende),
    },
    { key: 'einsatzort', value: einsatzort },
    { key: 'beschreibung', value: firecall.description || '' },
  ];
  return fields.filter((f) => f.value.trim() !== '');
}

function personen(n: number): string {
  return n === 1 ? '1 Person' : `${n} Personen`;
}

function kraftZeile(row: StrengthRow): string {
  const details = [
    row.mann > 0 ? personen(row.mann) : '',
    row.ats > 0 ? `${row.ats} ATS` : '',
    row.alarmierung ? `Alarmierung ${formatSybosTime(row.alarmierung)}` : '',
    row.eintreffen ? `Eintreffen ${formatSybosTime(row.eintreffen)}` : '',
    row.abruecken ? `Abrücken ${formatSybosTime(row.abruecken)}` : '',
  ].filter(Boolean);
  const name = row.fw ? `${row.name} (${row.fw})` : row.name;
  return [`${name} [${row.typ}]`, details.join(', ')]
    .filter(Boolean)
    .join(' – ');
}

export interface Kraefte {
  /** Eigene Fahrzeuge und taktische Einheiten, eine Zeile je Einsatzmittel. */
  eigene: string;
  /** Fremde Organisationen: Rettung, Polizei, Nachbarwehren. */
  fremde: string;
  summe: {
    eigeneEinheiten: number;
    eigenePersonen: number;
    fremdeEinheiten: number;
    fremdePersonen: number;
    ats: number;
  };
}

/**
 * Die eingesetzten Kräfte, getrennt nach eigenen und sonstigen.
 *
 * Gerechnet wird mit derselben Stärke wie in der Einsatzmittel-Übersicht
 * (`calculateStrength`), damit die Zahl in Sybos zur Zahl in der App passt.
 */
export function buildKraefte(
  items: FirecallItem[],
  crewAssignments: CrewAssignment[]
): Kraefte {
  const { eigene, fremde } = calculateStrength(items, crewAssignments);
  return {
    eigene: eigene.rows.map(kraftZeile).join('\n'),
    fremde: fremde.rows.map(kraftZeile).join('\n'),
    summe: {
      eigeneEinheiten: eigene.totalUnits,
      eigenePersonen: eigene.totalMann,
      fremdeEinheiten: fremde.totalUnits,
      fremdePersonen: fremde.totalMann,
      ats: eigene.totalAts + fremde.totalAts,
    },
  };
}

/** Die namentlich erfasste Mannschaft, nach Fahrzeug, ohne Fahrzeug zuletzt. */
export function buildMannschaftText(crew: CrewAssignment[]): string {
  return [...crew]
    .sort((a, b) => {
      const av = a.vehicleName || '￿';
      const bv = b.vehicleName || '￿';
      return av.localeCompare(bv, 'de') || a.name.localeCompare(b.name, 'de');
    })
    .map(
      (c) =>
        `${c.name} – ${c.funktion}${c.vehicleName ? ` (${c.vehicleName})` : ''}`
    )
    .join('\n');
}

/**
 * Das eingesetzte Material: alles auf der Karte, was kein Einsatzmittel ist,
 * gezählt nach Bezeichnung. Rohre zählen nach Art („C-Rohr"), alle anderen
 * Elemente nach Typ und Name — zwei Marker „Ölbindemittel" sind dasselbe
 * Material, ein Marker „Ölsperre" ein anderes.
 *
 * `typeLabel` liefert die Typbezeichnung eines Elements; sie kommt von außen,
 * weil sie an den Element-Klassen hängt, die React mitbringen.
 */
export function buildMaterialText(
  items: FirecallItem[],
  typeLabel: (item: FirecallItem) => string
): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (
      item.type === 'vehicle' ||
      item.type === 'tacticalUnit' ||
      NON_DISPLAYABLE_ITEMS.includes(item.type)
    ) {
      continue;
    }
    const label =
      item.type === 'rohr'
        ? `${(item as Rohr).art || ''}-Rohr`.replace(/^-/, '')
        : [typeLabel(item), item.name].filter(Boolean).join(': ');
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
    .map(([label, count]) => `${count}× ${label}`)
    .join('\n');
}

const DIARY_ART: Record<string, string> = {
  B: 'Befehl',
  F: 'Frage',
  M: 'Meldung',
};

function singleLine(text?: string): string {
  return (text || '').replace(/\s*\n\s*/g, ' ').trim();
}

/** Das Einsatztagebuch, ein Eintrag je Zeile, in der übergebenen Reihenfolge. */
export function buildTagebuchText(diaries: Diary[]): string {
  return diaries
    .map((d) => {
      const head = [
        formatSybosTime(d.datum),
        d.nummer ? `Nr. ${d.nummer}` : '',
        d.art ? DIARY_ART[d.art] : '',
        d.von ? `von ${d.von}` : '',
        d.an ? `an ${d.an}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      const body = [singleLine(d.name), singleLine(d.beschreibung)]
        .filter(Boolean)
        .join(' – ');
      const done = d.erledigt
        ? ` (erledigt ${formatSybosTime(d.erledigt) || d.erledigt})`
        : '';
      const hasMeta = d.nummer || d.art || d.von || d.an;
      return `${head}${hasMeta ? ':' : ''} ${body}${done}`.trim();
    })
    .join('\n');
}

export function buildGeschaeftsbuchText(
  entries: GeschaeftsbuchEintrag[]
): string {
  return entries
    .map((e) => {
      const head = [
        formatSybosTime(e.datum),
        e.nummer ? `Nr. ${e.nummer}` : '',
        e.ausgehend ? 'ausgehend' : 'eingehend',
        e.von ? `von ${e.von}` : '',
        e.an ? `an ${e.an}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      const body = [singleLine(e.name), singleLine(e.beschreibung)]
        .filter(Boolean)
        .join(' – ');
      const weiter = e.weiterleitung
        ? ` (weitergeleitet an ${e.weiterleitung})`
        : '';
      return `${head}: ${body}${weiter}`;
    })
    .join('\n');
}

/** Die Einsatzorte mit ihren Notizen — die Stellen, an denen gearbeitet wurde. */
export function buildNotizenText(locations: FirecallLocation[]): string {
  return locations
    .map((loc) => {
      const address = formatAddress(loc);
      const name = [loc.name, address ? `(${address})` : '']
        .filter(Boolean)
        .join(' ');
      const notes = [singleLine(loc.description), singleLine(loc.info)]
        .filter(Boolean)
        .join(' – ');
      return notes ? `${name}: ${notes}` : name;
    })
    .filter(Boolean)
    .join('\n');
}

export interface ContextSection {
  title: string;
  text: string;
}

/** Der Einsatz als Text für das Modell, leere Abschnitte fallen heraus. */
export function buildAiContext(sections: ContextSection[]): string {
  return sections
    .filter((s) => s.text.trim() !== '')
    .map((s) => `## ${s.title}\n${s.text.trim()}`)
    .join('\n\n');
}

export interface SybosSummary {
  einsatzablauf: string;
  taetigkeit: string;
}

/**
 * Die Antwort des Modells lesen. Angefordert ist reines JSON; ein Codeblock
 * drumherum wird trotzdem verkraftet, weil das Modell ihn gelegentlich setzt.
 */
export function parseSybosSummary(raw: string): SybosSummary {
  const json = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const parsed = JSON.parse(json) as Partial<SybosSummary>;
  if (
    typeof parsed?.einsatzablauf !== 'string' ||
    typeof parsed?.taetigkeit !== 'string'
  ) {
    throw new Error('Antwort ohne einsatzablauf/taetigkeit');
  }
  return {
    einsatzablauf: parsed.einsatzablauf.trim(),
    taetigkeit: parsed.taetigkeit.trim(),
  };
}
