# Rettungskarten (Euro Rescue)

Die Einsatzkarte verlinkt die ISO-17840-Rettungskarten aus dem Euro-Rescue-Katalog
von Euro NCAP: automatisch nach einer Kennzeichenabfrage und über die Seite
`/rettungskarten` zur freien Suche.

## Warum kein Deep Link in die Euro-Rescue-App

Naheliegend wäre, aus dem Ergebnis der Kennzeichenabfrage in die installierte
Euro-Rescue-App zu springen. Das geht nicht:

- Weder `rescue.euroncap.com` noch `euroncap.com` liefern eine
  `apple-app-site-association` oder `assetlinks.json` — Universal Links und
  App Links sind schlicht nicht eingerichtet, ein Link kann die App also nicht
  ansteuern.
- Die Web-Version ist eine Flutter-App mit festen Routen (`/brands`, `/search`,
  `/modelSelection`, `/carDetails`). Die Routen bekommen ihr Fahrzeug
  ausschließlich als In-Memory-Argument aus `pushNamed`; es gibt weder IDs im
  Pfad noch Query-Parameter. Ein Direktaufruf von `/carDetails` zeigt kein
  Fahrzeug.

Verlinkt wird deshalb direkt das PDF der Rettungskarte.

## Die Datenquelle

Die Inhalts-API hinter der App ist ohne Authentifizierung lesbar:

| Endpunkt | Inhalt |
| --- | --- |
| `https://api.rescue.euroncap.com/euro-rescue/makes` | Marken |
| `https://api.rescue.euroncap.com/euro-rescue/models` | Modelle |
| `https://api.rescue.euroncap.com/euro-rescue/variants` | Varianten samt Dokumentliste (~4 MB) |
| `https://api.rescue.euroncap.com/euro-rescue/documents` | alle Dokumente |

Verwendet wird nur `variants`: dort hängen an jeder Variante `make_name`,
`model_name`, `name`, `body_type`, `build_year_from`/`build_year_until`,
`doors`, `powertrain`, `picture_url` und die Dokumente mit ihrer PDF-URL je
Sprache (25 Sprachen) und Typ (`Rescue Sheet` je Variante, `Rescue Guide` je
Marke). Stand August 2026: 1851 Varianten, 78 Marken inklusive Lkw und Bus
(DAF, MAN, Scania, IVECO, Renault Trucks), aber deutlich EU-Neuwagen-lastig —
ältere und exotische Fahrzeuge fehlen.

**Die PDFs werden nicht gespiegelt.** Verlinkt wird die Original-URL bei
Euro NCAP, geöffnet wird in einem neuen Tab. Ein Teil der Dokumente zeigt
direkt auf `strescueeuprdwe01.blob.core.windows.net` statt auf die
API-Domain; beide Formen kommen unverändert aus der API und werden unverändert
verlinkt.

**Nur `https:`-URLs werden übernommen.** Die Adressen der PDFs und Bilder
kommen aus einer fremden, nicht authentifizierten API und landen in der
Oberfläche direkt in `href` und `src`; ein `javascript:` oder `data:` von dort
liefe in unserem Origin. `safeUrl()` in
[`euroRescueCatalog.ts`](../src/server/rescue/euroRescueCatalog.ts) verwirft
daher alles andere. Der Host bleibt bewusst ungeprüft — eine Host-Liste würde
beim nächsten Umzug des Blob-Storage still alle Dokumente ausblenden.

## Die Fahrzeugbilder laufen über den eigenen Origin

Die PDFs werden verlinkt, die Bilder **nicht**: sie kommen über
`/api/rettungskarten/bild/<variantId>`. Der Grund ist kein Datenschutz und
keine Bequemlichkeit, sondern ein Fehler bei Euro NCAP:

**Alle Fahrzeugbilder werden mit `Content-Type: application/pdf` ausgeliefert.**
Die Bytes sind einwandfreie PNGs — `picture_url` endet auf `.png`/`.PNG`, und
ein `curl` liefert `PNG image data, 800 x 450` —, aber der Header behauptet
etwas anderes. Für eine cross-origin-Antwort ohne CORS steht `application/pdf`
auf der „never sniffed"-Liste von Chromes Opaque Response Blocking: der Browser
verwirft die Antwort mit `net::ERR_BLOCKED_BY_ORB`, ohne die Bytes überhaupt
anzusehen. Direkt verlinkt erschien deshalb **kein einziges** Fahrzeugbild —
nicht nur bei einzelnen Fahrzeugen, sondern bei allen; nachgemessen mit
Chromium: direkt `naturalWidth 0`, über den eigenen Origin `800 × 450`.

Über den eigenen Origin greift ORB nicht. Die Route holt das Bild,
**bestimmt den Typ aus den ersten Bytes** (`sniffImageType` in
[`rescuePicture.ts`](../src/server/rescue/rescuePicture.ts)) und liefert es mit
dem richtigen `Content-Type` und `X-Content-Type-Options: nosniff` aus. Was
sich nicht als Bild ausweist, wird verworfen — sonst lieferte die Route
beliebige fremde Bytes unter unserem Origin aus.

**Der Aufrufer nennt eine Varianten-ID, keine URL.** Die Adresse kommt aus dem
serverseitig zwischengespeicherten Katalog. Damit ist die Route kein offener
Proxy, und es gibt nichts gegen SSRF abzusichern, was `safeUrl()` beim Einlesen
des Katalogs nicht schon geprüft hätte. Angemeldet wird über die
Session-Cookie und nicht über `userRequired`: ein `<img src>` schickt keinen
Authorization-Header.

Sollte Euro NCAP den Content-Type eines Tages richtigstellen, kann der Umweg
weg — nötig ist er dann nicht mehr, schaden tut er aber auch nicht.

**Die API ist undokumentiert.** Sie kann jederzeit ausfallen oder ihr Format
ändern. Deshalb ist jeder Aufrufer fehlertolerant: die Kennzeichenabfrage
liefert dann leere Trefferlisten statt zu scheitern, die Suchseite zeigt einen
Hinweis.

## Cache

[`src/server/rescue/euroRescueCatalog.ts`](../src/server/rescue/euroRescueCatalog.ts)
hält den Variantenkatalog 24 Stunden im Prozess-Cache; gleichzeitige Aufrufe
teilen sich eine Anfrage. Scheitert das Nachladen eines abgelaufenen Caches,
bleiben die alten Daten in Verwendung und der nächste Aufruf versucht es in
einer Minute erneut — eine Woche alte Rettungskarte ist besser als keine.

Ein Kaltstart auf Cloud Run zahlt den 4-MB-Download einmal (rund zwei bis drei
Sekunden). Das ist bewusst so: eine Kopie des Katalogs in Firestore wäre
schneller, würde aber Daten vorhalten, die uns nicht gehören.

## Zuordnung Zulassung → Variante

[`src/common/rescue/matchVehicle.ts`](../src/common/rescue/matchVehicle.ts)
ordnet ein Fahrzeug der ÖBFV-Kennzeichenabfrage den Katalogvarianten zu:

- **Marke** muss übereinstimmen, normalisiert und über eine Aliastabelle
  aufgelöst (`VW` → `Volkswagen`, `MERCEDES` → `Mercedes-Benz`, …). Die
  Zulassungsdaten schreiben Marken in Großbuchstaben und teils abgekürzt.
- **Modellname** wird gegen `model_name` und `name` geprüft, abgestuft von
  Gleichheit über Präfix bis Teilstring. Ohne jede Übereinstimmung fällt die
  Variante raus.
- **Erstzulassungsjahr** muss im Bauzeitraum liegen. Eine Toleranz von einem
  Jahr fängt Vorführ- und Lagerfahrzeuge ab, deren Erstzulassung neben dem
  Modelljahr liegt. Ein Jahr klar außerhalb schließt die Variante aus — das
  trennt z.B. beim Tesla Model 3 die Baureihe ab 2019 von der ab 2024.
- **Antrieb** wertet zusätzlich auf, wenn er passt (`Elektro` → `Electric`,
  `Diesel`/`Benzin` → `Gasoline/Diesel`, …).

Die FIN ist nicht verwertbar — Euro Rescue führt keinen VIN-Index.

Das Ergebnis ist eine absteigend sortierte Liste. Die Oberfläche zeigt den
besten Treffer offen und die weiteren Varianten eingeklappt; die Entscheidung
trifft der Mensch vor dem Fahrzeug.

## Sprache

Die Dokumente werden in der App-Sprache des Benutzers gewählt (`de`/`en`), mit
Rückfall auf die jeweils andere und zuletzt auf irgendeine vorhandene Sprache.
Eine Rettungskarte in fremder Sprache ist im Einsatz immer noch besser als
keine; die Piktogramme nach ISO 17840 sind ohnehin sprachunabhängig.

## Einsatztagebuch

Der Tagebucheintrag der Kennzeichenabfrage bekommt eine Zeile
`Rettungskarte: <Marke Modell> (<Bauzeitraum>): <URL>` mit dem besten Treffer,
damit im Einsatzbericht nachvollziehbar bleibt, welche Karte vorlag.
