export interface AiInteraction {
  timestamp: number;
  action: string;
  createdItemId?: string;
  createdItemType?: string;
}

export interface AiAssistantResult {
  success: boolean;
  message: string;
  createdItemId?: string;
  clarification?: {
    question: string;
    options?: string[];
  };
  isAnswer?: boolean;
}

export interface AiContextItem {
  id: string;
  type: string;
  name: string;
  lat?: number;
  lng?: number;
  beschreibung?: string;
  datum?: string;
  // Vehicle fields
  fw?: string;
  besatzung?: string;
  ats?: number;
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;
  // Rohr fields
  art?: string;
  durchfluss?: number;
  // Diary/Gb fields
  von?: string;
  an?: string;
  ausgehend?: boolean;
  nummer?: number;
  // Circle fields
  radius?: number;
  color?: string;
}

export interface AiContext {
  mapCenter: { lat: number; lng: number };
  mapBounds: { north: number; south: number; east: number; west: number };
  zoomLevel: number;
  existingItems: AiContextItem[];
  userPosition: { lat: number; lng: number } | null;
  recentInteractions: AiInteraction[];
}

export const MEMORY_TIMEOUT_MS = 60000; // 60 seconds
export const MAX_INTERACTIONS = 3;
