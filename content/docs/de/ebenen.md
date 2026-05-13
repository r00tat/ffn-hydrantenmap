# Ebenen

Ebenen ermöglichen es, Einsatzelemente auf der Karte zu gruppieren und zu organisieren. Jede Ebene kann eigene Einstellungen für Sichtbarkeit, Darstellung und Datenfelder haben.

## Funktionen

- Eigene Ebenen erstellen und benennen
- Elemente per Drag & Drop zwischen Ebenen verschieben
- **Reihenfolge der Ebenen per Drag & Drop ändern** Beeinflusst die Darstellungsreihenfolge auf der Karte
- **Sichtbarkeit pro Ebene ein/ausschalten** Über die Einstellung defaultVisible steuerbar
- Z-Index für Darstellungsreihenfolge festlegen
- **Benutzerdefinierte Datenfelder (Data Schema)** Mit Typen: Zahl, Text, Boolean, Berechnet
- Heatmap-Visualisierung konfigurieren
- **Interpolations-Darstellung** IDW - Inverse Distance Weighting
- Ebenen importieren und exportieren
- Labels anzeigen/verstecken
- Gruppierung und Zusammenfassung konfigurieren

## Anleitung

### Neue Ebene erstellen

1. FAB (Floating Action Button) unten rechts klicken
2. Name für die Ebene eingeben
3. Einstellungen festlegen (Sichtbarkeit, Z-Index, etc.)
4. Speichern

### Elemente zuordnen

1. Element per Drag & Drop auf die gewünschte Ebene ziehen
2. Ein grüner Rahmen zeigt das Ziel an
3. Loslassen zum Zuweisen

:::info
Tipp: Nicht zugeordnete Elemente erscheinen in der Spalte "Elemente nicht zugeordnet" und können von dort auf Ebenen gezogen werden.
:::

### Ebenen-Reihenfolge ändern

1. Drag-Handle links an der Ebene greifen
2. Nach oben oder unten ziehen
3. Höhere Position = weiter oben dargestellt

### Datenfelder definieren

1. Ebene bearbeiten
2. Data Schema öffnen
3. Feld hinzufügen mit Name und Typ: number, text, boolean oder computed

### Heatmap konfigurieren

1. Ebene bearbeiten
2. Heatmap aktivieren
3. Datenfeld für die Visualisierung wählen
4. Farbmodus auto oder manuell einstellen
5. Radius und Blur anpassen

### Interpolation verwenden

1. Visualisierungsmodus auf "Interpolation" stellen
2. Radius in Metern festlegen
3. Transparenz einstellen
4. Algorithmus und Farbskala konfigurieren

:::info
Tipp: Heatmaps eignen sich besonders für Messwerte (z.B. Strahlungswerte, Pegelstände). Die Interpolation berechnet Werte zwischen den Messpunkten.
:::
