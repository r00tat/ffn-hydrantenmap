# Verkehrsmeldungen (ASFINAG)

Die Kartenebene „Verkehrsmeldungen" zeigt Sperren, Baustellen und Ereignisse
auf Autobahnen und Schnellstraßen. Die Linien sind nach Art eingefärbt:
Sperren rot, Baustellen und Fahrstreifensperren orange, sonstige Ereignisse
ocker. Ein Klick öffnet den Wortlaut der Meldung samt Zeitraum und Link zur
ASFINAG.

## Quellen und warum nur diese

| Quelle | Verwendet | Begründung |
| --- | --- | --- |
| ASFINAG Content-Portal, Pakete `unplannedevents` und `roadworks_detailed` | ja | Maschinenlesbar (DATEX II 2.3), CC BY 4.0, Koordinaten je Abschnitt |
| Land Burgenland | nein | Sperren erscheinen nur als Pressetext ohne Koordinaten; Weiterverwendung wäre erlaubt, das Auslesen aber unzuverlässig |
| EVIS.AT / Landesstraßen | später | Eigener Zugang nötig; passt als zweite Quelle in dasselbe `RoadEvent`-Format |

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

## Verlauf entlang der Straße

Eine Meldung bringt nur Anfangs- und Endpunkt mit. Daraus wird der Verlauf auf
einem eigenen Netz der Autobahnen und Schnellstraßen berechnet
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
