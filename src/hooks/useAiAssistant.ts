import { useCallback, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import { GenerateContentRequest, FunctionCall } from 'firebase/ai';
import { geminiModel } from '../components/firebase/vertexai';
import { AI_SYSTEM_PROMPT, AI_TOOL_DECLARATIONS } from '../components/firebase/aiTools';
import { FirecallItem } from '../components/firebase/firestore';
import { usePositionContext } from '../components/Map/Position';
import { searchPlace } from '../components/actions/maps/places';
import { GeoPosition } from '../common/geo';
import useFirecallItemAdd from './useFirecallItemAdd';
import useFirecallItemUpdate from './useFirecallItemUpdate';

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
}

interface AiContext {
  mapCenter: { lat: number; lng: number };
  mapBounds: { north: number; south: number; east: number; west: number };
  zoomLevel: number;
  existingItems: Array<{ id: string; type: string; name: string; lat?: number; lng?: number }>;
  userPosition: { lat: number; lng: number } | null;
  recentInteractions: AiInteraction[];
}

const MEMORY_TIMEOUT_MS = 60000; // 60 seconds
const MAX_INTERACTIONS = 3;

export default function useAiAssistant(existingItems: FirecallItem[]) {
  const map = useMap();
  const [position, isPositionSet] = usePositionContext();
  const addFirecallItem = useFirecallItemAdd();
  const updateFirecallItem = useFirecallItemUpdate();
  const interactionsRef = useRef<AiInteraction[]>([]);
  const [lastCreatedItem, setLastCreatedItem] = useState<{ id: string; type: string } | null>(null);

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
      const center = map.getCenter();
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
              // Offset ~20m southeast
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

  const executeFunctionCall = useCallback(
    async (call: FunctionCall): Promise<AiAssistantResult> => {
      const args = call.args as Record<string, unknown>;

      switch (call.name) {
        case 'createMarker': {
          const pos = await resolvePosition(args.position as any);
          const ref = await addFirecallItem({
            type: 'marker',
            name: (args.name as string) || 'Marker',
            beschreibung: args.beschreibung as string,
            zeichen: args.zeichen as string,
            color: args.color as string,
            ...pos,
          } as FirecallItem);
          setLastCreatedItem({ id: ref.id, type: 'marker' });
          return { success: true, message: `Marker "${args.name}" erstellt`, createdItemId: ref.id };
        }

        case 'createVehicle': {
          const pos = await resolvePosition(args.position as any);
          const ref = await addFirecallItem({
            type: 'vehicle',
            name: (args.name as string) || 'Fahrzeug',
            fw: args.fw as string,
            besatzung: args.besatzung as string,
            ats: args.ats as number,
            alarmierung: args.alarmierung as string,
            eintreffen: args.eintreffen as string,
            ...pos,
          } as FirecallItem);
          setLastCreatedItem({ id: ref.id, type: 'vehicle' });
          return { success: true, message: `Fahrzeug "${args.name}" erstellt`, createdItemId: ref.id };
        }

        case 'createRohr': {
          const pos = await resolvePosition(args.position as any);
          const ref = await addFirecallItem({
            type: 'rohr',
            name: (args.name as string) || 'Rohr',
            art: (args.art as string) || 'C',
            durchfluss: args.durchfluss as number,
            ...pos,
          } as FirecallItem);
          setLastCreatedItem({ id: ref.id, type: 'rohr' });
          return { success: true, message: `${args.art}-Rohr "${args.name}" erstellt`, createdItemId: ref.id };
        }

        case 'createDiary': {
          const ref = await addFirecallItem({
            type: 'diary',
            name: (args.name as string) || 'Eintrag',
            art: args.art as 'M' | 'B' | 'F',
            von: args.von as string,
            an: args.an as string,
            datum: new Date().toISOString(),
          } as FirecallItem);
          setLastCreatedItem({ id: ref.id, type: 'diary' });
          return { success: true, message: `Tagebucheintrag erstellt`, createdItemId: ref.id };
        }

        case 'createGb': {
          const ref = await addFirecallItem({
            type: 'gb',
            name: (args.name as string) || 'Eintrag',
            ausgehend: args.ausgehend as boolean,
            von: args.von as string,
            an: args.an as string,
            datum: new Date().toISOString(),
          } as FirecallItem);
          setLastCreatedItem({ id: ref.id, type: 'gb' });
          return { success: true, message: `Geschäftsbucheintrag erstellt`, createdItemId: ref.id };
        }

        case 'createCircle': {
          const pos = await resolvePosition(args.position as any);
          const ref = await addFirecallItem({
            type: 'circle',
            name: (args.name as string) || 'Kreis',
            radius: (args.radius as number) || 50,
            color: args.color as string,
            ...pos,
          } as FirecallItem);
          setLastCreatedItem({ id: ref.id, type: 'circle' });
          return { success: true, message: `Kreis "${args.name}" erstellt`, createdItemId: ref.id };
        }

        case 'createEl': {
          const pos = await resolvePosition(args.position as any);
          const ref = await addFirecallItem({
            type: 'el',
            name: (args.name as string) || 'Einsatzleitung',
            ...pos,
          });
          setLastCreatedItem({ id: ref.id, type: 'el' });
          return { success: true, message: `Einsatzleitung "${args.name}" erstellt`, createdItemId: ref.id };
        }

        case 'createAssp': {
          const pos = await resolvePosition(args.position as any);
          const ref = await addFirecallItem({
            type: 'assp',
            name: (args.name as string) || 'ASSP',
            ...pos,
          });
          setLastCreatedItem({ id: ref.id, type: 'assp' });
          return { success: true, message: `ASSP "${args.name}" erstellt`, createdItemId: ref.id };
        }

        case 'updateItem': {
          const itemId = (args.itemId as string) || lastCreatedItem?.id;
          const itemName = args.itemName as string;
          const updates = args.updates as Record<string, unknown>;

          let targetItem: FirecallItem | undefined;
          if (itemId) {
            targetItem = existingItems.find((i) => i.id === itemId);
          } else if (itemName) {
            targetItem = existingItems.find((i) =>
              i.name?.toLowerCase().includes(itemName.toLowerCase())
            );
          } else if (lastCreatedItem) {
            targetItem = existingItems.find((i) => i.id === lastCreatedItem.id);
          }

          if (!targetItem) {
            return { success: false, message: 'Element nicht gefunden' };
          }

          const pos = updates.position ? await resolvePosition(updates.position as any) : {};
          const updatedItem: FirecallItem = {
            ...targetItem,
            ...pos,
          };
          if (updates.name) updatedItem.name = updates.name as string;
          if (updates.color) (updatedItem as any).color = updates.color as string;
          if (updates.beschreibung) updatedItem.beschreibung = updates.beschreibung as string;
          await updateFirecallItem(updatedItem);
          return { success: true, message: `"${targetItem.name}" aktualisiert` };
        }

        case 'deleteItem': {
          const itemId = (args.itemId as string) || lastCreatedItem?.id;
          const itemName = args.itemName as string;

          let targetItem: FirecallItem | undefined;
          if (itemId) {
            targetItem = existingItems.find((i) => i.id === itemId);
          } else if (itemName) {
            targetItem = existingItems.find((i) =>
              i.name?.toLowerCase().includes(itemName.toLowerCase())
            );
          } else if (lastCreatedItem) {
            targetItem = existingItems.find((i) => i.id === lastCreatedItem.id);
          }

          if (!targetItem) {
            return { success: false, message: 'Element nicht gefunden' };
          }

          await updateFirecallItem({ ...targetItem, deleted: true });
          if (lastCreatedItem?.id === targetItem.id) {
            setLastCreatedItem(null);
          }
          return { success: true, message: `"${targetItem.name}" gelöscht` };
        }

        case 'askClarification':
          return {
            success: false,
            message: args.question as string,
            clarification: {
              question: args.question as string,
              options: args.options as string[],
            },
          };

        default:
          return { success: false, message: `Unbekannte Aktion: ${call.name}` };
      }
    },
    [addFirecallItem, existingItems, lastCreatedItem, resolvePosition, updateFirecallItem]
  );

  const processAudio = useCallback(
    async (audioBase64: string): Promise<AiAssistantResult> => {
      cleanupOldInteractions();

      const bounds = map.getBounds();
      const center = map.getCenter();

      const context: AiContext = {
        mapCenter: { lat: center.lat, lng: center.lng },
        mapBounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        },
        zoomLevel: map.getZoom(),
        existingItems: existingItems
          .filter((i) => !i.deleted)
          .map((i) => ({ id: i.id!, type: i.type, name: i.name, lat: i.lat, lng: i.lng })),
        userPosition: isPositionSet ? { lat: position.lat, lng: position.lng } : null,
        recentInteractions: interactionsRef.current,
      };

      const request: GenerateContentRequest = {
        systemInstruction: AI_SYSTEM_PROMPT,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'audio/webm', data: audioBase64 } },
              { text: `Kontext:\n${JSON.stringify(context, null, 2)}` },
            ],
          },
        ],
        tools: [{ functionDeclarations: AI_TOOL_DECLARATIONS }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      };

      try {
        const result = await geminiModel.generateContent(request);
        const functionCalls = result.response.functionCalls();

        if (functionCalls && functionCalls.length > 0) {
          // Execute the first function call
          const execResult = await executeFunctionCall(functionCalls[0]);

          // Record interaction
          if (execResult.success) {
            interactionsRef.current.push({
              timestamp: Date.now(),
              action: functionCalls[0].name,
              createdItemId: execResult.createdItemId,
              createdItemType: functionCalls[0].name.replace('create', '').toLowerCase(),
            });
          }

          return execResult;
        }

        // No function calls - Gemini just responded with text
        const text = result.response.text();
        return { success: false, message: text || 'Keine Aktion erkannt' };
      } catch (error) {
        console.error('AI processing error:', error);
        return { success: false, message: 'Fehler bei der Verarbeitung' };
      }
    },
    [cleanupOldInteractions, executeFunctionCall, existingItems, isPositionSet, map, position]
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
    undoLastAction,
    lastCreatedItem,
  };
}
