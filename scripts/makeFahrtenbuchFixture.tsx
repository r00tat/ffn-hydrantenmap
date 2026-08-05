/**
 * Erzeugt das anonymisierte Test-PDF für den Fahrtenbuch-Import. Bildet den
 * Aufbau des echten Exports nach und enthält gezielt die schwierigen Fälle:
 * überlanger Zweck-Text, der in die KM-Spalte läuft, Fahrt über Mitternacht,
 * Zeile mit Treibstoff und AdBlue, zweite Seite mit wiederholter Kopfzeile.
 *
 * Ausführen (es gibt kein `tsx` im Projekt, `@react-pdf/renderer` ist reines
 * ESM — deshalb wie die übrigen Skripte nach `dist/` übersetzen, die Endung
 * auf `.mjs` ziehen und mit node starten):
 *
 *   npx tsc --ignoreConfig --outDir dist/fixture --jsx react-jsx \
 *     --module esnext --moduleResolution bundler --target es2022 \
 *     --skipLibCheck scripts/makeFahrtenbuchFixture.tsx
 *   mv dist/fixture/makeFahrtenbuchFixture.js dist/fixture/makeFahrtenbuchFixture.mjs
 *   node dist/fixture/makeFahrtenbuchFixture.mjs
 */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToFile,
} from '@react-pdf/renderer';
import { createElement } from 'react';

interface Column {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'right';
  /** Abstand nach rechts, sonst 4. */
  padRight?: number;
}

const COLUMNS: Column[] = [
  { key: 'datum', label: 'Datum', width: 58 },
  { key: 'zeit', label: 'Zeit', width: 66 },
  { key: 'fahrer', label: 'Fahrer', width: 90 },
  { key: 'grund', label: 'Grund', width: 56 },
  // Auf den überlangen Zweck-Text abgestimmt: Er endet unmittelbar links vom
  // rechtsbündigen Start-KM-Wert und verklebt dort mit ihm, wie im echten
  // Export. Wird der Text geändert, ist diese Breite nachzuziehen.
  { key: 'zweck', label: 'Zweck/Strecke', width: 175 },
  { key: 'startKm', label: 'Start KM', width: 46, align: 'right' },
  { key: 'endeKm', label: 'Ende KM', width: 46, align: 'right' },
  { key: 'gefKm', label: 'Gef. KM', width: 38, align: 'right' },
  {
    key: 'treibstoff',
    label: 'Treibstoff',
    width: 42,
    align: 'right',
  },
  // Deutlicher Abstand nach rechts: Stünde der rechtsbündige AdBlue-Wert
  // unmittelbar vor der Notiz, fasste pdfjs beide zu einem Textstück zusammen
  // — ein Sonderfall, den es hier nicht zu prüfen gilt.
  {
    key: 'adBlue',
    label: 'AdBlue',
    width: 38,
    align: 'right',
    padRight: 18,
  },
  // Breit genug für die längste Notiz: Ein Umbruch hier wäre ein zweiter,
  // ungewollter Sonderfall.
  { key: 'notizen', label: 'Notizen', width: 100 },
];

const PAGE_ONE = [
  [
    '04.06.2025',
    '17:40 - 18:00',
    'Anna Muster',
    'Sonstiges',
    'Besorgung ND - Winden',
    '14,646',
    '14,664',
    '18',
    '-',
    '-',
    '',
  ],
  [
    '08.06.2025',
    '08:45 - 10:00',
    'Bea Beispiel',
    'Einsatz',
    'N/S Ölspur',
    '14,664',
    '14,672',
    '8',
    '-',
    '-',
    '',
  ],
  [
    '16.07.2025',
    '08:15 - 14:30',
    'Cem Baumann',
    'Werkstatt',
    'Service',
    '14,778',
    '14,791',
    '13',
    '-',
    '-',
    '',
  ],
  [
    '21.06.2025',
    '19:00 - 20:50',
    'Dora Fischer',
    'Übung',
    'Übung BE SER',
    '14,791',
    '14,794',
    '3',
    '-',
    '-',
    '',
  ],
  // Überlanger Text: läuft über die Zellgrenze in die Start-KM-Spalte.
  [
    '11.09.2025',
    '16:45 - 17:19',
    'Emil Gruber',
    'Einsatz',
    'Eigener Einsatzbereich - T1 Verkehrswege freimachen',
    '15,134',
    '15,142',
    '8',
    '-',
    '-',
    '',
  ],
  // Über Mitternacht.
  [
    '02.01.2026',
    '23:55 - 00:29',
    'Bea Beispiel',
    'Einsatz',
    'Katze am Baum',
    '16,341',
    '16,343',
    '2',
    '-',
    '-',
    '',
  ],
];

const PAGE_TWO = [
  [
    '14.03.2026',
    '10:00 - 12:00',
    'Anna Muster',
    'Sonstiges',
    'Signal 112',
    '16,490',
    '16,753',
    '263',
    '39,40',
    '8,70',
    'Nachtanken',
  ],
  [
    '26.08.2026',
    '08:30 - 09:46',
    'Cem Baumann',
    'Probefahrt',
    'ND/Nickelsdorf',
    '16,902',
    '17,095',
    '193',
    '48,00',
    '-',
    '',
  ],
  [
    '01.08.2026',
    '12:00 - 12:20',
    'Dora Fischer',
    'Einsatz',
    'G1 Gartenweg',
    '17,550',
    '17,552',
    '2',
    '-',
    '-',
    '2. Fahrer: Emil Gruber',
  ],
];

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingHorizontal: 24, fontSize: 8 },
  title: { fontSize: 14, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 9, textAlign: 'center', marginBottom: 14 },
  row: { flexDirection: 'row', marginBottom: 6 },
  header: { flexDirection: 'row', marginBottom: 8, fontSize: 8 },
  cell: { paddingRight: 4 },
});

const ZWECK_INDEX = COLUMNS.findIndex((c) => c.key === 'zweck');
const START_KM_INDEX = ZWECK_INDEX + 1;
/** Zweck und Start KM zusammen — die Breite bleibt die der beiden Spalten. */
const PAIR_WIDTH = COLUMNS[ZWECK_INDEX].width + COLUMNS[START_KM_INDEX].width;

/** Zweck-Texte ab dieser Länge sind breiter als ihre Spalte. */
function overflows(row: string[]): boolean {
  return row[ZWECK_INDEX].length > 30;
}

function Cell({ column, value }: { column: Column; value: string }) {
  return (
    <Text
      style={[
        styles.cell,
        {
          width: column.width,
          textAlign: column.align ?? 'left',
          paddingRight: column.padRight ?? 4,
        },
      ]}
    >
      {value}
    </Text>
  );
}

/**
 * Zweck und Start KM einer überlaufenden Zeile. Beide stehen ohne eigene
 * Spaltenbreite in einem gemeinsamen Kasten: Der Text wird dadurch nicht auf
 * die Zellbreite umbrochen, sondern läuft über die Zellgrenze hinaus, und der
 * Zahlenwert bleibt an der rechten Kante seiner Spalte. So entsteht genau der
 * Fall des echten Exports — Text und Zahl stehen ohne Zwischenraum
 * nebeneinander und kommen aus pdfjs als **ein** Textstück heraus.
 */
function OverflowingPair({ row }: { row: string[] }) {
  return (
    <View style={{ flexDirection: 'row', width: PAIR_WIDTH }}>
      <Text style={{ flexShrink: 0 }}>{row[ZWECK_INDEX]}</Text>
      <Text
        style={{
          flexShrink: 0,
          marginLeft: 'auto',
          paddingRight: COLUMNS[START_KM_INDEX].padRight ?? 4,
        }}
      >
        {row[START_KM_INDEX]}
      </Text>
    </View>
  );
}

function Table({ rows }: { rows: string[][] }) {
  return (
    <>
      <View style={styles.header}>
        {COLUMNS.map((c) => (
          <Text
            key={c.key}
            style={[styles.cell, { width: c.width, textAlign: 'center' }]}
          >
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {COLUMNS.map((c, j) => {
            if (overflows(row) && j === ZWECK_INDEX)
              return <OverflowingPair key={c.key} row={row} />;
            if (overflows(row) && j === START_KM_INDEX) return null;
            return <Cell key={c.key} column={c} value={row[j]} />;
          })}
        </View>
      ))}
    </>
  );
}

function Fixture() {
  return (
    <Document>
      {[PAGE_ONE, PAGE_TWO].map((rows, index) => (
        <Page key={index} size="A4" orientation="landscape" style={styles.page}>
          <Text style={styles.title}>Fahrtenbuch: MTF (FW-999XX)</Text>
          <Text style={styles.subtitle}>Zeitraum: 01.01.2022 - 04.08.2026</Text>
          <Table rows={rows} />
        </Page>
      ))}
    </Document>
  );
}

await renderToFile(
  createElement(Fixture),
  'src/components/Fahrtenbuch/fahrtenbuchPdfImport.fixture.pdf',
);
