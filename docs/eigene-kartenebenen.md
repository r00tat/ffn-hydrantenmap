# Eigene Kartenebenen (WMS/WMTS) je Einsatz

Bis dahin standen alle Kartenebenen fest im Code (`availableLayers` und
`overlayLayers` in [src/components/Map/tiles.ts](../src/components/Map/tiles.ts)).
Eine Ebene mehr — der WMS eines Nachbarbezirks, ein Hochwasserdienst, eine
Sonderlage — hieß: Code ändern und ausrollen. Seit
[#744](https://github.com/r00tat/ffn-hydrantenmap/issues/744) lassen sich eigene
Kartenebenen **je Einsatz** anlegen.

Dieses Dokument hält fest, was sich aus dem Code nicht ablesen lässt.

## „Kartenebene" ist nicht „Ebene"

Die Collection `layer` (`FIRECALL_LAYERS_COLLECTION_ID`) und
`FirecallItem.type === 'layer'` bezeichnen die **Gruppierung von
Einsatzelementen** — nicht eine Kartenebene. Beides „Layer" zu nennen, hätte im
Code und in der Oberfläche dieselbe Verwechslung erzeugt.

Deshalb:

| | Gruppierung von Elementen | Externer Kartendienst |
| --- | --- | --- |
| Collection | `layer` | `mapLayer` (`FIRECALL_MAP_LAYERS_COLLECTION_ID`) |
| Typ / Interface | `FirecallLayer` | `FirecallMapLayer` |
| Oberfläche | „Ebene" | „Kartenebene" |
| Layer-Control | `Einsatz <Name>` | `Karte: <Name>` |

Eine Kartenebene ist bewusst **kein** `FirecallItem`: sie hat keine Position,
keine Ebene, kein Datenschema, keinen Marker. Sie durch das Elementregister zu
schleusen hätte für jedes dieser Felder eine Ausnahme gebraucht. Stattdessen ein
eigenes, sehr kleines Modell in
[src/common/mapLayers.ts](../src/common/mapLayers.ts) und ein eigener Hook
[src/hooks/useFirecallMapLayers.ts](../src/hooks/useFirecallMapLayers.ts).

## Berechtigungen — und warum die Regeln nichts prüfen

Die Firestore-Regeln decken die neue Collection bereits ab: unter
`match /call/{doc}` steht ein `match /{subitem=**}` mit `read: callAuthorized()`
und `write: callWriteAuthorized()`. Kartenebenen sind damit ohne
Regeländerung für alle am Einsatz Berechtigten lesbar und nur für die
Schreibberechtigten änderbar; Nur-Lese-Gäste über den Freigabe-Link sehen sie,
dürfen sie aber nicht anlegen.

Eine **strengere** Regel für `mapLayer` — etwa „`url` muss mit `https://`
beginnen" — bringt dagegen nichts: Firestore erlaubt einen Zugriff, sobald
**irgendeine** passende Regel ihn erlaubt. Die Wildcard darüber gewährt den
Schreibzugriff bereits; eine zusätzliche, engere Regel kann ihn nicht mehr
zurücknehmen. Sie nachzurüsten hieße, die Wildcard aufzulösen und jede
Subcollection einzeln aufzuzählen — ein Umbau, der jede künftige Subcollection
stillschweigend aussperren würde.

Die Prüfung liegt deshalb an zwei Stellen im Code, und die zweite ist die
entscheidende:

1. **Beim Speichern** — `validateMapLayer` im Dialog. Verhindert Tippfehler.
2. **Beim Rendern** — `mapLayerTileConfigs` lässt jede Ebene weg, die
   `isRenderableMapLayer` nicht besteht. Ein Dokument, das auf anderem Weg in
   die Collection gekommen ist (Import eines Einsatzes, MCP, Konsole), wird von
   der Karte gar nicht erst angefragt.

Erlaubt ist nur `https://` ohne eingebettete Zugangsdaten. `http://` scheitert im
Browser ohnehin an Mixed Content; `user:pass@` würde das Passwort in jeder
Kachelanfrage und in der Layer-Verwaltung mitschleppen.

## Quellenangabe ist reiner Text

Leaflet setzt die Attribution mit `innerHTML` in die Karte. Ein vom Benutzer
eingegebener Wert ist damit ein Einfallstor. `sanitizeAttribution` entfernt
deshalb alle Tags und maskiert den Rest — eine eigene Quelle lässt sich nicht
verlinken. Das ist der Preis dafür, dass über das Feld kein Skript in die Karte
kommt; die fest eingebauten Ebenen dürfen weiterhin HTML tragen, weil ihre
Attribution im Code steht und nicht in der Datenbank.

## GetCapabilities läuft über den Server

Die Geodatendienste setzen keine CORS-Kopfzeilen, der Browser kommt also nicht an
ihre Antwort. Die Server Action
[src/app/actions/mapCapabilities.ts](../src/app/actions/mapCapabilities.ts) holt
das Dokument, prüft vorher die Adresse und begrenzt Laufzeit und Größe.

Geparst wird mit einem eigenen, kleinen XML-Leser
([src/common/wmsCapabilities.ts](../src/common/wmsCapabilities.ts)) statt mit
`DOMParser`: den gibt es auf dem Server nicht, und ein Parser ohne DOM lässt sich
ohne jsdom testen. Zwei Eigenheiten des Formats sind darin abgebildet:

- **Layer sind verschachtelt.** Der äußere Layer ist meist nur eine Überschrift
  ohne `<Name>` und damit nicht anforderbar; nur benannte Layer landen in der
  Auswahl.
- **Ausdehnung wird vererbt.** WMS 1.3.0 schreibt sie als
  `EX_GeographicBoundingBox`, 1.1.1 als `LatLonBoundingBox` — beide werden
  gelesen, und ein innerer Layer ohne eigene Angabe erbt die des äußeren.

Versucht wird erst 1.3.0, dann 1.1.1: ältere ArcGIS- und MapServer-Installationen
beantworten jeweils nur eine der beiden Fassungen brauchbar.

Die Import-Hilfe gibt es **nur für WMS**. Ein WMTS-Capabilities liefert
`ResourceURL`-Templates mit `{TileMatrix}/{TileRow}/{TileCol}` über einem
beliebigen `TileMatrixSet`; auf `{z}/{x}/{y}` lässt sich das nur für
GoogleMapsCompatible-Raster übersetzen, und ein Fehlschlag wäre von außen nicht
zu unterscheiden. Für Kachel-Dienste wird das Template deshalb eingefügt.

## Darstellung

Gerendert wird in
[src/components/Map/layers/CustomMapLayers.tsx](../src/components/Map/layers/CustomMapLayers.tsx)
als zusätzliche `LayersControl.Overlay`-Einträge — innerhalb von
`<LayersControl>`, weil `LayersControl.Overlay` seine Steuerung über den
React-Kontext findet.

- **Namen müssen eindeutig sein.** Leaflets `L.Control.Layers` verwaltet seine
  Einträge über den Namen; zwei gleich benannte Ebenen ließen sich nicht mehr
  getrennt schalten. `uniqueOverlayNames` hängt an Doppelte eine Nummer.
- **`errorTileUrl` ist ein transparentes Pixel.** Ohne das pflastert Leaflet die
  Karte mit dem Symbol für ein kaputtes Bild, sobald der fremde Dienst eine
  Kachel nicht liefert.
- **`zIndex` startet bei 300**, also über dem, was Leaflet den Basis- und
  Überlagerungsebenen im `tilePane` vergibt.
- Jede Ebene hängt in einer eigenen `LayerErrorBoundary`: was beim Rendern
  scheitert, nimmt weder die übrigen Ebenen noch die Karte mit.
- **Der React-Key ist eine Signatur der Konfiguration** (`mapLayerConfigKey`).
  `react-leaflet` übernimmt an einer laufenden Kachelebene nur `opacity` und
  `zIndex`, bei einer reinen Kachelebene zusätzlich die URL — ein geänderter
  `LAYERS`-Wert oder eine andere Begrenzung würden sonst erst nach einem
  Neuladen der Seite wirken. Über den Key wird die Ebene stattdessen neu
  aufgebaut.

## Historie

`useFirecallMapLayers` liest **ohne** die Historien-Pfadsegmente. Eine
Kartenebene ist keine Lageinformation, sondern eine Einstellung der Darstellung:
beim Blick in einen früheren Stand sollen dieselben Hintergrundkarten verfügbar
sein wie jetzt. Der Stand der Lage kommt aus den Elementen, nicht aus dem WMS des
Nachbarbezirks.

## Löschen ist endgültig

Einsatzelemente werden weich gelöscht (`deleted: true`) und lassen sich unter
`/admin/deleted-items` wiederherstellen. Diese Verwaltung kennt nur die
Collections `item` und `layer`. Eine weich gelöschte Kartenebene läge damit für
immer unerreichbar herum, also wird sie wirklich gelöscht; der Vorgang steht im
Audit-Log. Beim Lesen wird `deleted === true` trotzdem gefiltert — importierte
Dokumente können das Feld tragen.

## Nebenbefund: der Tippfehler `WTMS`

`Map.tsx` und `LocationMapPicker.tsx` filterten auf
`(layer.type || 'WTMS') == 'WTMS'`. `TileConfig.type` kennt nur `'WMTS' | 'WMS'`,
also fiel jede Ebene mit korrekt gesetztem `type: 'WMTS'` aus **beiden** Filtern
und wurde gar nicht gerendert; nur Ebenen ganz ohne `type` funktionierten. Mit
[#744](https://github.com/r00tat/ffn-hydrantenmap/issues/744) korrigiert, weil
die eigenen Kartenebenen ihren Typ ausdrücklich tragen.

## Was bewusst offen blieb

- **App-weite Vorlagen** (ein Admin definiert Kartenebenen in `appConfig`, die
  sich in jedem Einsatz übernehmen lassen). Nice-to-have aus dem Issue.
- **Precaching im Service Worker.** Eigene Kartenebenen werden ausdrücklich
  nicht vorgeladen — der Dienst ist unbekannt, seine Kachelmenge auch. Die
  Oberfläche weist im Dialog darauf hin.
