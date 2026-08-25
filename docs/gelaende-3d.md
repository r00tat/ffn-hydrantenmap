# Gelände in 3D

Die Ansicht zeigt den aktuellen Kartenausschnitt als gekipptes, drehbares
Gelände — mit dem Kartenbild als Textur, den Einsatzobjekten, den Leitungen samt
Pumpenstandorten und den Höhenlinien auf der Geländehaut. Sie öffnet als
Vollbilddialog aus der Karte und rechnet aus demselben Höhenmodell wie die
Höhenlinien ([docs/hoehenmodell.md](hoehenmodell.md)).

Hier steht das „warum". Wie es aussieht, steht im Code:
[src/components/Map/Gelaende3d/](../src/components/Map/Gelaende3d/) und
[src/common/terrain/terrainMesh.ts](../src/common/terrain/terrainMesh.ts).

## Eine eigene three-Szene, kein Wechsel der Kartenbibliothek

Leaflet kennt keine dritte Dimension. Naheliegend wäre gewesen, die Karte auf
MapLibre umzustellen, das Geländekippung mitbringt. Dagegen sprechen zwei Dinge,
die beide dauerhaft wären:

- MapLibre bräuchte die Höhen als **zweite Kachelpyramide in Web Mercator**. Der
  vorhandene Bestand liegt in EPSG:3035-Blöcken; ihn ein zweites Mal in einem
  anderen Gitter vorzuhalten hieße, jeden Import doppelt zu fahren.
- Die Karte trägt Marken, Dialoge, Bearbeitung und Layer-Steuerung auf Leaflet.
  Ein zweiter Renderstack daneben wäre nicht eine Ansicht mehr, sondern eine
  zweite Karte, die von da an mitgepflegt werden muss.

Deshalb: eine **eigene three-Szene** in einem Dialog. Leaflet bleibt
unangetastet, und die Szene lebt nur, solange der Dialog offen ist. Geladen wird
sie über `next/dynamic`, `three` liegt damit in einem eigenen Chunk — eine
Kartensitzung, die die Ansicht nie öffnet, lädt nichts davon.

## Das Gitter liegt in Web Mercator, nicht in LAEA

Der Datenbestand ist in EPSG:3035 (ETRS89-LAEA) gerastert, und das Mosaik, aus
dem die Höhenlinien entstehen, ebenso. Das Netz wird trotzdem **regelmäßig in
Web Mercator** aufgespannt und die Höhen werden einmal bilinear umgetastet.

Der Grund ist die Meridiankonvergenz: ein LAEA-achsparalleles Rechteck steht im
nordorientierten Bild um etwa 5° gedreht (siehe `projection.ts`). Ein Netz in
LAEA hätte also einen schief stehenden Geländefleck, und die Kartenkacheln —
die in Mercator liegen — müssten je Vertex verzerrt daraufgelegt werden.

Der Vorbehalt gegen Resampling in [docs/hoehenmodell.md](hoehenmodell.md)
richtet sich gegen Resampling **im Datenbestand**. Hier wird nichts gespeichert;
das Umtasten gilt der Darstellung und geschieht bei jeder Abfrage neu.

Fehlt einer der vier Nachbarn beim Abtasten, ist das Ergebnis `NaN`, und jedes
Dreieck mit einem solchen Eckpunkt entfällt. Aus drei Werten interpoliert wäre
es eine erfundene Höhe — von einer echten nicht zu unterscheiden.

## Die Szene rechnet in Geländemetern

Mercator überzeichnet Strecken um `1/cos φ`. Auf 48° Breite sind das **1,49**.
Eine Szene, die Mercator-Meter als Einheiten nimmt, wäre also um diesen Faktor
zu breit — und weil die Höhen in echten Metern kommen, wäre das Gelände um
denselben Faktor zu flach.

Sichtbar wäre das nicht: ein gleichmäßig gestauchtes Gelände sieht aus wie ein
Gelände. Falsch wäre nur der **angeschriebene Überhöhungsfaktor**, und den liest
man als Zahl. Deshalb multipliziert `groundScale(φ)` alle Mercator-Koordinaten
mit `cos φ`; eine Szeneneinheit ist danach ein Geländemeter.

Aus demselben Grund kommt die Mitte des Netzes (`center`) aus dem
Mercator-Rechteck zurückgerechnet und nicht als Mittel der beiden Breitengrade:
`mercatorY` ist nicht linear, und der Szenenursprung liegt auf dem
Mercator-Mittel. Auseinandergerechnet lägen die Marken um gut 10 cm neben ihrem
Gelände.

Koordinatenrahmen: **x nach Osten, y nach oben, z nach Süden**, Ursprung in der
Mitte des Ausschnitts. Die Umlaufrichtung der Dreiecke ist so gewählt, dass die
Normale nach +y zeigt.

## Die Überhöhung ist adaptiv — und deshalb angeschrieben

Das Einsatzgebiet reicht von der Ebene bis in den Wagram. Gemessen (siehe
[docs/hoehenmodell.md](hoehenmodell.md)) deckt ein Quadratkilometer Seewinkel
**5,7 m** Höhenunterschied ab, einer am Wagram **58,7 m** — ein Faktor 10. Ein
fester Überhöhungswert macht das eine zur Platte oder das andere zur Wand.

Die Ansicht wählt den Faktor deshalb aus dem Relief des Ausschnitts, mit dem
Ziel, dass das Relief rund 10 % der Ausschnittsbreite einnimmt — dieselbe
Entscheidung wie bei der Farbrampe der Höhenlinien.

Der Preis ist, dass derselbe Hang in zwei Ausschnitten verschieden steil
aussieht. **Deshalb ist der Faktor im Bild angeschrieben, und das ist kein
Beiwerk:** ohne die Angabe liest man Steigungen falsch, und zwar überzeugt. Aus
demselben Grund stehen Stufe und Rasterweite dabei — ein Ausschnitt aus der
Übersichtsstufe (10 m) sieht sonst genauso genau aus wie einer aus der
Detailstufe (1 m).

Die Höhen im Netz sind **unverzerrt**; die Überhöhung ist eine Skalierung der
Szenengruppe. Ein Zug am Regler kostet damit keine neue Abfrage. Die Marken
hängen bewusst außerhalb dieser Gruppe — ein überhöhtes Symbol wäre verzerrt.

## Die Textur kommt aus `tiles.ts`, nicht aus Leaflet

Naheliegend wäre `L.TileLayer.getTileUrl(coords)` gewesen. Das ist falsch:
Leaflet setzt dort über `_getZoomForUrl()` die Zoomstufe der **Karte** ein, nicht
die im Argument. Die Textur läuft aber fast immer auf einer gröberen Stufe als
die Karte, damit sie ins Pixelbudget passt — es kämen also durchweg die falschen
Kacheln, und zwar plausibel aussehende. Die URLs werden deshalb aus der
Konfiguration in `tiles.ts` mit `L.Util.template` gebaut.

WMS-Layer (Orthofoto Burgenland) kennen kein Kachelschema; für sie geht ein
einzelnes `GetMap` über das ganze Mercator-Rechteck — zugleich weniger Verkehr
als 64 Einzelanfragen.

`crossOrigin = 'anonymous'` ist Pflicht: ohne das färbt das erste fremde Bild
das Canvas ein („tainted"), und der Texturupload nach WebGL wirft. Das Gelände
bliebe grau, ohne dass irgendwo ein Fehler steht. basemap.at, OpenStreetMap und
der Burgenland-WMS senden `Access-Control-Allow-Origin` — geprüft.

Eine Kachel, die nicht lädt, bleibt **neutral grau**. Schwarz wäre von einem
Loch im Gelände nicht zu unterscheiden.

## Budgets

| Größe | Wert | Begründung |
| --- | --- | --- |
| Vertices | 65.536 (256 × 256) | rund 800 KB, werden übergeben statt kopiert; ein einzelner Detailblock hätte für sich 1 Mio. Zellen |
| Texturkante | 2048 px | 64 Kacheln; 4096 ist auf manchen Tablets schon die Treibergrenze |
| kleine Bildschirme | 16.384 Vertices / 1024 px | das Handy ist kein Zielgerät, soll aber nicht kaputt sein |
| Mosaikzellen | 2,5 Mio. | dieselbe Schranke wie bei den Höhenlinien, s. `terrainMosaic.ts` |

Das Netz wird nie feiner als das Mosaik, aus dem es kommt — mehr Vertices als
Quellzellen interpolieren nur zwischen Werten, die es schon gibt.

## Rendern bei Bedarf, Kontextverlust, Freigabe

Drei Eigenheiten tragen die Ansicht im Betrieb:

- **Gerendert wird bei Bedarf**, nicht in einer Dauerschleife. Eine offene,
  unbewegte Szene darf auf dem Tablet keinen Akku kosten — und im Einsatz liegt
  ein Tablet lange offen herum.
- **`webglcontextlost` wird behandelt** und mit `preventDefault()` beantwortet.
  Auf Tablets verliert der Browser den Kontext beim Wechsel in den Hintergrund;
  ohne `preventDefault` stellt er ihn nie wieder her, und es bleibt ein
  schwarzes Bild stehen.
- **`dispose()` beim Schließen gibt alles frei** — Geometrien, Materialien,
  Texturen, den Renderer. Ohne das sammelt sich über wenige Öffnungen so viel
  WebGL-Speicher an, dass der Kontext stirbt. Es träfe ausgerechnet den, der die
  Ansicht oft benutzt.

Das Canvas hängt als **Zustand** am Effekt, nicht als `useRef`: MUIs `Modal`
hängt seine Kinder erst einen Render nach dem Öffnen ein. Mit einer gewöhnlichen
Ref wäre sie beim ersten Lauf des Effekts leer, und der Effekt liefe nie wieder —
die Ansicht bliebe beim Ladekreis stehen.

## Was hier nicht drin ist

- **Schummerung (Hillshade) auf der 2D-Karte.** Wäre aus denselben Blöcken
  möglich, ist aber keine Anforderung dieser Arbeit.
- **Bearbeiten in 3D.** Die Ansicht zeigt; angelegt und verschoben wird in der
  Karte. Alles andere wären zwei Bedienwege für dieselbe Sache.
- **Das Wasserstandsmodell.** Es steht in
  [docs/wasserstandsmodell.md](wasserstandsmodell.md) und rechnet auf dem
  LAEA-Raster; eine Darstellung seiner Bänder in der Szene ist nicht Teil dieser
  Arbeit.

## Datenquelle

Die Höhen stammen aus dem BEV-ALS-DGM. Die Nennung „Datenquelle: Bundesamt für
Eich- und Vermessungswesen (BEV)" steht in der Ansicht und ist
**Lizenzbedingung**, kein Beiwerk — siehe [docs/hoehenmodell.md](hoehenmodell.md).
