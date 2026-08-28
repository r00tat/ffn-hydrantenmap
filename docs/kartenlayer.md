# Kartenlayer und ihre Dienste

Grund- und Overlay-Layer der Karte stehen in
[src/components/Map/tiles.ts](../src/components/Map/tiles.ts) und werden in
[Map.tsx](../src/components/Map/Map.tsx) über `TileLayer` (XYZ/WMTS) bzw.
`WMSTileLayer` gerendert. Welcher Weg gilt, entscheidet `isWmsLayer(layer)`:
`type: 'WMS'` geht an den WMS-Zweig, alles andere — auch ein Layer ganz ohne
`type` — an den Kachel-Zweig. Die Unterscheidung steht in `tiles.ts` und nicht
als Bedingung im JSX, damit die beiden Listen im Kartenaufbau nachweislich
dieselbe Menge aufteilen und kein Layer zwischen ihnen verschwindet.

Dieses Dokument hält fest, was sich aus der Konfiguration **nicht** ablesen lässt:
wo die GetCapabilities der Dienste liegen, welche Layer-Namen es dort gibt und
welche Eigenheiten einzelne Anbieter haben.

## Kachelgröße der WMS-Layer

WMS-Kacheln sind 512×512, nicht Leaflets 256. Der Wert steht in der
Konfiguration (`options.tileSize`); fehlt er, gilt `DEFAULT_WMS_TILE_SIZE` aus
[tiles.ts](../src/components/Map/tiles.ts). Gerendert wird er über
`wmsTileSize(layer)` — in [Map.tsx](../src/components/Map/Map.tsx),
[RechnerMap.tsx](../src/components/Map/RechnerMap.tsx) und
[LocationMapPicker.tsx](../src/components/Einsatzorte/LocationMapPicker.tsx).

Warum 512 der Standard ist:

- Der WISA-Tile-Cache (siehe unten) beantwortet **ausschließlich**
  `WIDTH=512&HEIGHT=512`; bei 256 kommt `400 Bad Request`. Wer dort auf 256
  stellt, schaltet die vier Hochwasser-Overlays wortlos ab. Deshalb steht das
  `tileSize` an diesen Layern ausdrücklich, obwohl es dem Standard entspricht.
- Für die übrigen WMS-Dienste bedeutet 512 ein Viertel der Anfragen bei
  gleichem Ergebnis. Der ArcGIS-Server des Landes Burgenland deklariert
  `MaxWidth`/`MaxHeight` 4096, 512 ist also unbedenklich.

Die **Auflösung ändert sich dadurch nicht**: Sie ergibt sich aus BBOX pro
Pixel, und eine 512er-Kachel deckt die doppelte Kantenlänge ab. `maxNativeZoom`
und maßstabsabhängige Layer (`MinScaleDenominator`) verhalten sich unverändert.
Was sich ändert, ist das Kachelraster — bei `tileSize: 512` entspricht das
Raster der Leaflet-Zoomstufe `z` dem 256er-Raster von `z-1`.

XYZ-/WMTS-Layer bleiben bei 256: Deren Kacheln kommen in fester Größe vom
Server, `tileSize` ist dort keine Bitte, sondern eine Behauptung.

## basemap.at (Wien/`maps{s}.wien.gv.at`)

Layer: `basemap_ortofoto`, `basemap_hdpi`, `basemap_grey`, `adressen`.
XYZ-Kacheln, kein WMS. Capabilities des zugrunde liegenden WMTS:

```text
https://mapsneu.wien.gv.at/basemap/1.0.0/WMTSCapabilities.xml
```

Enthaltene Layer-Identifier: `geolandbasemap`, `bmapgrau`, `bmaphidpi`,
`bmaporthofoto30cm`, `bmapoverlay`, `bmapgelaende`, `bmapoberflaeche` —
TileMatrixSet `google3857` (Zoom 0–20) bzw. `google3857_0-17`.

## Land Burgenland (ArcGIS Server)

Zwei MapServer, beide sprechen WMS 1.1.1 und 1.3.0 und liefern Capabilities:

```text
https://gisenterprise.bgld.gv.at/arcgis/services/public/Orthofoto/MapServer/WMSServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities
https://gisenterprise.bgld.gv.at/arcgis/services/public/Nur_Flaechenwidmung/MapServer/WMSServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities
```

Die Layer werden über numerische IDs angesprochen — die Titel stehen nur in den
Capabilities, deshalb hier die verwendeten:

| Dienst              | ID  | Titel                                                                      | genutzt als          |
| ------------------- | --- | -------------------------------------------------------------------------- | -------------------- |
| Orthofoto           | `0` | Satellitendaten                                                            | —                    |
| Orthofoto           | `1` | Orthofoto                                                                  | `orthofoto_bgld`     |
| Orthofoto           | `2` | Abdeckung                                                                  | —                    |
| Nur_Flaechenwidmung | `2` | Schutz- und Schongebiete (Natur-, Landschafts-, Trinkwasser-, Heilmoor, …) | `schutzgebiete_bgld` |
| Nur_Flaechenwidmung | `5` | Naturgefahren                                                              | `naturgefahren_bgld` |

Weitere brauchbare IDs desselben Dienstes: `0` generalisierte Widmungen,
`1` Widmungen/Vorrangflächen, `3` Schutz-/Sicherheitsbereiche Infrastruktur,
`8` lineare Infrastruktur (Leitungen), `12`–`14` Gemeinden/Bezirke/Land.

## WISA Hochwasser (`tiles.lfrz.gv.at/wisa_hw_risiko`)

Betrifft `oberflaechenwasser`, `riskareas`, `floodarea` und `floodarea_river`.

**Es gibt hier keine GetCapabilities.** `tiles.lfrz.gv.at` ist kein WMS-Server,
sondern ein vorgerenderter Kachel-Cache mit WMS-förmiger URL. Er wertet nur
`LAYERS` und `BBOX` aus; `REQUEST` wird ignoriert. Nachgemessen:

| Anfrage                                                      | Antwort                                               |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `REQUEST=GetMap`, 512×512, `VERSION=1.1.1`, `SRS=EPSG:3857`  | `200 image/png`                                       |
| `REQUEST=GetCapabilities` (1.1.1 / 1.3.0 / WMTS / lowercase) | `404` (IIS-HTML)                                      |
| `WIDTH=256&HEIGHT=256`                                       | `400 Bad Request`                                     |
| `VERSION=1.3.0&CRS=EPSG:3857`                                | `400`                                                 |
| `SRS=EPSG:31287` (oder anderes als 3857)                     | `400`                                                 |
| unbekannter `LAYERS`-Wert                                    | `400`                                                 |
| `REQUEST=GetFeatureInfo`                                     | `200 image/png` — liefert die Kachel, keine Sachdaten |
| `REQUEST=GetLegendGraphic`                                   | `404`                                                 |
| Leaflet-Zoom ≤ 19 (512er-Raster)                             | `200`                                                 |
| Leaflet-Zoom 20                                              | `400`                                                 |

Daraus folgt für die Konfiguration: `VERSION` 1.1.1, `SRS=EPSG:3857`,
`tileSize` 512 und `maxNativeZoom: 19` sind **exakt** die Grenzen des Dienstes,
kein gerundeter Schätzwert. `TILED=true` ist optional. Die BBOX wird auf das
Kachelraster gerundet — eine um 100 m verschobene BBOX liefert byte-identisch
dieselbe Kachel.

### Layer-Katalog

Weil es keine Capabilities gibt, ist die Layerliste nur aus dem WISA-Viewer zu
holen. Der Viewer unter <https://maps.wisa.bmluk.gv.at/gefahren-und-risikokarten-zweiter-zyklus>
lädt sein gesamtes Setup aus einer JS-Datei, und die Kachel-URL selbst kommt aus
einem eigenen Endpunkt:

```bash
# liefert "//tiles.lfrz.gv.at/wisa_hw_risiko"
curl -X POST 'https://maps.wisa.bmluk.gv.at/Services/TilesUrl' \
  -d 'i=wisa_hw_risiko&m=Full&t=wisa_hw_risiko'

# enthält die Layerliste (Suche nach "layersOrder" bzw. "SubLayer")
curl 'https://maps.wisa.bmluk.gv.at/wisa/GIIPProvider/GISApp?g=wisa_hw_risiko'
```

Stand August 2026 verfügbar:

| Layer                                                               | Inhalt                                                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ofa_maxd`                                                          | Oberflächenabfluss, maximale Fließtiefe — genutzt als „Hochwasser Oberflächenwasser"                                 |
| `ofa_maxv`                                                          | Oberflächenabfluss, maximale Fließgeschwindigkeit                                                                    |
| `ofa_isohypsen`                                                     | Höhenlinien der Oberflächenabflusskarte (nur Maßstab 1:10.000–1:5.000)                                               |
| `oberflaechenabfluss`                                               | Übersicht Oberflächenabfluss                                                                                         |
| `hwrisiko_risikobewertung`                                          | Risikobewertung — genutzt als „Hochwasser Risikogebiete"                                                             |
| `hwrisiko_gefahren_ueff`                                            | Überflutungsflächen — genutzt als „Hochwasser Überflutungsgebiete"                                                   |
| `hwrisiko_apsfr`, `hwrisiko_apsfr_gebiete`                          | Gebiete mit potenziell signifikantem Hochwasserrisiko — `hwrisiko_apsfr` genutzt als „Hochwasser Überflutung Flüsse" |
| `hwrisiko_gefahren_prozess_hq{30,100,300}_{tiefe,geschw}`           | Fließtiefe bzw. -geschwindigkeit je Jährlichkeit                                                                     |
| `hwrisiko_auswirkung_hq{30,100,300}_{betroffene,nutzung,schutzgeb}` | Betroffene, Nutzung, Schutzgebiete je Jährlichkeit                                                                   |
| `hwrisiko_vgd`, `hwrisiko_vgd_lbl`                                  | Verwaltungsgrenzen und deren Beschriftung                                                                            |
| `hwrisiko_gefaehrdungsgebiete`                                      | Gefährdungsgebiete                                                                                                   |
| `verkehr`                                                           | Verkehrswege                                                                                                         |

Die Domain `maps.wisa.bml.gv.at` aus den `attribution`-Links leitet inzwischen
auf `maps.wisa.bmluk.gv.at` um (Ressortumbenennung); die alten Links
funktionieren weiter.

### Wenn echte Capabilities gebraucht werden

Der INSPIRE-Dienst des Ressorts liefert Capabilities und dieselben Hochwasser-
daten als richtiger WMS:

```text
https://inspire.lfrz.gv.at/000801/wms?service=WMS&version=1.3.0&request=GetCapabilities
```

Darin u.a. `Hochwasserueberflutungsflaechen HQ30 | HQ100 | HQ300`,
dieselben Flächen „aus der Gefahrenzonenplanung", `Hochwasserrisikogebiete
HQ30 | HQ100 | HQ300` sowie `APSFR`.

**Die `ofa_*`-Layer (Oberflächenabfluss/Starkregen) sind dort nicht enthalten** —
für die gibt es nur den Kachel-Cache. Deshalb bleibt „Hochwasser
Oberflächenwasser" an `tiles.lfrz.gv.at` gebunden, obwohl der Dienst keine
Capabilities kennt.
