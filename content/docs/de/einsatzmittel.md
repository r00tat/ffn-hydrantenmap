# Einsatzmittel

Die Einsatzmittel-Seite bietet eine Übersicht aller im Einsatz eingesetzten Fahrzeuge und Ressourcen mit Stärkeberechnung und Gruppenansicht.

## Funktionen

- Übersicht aller eingesetzten Fahrzeuge und Ressourcen
- **Stärketabelle** Mit Gesamtbesatzung und Atemschutzträger (ATS)
- Gruppierung nach Ebenen
- Kompakte Kartenansicht pro Fahrzeug
- CSV-Export aller Einsatzmittel
- Fahrzeuge bearbeiten und Details einsehen
- Drag & Drop für Ebenenzuordnung

## Anleitung

### Einsatzmittel-Übersicht öffnen

1. Im Menü auf "Einsatzmittel" klicken
2. Die Seite zeigt alle Fahrzeuge des aktiven Einsatzes

### Stärketabelle lesen

1. Oben auf der Seite: Gesamtzahl Fahrzeuge, Gesamtbesatzung, ATS-Träger
2. Wird automatisch aus allen Fahrzeugdaten berechnet

:::info
Tipp: Die Stärketabelle aktualisiert sich automatisch, wenn Fahrzeuge hinzugefügt oder Besatzungsstärken geändert werden.
:::

### Besatzung und ATS-Träger automatisch zählen

1. Personen im Besatzungs-Board (Einsatz-Details) einem Fahrzeug zuordnen
2. Die Besatzung wird automatisch aus der Anzahl der zugeordneten Personen ermittelt
3. Als ATS-Träger zählt jede zugeordnete Person mit der Funktion "Atemschutzträger" (ATS)

:::info
Ein am Fahrzeug manuell eingetragener Wert für Besatzung bzw. ATS-Träger hat immer Vorrang.
Erst wenn kein Wert erfasst ist, wird automatisch aus der Besatzungszuordnung gezählt —
praktisch für Fahrzeuge anderer Feuerwehren ohne Besatzungszuordnung.
:::

### Fahrzeuge nach Ebenen ansehen

1. Fahrzeuge sind nach Ebenen gruppiert
2. Jede Gruppe ist auf- und zuklappbar
3. "Nicht zugeordnet" enthält Fahrzeuge ohne Ebene

### Fahrzeug bearbeiten

1. Fahrzeugkarte aufklappen
2. Bearbeiten-Button klicken
3. Details ändern und speichern

### Fahrzeug einer fremden Organisation kennzeichnen

Auf einer Lage mit Rettung, Polizei und Nachbarwehren sind lauter rote Balken schwer auseinanderzuhalten. Ein Fahrzeug lässt sich deshalb einfärben.

1. Fahrzeug zum Bearbeiten öffnen
2. Schalter **Fremdorganisation** einschalten — der Balken auf der Karte wird blau statt rot, und das Popup weist das Fahrzeug als fremd aus
3. Über **Farbe** lässt sich stattdessen jede andere Farbe wählen, etwa je Organisation eine eigene

In der Stärketabelle stehen fremde Einsatzmittel nicht bei den eigenen Kräften: Sobald ein Fahrzeug als fremd gekennzeichnet ist, teilt sich die Tabelle in **Eigene Kräfte** und **Fremdkräfte**, jeder Abschnitt bekommt eine eigene Zwischensumme und darunter steht die Gesamtsumme. Der CSV-Export führt dafür die Spalte **Kräfte** mit `eigen` bzw. `fremd`.

:::info
Ohne Fremdfahrzeuge bleibt die Stärketabelle unverändert: eine Liste mit einer Gesamtzeile.

Der Schalter sitzt am Fahrzeug. Eine taktische Einheit ohne Fahrzeug zählt daher zu den eigenen Kräften.
:::

### Als CSV exportieren

1. Download-Button oben rechts klicken
2. Die CSV-Datei enthält alle Fahrzeugdaten mit Timeline

:::info
Tipp: Die Einsatzmittel-Seite zeigt die gleichen Fahrzeuge wie die Fahrzeug-Seite, bietet aber eine kompaktere Übersicht mit Stärkeberechnung.
:::
