# Einsatzmittel

Die Einsatzmittel-Seite bietet eine Übersicht aller im Einsatz eingesetzten Fahrzeuge und Ressourcen mit Stärkeberechnung und Gruppenansicht.

## Funktionen

- Übersicht aller eingesetzten Fahrzeuge und Ressourcen
- **Schnelleingabe** für weitere Fahrzeuge und taktische Einheiten direkt auf der Seite
- **Stärketabelle** Mit Gesamtbesatzung und Atemschutzträger (ATS)
- Gruppierung nach Ebenen
- **Übersicht nach Einsatzort** mit Einheiten, Fahrzeugen, Stand und Stärke
- **Fahrzeuge unter taktischen Einheiten** — die Einheit zieht mit ihren Fahrzeugen um
- Kompakte Kartenansicht pro Fahrzeug
- CSV-Export aller Einsatzmittel
- Fahrzeuge bearbeiten und Details einsehen
- Drag & Drop für Ebenenzuordnung

## Anleitung

### Einsatzmittel-Übersicht öffnen

1. Im Menü auf "Einsatzmittel" klicken
2. Die Seite zeigt alle Fahrzeuge des aktiven Einsatzes

### Weitere Kräfte schnell hinzufügen

Oberhalb der Stärketabelle steht eine Eingabezeile, mit der nachrückende Kräfte ohne Dialog erfasst werden.

1. Oben **Fahrzeug** oder **Taktische Einheit** wählen
2. **Bezeichnung** eingeben — bei Fahrzeugen werden die eigenen Fahrzeuge vorgeschlagen, jede andere Bezeichnung geht ebenso
3. Optional **Feuerwehr / Organisation**, Stärke und **ATS** ausfüllen
4. **Enter** drücken oder **Hinzufügen** klicken

Danach steht der Cursor wieder in der Bezeichnung; Feuerwehr, **Fremd** und **Eingetroffen** bleiben stehen. So lassen sich mehrere Fahrzeuge einer Nachbarwehr hintereinander eintippen.

- **Besatzung 1:?** am Fahrzeug ist die Mannschaft ohne Kommandant — `8` oder `1:8` ergibt neun Personen
- **Stärke** an der taktischen Einheit ist die Gesamtstärke — `9`, `1:8` oder `1/8/9` ergeben neun Personen
- **Feuerwehr / Organisation** ist beim Fahrzeug leer — die eigene Feuerwehr steht als erster Vorschlag in der Liste
- **Fremd** schaltest du nur für Fremdorganisationen ein (Rettung, Polizei …), nicht für andere Feuerwehren
- **Eingetroffen** setzt die Eintreffzeit auf jetzt, sonst wird die Alarmierungszeit auf jetzt gesetzt — so steht jedes neue Fahrzeug und jede neue Einheit als „alarmiert" bzw. „eingetroffen" im Einsatztagebuch
- Die eigenen Fahrzeuge lassen sich zusätzlich mit einem Klick auf ihren Chip anlegen

Das neue Element liegt an der Einsatzadresse. Alarmierungszeit, Beschreibung oder Position lassen sich danach wie gewohnt über **Bearbeiten** ergänzen.

### Stärketabelle lesen

1. Oben auf der Seite: Gesamtzahl Fahrzeuge, Gesamtbesatzung, ATS-Träger
2. Wird automatisch aus allen Fahrzeugdaten berechnet

:::info
Tipp: Die Stärketabelle aktualisiert sich automatisch, wenn Fahrzeuge hinzugefügt oder Besatzungsstärken geändert werden.
:::

### Stärketabelle filtern

1. In das Suchfeld über der Stärketabelle tippen, etwa den Namen einer Feuerwehr oder eine Fahrzeugbezeichnung
2. Gesucht wird ohne Rücksicht auf Groß- und Kleinschreibung in **Bezeichnung**, **FW**, **Typ** und **Einsatzort**
3. Mehrere Wörter müssen alle vorkommen: `Neusiedl TLF` findet nur das TLF aus Neusiedl
4. Mit dem **×** im Suchfeld den Filter wieder leeren

:::info
Die Summenzeilen rechnen nur über die angezeigten Zeilen — so zeigt ein Filter auf eine Feuerwehr deren Stärke. Druckansicht und CSV-Export enthalten immer alle Einsatzmittel.
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

### In der Stärketabelle bearbeiten und Einsatzorten zuordnen

1. Am Ende jeder Zeile öffnet der Stift den Bearbeiten-Dialog des Fahrzeugs bzw. der Einheit
2. Gibt es im Einsatz Einsatzorte, zeigt die Spalte **Einsatzort**, wo das Fahrzeug oder die Einheit eingesetzt ist
3. Einsatzort in der Auswahl wählen — mit **kein Einsatzort** wird die Zuordnung aufgehoben

Ein Fahrzeug oder eine Einheit steht immer nur an **einem** Einsatzort: Wer einen anderen wählt, zieht es vom bisherigen ab. Hat der Einsatzort Koordinaten, wird es auf der Karte dorthin versetzt. Jede Zuordnung und jedes Abziehen steht wie auf der Seite **Einsatzorte** im Einsatztagebuch.

### Fahrzeuge einer taktischen Einheit zuordnen

1. In der Schnelleingabe zuerst die **Taktische Einheit** anlegen, z. B. „FW Neusiedl" als Zug — eine eigene Feuerwehr-Angabe braucht sie nicht
2. Danach steht die Zeile auf **Fahrzeug** mit der neuen Einheit unter **Einheit**: die Fahrzeuge einfach hintereinander eintippen
3. Bestehende Fahrzeuge ordnest du in der Tabelle in der Spalte **Einheit** oder im Bearbeiten-Dialog des Fahrzeugs zu

Die Fahrzeuge stehen in der Tabelle eingerückt unter ihrer Einheit. Die Stärke der Einheit ist die Summe ihrer Fahrzeuge und wird in der Gesamtsumme nicht doppelt gezählt. Wird die Einheit einem anderen Einsatzort zugeordnet — in der Tabelle oder auf der Seite **Einsatzorte** —, ziehen ihre Fahrzeuge mit; wird sie von einem Einsatzort entfernt, auch.

### Übersicht nach Einsatzort

Über der Tabelle schaltest du zwischen **Nach Einsatzort** und **Tabelle** um. Die Übersicht zeigt je Einsatzort die Einheiten mit ihren Fahrzeugen, ob sie alarmiert, eingetroffen oder abgerückt sind, und die Stärke des Einsatzorts. Was noch keinem Einsatzort zugeordnet ist, steht unter **ohne Einsatzort**. Über die Auswahl neben jedem Fahrzeug und jeder Einheit ordnest du sie auch hier einem Einsatzort zu — eine Einheit nimmt ihre Fahrzeuge mit.

### Fahrzeuge nach Ebenen ansehen

1. Fahrzeuge sind nach Ebenen gruppiert
2. Jede Gruppe ist auf- und zuklappbar
3. "Keiner Ebene zugeordnet" enthält Fahrzeuge ohne Ebene

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
