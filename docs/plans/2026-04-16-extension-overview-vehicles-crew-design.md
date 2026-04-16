# Chrome Extension: Fahrzeuge & Mannschaft in Übersicht

## Zusammenfassung

Die Übersichtsseite (Popup) der Chrome Extension zeigt aktuell nur den Einsatz-Namen, Status, Beschreibung, Datum und eine Fahrzeug-Anzahl. Ziel ist es, Fahrzeuge mit zugeordneter Mannschaft gruppiert darzustellen und den Einsatz-Titel als Link zur Detailseite der Hauptapp zu machen.

## Design

### 1. Einsatz-Titel als Link

Der Firecall-Name wird ein klickbarer Link, der `chrome.tabs.create` nutzt um `https://einsatz.ffnd.at/einsatz/{firecallId}/details` in einem neuen Tab zu öffnen.

### 2. Neuer Hook: `useCrewAssignments`

- Datei: `chrome-extension/src/popup/hooks/useCrewAssignments.ts`
- Analog zu `useFirecallItems` — `onSnapshot` auf `call/{firecallId}/crew`
- Gibt `{ crew: CrewAssignment[], loading: boolean }` zurück

### 3. Type-Exports erweitern

`chrome-extension/src/shared/types.ts` exportiert zusätzlich `CrewAssignment`, `funktionAbkuerzung` und die `FIRECALL_CREW_COLLECTION_ID` Konstante aus der Hauptapp.

### 4. Erweiterte `FirecallOverview`

**Kopfbereich** (wie bisher, aber Name als Link):
- Firecall-Name → klickbar, öffnet Detailseite
- Status-Chip (Aktiv/Beendet)
- Beschreibung, Datum

**Fahrzeuge mit Mannschaft** (neu, nach dem Divider):
- Jedes Fahrzeug als Abschnitt: Name + FW in Fettschrift
- Darunter zugeordnete Crew-Mitglieder: Funktions-Abkürzung + Name
- Fahrzeuge ohne Crew werden trotzdem angezeigt
- Personen ohne Fahrzeug in einer "Ohne Fahrzeug"-Gruppe
- Wenn keine Fahrzeuge und keine Crew vorhanden: nichts zusätzliches anzeigen

### 5. Datenfluss

`App.tsx`:
- Ruft `useCrewAssignments(selectedFirecallId)` auf
- Gibt `crew`, `firecallId` als zusätzliche Props an `FirecallOverview`

## Dateien

| Datei | Aktion |
|---|---|
| `chrome-extension/src/shared/types.ts` | Erweitern: CrewAssignment, funktionAbkuerzung, FIRECALL_CREW_COLLECTION_ID exportieren |
| `chrome-extension/src/popup/hooks/useCrewAssignments.ts` | Neu: Firestore-Subscription auf crew subcollection |
| `chrome-extension/src/popup/components/FirecallOverview.tsx` | Erweitern: Link auf Titel, Fahrzeuge + Crew gruppiert anzeigen |
| `chrome-extension/src/popup/App.tsx` | Erweitern: useCrewAssignments einbinden, Props durchreichen |
