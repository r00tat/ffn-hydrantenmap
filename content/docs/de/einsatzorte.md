# Einsatzorte

Einsatzorte dienen zur Verwaltung einzelner Einsatzstellen innerhalb eines Einsatzes. Jeder Ort hat einen Status, zugewiesene Fahrzeuge und Zeitstempel für die Einsatzabwicklung.

## Funktionen

- Einsatzorte erstellen mit Adresse und Beschreibung
- **Status-Verwaltung mit Farbcodierung** Offen (gelb), Einsatz notwendig (rot), In Arbeit (orange), Erledigt (grün), Kein Einsatz (grün)
- **Fahrzeuge pro Einsatzort zuweisen** Aus Karten-Fahrzeugen oder Kostenersatz-Vorschlägen
- **Zeitstempel** Alarmzeit, Startzeit, Zeitpunkt abgearbeitet
- **Automatischer E-Mail-Import von Einsatzorten** Für FFN-Gruppe, alle 60 Sekunden
- Deduplizierung über Auftragsnummer
- GPS-Koordinaten und Kartenansicht
- Sortierung nach allen Spalten
- **Responsive Darstellung** Tabelle (Desktop) oder Karten (Mobil)

## Anleitung

### Einsatzort erstellen

1. Neuen Einsatzort anlegen
2. Name und Adresse eingeben
3. Status setzen
4. Speichern

### Status ändern

1. Dropdown in der Status-Spalte klicken
2. Neuen Status wählen – die Farbe ändert sich automatisch

:::info
Tipp: Die Statusfarben helfen bei der schnellen Übersicht: Rot = dringend, Orange = in Bearbeitung, Grün = erledigt.
:::

### Fahrzeuge zuweisen

1. Fahrzeug-Dropdown am Einsatzort öffnen
2. Fahrzeug aus Liste wählen oder neues erstellen

### E-Mail-Import nutzen

1. E-Mail-Check Button klicken oder automatisch alle 60 Sekunden warten
2. Neue Einsatzorte erscheinen mit Badge-Anzeige
3. Bestehende Aufträge werden über die Auftragsnummer erkannt und nicht doppelt importiert

:::info
Tipp: Der E-Mail-Import funktioniert automatisch im Hintergrund (alle 60 Sekunden) und erstellt bei neuen Einsatzorten auch einen Tagebucheintrag.
:::

### Zeitstempel verwalten

1. Alarmzeit, Startzeit und Abgearbeitet-Zeit pro Einsatzort setzen

### Sortieren und filtern

1. Spaltenüberschriften klicken für Sortierung
