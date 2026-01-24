# Sidebar Diary Preview Design

## Overview

Add a collapsible section at the bottom of the MapSidebar showing the 5 newest manual diary entries (Einsatztagebuch), with inline expansion for details and a "Mehr" link to the full page.

## Requirements

- Show only manual diary entries (`type: 'diary'`), not vehicle events
- Display 5 newest entries, sorted by datum descending
- Collapsible accordion section, always visible in sidebar
- Each entry shows: art badge (M/B/F), time, name, von→an
- Clicking an entry expands it inline to show full details + edit/delete buttons
- "Mehr anzeigen" link navigates to `/tagebuch`

## Component Structure

### New Files

1. **`src/hooks/useDiaryEntries.ts`** - Thin wrapper around `useDiaries()`
2. **`src/components/Map/SidebarDiaryPreview.tsx`** - Main component

### Modified Files

1. **`src/components/Map/MapSidebar.tsx`** - Add `<SidebarDiaryPreview />` after `<SidebarAddItemPanel />`

## Visual Layout

### Collapsed Entry Row (~48px)

```
┌─────────────────────────────────────────┐
│ [M] 14:32  Einsatzleiter eingetroffen   │
│     Müller → Zentrale                   │
└─────────────────────────────────────────┘
```

- **Art badge**: Small chip with color coding (M=Meldung, B=Befehl, F=Frage)
- **Time**: HH:mm format from datum
- **Name**: Primary text, truncated with ellipsis
- **Von → An**: Secondary line in muted text (only if either exists)

### Expanded Entry View

```
┌─────────────────────────────────────────┐
│ [B] 14:28  Wasserversorgung aufbauen    │
│     Zentrale → Pumpe 1                  │
│                                         │
│  Beschreibung:                          │
│  Schlauchleitung von Hydrant zur        │
│  Einsatzstelle verlegen, 3 C-Rohre      │
│                                         │
│  Erledigt: 14:45                        │
│                                         │
│  [Bearbeiten]  [Löschen]                │
└─────────────────────────────────────────┘
```

- Full beschreibung visible
- Erledigt timestamp (only if set)
- Edit/Delete buttons (only if user has edit permission)

### Accordion Header

- Title: "Tagebuch" with badge showing total count, e.g., "Tagebuch (12)"
- Default state: expanded

### Footer

- "Mehr anzeigen →" link to `/tagebuch`
- Shown even when no entries exist

## Interaction

### Click Behavior

- Click entry row → expand inline to show details
- Click expanded entry or another entry → collapse
- Only one entry expanded at a time

### Buttons (Edit Permission Required)

- **Bearbeiten**: Opens `FirecallItemUpdateDialog`
- **Löschen**: Opens `DeleteFirecallItemDialog`

### State Persistence

- Accordion collapsed/expanded: localStorage (`sidebar-diary-collapsed`)
- Expanded entry: ephemeral (resets on reload)

### Empty State

- Show "Keine Einträge" in muted text
- Still show "Mehr anzeigen →" link

## Technical Details

### useDiaryEntries Hook

```tsx
export function useDiaryEntries(limit?: number) {
  const { diaries } = useDiaries(false); // newest first
  const diaryOnly = diaries.filter(d => d.editable); // editable = true for manual entries
  return {
    entries: limit ? diaryOnly.slice(0, limit) : diaryOnly,
    totalCount: diaryOnly.length,
  };
}
```

### Dependencies

- Reuses: `FirecallItemUpdateDialog`, `DeleteFirecallItemDialog`, `useMapEditorCanEdit`
- MUI components: `Accordion`, `AccordionSummary`, `AccordionDetails`, `Chip`, `IconButton`

## Art Badge Colors

| Art | Label   | Color suggestion |
|-----|---------|------------------|
| M   | Meldung | default/grey     |
| B   | Befehl  | primary/blue     |
| F   | Frage   | warning/orange   |
