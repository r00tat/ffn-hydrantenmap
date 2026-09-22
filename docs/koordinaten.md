# Koordinaten

Eine Position kommt von außen an: von der Polizei, von der
Landessicherheitszentrale, aus einer Meldung, als geteilter Standort. Die App
rechnet intern ausschließlich in Dezimalgrad (WGS84) — alles andere ist
Schreibweise, und dieses Kapitel sagt, welche gelesen werden und warum genau
diese.

| Modul | Zuständig für |
| --- | --- |
| [`src/common/coordinates.ts`](../src/common/coordinates.ts) | Winkel: Dezimalgrad, DMS, DDM, Kartenlinks. Kein proj4, nur Text |
| [`src/common/coordinates-grid.ts`](../src/common/coordinates-grid.ts) | Ebene Gitter: UTM und Bundesmeldenetz. Rechnet mit proj4 |
| [`src/components/inputs/CoordinateFields.tsx`](../src/components/inputs/CoordinateFields.tsx) | Die Felder am Element |

Die Trennung ist keine Formsache: `coordinates.ts` bleibt ohne Abhängigkeit
prüfbar, und wer nur ein DMS-Paar lesen will, zieht sich keine Projektion ins
Bundle. Dass proj4 trotzdem nichts kostet, liegt am Höhenmodell — es liegt über
[`wgs-convert.ts`](../src/common/wgs-convert.ts) ohnehin schon im Client.

## Anzeige zuerst, Eingabe auf Klick

Am Element steht die Position als Text; erst der Stift klappt die Felder auf.
Eine Position kommt fast immer von der Karte — sie einzutippen ist der
Ausnahmefall, und sechs offene Zahlenfelder an jedem Element wären für den
Regelfall die falsche Voreinstellung.

Aufgeklappt hält die Komponente immer nur **einen** Entwurf: das Feld, in dem
gerade getippt wird. Alle übrigen zeigen die gespeicherte Position. Damit gibt
es keinen Gleichlauf zwischen sechs Zuständen zu pflegen, und nichts formatiert
sich unter den Fingern um. Beim Verlassen zerfällt der Entwurf.

## UTM

Geschrieben wird `33T 638004 5312206` — Zone, Bandbuchstabe, Rechtswert,
Hochwert in ganzen Metern. So steht es auf der ÖK, und so sprechen es
Bundesheer und Leitstellen.

Die Zone folgt aus der Länge, nicht aus einer Annahme: Österreich liegt in
**zwei** Zonen, die Grenze verläuft bei 12° Ost. Eine fest eingebaute 33 wäre
westlich von Innsbruck falsch.

Gelesen wird der Buchstabe nach der einfachen Regel **A–M südlich, N–Z
nördlich**. Das deckt beides ab, was in freier Wildbahn vorkommt: das Band
(`33T`, `33U`) und die Halbkugel (`33N`). Die Unsauberkeit dabei ist bekannt —
ein `S` meint als Band 32–40° Nord und als Halbkugel den Süden; hier gilt es
als Band. Für eine Feuerwehr im Burgenland ist das folgenlos, und die
Alternative wäre, `33U` abzulehnen, was viel öfter weh täte.

Das MGRS-Quadrat (`33T XP 12345 67890`) ist **nicht** implementiert. Es braucht
die 100-km-Quadratbuchstaben und damit entweder eine weitere Bibliothek oder
eine eigene Tabelle; solange niemand danach fragt, ist der Nutzen kleiner als
die Fläche.

## Bundesmeldenetz (Gauß-Krüger)

Geschrieben wird `M34 788550 312316`. Das ist, was im Kataster, im
Burgenland-GIS und in unseren eigenen Hydrantendaten steht.

Die drei Streifen (M28, M31, M34) unterscheiden sich in der Projektion nur im
Mittelmeridian (10°20', 13°20', 16°20') und im falschen Rechtswert
(150/450/750 km). Der falsche Rechtswert ist dabei mehr als Buchhaltung: Er
macht die Zahl selbsterklärend — **steht kein Streifen dabei, verrät ihn der
Rechtswert.** Die drei Bereiche liegen so weit auseinander, dass keine Angabe
aus Österreich in zwei davon passt.

Beim Lesen wird geprüft, ob das Ergebnis im beanspruchten Streifen liegt
(±3° um den Mittelmeridian, doppelt so weit wie nominell, weil an den Grenzen
der Nachbarstreifen weitergeführt wird). Ohne diese Probe würde aus einem
UTM-Paar, das versehentlich ins BMN-Feld gerät, klaglos ein Punkt irgendwo auf
der Welt: Die Rechnung geht ja auf, nur die Zahlen gehören nicht dorthin.

**Achtung, zwei Systeme mit derselben Abbildung:** Unsere Hydranten-Importe
lesen teils `EPSG:31256` („GK East", Rechtswert ab 0), das BMN-Feld schreibt
`EPSG:31259` (Rechtswert ab 750000). Dieselbe Stelle, um exakt 750 km
verschobene Zahlen. Der Hydrant, an dem
[`coordinates-grid.test.ts`](../src/common/coordinates-grid.test.ts) die
Umrechnung gegenprüft, ist genau deshalb aus
[`hydrantenCsvConverter.test.ts`](../src/server/hydrantenCsvConverter.test.ts)
übernommen — die Zahlen dort stammen aus dem Burgenland-GIS und nicht aus
unserer eigenen Rechnung.

Die Datumsverschiebung (MGI/Bessel gegen WGS84) steckt im `towgs84`-Teil der
Definitionen in `wgs-convert.ts`. Ohne sie läge alles um mehrere hundert Meter
daneben.

## Kartenlinks

`parseCoordinatePair` nimmt auch eine Adresse und sucht darin der Reihe nach:
die Abfrageparameter (`q`, `ll`, `mlat`/`mlon`, …), den Pfad einer
`geo:`-Adresse, das `@lat,lng` im Google-Pfad, das `#map=z/lat/lng` von
OpenStreetMap. Die erste lesbare Fundstelle gewinnt — `geo:0,0?q=…` führt die
Position im Parameter, und der Pfad davor ist Beiwerk.

Ein Kurzlink (`maps.app.goo.gl/…`) wird **nicht** aufgelöst. Die Position steht
erst hinter der Weiterleitung, und die gibt es im Einsatz womöglich nicht.
Lieber eine klare Fehlermeldung als ein Feld, das auf ein Netz wartet.

## Was bewusst fehlt

- **what3words** — braucht eine Online-API mit Schlüssel und ist damit genau
  dann tot, wenn man sie braucht.
- **Plus Codes** — technisch billig, in Österreich praktisch nicht im Umlauf.
- **Geohash, Web Mercator, ETRS89-LAEA** — stehen im Code, sind aber Index und
  Kachelrechnung. Niemand liest sie über Funk vor.
- **Austria Lambert (EPSG:31287)** — BEV-Fachdaten, in der Lage irrelevant.
- **Straßenkilometrierung („A4 km 34,5")** — eine Straßenreferenz, kein
  Punktformat; das käme über GIP-OGD und wäre ein eigenes Thema.
