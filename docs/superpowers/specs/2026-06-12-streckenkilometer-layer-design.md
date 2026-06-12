# Streckenkilometer-Layer (Autobahnen & Schnellstraßen) — Design

**Datum:** 2026-06-12
**Status:** Entwurf (vom Benutzer freigegeben)

## Ziel

Die Streckenkilometer (Kilometertafeln) der Autobahnen und Schnellstraßen im
Einsatzgebiet sollen als ein-/ausschaltbarer Karten-Layer angezeigt werden,
damit bei Einsätzen auf der Autobahn (z.B. „A4 km 43,0") die Einsatzstelle
schnell lokalisiert werden kann.

## Hintergrund / Datenquellen-Recherche

Der ursprünglich angedachte ArcGIS-Dienst
(`services2.arcgis.com/.../KmBAB/FeatureServer/1`) enthält ausschließlich die
Kilometrierung der **deutschen** Bundesautobahnen — im Raum Neusiedl am See
liefert er 0 Treffer. Das Burgenland-GIS (`gisenterprise.bgld.gv.at`) bietet
keine Autobahn-Kilometrierung an. Ein öffentlicher FeatureServer mit
österreichischer Kilometrierung existiert nach Recherche nicht.

**Gewählte Quelle:** GIP.at-OGD-Export
([data.gv.at](https://www.data.gv.at/katalog/dataset/intermodales-verkehrsreferenzsystem-osterreich-gip-at-beta)),
Lizenz **CC BY 4.0** (Attribution: „Datenquelle: gip.gv.at", verlinkt auf
`www.gip.gv.at`), Aktualisierung alle 2 Monate (für diesen Anwendungsfall
irrelevant, da sich die Kilometrierung praktisch nie ändert).

**Wichtige Einschränkung (bei der Umsetzung festgestellt):** Der Layer
`Bezugspunkte` (`BEPU_OGD`) im GeoPackage „C – GIP Referenz" enthält **keine**
Kilometertafeln für Autobahnen/Schnellstraßen — ASFINAG publiziert seine
Bezugspunkte nicht im OGD-Export (0 von 252.814 Punkten liegen auf
EDGECAT-'A'-Kanten). Die Kilometrierung der Autobahnen ist aber als
kilometrierte Richtungsfahrbahn-Routen in der Tabelle `LinkEdgeRoute` des
Routingexports enthalten (`ROUTE_NAME` z.B. „A4 - Ost Autobahn rechte
Fahrbahn (Hauptrichtung) kilometriert E", `SUBROUTE_STARTKM`/`SUBROUTE_ENDKM`).
Die km-Punkte werden daher **abgeleitet**: Die Link-Geometrien jeder Route
werden in Traversierungsreihenfolge abgegangen und alle 500 m wird ein Punkt
linear interpoliert. Validierung: Die Geometrie-Längen weichen nur 0,0–0,2 %
von der offiziellen Kilometrierung ab (Ausnahme S4 Gegenrichtung: 1,9 %
wegen Fehlkilometrierung — dort können einzelne Tafeln um bis zu ~200 m
versetzt sein).

## Umfang

Alle Autobahnen und Schnellstraßen im bzw. um das Burgenland, jeweils in
voller Länge:

- **A4** Ost Autobahn (~66 km)
- **A6** Nordost Autobahn (~22 km)
- **S31** Burgenland Schnellstraße (~54 km)
- **S4** Mattersburger Schnellstraße (~28 km)
- **S7** Fürstenfelder Schnellstraße (~29 km)

Erwartete Datenmenge: ~800–1.600 Punkte (Tafeln typ. alle 500 m je
Richtungsfahrbahn), als GeoJSON ~150–350 KB unkomprimiert, ~20–50 KB gzipped.

## Architektur

### 1. Datenbeschaffung (einmalig, Script)

- Extraktions-Script `src/server/streckenkilometer-extract.ts`
  (`npm run extractStreckenkilometer`). Eingaben: `LinkEdgeRoute.txt` aus
  `A_routingexport_ogd_split.zip` sowie `gip_network_ogd.gpkg` aus
  `B_gip_network_ogd.zip` (die GB-großen Downloads landen **nicht** im Repo).
- Filtert die kilometrierten Hauptfahrbahn-Routen der o.g. Straßen, geht die
  Link-Geometrien (WGS84) in Traversierungsreihenfolge ab und interpoliert
  alle 500 m einen Punkt; schreibt `public/data/streckenkilometer.geojson`
  mit minimalen Properties: `strasse`, `km`, `richtung`
  (`Hauptrichtung`/`Gegenrichtung`).
- Das erzeugte GeoJSON (738 Punkte, ~110 KB) wird **ins Repo committed**;
  das Script bleibt für spätere Aktualisierungen dokumentiert.

### 2. Layer-Komponente

Neue Komponente `src/components/Map/layers/StreckenkilometerLayer.tsx`,
registriert als Overlay „Streckenkilometer" in der `LayersControl` in
`src/components/Map/Map.tsx`:

- **Lazy Loading** nach dem Muster von `PegelstandLayer.tsx`: GeoJSON wird
  erst per `fetch` geladen, wenn der Layer zum ersten Mal aktiviert wird
  (`overlayadd`-Event). Danach bleibt es im Speicher.
- **Darstellung:** km-Tafel-Labels als `L.divIcon` im Stil der blauen
  Autobahntafeln (weiße Schrift auf blauem Grund, z.B. „A4 43,0").
- **Popup** beim Antippen: Straße, Kilometer, Richtung.
- **Attribution:** „GIP.at / CC BY 4.0" am Layer.

### 3. Performance

Die Rohdaten (≤1 MB im Speicher) sind unkritisch; der Engpass sind
DOM-Elemente. Daher wird nur die sichtbare Teilmenge gerendert:

- **Viewport-Filterung:** Pro `moveend`/`zoomend` werden nur Punkte innerhalb
  `map.getBounds()` (+ Puffer) gerendert — O(n)-Filter über ≤1.600 Punkte,
  typisch 20–40 Marker im DOM.
- **Zoom-Staffelung:** unter Zoom 13 keine Tafeln, Zoom 13–14 nur ganze
  Kilometer, ab Zoom 15 alle Tafeln (inkl. 0,5er und beide
  Richtungsfahrbahnen).
- **Stabile Keys + Icon-Cache:** React-Keys wie `A4-43.0-+`, `L.divIcon`-
  Instanzen gecacht (Muster wie `iconCache` im `PegelstandLayer`).

Clustering ist bewusst nicht vorgesehen — zusammengefasste km-Tafeln hätten
keine Aussagekraft, und die Viewport-/Zoom-Filterung begrenzt die Markerzahl
ausreichend.

## i18n

Neue UI-Strings (Layer-Name, Popup-Beschriftungen) in `messages/de.json` und
`messages/en.json` gemäß Projektkonvention (englische camelCase-Schlüssel).

## Fehlerbehandlung

- Schlägt der `fetch` des GeoJSON fehl, bleibt der Layer leer; der Fehler wird
  über das bestehende Error-Reporting geloggt. Beim nächsten Aktivieren wird
  erneut geladen.
- Das Extraktions-Script bricht mit klarer Fehlermeldung ab, wenn die
  Eingabedateien fehlen oder keine kilometrierten Routen gefunden werden,
  und warnt bei Geometrie-Lücken (>100 m) innerhalb einer Route.

## Tests (TDD)

- Unit-Tests für die Hilfsfunktionen: Label-Formatierung („43,0" mit Komma),
  Zoom-Ausdünnung (ganze km vs. alle), Viewport-Filterung.
- Komponententest mit `renderWithIntl` aus `src/test-utils/intlRender.tsx`.

## Bewusst nicht enthalten (YAGNI)

- Kein Live-Abruf von ArcGIS/GIP zur Laufzeit (Daten statisch im Repo).
- Keine Firestore-Anbindung, keine Integration in die Cluster-Pipeline.
- Keine automatische Aktualisierung der Daten.
