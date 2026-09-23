import { HoseLineDraft } from '../../common/waterSupply';
import type { AiTruppContext } from '../../components/Atemschutz/truppAssistant';
import type { AiContextLayer } from './layerFields';

export interface AiInteraction {
  timestamp: number;
  action: string;
  createdItemId?: string;
  createdItemType?: string;
}

export interface AiContextItem {
  id: string;
  type: string;
  name: string;
  lat?: number;
  lng?: number;
  // Specific item properties
  fw?: string;
  besatzung?: string;
  ats?: number;
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;
  art?: string;
  durchfluss?: number;
  datum?: string;
  von?: string;
  an?: string;
  nummer?: string;
  ausgehend?: boolean;
  radius?: number;
  color?: string;
  beschreibung?: string;
}

export interface AiContext {
  mapCenter: { lat: number; lng: number };
  mapBounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  zoomLevel: number;
  existingItems: AiContextItem[];
  userPosition: { lat: number; lng: number } | null;
  recentInteractions: AiInteraction[];
  /** Laufende Atemschutztrupps; fehlt, solange es keine gibt. */
  atemschutzTrupps?: AiTruppContext[];
  /** Ebenen mit ihren Datenfeldern; fehlt, solange es keine gibt. */
  layers?: AiContextLayer[];
  /** Name der aktiven Ebene — dorthin kommen neue Marker ohne genannte Ebene. */
  activeLayer?: string;
}

export interface AiAssistantResult {
  success: boolean;
  message: string;
  createdItemId?: string;
  /**
   * Elementtyp des angelegten Elements, wenn er sich nicht aus dem
   * Werkzeugnamen ergibt — `createMarker` legt auch `el` und `assp` an.
   */
  createdItemType?: string;
  isAnswer?: boolean;
  data?: any; // Structured data for the AI to process
  /**
   * Das Modell hat die Antwort bereits selbst gesprochen (Live-Sitzung). Die
   * Sprachsynthese des Browsers bzw. `/api/tts` bleibt dann außen vor, sonst
   * käme derselbe Satz ein zweites Mal.
   */
  spokenByModel?: boolean;
  /**
   * Leitungsvorschläge, die noch bestätigt werden müssen. Solange gesetzt,
   * zeigt der Toast „Übernehmen"/„Verwerfen" statt automatisch zu verschwinden.
   */
  drafts?: HoseLineDraft[];
  clarification?: {
    question: string;
    options: string[];
  };
}

/**
 * Wie lange das Gespräch nach der letzten Antwort im Gedächtnis bleibt.
 * Gemessen wird ab dem *Ende* der letzten Antwort: Zwischen zwei Sätzen an den
 * Assistenten liegt am Einsatzort oft die eigentliche Arbeit, und wer dann
 * „und wie weit ist das?" nachschiebt, meint noch immer dieselbe Sache.
 */
export const MEMORY_TIMEOUT_MS = 15 * 60 * 1000; // 15 Minuten
export const MAX_INTERACTIONS = 10;

/**
 * Aufgelöste Bezugsposition samt Bezeichnung dessen, was tatsächlich verwendet
 * wurde — inklusive des Rückfalls, wenn die gewünschte Angabe fehlte.
 */
export interface ResolvedOrigin {
  lat: number;
  lng: number;
  /** mapCenter | auto | userPosition | einsatzort | atItem | nearItem | address | coordinates */
  type: string;
  /** Deutsche Bezeichnung im Dativ, z.B. „deinem Standort" */
  label: string;
}
