# Berechnete Felder in Ebenen (Computed Fields)

## Problem

Benutzer möchten in Layern Formeln definieren, die automatisch Werte aus anderen Feldern berechnen. Beispiel: Ein Feld "Dosisleistung" mit Wert 123 soll über eine Formel `dosisleistung * 0.3` einen berechneten Wert erzeugen.

## Design

### Datenmodell

`DataSchemaField` bekommt den neuen Typ `'computed'` und ein `formula`-Feld:

```typescript
interface DataSchemaField {
  key: string;
  label: string;
  unit: string;
  type: 'number' | 'text' | 'boolean' | 'computed';
  defaultValue?: string | number | boolean;
  formula?: string;  // Nur für type='computed', z.B. "dosisleistung * 0.3"
}
```

### Formel-Syntax

- Feld-Keys werden direkt in der Formel referenziert: `dosisleistung * 0.3`
- Auswertung über `mathjs` (sichere, Parser-basierte Evaluation)
- Unterstützt: Grundrechenarten, Klammern, mathematische Funktionen (sqrt, pow, log, etc.)

### Berechnungslogik

1. **Marker erstellen/aktualisieren**: Alle `computed`-Felder im Layer-Schema werden ausgewertet. Feld-Keys werden durch `fieldData`-Werte ersetzt. Ergebnis wird in `fieldData[computedKey]` gespeichert.

2. **Formel ändern (Layer-Update)**: Alle Marker im Layer werden geladen, neu berechnet und per Batch-Update gespeichert.

3. **Fehlende Werte**: Wenn ein referenziertes Feld nicht gesetzt ist, wird das computed-Feld nicht berechnet (bleibt leer).

### UI

- **DataSchemaEditor**: Bei `type='computed'` wird ein Formel-Eingabefeld angezeigt statt Default-Wert. Hinweis zeigt verfügbare Feld-Keys.
- **ItemDataFields**: Computed-Felder sind read-only (grau, nicht editierbar), zeigen den berechneten Wert.

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/firebase/firestore.ts` | `DataSchemaField` um `'computed'` und `formula` erweitern |
| `src/common/computeFieldValue.ts` | NEU: Formel-Auswertung mit mathjs |
| `src/common/computeFieldValue.test.ts` | NEU: Tests für Formel-Auswertung |
| `src/components/FirecallItems/DataSchemaEditor.tsx` | UI für Formel-Eingabe bei type='computed' |
| `src/components/FirecallItems/ItemDataFields.tsx` | Computed-Felder read-only anzeigen |
| `src/hooks/useFirecallItemAdd.ts` | Berechnung beim Erstellen |
| `src/hooks/useFirecallItemUpdate.ts` | Berechnung beim Update + Batch-Recalc bei Formel-Änderung |
