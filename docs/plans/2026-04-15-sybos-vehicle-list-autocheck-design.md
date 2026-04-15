# SYBOS-Fahrzeugliste aus Einsatz markieren — Design

**Datum:** 2026-04-15
**Ziel:** Chrome-Extension soll Fahrzeuge auf einer SYBOS-Auswahlseite analog zum bestehenden „Personal markieren"-Feature automatisch anhaken, wenn sie im aktiven Einsatz (Firecall) zugewiesen sind.

## Kontext

Es gibt bereits zwei verwandte Features in der Chrome-Extension:

1. **Personal markieren** (`sybos.ts` → `matchAndCheckPersonnel`): Auf der SYBOS-Personalliste werden Checkboxen aller Personen angehakt, die in der aktiven Einsatz-Besatzung (`call/{id}/crew`) vorkommen.
2. **Fahrzeuge zuweisen** (`sybos.ts` → `matchAndAssignVehiclesInSybos`): Auf einem SYBOS-Crew-Formular werden pro Person Funktion und Fahrzeug via `<select>` aus den EK-Crew-Daten gesetzt.

Das neue Feature ist orthogonal: Es arbeitet auf einer **SYBOS-Fahrzeug-Auswahlliste** (ExtJS x-grid3-Tabelle mit Fahrzeugen der eigenen Feuerwehr). Der Nutzer will dort die Checkboxen jener Fahrzeuge anhaken lassen, die im aktiven Einsatz als `FirecallItem` mit `type: 'vehicle'` existieren.

## Page-Struktur der SYBOS-Fahrzeugliste

Relevante DOM-Struktur pro Fahrzeugzeile:

```html
<tr>
  <td><div class="x-grid3-col-deleted">
    <input type="hidden" name="BListMulti[]" value="2006">
    <input type="checkbox" name="deleted[2006]" id="selected_tbl[]" value="2006">
    <input type="hidden" name="name_tbl[2006]" value="2006">
    <input type="hidden" name="id_tbl[2006]" value="2006">
    <input type="hidden" name="name_tbl[deleted[2006]]" value="{GEbez}">
  </div></td>
  <td><div class="x-grid3-col-WAname">SRF</div></td>
  <td><div class="x-grid3-col-ABname">Neusiedl am See</div></td>
  <td><div class="x-grid3-col-WAinvnr">FW-102ND</div></td>
  <td><div class="x-grid3-col-WAGname1">Einsatzfahrzeuge</div></td>
  <td><div class="x-grid3-col-WAGname2">Schweres Rüstfahrzeug</div></td>
  <td><div class="x-grid3-col-WAGname3">SRF</div></td>
  <td><div class="x-grid3-col-WArufname">Rüst Neusiedl am See</div></td>
</tr>
```

**Wichtig:** Die Seite enthält denselben `name_tbl[deleted[ID]]`-Selektor wie die Personalseite, aber der Wert ist der Template-Platzhalter `{GEbez}` statt eines Namens. Die Checkbox heißt hier `deleted[ID]`, bei Personal `selected[ID]`.

## Architektur

### Neue Bausteine

| Datei | Rolle |
|-------|-------|
| `content/sybos-vehicle-list.ts` | Parser + `hasSybosVehicleList()` Detektor |
| `content/sybos-vehicle-list.test.ts` | Unit-Tests Parser |
| `content/vehicle-list-matching.ts` | `findMatchingVehicleListRow(ekName, rows)` |
| `content/vehicle-list-matching.test.ts` | Unit-Tests Matching |

### Änderungen

| Datei | Änderung |
|-------|---------|
| `content/sybos-table.ts` | `parseSybosPersonTable`/`hasSybosPersonTable` filtern `{GEbez}`-Zeilen aus |
| `content/sybos-table.test.ts` | Testcase für `{GEbez}`-Filter |
| `content/sybos.ts` | Neuer UI-Abschnitt „Fahrzeuge markieren" + Handler |
| `background/service-worker.ts` | Neuer Message-Typ `GET_FIRECALL_VEHICLES` |

## Datenmodell

### Parser-Output

```ts
interface SybosVehicleListRow {
  id: string;           // z.B. "2006"
  waname: string;       // z.B. "SRF"
  warufname: string;    // z.B. "Rüst Neusiedl am See" (leer möglich)
  checkbox: HTMLInputElement;
}
```

### Service-Worker-Payload

```ts
// Request
{ type: 'GET_FIRECALL_VEHICLES' }
// Response
{ vehicles: Array<{ id: string; name: string }> }  // aus call/{id}/item, type==='vehicle', !deleted
// bei Fehler: { error: string }
```

## Matching-Logik

`findMatchingVehicleListRow(ekName, rows)`:

1. Trim + lowercase des EK-Namens.
2. **Phase 1:** Erste Zeile, deren `waname.trim().toLowerCase() === normalized` → zurückgeben.
3. **Phase 2:** Erste Zeile, deren `warufname.trim().toLowerCase() === normalized` → zurückgeben.
4. Sonst `null`.

Kein Prefix-/Substring-Match, kein Fuzzy (EK-Namen sind frei eingegeben, Fehlmatches wären schlimmer als Nicht-Matches — User kann fehlende Treffer sehen und manuell anhaken).

## UI-Fluss

Analog zur Personal-Sektion:

```
if (hasSybosVehicleList()) {
  // Sektion "Fahrzeuge markieren" rendern
  // Button-Click:
  //   parseSybosVehicleList() → rows
  //   sendMessage GET_FIRECALL_VEHICLES → { vehicles }
  //   für jedes vehicle:
  //     row = findMatchingVehicleListRow(vehicle.name, rows)
  //     if row && !row.checkbox.checked:
  //       row.checkbox.checked = true
  //       dispatch change event
  //     push to matched[] oder notFound[]
  //   Anzeige "✓ N markiert" / "✗ M nicht gefunden"
}
```

## Fehlerverhalten

- Keine EK-Fahrzeuge → Status „Keine Fahrzeuge im Einsatz".
- EK-Fahrzeug hat keinen SYBOS-Match → in `notFound[]` listen.
- Checkbox bereits gesetzt → keine DOM-Änderung, aber als `matched` zählen (identisch Personal).
- Nur CHECKEN, nie UNCHECKEN — User kann manuell abhaken.

## Seitendetektion (Kollisionsvermeidung)

`hasSybosPersonTable()` würde ohne Anpassung auf der Fahrzeugseite `true` liefern (gleicher Hidden-Input-Selektor). Fix:

- `parseSybosPersonTable` filtert `nameInput.value === '{GEbez}'` aus.
- `hasSybosPersonTable` prüft zusätzlich, dass mindestens eine Zeile mit echtem Wert existiert.
- `hasSybosVehicleList` nutzt ein fahrzeugspezifisches Merkmal: `document.querySelector('.x-grid3-col-WAname')`.

Auf der Personalseite wird die Fahrzeugsektion also nicht angezeigt, auf der Fahrzeugseite nicht die Personalsektion.

## Testing (TDD-Reihenfolge)

1. `sybos-vehicle-list.test.ts` — Parser-Tests inkl.:
   - Zeilen mit Minimalfeldern korrekt extrahiert
   - Leere `WArufname` (`&nbsp;`) → leerer String
   - `hasSybosVehicleList()` = true nur auf echter Fahrzeugseite
2. `vehicle-list-matching.test.ts` — Matching:
   - WAname exact match
   - WArufname match, wenn WAname nicht passt
   - WAname hat Vorrang vor WArufname
   - Case-insensitive, Whitespace-Toleranz
   - `null` bei keinem Match
   - `null` bei leerem Input
3. `sybos-table.test.ts` — Regression:
   - `{GEbez}`-Zeilen werden bei Personal-Parsing übersprungen
   - `hasSybosPersonTable()` = false auf reiner Fahrzeugseite

Erst nachdem die Tests fehlschlagen, Implementierung.

## YAGNI

Bewusst **nicht** im Scope:
- Uncheck-Funktion (wie Personal)
- Matching gegen WAGname3 / WAinvnr (User wollte nur WAname + WArufname)
- Fuzzy-Matching
- Schleifen-Verarbeitung mehrerer Seiten der Tabelle
