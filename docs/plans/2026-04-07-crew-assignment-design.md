# Besatzungszuordnung: BlaulichtSMS-Personen auf Fahrzeuge

## Zusammenfassung

Feature zur Zuordnung von Personen (BlaulichtSMS-Zusagen) zu Fahrzeugen auf der Einsatz-Detail-Seite. Unterstützt Drag & Drop (Desktop) und Select-basierte Zuordnung (Mobile). Jede Person bekommt eine Funktion zugewiesen.

## Datenmodell

### Neue Firestore Subcollection: `call/{firecallId}/crew`

```typescript
interface CrewAssignment {
  id?: string;
  recipientId: string;       // BlaulichtSMS recipient.id
  name: string;              // Personenname (aus BlaulichtSMS)
  vehicleId: string | null;  // Referenz auf FirecallItem (null = nicht zugeordnet)
  vehicleName: string;       // Denormalisiert für Anzeige
  funktion: CrewFunktion;    // Rolle im Fahrzeug
  updatedAt?: string;
  updatedBy?: string;
}

type CrewFunktion =
  | 'Feuerwehrmann'
  | 'Maschinist'
  | 'Gruppenkommandant'
  | 'Atemschutzträger'
  | 'Zugskommandant'
  | 'Einsatzleiter';
```

### Funktionen (Rollen)

| Funktion           | Default |
|--------------------|---------|
| Feuerwehrmann      | ja      |
| Maschinist         |         |
| Gruppenkommandant  |         |
| Atemschutzträger   |         |
| Zugskommandant     |         |
| Einsatzleiter      |         |

## UI-Design

### Platzierung

Neuer Abschnitt **"Besatzung"** auf der EinsatzDetails-Seite (`/einsatz/{id}/details`), zwischen dem BlaulichtSMS-Block und den Einsatzorten. Nur sichtbar wenn ein BlaulichtSMS-Alarm verknüpft ist.

### Desktop (>= md Breakpoint) — Kanban-Board

- Horizontale Spalten nebeneinander (scrollbar bei vielen Fahrzeugen)
- **Erste Spalte "Verfügbar"**: Alle Personen ohne Fahrzeug-Zuordnung
- **Weitere Spalten pro Fahrzeug**: Zugeordnete Personen
- Jede Person als MUI Card mit:
  - Name
  - Funktions-Select (Dropdown)
- **Drag & Drop** zwischen Spalten via `@dnd-kit/core`
- **Fallback**: Select-Dropdown auf jeder Person-Card zum Fahrzeug wählen

### Mobile (< md Breakpoint) — Akkordeon

- "Verfügbar"-Sektion oben (ausgeklappt)
- Darunter: Collapse/Akkordeon pro Fahrzeug
- Zugeordnete Personen als Liste in jeder Sektion
- Zuordnung via Fahrzeug-Select auf jeder Person
- Funktions-Select inline
- Kein Drag & Drop auf Mobile

## Interaktionsflow

1. Einsatz hat einen verknüpften BlaulichtSMS-Alarm (`blaulichtSmsAlarmId`)
2. Beim ersten Öffnen: Alle Personen mit `participation: 'yes'` werden aus dem Alarm geladen
3. Für neue Personen (noch kein `crew`-Dokument) wird ein Dokument mit `vehicleId: null` erstellt
4. User zieht Person auf Fahrzeug (Desktop) oder wählt Fahrzeug per Select (Mobile)
5. Firestore-Dokument in `crew` Subcollection wird aktualisiert
6. Änderungen sind sofort für alle User sichtbar (Firestore Realtime Listener)

## Datenquellen

- **Personen**: BlaulichtSMS API (via `getBlaulichtSmsAlarms()`) — nur `participation: 'yes'`
- **Fahrzeuge**: Firestore `call/{firecallId}/item` mit `type: 'vehicle'` (via `useVehicles()` Hook)

## Technische Entscheidungen

- **Drag & Drop Library**: `@dnd-kit/core` — leichtgewichtig, React-nativ, gute Accessibility
- **Persistenz**: Firestore Subcollection für Echtzeit-Sync zwischen Benutzern
- **Denormalisierung**: `vehicleName` auf dem Crew-Dokument für schnelle Anzeige ohne Vehicle-Lookup
- **Responsive**: MUI Breakpoints (`useMediaQuery`) für Desktop/Mobile Switch
