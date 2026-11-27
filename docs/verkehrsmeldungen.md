# Verkehrsmeldungen (EVIS.AT)

Die Kartenebene „Verkehrsmeldungen" zeigt Sperren, Baustellen und Ereignisse
auf Autobahnen, Schnellstraßen, Bundes- und Landesstraßen in ganz Österreich.
Die Daten kommen von EVIS.AT, dem Verkehrsinformationssystem der ASFINAG und
der Länder. Es ist **eine** Ebene; kommt später eine weitere Quelle dazu,
liefert sie dasselbe `RoadEvent`-Format und erscheint dort mit (`source` am
Element, Quellenzeile im Popup). Die Linien sind nach Art eingefärbt: Sperren
rot, Baustellen und Fahrstreifensperren orange, sonstige Ereignisse ocker. Ein
Klick öffnet den Wortlaut der Meldung samt Zeitraum und Quelle.

## Quellen und warum nur diese

| Quelle | Verwendet | Begründung |
| --- | --- | --- |
| EVIS.AT Data Supply, Pakete `EventsUnplanned` und `EventsPlanned`, Region `AT` | ja | Ganz Österreich samt ASFINAG-Strecken, DATEX II 2.3 mit fertigem Verlauf, CC BY 4.0 ASFINAG, kostenlose Registrierung |
| EVIS.AT, Paket `TrafficRegulations` | nein, offen | Nur als DATEX II 3.3 oder GeoJSON; siehe „Bedingungen" |
| ASFINAG Content-Portal (`unplannedevents`, `roadworks_detailed`) | nicht mehr | War die erste Quelle für Autobahnen; EVIS liefert dieselben Meldungen samt Verlauf, siehe unten |
| Land Burgenland | nein | Sperren erscheinen nur als Pressetext ohne Koordinaten |

### Warum nicht mehr das Content-Portal

Das Portal lieferte nur Anfangs- und Endpunkt je Abschnitt. Den Verlauf
musste die Einsatzkarte selbst auf einem eigenen Autobahnnetz aus der GIP
berechnen — ein Routing-Dienst wäre um die Sperre herumgefahren. EVIS liefert
für die Autobahnen dieselben Abschnitte (beim Umbau 435 geplante, gleiche
Links, 417 davon mit Verlauf) und den Verlauf gleich mit. Damit entfielen das
Netz (~1,5 MB im Repo), sein Extraktionsskript, ein zweiter Zugang samt
Client-Zertifikat und zwei Secrets.

Bewusst in Kauf genommen: Bei den ungeplanten Ereignissen fehlen in EVIS fünf
Langzeitsperren von Rastplatzrampen, die nur das Portal hatte.

### Bedingungen

- Lizenz „CC BY 4.0 ASFINAG", Namensnennung steht in der Attribution der
  Ebene und je Meldung im Popup („Quelle: EVIS.AT").
- Der Zugang ist **persönlich**: Der Schlüssel steht in der Adresse
  (`?apiKey=`), und die Links dürfen laut Registrierungsmail nicht
  weitergegeben werden. Abgerufen wird deshalb nur am Server; Fehlermeldungen
  nennen den HTTP-Status, nie die Adresse (`evisHttp.ts`).
- Verkehrsbehördliche Maßnahmen dürfen nicht sinnverändert dargestellt
  werden (Punkt 4 der Lizenz). Deshalb wird eine Meldung **nie
  herabgestuft**: Enthält eine Situation am selben Ort mehrere Einträge,
  bestimmt der schwerste die Farbe (`merge` in `datex.ts`), und der Text
  bleibt bis auf Leerraum und die UUIDs (siehe unten) unverändert. Das deckt
  die Einträge mit `complianceOption = mandatory` ab. Das Paket
  `TrafficRegulations` (Abfahrtssperren, Lkw-Fahrverbote) gibt es nur als
  DATEX II 3.3 oder GeoJSON und ist noch nicht eingebunden.
- Die ASFINAG behält sich Lastgrenzen vor. Deshalb gilt der Server-Cache von
  60 s je Paket **auch nach einem Fehler**: Ein Ausfall führt nicht zu
  Dauerabrufen.
- Keine Gewähr für Richtigkeit, steht im Popup.

## Einrichtung

Registrierung unter <https://evis.asfinag.at/UserManagement/Subscribe>; die
Mail danach enthält je Paket, Format und Region einen Link der Form

```text
https://datasupply-evis.asfinag.at/1.0/getdata/<Paket>/<Region>/2.2.3?apiKey=<Schlüssel>
https://datasupply-evis.asfinag.at/1.0/getchecksum/<Paket>/<Region>/2.2.3?apiKey=<Schlüssel>
```

Der Schlüssel ist für alle Links derselbe.

| Variable | Inhalt |
| --- | --- |
| `EVIS_API_KEY` | `apiKey` aus den Links; ohne ihn zeigt die Ebene „nicht eingerichtet" |
| `EVIS_REGIONS` (optional) | Regionen, kommagetrennt; Vorgabe `AT` |

Regionen: `AT` ganz Österreich, `AT-ASF` nur ASFINAG, `AT-1` Burgenland bis
`AT-9` Wien (ISO 3166-2, **ohne** ASFINAG-Strecken). Die Vorgabe `AT` deckt
alles ab. Einzelne Länder einzustellen spart wenig: Von den gut 50 MB der
geplanten Ereignisse entfallen über 40 MB auf `AT-ASF`, und das lässt sich
nicht weiter teilen. Eine Situation über eine Landesgrenze steht in den
Paketen beider Länder; sind mehrere Regionen eingestellt, führt die Quelle
die Meldungen über ihren Schlüssel (Situation und Ort) zusammen und behält die
neueste Version.

`EVIS_API_KEY` liegt im Secret Manager von ffn-utils, für dev und prod
gemeinsam, und ist in `secret_env` beider Environments gemappt. Terraform
verwaltet nur die Hülle (`terraform/projects/ffn-utils`); das Secret wurde
samt Version von Hand angelegt und per `imports.tf` übernommen, weil ein
gemapptes Secret ohne Version den Rollout scheitern lässt. Einen neuen
Schlüssel spielt man so ein:

```bash
gcloud secrets versions add EVIS_API_KEY --project ffn-utils --data-file=-
```

Danach neu deployen; der Dienst liest `latest` nur beim Start.

## Abruf und Auswertung

Eigenheiten des Data Supply:

- Die Antwort ist gzip als `application/gzip`, **ohne**
  `Content-Encoding` — `fetch` entpackt sie nicht. Erkannt wird gzip an den
  ersten beiden Bytes (`decodeBody`).
- HTTP 204 heißt: Für Paket und Region gibt es gerade nichts.
- Jeder Abruf liefert den ganzen Datensatz, keine Änderungen. Der Leitfaden
  empfiehlt, vorher die Prüfsumme zu fragen (`getchecksum`, JSON mit
  `"Checksum"` als **Zahl**). Ist die Prüfsumme nicht abrufbar, wird das
  Paket geladen.

Daraus folgen zwei getrennte Schritte (`roadEventsSource.ts`):

1. **Lesen nur bei geänderter Prüfsumme.** Nach Ablauf der 60 s fragt die
   Quelle die Prüfsumme. Nur wenn sie sich geändert hat, lädt sie das Paket
   und liest es in kompakte Datensätze (`parseDatexRecords`). Das XML wird
   danach nicht behalten.
2. **Zeitfenster je Minute.** Aus den Datensätzen wählt `currentEvents` die
   gerade gültigen Meldungen. Das Ergebnis gilt eine Minute, dann wird neu
   ausgewählt — auch bei unveränderter Prüfsumme, weil Zeitfenster an der Uhr
   hängen, nicht an den Daten.

Beim Lesen von ganz Österreich zählt der Speicher (Cloud Run: 1 GiB):

- **Unnötige Blöcke fallen vor dem Parsen weg** (`stripUnusedBlocks`): die
  Übersicht über das Bauvorhaben (`situationExtension`, würde Abschnitte
  doppelt zeigen), die GIP-Kanten (`extendedLinearForGipLink`) und die
  ALERT-C-Orte (`alertCLinear`). Bei den Autobahnen halbiert das Größe und
  Parse-Zeit.
- **Situation für Situation.** Als ein Objektbaum belegte das ganze Paket
  mehrere hundert MB; gelesen wird deshalb jede Situation einzeln.
- **Eigene Kopien der Texte.** Texte aus dem Parser sind in V8 oft nur
  Ausschnitte des Dokuments und hielten die gut 50 MB ganz im Speicher. Ein
  Umweg über JSON legt eigene Kopien an.

Gemessen beim Umbau: rund 3900 Datensätze, die danach etwa 25 MB belegen.
Beim Neulesen steigt der Speicher kurz um etwa 0,5 GB und fällt dann wieder.

## Was in den Meldungen steht

- **Route statt Abschnitt.** Die meisten Einträge beschreiben ihren Ort als
  `ItineraryByIndexedLocations`, meist mit einem Abschnitt je Fahrtrichtung,
  manche als einzelnen Abschnitt (`Linear`). Jeder Abschnitt wird eine eigene
  Linie; ein Klick zeigt die Situation trotzdem nur einmal (`eventsAtPoint`).
- **Verlauf mitgeliefert.** `linearByCoordinates` enthält neben Anfang und
  Ende die Zwischenpunkte (`intermediate`). Die Linie wird so gezeichnet,
  ohne eigenes Netz und ohne Suche. Fehlen die Zwischenpunkte (beim Umbau 23
  von 970 Meldungen), wird eine **gestrichelte Gerade** gezeichnet
  (`approximate`), und das Popup sagt es; sind Anfang und Ende gleich, ein
  Punkt.
- **Zeitfenster.** Viele Baustellen gelten nur zu bestimmten Zeiten, z. B.
  werktags 07:30–17:00 (`validPeriod` mit `recurringTimePeriodOfDay` und
  `recurringDayWeekMonthPeriod`). Außerhalb des Fensters ist die Meldung
  nicht auf der Karte. Tageszeit und Wochentag gelten in der Zeitzone, die
  bei der Uhrzeit steht (EVIS: `+01:00`). `exceptionPeriod` blendet aus.
- **Kommentare.** Ein Eintrag kann mehrere haben (Beschreibung und
  „sonstiges"); alle werden gezeigt, die Beschreibung zuerst.
- **UUIDs im Text.** Manche Texte enthalten statt der Ortsnamen interne IDs
  („B50 - Burgenland Straße 9c0c… – 1cac…:"); die IDs fallen weg, sonst
  bleibt der Wortlaut unverändert.
- **Sperre.** Untertypen wie `roadClosed` und
  `trafficConstrictionType = roadBlocked` oder `carriagewayBlocked`
  (Richtungsfahrbahn gesperrt) gelten als Sperre.

## Laden auf der Karte

Die Ebene lädt den Kartenausschnitt plus je Seite eine Ausschnittsbreite.
Neu geladen wird erst, wenn die Ansicht diesen Bereich verlässt, oder nach
5 Minuten. Kleines Verschieben löst also keinen Abruf aus. Offline wird nichts
abgerufen; die Ebene sagt das.

## Übereinanderliegende Meldungen

Sperre und Baustelle desselben Abschnitts kommen oft gleichzeitig — am
Arlberg etwa die Totalsperre aus den ungeplanten Ereignissen und die
Baustelle dazu aus den geplanten. Die Linien liegen dann genau übereinander,
die rote verdeckt die orange vollständig. Ein Klick öffnet deshalb nicht das
Popup der obersten Linie, sondern listet alle Meldungen im Umkreis von 10
Bildschirmpixeln, die schwerste zuerst (`eventsAtPoint` in
`roadEventsHit.ts`). Eine Situation mit mehreren Abschnitten erscheint dabei
nur einmal. Zusammengeführt werden die Meldungen bewusst nicht: Es sind zwei
eigenständige Mitteilungen mit eigenem Wortlaut und Zeitraum.
