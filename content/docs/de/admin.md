# Administration

Der Admin-Bereich bietet erweiterte Verwaltungsfunktionen für Administratoren. Hier können Benutzer verwaltet, Daten importiert und Systemeinstellungen konfiguriert werden.

## Funktionen

- Benutzerverwaltung: Benutzer anzeigen, Berechtigungen setzen, Custom Claims vergeben
- Gruppenverwaltung: Gruppen erstellen und verwalten
- Admin-Aktionen: Datenbank-Wartung, Benutzer-Reparatur, Daten zwischen Umgebungen kopieren
- GIS-Daten-Pipeline: HAR-Dateien importieren und Geodaten verarbeiten
- Hydranten-Cluster: Hydrantendaten verwalten und clustern
- Hydranten CSV-Import: Hydrantendaten aus CSV-Dateien importieren
- Kostenersatz-Einstellungen: Tarife und Vorlagen konfigurieren
- Pegelstände: Messstationen konfigurieren
- Gelöschte Elemente: Gelöschte Daten wiederherstellen
- Audit-Log: Alle Systemänderungen nachverfolgen

## Anleitung

### Benutzerverwaltung

### Benutzer verwalten

1. Im Menü auf "Users" klicken
2. Liste aller registrierten Benutzer
3. Berechtigungen (isAuthorized, isAdmin) setzen
4. Custom Claims für spezielle Zugriffsrechte vergeben

### Gruppen verwalten

1. Im Menü auf "Groups" klicken
2. Gruppen erstellen/bearbeiten/löschen
3. Alarm-SMS-Zugangsdaten pro Gruppe hinterlegen

### Admin-Dashboard

### Admin-Aktionen ausführen

1. Im Menü auf "Admin" klicken
2. Tab "Admin Actions": Benutzer-Berechtigungen reparieren
3. Leere Einsatz-Gruppen korrigieren
4. Custom Claims setzen
5. Daten zwischen Dev und Prod kopieren
6. Verwaiste Elemente finden und bereinigen

### GIS-Daten importieren

1. Tab "GIS Data Pipeline": HAR-Datei hochladen
2. Ortschaft und Collection wählen
3. Daten werden geparst, Koordinaten konvertiert und in Vorschau angezeigt
4. Import starten

### Hydranten per CSV importieren

1. Tab "Hydranten CSV Import": CSV-Datei hochladen
2. Spalten-Mapping konfigurieren
3. Vorschau prüfen
4. Import durchführen

### Kostenersatz konfigurieren

1. Tab "Kostenersatz": Tarife und Stundensätze nach Tarifordnung einstellen
2. Fahrzeug-spezifische Kosten definieren
3. E-Mail-Vorlagen konfigurieren

### Pegelstand-Stationen verwalten

1. Tab "Pegelstände": Messstationen registrieren und Parameter konfigurieren

### Gelöschte Elemente wiederherstellen

1. Tab "Gelöschte Elemente": Gelöschte Einsatzelemente durchsuchen
2. Einzelne Elemente wiederherstellen oder endgültig löschen

### Audit-Log

### Änderungen nachverfolgen

1. Im Menü auf "Audit Log" klicken
2. Zeigt alle Systemänderungen: Wer hat wann was geändert
3. Nach Benutzer und Aktion filtern

:::warning
Hinweis: Der Admin-Bereich ist nur für Benutzer mit Administrator-Berechtigung sichtbar.
:::

:::info
Tipp: Verwende die Admin-Aktionen "Daten kopieren" um Daten zwischen der Entwicklungs- und Produktionsumgebung zu synchronisieren.
:::

:::info
Tipp: Das Audit-Log hilft bei der Nachverfolgung von Änderungen und kann zur Qualitätssicherung genutzt werden.
:::
