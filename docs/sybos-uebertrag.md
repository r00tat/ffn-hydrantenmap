# Übertrag nach Sybos

Die Seite „Sybos-Übertrag" (`/einsatz/<id>/sybos`, Code unter
[src/components/pages/sybos/](../src/components/pages/sybos/)) zeigt einen Einsatz so,
dass er Feld für Feld in die Einsatzdokumentation von Sybos abgeschrieben werden kann.
Eine Schnittstelle zu Sybos gibt es nicht; die Seite ersetzt das Zusammensuchen aus
Karte, Tagebuch und Einsatzmittel-Übersicht.

## Aufbau

Die Reihenfolge folgt der Erfassung in Sybos:

1. **Basisdaten** — Einsatz, Feuerwehr, Beginn, Alarmierung, Eintreffen, Ende, Dauer,
   Einsatzort, Beschreibung.
2. **Einsatzablauf** — die beiden Freitextfelder „Einsatzablauf" und
   „Tätigkeit / Bemerkungen", von Gemini erstellt.
3. **Kräfte und Material** — eigene Fahrzeuge und Einheiten, namentliche Mannschaft,
   sonstige Kräfte, eingesetztes Material.
4. **Sonstige Notizen** — Einsatzorte mit ihren Notizen, Geschäftsbuch.
5. **Einsatztagebuch** — vollständig. Angezeigt als dieselbe Tabelle wie auf der
   Druckseite (`DiaryTable`), kopiert als Text mit einem Eintrag je Zeile.

## Warum fertiger Text und nicht Tabellen

Jedes Feld wird einzeln kopiert und in Sybos eingefügt. Die Funktionen in
`sybosReport.ts` liefern deshalb Text in genau der Form, in der er dort landet —
Zeitpunkte als `DD.MM.YYYY HH:mm` ohne Sekunden, eine Zeile je Einsatzmittel oder
Tagebucheintrag. Der Text ist deutsch, auch bei englischer Oberfläche: Er ist Inhalt
des Einsatzberichts, nicht Bedienoberfläche. Übersetzt sind nur die Feldbeschriftungen.

## Zeiten

Steht ein Zeitpunkt am Einsatz selbst (`eintreffen`, `abruecken`), gilt er. Sonst wird
er aus den Einsatzmitteln abgeleitet: erste Alarmierung, erstes Eintreffen, letztes
Abrücken — dieselbe Ableitung wie auf der Druckseite. Die Dauer läuft vom
Einsatzbeginn (`date`) bis zum Ende.

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

Die Systemanweisung verbietet Namen der Mannschaft und von Betroffenen im Text — die
Mannschaft steht namentlich in ihrem eigenen Feld, im Fließtext des Berichts hat sie
nichts verloren.

Das Ergebnis wird am Einsatz gespeichert (`sybosEinsatzablauf`, `sybosTaetigkeit`).
Sonst würde bei jedem Öffnen neu erzeugt, und Korrekturen von Hand gingen verloren.
Von Hand geänderter Text wird beim Verlassen des Feldes gespeichert. Einsatz-Gäste
ohne Schreibrecht sehen die Felder nur lesend.

## Tagebuch-Tabelle mit vier Spalten

`DiaryTable` (Druckseite und diese Seite) hat nur noch die Spalten Nr., Zeit, Von/An und
Eintrag. Mit je einer Spalte für Von, An, Information, Anmerkung und Erledigt blieb dem
eigentlichen Text auf A4 kaum Breite. Jetzt steht in der Eintragszelle der Titel fett,
darunter die Beschreibung und darunter „✓ erledigt" mit Zeit.
