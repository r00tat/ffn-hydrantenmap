# AI Voice Assistant for Einsatzkarte

**Date:** 2026-01-23
**Status:** Design

## Overview

Add a voice-powered AI assistant to the map that can create markers, diary entries, and other firecall items via push-to-talk interaction. The assistant uses Gemini's multimodal capabilities to process audio directly and execute actions via function calling.

## User Experience

### Interaction Flow

1. User holds the AI button (bottom-left of map)
2. Audio is recorded via MediaRecorder API
3. User releases button
4. Audio is sent to Gemini as multimodal content along with map context
5. Gemini processes speech and returns function calls
6. Functions are executed, items created/updated
7. Toast shows result with undo button (5 seconds)
8. On error/clarification: toast + spoken audio feedback

### Button States

| State | Visual | Behavior |
|-------|--------|----------|
| Idle | Grey mic icon | Ready for input |
| Recording | Red pulsing | Capturing audio |
| Processing | Spinner | Waiting for Gemini |
| Error | Red flash | Returns to idle |

### Button Placement

Bottom-left corner, above the existing RecordButton (GPS track recording).

```
┌──────────────────────────────────────┐
│                MAP                   │
│                                      │
│  ┌───┐                        ┌───┐  │
│  │🎤│ AI Assistant            │ + │  │
│  └───┘                        └───┘  │
│  ┌───┐                        ┌───┐  │
│  │⏺ │ Record Track            │✏️ │  │
│  └───┘                        └───┘  │
│  ┌───┐                               │
│  │🔍│ Search                         │
│  └───┘                               │
└──────────────────────────────────────┘
```

### Constraints

- Minimum hold time: 500ms (prevents accidental taps)
- Maximum recording: 30 seconds (auto-stops)
- Only available when in edit mode

## Supported Actions

### Item Creation

| Tool | Item Type | Key Parameters |
|------|-----------|----------------|
| `createMarker` | marker | name, zeichen, color, position |
| `createVehicle` | vehicle | name, fw, besatzung, ats, position |
| `createRohr` | rohr | name, art (C/B/Wasserwerfer), durchfluss |
| `createConnection` | connection | name, dimension, startPosition, endPosition |
| `createDiary` | diary | name, art (M/B/F), von, an, datum |
| `createGb` | gb | name, ausgehend, von, an |
| `createArea` | area | name, color, positions[] |
| `createCircle` | circle | name, radius, color, position |
| `createLine` | line | name, color, positions[] |
| `createEl` | el | name, position |
| `createAssp` | assp | name, position |

### Item Modification

| Tool | Purpose |
|------|---------|
| `updateItem` | Modify existing item (move, rename, recolor) |
| `deleteItem` | Remove an item |

### Context Tools

| Tool | Purpose |
|------|---------|
| `getExistingItems` | List current items for references |
| `geocodeAddress` | Convert address to coordinates |
| `getCurrentMapCenter` | Get current map view position |

## Position Resolution

Items can be placed at:

1. **Map center** (default) - when no position specified
2. **User GPS position** - "bei mir", "hier", "wo ich bin"
3. **Near existing item** - "neben dem TLFA", "beim EL Marker"
4. **Address** - "Hauptstraße 5" → geocoded via existing `searchPlace()`
5. **Explicit coordinates** - parsed from speech if given

### Position Resolution Flow

```
User mentions position?
       │
       ├─ No → Map center
       │
       ├─ "bei mir" / "hier" → User GPS (fallback: map center)
       │
       ├─ "neben X" / "beim X" → Find item, offset ~20m
       │
       ├─ Address string → searchPlace() → Coordinates
       │
       └─ Explicit coords → Use directly
```

## Context Provided to Gemini

Each request includes:

```typescript
interface AiContext {
  mapCenter: { lat: number; lng: number };
  mapBounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  zoomLevel: number;
  existingItems: Array<{
    id: string;
    type: string;
    name: string;
    lat?: number;
    lng?: number;
  }>;
  userPosition: { lat: number; lng: number } | null;
  currentLayer: string | null;
  recentInteractions: AiInteraction[];
}
```

## Short-Term Memory

The assistant remembers the last 3 interactions (or 60 seconds) to enable follow-ups.

### Memory Structure

```typescript
interface AiInteraction {
  timestamp: number;
  audioTranscript?: string;
  action: string;
  createdItemId?: string;
  createdItemType?: string;
}
```

### Follow-up Examples

| Command | Resolution |
|---------|------------|
| "Erstelle einen Marker" | Creates marker, stores ID |
| "Mach ihn rot" | Updates last item's color |
| "Verschieb ihn 10m nach Norden" | Updates last item's position |
| "Lösch ihn" | Deletes last referenced item |

### Memory Clearing

- Auto-clears after 60 seconds of inactivity
- Clears when user leaves edit mode
- Clears on "Vergiss alles" / "Neuer Kontext"

## Feedback System

### Toast Types

| Type | Duration | Audio | Visual |
|------|----------|-------|--------|
| Success | 5s | None | Green check + undo button |
| Clarification | Until dismissed | Spoken question | Amber + option buttons |
| Error | 5s | Spoken message | Red X icon |

### Audio Feedback

Uses Web Speech Synthesis API with `de-DE` locale:

```typescript
function speakError(message: string) {
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = 'de-DE';
  utterance.rate = 1.1;
  speechSynthesis.speak(utterance);
}
```

Spoken feedback for:
- "Ich habe dich nicht verstanden"
- "Welche Art Marker möchtest du erstellen?"
- "Adresse konnte nicht gefunden werden"

### Undo Mechanism

- Last created item ID stored in state
- "Rückgängig" button calls `deleteDoc()` on that item
- Available for ~5 seconds after creation
- Clears on next action or timeout

## Gemini Integration

### Request Structure

```typescript
const request: GenerateContentRequest = {
  systemInstruction: AI_ASSISTANT_SYSTEM_PROMPT,
  contents: [{
    role: 'user',
    parts: [
      { inlineData: { mimeType: 'audio/webm', data: audioBase64 } },
      { text: JSON.stringify(context) }
    ]
  }],
  tools: [{ functionDeclarations: AI_TOOLS }],
  toolConfig: { functionCallingConfig: { mode: 'AUTO' } }
};
```

### System Prompt

```
Du bist ein Einsatz-Assistent für die Freiwillige Feuerwehr.
Du hilfst beim Erstellen und Verwalten von Elementen auf der Einsatzkarte.

Regeln:
- Antworte kurz und präzise
- Führe Aktionen sofort aus, wenn der Befehl klar ist
- Bei Unklarheiten: stelle EINE konkrete Rückfrage
- Verwende die bereitgestellten Tools für alle Kartenaktionen
- Positionen ohne Angabe: verwende die Kartenmitte
- "bei mir" / "hier" = GPS-Position des Nutzers (wenn verfügbar)
- Referenzen wie "daneben", "neben dem X" = finde das Item und platziere in der Nähe

Verfügbare Elemente:
- marker: Taktische Zeichen, allgemeine Marker
- vehicle: Fahrzeuge (TLFA, KLF, etc.)
- rohr: Wasserabgabestellen (C-Rohr, B-Rohr, Wasserwerfer)
- connection: Schlauchleitungen
- diary: Einsatztagebuch-Einträge
- gb: Geschäftsbuch-Einträge
- area: Flächen/Zonen
- circle: Kreise mit Radius
- line: Linien/Wege
- el: Einsatzleitung-Marker
- assp: Atemschutzsammelplatz

Kontext wird mit jedem Request mitgeliefert.
```

## File Structure

### New Files

```
src/
├── components/
│   ├── Map/
│   │   ├── AiAssistantButton.tsx    # Push-to-talk FAB component
│   │   └── AiActionToast.tsx        # Feedback toast with undo/clarify
│   └── firebase/
│       └── aiTools.ts               # Gemini function declarations
├── hooks/
│   └── useAiAssistant.ts            # Recording, Gemini calls, execution
```

### Modified Files

```
src/
├── components/
│   ├── Map/
│   │   └── MapActionButtons.tsx     # Add AiAssistantButton
│   └── firebase/
│       └── vertexai.ts              # Add function calling support
```

## Dependencies

No new packages required:

- **MediaRecorder API** - Native browser API for audio recording
- **Web Speech Synthesis API** - Native browser API for text-to-speech
- **searchPlace()** - Existing Nominatim geocoding in `places.ts`
- **Firebase AI SDK** - Already configured in `vertexai.ts`

## Implementation Notes

### Audio Recording

```typescript
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus'
});
```

WebM/Opus is well-supported and efficient for speech.

### Function Call Execution

```typescript
const result = await geminiModel.generateContent(request);
const functionCalls = result.response.functionCalls();

for (const call of functionCalls) {
  switch (call.name) {
    case 'createMarker':
      const item = await addFirecallItem({ type: 'marker', ...call.args });
      setLastCreatedItem(item);
      showSuccessToast(`Marker "${call.args.name}" erstellt`);
      break;
    // ... other cases
  }
}
```

### Near-Item Positioning

```typescript
function positionNearItem(targetItem: FirecallItem, offset = 20): LatLng {
  const metersToLat = offset / 111320;
  const metersToLng = offset / (111320 * Math.cos(targetItem.lat * Math.PI / 180));

  return {
    lat: targetItem.lat + metersToLat,
    lng: targetItem.lng + metersToLng
  };
}
```

## Out of Scope

- Multi-point item creation via voice (connections, areas) - requires interactive drawing
- Image/photo analysis from voice commands
- Offline voice processing
- Custom wake word ("Hey Einsatzkarte")

## Future Enhancements

- Voice feedback for successful actions (optional setting)
- Custom quick commands ("Standardmarker" → predefined marker type)
- Voice-triggered history playback
- Integration with vehicle tracking for automatic positioning
