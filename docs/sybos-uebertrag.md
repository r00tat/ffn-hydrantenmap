# Übertrag nach Sybos

Die Seite „Sybos-Übertrag" (`/einsatz/<id>/sybos`, Code unter
[src/components/pages/sybos/](../src/components/pages/sybos/)) zeigt einen Einsatz so,
dass er Feld für Feld in die Einsatzdokumentation von Sybos abgeschrieben werden kann.
Eine Schnittstelle zu Sybos gibt es nicht; die Seite ersetzt das Zusammensuchen aus
Karte, Tagebuch und Einsatzmittel-Übersicht.

## Aufbau

Ganz oben steht die Übersichtskarte wie auf der Druckseite, zum Nachsehen. Danach
folgt die Reihenfolge der Erfassung in Sybos:

1. **Basisdaten** — Einsatz, Feuerwehr, Alarmierung, Eintreffen, Ende, Dauer,
   Einsatzort, Beschreibung, dazu der Alarmierungstext aus BlaulichtSMS.
2. **Einsatzablauf** — die beiden Freitextfelder „Einsatzablauf" und
   „Tätigkeit / Bemerkungen", von Gemini erstellt.
3. **Kräfte und Material** — eigene Fahrzeuge und Einheiten, namentliche Mannschaft,
   sonstige Kräfte, eingesetztes Material, Fahrten aus dem Fahrtenbuch mit Kilometern.
4. **Atemschutz** — Leiter des Sammelplatzes und Füllpersonal, eine Zeile je
   Bereitstellung eines Trupps mit Auftrag, Zeiten und Druck.
5. **Messungen** — Gammaspektren und je Ebene mit Datenfeldern (Strahlenmessung,
   Radiacode, eigene Messreihen) eine Tabelle der Messpunkte, als CSV herunterladbar.
6. **Sonstige Notizen** — Einsatzorte mit ihren Notizen, Geschäftsbuch,
   Kostenersatz-Berechnungen.
7. **Anhänge und Fotos** — Anhänge aus dem Storage (am Einsatz und an Elementen) und
   die Dateien im Drive-Ordner, je Datei und gesammelt herunterladbar.
8. **Einsatztagebuch** — vollständig. Angezeigt als dieselbe Tabelle wie auf der
   Druckseite (`DiaryTable`), kopiert als Text mit einem Eintrag je Zeile.

Abschnitte ohne Daten bleiben weg. Die Builder für 3.–7. stehen in
[sybosExtras.ts](../src/components/pages/sybos/sybosExtras.ts), getrennt von
`sybosReport.ts`, weil sie aus eigenen Sammlungen lesen.

## Kopierfelder und Tabellen

Freitext (Basisdaten, Einsatzablauf, Notizen, Geschäftsbuch) steht in Kopierfeldern:
Er wird einzeln kopiert und in Sybos eingefügt, deshalb liefern die Funktionen Text in
genau der Form, in der er dort landet — Zeitpunkte als `DD.MM.YYYY HH:mm` ohne
Sekunden.

Listen (Kräfte, Mannschaft, Material, Trupps, Fahrten, Messungen) stehen dagegen als
schlichte HTML-Tabellen: In Sybos werden sie Zeile für Zeile ausgewählt, von Hand oder
über eine Browser-Erweiterung, die Tabellen ausliest. Sie sind **alphabetisch**
sortiert (`compareAlphabetically`, Zahlen natürlich), so wie die Listen in Sybos
stehen; Messpunkte und Spektren nach Zeit.

Die Werte sind deutsch, auch bei englischer Oberfläche: Sie sind Inhalt des
Einsatzberichts, nicht Bedienoberfläche. Übersetzt sind nur die Beschriftungen.

## Herunterladen von Anhängen und Fotos

Anhänge liegen im Firebase Storage und werden mit `downloadStorageFile` unter ihrem
Originalnamen gespeichert. Die Fotos im Google Drive kommen über
`/api/einsatz/<id>/drive/<fileId>/download`: Die `webViewLink` öffnet nur, wer im
Shared Drive Mitglied ist. Die Route prüft wie die Vorschaubild-Route die Berechtigung
am Einsatz **und** dass die Datei im Ordner des Einsatzes liegt — sonst wäre sie ein
Download-Proxy auf das ganze Shared Drive. Der Client holt die Datei per `fetch` und
speichert sie mit `downloadBlob`, weil die WebView der Android-App `<a download>`
ignoriert. „Alle herunterladen" lädt nacheinander, nicht parallel.

Messreihen gibt es als CSV mit Semikolon, Dezimalkomma und BOM, damit Excel mit
deutscher Einstellung Umlaute und „µ" richtig liest.

## Zeiten

`date` am Einsatz **ist** die Alarmierung — so heißt das Feld im Einsatzdialog; ein
eigenes Feld `alarmierung` hat der Einsatz nicht. Steht ein Zeitpunkt am Einsatz
selbst (`date`, `eintreffen`, `abruecken`), gilt er. Sonst wird er aus den
Einsatzmitteln abgeleitet: erste Alarmierung, erstes Eintreffen, letztes Abrücken —
dieselbe Ableitung wie auf der Druckseite. Die Dauer läuft von der Alarmierung bis zum
Ende.

## Kräfte

Gezählt wird mit `calculateStrength` aus der Einsatzmittel-Übersicht, damit die Zahl in
Sybos zur Zahl in der App passt. „Sonstige Kräfte" sind die Fahrzeuge mit dem Schalter
`fremd` (Rettung, Polizei, Nachbarwehr); taktische Einheiten zählen immer zu den
eigenen. Hintergrund zur Stärke: [einsatzmittel-staerke.md](einsatzmittel-staerke.md).

Material ist alles auf der Karte, was kein Einsatzmittel ist, gezählt nach Typ und
Name; Rohre nach Art („2× C-Rohr").

## Zusammenfassung durch Gemini

Der Aufruf läuft im Browser über `firebase/ai` wie die übrigen KI-Abfragen
([sybosSummary.ts](../src/components/pages/sybos/sybosSummary.ts)). Das Modell bekommt
alle Abschnitte der Seite als Text und antwortet mit einem **JSON-Schema** aus zwei
Feldern. Kein Markdown mit Überschriften: Eine Überschrift, die das Modell einmal
anders schreibt, ließe die beiden Felder ineinanderlaufen.

Die namentliche Mannschaft geht **nicht** an das Modell — im Fließtext des Berichts hat
sie nichts verloren, und was nicht hinausgeht, kann dort auch nicht auftauchen. Aus
demselben Grund bleiben Fahrer (Fahrtenbuch), Sammelplatz-Personal und Kostenersatz
draußen; die Atemschutz-Zeilen für das Modell nennen nur die Zahl der Geräteträger,
Messungen gehen als Kurzfassung (Anzahl und Spanne je Zahlenfeld). Die
Systemanweisung verbietet zusätzlich Namen von Betroffenen und hält fest, dass der
erfasste Text nur Material ist und Anweisungen darin nicht befolgt werden. Die Antwort
landet ausschließlich als reiner Text in Eingabefeldern, nie als HTML.

Der Knopf zum Erstellen erscheint nur mit Schreibrecht am Einsatz: Ein Gast mit reinem
Lesezugriff könnte das Ergebnis nicht speichern.

Das Ergebnis wird am Einsatz gespeichert (`sybosEinsatzablauf`, `sybosTaetigkeit`).
Sonst würde bei jedem Öffnen neu erzeugt, und Korrekturen von Hand gingen verloren.
Von Hand geänderter Text wird beim Verlassen des Feldes gespeichert. Einsatz-Gäste
ohne Schreibrecht sehen die Felder nur lesend.

## Tagebuch-Tabelle mit vier Spalten

`DiaryTable` (Druckseite und diese Seite) hat nur noch die Spalten Nr., Zeit, Von/An und
Eintrag. Mit je einer Spalte für Von, An, Information, Anmerkung und Erledigt blieb dem
eigentlichen Text auf A4 kaum Breite. Jetzt steht in der Eintragszelle der Titel fett,
darunter die Beschreibung und darunter „✓ erledigt" mit Zeit.
