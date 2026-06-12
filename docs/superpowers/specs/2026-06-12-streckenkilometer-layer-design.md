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

**Gewählte Quelle:** GIP.at-OGD-Export „C – GeoPackage GIP Referenz"
([data.gv.at](https://www.data.gv.at/katalog/dataset/intermodales-verkehrsreferenzsystem-osterreich-gip-at-beta)),
Layer `Bezugspunkte` (= Kilometertafeln), Lizenz **CC BY 4.0**, Aktualisierung
alle 2 Monate (für diesen Anwendungsfall irrelevant, da sich die
Kilometrierung praktisch nie ändert).

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

- Extraktions-Script neben den bestehenden Import-Scripts. Eingabe: Pfad zum
  lokal heruntergeladenen GIP-GeoPackage (der mehrere 100 MB große Download
  landet **nicht** im Repo).
- Filtert den Layer `Bezugspunkte` auf die o.g. Straßenbezeichnungen,
  projiziert nach WGS84, rundet Koordinaten und schreibt
  `public/data/streckenkilometer.geojson` mit minimalen Properties:
  `strasse`, `km`, `richtung`.
- Das erzeugte GeoJSON wird **ins Repo committed**; das Script bleibt für
  spätere Aktualisierungen dokumentiert.

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
- Das Extraktions-Script bricht mit klarer Fehlermeldung ab, wenn das
  GeoPackage fehlt oder der `Bezugspunkte`-Layer nicht gefunden wird.

## Tests (TDD)

- Unit-Tests für die Hilfsfunktionen: Label-Formatierung („43,0" mit Komma),
  Zoom-Ausdünnung (ganze km vs. alle), Viewport-Filterung.
- Komponententest mit `renderWithIntl` aus `src/test-utils/intlRender.tsx`.

## Bewusst nicht enthalten (YAGNI)

- Kein Live-Abruf von ArcGIS/GIP zur Laufzeit (Daten statisch im Repo).
- Keine Firestore-Anbindung, keine Integration in die Cluster-Pipeline.
- Keine automatische Aktualisierung der Daten.
