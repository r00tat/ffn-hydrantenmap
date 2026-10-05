# Geräte & Material

Unter „Geräte & Material" liegen die Geräte und Lagerartikel deiner Feuerwehr — übernommen aus Sybos, mit dem Bestand je Lagerort. Im Einsatz kannst du Geräte zuordnen und Verbrauchsmaterial (z.B. Schutzanzüge, Filter, Bindemittel) eintragen; der Verbrauch wird automatisch vom Lager abgebucht. Fällt der Bestand unter den Mindestbestand, geht eine Meldung „bitte nachbestellen" hinaus.

## Funktionen

- **Artikelliste:** alle Geräte und Lagerartikel mit Lagerorten und Gesamtbestand, filterbar nach Klasse, Lagerort, Verbrauchsmaterial und „unter Mindestbestand"
- **Nachzubestellen:** Artikel, deren Bestand unter den Mindestbestand gefallen ist
- **Bestand je Lagerort:** Fahrzeug und Laderaum (z.B. „SRF · GR 2"), Raum (z.B. „Feuerwehrhaus · Lager") oder ein Container (z.B. „Ölsperren 1")
- **Zugang, Umbuchung, Inventur:** Bestand auffüllen, zwischen Lagerorten verschieben oder den Ist-Wert setzen
- **Import aus Sybos:** Artikelexport als Excel-Datei, mit Vorschau vor der Übernahme
- **Sets:** mehrere Geräte und Materialien als Zusammenstellung (z.B. „Ölspur"), im Einsatz mit einem Klick oder Scan erfasst
- **Im Einsatz:** Geräte zuordnen und Material verbrauchen, auch ohne Netz

## Anleitung

### Im Einsatz: Gerät zuordnen oder Material verbrauchen

1. Im Einsatz den Abschnitt „Geräte & Material" öffnen
2. Artikel suchen und anklicken — nach Bezeichnung, Inventar-Nr., Barcode, Seriennummer, aber auch nach Gattung oder Klasse (z.B. „Messgerät", „Gasmessgerät"). Unter jedem Treffer stehen Typ, Seriennummer und Lagerort, damit gleichnamige Geräte unterscheidbar sind; nach der Auswahl zeigt der Dialog die Stammdaten aus Sybos
3. Bei einem Gerät die Anzahl bzw. die Stunden eintragen — der Bestand ändert sich dabei nicht
4. Bei Verbrauchsmaterial die Menge eintragen und den Lagerort wählen, von dem es genommen wurde
5. Speichern — der Eintrag ist sofort im Einsatz sichtbar

Mehrere Geräte auf einmal: Die Liste bleibt nach dem Anklicken offen, du kannst gleich weitere Artikel wählen. Mit **„… erfassen"** werden alle eingetragen — Geräte zugeordnet, Verbrauchsmaterial mit Menge 1 vom vorgeschlagenen Lagerort. Menge, Stunden oder Lagerort trägst du bei Bedarf danach über **Bearbeiten** am Eintrag nach. Artikel, die schon im Einsatz erfasst sind, sind in der Liste als „bereits im Einsatz" gekennzeichnet.

:::info
Ohne Netz wird der Eintrag auf dem Gerät gespeichert. Das Abbuchen vom Lager wird nachgeholt, sobald wieder eine Verbindung besteht. Bis dahin ist der Eintrag als „noch nicht abgebucht" markiert.
:::

Wird ein Verbrauch nachträglich geändert oder gelöscht, wird der Bestand entsprechend korrigiert.

Dieselbe Liste steht auch in der **Einsatzübersicht** als aufklappbarer Abschnitt „Geräte & Material".

### Im Einsatz: Set erfassen

1. Im Dialog **Erfassen** den Namen des Sets suchen — Sets stehen unter den Artikeln und sind mit „Set" gekennzeichnet — oder den Code des Sets bzw. der Set-Kiste scannen
2. Die Vorschau zeigt alle Einträge, die angelegt werden. Menge, Stunden und Lagerort lassen sich je Zeile ändern. Ausgegraute Zeilen werden nicht angelegt, der Grund steht dabei (z.B. „inaktiv")
3. Bei Bedarf weitere Sets oder einzelne Artikel dazuwählen
4. Mit **„… erfassen"** speichern

In der Liste des Einsatzes stehen die Einträge unter der Überschrift „Set ‹Name›", zum Auf- und Zuklappen. Einzelne Einträge bleiben änderbar; über das Menü an der Überschrift entfernst du mit **Ganzes Set entfernen** alle Einträge dieses Sets auf einmal — verbrauchtes Material wird dabei ins Lager zurückgebucht.

### Sets pflegen

1. In „Geräte & Material" den Reiter **Sets** öffnen und **Neues Set** wählen (oder ein bestehendes anklicken)
2. Name eintragen und die Inhalte über die Artikelsuche hinzufügen. Je Inhalt die Menge eintragen, bei Verbrauchsmaterial bei Bedarf einen festen Lagerort. Ohne festen Lagerort — oder wenn es ihn nicht mehr gibt — wird wie beim Einzelerfassen der passende Lagerort vorgeschlagen
3. Optional den **Sybos-Set-Artikel** wählen (z.B. die Ölspur-Kiste). Er wird im Einsatz selbst mit eingetragen, seine Barcodes finden das Set automatisch
4. Eigene **Codes** eintragen oder scannen, etwa einen QR-Aufkleber an der Kiste. Ein Code darf nicht schon an einem Artikel oder einem anderen Set stehen
5. Speichern. Ein Set, das gerade nicht gebraucht wird, schaltest du auf inaktiv — es erscheint dann im Einsatz nicht mehr

### Bestand pflegen

1. Im Menü „Geräte & Material" öffnen
2. Artikel auswählen
3. Beim gewünschten Lagerort **Zugang** (Material eingetroffen), **Umbuchung** (z.B. vom Lager auf das SRF) oder **Inventur** (gezählten Ist-Wert eintragen) wählen
4. Ob ein Artikel **Verbrauchsmaterial** ist, schaltest du direkt im Artikel mit dem Schalter oben um. Sybos liefert diese Angabe nicht mit, nach dem Import ist also jeder Artikel ein Gerät. Für viele Artikel auf einmal: in der Liste **Auswählen** klicken, Artikel anklicken (oder mit Suche und Filtern eingrenzen und **Alle … auswählen**) und **Als Verbrauchsmaterial** wählen. Unter **Bearbeiten** trägst du bei Bedarf **Einheit** und **Mindestbestand** ein. Darunter stehen alle Stammdaten aus Sybos; bei importierten Artikeln überschreibt der nächste Import diese wieder
5. Einen weiteren Lagerort legst du mit **Neuer Lagerort** an. Als Art stehen Raum, Fahrzeug und **Container** zur Wahl; Container sind die Artikel der Sybos-Kategorie „Container" und müssen dafür importiert sein
6. Mit dem Stift ändert sich ein Lagerort, mit dem Papierkorb wird er gelöscht. Ein Restbestand wird dabei ausgebucht. Wurde aus dem Lagerort in einem Einsatz verbraucht, wird er nur ausgeblendet, damit der Einsatz ihn weiter zeigt

### Aus Sybos importieren

1. In Sybos den Artikelexport als Excel-Datei erstellen (eine Zeile je Artikel und Lagerort) — **mit den Lagerort-Spalten**. Fehlen sie, übernimmt der Import nur die Stammdaten und lässt den Bestand, wie er ist. Container (Rollcontainer, Paletten) als eigenen Export der Kategorie „Container" ebenfalls importieren
2. In „Geräte & Material" auf „Import" klicken und die Datei wählen
3. Die Vorschau prüfen: neue Artikel, geänderte Stammdaten, neue Lagerorte und Abweichungen beim Bestand
4. Abweichungen einzeln als Inventur übernehmen oder verwerfen
5. Import bestätigen

:::warning
Wurde seit dem letzten Import im Einsatz verbraucht oder von Hand gebucht, überschreibt der Import den Bestand nicht einfach. Solche Abweichungen zeigt die Vorschau einzeln an.
:::

## Nachbestellmeldung

- Der Mindestbestand gilt für den Artikel insgesamt, über alle Lagerorte zusammen.
- Fällt der Bestand durch einen Verbrauch unter den Mindestbestand, bekommen die Empfänger der **Mängel-E-Mail** des Fahrtenbuchs eine Nachricht.
- Weitere Verbräuche lösen keine neue Mail aus. Erst wenn der Bestand wieder aufgefüllt wurde und erneut unterschritten wird, kommt wieder eine Meldung.

## Berechtigungen

- **Ansehen, zuordnen, verbrauchen:** alle Mitglieder der Feuerwehr bzw. alle mit Zugriff auf den Einsatz
- **Artikel, Bestand und Sets pflegen, Import:** Administratoren der Feuerwehr und Gerätemeister
- **Sets im Einsatz wählen:** Mitglieder der Feuerwehr; Gäste eines Einsatzes erfassen einzelne Artikel

## Hinweise

- Atemschutzgeräte, Flaschen und Masken werden weiterhin unter „Atemschutz" verwaltet, nicht hier.
- Ob ein Artikel im Einsatz abgebucht wird, hängt nur am Häkchen „Verbrauchsmaterial" — nicht am Material-Typ aus Sybos.
- Der Bestand darf negativ werden, wenn mehr verbraucht wurde, als laut Lager vorhanden war. Eine Inventur bringt ihn wieder in Ordnung.
- Änderungen am Bestand werden nicht nach Sybos zurückgeschrieben.
