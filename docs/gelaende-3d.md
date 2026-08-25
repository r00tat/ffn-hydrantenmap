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

## Bedienung: Drehen **und** Verschieben

Ein Ausschnitt über ein Einsatzgebiet ist größer als das, was aus einem
Blickpunkt zu sehen ist. Drehen und Zoomen allein reichen deshalb nicht — man
muss sich auch über das Gelände bewegen können.

| Eingabe | Wirkung |
| --- | --- |
| linke Maustaste | drehen |
| rechte Maustaste | verschieben |
| Mausrad / mittlere Taste | zoomen |
| ein Finger | drehen |
| zwei Finger | verschieben und zoomen |

Die Zuordnung ist in `gelaende3dScene.ts` **ausdrücklich gesetzt** und nicht den
Vorgaben von `OrbitControls` überlassen: ein Versionswechsel von three soll die
Bedienung nicht still ändern.

`screenSpacePanning` steht auf `false`, verschoben wird also entlang des
Geländes und nicht in der Bildebene. In der Bildebene geschoben steigt der
Blickpunkt bei gekippter Kamera mit, und man hebt sich unbemerkt vom Boden ab.

## Die Marken sind eigene Symbole, nicht die der Karte

Die Kartensymbole taugen in der Szene nicht. Sie sind für die Aufsicht
gezeichnet — teils als Nadel, deren Spitze der Ankerpunkt ist, teils als 24 px
großes Quadrat ohne eigenen Rand. Schräg von der Seite und vor einem Luftbild
als Untergrund verschwinden sie darin.

`markerBadge.ts` zeichnet deshalb je Symbol eine eigene Marke: eine weiße Nadel
mit dunklem Rand und Schlagschatten, das Kartensymbol mittig darin. Das Symbol
bleibt dasselbe wie in der Karte — nur der Träger ist ein anderer, und das
Objekt bleibt wiedererkennbar.

Drei Einzelheiten daran sind Absicht:

- **Der Ankerpunkt sitzt an der Spitze**, nicht in der Mitte des Sprites. Sonst
  zeigte die Marke nicht auf ihren Standort, sondern schwebte mittig darüber.
- **Ohne Symbol bleibt ein Punkt stehen.** Eine leere weiße Platte wäre von
  einem Ladefehler nicht zu unterscheiden.
- **Ein Symbol, das nach 5 s nicht geladen ist, gilt als nicht vorhanden.** Ohne
  diese Frist hinge die Marke an einem Abruf, der weder `load` noch `error`
  meldet — und weil das Bild erst nach dem Symbol gezeichnet wird, bliebe die
  Marke unsichtbar. Ein Objekt, das im Gelände fehlt, ist schlimmer als eines
  ohne sein Symbol.

Gezeichnete Marken liegen je Symbol-URL in einem Vorrat: ein Einsatz hat leicht
dreißig Objekte desselben Typs, und ohne ihn wäre jedes ein eigener Bildabruf
und eine eigene Textur.

Die Marken haben **konstante Bildschirmgröße** (`sizeAttenuation: false`), damit
eine weit entfernte nicht verschwindet. Die Größe ist ein Anteil der Bildhöhe;
4,5 % ergeben auf einem Tablet rund 40 px und damit dieselbe Größenordnung wie
eine Marke in der Karte. Größer gesetzt decken dreißig Objekte das Gelände zu,
das sie erklären sollen.

## Die Wasserflächen sind ein Spiegel, keine eingefärbte Zone

Das Wasserstandsmodell ([docs/wasserstandsmodell.md](wasserstandsmodell.md))
speichert seine Flutfläche am Element als Tiefenbänder. Die Karte färbt diese
Bänder ein — in der Fläche ist das die einzige Möglichkeit, Tiefe zu zeigen.

In der Szene ist die ehrlichere Darstellung eine **waagrechte Ebene auf der Höhe
des Wasserstands**: das Gelände ragt daraus hervor oder eben nicht, und genau
das ist die Frage im Hochwasserfall. Die Tiefe steht dann bereits zwischen dem
Spiegel und dem Gelände darunter — die Bänder werden dafür nicht gebraucht. Es
zählt nur der 0-m-Ring, also der Umriss der nassen Fläche.

Der Wasserstand ist `Basishöhe + Zuschlag` in EVRF2000 — dieselbe Skala wie die
Höhen im Netz, ohne Umrechnung. Ein Element ohne Basishöhe hat keinen Spiegel
und wird übergangen; eine Fläche ohne Höhe wäre eine Behauptung.

Die Ringe werden nach **Even-odd** in Umrisse und Löcher zerlegt (`ringPolygons`)
— dieselbe Regel, mit der die Karte die Fläche füllt. Eine andere Regel hier
hieße, dass die überflutete Fläche in 3D eine andere wäre als in der Karte, und
eine Insel im Hochwasser ist genau die Stelle, auf die man schaut.

Die Ringe werden auf den Ausschnitt **zugeschnitten** (Sutherland-Hodgman gegen
den Rahmen der Szene). Eine Flutfläche endet nicht am Kartenrand — sie ist über
einen Umkreis gerechnet, der weit darüber hinausgehen kann. Ungeschnitten
spannte sie die Szene auf, ohne dass mehr zu sehen wäre: das Gelände hört am
Rand des Netzes auf, das Wasser liefe ins Leere weiter, und der Blick zöge sich
auf einen blauen Fleck zurück.

Der Spiegel schreibt **nicht in den Tiefenpuffer** (`depthWrite: false`): sonst
verdeckte er Leitungen und Marken, die hinter ihm liegen. Sichtbar ist er von
beiden Seiten — man schaut auch von unterhalb des Spiegels auf die Lage, wenn
die Kamera im Tal steht.

Da der Spiegel flach ist, macht ihm die Überhöhung nichts: er liegt in der
überhöhten Gruppe und wandert mit dem Gelände, bleibt aber eine Ebene.

## Die Höhenlinien tragen ihre Höhe

Ohne die Angabe ist eine Höhenlinie nur ein Strich — man sieht, dass es steiler
wird, aber nicht, worauf. Beschriftet werden dieselben Linien wie in der Karte:
die **Zähllinien** (`isIndexContour`), nicht jede. Bei 0,5 m Äquidistanz hat ein
flacher Ausschnitt über tausend Linienstücke; jedes beschriftet wäre eine Wand
aus Zahlen.

Höchstens 60 Angaben stehen im Bild, und wenn es mehr Kandidaten gibt, wird
**gleichmäßig ausgedünnt** statt vorne abgeschnitten — sonst wäre die eine
Bildhälfte beschriftet und die andere nicht. Die Angabe sitzt in der Mitte des
Zuges; an den Enden läuft eine Linie oft aus dem Bild.

Gezeichnet wird der Text auf ein Canvas (`labelCanvas.ts`) — in der Szene gibt
es kein DOM. Statt eines Kastens hinter der Zahl steht eine dunkle Kontur um
sie: ein Kasten deckt das Gelände zu, das die Zahl erklären soll. Dieselbe
Überlegung wie bei `contourLabelColor` in der Karte, nur mit anderem Mittel.

Die Angaben hängen wie die Marken **außerhalb** der überhöhten Gruppe — ein
Sprite darin würde von `scale.y` in die Länge gezogen und die Zahl unlesbar.
Ihre Höhe wird bei jedem Zug am Regler neu gesetzt. Der Schalter für die
Höhenlinien schaltet sie mit: bleiben die Zahlen ohne ihre Linien stehen,
schweben Höhenangaben über einem Gelände, an dem nichts sie einordnet.

## Die Pumpen liegen überhöht, sind aber nicht verzerrt

Die Pumpenstandorte der Löschwasserförderung gehören zum Gelände und nicht zur
Beschriftung: sie sollen mit dem Hang wandern und liegen deshalb in derselben
Gruppe wie das Netz. Damit trifft sie auch deren `scale.y` — bei sechsfacher
Überhöhung wäre aus der Kugel ein stehendes Ei.

Die Skalierung wird an der Kugel selbst zurückgenommen (`radius / exaggeration`
in y). Die **Lage** bleibt damit überhöht, die **Form** nicht. Dasselbe gilt
sinngemäß für die Marken, die ganz außerhalb der überhöhten Gruppe hängen.

Leitungen und Höhenlinien brauchen die Korrektur nicht: ihre Strichstärke ist
eine Bildschirmgröße (`LineMaterial`) und von der Szenenskalierung unberührt.

## Die Ansicht zeigt dieselbe Lage wie die Karte

Ausgeblendete Ebenen bleiben in 3D ausgeblendet. Wer eine Ebene abschaltet, hat
sie abgeschaltet — sie hier trotzdem zu zeigen wäre ein zweites, abweichendes
Lagebild, und genau das darf im Einsatz nicht passieren. Dasselbe gilt für die
Höhenlinien: ist die Überlagerung in der Karte aus, öffnet die Ansicht mit
ausgeschaltetem Schalter.

Die Sichtbarkeit steckt in **Leaflets** Layer-Steuerung, nicht in React, und ist
nur über `overlayadd`/`overlayremove` zu erfahren. Die melden aber ausschließlich
Änderungen, nie den Anfangszustand. `visibleItems.ts` legt deshalb für alles,
worüber noch keine Meldung kam, dieselbe Vorbelegung zugrunde wie
`FirecallLayer.tsx`: Ebenen sind an, sofern nicht `defaultVisible === 'false'`
am Datensatz steht; die Höhenlinien sind aus.

Objekte ohne Ebene — und solche, deren Ebene gelöscht wurde — hängen an der
Überlagerung „Einsatz", dieselbe Regel wie in `FirecallItemsLayer.tsx`.

## Der Knopf in der Karte

Der 3D-Knopf steht **nicht** in der Gruppe unten rechts. Dort stehen die
primären Funktionen — Anlegen, Bearbeiten, Verlauf; die 3D-Ansicht ist eine
Sicht auf die Lage, keine Arbeit an ihr, und ein gleich großer Knopf daneben
stellte sie auf eine Stufe damit.

Seine Höhe richtet sich danach, was tatsächlich unter ihm steht
(`threeDFabBottom`). Die Knöpfe der rechten Spalte setzen ihre Position jeweils
selbst, und die meisten gibt es nur im Bearbeiten-Modus: Suche (120),
Aufzeichnung (160), Assistent (172). Ein fester Wert über dem Assistenten ließe
den Knopf außerhalb des Bearbeitens über einer Lücke hängen; ist die Gruppe ganz
unten leer — Nur-Lese-Gast ohne Verlauf —, rückt er bis dorthin nach.

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
- **Die Tiefenbänder des Wasserstandsmodells.** Die Szene zeigt den Spiegel, nicht
  die abgestuften Zonen der Karte — die Tiefe steht zwischen Spiegel und Gelände.
  Gerechnet wird das Modell weiterhin ausschließlich in
  [docs/wasserstandsmodell.md](wasserstandsmodell.md); die 3D-Ansicht liest nur,
  was am Element steht, und stößt keinen Flutlauf an.

## Datenquelle

Die Höhen stammen aus dem BEV-ALS-DGM. Die Nennung „Datenquelle: Bundesamt für
Eich- und Vermessungswesen (BEV)" steht in der Ansicht und ist
**Lizenzbedingung**, kein Beiwerk — siehe [docs/hoehenmodell.md](hoehenmodell.md).
