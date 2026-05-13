# Fahrzeuge

Verwalte die Fahrzeuge im Einsatz mit Besatzungsstärke, Zeitstempeln und Kartenpositionen. Die Fahrzeugverwaltung bildet die Grundlage für die Stärketabelle und erzeugt automatisch Tagebucheinträge.

![Fahrzeugübersicht](/docs-assets/screenshots/fahrzeuge.png)

## Funktionen

- **Fahrzeuge zum Einsatz hinzufügen** Mit Name, Feuerwehr und Besatzungsstärke
- **Zeitstempel verwalten** Alarmierung, Eintreffen und Abrücken erfassen
- **Besatzungsstärke im Format '1:4'** Gruppenkommandant:Mannschaft - wird automatisch in die Stärketabelle übernommen
- **Atemschutzträger (ATS) Anzahl erfassen** Wird in der Stärketabelle separat ausgewiesen
- Fahrzeugpositionen auf der Karte anzeigen und verschieben
- **Stärketabelle mit Gesamt-Mannschaftsstärke** Automatische Berechnung der Gesamtstärke aller Fahrzeuge
- Gruppierung nach Ebenen (Layer)
- **CSV-Export aller Fahrzeugdaten** Inklusive Timeline mit allen Zeitstempeln
- **Automatische Tagebucheinträge** Bei Änderungen an Zeitstempeln werden automatisch Einträge im Einsatztagebuch erzeugt

## Anleitung

### Fahrzeug hinzufügen

1. Aktiviere den Bearbeitungsmodus auf der Karte
2. Klicke auf den Plus-Button und wähle den Fahrzeugtyp
3. Gib den Namen ein, z.B. "TLFA 2000"
4. Gib die Feuerwehr an, zu der das Fahrzeug gehört
5. Trage die Besatzung im Format "1:4" ein (Gruppenkommandant:Mannschaft)
6. Gib die Anzahl der Atemschutzträger (ATS) ein
7. Speichere das Fahrzeug

:::info
Tipp: Das Besatzungsformat "1:8" bedeutet 1 Gruppenkommandant und 8 Mann. Die Stärketabelle berechnet daraus automatisch die Gesamtstärke.
:::

### Zeitstempel setzen

1. Öffne das gewünschte Fahrzeug
2. Trage Datum und Uhrzeit für **Alarmierung**, **Eintreffen** und **Abrücken** ein
3. Die Zeitstempel werden automatisch als Einträge im Einsatztagebuch angelegt

:::info
Tipp: Wenn du Zeitstempel (Alarmierung, Eintreffen, Abrücken) änderst, werden automatisch entsprechende Einträge im Einsatztagebuch erzeugt.
:::

### Stärketabelle lesen

Oben auf der Fahrzeugseite wird die Stärketabelle angezeigt. Sie enthält die Gesamtzahl der Fahrzeuge, die Gesamtbesatzung und die Anzahl der ATS-Träger.

### Fahrzeug auf Karte positionieren

1. Aktiviere den Bearbeitungsmodus
2. Verschiebe das Fahrzeug per Drag & Drop an die gewünschte Position auf der Karte

### Als CSV exportieren

1. Klicke auf den Download-Button in der Fahrzeugübersicht
2. Die CSV-Datei mit allen Fahrzeugdaten und Zeitstempeln wird heruntergeladen

### Fahrzeuge nach Ebenen gruppieren

1. Fahrzeuge können verschiedenen Ebenen (Layern) zugeordnet werden
2. Die Gruppierung ermöglicht eine übersichtliche Darstellung bei größeren Einsätzen mit mehreren Abschnitten
