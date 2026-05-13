# Einsatztagebuch

Das Einsatztagebuch dokumentiert alle wichtigen Ereignisse während eines Einsatzes in chronologischer Reihenfolge. Es dient als lückenlose Aufzeichnung aller Meldungen, Befehle und Rückfragen im Einsatzverlauf.

![Einsatztagebuch](/docs-assets/screenshots/tagebuch.png)

## Funktionen

- Einträge erstellen mit automatischem Zeitstempel
- **Eintragsarten: M (Meldung), B (Befehl), F (Frage)** Klassifizierung nach dem Stabsarbeits-Schema
- **Von/An Felder für Absender und Empfänger** Dokumentiert die Kommunikationswege im Einsatz
- Automatische Nummerierung der Einträge
- **Chronologische Timeline mit Sortierung** Sortierbar nach Nummer, Datum, Art, Name und Beschreibung
- **Automatische Fahrzeug-Einträge** Alarmierung, Eintreffen und Abrücken werden automatisch aus Fahrzeugdaten generiert
- **KI-gestützte Zusammenfassung** Automatische Zusammenfassung des gesamten Einsatzes basierend auf allen Tagebucheinträgen
- CSV-Export des Tagebuchs
- Einträge bearbeiten und löschen

## Anleitung

### Eintrag erstellen

Am Desktop steht ein Inline-Formular direkt in der Tabelle zur Verfügung. Auf Mobilgeräten nutzt du den FAB (Floating Action Button) unten rechts.

1. Die Nummer wird automatisch vergeben und muss nicht eingegeben werden
2. Wähle die Art des Eintrags: **M** (Meldung), **B** (Befehl) oder **F** (Frage)
3. Fülle die Felder **Von** und **An** aus (Absender und Empfänger)
4. Gib den **Namen** ein - das ist der Haupttext des Eintrags
5. Optional: Ergänze eine **Beschreibung** mit zusätzlichen Details
6. Klicke auf den Button, um den Eintrag zu speichern

:::info
Tipp: Die Eintragsarten folgen dem Stabsarbeits-Schema: M = Meldung (Information), B = Befehl (Anweisung), F = Frage (Rückfrage).
:::

### Einträge sortieren

1. Klicke auf eine Spaltenüberschrift (Nummer, Datum, Art, Name oder Beschreibung)
2. Ein Pfeil zeigt die aktuelle Sortierrichtung an (aufsteigend oder absteigend)
3. Erneutes Klicken auf dieselbe Spalte kehrt die Sortierrichtung um

### KI-Zusammenfassung erstellen

1. Klicke auf den Button "Zusammenfassung" in der Toolbar
2. Die KI analysiert automatisch alle Tagebucheinträge und generiert eine Zusammenfassung des gesamten Einsatzes

### Als CSV exportieren

1. Klicke auf den Download-Button in der Toolbar
2. Die CSV-Datei mit allen Tagebucheinträgen wird heruntergeladen

### Eintrag bearbeiten oder löschen

1. Klicke auf das Bearbeiten-Symbol neben dem gewünschten Eintrag, um ihn zu ändern
2. Klicke auf das Löschen-Symbol, um einen Eintrag zu entfernen

:::info
Tipp: Fahrzeug-Zeitstempel (Alarmierung, Eintreffen, Abrücken) werden automatisch als Tagebucheinträge generiert. Du musst diese nicht manuell anlegen.
:::
