# SYBOS Personal Auto-Check Design

## Zusammenfassung

Das Chrome Extension Content Script wird erweitert, um auf der SYBOS Personal-Seite automatisch die Checkboxen derjenigen Personen zu setzen, die als CrewAssignments im aktiven Einsatz der Einsatzkarte hinterlegt sind.

## Hintergrund

- SYBOS (sybos.lfv-bgld.at) ist das Verwaltungssystem des LFV Burgenland
- Auf der "Personal hinzufügen"-Seite gibt es eine Tabelle mit Checkboxen pro Person
- Die Einsatzkarte speichert CrewAssignments (Besatzungszuordnungen) in Firestore unter `call/{firecallId}/crew/`
- Ziel: Personal muss nicht manuell in SYBOS nachmarkiert werden, sondern wird automatisch anhand der Einsatzkarte-Daten gesetzt

## SYBOS DOM-Struktur

Jede Person in der SYBOS-Tabelle hat folgende Struktur:

```html
<div class="x-grid3-cell-inner x-grid3-col-selected">
  <input name="BListMulti[]" value="1406" type="hidden">
  <input name="selected[1406]" id="selected_tbl[]" value="1406" type="checkbox" class="checkbox">
  <input type="hidden" name="name_tbl[1406]" value="1406">
  <input type="hidden" name="name_tbl[deleted[1406]]" value="Böhm Herbert">
  <!-- Link + Icon für Personendetails -->
</div>
```

Relevante Selektoren:
- **Checkbox:** `input[type="checkbox"][name^="selected["]`
- **Name:** `input[type="hidden"][name^="name_tbl[deleted["]` → `value` enthält den Namen (Format: "Nachname Vorname")
- **ID:** Die Zahl in `name="selected[ID]"` ist die SYBOS-Personen-ID

## Architektur

### 1. Service Worker: neuer Message Handler `GET_CREW_ASSIGNMENTS`

Der Service Worker bekommt einen neuen Handler, der die Firestore-Collection `call/{firecallId}/crew` abfragt und alle CrewAssignment-Dokumente zurückgibt.

```typescript
type MessageRequest =
  | ...
  | { type: 'GET_CREW_ASSIGNMENTS' };

case 'GET_CREW_ASSIGNMENTS': {
  // Liest selectedFirecallId aus chrome.storage.local
  // Fragt Firestore collection call/{id}/crew ab
  // Gibt Array von { name, recipientId, vehicleId, funktion } zurück
}
```

Benötigt zusätzlichen Firestore-Import: `collection`, `getDocs` (bisher nur `doc`, `getDoc`).

### 2. Content Script: Seitenerkennung + Auto-Check

**Seitenerkennung:** Das Script prüft, ob `input[type="hidden"][name^="name_tbl[deleted["]` Elemente auf der Seite existieren. Nur dann wird die Personal-Funktionalität aktiviert.

**SYBOS-Tabelle parsen:**
```typescript
function parseSybosPersonTable(): Map<string, HTMLInputElement> {
  // Findet alle name_tbl[deleted[...]] inputs
  // Extrahiert Name + zugehörige Checkbox
  // Gibt Map<normalizedName, checkboxElement> zurück
}
```

**Name-Matching:**
```typescript
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Diakritik entfernen
}

function findMatch(ekName: string, sybosNames: Map<string, HTMLInputElement>): HTMLInputElement | null {
  const normalized = normalizeName(ekName);
  // 1. Exact match (nach Normalisierung)
  if (sybosNames.has(normalized)) return sybosNames.get(normalized);
  // 2. Reversed ("Vorname Nachname" ↔ "Nachname Vorname")
  const reversed = normalized.split(' ').reverse().join(' ');
  if (sybosNames.has(reversed)) return sybosNames.get(reversed);
  // 3. Enthaltensein (Substring-Match)
  for (const [sybosName, checkbox] of sybosNames) {
    if (sybosName.includes(normalized) || normalized.includes(sybosName)) return checkbox;
  }
  return null;
}
```

**Auto-Check Ablauf:**
1. Panel wird geöffnet → `loadFirecall()` lädt Einsatzdaten
2. Wenn Personal-Tabelle erkannt → `loadCrewAndMatch()` wird aufgerufen
3. CrewAssignments vom Service Worker laden
4. SYBOS-Tabelle parsen
5. Für jedes CrewAssignment: Match suchen, Checkbox setzen
6. Ergebnis im Panel anzeigen: "X/Y Personen markiert"
7. Nicht gefundene Namen auflisten

### 3. CSS Fix: z-index

Der z-index wird auf `2147483647` (max int32) erhöht, um sicherzustellen, dass das Widget über allen SYBOS-Elementen liegt.

### 4. Panel UI-Erweiterung

Wenn eine Personal-Tabelle erkannt wird, zeigt das Panel zusätzlich:
- "Personal markieren"-Button
- Nach Ausführung: Ergebnis-Anzeige
  - Grün: "5 Personen markiert" mit Namen
  - Rot: "2 nicht gefunden" mit Namen

## Datenfluss

```
Content Script                  Service Worker              Firestore
     |                                |                         |
     |-- GET_CREW_ASSIGNMENTS ------->|                         |
     |                                |-- getDocs(crew) ------->|
     |                                |<-- crew documents ------|
     |<-- [{name, ...}] --------------|                         |
     |                                                          |
     |-- parseSybosPersonTable()                                |
     |-- findMatch() für jedes Assignment                       |
     |-- checkbox.checked = true                                |
     |-- Ergebnis im Panel anzeigen                             |
```

## Sicherheit

- Content Script nutzt nur DOM-Reads (querySelector) und setzt nur `checked`-Property
- Kein innerHTML, kein eval, kein Script-Injection
- Name-Matching ist read-only gegenüber SYBOS — es werden keine Formulare abgeschickt
- User muss das Formular in SYBOS selbst speichern

## Edge Cases

- **Keine CrewAssignments:** Panel zeigt "Keine Besatzung im aktiven Einsatz"
- **Keine SYBOS-Tabelle:** Personal-Feature wird nicht angezeigt
- **Partial Match:** Ergebnis zeigt klar an, wer gefunden wurde und wer nicht
- **Bereits gesetzte Checkboxen:** Werden nicht doppelt gesetzt (prüfe `checkbox.checked` vorher)
