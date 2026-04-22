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
  clarification?: {
    question: string;
    options: string[];
  };
}

export const MEMORY_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
export const MAX_INTERACTIONS = 10;
