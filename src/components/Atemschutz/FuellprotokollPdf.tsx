import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { FuellprotokollColumn, FuellprotokollExportModel } from './fuellprotokollExportModel';

/**
 * Der Ausdruck des Füllprotokolls: A4 quer, eine Tabelle, aufsteigend nach
 * Zeitpunkt. Gebaut wie `FahrtenbuchPdf` — dieselbe Tabellenform, damit ein
 * Prüfer, der beide Blätter kennt, nicht umlernt.
 *
 * Enthält bewusst keine eigenen Texte: Jede Beschriftung steht im Modell, das
 * sie in der Sprache des Benutzers erzeugt.
 *
 * Rendert **ein Teildokument**; warum in Teile zerlegt wird und wo die
 * Seitenzahl herkommt, steht in `renderFuellprotokollPdf.ts`.
 */

/** Maße des Fußes — die Seitenzahl wird nachträglich daneben gestempelt. */
export const FOOTER_FONT_SIZE = 7;
export const FOOTER_MARGIN = 24;
export const FOOTER_OFFSET = 20;
/** Grauwert des Fußes (#666) als Anteil, für `pdf-lib`s `rgb()`. */
export const FOOTER_COLOR = 0x66 / 0xff;

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 40,
    paddingHorizontal: 24,
    fontSize: 8,
    fontFamily: 'Helvetica',
  },
  header: { marginBottom: 10 },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  period: { fontSize: 9, color: '#444', textAlign: 'center', marginTop: 4 },
  filter: { fontSize: 8, color: '#666', textAlign: 'center', marginTop: 2 },
  table: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    borderLeftWidth: 1,
    borderLeftColor: '#333',
  },
  headerRow: { flexDirection: 'row', backgroundColor: '#f0f0f0' },
  row: { flexDirection: 'row' },
  // Ein Mangel ist sicherheitsrelevant und muss auf dem Blatt auffallen.
  mangelRow: { flexDirection: 'row', backgroundColor: '#fdf3e3' },
  cell: {
    borderRightWidth: 1,
    borderRightColor: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingVertical: 3,
    paddingHorizontal: 3,
  },
  headerCell: { fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  empty: { marginTop: 8, fontSize: 9, color: '#666' },
  summary: { marginTop: 8, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  footer: {
    position: 'absolute',
    bottom: FOOTER_OFFSET,
    left: FOOTER_MARGIN,
    right: FOOTER_MARGIN,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: FOOTER_FONT_SIZE,
    color: '#666',
  },
});

function cellStyle(column: FuellprotokollColumn) {
  return [
    styles.cell,
    {
      flexGrow: column.width,
      flexShrink: 1,
      flexBasis: 0,
      textAlign: column.align ?? ('left' as const),
    },
  ];
}

export interface FuellprotokollPdfProps {
  model: FuellprotokollExportModel;
}

export default function FuellprotokollPdf({ model }: FuellprotokollPdfProps) {
  return (
    <Document title={model.title || undefined}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Nur im ersten Teildokument gesetzt — die Folgeteile tragen leere
            Kopfangaben und beginnen direkt mit der Tabelle. */}
        {!!model.title && (
          <View style={styles.header}>
            <Text style={styles.title}>{model.title}</Text>
            <Text style={styles.period}>{model.period}</Text>
            {!!model.filter && <Text style={styles.filter}>{model.filter}</Text>}
          </View>
        )}

        {model.emptyText ? (
          <Text style={styles.empty}>{model.emptyText}</Text>
        ) : (
          <View style={styles.table}>
            {/* `fixed` wiederholt die Kopfzeile auf jeder Folgeseite — ohne
                sie wären die Spalten ab Seite zwei nicht mehr zuzuordnen. */}
            <View style={styles.headerRow} fixed>
              {model.columns.map((column) => (
                <Text key={column.key} style={[...cellStyle(column), styles.headerCell]}>
                  {column.label}
                </Text>
              ))}
            </View>
            {model.rows.map((row, index) => (
              <View
                key={index}
                style={row.mangel ? styles.mangelRow : styles.row}
                // Eine Zeile darf nicht über den Seitenumbruch zerrissen werden.
                wrap={false}
              >
                {model.columns.map((column, cellIndex) => (
                  <Text key={column.key} style={cellStyle(column)}>
                    {row.cells[cellIndex] ?? ''}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}

        {!!model.summary && <Text style={styles.summary}>{model.summary}</Text>}

        {/* Rechts bleibt frei — dort steht später die Seitenzahl. */}
        <View style={styles.footer} fixed>
          <Text>{model.footer ?? ''}</Text>
        </View>
      </Page>
    </Document>
  );
}
