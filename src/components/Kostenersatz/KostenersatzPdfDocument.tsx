import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
} from '@react-pdf/renderer';
import path from 'path';
import moment from 'moment';
import {
  formatCurrency,
  formatPaymentMethod,
  KostenersatzCalculation,
  KostenersatzRate,
} from '../../common/kostenersatz';
import { timeFormats } from '../../common/time-format';

// Register fonts (using default for now)
Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'Helvetica' },
    { src: 'Helvetica-Bold', fontWeight: 'bold' },
  ],
});

// Get the logo path for server-side rendering
const logoPath = path.join(process.cwd(), 'public', 'FFND_logo.png');

// Format date as dd.mm.YYYY
function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const m = moment(dateStr, timeFormats, 'de');
  return m.isValid() ? m.format('DD.MM.YYYY') : dateStr;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'row',
    marginBottom: 20,
    borderBottom: 1,
    borderBottomColor: '#333',
    paddingBottom: 10,
    alignItems: 'center',
  },
  headerLogo: {
    width: 180,
    marginRight: 15,
    objectFit: 'contain',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    backgroundColor: '#f0f0f0',
    padding: 5,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  label: {
    width: '30%',
    color: '#666',
  },
  value: {
    width: '70%',
  },
  table: {
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e0e0e0',
    padding: 5,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 5,
    borderBottom: 1,
    borderBottomColor: '#eee',
  },
  tableRowHighlight: {
    flexDirection: 'row',
    padding: 5,
    borderBottom: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#f9f9f9',
  },
  colDescription: {
    width: '35%',
  },
  colUnit: {
    width: '12%',
    textAlign: 'center',
  },
  colPrice: {
    width: '18%',
    textAlign: 'right',
  },
  colHours: {
    width: '12%',
    textAlign: 'center',
  },
  colSum: {
    width: '23%',
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: '#333',
    color: '#fff',
    marginTop: 10,
  },
  totalLabel: {
    width: '75%',
    fontWeight: 'bold',
    fontSize: 12,
  },
  totalValue: {
    width: '25%',
    textAlign: 'right',
    fontWeight: 'bold',
    fontSize: 12,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#666',
    borderTop: 1,
    borderTopColor: '#ccc',
    paddingTop: 10,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  legalNote: {
    marginTop: 20,
    fontSize: 8,
    color: '#666',
    fontStyle: 'italic',
  },
});

export interface KostenersatzPdfDocumentProps {
  calculation: KostenersatzCalculation;
  rates: KostenersatzRate[];
  firecallName: string;
  firecallDate?: string;
  firecallDescription?: string;
}

export default function KostenersatzPdfDocument({
  calculation,
  rates,
  firecallName,
  firecallDate,
  firecallDescription,
}: KostenersatzPdfDocumentProps) {
  // Group items by category
  const itemsByCategory = new Map<number, Array<{ rate: KostenersatzRate; item: typeof calculation.items[0] }>>();

  for (const item of calculation.items) {
    const rate = rates.find((r) => r.id === item.rateId);
    if (rate && item.einheiten > 0) {
      const existing = itemsByCategory.get(rate.categoryNumber) || [];
      existing.push({ rate, item });
      itemsByCategory.set(rate.categoryNumber, existing);
    }
  }

  // Add category 12 if there are custom items but no category 12 items yet
  const hasCustomItems = calculation.customItems.length > 0;
  if (hasCustomItems && !itemsByCategory.has(12)) {
    itemsByCategory.set(12, []);
  }

  // Calculate custom items total for category 12
  const customItemsTotal = calculation.customItems.reduce((sum, i) => sum + i.sum, 0);

  // Get sorted category numbers
  const sortedCategories = Array.from(itemsByCategory.keys()).sort((a, b) => a - b);

  const displayDate = formatDate(calculation.callDateOverride || firecallDate);
  const displayDescription = calculation.callDescriptionOverride || firecallDescription || firecallName;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image doesn't support alt */}
          <Image style={styles.headerLogo} src={logoPath} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Kostenersatz-Berechnung</Text>
            <Text style={styles.subtitle}>Freiwillige Feuerwehr Neusiedl am See</Text>
          </View>
        </View>

        {/* Call Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Einsatzdaten</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Einsatz:</Text>
            <Text style={styles.value}>{firecallName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Datum:</Text>
            <Text style={styles.value}>{displayDate}</Text>
          </View>
          {displayDescription && displayDescription !== firecallName && (
            <View style={styles.row}>
              <Text style={styles.label}>Beschreibung:</Text>
              <Text style={styles.value}>{displayDescription}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Einsatzdauer:</Text>
            <Text style={styles.value}>{calculation.defaultStunden} Stunden</Text>
          </View>
          {calculation.comment && (
            <View style={styles.row}>
              <Text style={styles.label}>Kommentar:</Text>
              <Text style={styles.value}>{calculation.comment}</Text>
            </View>
          )}
        </View>

        {/* Recipient */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Empfänger</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Name:</Text>
            <Text style={styles.value}>{calculation.recipient.name}</Text>
          </View>
          {calculation.recipient.address && (
            <View style={styles.row}>
              <Text style={styles.label}>Adresse:</Text>
              <Text style={styles.value}>{calculation.recipient.address}</Text>
            </View>
          )}
          {calculation.recipient.phone && (
            <View style={styles.row}>
              <Text style={styles.label}>Telefon:</Text>
              <Text style={styles.value}>{calculation.recipient.phone}</Text>
            </View>
          )}
          {calculation.recipient.email && (
            <View style={styles.row}>
              <Text style={styles.label}>E-Mail:</Text>
              <Text style={styles.value}>{calculation.recipient.email}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Bezahlung:</Text>
            <Text style={styles.value}>{formatPaymentMethod(calculation.recipient.paymentMethod)}</Text>
          </View>
        </View>

        {/* Items by Category */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kostenaufstellung</Text>

          <View style={styles.table}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={styles.colDescription}>Position</Text>
              <Text style={styles.colUnit}>Einheiten</Text>
              <Text style={styles.colPrice}>Einzelpreis</Text>
              <Text style={styles.colHours}>Stunden</Text>
              <Text style={styles.colSum}>Summe</Text>
            </View>

            {/* Items grouped by category */}
            {sortedCategories.map((categoryNumber) => {
              const categoryItems = itemsByCategory.get(categoryNumber) || [];
              const categoryName = categoryNumber === 12
                ? 'Tarif für Verbrauchsmaterialien'
                : (categoryItems[0]?.rate.categoryName || '');
              const baseSubtotal = calculation.subtotals[String(categoryNumber)] || 0;
              // For category 12, include custom items in the subtotal
              const categorySubtotal = categoryNumber === 12
                ? baseSubtotal + customItemsTotal
                : baseSubtotal;

              // Calculate starting number for custom items in category 12
              let maxItemNumber = 0;
              if (categoryNumber === 12) {
                for (const { rate } of categoryItems) {
                  // Extract number after "12." from rate.id (e.g., "12.17" -> 17)
                  const match = rate.id.match(/^12\.(\d+)$/);
                  if (match) {
                    maxItemNumber = Math.max(maxItemNumber, parseInt(match[1], 10));
                  }
                }
              }

              return (
                <View key={categoryNumber}>
                  {/* Category Header */}
                  <View style={styles.tableRowHighlight}>
                    <Text style={{ ...styles.colDescription, fontWeight: 'bold' }}>
                      {categoryNumber}. {categoryName}
                    </Text>
                    <Text style={styles.colUnit}></Text>
                    <Text style={styles.colPrice}></Text>
                    <Text style={styles.colHours}></Text>
                    <Text style={{ ...styles.colSum, fontWeight: 'bold' }}>
                      {formatCurrency(categorySubtotal)}
                    </Text>
                  </View>

                  {/* Category Items */}
                  {categoryItems.map(({ rate, item }) => (
                    <View style={styles.tableRow} key={rate.id}>
                      <Text style={styles.colDescription}>
                        {rate.id} {rate.description}
                      </Text>
                      <Text style={styles.colUnit}>{item.einheiten}</Text>
                      <Text style={styles.colPrice}>{formatCurrency(rate.price)}</Text>
                      <Text style={styles.colHours}>{item.anzahlStunden}</Text>
                      <Text style={styles.colSum}>{formatCurrency(item.sum)}</Text>
                    </View>
                  ))}

                  {/* Custom Items (only for category 12) */}
                  {categoryNumber === 12 && calculation.customItems.map((item, index) => {
                    const customItemNumber = maxItemNumber + index + 1;
                    return (
                      <View style={styles.tableRow} key={`custom-${index}`}>
                        <Text style={styles.colDescription}>12.{customItemNumber} {item.description}</Text>
                        <Text style={styles.colUnit}>{item.quantity} {item.unit}</Text>
                        <Text style={styles.colPrice}>{formatCurrency(item.pricePerUnit)}</Text>
                        <Text style={styles.colHours}>-</Text>
                        <Text style={styles.colSum}>{formatCurrency(item.sum)}</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}

            {/* Total */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Summe lt. Tarifordnung</Text>
              <Text style={styles.totalValue}>{formatCurrency(calculation.totalSum)}</Text>
            </View>
          </View>
        </View>

        {/* Legal Note */}
        <View style={styles.legalNote}>
          <Text>Die Berechnung erfolgt laut Landesgesetzblatt Nr. 77/2023</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Stadtfeuerwehr Neusiedl/See  ·  A-7100 Neusiedl/See Satzgasse 9  ·  Tel.: +43 2167 2250</Text>
          <Text>http://www.ff-neusiedlamsee.at</Text>
        </View>
      </Page>
    </Document>
  );
}
