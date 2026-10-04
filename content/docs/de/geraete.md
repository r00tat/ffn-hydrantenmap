# Geräte & Material

Unter „Geräte & Material" liegen die Geräte und Lagerartikel deiner Feuerwehr — übernommen aus Sybos, mit dem Bestand je Lagerort. Im Einsatz kannst du Geräte zuordnen und Verbrauchsmaterial (z.B. Schutzanzüge, Filter, Bindemittel) eintragen; der Verbrauch wird automatisch vom Lager abgebucht. Fällt der Bestand unter den Mindestbestand, geht eine Meldung „bitte nachbestellen" hinaus.

## Funktionen

- **Artikelliste:** alle Geräte und Lagerartikel mit Lagerorten und Gesamtbestand, filterbar nach Klasse, Lagerort, Verbrauchsmaterial und „unter Mindestbestand"
- **Nachzubestellen:** Artikel, deren Bestand unter den Mindestbestand gefallen ist
- **Bestand je Lagerort:** Fahrzeug und Laderaum (z.B. „SRF · GR 2") oder Raum (z.B. „Feuerwehrhaus · Lager")
- **Zugang, Umbuchung, Inventur:** Bestand auffüllen, zwischen Lagerorten verschieben oder den Ist-Wert setzen
- **Import aus Sybos:** Artikelexport als Excel-Datei, mit Vorschau vor der Übernahme
- **Im Einsatz:** Geräte zuordnen und Material verbrauchen, auch ohne Netz

## Anleitung

### Im Einsatz: Gerät zuordnen oder Material verbrauchen

1. Im Einsatz den Abschnitt „Geräte & Material" öffnen
2. Artikel suchen (Bezeichnung oder Inventar-Nr.)
3. Bei einem Gerät die Anzahl bzw. die Stunden eintragen — der Bestand ändert sich dabei nicht
4. Bei Verbrauchsmaterial die Menge eintragen und den Lagerort wählen, von dem es genommen wurde
5. Speichern — der Eintrag ist sofort im Einsatz sichtbar

:::info
Ohne Netz wird der Eintrag auf dem Gerät gespeichert. Das Abbuchen vom Lager wird nachgeholt, sobald wieder eine Verbindung besteht. Bis dahin ist der Eintrag als „noch nicht abgebucht" markiert.
:::

Wird ein Verbrauch nachträglich geändert oder gelöscht, wird der Bestand entsprechend korrigiert.

### Bestand pflegen

1. Im Menü „Geräte & Material" öffnen
2. Artikel auswählen
3. Beim gewünschten Lagerort **Zugang** (Material eingetroffen), **Umbuchung** (z.B. vom Lager auf das SRF) oder **Inventur** (gezählten Ist-Wert eintragen) wählen
4. Beim Artikel festlegen, ob er **Verbrauchsmaterial** ist, und bei Bedarf **Einheit** und **Mindestbestand** eintragen

### Aus Sybos importieren

1. In Sybos den Artikelexport als Excel-Datei erstellen (eine Zeile je Artikel und Lagerort)
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
- **Artikel und Bestand pflegen, Import:** Administratoren der Feuerwehr und Gerätemeister

## Hinweise

- Atemschutzgeräte, Flaschen und Masken werden weiterhin unter „Atemschutz" verwaltet, nicht hier.
- Ob ein Artikel im Einsatz abgebucht wird, hängt nur am Häkchen „Verbrauchsmaterial" — nicht am Material-Typ aus Sybos.
- Der Bestand darf negativ werden, wenn mehr verbraucht wurde, als laut Lager vorhanden war. Eine Inventur bringt ihn wieder in Ordnung.
- Änderungen am Bestand werden nicht nach Sybos zurückgeschrieben.
