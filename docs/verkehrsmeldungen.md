# Verkehrsmeldungen (ASFINAG und EVIS.AT)

Die Kartenebene „Verkehrsmeldungen" zeigt Sperren, Baustellen und Ereignisse
auf Autobahnen und Schnellstraßen (ASFINAG) und auf Landes- und
Bundesstraßen (EVIS.AT). Es ist **eine** Ebene; weitere Quellen kommen in
dasselbe `RoadEvent`-Format und erscheinen dort mit. Die Linien sind nach Art
eingefärbt: Sperren rot, Baustellen und Fahrstreifensperren orange, sonstige
Ereignisse ocker. Ein Klick öffnet den Wortlaut der Meldung samt Zeitraum und
Quelle.

## Quellen und warum nur diese

| Quelle | Verwendet | Begründung |
| --- | --- | --- |
| ASFINAG Content-Portal, Pakete `unplannedevents` und `roadworks_detailed` | ja | Maschinenlesbar (DATEX II 2.3), CC BY 4.0, Koordinaten je Abschnitt |
| Land Burgenland | nein | Sperren erscheinen nur als Pressetext ohne Koordinaten; Weiterverwendung wäre erlaubt, das Auslesen aber unzuverlässig |
| EVIS.AT Data Supply, Pakete `EventsUnplanned` und `EventsPlanned` je Bundesland | ja | Landesstraßen aller Länder, DATEX II 2.3 mit fertigem Verlauf, CC BY 4.0 ASFINAG, kostenlose Registrierung |
| EVIS.AT, Paket `TrafficRegulations` | nein, offen | Nur als DATEX II 3.3 oder GeoJSON; siehe „Bedingungen von EVIS.AT" |

### Bedingungen der ASFINAG

- Namensnennung „ASFINAG" (steht in der Attribution der Ebene und im Popup).
- Die ASFINAG will wissen, welche Dienste ihre Daten nutzen. Das ist eine
  Meldung an die ASFINAG, keine technische Sperre.
- Verkehrsbehördliche Maßnahmen dürfen nicht sinnverändert dargestellt
  werden. Deshalb wird eine Meldung **nie herabgestuft**: Enthält eine
  Situation am selben Ort mehrere Einträge, bestimmt der schwerste die Farbe
  (`merge` in `datex.ts`), und der Text bleibt bis auf Leerraum unverändert.
- Die ASFINAG behält sich Lastgrenzen vor. Deshalb gilt der Server-Cache von
  60 s je Paket **auch nach einem Fehler**: Ein Ausfall führt nicht zu
  Dauerabrufen.
- Keine Gewähr für Richtigkeit, steht im Popup.

### Bedingungen von EVIS.AT

- Lizenz „CC BY 4.0 ASFINAG", Namensnennung steht in der Attribution und je
  Meldung im Popup („Quelle: EVIS.AT").
- Der Zugang ist **persönlich**: Der Schlüssel steht in der Adresse
  (`?apiKey=`), und die Links dürfen laut Registrierungsmail nicht
  weitergegeben werden. Abgerufen wird deshalb nur am Server; Fehlermeldungen
  nennen den HTTP-Status, nie die Adresse (`evisHttp.ts`).
- Punkt 4 der Lizenz: Behördlich angeordnete Regelungen sind zu übernehmen
  und in ihrer Verkehrswirkung unverändert darzustellen. Gemeint sind alle
  Einträge mit `complianceOption = mandatory` und das ganze Paket
  `TrafficRegulations`. Ersteres erfüllt die Regel „nie herabstufen" oben.
  `TrafficRegulations` (Abfahrtssperren, Lkw-Fahrverbote) gibt es nur als
  DATEX II 3.3 oder GeoJSON und ist noch nicht eingebunden; im Burgenland war
  das Paket beim Einbau leer.

## Einrichtung

Im Content-Portal (<https://contentportal.asfinag.at/data>) mit einem
ASFINAG-Benutzerkonto anmelden, beide Pakete auswählen, die Lizenz annehmen
und „Zugriff freischalten“. Auf der Detailseite jedes Pakets (z. B.
`/data/details/unplannedevents`) zeigt „Daten abrufen“ den Zugangsschlüssel;
abgerufen wird `https://content.asfinag.at/services/resource/<Schlüssel>`.
Ein Client-Zertifikat ist derzeit nicht nötig — beide Schlüssel liefern ohne
eines HTTP 200. Die Unterstützung dafür bleibt für den Fall, dass die ASFINAG
es später verlangt.

| Variable | Inhalt |
| --- | --- |
| `ASFINAG_UNPLANNED_RESOURCE_KEY` | Schlüssel für `unplannedevents` |
| `ASFINAG_PLANNED_RESOURCE_KEY` | Schlüssel für `roadworks_detailed` |
| `ASFINAG_CLIENT_CERT` (optional) | Client-Zertifikat als PKCS#12, base64 |
| `ASFINAG_CLIENT_CERT_PASSWORD` (optional) | Kennwort dazu |

Ein Paket ohne Schlüssel wird übersprungen; fehlen beide, zeigt die Ebene
„nicht eingerichtet". Verlangt das Portal ein Client-Zertifikat, geht der
Abruf über `node:https`, weil `fetch` keines mitschicken kann
(`asfinagHttp.ts`).

In der Cloud liegen die beiden Schlüssel im Secret Manager von ffn-utils, für
dev und prod gemeinsam, und sind in `secret_env` beider Environments gemappt.
Terraform verwaltet nur die Hüllen (`terraform/projects/ffn-utils`); die
Secrets wurden samt Version von Hand angelegt und per `imports.tf`
übernommen, weil ein gemapptes Secret ohne Version den Rollout scheitern
lässt. Einen neuen Schlüssel spielt man so ein:

```bash
gcloud secrets versions add ASFINAG_PLANNED_RESOURCE_KEY --project ffn-utils --data-file=-
```

Danach neu deployen; der Dienst liest `latest` nur beim Start.

### EVIS.AT

Registrierung unter <https://evis.asfinag.at/UserManagement/Subscribe>; die
Mail danach enthält je Paket, Format und Region einen Link der Form

```text
https://datasupply-evis.asfinag.at/1.0/getdata/<Paket>/<Region>/2.2.3?apiKey=<Schlüssel>
https://datasupply-evis.asfinag.at/1.0/getchecksum/<Paket>/<Region>/2.2.3?apiKey=<Schlüssel>
```

Der Schlüssel ist für alle Links derselbe.

| Variable | Inhalt |
| --- | --- |
| `EVIS_API_KEY` | `apiKey` aus den Links |
| `EVIS_REGIONS` (optional) | Regionen, kommagetrennt; Vorgabe `AT-1,AT-3` |

Regionen: `AT-1` Burgenland bis `AT-9` Wien (ISO 3166-2), `AT-ASF` nur
ASFINAG, `AT` alles. Die Länderpakete enthalten **keine** ASFINAG-Strecken;
die kommen weiter vom Content-Portal, so gibt es keine Doppelungen. Wer
`AT-ASF` oder `AT` einträgt, bekommt Autobahnmeldungen doppelt, solange das
Portal auch eingerichtet ist.

Eine Baustelle über eine Landesgrenze (etwa Sommerein–Bruckneudorf) steht in
den Paketen beider Länder. Die Quelle führt die Meldungen aller Pakete
deshalb über ihren Schlüssel (Situation und Ort) zusammen und behält die
neueste Version.

`EVIS_API_KEY` liegt wie die ASFINAG-Schlüssel im Secret Manager von
ffn-utils, von Hand samt Version angelegt und in `secret_env` beider
Environments gemappt:

```bash
gcloud secrets versions add EVIS_API_KEY --project ffn-utils --data-file=-
```

Eigenheiten des Data Supply:

- Die Antwort ist gzip als `application/gzip`, **ohne**
  `Content-Encoding` — `fetch` entpackt sie nicht. Erkannt wird gzip an den
  ersten beiden Bytes (`decodeBody`).
- HTTP 204 heißt: Für Paket und Region gibt es gerade nichts.
- Jeder Abruf liefert den ganzen Datensatz, keine Änderungen. Der Leitfaden
  empfiehlt, vorher die Prüfsumme zu fragen (`getchecksum`, JSON mit
  `"Checksum"` als **Zahl**). Die Quelle fragt nach Ablauf der 60 s nur die
  Prüfsumme und lädt das Paket nur bei Änderung neu. Das zuletzt geladene XML
  wird trotzdem jede Minute neu ausgewertet, weil Zeitfenster an der Uhrzeit
  hängen, nicht an den Daten. Ist die Prüfsumme nicht abrufbar, wird das
  Paket geladen.

## Landesstraßen (EVIS.AT)

Die Meldungen der Länder unterscheiden sich in drei Punkten von denen des
Portals; `datex.ts` liest beide:

- **Route statt Abschnitt.** Die meisten Einträge beschreiben ihren Ort als
  `ItineraryByIndexedLocations`, meist mit einem Abschnitt je Fahrtrichtung.
  Jeder Abschnitt wird eine eigene Linie; ein Klick zeigt die Situation
  trotzdem nur einmal (`eventsAtPoint`).
- **Verlauf mitgeliefert.** `linearByCoordinates` enthält neben Anfang und
  Ende die Zwischenpunkte (`intermediate`), dazu GIP-Link-IDs. Die Linie wird
  so gezeichnet, ohne Netz und ohne Suche. Eine Landesstraßenmeldung ohne
  Zwischenpunkte wird **nicht** auf das Autobahnnetz geschnappt, sondern als
  gestrichelte Gerade gezeichnet — das Netz kennt nur A und S.
- **Zeitfenster.** Viele Baustellen gelten nur zu bestimmten Zeiten, z. B.
  werktags 07:30–17:00 (`validPeriod` mit `recurringTimePeriodOfDay` und
  `recurringDayWeekMonthPeriod`). Außerhalb des Fensters ist die Meldung
  nicht auf der Karte. Tageszeit und Wochentag gelten in der Zeitzone, die
  bei der Uhrzeit steht (EVIS: `+01:00`). `exceptionPeriod` blendet aus.

Außerdem: Ein Eintrag kann mehrere Kommentare haben (Beschreibung und
„sonstiges"); alle werden gezeigt, die Beschreibung zuerst. Manche Texte
enthalten statt der Ortsnamen interne IDs („B50 - Burgenland Straße 9c0c…
– 1cac…:"); die IDs fallen weg, sonst bleibt der Wortlaut unverändert.
`trafficConstrictionType = carriagewayBlocked` (Richtungsfahrbahn gesperrt)
gilt als Sperre.

## Verlauf entlang der Autobahn

Eine Meldung des Portals bringt nur Anfangs- und Endpunkt mit. Daraus wird
der Verlauf auf einem eigenen Netz der Autobahnen und Schnellstraßen berechnet
(`motorwayPath.ts`), nicht über einen Routing-Dienst: Google und Co. kennen die
Sperre und fahren um sie herum — genau den gesperrten Abschnitt würden sie
nicht zeichnen.

- **Netz:** aus dem GIP-OGD-Export (GIP 2.0), Kategorien A und S, gerichtet
  nach `ONEWAY_CAR`. Die alten GIP-Link-IDs in den DATEX-Meldungen
  (`GIPAT2509…`) gibt es in GIP 2.0 nicht mehr, deshalb werden die Punkte an
  das Netz geschnappt statt über IDs zugeordnet.
- **Suche:** Anfang und Ende an bis zu sechs Links im Umkreis von 150 m,
  dann Dijkstra im gerichteten Graphen. So landet eine Meldung auf der
  richtigen Richtungsfahrbahn.
- **Plausibilität:** Ist der Weg länger als 1,5 × Luftlinie + 1 km, wäre es
  ein Umweg über die Gegenfahrbahn oder eine Abfahrt. Dann wird eine
  gestrichelte Gerade gezeichnet (`approximate`), und das Popup sagt es.
- Der Verlauf wird je Meldung und Version zwischengespeichert.

### Netz neu bauen

Das Netz liegt als `src/server/roadEvents/data/gip-motorways.json` (~1,5 MB) im
Repo. Neu bauen, wenn sich das Autobahnnetz ändert:

```bash
npm run extractGipMotorways -- idf_LINK.txt idf_NODE.txt idf_LINK_COORDINATE.txt
```

Die drei Dateien stammen aus
<https://open.gip.gv.at/ogd/A_routingexport_ogd_split.zip> (5,5 GB). Zwei
Eigenheiten des Formats:

- `LINK_COORDINATE` enthält **nur die Zwischenpunkte**; Anfang und Ende sind
  die Knoten aus `idf_NODE`. Ein gerader Link hat gar keine Zwischenpunkte.
- Die Zwischenpunkte laufen nach `SEQUENCE` vom Anfangs- zum Endknoten. Das
  Skript prüft das am amtlichen `LENGTH`; abweichend waren beim letzten Bau 4
  von rund 22 000 Links.

`motorwayNetwork.test.ts` zeichnet die Fixture-Meldungen auf dem echten Netz
und schlägt fehl, wenn eine davon auf die Gerade zurückfällt.

## Laden auf der Karte

Die Ebene lädt den Kartenausschnitt plus je Seite eine Ausschnittsbreite.
Neu geladen wird erst, wenn die Ansicht diesen Bereich verlässt, oder nach
5 Minuten. Kleines Verschieben löst also keinen Abruf aus. Offline wird nichts
abgerufen; die Ebene sagt das.

## Übereinanderliegende Meldungen

Sperre und Baustelle desselben Abschnitts kommen oft aus beiden Paketen
gleichzeitig — am Arlberg etwa die Totalsperre aus `unplannedevents` und die
Baustelle dazu aus `roadworks_detailed`. Die Linien liegen dann genau
übereinander, die rote verdeckt die orange vollständig. Ein Klick öffnet
deshalb nicht das Popup der obersten Linie, sondern listet alle Meldungen im
Umkreis von 10 Bildschirmpixeln, die schwerste zuerst (`eventsAtPoint` in
`roadEventsHit.ts`). Eine Situation mit mehreren Abschnitten erscheint dabei
nur einmal. Zusammengeführt werden die Meldungen bewusst nicht: Es sind zwei
eigenständige Mitteilungen der ASFINAG mit eigenem Wortlaut und Zeitraum.
