import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type {
  ExportColumn,
  ExportSection,
  FahrtenbuchExportModel,
} from './fahrtenbuchExportModel';

/**
 * Der PDF-Ausdruck des Fahrtenbuchs. Querformat A4 mit einer Tabelle je
 * Fahrzeug — dieselbe Aufteilung wie der Ausdruck des bisherigen digitalen
 * Fahrtenbuchs, damit ein Prüfer nicht umlernen muss.
 *
 * Jedes Fahrzeug bekommt eine eigene `Page`: So beginnt es auf einer neuen
 * Seite, und die Kopfzeile der Tabelle (`fixed`) wiederholt sich auf allen
 * Folgeseiten dieses Fahrzeugs mit **seinen** Spalten. Eine gemeinsame Seite
 * für alle Fahrzeuge könnte das nicht — die Spalten unterscheiden sich je
 * Fahrzeug (Kilometer, Betriebsstunden, Lenzpumpen).
 *
 * Enthält bewusst keine eigenen Texte: alle Beschriftungen stehen im Modell,
 * das sie in der Sprache des Benutzers erzeugt.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 40,
    paddingHorizontal: 24,
    fontSize: 7.5,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 10,
  },
  title: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  period: {
    fontSize: 9,
    color: '#444',
    textAlign: 'center',
    marginTop: 4,
  },
  table: {
    // Seitenweise Rahmen: die Zellen bringen rechts und unten ihre Linien mit,
    // oben und links schließt die Tabelle sie. Einzeln benannte Kanten, weil
    // eine Kurzform ohne eigene Farbe schwarz zeichnet.
    borderTopWidth: 1,
    borderTopColor: '#333',
    borderLeftWidth: 1,
    borderLeftColor: '#333',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
  },
  row: {
    flexDirection: 'row',
  },
  defectRow: {
    flexDirection: 'row',
    backgroundColor: '#fdf3e3',
  },
  cell: {
    borderRightWidth: 1,
    borderRightColor: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingVertical: 3,
    paddingHorizontal: 3,
  },
  headerCell: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    textAlign: 'center',
  },
  empty: {
    marginTop: 8,
    fontSize: 9,
    color: '#666',
  },
  legend: {
    marginTop: 8,
    fontSize: 7,
    color: '#666',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#666',
  },
});

function cellStyle(column: ExportColumn) {
  return [
    styles.cell,
    {
      flexGrow: column.flex,
      flexShrink: 1,
      flexBasis: 0,
      textAlign: column.align ?? ('left' as const),
    },
  ];
}

function SectionTable({ section }: { section: ExportSection }) {
  return (
    <View style={styles.table}>
      {/* `fixed` wiederholt die Kopfzeile auf jeder Folgeseite dieses
          Fahrzeugs — ohne sie wären die Spalten ab Seite zwei nicht mehr
          zuzuordnen. */}
      <View style={styles.headerRow} fixed>
        {section.columns.map((column) => (
          <Text key={column.key} style={[...cellStyle(column), styles.headerCell]}>
            {column.label}
          </Text>
        ))}
      </View>
      {section.rows.map((row, index) => (
        <View
          key={index}
          style={row.defekt ? styles.defectRow : styles.row}
          // Eine Zeile darf nicht über den Seitenumbruch zerrissen werden.
          wrap={false}
        >
          {section.columns.map((column, cellIndex) => (
            <Text key={column.key} style={cellStyle(column)}>
              {row.cells[cellIndex] ?? ''}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export interface FahrtenbuchPdfProps {
  model: FahrtenbuchExportModel;
  /** „Seite 3/7" — als Rückruf, weil react-pdf die Seitenzahl erst beim Layout kennt. */
  pageLabel: (page: number, total: number) => string;
}

export default function FahrtenbuchPdf({
  model,
  pageLabel,
}: FahrtenbuchPdfProps) {
  return (
    <Document title={model.title}>
      {model.sections.map((section) => (
        <Page
          key={section.vehicleId}
          size="A4"
          orientation="landscape"
          style={styles.page}
        >
          <View style={styles.header} fixed>
            <Text style={styles.title}>
              {model.title}: {section.heading}
            </Text>
            <Text style={styles.period}>{model.period}</Text>
          </View>

          {section.emptyText ? (
            <Text style={styles.empty}>{section.emptyText}</Text>
          ) : (
            <SectionTable section={section} />
          )}

          {section.hasEstimates && model.legend && (
            <Text style={styles.legend}>{model.legend}</Text>
          )}

          <View style={styles.footer} fixed>
            <Text>{model.footer ?? ''}</Text>
            <Text
              render={({ pageNumber, totalPages }) =>
                pageLabel(pageNumber, totalPages)
              }
            />
          </View>
        </Page>
      ))}
    </Document>
  );
}
