# Fahrzeug-Chips auf der Einsatz-Detailseite

## Zusammenfassung

Fahrzeuge sollen direkt auf der Einsatz-Detailseite über Chips hinzugefügt werden können, ohne den Umweg über die Karte. Das CrewAssignmentBoard wird immer angezeigt (nicht nur bei BlaulichtSMS-Alarm).

## Änderungen

### 1. EinsatzDetails.tsx

- Bedingung `firecall.blaulichtSmsAlarmId &&` um das CrewAssignmentBoard entfernen
- Board wird immer gerendert wenn ein Einsatz existiert

### 2. CrewAssignmentBoard.tsx

- `VehicleQuickAddChips` über dem Kanban-Board/der mobilen Tabelle einbinden
- `useFirecallItemAdd()` für das sofortige Anlegen von Fahrzeugen
- `existingNames` aus `useVehicles()` (bereits vorhanden)
- Kein selected-Zwischenzustand — Klick = sofort anlegen
- Position: `lat`/`lng` vom Einsatz (`useFirecallSelect()`)
- DEFAULT_VEHICLES liefert `name`, `fw`, `rateId`

### Datenfluss

```
VehicleQuickAddChips (onToggle)
  → addFirecallItem({ type: 'vehicle', name, fw, lat: firecall.lat, lng: firecall.lng })
  → Firestore: call/{firecallId}/item/{docId}
  → useVehicles() Realtime-Listener reagiert
  → Neue Spalte im Kanban-Board + Fahrzeug auf Karte am Einsatzort
```
