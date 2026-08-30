import { Document, Image, Page, Path, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import moment from 'moment';
import {
  zahlungszielDatum,
  istEinTag,
  zeitraumText,
  type AtemschutzRechnung,
  type AtemschutzRechnungConfig,
} from '../../common/atemschutzRechnung';
import { epcQrCode } from '../../common/epcQr';
import {
  absenderNameOf,
  type GroupStammdaten,
  type PdfLogo,
} from '../../common/groupStammdaten';
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
    flexDirection: 'row',
  },
  zahlungDaten: { flexGrow: 1 },
  qr: { alignItems: 'center', width: 96 },
  qrText: { fontSize: 7, color: '#666', marginBottom: 3 },
  zahlungTitel: { fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  zahlungZeile: { flexDirection: 'row', marginBottom: 2 },
  zahlungLabel: { width: 110, color: '#444' },
  fuss: { marginTop: 20, fontSize: 9, color: '#444' },
  rechtsgrundlage: { marginTop: 10, fontSize: 8, color: '#666' },
  fussblock: {
    marginTop: 16,
    paddingTop: 6,
    borderTop: 0.5,
    borderTopColor: '#ccc',
  },
  fusszeile: { fontSize: 8, color: '#666' },
});

export interface FuellungRechnungPdfProps {
  rechnung: AtemschutzRechnung;
  /** Name aus dem Gruppendokument — Rückfall, wenn kein Absender gepflegt ist. */
  feuerwehrName: string;
  /** Textvorlagen, Zahlungsziel und Leistungstext der Gruppe. */
  config: AtemschutzRechnungConfig;
  /** Absender und Bankverbindung der Gruppe. */
  stammdaten: GroupStammdaten;
  /** Logo der Gruppe; `undefined` lässt den Kopf ohne Bild. */
  logo?: PdfLogo;
}

export default function FuellungRechnungPdf({
  rechnung,
  feuerwehrName,
  config,
  stammdaten,
  logo,
}: FuellungRechnungPdfProps) {
  const absender = absenderNameOf(stammdaten, feuerwehrName);
  const kontoinhaber = stammdaten.kontoinhaber.trim() || absender;
  const faellig = zahlungszielDatum(rechnung.datum, config.zahlungszielTage);
  // Bleibt stehen, obwohl das Erstellen ohne Bankdaten blockiert: Eine
  // bereits gestellte Rechnung muss auch dann noch druckbar sein, wenn
  // jemand die Stammdaten später leert.
  const hatBankdaten = !!stammdaten.iban.trim();
  const qr = epcQrCode({
    kontoinhaber,
    iban: stammdaten.iban,
    bic: stammdaten.bic,
    betrag: rechnung.summe,
    verwendungszweck: rechnung.nummer,
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image doesn't support alt */}
          {logo && <Image style={styles.logo} src={logo} />}
          <View>
            <Text style={styles.title}>Rechnung {rechnung.nummer}</Text>
            <Text style={styles.absender}>{absender}</Text>
            {!!stammdaten.absenderAdresse && (
              <Text style={styles.absender}>{stammdaten.absenderAdresse}</Text>
            )}
            {!!stammdaten.absenderKontakt && (
              <Text style={styles.absender}>{stammdaten.absenderKontakt}</Text>
            )}
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.empfaengerName}>{rechnung.empfaenger.name}</Text>
          {!!rechnung.empfaenger.ansprechpartner && (
            <Text>{rechnung.empfaenger.ansprechpartner}</Text>
          )}
          <Text>{rechnung.empfaenger.adresse}</Text>
          {/* E-Mail und Telefon stehen mit auf der Rechnung: Bei einer
              späteren Kontrolle steht damit alles auf dem Beleg, ohne dass
              jemand das Adressbuch danebenlegen muss. */}
          {!!rechnung.empfaenger.email && <Text>{rechnung.empfaenger.email}</Text>}
          {!!rechnung.empfaenger.telefon && <Text>{rechnung.empfaenger.telefon}</Text>}
        </View>

        <View style={[styles.block, styles.meta]}>
          <Text>Rechnungsdatum: {formatDate(rechnung.datum)}</Text>
          <Text>
            {istEinTag(rechnung.zeitraumVon, rechnung.zeitraumBis, formatDate)
              ? 'Leistungsdatum'
              : 'Leistungszeitraum'}
            : {zeitraumText(rechnung.zeitraumVon, rechnung.zeitraumBis, formatDate)}
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
            <View style={styles.zahlungDaten}>
              <Text style={styles.zahlungTitel}>{faelligText(faellig)}</Text>
              <View style={styles.zahlungZeile}>
                <Text style={styles.zahlungLabel}>Empfänger</Text>
                <Text>{kontoinhaber}</Text>
              </View>
              <View style={styles.zahlungZeile}>
                <Text style={styles.zahlungLabel}>IBAN</Text>
                <Text>{stammdaten.iban}</Text>
              </View>
              {!!stammdaten.bic.trim() && (
                <View style={styles.zahlungZeile}>
                  <Text style={styles.zahlungLabel}>BIC</Text>
                  <Text>{stammdaten.bic}</Text>
                </View>
              )}
              <View style={styles.zahlungZeile}>
                <Text style={styles.zahlungLabel}>Verwendungszweck</Text>
                <Text>{rechnung.nummer}</Text>
              </View>
            </View>
            {/* Der Code steht nur da, wenn der Datensatz trägt — ein
                QR-Code, der zu einer unvollständigen Überweisung führt, sähe
                aus, als könnte man ihm vertrauen. */}
            {qr && (
              <View style={styles.qr}>
                <Text style={styles.qrText}>Bezahlen mit Code</Text>
                <Svg viewBox={`0 0 ${qr.size} ${qr.size}`} style={{ width: 80, height: 80 }}>
                  <Path d={qr.path} fill="#000000" />
                </Svg>
              </View>
            )}
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

        {/* Ein Feld pro Zeile statt einer mit Trennpunkten verketteten:
            Anschrift und Kontakt sind eigene Angaben und in einer Zeile
            kaum zu lesen. */}
        <View style={styles.fussblock}>
          <Text style={styles.fusszeile}>{absender}</Text>
          {!!stammdaten.absenderAdresse && (
            <Text style={styles.fusszeile}>{stammdaten.absenderAdresse}</Text>
          )}
          {!!stammdaten.absenderKontakt && (
            <Text style={styles.fusszeile}>{stammdaten.absenderKontakt}</Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
