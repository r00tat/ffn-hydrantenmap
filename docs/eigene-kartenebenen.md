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
deshalb alle Tags **und maskiert danach den Rest** — eine eigene Quelle lässt
sich nicht verlinken.

Die Reihenfolge trägt die Zusicherung: das Entfernen der Tags allein wäre über
verschachtelte oder abgeschnittene Tags zu umgehen (`<img src="x>" onerror=…>`),
das anschließende Maskieren lässt aber **kein einziges `<` oder `>`** im
Ergebnis stehen. Ohne spitze Klammer kann `innerHTML` kein Element bauen. Ein
Test in `mapLayers.test.ts` hält genau das fest, damit ein späterer Umbau die
Reihenfolge nicht umdreht. Das ist der Preis dafür, dass über das Feld kein Skript in die Karte
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

### Was der Dienst über den Layer verrät

`deriveMapLayerSettings`
([src/common/mapLayerFromCapabilities.ts](../src/common/mapLayerFromCapabilities.ts))
füllt aus dem Capabilities-Dokument fast das ganze Formular: Titel,
Beschreibung (`<Abstract>`), Quellenangabe (`<Attribution><Title>`), Ausdehnung,
Format und Zoomgrenze. Von Hand eingetragen wurde davon erfahrungsgemäß nichts.

Drei Ableitungen sind nicht offensichtlich:

- **`maxNativeZoom` aus der Maßstabsgrenze.** 1.3.0 nennt
  `<MinScaleDenominator>`, 1.1.1 `<ScaleHint min>`. Die Grenze heißt „Min",
  meint aber die **feinste** Stufe: der kleinere Nenner ist der größere
  Maßstab. Abgerundet wird mit einem Zehntel Toleranz — die Dienste
  veröffentlichen gerundet, ein `ScaleHint` von `0.4223` ergibt 18,99986 und
  fiele sonst eine ganze Stufe zurück.
- **Format nach `opaque`.** Meldet der Dienst den Layer als flächendeckend,
  gewinnt JPEG (kleinere Kachel), sonst PNG (nur das kann Transparenz).
- **Mehrere Layer in einer Anfrage:** Ausdehnung als **Vereinigung** (sonst
  schnitte der engste die anderen weg), Zoomgrenze als **Minimum** (sonst
  liefert der empfindlichste in den feinsten Stufen nichts mehr) — und nur
  dann, wenn *alle* eine Grenze nennen.

**Die Warnung zum Koordinatensystem ist kein Zierrat.** `L.TileLayer.WMS`
fragt `EPSG:3857` an. Ein Dienst, der das nicht führt, antwortet mit einer
Fehlermeldung statt einer Kachel — die Ebene bleibt still leer, und im Einsatz
sucht man den Fehler woanders. Gemeldet wird nur, wenn der Layer überhaupt
Koordinatensysteme nennt; die Angabe ist vererbbar und fehlt in der Praxis oft
ganz.

### Zwei Adressen, nicht eine

`url` und `capabilitiesUrl` sind getrennte Felder, weil sie auseinanderfallen
können:

- **`url` muss die GetMap-Adresse sein**, sonst liefert die Ebene keine einzige
  Kachel. Wer eine `…?REQUEST=GetCapabilities` einträgt und stehen lässt, bekommt
  auf jede Kachelanfrage das Metadatendokument zurück. Deshalb kürzt
  `stripWmsRequestParams` alle Parameter weg, die Leaflet selbst setzt.
- **Die eingegebene Adresse ist nicht zwingend die GetMap-Adresse.** Capabilities
  werden gelegentlich als statisches Dokument unter einem ganz anderen Pfad
  abgelegt, und manche Dienste trennen Metadaten- und Kartenendpunkt. Der Dienst
  nennt die richtige selbst, unter
  `<GetMap><DCPType><HTTP><Get><OnlineResource>`; `serviceUrlForLayer` gibt ihr
  den Vorrang. Nur wenn sie fehlt oder unbrauchbar ist, bleibt es bei der
  eingegebenen — sehr häufig, weil viele Dienste dort bis heute `http://`
  eintragen, was im Browser an Mixed Content scheiterte.

Gemerkt wird die abgefragte Adresse deshalb in `capabilitiesUrl`. **Ohne sie
wäre die Layer-Auswahl nach dem Speichern nicht mehr aufzurufen:** die Liste der
wählbaren Layer gibt es nur im Capabilities-Dokument, gespeichert ist bloß der
`LAYERS`-Wert. Beim Bearbeiten einer bestehenden WMS-Ebene fragt der Dialog
darum einmal still nach — still heißt: ein Fehlschlag erzeugt keine Warnung
(bearbeitet werden soll die Ebene trotzdem), und übernommen wird **nichts**.
Sonst überschriebe das bloße Öffnen des Dialogs von Hand geänderte
Einstellungen.

### Der Server fragt eine fremde Adresse an — die drei Schranken

Das `GetCapabilities` ist die **einzige** Stelle, an der die Anwendung eine vom
Benutzer eingegebene Adresse selbst abruft. Damit steht sie im Netz der
Cloud-Run-Instanz und nicht im Browser: interne Dienste, das Metadaten-Endpoint
der Plattform, Adressen im VPC wären über diesen Umweg anfragbar (SSRF).
Dagegen stehen drei Schranken:

1. **Vor dem Abruf** — `isPublicHttpsUrl`
   ([src/common/fetchTargetGuard.ts](../src/common/fetchTargetGuard.ts)) verlangt
   `https:` ohne Zugangsdaten und weist Loopback, private Netze, `169.254/16`,
   interne Namensräume (`.internal`, `.local`, …), einteilige Namen und
   IPv6-Literale ab.
2. **Bei jedem Umzug** — `redirect: 'manual'` statt `'follow'`. Sonst ginge der
   erste Aufruf an einen harmlosen öffentlichen Namen, dessen Antwort auf
   `http://169.254.169.254/` verweist, und `fetch` folgte ungefragt. Jede
   Station wird erneut geprüft, höchstens drei.
3. **Beim Lesen** — der Körper wird stückweise gelesen und beim Überschreiten
   der Grenze abgebrochen. `response.text()` hätte erst die ganze Antwort in den
   Speicher geholt und danach die Grenze geprüft: eine Grenze, die nichts
   begrenzt, und ein endlos sendender Dienst hätte den Server lahmgelegt.

Was bleibt: die Prüfung sieht den **Namen**, nicht die aufgelöste Adresse. Ein
öffentlicher Name, der auf `127.0.0.1` zeigt (DNS-Rebinding), käme durch. Das
abzufangen hieße, selbst aufzulösen und die Verbindung an die geprüfte IP zu
binden — mit `fetch` nicht möglich. Übrig bleibt ein blinder Abruf durch einen
bereits angemeldeten Benutzer, dessen Antwort den Server nur als Liste von
WMS-Layern verlässt.

`isSafeMapLayerUrl` in `mapLayers.ts` ist bewusst **weniger** streng und bleibt
es: Kacheln holt der Browser des Benutzers, ein Kartendienst im eigenen Netz ist
dort legitim. Die beiden Prüfungen nicht zusammenlegen.

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
- **Die Kachelgröße gehört zur Ebene** (`tileSize`, Vorgabe
  `DEFAULT_WMS_TILE_SIZE`). Manche Dienste sind hier nicht
  verhandlungsbereit — Hintergrund in [docs/kartenlayer.md](kartenlayer.md).
- Jede Ebene hängt in einer eigenen `LayerErrorBoundary`: was beim Rendern
  scheitert, nimmt weder die übrigen Ebenen noch die Karte mit.
- **Der React-Key ist eine Signatur der Konfiguration** (`mapLayerConfigKey`).
  `react-leaflet` übernimmt an einer laufenden Kachelebene nur `opacity` und
  `zIndex`, bei einer reinen Kachelebene zusätzlich die URL — ein geänderter
  `LAYERS`-Wert oder eine andere Begrenzung würden sonst erst nach einem
  Neuladen der Seite wirken. Über den Key wird die Ebene stattdessen neu
  aufgebaut.

## Wo die Kartenebenen mitgehen — und wo nicht

| Weg | Kartenebenen dabei? |
| --- | --- |
| Backup eines Einsatzes (JSON-Export/Import, `useExport.ts`) | ja, als `mapLayers` |
| Export/Import für lagekarte.info | ja — `wmslayers` plus `ffnd`-Block, siehe [docs/lagekarte-austausch.md](lagekarte-austausch.md) |
| History-Snapshot (`useSaveHistory.ts`) | nein, absichtlich — siehe unten |
| Service-Worker-Precaching | nein, absichtlich |

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
