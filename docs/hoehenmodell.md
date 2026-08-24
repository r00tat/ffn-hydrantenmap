# Eigenes Höhenmodell

Grundlage der Höhenlinien und der Höhenprofile in der Löschwasserförderung. Diese Datei
hält das „warum" fest, das sich aus dem Code nicht ableiten lässt — und die Messwerte, auf
denen die Entscheidungen beruhen.

## Datenquelle

**BEV ALS-DGM 1 m**, Airborne-Laserscan-Geländemodell des Bundesamts für Eich- und
Vermessungswesen, unter `https://data.bev.gv.at/download/ALS/DTM/20190915/`.

- Lizenz **CC BY 4.0**. Die Namensnennung „Datenquelle: Bundesamt für Eich- und
  Vermessungswesen (BEV)" ist **Lizenzbedingung**, keine Höflichkeit. Sie steht in der
  Legende des Layers, an der Layer-Attribution der Karte und auf der Datenschutzseite.
  Wer die Legende umbaut, muss sie mitnehmen.
- Der Pfad trägt das Datum der Veröffentlichung, `20190915`. Ein neuerer Stand liegt unter
  dieser Adresse **nicht**; wird einer veröffentlicht, ist `BEV_EPOCH` in
  [src/server/terrain/bevSource.ts](../src/server/terrain/bevSource.ts) die einzige Stelle,
  die sich ändert, und der Kachel-Prefix wandert auf `v2` (siehe „Version").
- Höhen in **EVRF2000** (orthometrisch), Koordinaten in **EPSG:3035** (ETRS89-LAEA).
- Je Datei eine 50-km-Kachel: BigTIFF, 50001 × 50001 Pixel, `float32`, LZW, intern in
  256 × 256 gekachelt, nodata `−9999`. Das sind rund 9,6 GB je Datei.

Das Land Burgenland bietet dasselbe Laserscan-Material als DGM mit 50 cm Raster an, aber
**nur als ZIP je Gemeinde** (~617 MB je Stück, zusammen über 100 GB). Für eine landesweite
Aufbereitung ist das die falsche Verpackung; das BEV liefert dieselbe Fläche über
Range-Requests in rund 15 GB übertragener Daten.

## Warum HTTP-Range und kein Volldownload

Die Quelldateien sind 9,6 GB groß, gebraucht wird davon immer nur ein Ausschnitt. TIFF macht
das möglich, weil die Kachelverzeichnisse am Dateianfang stehen:

- `TileOffsets` bei Byte-Offset **452**, `TileByteCounts` bei **307780**, je 38.416 Einträge
  (196 × 196 interne Kacheln).
- Beides liegt damit in den ersten rund **615 KB**. Ein einziger Range-Request holt das
  Verzeichnis, danach wird kachelweise nachgeladen.

Gemessen: ein 256-m-Ausschnitt kostet **207 KB** statt 9,6 GB.

Der Leser dafür steht in [src/server/terrain/bigtiff.ts](../src/server/terrain/bigtiff.ts) —
inklusive einer eigenen TIFF-LZW-Dekodierung, weil das Projekt kein GDAL und keine
GeoTIFF-Bibliothek hat. Er weist ausdrücklich ab, was er nicht kann (Big-Endian, klassisches
TIFF, andere Kompression, Predictor, andere Datentypen als `float32`), statt still falsche
Zahlen zu liefern. Eine Fixture mit einer **echten** BEV-Kachel prüft ihn gegen von Hand
nachgerechnete Kennwerte.

## Höhendatum: EVRF2000 gegen müA

**Das ist die heikelste Stelle des Modells.**

Das BEV liefert EVRF2000-Höhen. Die Pegelstände der Seen und Flüsse werden in Österreich in
**müA** (Meter über Adria, Gebrauchshöhen) geführt. Beides zu verwechseln heißt, eine
Wasserfläche systematisch um etwa 0,4 m zu verschieben — bei Wassertiefen von 0,3 bis 1 m der
Unterschied zwischen „Straße frei" und „Straße unter Wasser".

Die amtliche Transformation ist **EPSG:9275** („GHA height to EVRF2000 Austria height") in
Form des **BEV-Höhen-Grids** (`Hoehen_Grid_CSV.zip`, 1,4 MB, 396.319 Punkte im 465-m-Raster,
Koordinaten in EPSG:4312). Die Spalte `HOEHENDIFFERENZ` wird von der orthometrischen Höhe
**abgezogen**: `Adria = EVRF2000 − HOEHENDIFFERENZ`. Der von uns geführte Zuschlag ist das
negierte Feld.

Gemessen über das Burgenland-Fenster (43.391 Gitterpunkte):

| Größe | Wert |
| --- | --- |
| Mittel | **0,410 m** |
| Spanne | 0,337 bis 0,476 m, also **13,9 cm** |
| Nord-Süd-Trend | **9,8 cm** (Süd niedriger) |
| West-Ost-Trend | **6,0 cm** |

**Ein Festwert genügt damit nicht.** Die Schwankung ist nicht Rauschen, sondern ein
systematischer Trend; ein Skalar würde je nach Ort um bis zu 7 cm falsch liegen. Der Index
trägt deshalb ein **Gitter**: auf 5 km neu abgetastet, weil das Feld mit etwa 1 mm je
Kilometer so glatt ist, dass dieser Abstand unter einem Millimeter kostet. Das ergibt
21 × 35 Zellen, ein Byte je Zelle über einer Basis — **980 base64-Zeichen** im Index, und die
Rückrechnung trifft den amtlichen Wert auf 1 mm.

Gegenprobe, die verworfen wurde: eine eigene Regression gegen das Burgenland-DGM (das seine
Höhen in Adria/EPSG:5778 führt) ergab am Prüfpunkt **+0,391 m** gegen amtlich **+0,452 m** —
6 cm Abweichung, innerhalb ihrer eigenen Streuung. Die amtliche Größe gewinnt, und die
Regression samt dem Herunterladen von Gemeinde-ZIPs ist entfallen.

**Ein Vergleich von Seeflächen ist kein Datumstest.** Der Wasserspiegel des Neusiedler Sees
schwankt jahreszeitlich um Dezimeter, und die Befliegung hat einen Stand, den der Pegel
nicht kennt. Eine so gefundene Differenz mischt Datum und Wasserstand.

Folgen:

- **Höhenlinien und Löschwasserförderung sind davon unberührt.** Beide rechnen mit
  *Unterschieden*; ein gemeinsamer Versatz kürzt sich heraus. Deshalb liefert
  `TerrainSample.heightM` bewusst EVRF2000 und **nicht** müA — ein stillschweigend
  zugeschlagener halber Meter wäre in einem Profil nicht zu erkennen.
- **Für das Wasserstandsmodell ist der Zuschlag tragend**, weil dort eine absolute Höhe
  gegen einen Pegelstand verglichen wird. Er ist deshalb schon jetzt im Index, damit dieses
  Modell ihn nicht erfinden muss.

Erzeugt wird das Gitter mit:

```bash
npm run terrainCalibrate -- --cache .terrain-cache [--step-km 5]
```

Das Skript warnt, wenn die Spanne über 10 cm liegt — genau der Fall, in dem ein Festwert
nicht mehr genügt.

## Kachelschema: EPSG:3035, keine Web-Mercator-Kacheln

Die Blöcke liegen im **Quell-Koordinatensystem** und nicht in einem Web-Mercator-Raster.
Gründe:

- **Keine Umprojektion beim Import.** Ein Web-Mercator-Raster hieße, 4.385 km² durch eine
  Resampling-Stufe zu schicken und dabei Höhen zu interpolieren, die niemand prüft.
- **Eine Zelle ist exakt 1 m × 1 m.** LAEA ist flächentreu; in Web Mercator ist eine Zelle
  auf 48° Breite rund 1,5 m breit und ändert ihre Größe mit der Breite. Für eine
  Reibungsrechnung über Streckenmeter ist das die falsche Grundlage.
- **Die Blocknamen sind die der Quelle.** `CRS3035RES1000mN2653000E4778000` sagt ohne
  Umrechnung, woher der Block kommt.

Der Preis: der Client muss projizieren. Das kostet `proj4` und ist in
[src/common/terrain/projection.ts](../src/common/terrain/projection.ts) eine Funktion.

Ein **Hillshade-Layer** bliebe davon unberührt und wäre separat möglich — er würde aus
denselben Blöcken gerechnet oder als eigene, vorgerenderte Bilderkachel ausgeliefert. Er ist
nicht Teil dieser Arbeit.

Das Pixelgitter eines Blocks ist an der **Südwestecke** ausgerichtet: Spalte 0 auf `block.e`,
Zeile `sizePx-1` auf `block.n`. Das ist keine Willkür — mit der Ausrichtung an der
Nordwestecke lag die Pixelmitte auf `n + sizeM` rechnerisch schon im nördlichen Nachbarblock,
dessen Zeilen sie aber nicht enthielten. Das ergab eine Rasterweite breite Zeile ohne Höhe an
jeder Blockgrenze: in Höhenlinien ein feiner Riss, im Profil ein einzelnes `null`. Siehe
`pixelInBlock` in [src/common/terrain/grid.ts](../src/common/terrain/grid.ts).

## Stufen und Größen

| Stufe | Raster | Schrittweite | Block | Bitmap | Blöcke im Land |
| --- | --- | --- | --- | --- | --- |
| `detail` | 1 m | 10 cm | 1 km², 1000 × 1000 px | 80 × 151 | 4.385 von 12.080 |
| `overview` | 10 m | 10 cm | 100 km², 1000 × 1000 px | 9 × 16 | höchstens 144 |

Die 4.385 sind ausgezählt: so viele der 12.080 Blöcke der Bounding-Box berühren eine der
171 Gemeindeflächen des Landes.

**Beide Stufen mit 10 cm.** Zunächst waren für `detail` 5 cm vorgesehen, mit dem Argument,
die Quelle sei genauer. Sie ist es nicht: das BEV gibt für das ALS-DGM ±10 cm an, eine
feinere Stufung kodiert Rauschen. Bezahlt hätte man es trotzdem, weil die PNG-Entropie mit
der Zahl der unterschiedlichen Werte je Kachel wächst. Gemessen an zwei Blöcken im bewegten
Südburgenland (108 bzw. 148 m Relief je km²):

| Block | 5 cm | 10 cm |
| --- | --- | --- |
| `N2653000E4778000` | 848 KiB | 566 KiB |
| `N2653000E4779000` | 493 KiB | 324 KiB |

Ein Drittel weniger, bei unveränderten Höhen — dieselben Minima und Maxima auf die
Schrittweite gerundet, dieselbe Nodata-Fläche.

Landesweit bleibt die Detailstufe eine **Schätzung**, solange nicht alle Blöcke gebaut sind:
zwischen 0,2 MiB je km² im flachen Seewinkel und 0,55 MiB im Hügelland liegen grob 1,5 GiB.
Die frühere Angabe von 1,2 GiB stammte aus einer Probe im Flachland und war zu niedrig — die
Höhenvarianz treibt die Entropie.

## Kodierung: Terrain-RGB

`h = base + (R · 65536 + G · 256 + B) · step`, `base` und `step` stehen **im Index**, nicht im
Code. Ein Wechsel der Präzision ist damit eine reine Neuerzeugung der Kacheln.

- **8-Bit-RGB und nicht 16-Bit-Graustufen**, obwohl beide gleich groß komprimieren: der
  Browser wirft 16-Bit-PNG beim Dekodieren ins Canvas auf 8 Bit ab. Die Präzision wäre
  verloren, ohne dass es auffiele.
- **`createImageBitmap(blob, { colorSpaceConversion: 'none' })` ist nicht optional.** Ohne
  das Flag darf der Browser Farbmanagement anwenden — die Höhen sind dann verschoben, und
  das Bild sieht dabei völlig richtig aus. Beim Schreiben gilt dasselbe von der anderen
  Seite: die PNGs werden **ohne** `iCCP`/`gAMA`/`sRGB`-Chunks geschrieben.
- `nodata` ist der reservierte Wert `0xFFFFFF` und darf **nie** als Höhe durchgehen. Aus
  nodata = 0 m würde im Wasserstandsmodell eine überflutete Fläche, wo überhaupt keine Daten
  vorliegen.

## Verfügbarkeit als Bitmap, nicht als Liste

Der Client muss wissen, welche Blöcke es gibt: sonst kostet jede Abfrage nahe der
Landesgrenze einen 404-Roundtrip, und **offline ist ein 404 nicht von „nicht im Cache" zu
unterscheiden**.

Die Blöcke liegen auf einem regulären Gitter; eine Liste von IDs kodiert dieselbe Information
redundant. Ein Bit je Gitterzelle, MSB-first, durchgehend gepackt (kein Zeilenpadding):

- `detail`: 80 × 151 = 12.080 Bit = 1.510 Byte = **2.016 base64-Zeichen**. Dieselben 4.385
  Blocknamen als JSON-Liste wären rund **150 KB** — ein Blockname ist 31 Zeichen lang.
- Der ganze Index samt Versatzgitter ist damit **4,2 KB** (gemessen am erzeugten
  `index.json`).

Zusätzlich ist der Zugriff ein Bit-Index statt eines Set-Lookups über tausende Strings.

Kein Zeilenpadding auf Byte-Grenzen, weil die Formel `zeile * cols + spalte` das voraussetzt.
Bei 80 Spalten kostet Padding zufällig nichts — 80 ist durch 8 teilbar —, bei jeder anderen
Landesgrenze schon, und beide Seiten müssten dieselbe Annahme treffen. Die Annahme steht
deshalb im Kommentar von
[src/common/terrain/availability.ts](../src/common/terrain/availability.ts).

## Import

```bash
# Einmalig: das Versatzgitter EVRF2000 → müA
npm run terrainCalibrate -- --cache .terrain-cache

# Dann die Kacheln
npm run terrainImport -- --cache .terrain-cache --level all
npm run terrainImport -- --cache .terrain-cache --level detail --limit 5 --no-upload
```

- Der Import ist **wiederaufsetzbar**: fertige Kacheln im Cache werden nicht neu gebaut.
  Ein Abbruch kostet nur die laufende Kachel.
- `--no-upload` baut ohne Anmeldedaten; der Firebase-Admin wird erst im Upload-Zweig
  importiert.
- Ohne `terrain-calibration.json` **bricht der Import ab**, statt einen Festwert zu
  erfinden. Ein geratener Skalar würde im Wasserstandsmodell später als Messwert gelesen.

### Die Reihenfolge ist nicht frei

**Die Übersichtsstufe wird aus den rohen Detailblöcken dezimiert.** Sie ist damit keine
billige erste Etappe: `--level overview` auf einem leeren Cache lädt nichts herunter und
schreibt nichts. Die Quelldaten müssen zuerst da sein.

Ein Übersichtsblock deckt 100 Detailblöcke ab, und geschrieben wird er nur, wenn **alle**
Kinder vorliegen, die zum Land gehören. Andernfalls hätte die Kachel ein Loch — und weil ein
fertiger Block beim nächsten Lauf übersprungen wird, bliebe das Loch für immer. Der Import
meldet solche Blöcke als „zurückgestellt".

### Rollout in Etappen

`--level` beschränkt auch den **Upload**. Der Index geht immer vollständig hoch; er beschreibt
ohnehin, was im Cache liegt. Damit lässt sich die Übersichtsstufe zuerst ausrollen, ohne auf
die 1,5 GiB der Detailstufe zu warten:

```bash
# 1. Alles bauen, nichts hochladen. Der lange Teil.
npm run terrainImport -- --cache .terrain-cache --level all --no-upload

# 2. Übersichtsstufe hoch — die Karte zeigt landesweit Höhenlinien.
npm run terrainImport -- --cache .terrain-cache --level overview

# 3. Detailstufe hinterher.
npm run terrainImport -- --cache .terrain-cache --level detail
```

Schritte 2 und 3 bauen nichts Neues, weil die Kacheln im Cache liegen — sie laden nur hoch.
Zwischen 2 und 3 fällt jede Abfrage in der Detailstufe auf die Übersicht zurück, weil
`hasBlock` für fehlende Blöcke `false` liefert.

Der Cache-Ordner enthält:

| Eintrag | Inhalt |
| --- | --- |
| `hoehen-grid.csv` | entpacktes BEV-Höhen-Grid |
| `terrain-calibration.json` | das Versatzgitter |
| `burgenland-gemeinden.json` | Gemeindeflächen aus dem GIS Burgenland |
| `bev/*.info.json` | Kachelverzeichnisse der Quelldateien |
| `raw/*.f32` | rohe `float32`-Blöcke, Grundlage der Dezimierung |
| `out/` | die fertigen PNGs und `index.json` |

Der Ausschnitt kommt aus den **Gemeindeflächen**, nicht aus einer Bounding-Box: die Box
hätte 12.080 Blöcke, die Flächen 4.385. Ein Block zu viel kostet ein halbes MB, ein Block zu
wenig ein Loch in der Karte — bei Zweifel wird der Block aufgenommen. Die Gemeindeflächen
sind dabei nur die **Maske**, keine Ladeeinheit: geladen wird immer blockweise über
Range-Requests, und der Import läuft über die Blockliste, nicht über Gemeinden.

Die Übersichtsstufe wird aus den **rohen** Detailblöcken dezimiert, nicht aus den PNGs: sonst
läge die Quantisierung der Detailstufe zweimal im Ergebnis.

**Der Index wird aus dem Ausgabeverzeichnis gebaut**, nicht aus dem, was der laufende Import
erzeugt hat. Sonst schriebe ein Lauf mit `--level detail` eine leere Übersichts-Bitmap und
die schon hochgeladenen Übersichtskacheln wären für jeden Client verschwunden; ein Lauf mit
`--level overview` meldete umgekehrt alle 4.385 Kandidaten der Detailstufe als vorhanden, und
jeder Client hätte sie einzeln als 404 abgeholt. Siehe
[src/server/terrain/terrainIndex.ts](../src/server/terrain/terrainIndex.ts).

## Auslieferung und Version

`terrain/v1/index.json`, `terrain/v1/detail/CRS3035RES1000mN{n}E{e}.png`. Der Prefix
`terrain/` ist in `storage.rules` **öffentlich lesbar**: es sind CC-BY-Daten ohne
Schutzbedarf, und tausende Kacheln können keine Download-Tokens tragen, ohne den Cache des
Service Workers unbrauchbar zu machen — und der trägt den Hochwasserfall.

**Der Pfad trägt eine Version.** Ohne sie liefern Service-Worker- und CDN-Caches nach einer
Neuerzeugung eine Mischung aus alter und neuer Kodierung aus. Das fällt nicht auf, es
verschiebt nur stillschweigend die Höhen. Eine neue Kachelversion wird ausgerollt, indem
`TERRAIN_VERSION` in
[src/common/terrain/terrainPaths.ts](../src/common/terrain/terrainPaths.ts) erhöht, neu
importiert und die alte Version nach einer Übergangszeit gelöscht wird. Die Kacheln selbst
liegen mit `max-age=31536000, immutable`, der Index mit `max-age=300`.

**Die Cache-Regel des Service Workers muss die erste in `cachePatterns` bleiben.** Firebase
Storage liegt auf `firebasestorage.googleapis.com` und fiele sonst unter die bestehende
`NetworkOnly`-Regel für `googleapis`. Die Offlinefähigkeit wäre wirkungslos, ohne dass
irgendwo ein Fehler auftaucht. Siehe
[src/worker/patterns.ts](../src/worker/patterns.ts) und
[docs/service-worker-pwa.md](service-worker-pwa.md).

Ein Test in `blockStore.test.ts` hält die erzeugte URL gegen diese Regel fest: greift
`/o/terrain%2F` nicht mehr, schlägt er fehl.

## Client

Alles Rechnen läuft im Worker
([src/workers/terrain.worker.ts](../src/workers/terrain.worker.ts)). Höhenlinien über einen
Kartenausschnitt sind Millionen Zellen Arbeit; im Hauptthread stünde die Karte für Sekunden.
Der Worker hält außerdem den **einzigen** Blockcache — ein dekodierter Detailblock ist 4 MB,
und zwei Instanzen wären zwei Kopien derselben Kacheln.

- Die Höhenabfrage sucht die vier Nachbarpixel **einzeln in ihrem jeweiligen Block**. Aus
  einem gemeinsamen Block gelesen bliebe an jeder Blockkante ein halber Meter ohne Antwort.
- Fehlt einer der vier Nachbarn, ist das Ergebnis `null`. Aus drei Werten interpoliert wäre
  es eine erfundene Höhe, und die ist in einem Profil nicht von einer echten zu
  unterscheiden.
- Die Abfrage nimmt je Punkt die **feinste** verfügbare Stufe. An der Landesgrenze und
  solange erst die Übersichtsstufe hochgeladen ist, läge sonst die halbe Strecke ohne
  Höhe da. Welche Stufe
  geantwortet hat, steht in `TerrainSample.level` und wird im Rechner ausgewiesen.
- Höhenlinien werden auf einem **zusammengesetzten** Gitter über den ganzen Ausschnitt
  gerechnet, nicht blockweise: sonst wäre jede Linie an jeder Blockgrenze in eine eigene
  zerlegt. Die Stufe wählt ein Zellbudget (2,5 Mio. Zellen) statt einer Zoomschwelle.

## Löschwasserförderung

Die Förderung nimmt zuerst das eigene Modell und fällt auf OpenTopoData (EU-DEM 25 m)
zurück. Jede Quelle hat ihre eigene Abtastung — 10 m gegen 50 m, weil OpenTopoData 100 Punkte
je Anfrage nimmt —, und am Element steht, welche verwendet wurde: `elevationSource`,
`elevationLevel`, `elevationSpacing`.

Ein gespeichertes Profil wird mit der Abtastweite nachgebildet, die an ihm steht, nicht mit
der gewünschten. Sonst passte ein bestehendes 50-m-Profil nie zur feinen Abtastung und die
Karte fragte bei jedem Render neu ab. **Bestehende Leitungen behalten deshalb ihr Profil aus
EU-DEM**, bis sich etwas an ihnen ändert oder im Rechner „erneut versuchen" gedrückt wird;
welche Quelle dahintersteht, weist der Rechner aus.

Siehe [docs/loeschwasserfoerderung.md](loeschwasserfoerderung.md).

## Was hier nicht drin ist

- **Das Wasserstandsmodell** (Anforderung 3 von #727) und die **Dammbruch-Simulation**. Sie
  bekommen eigene Specs; das Versatzgitter und die Detailstufe sind ihre Grundlage.
- **Hillshade.** Wäre aus denselben Blöcken möglich, ist aber keine Anforderung.
- **Ein Eintrag in der Interpolations-Registry.** Das Höhenmodell ist eine Rasterquelle, kein
  interpolierter Messwert; #727 nimmt das ausdrücklich aus.
