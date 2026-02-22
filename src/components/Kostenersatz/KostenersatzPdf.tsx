import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer';
import moment from 'moment';
import {
  formatCurrency,
  formatPaymentMethod,
  KostenersatzCalculation,
  KostenersatzRate,
} from '../../common/kostenersatz';
import { timeFormats } from '../../common/time-format';
import { Firecall } from '../firebase/firestore';

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
    borderBottom: 1,
    borderBottomColor: '#eee',
    paddingVertical: 4,
  },
  col1: {
    flex: 3,
  },
  col2: {
    flex: 1,
    textAlign: 'center',
  },
  col3: {
    flex: 1.2,
    textAlign: 'right',
  },
  col4: {
    flex: 1,
    textAlign: 'center',
  },
  col5: {
    flex: 1.2,
    textAlign: 'right',
  },
  headerRow: {
    flexDirection: 'row',
    borderBottom: 2,
    borderBottomColor: '#333',
    paddingVertical: 4,
    fontWeight: 'bold',
    backgroundColor: '#f5f5f5',
  },
  totalRow: {
    flexDirection: 'row',
    borderTop: 2,
    borderTopColor: '#333',
    paddingVertical: 8,
    marginTop: 10,
  },
  totalLabel: {
    flex: 6.2,
    fontSize: 14,
    fontWeight: 'bold',
  },
  totalValue: {
    flex: 1.2,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  infoRow: {
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
  footerText: {
    marginBottom: 3,
  },
  categorySubtotal: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
    paddingVertical: 4,
    fontWeight: 'bold',
  },
});

export interface KostenersatzPdfProps {
  calculation: KostenersatzCalculation;
  firecall: Firecall;
  rates: KostenersatzRate[];
  /** Logo path - defaults to '/FFND_logo.png' for client, pass absolute path for server */
  logoPath?: string;
}

export default function KostenersatzPdf({
  calculation,
  firecall,
  rates,
  logoPath = '/FFND_logo.png',
}: KostenersatzPdfProps) {
  // Group items by category
  const itemsByCategory = new Map<
    number,
    Array<{ item: (typeof calculation.items)[0]; rate: KostenersatzRate }>
  >();

  for (const item of calculation.items) {
    const rate = rates.find((r) => r.id === item.rateId);
    if (rate && item.einheiten > 0) {
      const existing = itemsByCategory.get(rate.categoryNumber) || [];
      existing.push({ item, rate });
      itemsByCategory.set(rate.categoryNumber, existing);
    }
  }

  // Add category 12 if there are custom items but no category 12 items yet
  const hasCustomItems = calculation.customItems.length > 0;
  if (hasCustomItems && !itemsByCategory.has(12)) {
    itemsByCategory.set(12, []);
  }

  // Calculate custom items total for category 12
  const customItemsTotal = calculation.customItems.reduce(
    (sum, i) => sum + i.sum,
    0,
  );

  // Get display values
  const displayDate = formatDate(calculation.callDateOverride || calculation.startDateOverride || firecall.date);
  const displayDescription =
    calculation.callDescriptionOverride ||
    `${firecall.name}${firecall.description ? ` - ${firecall.description}` : ''}`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image doesn't support alt */}
          <Image style={styles.headerLogo} src={logoPath} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Kostenersatz-Berechnung</Text>
            <Text style={styles.subtitle}>
              Freiwillige Feuerwehr Neusiedl am See
            </Text>
          </View>
        </View>

        {/* Call Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Einsatzdaten</Text>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Einsatz:</Text>
            <Text style={styles.value}>{firecall.name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Datum:</Text>
            <Text style={styles.value}>{displayDate}</Text>
          </View>
          {displayDescription && displayDescription !== firecall.name && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Beschreibung:</Text>
              <Text style={styles.value}>{displayDescription}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.label}>Einsatzdauer:</Text>
            <Text style={styles.value}>
              {calculation.defaultStunden} Stunden
            </Text>
          </View>
          {calculation.comment && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Kommentar:</Text>
              <Text style={styles.value}>{calculation.comment}</Text>
            </View>
          )}
        </View>

        {/* Recipient */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Empfänger</Text>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Name:</Text>
            <Text style={styles.value}>{calculation.recipient.name}</Text>
          </View>
          {calculation.recipient.address && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Adresse:</Text>
              <Text style={styles.value}>{calculation.recipient.address}</Text>
            </View>
          )}
          {calculation.recipient.phone && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Telefon:</Text>
              <Text style={styles.value}>{calculation.recipient.phone}</Text>
            </View>
          )}
          {calculation.recipient.email && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>E-Mail:</Text>
              <Text style={styles.value}>{calculation.recipient.email}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.label}>Bezahlung:</Text>
            <Text style={styles.value}>
              {formatPaymentMethod(calculation.recipient.paymentMethod)}
            </Text>
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Positionen</Text>

          {/* Table Header */}
          <View style={styles.headerRow}>
            <Text style={styles.col1}>Position</Text>
            <Text style={styles.col2}>Einheiten</Text>
            <Text style={styles.col3}>Einzelpreis</Text>
            <Text style={styles.col4}>Stunden</Text>
            <Text style={styles.col5}>Summe</Text>
          </View>

          {/* Items by Category */}
          {Array.from(itemsByCategory.entries())
            .sort(([a], [b]) => a - b)
            .map(([categoryNumber, items]) => {
              const categoryName =
                categoryNumber === 12
                  ? 'Tarif für Verbrauchsmaterialien'
                  : items[0]?.rate.categoryName || '';
              const baseSubtotal =
                calculation.subtotals[String(categoryNumber)] || 0;
              // For category 12, include custom items in the subtotal
              const subtotal =
                categoryNumber === 12
                  ? baseSubtotal + customItemsTotal
                  : baseSubtotal;

              // Calculate starting number for custom items in category 12
              let maxItemNumber = 0;
              if (categoryNumber === 12) {
                for (const { rate } of items) {
                  // Extract number after "12." from rate.id (e.g., "12.17" -> 17)
                  const match = rate.id.match(/^12\.(\d+)$/);
                  if (match) {
                    maxItemNumber = Math.max(
                      maxItemNumber,
                      parseInt(match[1], 10),
                    );
                  }
                }
              }

              return (
                <View key={categoryNumber}>
                  {/* Category Header */}
                  <View style={[styles.row, { backgroundColor: '#f0f0f0' }]}>
                    <Text style={[styles.col1, { fontWeight: 'bold' }]}>
                      {categoryNumber}. {categoryName}
                    </Text>
                    <Text style={styles.col2}></Text>
                    <Text style={styles.col3}></Text>
                    <Text style={styles.col4}></Text>
                    <Text style={[styles.col5, { fontWeight: 'bold' }]}>
                      {formatCurrency(subtotal)}
                    </Text>
                  </View>

                  {/* Category Items */}
                  {items.map(({ item, rate }) => (
                    <View key={item.rateId} style={styles.row}>
                      <Text style={styles.col1}>
                        {rate.id} {rate.description}
                      </Text>
                      <Text style={styles.col2}>{item.einheiten}</Text>
                      <Text style={styles.col3}>
                        {formatCurrency(rate.price)}
                      </Text>
                      <Text style={styles.col4}>
                        {categoryNumber !== 12 && item.anzahlStunden + 'h'}
                      </Text>
                      <Text style={styles.col5}>
                        {formatCurrency(item.sum)}
                      </Text>
                    </View>
                  ))}

                  {/* Custom Items (only for category 12) */}
                  {categoryNumber === 12 &&
                    calculation.customItems.map((item, idx) => {
                      const customItemNumber = maxItemNumber + idx + 1;
                      return (
                        <View key={`custom-${idx}`} style={styles.row}>
                          <Text style={styles.col1}>
                            12.{customItemNumber} {item.description}
                          </Text>
                          <Text style={styles.col2}>
                            {item.quantity} {item.unit}
                          </Text>
                          <Text style={styles.col3}>
                            {formatCurrency(item.pricePerUnit)}
                          </Text>
                          <Text style={styles.col4}></Text>
                          <Text style={styles.col5}>
                            {formatCurrency(item.sum)}
                          </Text>
                        </View>
                      );
                    })}
                </View>
              );
            })}

          {/* Total */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Summe lt. Tarifordnung</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(calculation.totalSum)}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Die Berechnung erfolgt laut Landesgesetzblatt Nr. 77/2023, siehe
            https://www.ris.bka.gv.at/eli/lgbl/BU/2023/77/20231107
          </Text>
          <Text style={styles.footerText}>
            Freiwillige Feuerwehr Neusiedl/See, A-7100 Neusiedl/See Satzgasse 9,
            +43 2167 2250, https://www.ff-neusiedlamsee.at
          </Text>
        </View>
      </Page>
    </Document>
  );
}
