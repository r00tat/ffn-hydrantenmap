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
  isAnswer?: boolean;
  data?: any; // Structured data for the AI to process
  clarification?: {
    question: string;
    options: string[];
  };
}

export const MEMORY_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
export const MAX_INTERACTIONS = 10;
