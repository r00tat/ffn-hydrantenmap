/**
 * common firestore types and functions
 * can be used on server and client side
 *
 */

import { Hydrant } from '../../common/gis-objects';
import type { SampleRateSpec } from '../../hooks/radiacode/types';

/**
 * collection names
 */
export const FIRECALL_COLLECTION_ID = 'call';
export const FIRECALL_ITEMS_COLLECTION_ID = 'item';
export const FIRECALL_HISTORY_COLLECTION_ID = 'history';
export const FIRECALL_LAYERS_COLLECTION_ID = 'layer';
export const USER_COLLECTION_ID = 'user';
export const USER_SETTINGS_COLLECTION_ID = 'userSettings';
export const GROUP_COLLECTION_ID = 'groups';
export const CLUSTER_COLLECTION_ID = 'clusters6';
export const FIRECALL_AUDITLOG_COLLECTION_ID = 'auditlog';
export const FIRECALL_CREW_COLLECTION_ID = 'crew';

/**
 * base item for all entries in a firecall
 */
export interface FirecallItem {
  id?: string;
  name: string;
  lat?: number;
  lng?: number;
  alt?: number;
  accuracy?: number;
  deleted?: boolean;
  type: string;
  beschreibung?: string;
  datum?: string;
  editable?: boolean;
  original?: FirecallItem;
  rotation?: string;
  draggable?: boolean;
  /**
   * reference to FirecallLayer
   */
  layer?: string;

  /**
   * z-index for rendering order. Higher values render on top.
   */
  zIndex?: number;

  updatedBy?: string;
  updatedAt?: string;
  creator?: string;
  created?: string;

  fieldData?: Record<string, string | number | boolean>;
}

export const NON_DISPLAYABLE_ITEMS = [
  'gb',
  'diary',
  'layer',
  'fallback',
  'location',
  'spectrum',
];

export const NON_CREATE_ITEMS = ['spectrum', 'fallback'];

export interface DataSchemaField {
  key: string;
  label: string;
  unit: string;
  type: 'number' | 'text' | 'boolean' | 'computed';
  defaultValue?: string | number | boolean;
  /** Formula expression for computed fields, e.g. "dosisleistung * 0.3" */
  formula?: string;
}

export interface HeatmapConfig {
  enabled: boolean;
  activeKey: string;
  colorMode: 'auto' | 'manual';
  /** When true, auto mode uses red→yellow→green (low=red, high=green) */
  invertAutoColor?: boolean;
  /** Heatmap overlay radius in pixels (default 25) */
  radius?: number;
  /** Heatmap overlay blur in pixels (default 15) */
  blur?: number;
  min?: number;
  max?: number;
  colorStops?: { value: number; color: string }[];
  /** Visualization mode: 'heatmap' (default) or 'interpolation' */
  visualizationMode?: 'heatmap' | 'interpolation';
  /** IDW buffer radius in meters beyond convex hull boundary (default 30) */
  interpolationRadius?: number;
  /** @deprecated Use interpolationParams.power instead. Kept for migration. */
  interpolationPower?: number;
  /** Interpolation surface opacity 0-1 (default 0.6) */
  interpolationOpacity?: number;
  /** Interpolation algorithm id (default 'idw') */
  interpolationAlgorithm?: string;
  /** Interpolate in log space — produces exponential gradients around hotspots */
  interpolationLogScale?: boolean;
  /** Algorithm-specific parameters — keys match AlgorithmParamDescriptor.key */
  interpolationParams?: Record<string, number | boolean>;
  /** Color scale distribution: linear (default), log, sqrt, or quantile */
  colorScale?: 'linear' | 'log' | 'sqrt' | 'quantile';
}

export interface FirecallLayer extends FirecallItem {
  grouped?: string;
  showSummary?: string;
  summaryPosition?: string;
  clusterMode?: string;
  showLabels?: string;
  /** Whether the layer is visible by default when opening the map (default: 'true') */
  defaultVisible?: string;
  dataSchema?: DataSchemaField[];
  heatmapConfig?: HeatmapConfig;
  layerType?: 'generic' | 'radiacode';
  sampleRate?: SampleRateSpec;
}

export interface DrawingStroke {
  color: string; // hex color, e.g. '#ff0000'
  width: number; // stroke width in pixels, 1–20
  points: number[][]; // [[lat, lng], ...] — RDP-simplified geo coords
  order: number; // ascending integer — determines render order
}

export interface FcAttachment {
  name: string;
  mimeType?: string;
  data: string;
}

export type FcItemAttachment = string | FcAttachment;

export interface FcMarker extends FirecallItem {
  type: 'marker';
  iconUrl?: string;
  zeichen?: string;
  attachments?: FcItemAttachment[];
  color?: string;
  showLabel?: boolean;
}

export interface Fzg extends FirecallItem {
  fw?: string;
  besatzung?: string;
  ats?: number;
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;
  type: 'vehicle';
}

export const TACTICAL_UNIT_TYPES = [
  'einheit',
  'trupp',
  'gruppe',
  'zug',
  'bereitschaft',
  'abschnitt',
  'bezirk',
  'lfv',
  'oebfv',
] as const;

export type TacticalUnitType = (typeof TACTICAL_UNIT_TYPES)[number];

export const TACTICAL_UNIT_LABELS: Record<TacticalUnitType, string> = {
  einheit: 'Einheit',
  trupp: 'Trupp',
  gruppe: 'Gruppe',
  zug: 'Zug',
  bereitschaft: 'Bereitschaft',
  abschnitt: 'Abschnitt',
  bezirk: 'Bezirk',
  lfv: 'LFV',
  oebfv: 'ÖBFV',
};

export interface TacticalUnit extends FirecallItem {
  type: 'tacticalUnit';
  unitType?: TacticalUnitType;
  fw?: string;
  mann?: number;
  fuehrung?: string;
  ats?: number;
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;
}

export interface Rohr extends FirecallItem {
  art: 'C' | 'B' | 'Wasserwerfer' | string;
  durchfluss?: number;
  type: 'rohr';
}

export interface Diary extends FirecallItem {
  type: 'diary';
  art?: 'M' | 'B' | 'F';
  nummer?: number;
  datum: string;
  von?: string;
  an?: string;
  erledigt?: string;
  textRepresenation?: string;
}
export interface GeschaeftsbuchEintrag extends FirecallItem {
  type: 'gb';
  nummer?: number;
  ausgehend?: boolean;
  datum: string;
  von?: string;
  an?: string;
  weiterleitung?: string;
  gelesen?: string;
  erledigt?: string;
}

export interface Spectrum extends FirecallItem {
  type: 'spectrum';
  sampleName: string;
  deviceName: string;
  measurementTime: number;
  liveTime: number;
  startTime: string;
  endTime: string;
  coefficients: number[];
  counts: number[];
  matchedNuclide?: string;
  matchedConfidence?: number;
  manualNuclide?: string;
  description?: string;
}

export interface MultiPointItem extends FirecallItem {
  destLat: number;
  destLng: number;
  /** stringified LatLngPosition[] */
  positions?: string;
  distance?: number;
  color?: string;
  alwaysShowMarker?: string;
}

export interface Connection extends MultiPointItem {
  type: 'connection';
  dimension?: string;
  oneHozeLength?: number;
}

export interface Area extends MultiPointItem {
  type: 'area';
  opacity?: number;
  alwaysShowMarker?: string;
}

export interface Line extends MultiPointItem {
  type: 'line';
  opacity?: number;
}

export interface Circle extends FirecallItem {
  type: 'circle';
  radius: number;
  color?: string;
  opacity?: number;
  fill?: string;
}

export const filterActiveItems = (g: FirecallItem | Firecall) =>
  g.deleted !== true;

export const filterDisplayableItems = (g: FirecallItem) => {
  return g.deleted !== true && NON_DISPLAYABLE_ITEMS.indexOf(g.type) < 0;
};

export interface Firecall {
  id?: string;
  name: string;
  fw?: string;
  date?: string;
  description?: string;
  deleted?: boolean;
  eintreffen?: string;
  abruecken?: string;
  lat?: number;
  lng?: number;
  group?: string;
  attachments?: string[];
  autoSnapshotInterval?: number; // Minutes, 0 = disabled, default 5
  blaulichtSmsAlarmId?: string;
  [key: string]: any;
}

export type CrewFunktion =
  | 'Feuerwehrmann'
  | 'Maschinist'
  | 'Gruppenkommandant'
  | 'Atemschutzträger'
  | 'Zugskommandant'
  | 'Einsatzleiter';

export const CREW_FUNKTIONEN: CrewFunktion[] = [
  'Feuerwehrmann',
  'Maschinist',
  'Gruppenkommandant',
  'Atemschutzträger',
  'Zugskommandant',
  'Einsatzleiter',
];

export interface CrewAssignment {
  id?: string;
  recipientId: string;
  name: string;
  vehicleId: string | null;
  vehicleName: string;
  funktion: CrewFunktion;
  updatedAt?: string;
  updatedBy?: string;
}

export function funktionAbkuerzung(funktion: CrewFunktion): string {
  const map: Record<CrewFunktion, string> = {
    Feuerwehrmann: 'FM',
    Maschinist: 'MA',
    Gruppenkommandant: 'GK',
    Atemschutzträger: 'ATS',
    Zugskommandant: 'ZK',
    Einsatzleiter: 'EL',
  };
  return map[funktion];
}

export function dateToYmd(date: Date) {
  return `${date.getFullYear()}-${
    date.getMonth() < 10 ? '0' : ''
  }${date.getMonth()}-${date.getDay() < 10 ? '0' : ''}${date.getDay()}`;
}

export interface FirecallHistory {
  id?: string;
  description: string;
  createdAt: string;
}

export const FIRECALL_LOCATIONS_COLLECTION_ID = 'location';

export type LocationStatus =
  | 'offen'
  | 'einsatz notwendig'
  | 'in arbeit'
  | 'erledigt'
  | 'kein einsatz';

export const LOCATION_STATUS_OPTIONS: LocationStatus[] = [
  'offen',
  'einsatz notwendig',
  'in arbeit',
  'erledigt',
  'kein einsatz',
];

export const LOCATION_STATUS_COLORS: Record<LocationStatus, string> = {
  offen: '#fbc02d',
  'einsatz notwendig': '#d32f2f',
  'in arbeit': '#f57c00',
  erledigt: '#388e3c',
  'kein einsatz': '#388e3c',
};

export interface FirecallLocation {
  id?: string;

  // Address
  street: string;
  number: string;
  city: string;

  // Details
  name: string;
  description: string;
  info: string;

  // Status
  status: LocationStatus;
  vehicles: Record<string, string>;

  // Times
  alarmTime?: string;
  startTime?: string;
  doneTime?: string;

  // Coordinates
  lat?: number;
  lng?: number;

  // Metadata
  created: string;
  creator: string;
  updatedAt?: string;
  updatedBy?: string;
  deleted?: boolean;

  // Import tracking
  /** Order/reference number from dispatch system for deduplication during email import */
  auftragsNummer?: string;
}

export const defaultFirecallLocation: Partial<FirecallLocation> = {
  street: '',
  number: '',
  city: 'Neusiedl am See',
  name: '',
  description: '',
  info: '',
  status: 'offen',
  vehicles: {},
};

export interface HydrantenItem extends FirecallItem, Hydrant {
  type: 'hydrant';
}

export interface AuditLogEntry {
  id?: string;
  timestamp: string;
  user: string;
  action: 'create' | 'update' | 'delete';
  elementType: string;
  elementId: string;
  elementName: string;
  previousValue?: Record<string, any>;
  newValue?: Record<string, any>;
}
