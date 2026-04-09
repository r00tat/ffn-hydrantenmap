import { useCallback, useContext, useRef, useState } from 'react';
import { LeafletContext } from '@react-leaflet/core';
import { GenerateContentRequest } from 'firebase/ai';
import { geminiModel } from '../../components/firebase/vertexai';
import { AI_SYSTEM_PROMPT, AI_TOOL_DECLARATIONS } from '../../components/firebase/aiTools';
import { FirecallItem } from '../../components/firebase/firestore';
import { usePositionContext } from '../../components/Map/Position';
import { searchPlace } from '../../components/actions/maps/places';
import { GeoPosition } from '../../common/geo';
import { defaultPosition } from '../constants';
import useFirecallItemAdd from '../useFirecallItemAdd';
import useFirecallItemUpdate from '../useFirecallItemUpdate';
import { AiAssistantResult, AiInteraction, MEMORY_TIMEOUT_MS, MAX_INTERACTIONS } from './types';
import { executeToolCall } from './toolHandlers';
import { buildAiContext } from './contextBuilder';

export type AiProcessingStatus = 'idle' | 'transcribing' | 'analyzing' | 'executing';

export default function useAiAssistant(existingItems: FirecallItem[]) {
  const leafletContext = useContext(LeafletContext);
  const map = leafletContext?.map ?? null;
  const [position, isPositionSet] = usePositionContext();
  const addFirecallItem = useFirecallItemAdd();
  const updateFirecallItem = useFirecallItemUpdate();
  const interactionsRef = useRef<AiInteraction[]>([]);
  const [lastCreatedItem, setLastCreatedItem] = useState<{ id: string; type: string } | null>(null);
  const [processingStatus, setProcessingStatus] = useState<AiProcessingStatus>('idle');

  const cleanupOldInteractions = useCallback(() => {
    const now = Date.now();
    interactionsRef.current = interactionsRef.current.filter(
      (i) => now - i.timestamp < MEMORY_TIMEOUT_MS
    ).slice(-MAX_INTERACTIONS);
  }, []);

  const resolvePosition = useCallback(
    async (
      positionSpec: { type: string; itemName?: string; address?: string; lat?: number; lng?: number } | undefined
    ): Promise<{ lat: number; lng: number }> => {
      const center = map ? map.getCenter() : defaultPosition;
      const defaultPos = { lat: center.lat, lng: center.lng };

      if (!positionSpec) return defaultPos;

      switch (positionSpec.type) {
        case 'mapCenter':
          return defaultPos;

        case 'userPosition':
          return isPositionSet ? { lat: position.lat, lng: position.lng } : defaultPos;

        case 'nearItem':
          if (positionSpec.itemName) {
            const target = existingItems.find(
              (i) => i.name?.toLowerCase().includes(positionSpec.itemName!.toLowerCase())
            );
            if (target?.lat && target?.lng) {
              const offset = 20 / 111320;
              return { lat: target.lat + offset, lng: target.lng + offset };
            }
          }
          return defaultPos;

        case 'address':
          if (positionSpec.address) {
            const results = await searchPlace(positionSpec.address, {
              position: new GeoPosition(center.lat, center.lng),
              maxResults: 1,
            });
            if (results[0]) {
              return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
            }
          }
          return defaultPos;

        case 'coordinates':
          if (positionSpec.lat !== undefined && positionSpec.lng !== undefined) {
            return { lat: positionSpec.lat, lng: positionSpec.lng };
          }
          return defaultPos;

        default:
          return defaultPos;
      }
    },
    [existingItems, isPositionSet, map, position]
  );

  const sendToGemini = useCallback(
    async (userParts: GenerateContentRequest['contents'][0]['parts']): Promise<AiAssistantResult> => {
      cleanupOldInteractions();

      const context = buildAiContext({
        map,
        defaultPosition,
        existingItems,
        isPositionSet,
        position,
        interactions: interactionsRef.current,
      });

      const request: GenerateContentRequest = {
        systemInstruction: AI_SYSTEM_PROMPT,
        contents: [
          {
            role: 'user',
            parts: [
              ...userParts,
              { text: `Kontext:\n${JSON.stringify(context, null, 2)}` },
            ],
          },
        ],
        tools: [{ functionDeclarations: AI_TOOL_DECLARATIONS }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      };

      console.info('[AI] Sending request with parts:', userParts.map((p) =>
        'text' in p ? { text: p.text?.substring(0, 100) } : { type: 'inlineData', mimeType: (p as any).inlineData?.mimeType }
      ));

      setProcessingStatus('analyzing');
      try {
        const result = await geminiModel.generateContent(request);
        const response = result.response;
        const functionCalls = response.functionCalls();
        let responseText = '';
        try { responseText = response.text?.() || ''; } catch { /* text() throws when only function calls */ }

        console.info('[AI] Response text:', responseText);
        console.info('[AI] Function calls:', functionCalls?.length ?? 0,
          functionCalls?.map((fc) => ({ name: fc.name, args: fc.args })));

        if (functionCalls && functionCalls.length > 0) {
          const toolDeps = {
            resolvePosition,
            addFirecallItem,
            updateFirecallItem,
            existingItems,
            lastCreatedItem,
            setLastCreatedItem,
            map,
            defaultPosition,
          };

          const messages: string[] = [];
          let lastResult: AiAssistantResult | null = null;

          setProcessingStatus('executing');
          for (const fc of functionCalls) {
            console.info(`[AI] Executing tool: ${fc.name}`, fc.args);
            const execResult = await executeToolCall(fc, toolDeps);
            console.info(`[AI] Tool result:`, { success: execResult.success, message: execResult.message });

            if (execResult.success) {
              interactionsRef.current.push({
                timestamp: Date.now(),
                action: fc.name,
                createdItemId: execResult.createdItemId,
                createdItemType: fc.name.replace('create', '').toLowerCase(),
              });
            }

            messages.push(execResult.message);
            lastResult = execResult;
          }

          setProcessingStatus('idle');
          return {
            ...lastResult!,
            message: messages.join(' | '),
          };
        }

        const text = result.response.text();
        setProcessingStatus('idle');
        return { success: false, message: text || 'Keine Aktion erkannt' };
      } catch (error) {
        console.error('AI processing error:', error);
        setProcessingStatus('idle');
        return { success: false, message: 'Fehler bei der Verarbeitung' };
      }
    },
    [cleanupOldInteractions, existingItems, isPositionSet, map, position, resolvePosition, addFirecallItem, updateFirecallItem, lastCreatedItem]
  );

  const transcribeAudio = useCallback(
    async (audioBase64: string): Promise<string | null> => {
      const request: GenerateContentRequest = {
        systemInstruction: 'Du bist ein Transkriptions-Assistent. Transkribiere die Audio-Eingabe wortgetreu auf Deutsch. Gib NUR den transkribierten Text zurück, keine Erklärungen oder Formatierung.',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'audio/webm', data: audioBase64 } },
              { text: 'Transkribiere diese Audio-Aufnahme wortgetreu.' },
            ],
          },
        ],
      };

      const result = await geminiModel.generateContent(request);
      const text = result.response.text()?.trim();
      console.info('[AI] Transcription:', text);
      return text || null;
    },
    []
  );

  const processAudio = useCallback(
    async (audioBase64: string): Promise<AiAssistantResult> => {
      try {
        setProcessingStatus('transcribing');
        const transcription = await transcribeAudio(audioBase64);
        if (!transcription) {
          setProcessingStatus('idle');
          return { success: false, message: 'Audio konnte nicht transkribiert werden' };
        }
        return sendToGemini([{ text: transcription }]);
      } catch (error) {
        console.error('Transcription error:', error);
        setProcessingStatus('idle');
        return { success: false, message: 'Fehler bei der Transkription' };
      }
    },
    [transcribeAudio, sendToGemini]
  );

  const processText = useCallback(
    async (text: string): Promise<AiAssistantResult> => {
      return sendToGemini([{ text }]);
    },
    [sendToGemini]
  );

  const undoLastAction = useCallback(async (): Promise<boolean> => {
    if (!lastCreatedItem) return false;

    const item = existingItems.find((i) => i.id === lastCreatedItem.id);
    if (!item) return false;

    await updateFirecallItem({ ...item, deleted: true });
    setLastCreatedItem(null);
    return true;
  }, [existingItems, lastCreatedItem, updateFirecallItem]);

  return {
    processAudio,
    processText,
    undoLastAction,
    lastCreatedItem,
    processingStatus,
  };
}
