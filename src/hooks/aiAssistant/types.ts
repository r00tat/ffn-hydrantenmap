import { HoseLineDraft } from '../../common/waterSupply';

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
}

export interface AiAssistantResult {
  success: boolean;
  message: string;
  createdItemId?: string;
  isAnswer?: boolean;
  data?: any; // Structured data for the AI to process
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
