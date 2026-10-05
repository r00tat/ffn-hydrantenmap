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
   sonstige Kräfte, eingesetztes Material, Geräte und Verbrauchsmaterial aus
   `geraetEinsatz`, Fahrten aus dem Fahrtenbuch mit Kilometern.
4. **Atemschutz** — Leiter des Sammelplatzes und Füllpersonal, eine Zeile je
   Bereitstellung eines Trupps mit Auftrag, Zeiten und Druck, die Geräte der Trupps
   (eine Zeile je Gerät mit Träger und Kennung), die Ausgabe am Sammelplatz und je
   Bereitstellung das ganze Protokoll: Kopfdaten (Überwachung, Gerätesatz, Bemerkung),
   alle Ereignisse mit Druck — Übergabe, Übernahme der Zeitkontrolle, Abmarsch, jede
   Druckabfrage und Statusmeldung, verschickte Warnungen, Rückkehr — und die Druckkurve
   der Überwachungsseite, gezeichnet bis zur Rückkehr. Ankunft und Rückzug heißen nur an
   der ersten Meldung so, wie auf der Überwachungsseite.
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

## Dieselben Abschnitte auf der Druckseite

Alarmierungstext, Einsatzablauf und Tätigkeit, Mannschaft und Fahrten, der ganze
Atemschutz samt Protokoll je Trupp und die Anhänge an Elementen stehen auch auf der
Druckseite ([PrintEinsatzExtras.tsx](../src/components/pages/PrintEinsatzExtras.tsx)).
Sie verwenden dieselben Tabellen und Hooks (`useAtemschutzReport`,
`useFirecallAlarmText` in [useEinsatzReport.ts](../src/components/pages/sybos/useEinsatzReport.ts)),
damit Ausdruck und Übertrag nicht auseinanderlaufen. Auf Papier fehlen nur die
Kopier-Knöpfe. Messreihen bekommen dort keine eigene Tabelle: Die Datenfelder stehen
schon in den Einsatzmittel-Details je Ebene. Kostenersatz bleibt draußen, er hat einen
eigenen Beleg.

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

## Geräte und Verbrauchsmaterial

Die Einträge unter „Geräte" am Einsatz (`call/{id}/geraetEinsatz`, siehe
[geraete-lager.md](geraete-lager.md)) stehen in einer eigenen Tabelle, **eine Zeile je
Artikel und Art**: In Sybos steht ein Gerät einmal im Bericht. Mengen und Stunden
werden summiert, die Lagerorte der Verbräuche aufgezählt — Material von zwei
Fahrzeugen bleibt eine Zeile.

Die **Sybos-ID** steht mit in der Tabelle. Die Bezeichnungen wiederholen sich
(„Atemschutzmaske", „Handfunkgerät"), die ID nicht; über sie findet man den Artikel
in der Geräteauswahl von Sybos eindeutig. Beim Import ist die Dokument-ID die
Sybos-ID, deshalb reicht sie als Rückfall.

Die Stammdaten (Bezeichnung, Inventarnummer, Einheit, Lagerorte) liest nur ein
Mitglied der Gruppe. Ein Einsatz-Gast sieht die Zeilen trotzdem, mit dem am Eintrag
kopierten Namen und ohne Lagerort.

An Gemini geht nur Bezeichnung, Menge, Stunden und Art — die Bemerkung nicht, sie
kann Namen enthalten.

## Übertrag mit der Chrome-Erweiterung

Die Erweiterung (`chrome-extension/`) überträgt zwei Teile dieser Seite selbst.

**Geräte** („Geräte übernehmen" im Abschnitt „Automatisch übernehmen"). Dieselben
zwei Sybos-Formulare wie bei den Fahrzeugen: Geräteauswahl (`frmGeraetSelect`), dann
das Material-Formular mit der Anzahl. Zugeordnet wird **über die Sybos-ID, nicht über
den Namen** — die Zeilen-ID der Auswahl ist die Artikel-ID des Sybos-Exports. Die
Zusammenfassung je Artikel rechnet `resolveEinsatzGeraeteForSybos`
(`src/common/geraetSybosTransfer.ts`), damit Seite und Erweiterung gleich zählen:

- Stunden gehen vor Stück; Sybos nimmt nur ganze Zahlen, gerundet wird auf
  mindestens 1 und die Erweiterung zeigt den ursprünglichen Wert an.
- Die Geräteauswahl zeigt **eine Liste je Artikeltyp** („Listenauswahl": Gerät,
  Container, Bekleidung … zwölf insgesamt). Die Liste wählt die Erweiterung über die
  `Kategorie` des Sybos-Exports, die dieselben Wörter trägt; ohne Stammdaten gilt
  „Gerät". Das sichtbare Auswahlfeld hat keinen Namen, gesendet wird das versteckte
  Feld `frmListeListSelect`.
- Die Listen kommen **seitenweise zu 100** („1 - 100 von 294"), die nächste Seite
  ist dasselbe Formular mit `BListFrom=100`. Mit `filter=1` („Bereits hinzugefügte
  Geräte nicht anzeigen") fällt ein Artikel nach dem Speichern aus der Liste; deshalb
  lädt die Erweiterung nach jedem Speichern dieselbe Seite neu, statt weiterzublättern.
- Von Hand angelegte Artikel ohne Sybos-ID fehlen — es gibt sie in Sybos nicht.
- Gelesen werden nur die Stammdaten der im Einsatz genannten Artikel, nicht der
  ganze Bestand. Ein Einsatz-Gast darf sie nicht lesen; dann gilt die Artikel-ID.

Grundlage ist der Mitschnitt `captures/add-geraete-2.har` (Filter auf Gerät,
Klasse 1, drei Artikel, Anzahl, Speichern). Mehrere Seiten und Container sind darin
nicht durchgespielt; der Knopf ist deshalb vorerst nicht Teil von „Material &
Mannschaft übernehmen".

**Einsatzbericht-Text** („Texte eintragen"). Die Detailseite eines Einsatzes ist in
Sybos schon das Bearbeitungsformular. Die Erweiterung schreibt `sybosEinsatzablauf`
in „Einsatzablauf" (`ESunfallhergang`) und `sybosTaetigkeit` in „Tätigkeit /
Bemerkung" (`ESbemerkungIntern`) **ins offene Formular, ohne zu speichern** —
gespeichert wird mit dem Knopf von Sybos. So lässt sich der Text vorher lesen, und ein
Senden im Hintergrund samt Neuladen kann keine anderen ungespeicherten Änderungen
verwerfen. Steht in Sybos schon ein anderer Text, fragt sie vor dem Überschreiben.

## Zusammenfassung durch Gemini

Der Aufruf läuft im Browser über `firebase/ai` wie die übrigen KI-Abfragen
([sybosSummary.ts](../src/components/pages/sybos/sybosSummary.ts)). Das Modell bekommt
alle Abschnitte der Seite als Text und antwortet mit einem **JSON-Schema** aus zwei
Feldern. Kein Markdown mit Überschriften: Eine Überschrift, die das Modell einmal
anders schreibt, ließe die beiden Felder ineinanderlaufen.

Die namentliche Mannschaft geht **nicht** an das Modell — im Fließtext des Berichts hat
sie nichts verloren, und was nicht hinausgeht, kann dort auch nicht auftauchen. Aus
demselben Grund bleiben Fahrer (Fahrtenbuch), Sammelplatz-Personal, Trupp-Protokolle,
Geräte der Trupps und Kostenersatz draußen; die Atemschutz-Zeilen für das Modell nennen nur die Zahl der Geräteträger,
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
