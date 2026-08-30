import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import moment from 'moment';
import {
  zahlungszielDatum,
  type AtemschutzRechnung,
  type AtemschutzRechnungConfig,
} from '../../common/atemschutzRechnung';
import { formatCurrency } from '../../common/kostenersatz';

function formatDate(iso?: string): string {
  if (!iso) return '';
  const m = moment(iso);
  return m.isValid() ? m.format('DD.MM.YYYY') : iso;
}

/**
 * Überschrift des Zahlungsblocks. Ohne gepflegtes Zahlungsziel bleibt es bei
 * der Aufforderung — ein erfundenes Datum wäre schlimmer als keines.
 */
function faelligText(faellig?: string): string {
  return faellig
    ? `Zahlbar bis ${formatDate(faellig)} auf folgendes Konto:`
    : 'Bitte überweisen Sie den Betrag auf folgendes Konto:';
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottom: 1,
    borderBottomColor: '#333',
    paddingBottom: 10,
    marginBottom: 20,
  },
  logo: { width: 180, marginRight: 15 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  block: { marginBottom: 16 },
  empfaengerName: { fontFamily: 'Helvetica-Bold' },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  tableHead: {
    flexDirection: 'row',
    borderBottom: 1,
    borderBottomColor: '#333',
    paddingBottom: 4,
    marginBottom: 4,
    fontFamily: 'Helvetica-Bold',
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottom: 0.5,
    borderBottomColor: '#ccc',
  },
  colDatum: { width: '16%' },
  colFlasche: { width: '20%' },
  colEinsatz: { width: '26%' },
  colAnzahl: { width: '10%', textAlign: 'right' },
  colPreis: { width: '14%', textAlign: 'right' },
  colSumme: { width: '14%', textAlign: 'right' },
  summe: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 6,
    borderTop: 1,
    borderTopColor: '#333',
  },
  summeLabel: { fontFamily: 'Helvetica-Bold', marginRight: 12 },
  summeWert: { fontFamily: 'Helvetica-Bold' },
  absender: { fontSize: 9, color: '#444', marginBottom: 2 },
  leistung: { marginBottom: 14 },
  zahlung: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#f4f4f4',
  },
  zahlungTitel: { fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  zahlungZeile: { flexDirection: 'row', marginBottom: 2 },
  zahlungLabel: { width: 110, color: '#444' },
  fuss: { marginTop: 20, fontSize: 9, color: '#444' },
  rechtsgrundlage: { marginTop: 10, fontSize: 8, color: '#666' },
  fusszeile: {
    marginTop: 16,
    paddingTop: 6,
    borderTop: 0.5,
    borderTopColor: '#ccc',
    fontSize: 8,
    color: '#666',
  },
});

export interface FuellungRechnungPdfProps {
  rechnung: AtemschutzRechnung;
  /** Name aus dem Gruppendokument — Rückfall, wenn kein Absender gepflegt ist. */
  feuerwehrName: string;
  /** Absender, Zahlungsdaten und Leistungstext der Gruppe. */
  config: AtemschutzRechnungConfig;
  /** Absoluter Pfad zum Logo; `undefined` lässt den Kopf ohne Bild. */
  logoPath?: string;
}

export default function FuellungRechnungPdf({
  rechnung,
  feuerwehrName,
  config,
  logoPath,
}: FuellungRechnungPdfProps) {
  const absender = config.absenderName.trim() || feuerwehrName;
  const kontoinhaber = config.kontoinhaber.trim() || absender;
  const faellig = zahlungszielDatum(rechnung.datum, config.zahlungszielTage);
  const hatBankdaten = !!config.iban.trim();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image doesn't support alt */}
          {logoPath && <Image style={styles.logo} src={logoPath} />}
          <View>
            <Text style={styles.title}>Rechnung {rechnung.nummer}</Text>
            <Text style={styles.absender}>{absender}</Text>
            {!!config.absenderAdresse && (
              <Text style={styles.absender}>{config.absenderAdresse}</Text>
            )}
            {!!config.absenderKontakt && (
              <Text style={styles.absender}>{config.absenderKontakt}</Text>
            )}
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.empfaengerName}>{rechnung.empfaenger.name}</Text>
          {!!rechnung.empfaenger.ansprechpartner && (
            <Text>{rechnung.empfaenger.ansprechpartner}</Text>
          )}
          <Text>{rechnung.empfaenger.adresse}</Text>
        </View>

        <View style={[styles.block, styles.meta]}>
          <Text>Rechnungsdatum: {formatDate(rechnung.datum)}</Text>
          <Text>
            Zeitraum: {formatDate(rechnung.zeitraumVon)} – {formatDate(rechnung.zeitraumBis)}
          </Text>
        </View>

        {!!config.leistungstext && (
          <View style={styles.leistung}>
            <Text>{config.leistungstext}</Text>
          </View>
        )}

        <View style={styles.tableHead}>
          <Text style={styles.colDatum}>Datum</Text>
          <Text style={styles.colFlasche}>Flasche</Text>
          <Text style={styles.colEinsatz}>Einsatz</Text>
          <Text style={styles.colAnzahl}>Anzahl</Text>
          <Text style={styles.colPreis}>Einzelpreis</Text>
          <Text style={styles.colSumme}>Summe</Text>
        </View>

        {rechnung.positionen.map((position) => (
          <View style={styles.row} key={position.fuellungId} wrap={false}>
            <Text style={styles.colDatum}>{formatDate(position.zeitpunkt)}</Text>
            <Text style={styles.colFlasche}>
              {position.flaschenNummer ?? '—'}
              {position.volumenLiter ? ` (${position.volumenLiter} l)` : ''}
            </Text>
            <Text style={styles.colEinsatz}>{position.firecallName ?? ''}</Text>
            <Text style={styles.colAnzahl}>{position.anzahl}</Text>
            <Text style={styles.colPreis}>{formatCurrency(position.einzelpreis)}</Text>
            <Text style={styles.colSumme}>{formatCurrency(position.summe)}</Text>
          </View>
        ))}

        <View style={styles.summe}>
          <Text style={styles.summeLabel}>Gesamtsumme</Text>
          <Text style={styles.summeWert}>{formatCurrency(rechnung.summe)}</Text>
        </View>

        {!!rechnung.bemerkung && (
          <View style={styles.fuss}>
            <Text>{rechnung.bemerkung}</Text>
          </View>
        )}

        {hatBankdaten && (
          <View style={styles.zahlung}>
            <Text style={styles.zahlungTitel}>{faelligText(faellig)}</Text>
            <View style={styles.zahlungZeile}>
              <Text style={styles.zahlungLabel}>Empfänger</Text>
              <Text>{kontoinhaber}</Text>
            </View>
            <View style={styles.zahlungZeile}>
              <Text style={styles.zahlungLabel}>IBAN</Text>
              <Text>{config.iban}</Text>
            </View>
            {!!config.bic.trim() && (
              <View style={styles.zahlungZeile}>
                <Text style={styles.zahlungLabel}>BIC</Text>
                <Text>{config.bic}</Text>
              </View>
            )}
            <View style={styles.zahlungZeile}>
              <Text style={styles.zahlungLabel}>Verwendungszweck</Text>
              <Text>{rechnung.nummer}</Text>
            </View>
          </View>
        )}

        {!!config.ustHinweis && (
          <View style={styles.fuss}>
            <Text>{config.ustHinweis}</Text>
          </View>
        )}

        <Text style={styles.rechtsgrundlage}>
          Verrechnet nach dem Tarif für das Füllen von Pressluftflaschen, Landesgesetzblatt
          Burgenland ({rechnung.rateVersion}).
        </Text>

        {!!config.absenderKontakt && (
          <Text style={styles.fusszeile}>
            {absender}
            {config.absenderAdresse ? ` · ${config.absenderAdresse}` : ''}
            {` · ${config.absenderKontakt}`}
          </Text>
        )}
      </Page>
    </Document>
  );
}
