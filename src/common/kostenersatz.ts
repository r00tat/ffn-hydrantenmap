/**
 * Kostenersatz (Cost Recovery) Types and Calculation Logic
 *
 * Based on Burgenland fire brigade cost recovery regulations
 * Landesgesetzblatt Nr. 77/2023
 */

// ============================================================================
// Rate & Version Types
// ============================================================================

export type TarifCategory = 'A' | 'B' | 'C' | 'D';

export interface KostenersatzVersion {
  id: string; // e.g., "LGBl_77_2023"
  name: string; // e.g., "LGBl. Nr. 77/2023"
  validFrom: string; // ISO date
  isActive: boolean; // Currently active version for new calculations
  createdAt: string;
  createdBy: string;
}

export interface KostenersatzRate {
  id: string; // e.g., "1.01"
  version: string; // e.g., "LGBl_77_2023"
  validFrom: string; // ISO date when this version became active
  category: TarifCategory;
  categoryNumber: number; // 1-12
  categoryName: string;
  description: string;
  unit: string;
  price: number; // Hourly/per-unit rate
  pricePauschal?: number; // Flat rate (optional)
  pauschalHours?: number; // Duration covered by pauschal: 12h for cat 2,4 or 24h for cat 3,8,9
  isExtendable: boolean; // Only Tarif D items can have custom entries
  sortOrder: number;
}

// ============================================================================
// Template Types
// ============================================================================

export interface KostenersatzTemplateItem {
  rateId: string;
  einheiten: number;
}

export interface KostenersatzTemplate {
  id?: string;
  name: string;
  description?: string;
  isShared: boolean; // true = visible to all users
  createdBy: string; // User email
  createdAt?: string;
  updatedAt?: string;
  items: KostenersatzTemplateItem[];
  defaultStunden?: number;
}

// ============================================================================
// Calculation Types
// ============================================================================

export type PaymentMethod = 'bar' | 'kreditkarte' | 'rechnung';
export type CalculationStatus = 'draft' | 'completed' | 'sent';

export interface KostenersatzRecipient {
  name: string;
  address: string;
  phone: string;
  email: string;
  paymentMethod: PaymentMethod;
}

export interface KostenersatzLineItem {
  rateId: string;
  einheiten: number; // Quantity/units
  anzahlStunden: number; // Hours
  stundenOverridden: boolean; // true if different from defaultStunden
  sum: number; // Calculated sum
}

export interface KostenersatzCustomItem {
  description: string;
  unit: string;
  pricePerUnit: number;
  quantity: number;
  sum: number;
}

export interface KostenersatzCalculation {
  id?: string;
  createdBy: string;
  createdAt: string; // ISO timestamp
  updatedAt: string;
  status: CalculationStatus;
  rateVersion: string; // Version of rates used, e.g., "LGBl_77_2023"

  // Override firecall defaults if needed
  callDateOverride?: string;
  callDescriptionOverride?: string;
  comment: string;
  defaultStunden: number;

  // Recipient (embedded)
  recipient: KostenersatzRecipient;

  // Line items (reference rate IDs)
  items: KostenersatzLineItem[];

  // Custom Tarif D items only
  customItems: KostenersatzCustomItem[];

  // Subtotals by category number
  subtotals: Record<string, number>;

  totalSum: number;

  // PDF/Email tracking
  pdfUrl?: string;
  emailSentAt?: string;
}

// ============================================================================
// Firestore Collection Constants
// ============================================================================

export const KOSTENERSATZ_RATES_COLLECTION = 'kostenersatzRates';
export const KOSTENERSATZ_VERSIONS_COLLECTION = 'kostenersatzVersions';
export const KOSTENERSATZ_TEMPLATES_COLLECTION = 'kostenersatzTemplates';
export const KOSTENERSATZ_SUBCOLLECTION = 'kostenersatz';

// ============================================================================
// Calculation Logic
// ============================================================================

/**
 * Calculate the sum for a single line item based on hours and units
 *
 * Logic:
 * - For hours 1-4: Use hourly rate (einheiten × stunden × price)
 * - For hours 5+: Use pauschal rate per block (12h or 24h depending on category)
 *   - Category 2,4: 12h blocks (hours 5-12 = 1 block, 13-24 = 2 blocks, etc.)
 *   - Category 3,8,9: 24h blocks (hours 5-24 = 1 block, 25-48 = 2 blocks, etc.)
 *
 * @param anzahlStunden Number of hours
 * @param einheiten Number of units (vehicles, personnel, etc.)
 * @param price Hourly rate
 * @param pricePauschal Flat rate for pauschal block (optional)
 * @param pauschalHours Duration of one pauschal block: 12 (default) or 24 hours
 * @returns Calculated sum
 */
export function calculateItemSum(
  anzahlStunden: number,
  einheiten: number,
  price: number,
  pricePauschal?: number,
  pauschalHours: number = 12
): number {
  if (einheiten <= 0 || anzahlStunden <= 0) {
    return 0;
  }

  // For flat-rate items (price is 0 but pricePauschal exists), use pauschal directly
  // This applies to Tariff B/10 items like "Aufsperren einer Wohnung" etc.
  if (price === 0 && pricePauschal) {
    return roundCurrency(einheiten * pricePauschal);
  }

  if (anzahlStunden < 5 || !pricePauschal) {
    // Hourly rate for first 4 hours (or if no pauschal defined)
    return roundCurrency(einheiten * anzahlStunden * price);
  } else {
    // Pauschal rate kicks in at hour 5+
    // Each started block (12h or 24h) uses one pauschal
    const pauschalBlocks = Math.ceil(anzahlStunden / pauschalHours);
    return roundCurrency(einheiten * pauschalBlocks * pricePauschal);
  }
}

/**
 * Calculate sum for a custom item (Tarif D)
 */
export function calculateCustomItemSum(
  quantity: number,
  pricePerUnit: number
): number {
  return roundCurrency(quantity * pricePerUnit);
}

/**
 * Round to 2 decimal places for currency
 */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate subtotals grouped by category number
 */
export function calculateSubtotals(
  items: KostenersatzLineItem[],
  rates: KostenersatzRate[]
): Record<string, number> {
  const subtotals: Record<string, number> = {};

  for (const item of items) {
    const rate = rates.find((r) => r.id === item.rateId);
    if (rate) {
      const categoryKey = String(rate.categoryNumber);
      subtotals[categoryKey] = (subtotals[categoryKey] || 0) + item.sum;
    }
  }

  // Round all subtotals
  for (const key of Object.keys(subtotals)) {
    subtotals[key] = roundCurrency(subtotals[key]);
  }

  return subtotals;
}

/**
 * Calculate total sum from items and custom items
 */
export function calculateTotalSum(
  items: KostenersatzLineItem[],
  customItems: KostenersatzCustomItem[]
): number {
  const itemsSum = items.reduce((sum, item) => sum + item.sum, 0);
  const customSum = customItems.reduce((sum, item) => sum + item.sum, 0);
  return roundCurrency(itemsSum + customSum);
}

/**
 * Recalculate a line item's sum based on current rate data
 */
export function recalculateLineItem(
  item: KostenersatzLineItem,
  rate: KostenersatzRate,
  defaultStunden: number
): KostenersatzLineItem {
  const stunden = item.stundenOverridden ? item.anzahlStunden : defaultStunden;
  return {
    ...item,
    anzahlStunden: stunden,
    sum: calculateItemSum(stunden, item.einheiten, rate.price, rate.pricePauschal, rate.pauschalHours),
  };
}

/**
 * Create an empty calculation with default values
 */
export function createEmptyCalculation(
  createdBy: string,
  rateVersion: string,
  defaultStunden: number = 1
): Omit<KostenersatzCalculation, 'id'> {
  const now = new Date().toISOString();
  return {
    createdBy,
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    rateVersion,
    comment: '',
    defaultStunden,
    recipient: {
      name: '',
      address: '',
      phone: '',
      email: '',
      paymentMethod: 'rechnung',
    },
    items: [],
    customItems: [],
    subtotals: {},
    totalSum: 0,
  };
}

/**
 * Create a line item from a rate
 */
export function createLineItem(
  rateId: string,
  einheiten: number,
  anzahlStunden: number,
  rate: KostenersatzRate,
  defaultStunden: number
): KostenersatzLineItem {
  const stundenOverridden = anzahlStunden !== defaultStunden;
  return {
    rateId,
    einheiten,
    anzahlStunden,
    stundenOverridden,
    sum: calculateItemSum(anzahlStunden, einheiten, rate.price, rate.pricePauschal, rate.pauschalHours),
  };
}

/**
 * Create an empty custom item
 */
export function createEmptyCustomItem(): KostenersatzCustomItem {
  return {
    description: '',
    unit: '',
    pricePerUnit: 0,
    quantity: 0,
    sum: 0,
  };
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format currency value for display (German locale)
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

/**
 * Format payment method for display
 */
export function formatPaymentMethod(method: PaymentMethod): string {
  switch (method) {
    case 'bar':
      return 'Bar: Betrag eingehoben';
    case 'kreditkarte':
      return 'Kreditkarte: Betrag eingehoben';
    case 'rechnung':
      return 'Rechnung: Betrag ausständig';
  }
}

/**
 * Format calculation status for display
 */
export function formatStatus(status: CalculationStatus): string {
  switch (status) {
    case 'draft':
      return 'Entwurf';
    case 'completed':
      return 'Abgeschlossen';
    case 'sent':
      return 'Gesendet';
  }
}

/**
 * Get status color for MUI chips
 */
export function getStatusColor(
  status: CalculationStatus
): 'default' | 'primary' | 'success' {
  switch (status) {
    case 'draft':
      return 'default';
    case 'completed':
      return 'primary';
    case 'sent':
      return 'success';
  }
}

// ============================================================================
// Duration Calculation Helper
// ============================================================================

/**
 * Calculate duration in hours between two ISO timestamps
 * Rounds up to nearest hour
 */
export function calculateDurationHours(
  startTime: string | undefined,
  endTime: string | undefined
): number | undefined {
  if (!startTime || !endTime) {
    return undefined;
  }

  try {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end.getTime() - start.getTime();

    if (diffMs <= 0) {
      return undefined;
    }

    // Convert to hours and round up
    const hours = Math.ceil(diffMs / (1000 * 60 * 60));
    return hours;
  } catch {
    return undefined;
  }
}
