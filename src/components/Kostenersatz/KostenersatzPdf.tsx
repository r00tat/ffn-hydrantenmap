'use client';

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import {
  formatCurrency,
  formatPaymentMethod,
  KostenersatzCalculation,
  KostenersatzRate,
} from '../../common/kostenersatz';
import { Firecall } from '../firebase/firestore';

// Register fonts (optional - uses default if not registered)
// Font.register({ family: 'Helvetica', src: '/fonts/Helvetica.ttf' });

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
    borderBottom: 1,
    borderBottomColor: '#333',
    paddingBottom: 10,
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
    textAlign: 'right',
  },
  col3: {
    flex: 1,
    textAlign: 'right',
  },
  col4: {
    flex: 1,
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
    flex: 3,
    fontSize: 14,
    fontWeight: 'bold',
  },
  totalValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  infoBlock: {
    marginBottom: 10,
  },
  infoLabel: {
    fontWeight: 'bold',
    marginBottom: 2,
  },
  infoValue: {
    marginBottom: 5,
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

interface KostenersatzPdfProps {
  calculation: KostenersatzCalculation;
  firecall: Firecall;
  rates: KostenersatzRate[];
}

export default function KostenersatzPdf({
  calculation,
  firecall,
  rates,
}: KostenersatzPdfProps) {
  // Group items by category
  const itemsByCategory = new Map<number, Array<{ item: typeof calculation.items[0]; rate: KostenersatzRate }>>();

  for (const item of calculation.items) {
    const rate = rates.find((r) => r.id === item.rateId);
    if (rate && item.einheiten > 0) {
      const existing = itemsByCategory.get(rate.categoryNumber) || [];
      existing.push({ item, rate });
      itemsByCategory.set(rate.categoryNumber, existing);
    }
  }

  // Get display values
  const displayDate = calculation.callDateOverride || firecall.date || '';
  const displayDescription =
    calculation.callDescriptionOverride ||
    `${firecall.name}${firecall.description ? ` - ${firecall.description}` : ''}`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Kostenersatz-Berechnung</Text>
          <Text style={styles.subtitle}>
            Freiwillige Feuerwehr Neusiedl am See
          </Text>
        </View>

        {/* Call Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Einsatzdaten</Text>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Datum:</Text>
            <Text style={styles.infoValue}>{displayDate}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Beschreibung:</Text>
            <Text style={styles.infoValue}>{displayDescription}</Text>
          </View>
          {calculation.comment && (
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Kommentar:</Text>
              <Text style={styles.infoValue}>{calculation.comment}</Text>
            </View>
          )}
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Einsatzdauer:</Text>
            <Text style={styles.infoValue}>
              {calculation.defaultStunden} Stunden
            </Text>
          </View>
        </View>

        {/* Recipient */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Empfänger</Text>
          <View style={styles.infoBlock}>
            <Text style={styles.infoValue}>{calculation.recipient.name}</Text>
            <Text style={styles.infoValue}>{calculation.recipient.address}</Text>
            {calculation.recipient.phone && (
              <Text style={styles.infoValue}>Tel: {calculation.recipient.phone}</Text>
            )}
            {calculation.recipient.email && (
              <Text style={styles.infoValue}>E-Mail: {calculation.recipient.email}</Text>
            )}
            <Text style={styles.infoValue}>
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
            <Text style={styles.col3}>Stunden</Text>
            <Text style={styles.col4}>Summe</Text>
          </View>

          {/* Items by Category */}
          {Array.from(itemsByCategory.entries())
            .sort(([a], [b]) => a - b)
            .map(([categoryNumber, items]) => {
              const categoryName = items[0]?.rate.categoryName || '';
              const subtotal = calculation.subtotals[String(categoryNumber)] || 0;

              return (
                <View key={categoryNumber}>
                  {/* Category Header */}
                  <View style={[styles.row, { backgroundColor: '#f0f0f0' }]}>
                    <Text style={[styles.col1, { fontWeight: 'bold' }]}>
                      {categoryNumber}. {categoryName}
                    </Text>
                    <Text style={styles.col2}></Text>
                    <Text style={styles.col3}></Text>
                    <Text style={[styles.col4, { fontWeight: 'bold' }]}>
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
                      <Text style={styles.col3}>{item.anzahlStunden}h</Text>
                      <Text style={styles.col4}>{formatCurrency(item.sum)}</Text>
                    </View>
                  ))}
                </View>
              );
            })}

          {/* Custom Items */}
          {calculation.customItems.length > 0 && (
            <View>
              <View style={[styles.row, { backgroundColor: '#f0f0f0' }]}>
                <Text style={[styles.col1, { fontWeight: 'bold' }]}>
                  12. Sonstige Leistungen
                </Text>
                <Text style={styles.col2}></Text>
                <Text style={styles.col3}></Text>
                <Text style={[styles.col4, { fontWeight: 'bold' }]}>
                  {formatCurrency(
                    calculation.customItems.reduce((sum, i) => sum + i.sum, 0)
                  )}
                </Text>
              </View>
              {calculation.customItems.map((item, idx) => (
                <View key={idx} style={styles.row}>
                  <Text style={styles.col1}>{item.description}</Text>
                  <Text style={styles.col2}>
                    {item.quantity} {item.unit}
                  </Text>
                  <Text style={styles.col3}>
                    {formatCurrency(item.pricePerUnit)}
                  </Text>
                  <Text style={styles.col4}>{formatCurrency(item.sum)}</Text>
                </View>
              ))}
            </View>
          )}

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
            Die Berechnung erfolgt laut Landesgesetzblatt Nr. 77/2023
          </Text>
          <Text style={styles.footerText}>
            Freiwillige Feuerwehr Neusiedl am See
          </Text>
          <Text style={styles.footerText}>
            Bankverbindung: IBAN AT00 0000 0000 0000 0000 | BIC XXXXATXX
          </Text>
        </View>
      </Page>
    </Document>
  );
}
