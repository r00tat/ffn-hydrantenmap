# AI Voice Assistant Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a push-to-talk AI button to the map that records voice commands and uses Gemini function calling to create/modify firecall items.

**Architecture:** MediaRecorder captures audio → Base64 encoding → Gemini multimodal request with function declarations → Execute returned function calls via existing hooks → Show toast feedback with undo.

**Tech Stack:** React 19, MUI 7, Firebase AI SDK (Gemini), MediaRecorder API, Web Speech Synthesis API

---

## Task 1: Create AI Tools Type Definitions

**Files:**
- Create: `src/components/firebase/aiTools.ts`

**Step 1: Create the aiTools.ts file with function declarations**

```typescript
import { FunctionDeclaration, SchemaType } from 'firebase/ai';

// Position schema used by multiple tools
const positionSchema = {
  type: SchemaType.OBJECT,
  properties: {
    type: {
      type: SchemaType.STRING,
      enum: ['mapCenter', 'userPosition', 'nearItem', 'address', 'coordinates'],
      description: 'How to resolve the position',
    },
    itemName: {
      type: SchemaType.STRING,
      description: 'Name of item to place near (for nearItem type)',
    },
    address: {
      type: SchemaType.STRING,
      description: 'Address to geocode (for address type)',
    },
    lat: { type: SchemaType.NUMBER, description: 'Latitude (for coordinates type)' },
    lng: { type: SchemaType.NUMBER, description: 'Longitude (for coordinates type)' },
  },
};

export const AI_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'createMarker',
    description: 'Create a marker/tactical sign on the map',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Name/label for the marker' },
        beschreibung: { type: SchemaType.STRING, description: 'Description' },
        zeichen: { type: SchemaType.STRING, description: 'Tactical sign identifier' },
        color: { type: SchemaType.STRING, description: 'Color in hex format' },
        position: positionSchema,
      },
      required: ['name'],
    },
  },
  {
    name: 'createVehicle',
    description: 'Add a fire vehicle to the map',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Vehicle name (e.g., TLFA 4000)' },
        fw: { type: SchemaType.STRING, description: 'Fire department name' },
        besatzung: { type: SchemaType.STRING, description: 'Crew count' },
        ats: { type: SchemaType.NUMBER, description: 'Number of breathing apparatus' },
        alarmierung: { type: SchemaType.STRING, description: 'Alert time' },
        eintreffen: { type: SchemaType.STRING, description: 'Arrival time' },
        position: positionSchema,
      },
      required: ['name'],
    },
  },
  {
    name: 'createRohr',
    description: 'Add a water discharge point (Rohr) to the map',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Name for the Rohr' },
        art: {
          type: SchemaType.STRING,
          enum: ['C', 'B', 'Wasserwerfer'],
          description: 'Type of Rohr',
        },
        durchfluss: { type: SchemaType.NUMBER, description: 'Flow rate in l/min' },
        position: positionSchema,
      },
      required: ['name', 'art'],
    },
  },
  {
    name: 'createDiary',
    description: 'Add an entry to the Einsatztagebuch (operational diary)',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Content of the diary entry' },
        art: {
          type: SchemaType.STRING,
          enum: ['M', 'B', 'F'],
          description: 'Type: M=Meldung, B=Befehl, F=Feststellung',
        },
        von: { type: SchemaType.STRING, description: 'From whom' },
        an: { type: SchemaType.STRING, description: 'To whom' },
      },
      required: ['name'],
    },
  },
  {
    name: 'createGb',
    description: 'Add an entry to the Geschäftsbuch',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Content of the entry' },
        ausgehend: { type: SchemaType.BOOLEAN, description: 'True if outgoing message' },
        von: { type: SchemaType.STRING, description: 'From whom' },
        an: { type: SchemaType.STRING, description: 'To whom' },
      },
      required: ['name'],
    },
  },
  {
    name: 'createCircle',
    description: 'Add a circle/radius marker to the map',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Name for the circle' },
        radius: { type: SchemaType.NUMBER, description: 'Radius in meters' },
        color: { type: SchemaType.STRING, description: 'Color in hex format' },
        position: positionSchema,
      },
      required: ['name', 'radius'],
    },
  },
  {
    name: 'createEl',
    description: 'Add an Einsatzleitung (command post) marker',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Name for the EL marker' },
        position: positionSchema,
      },
      required: ['name'],
    },
  },
  {
    name: 'createAssp',
    description: 'Add an Atemschutzsammelplatz marker',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Name for the ASSP marker' },
        position: positionSchema,
      },
      required: ['name'],
    },
  },
  {
    name: 'updateItem',
    description: 'Update an existing item on the map',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        itemId: { type: SchemaType.STRING, description: 'ID of the item to update' },
        itemName: { type: SchemaType.STRING, description: 'Name of the item to find and update' },
        updates: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING },
            color: { type: SchemaType.STRING },
            beschreibung: { type: SchemaType.STRING },
            position: positionSchema,
          },
        },
      },
      required: ['updates'],
    },
  },
  {
    name: 'deleteItem',
    description: 'Delete an item from the map',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        itemId: { type: SchemaType.STRING, description: 'ID of the item to delete' },
        itemName: { type: SchemaType.STRING, description: 'Name of the item to find and delete' },
      },
    },
  },
  {
    name: 'askClarification',
    description: 'Ask the user for clarification when the command is unclear',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        question: { type: SchemaType.STRING, description: 'Question to ask the user' },
        options: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: 'Available options for the user to choose from',
        },
      },
      required: ['question'],
    },
  },
];

export const AI_SYSTEM_PROMPT = `Du bist ein Einsatz-Assistent für die Freiwillige Feuerwehr.
Du hilfst beim Erstellen und Verwalten von Elementen auf der Einsatzkarte.

Regeln:
- Antworte kurz und präzise
- Führe Aktionen sofort aus, wenn der Befehl klar ist
- Bei Unklarheiten: verwende askClarification mit konkreten Optionen
- Verwende die bereitgestellten Tools für alle Kartenaktionen
- Positionen ohne Angabe: verwende mapCenter als position.type
- "bei mir" / "hier" = userPosition als position.type
- Referenzen wie "daneben", "neben dem X" = nearItem als position.type mit itemName

Verfügbare Elemente:
- marker: Taktische Zeichen, allgemeine Marker (createMarker)
- vehicle: Fahrzeuge wie TLFA, KLF, etc. (createVehicle)
- rohr: Wasserabgabestellen C-Rohr, B-Rohr, Wasserwerfer (createRohr)
- diary: Einsatztagebuch-Einträge (createDiary)
- gb: Geschäftsbuch-Einträge (createGb)
- circle: Kreise mit Radius (createCircle)
- el: Einsatzleitung-Marker (createEl)
- assp: Atemschutzsammelplatz (createAssp)

Für Referenzen auf bestehende Elemente nutze itemName oder itemId.
Der Kontext enthält existingItems mit allen aktuellen Elementen.`;
```

**Step 2: Verify file was created correctly**

Run: `head -50 src/components/firebase/aiTools.ts`

**Step 3: Commit**

```bash
git add src/components/firebase/aiTools.ts
git commit -m "feat: add Gemini AI tool declarations for voice assistant"
```

---

## Task 2: Create Audio Recording Hook

**Files:**
- Create: `src/hooks/useAudioRecorder.ts`

**Step 1: Create the audio recording hook**

```typescript
import { useCallback, useRef, useState } from 'react';

export type RecordingState = 'idle' | 'recording' | 'processing';

export interface AudioRecorderResult {
  state: RecordingState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  error: string | null;
}

export default function useAudioRecorder(): AudioRecorderResult {
  const [state, setState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setState('recording');
    } catch (err) {
      setError('Mikrofon konnte nicht gestartet werden');
      console.error('Failed to start recording:', err);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }

      mediaRecorder.onstop = async () => {
        setState('processing');

        // Stop all tracks
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        // Convert to base64
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = () => {
          setError('Audio konnte nicht verarbeitet werden');
          resolve(null);
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.stop();
    });
  }, []);

  return { state, startRecording, stopRecording, error };
}
```

**Step 2: Verify file was created**

Run: `head -30 src/hooks/useAudioRecorder.ts`

**Step 3: Commit**

```bash
git add src/hooks/useAudioRecorder.ts
git commit -m "feat: add audio recording hook for voice input"
```

---

## Task 3: Create AI Assistant Hook

**Files:**
- Create: `src/hooks/useAiAssistant.ts`

**Step 1: Create the AI assistant hook**

```typescript
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
          });
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
          });
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
          });
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
          });
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
          });
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
          });
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
          await updateFirecallItem({
            ...targetItem,
            ...(updates.name && { name: updates.name as string }),
            ...(updates.color && { color: updates.color as string }),
            ...(updates.beschreibung && { beschreibung: updates.beschreibung as string }),
            ...pos,
          });
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
```

**Step 2: Verify file was created**

Run: `wc -l src/hooks/useAiAssistant.ts`
Expected: ~280 lines

**Step 3: Commit**

```bash
git add src/hooks/useAiAssistant.ts
git commit -m "feat: add AI assistant hook with function call execution"
```

---

## Task 4: Create Speech Feedback Utility

**Files:**
- Create: `src/common/speech.ts`

**Step 1: Create speech utility**

```typescript
export function speakMessage(message: string): void {
  if (!('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported');
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = 'de-DE';
  utterance.rate = 1.1;
  utterance.pitch = 1.0;

  window.speechSynthesis.speak(utterance);
}

export function cancelSpeech(): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
```

**Step 2: Verify file**

Run: `cat src/common/speech.ts`

**Step 3: Commit**

```bash
git add src/common/speech.ts
git commit -m "feat: add speech synthesis utility for voice feedback"
```

---

## Task 5: Create AI Action Toast Component

**Files:**
- Create: `src/components/Map/AiActionToast.tsx`

**Step 1: Create the toast component**

```typescript
'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import { useCallback, useEffect } from 'react';
import { speakMessage } from '../../common/speech';

export interface AiToastState {
  open: boolean;
  message: string;
  severity: 'success' | 'warning' | 'error';
  showUndo?: boolean;
  clarificationOptions?: string[];
}

export interface AiActionToastProps {
  state: AiToastState;
  onClose: () => void;
  onUndo?: () => void;
  onClarificationSelect?: (option: string) => void;
}

export default function AiActionToast({
  state,
  onClose,
  onUndo,
  onClarificationSelect,
}: AiActionToastProps) {
  const { open, message, severity, showUndo, clarificationOptions } = state;

  // Speak error and warning messages
  useEffect(() => {
    if (open && (severity === 'error' || severity === 'warning')) {
      speakMessage(message);
    }
  }, [open, message, severity]);

  const handleClose = useCallback(
    (_event?: React.SyntheticEvent | Event, reason?: string) => {
      if (reason === 'clickaway') return;
      onClose();
    },
    [onClose]
  );

  const handleUndo = useCallback(() => {
    onUndo?.();
    onClose();
  }, [onClose, onUndo]);

  const handleOptionClick = useCallback(
    (option: string) => {
      onClarificationSelect?.(option);
      onClose();
    },
    [onClarificationSelect, onClose]
  );

  const autoHideDuration = clarificationOptions ? null : 5000;

  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        onClose={handleClose}
        severity={severity}
        variant="filled"
        sx={{ width: '100%' }}
        action={
          showUndo && !clarificationOptions ? (
            <Button color="inherit" size="small" onClick={handleUndo}>
              Rückgängig
            </Button>
          ) : undefined
        }
      >
        {message}
        {clarificationOptions && clarificationOptions.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            {clarificationOptions.map((option) => (
              <Button
                key={option}
                size="small"
                variant="outlined"
                color="inherit"
                onClick={() => handleOptionClick(option)}
              >
                {option}
              </Button>
            ))}
          </Stack>
        )}
      </Alert>
    </Snackbar>
  );
}
```

**Step 2: Verify file**

Run: `head -40 src/components/Map/AiActionToast.tsx`

**Step 3: Commit**

```bash
git add src/components/Map/AiActionToast.tsx
git commit -m "feat: add AI action toast component with undo support"
```

---

## Task 6: Create AI Assistant Button Component

**Files:**
- Create: `src/components/Map/AiAssistantButton.tsx`

**Step 1: Create the push-to-talk button component**

```typescript
'use client';

import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import { useCallback, useEffect, useRef, useState } from 'react';
import useAudioRecorder from '../../hooks/useAudioRecorder';
import useAiAssistant from '../../hooks/useAiAssistant';
import { FirecallItem } from '../firebase/firestore';
import AiActionToast, { AiToastState } from './AiActionToast';
import { speakMessage } from '../../common/speech';

interface AiAssistantButtonProps {
  firecallItems: FirecallItem[];
}

const MIN_HOLD_TIME_MS = 500;
const MAX_RECORDING_TIME_MS = 30000;

export default function AiAssistantButton({ firecallItems }: AiAssistantButtonProps) {
  const { state: recorderState, startRecording, stopRecording, error: recorderError } = useAudioRecorder();
  const { processAudio, undoLastAction } = useAiAssistant(firecallItems);

  const [toast, setToast] = useState<AiToastState>({
    open: false,
    message: '',
    severity: 'success',
  });

  const holdStartRef = useRef<number>(0);
  const maxRecordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Show recorder errors
  useEffect(() => {
    if (recorderError) {
      setToast({
        open: true,
        message: recorderError,
        severity: 'error',
      });
      speakMessage(recorderError);
    }
  }, [recorderError]);

  const handlePointerDown = useCallback(async () => {
    holdStartRef.current = Date.now();
    await startRecording();

    // Auto-stop after max recording time
    maxRecordingTimerRef.current = setTimeout(async () => {
      if (recorderState === 'recording') {
        const audio = await stopRecording();
        if (audio) {
          const result = await processAudio(audio);
          setToast({
            open: true,
            message: result.message,
            severity: result.success ? 'success' : result.clarification ? 'warning' : 'error',
            showUndo: result.success && !!result.createdItemId,
            clarificationOptions: result.clarification?.options,
          });
        }
      }
    }, MAX_RECORDING_TIME_MS);
  }, [processAudio, recorderState, startRecording, stopRecording]);

  const handlePointerUp = useCallback(async () => {
    // Clear max recording timer
    if (maxRecordingTimerRef.current) {
      clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }

    const holdDuration = Date.now() - holdStartRef.current;

    if (holdDuration < MIN_HOLD_TIME_MS) {
      // Too short - cancel recording without processing
      await stopRecording();
      setToast({
        open: true,
        message: 'Halte den Button länger gedrückt zum Sprechen',
        severity: 'warning',
      });
      return;
    }

    const audio = await stopRecording();
    if (!audio) return;

    const result = await processAudio(audio);
    setToast({
      open: true,
      message: result.message,
      severity: result.success ? 'success' : result.clarification ? 'warning' : 'error',
      showUndo: result.success && !!result.createdItemId,
      clarificationOptions: result.clarification?.options,
    });
  }, [processAudio, stopRecording]);

  const handleToastClose = useCallback(() => {
    setToast((prev) => ({ ...prev, open: false }));
  }, []);

  const handleUndo = useCallback(async () => {
    const success = await undoLastAction();
    if (success) {
      setToast({
        open: true,
        message: 'Rückgängig gemacht',
        severity: 'success',
      });
    }
  }, [undoLastAction]);

  const isRecording = recorderState === 'recording';
  const isProcessing = recorderState === 'processing';

  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          bottom: 148,
          left: 16,
        }}
      >
        <Tooltip title="KI-Assistent (halten zum Sprechen)">
          <Fab
            color={isRecording ? 'error' : 'default'}
            aria-label="AI assistant"
            size="small"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            disabled={isProcessing}
            sx={{
              animation: isRecording ? 'pulse 1s infinite' : 'none',
              '@keyframes pulse': {
                '0%': { boxShadow: '0 0 0 0 rgba(244, 67, 54, 0.4)' },
                '70%': { boxShadow: '0 0 0 10px rgba(244, 67, 54, 0)' },
                '100%': { boxShadow: '0 0 0 0 rgba(244, 67, 54, 0)' },
              },
            }}
          >
            {isProcessing ? (
              <CircularProgress size={24} color="inherit" />
            ) : isRecording ? (
              <MicOffIcon />
            ) : (
              <MicIcon />
            )}
          </Fab>
        </Tooltip>
      </Box>
      <AiActionToast
        state={toast}
        onClose={handleToastClose}
        onUndo={handleUndo}
      />
    </>
  );
}
```

**Step 2: Verify file**

Run: `wc -l src/components/Map/AiAssistantButton.tsx`
Expected: ~150 lines

**Step 3: Commit**

```bash
git add src/components/Map/AiAssistantButton.tsx
git commit -m "feat: add push-to-talk AI assistant button component"
```

---

## Task 7: Integrate AI Button into Map

**Files:**
- Modify: `src/components/Map/MapActionButtons.tsx`

**Step 1: Import the AI button and firecall items hook**

Add these imports at the top of the file (after existing imports):

```typescript
import AiAssistantButton from './AiAssistantButton';
import { useFirecallItems } from '../firebase/firestoreHooks';
```

**Step 2: Add the hook and component**

Inside the `MapActionButtons` function, add after the `useMapEditor` call:

```typescript
const firecallItems = useFirecallItems();
```

Then add the `AiAssistantButton` component inside the return statement, after `<AddFirecallItem />`:

```typescript
{editable && <AiAssistantButton firecallItems={firecallItems} />}
```

**Step 3: Verify changes**

Run: `grep -n "AiAssistantButton\|useFirecallItems" src/components/Map/MapActionButtons.tsx`
Expected: Should show import and usage lines

**Step 4: Commit**

```bash
git add src/components/Map/MapActionButtons.tsx
git commit -m "feat: integrate AI assistant button into map action buttons"
```

---

## Task 8: Update Gemini Model Configuration for Function Calling

**Files:**
- Modify: `src/components/firebase/vertexai.ts`

**Step 1: Export the tools configuration**

The existing `geminiModel` needs to support function calling. Add this export at the end of the file:

```typescript
export { GenerateContentRequest } from 'firebase/ai';
```

**Step 2: Verify the file already has necessary imports**

Run: `head -15 src/components/firebase/vertexai.ts`

The imports should include `GenerateContentRequest` which we use in the AI assistant hook.

**Step 3: Commit if changes were needed**

```bash
git add src/components/firebase/vertexai.ts
git commit -m "chore: export GenerateContentRequest type from vertexai"
```

---

## Task 9: Test the Integration

**Step 1: Start the development server**

Run: `npm run dev`

**Step 2: Manual testing checklist**

1. Navigate to the map page
2. Enable edit mode (pencil button)
3. Verify AI button appears bottom-left (above Record button)
4. Test push-to-talk:
   - Hold button briefly (<500ms) → Should show warning toast
   - Hold button and speak "Erstelle einen Marker namens Test" → Should create marker
   - Hold and speak "Mach ihn rot" → Should update marker color
   - Hold and speak "Lösch ihn" → Should delete marker
   - Test undo button on success toast
5. Test error handling:
   - Deny microphone permission → Should show error toast + speak
   - Speak unclear command → Should show clarification toast + speak

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete AI voice assistant integration

- Push-to-talk button on map (bottom-left)
- Voice commands processed by Gemini with function calling
- Supports creating markers, vehicles, diary entries, etc.
- Toast feedback with undo support
- Audio feedback on errors via speech synthesis
- Short-term memory for follow-up commands"
```

---

## Summary

**Files Created:**
- `src/components/firebase/aiTools.ts` - Gemini function declarations
- `src/hooks/useAudioRecorder.ts` - MediaRecorder wrapper
- `src/hooks/useAiAssistant.ts` - AI processing and function execution
- `src/common/speech.ts` - Speech synthesis utility
- `src/components/Map/AiActionToast.tsx` - Toast feedback component
- `src/components/Map/AiAssistantButton.tsx` - Push-to-talk button

**Files Modified:**
- `src/components/Map/MapActionButtons.tsx` - Added AI button integration
- `src/components/firebase/vertexai.ts` - Export type for function calling

**Total Commits:** 9
