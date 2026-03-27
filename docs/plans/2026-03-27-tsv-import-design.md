# TSV/CSV Import Erweiterung — Design

## Ziel

Den bestehenden CSV-Import-Dialog erweitern um:
1. **Wählbare Header-Zeile** — nicht immer Zeile 1
2. **Pre-Header-Metadaten** — Zeilen vor dem Header als Layer-Name verwenden (optional)
3. **Editierbares Spalten-Mapping** — Dropdowns für Lat/Lng/Name/Zeitstempel + Checkbox-Liste für Extra-Spalten

## Kontext

RadiaCode-Dosimeter exportiert TSV-Tracks mit Metadaten in Zeile 1 und Header in Zeile 2. Der bestehende Import nimmt immer Zeile 1 als Header, was hier fehlschlägt.

## Änderungen

### csvParser.ts

- `parseCsv(text, delimiter, headerRow)` — neuer Parameter `headerRow` (0-basiert), gibt zusätzlich `preHeaderLines: string[]` zurück
- `detectHeaderRow(text, delimiter)` — Auto-Detect: vergleicht Trennzeichen-Anzahl in den ersten Zeilen; wenn Zeile 1 deutlich weniger hat als Zeile 2, wird Zeile 2 vorgeschlagen
- `detectDelimiter(text)` — nutzt die Zeile mit den meisten Trennzeichen statt nur Zeile 1
- `csvToRecords` bekommt optionale Column-Overrides für Lat/Lng/Name/Timestamp-Indizes

### CsvImport.tsx

- **CsvPreviewState** erweitert um: `headerRow`, `preHeaderLines`, `columnMapping`, `excludedColumns`
- **Header-Zeile Dropdown** — 1-basiert, direkt unter Trennzeichen
- **Metadaten-Sektion** — zeigt Pre-Header-Zeilen, Toggle "Als Layer-Name verwenden"
- **ColumnMappingEditor** — 4 Dropdowns (Lat, Lng, Name, Zeitstempel) mit allen Spalten + "— nicht zugewiesen —"
- **Extra-Spalten Checkboxen** — nicht-gemappte Spalten mit Import-Toggle
- `buildPreview` und `handleImport` nutzen das User-Mapping statt nur Auto-Detect

### Neue Typen

```typescript
interface ColumnMapping {
  latColumn: number;    // -1 = nicht zugewiesen
  lngColumn: number;
  nameColumn: number;
  timestampColumn: number;
}
```

### UI-Reihenfolge im Dialog

1. Trennzeichen
2. Header-Zeile
3. Metadaten (wenn Pre-Header-Zeilen vorhanden)
4. Spalten-Mapping (Dropdowns)
5. Extra-Spalten (Checkboxen)
6. Statistik (Spalten/Zeilen/Gültig)
7. Downsampling-Slider
8. DataSchemaEditor
9. Import-Button

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/firebase/csvParser.ts` | `headerRow` Parameter, `detectHeaderRow`, Mapping-Overrides |
| `src/components/firebase/CsvImport.tsx` | UI-Erweiterungen, State-Management |
| `src/components/firebase/csvParser.test.ts` | Tests für neue Funktionen |
| `src/components/firebase/CsvImport.test.tsx` | Tests für neue UI-Elemente |
