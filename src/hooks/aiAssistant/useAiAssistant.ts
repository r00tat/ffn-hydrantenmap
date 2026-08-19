import { useCallback, useContext, useRef, useState } from 'react';
import { LeafletContext } from '@react-leaflet/core';
import { GenerateContentRequest, Content } from 'firebase/ai';
import { geminiModel } from '../../components/firebase/vertexai';
import { AI_SYSTEM_PROMPT, AI_TOOL_DECLARATIONS } from '../../components/firebase/aiTools';
import { FirecallItem } from '../../components/firebase/firestore';
import { usePositionContext } from '../../components/providers/PositionProvider';
import { searchPlace } from '../../components/actions/maps/places';
import { queryClusters } from '../../components/firebase/clusterQuery';
import { GeoPosition } from '../../common/geo';
import { HoseLineDraft, WaterSupplyCandidate } from '../../common/waterSupply';
import { defaultPosition } from '../constants';
import { findFirecallItemByName } from './itemLookup';
import { ResolvedOrigin } from './types';
import { useFirecall } from '../useFirecall';
import { useHoseLineDraft } from '../useHoseLineDraft';
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
  const firecall = useFirecall();
  const { proposeDrafts } = useHoseLineDraft();

  const interactionsRef = useRef<AiInteraction[]>([]);
  /** Treffer der letzten Umkreissuche, siehe `ToolHandlerDeps` */
  const waterSupplyResultsRef = useRef<WaterSupplyCandidate[]>([]);
  const chatHistoryRef = useRef<Content[]>([]);
  const lastActivityRef = useRef<number>(0);
  
  const [lastCreatedItem, setLastCreatedItem] = useState<{ id: string; type: string } | null>(null);
  const [processingStatus, setProcessingStatus] = useState<AiProcessingStatus>('idle');

  const cleanupHistory = useCallback(() => {
    const now = Date.now();
    // Reset complete history if last activity was more than 3 minutes ago
    if (now - lastActivityRef.current > MEMORY_TIMEOUT_MS) {
      console.info('[AI] Memory timeout reached, resetting history');
      chatHistoryRef.current = [];
      interactionsRef.current = [];
    }
    
    // Also limit the number of entries in the history to keep context window small
    if (chatHistoryRef.current.length > MAX_INTERACTIONS * 2) {
      chatHistoryRef.current = chatHistoryRef.current.slice(-MAX_INTERACTIONS * 2);
    }
    
    lastActivityRef.current = now;
  }, []);

  /**
   * Positionsangabe auflösen und dabei benennen, worauf sie tatsächlich
   * hinauslief. Die Bezeichnung ist kein Beiwerk: Fällt eine Angabe auf die
   * Kartenmitte zurück, weil weder Standort noch Einsatzort gesetzt sind, muss
   * die Antwort das sagen — sonst wundert man sich, warum die Leitungen
   * irgendwo im Nirgendwo beginnen.
   */
  const resolveOrigin = useCallback(
    async (
      positionSpec: { type: string; itemName?: string; address?: string; lat?: number; lng?: number } | undefined
    ): Promise<ResolvedOrigin> => {
      const center = map ? map.getCenter() : defaultPosition;
      const mapCenter: ResolvedOrigin = {
        lat: center.lat,
        lng: center.lng,
        type: 'mapCenter',
        label: 'der Kartenmitte',
      };

      const userPosition: ResolvedOrigin | undefined = isPositionSet
        ? { lat: position.lat, lng: position.lng, type: 'userPosition', label: 'deinem Standort' }
        : undefined;
      const einsatzort: ResolvedOrigin | undefined =
        firecall.lat && firecall.lng
          ? { lat: firecall.lat, lng: firecall.lng, type: 'einsatzort', label: 'dem Einsatzort' }
          : undefined;

      if (!positionSpec) return mapCenter;

      switch (positionSpec.type) {
        case 'mapCenter':
          return mapCenter;

        case 'auto':
          // Wer im Einsatz nach dem nächsten Hydranten fragt, meint fast immer
          // „von hier aus". Der Einsatzort ist die Näherung, wenn kein GPS
          // steht; die Kartenmitte erst, wenn auch der fehlt.
          return userPosition ?? einsatzort ?? mapCenter;

        case 'userPosition':
          return userPosition ?? einsatzort ?? mapCenter;

        case 'einsatzort':
          // Ein Einsatz ohne gesetzten Einsatzort ist in den ersten Minuten
          // der Normalfall.
          return einsatzort ?? userPosition ?? mapCenter;

        case 'atItem':
        case 'nearItem': {
          const target = findFirecallItemByName(existingItems, positionSpec.itemName);
          if (target?.lat && target?.lng) {
            // `nearItem` setzt daneben (zum Platzieren neuer Elemente),
            // `atItem` genau darauf (als Bezugspunkt einer Messung).
            const offset = positionSpec.type === 'nearItem' ? 20 / 111320 : 0;
            return {
              lat: target.lat + offset,
              lng: target.lng + offset,
              type: positionSpec.type,
              label: `"${target.name}"`,
            };
          }
          return mapCenter;
        }

        case 'address':
          if (positionSpec.address) {
            const results = await searchPlace(positionSpec.address, {
              position: new GeoPosition(center.lat, center.lng),
              maxResults: 1,
            });
            if (results[0]) {
              return {
                lat: parseFloat(results[0].lat),
                lng: parseFloat(results[0].lon),
                type: 'address',
                label: `"${positionSpec.address}"`,
              };
            }
          }
          return mapCenter;

        case 'coordinates':
          if (positionSpec.lat !== undefined && positionSpec.lng !== undefined) {
            return {
              lat: positionSpec.lat,
              lng: positionSpec.lng,
              type: 'coordinates',
              label: 'den angegebenen Koordinaten',
            };
          }
          return mapCenter;

        default:
          return mapCenter;
      }
    },
    [existingItems, firecall.lat, firecall.lng, isPositionSet, map, position]
  );

  const resolvePosition = useCallback(
    async (
      positionSpec: { type: string; itemName?: string; address?: string; lat?: number; lng?: number } | undefined
    ): Promise<{ lat: number; lng: number }> => {
      const { lat, lng } = await resolveOrigin(positionSpec);
      return { lat, lng };
    },
    [resolveOrigin]
  );

  const sendToGemini = useCallback(
    async (userParts: GenerateContentRequest['contents'][0]['parts']): Promise<AiAssistantResult> => {
      cleanupHistory();

      const context = buildAiContext({
        map,
        defaultPosition,
        existingItems,
        isPositionSet,
        position,
        interactions: interactionsRef.current,
      });

      // Prepare current session contents
      const currentContents: Content[] = [
        ...chatHistoryRef.current,
        {
          role: 'user',
          parts: [
            ...userParts,
            { text: `Aktueller Map-Kontext:\n${JSON.stringify(context, null, 2)}` },
          ],
        },
      ];

      console.info('[AI] Sending request with history length:', chatHistoryRef.current.length);
      console.info('[AI] User input:', userParts.map((p) => 'text' in p ? p.text : '[Data]'));

      setProcessingStatus('analyzing');
      
      let iterations = 0;
      const MAX_LOOP_ITERATIONS = 5;
      let lastResult: AiAssistantResult | null = null;
      // Der Entwurf überlebt die restlichen Schleifendurchläufe: Das Modell
      // antwortet nach dem Tool-Call noch mit Text, und erst diese Antwort
      // erreicht die Oberfläche.
      let pendingDrafts: HoseLineDraft[] | undefined;

      try {
        while (iterations < MAX_LOOP_ITERATIONS) {
          iterations++;
          
          const request: GenerateContentRequest = {
            systemInstruction: AI_SYSTEM_PROMPT,
            contents: currentContents,
            tools: [{ functionDeclarations: AI_TOOL_DECLARATIONS }],
            toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
          };

          const result = await geminiModel.generateContent(request);
          const response = result.response;
          
          if (!response.candidates || response.candidates.length === 0) {
            throw new Error('No candidates returned from AI model');
          }

          const candidate = response.candidates[0];
          const modelContent = candidate.content;
          
          if (!modelContent) {
            throw new Error('Candidate content is missing');
          }

          // Add model's response to session
          currentContents.push(modelContent);

          const functionCalls = response.functionCalls();
          let responseText = '';
          try { responseText = response.text?.() || ''; } catch { /* ignore */ }

          if (responseText) {
            console.info('[AI] Model response text:', responseText);
          }
          if (functionCalls && functionCalls.length > 0) {
            console.info('[AI] Model function calls:', functionCalls.map(fc => ({ name: fc.name, args: fc.args })));
          }

          if (!functionCalls || functionCalls.length === 0) {
            // No more function calls, we are done
            const text = responseText;
            
            // SAVE current session back to persistent history ref
            chatHistoryRef.current = currentContents;
            
            setProcessingStatus('idle');
            console.info('[AI] Interaction complete. Final message:', text || 'Aktion ausgeführt');
            return { 
              success: true, 
              message: text || lastResult?.message || 'Aktion ausgeführt',
              isAnswer: !!text,
              createdItemId: lastResult?.createdItemId,
              drafts: pendingDrafts,
            };
          }

          // Execute function calls
          const toolDeps = {
            resolvePosition,
            addFirecallItem,
            updateFirecallItem,
            existingItems,
            lastCreatedItem,
            setLastCreatedItem,
            map,
            defaultPosition,
            resolveOrigin,
            findWaterSupply: queryClusters,
            waterSupplyResults: waterSupplyResultsRef,
            proposeHoseLineDrafts: proposeDrafts,
          };

          setProcessingStatus('executing');
          const functionResponseParts = [];

          for (const fc of functionCalls) {
            console.info(`[AI] Executing tool: ${fc.name}`, fc.args);
            const execResult = await executeToolCall(fc, toolDeps);
            console.info(`[AI] Tool result (${fc.name}):`, { success: execResult.success, message: execResult.message });
            
            if (execResult.success) {
              interactionsRef.current.push({
                timestamp: Date.now(),
                action: fc.name,
                createdItemId: execResult.createdItemId,
                createdItemType: fc.name.replace('create', '').toLowerCase(),
              });
            }

            functionResponseParts.push({
              functionResponse: {
                name: fc.name,
                response: { result: execResult }
              }
            });
            lastResult = execResult;
            if (execResult.drafts) {
              pendingDrafts = execResult.drafts;
            }
          }

          // Add function responses to history and continue loop
          currentContents.push({ role: 'function', parts: functionResponseParts });
          setProcessingStatus('analyzing');
        }

        setProcessingStatus('idle');
        console.warn('[AI] Max loop iterations reached');
        // Ein erreichtes Limit heißt nicht, dass nichts herausgekommen ist:
        // Meist steht die Antwort schon im letzten Werkzeugergebnis, und das
        // wegzuwerfen wäre für den Benutzer ein Fehlschlag ohne Grund.
        if (lastResult?.success) {
          return { ...lastResult, isAnswer: true, drafts: pendingDrafts };
        }
        return { success: false, message: 'Zu viele Verarbeitungsschritte' };
      } catch (error) {
        console.error('[AI] Processing error:', error);
        setProcessingStatus('idle');
        return { success: false, message: 'Fehler bei der Verarbeitung' };
      }
    },
    [cleanupHistory, existingItems, isPositionSet, map, position, resolvePosition, addFirecallItem, updateFirecallItem, lastCreatedItem, proposeDrafts, resolveOrigin]
  );

  const transcribeAudio = useCallback(
    async (audioBase64: string): Promise<string | null> => {
      console.info('[AI] Transcribing audio...');
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
      console.info('[AI] Transcription result:', text);
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
        console.error('[AI] Audio process error:', error);
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

    console.info('[AI] Undoing last action:', lastCreatedItem);
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
