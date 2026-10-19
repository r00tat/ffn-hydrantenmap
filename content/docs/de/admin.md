# Administration

Der Admin-Bereich bietet erweiterte Verwaltungsfunktionen für Administratoren. Hier können Benutzer verwaltet, Daten importiert und Systemeinstellungen konfiguriert werden.

## Funktionen

- Benutzerverwaltung: Benutzer anzeigen, freischalten, Feuerwehren zuordnen
- Mitglieder und Rollen: Rollen je Feuerwehr vergeben (Gruppen-Admin, Gerätemeister, Bekleidungswart, Kostenersatz)
- Berechtigungen: Migration der Rollen und „Rechte neu ableiten"
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

1. Im Menü auf "Gruppen" klicken
2. Die Übersicht zeigt die Gruppen als Baum: Untergruppen stehen eingerückt
   unter ihrer übergeordneten Gruppe und lassen sich auf- und zuklappen. Das
   Suchfeld filtert nach Name und Beschreibung.
3. Gruppen erstellen, bearbeiten oder löschen; im Dialog legst du auch die
   **übergeordnete Gruppe** fest und hinterlegst die Alarm-SMS-Zugangsdaten
4. Ein Klick auf eine Gruppe öffnet ihre **Detailseite** mit übergeordneter
   Gruppe, Untergruppen, „Bearbeiten" und den Mitgliedern samt Rollen. Über
   die Navigationszeile oben geht es zurück zur Übersicht.

Wer Mitglied einer Untergruppe ist, wird automatisch auch Mitglied aller
übergeordneten Gruppen. In der Gruppenauswahl eines Benutzers sind diese
Gruppen angehakt und gesperrt, solange die Untergruppe gewählt ist.

### Rollen vergeben

Rollen gelten immer **in einer Feuerwehr**. Vergeben werden sie im Abschnitt
„Mitglieder und Rollen" auf der Detailseite der Feuerwehr:

- **Gruppen-Admin** Verwaltung der Feuerwehr: Einstellungen, Freigabe-Links,
  Atemschutz-Verwaltung; schließt Gerätemeister und Bekleidungswart ein, nicht
  aber den Kostenersatz
- **Gerätemeister** Fahrtenbuch korrigieren, Fahrzeuge, Personen, Geräte &
  Material
- **Bekleidungswart** Bekleidung sehen und pflegen
- **Kostenersatz** Kostenersatz an Einsätzen der Feuerwehr, Verrechnung der
  Füllungen

Administratoren vergeben alle Rollen und nehmen Benutzer in Feuerwehren auf.
Gruppen-Admins vergeben in ihrer Feuerwehr die übrigen Rollen — aber nur
solche, deren Rechte sie selbst haben, und nie die Rolle Gruppen-Admin.

### Berechtigungen migrieren

Die Seite **Berechtigungen** (`/admin/berechtigungen`) überführt die
früheren Rollenfelder in die Rollen je Feuerwehr. Sie ist nach dem Ausrollen
der Umstellung sofort auszuführen — bis dahin sind die Funktionen der
Feuerwehren gesperrt.

1. **Vorschau** prüfen; bei Kostenersatz je Feuerwehr festlegen, wo die Rolle
   gelten soll
2. **Migrieren** — die alten Felder bleiben dabei unverändert stehen
3. **Alte Felder entfernen** erst, wenn sich das Release bewährt hat

**Rechte neu ableiten** gleicht die gespeicherten Rechte aller Benutzer mit
dem aktuellen Rollenkatalog ab.

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
