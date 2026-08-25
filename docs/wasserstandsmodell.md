# Wasserstandsmodell

Anforderung 3 aus [#727](https://github.com/r00tat/ffn-hydrantenmap/issues/727), gebaut auf
dem eigenen Höhenmodell aus [#729](https://github.com/r00tat/ffn-hydrantenmap/pull/729)
([docs/hoehenmodell.md](hoehenmodell.md)).

Hier steht das „warum", das sich aus dem Code nicht ableiten lässt. Was der Code tut, steht
im Code — `src/common/terrain/floodFill.ts`, `floodBands.ts`, `wasserstand.ts`.

## 1. Was das Modell ist und was nicht

Eine **statische Badewanne**: Zu einem Wasserstand `h` gilt eine Zelle als überflutet, wenn
ihre Geländehöhe kleiner oder gleich `h` ist **und** sie über geflutete Nachbarzellen mit dem
Saatpunkt verbunden ist. Kein Zeitverlauf, keine Strömung, keine Massenerhaltung, keine
Durchlässe, keine Kanäle, keine Verklausung.

Das ist wenig — und beantwortet trotzdem die Frage, die im Einsatz gestellt wird und die die
amtlichen HQ-Karten nicht beantworten: *„Was steht unter Wasser, wenn der Pegel um noch einen
halben Meter steigt?"* HQ30/HQ100 sind Karten zu festen Jährlichkeiten, gerechnet für
Ereignisse, die in der Lage gerade nicht eintreten. Sie sagen nichts über den Pegelstand von
heute Nacht plus 50 cm.

Was die Badewanne dafür genau richtig macht: Sie ist **in Sekunden bis Minuten** gerechnet,
sie braucht außer dem Höhenmodell keine Daten, und ihr Ergebnis ist so grob, wie die
Eingangsgröße es zulässt — ein geschätzter Pegelzuschlag verdient keine 2D-Hydrodynamik.

Wo sie **falsch** liegt und das auch sagt:

- Ein Rohrdurchlass unter einem Damm ist im Höhenmodell nicht sichtbar. Das Modell sperrt
  dort, das Wasser fließt in Wirklichkeit durch.
- Umgekehrt ist ein Erdwall aus der Befliegung von 2019 heute vielleicht abgetragen.
- Der Wasserspiegel ist konstant angenommen (siehe Abschnitt 12).

Deshalb steht in Panel und Legende **immer** das Wort Abschätzung, samt Rasterweite,
Wasserstand und Datenquelle. Eine Fläche ohne diese Angaben wird als Tatsache gelesen.

## 2. Warum der Wasserstand aus dem angeklickten Punkt kommt

Bedient wird so: Punkt ins Gewässer setzen, Zuschlag wählen. Der Wasserstand ist

```
h = Geländehöhe am Saatpunkt + Zuschlag
```

Die naheliegende Alternative wäre, den Pegelstand einer amtlichen Messstelle einzugeben. Sie
scheitert an der Höhenkette: Der Pegel liegt in müA (Adria) oder in cm über Pegelnullpunkt,
das Höhenmodell in EVRF2000. Der Übergang ist das Versatzgitter aus
[docs/hoehenmodell.md](hoehenmodell.md) — über das Burgenland zwischen 0,337 m und 0,476 m,
also mit 13,9 cm Spanne. Bei Wassertiefen von 0,3 bis 1 m ist das ein erheblicher Anteil, und
es ist die **heikelste Größe** des ganzen Höhenmodells.

Mit dem angeklickten Punkt rechnet das Modell nur mit **Differenzen von Höhen desselben
Modells**. Der Adria-Versatz kürzt sich vollständig heraus:

```
Tiefe = h − Gelände = (Gelände am Saatpunkt + Zuschlag) − Gelände
```

Er bleibt nur noch **Anzeige**: Im Panel steht der Wasserstand zusätzlich in müA, damit man
ihn gegen einen Pegelwert halten kann. Ist das Versatzgitter nicht verfügbar, fehlt diese
Zeile — die Rechnung läuft weiter.

Der Preis: Der Saatpunkt muss **im Gewässer** liegen. Ein Punkt auf dem Uferdamm ergibt eine
Fläche von wenigen Zellen, und das sieht wie ein Fehler des Modells aus statt wie ein
Fehlgriff. Genau dafür gibt es zwei Rückmeldungen: `seedAboveLevel`, wenn schon der Saatpunkt
über `h` liegt, und die Warnung „Saatpunkt liegt vermutlich nicht im Gewässer" unter
`MIN_PLAUSIBLE_CELLS` = 3 Zellen.

## 3. Warum die Basishöhe gespeichert wird

`wasserBasisHoehe` und `wasserBasisStufe` stehen am Element, nicht nur im Speicher des
Clients, der den Punkt gesetzt hat.

Ohne das bekäme ein Gerät, das nur die Übersichtsstufe geladen hat, eine um Dezimeter andere
Basishöhe als das Tablet daneben — bei 10 m Raster ist eine Uferzelle ein Mittel über
100 m², und in einem Flussbett ist das nicht dieselbe Höhe wie der 1-m-Wert. Zwei Geräte
zeigten dann zwei verschiedene Wasserflächen zum selben Szenario, ohne dass irgendwo stünde,
warum.

Dieselbe Haltung wie bei den gespeicherten Höhenprofilen der Löschwasserförderung
([docs/loeschwasserfoerderung.md](loeschwasserfoerderung.md)): Was in eine Rechnung eingeht,
deren Ergebnis alle sehen, wird festgehalten und nicht auf jedem Gerät neu bestimmt. Die
Stufe wird mitgespeichert, und wenn die Basis aus der Übersicht kommt, bietet der Rechner
„Basishöhe neu bestimmen" an, sobald die Detailstufe da ist.

Wird der Marker verschoben, tastet `WasserstandComponent` die Basishöhe neu ab und schreibt
sie. Damit ändert sich die Signatur (Abschnitt 5) und das alte Ergebnis wird als veraltet
gekennzeichnet — **nicht** stillschweigend nachgerechnet.

## 4. Warum das Ergebnis am Element liegt, und als Polygone

Am Element (`wasserBaender`) liegen die **Polygonringe je Tiefenstufe**, kodiert. Kein
Raster, keine Rechnung beim Zeichnen.

Was das bringt:

- **Ein Lagebild für alle.** Wer die Karte öffnet, sieht die Fläche, die die Lageführung
  gerechnet hat — nicht eine, die sein Gerät gerade selbst gerechnet hat.
- **Offline ohne eine einzige Höhenkachel.** Im Hochwasserfall ist das der eigentliche
  Gewinn: Das Netz am Einsatzort ist genau dann schlecht, wenn die Fläche gebraucht wird.
- **Ein- und ausblendbar über die Einsatz-Layer.** Das Szenario ist ein gewöhnliches
  Firecall-Item mit `layer`; mehrere Szenarien liegen in verschiedenen Layern und werden über
  die Layer-Steuerung der Karte verglichen.
- **Ein Lauf statt N.** Gerechnet wird beim Anlegen und Konfigurieren, nicht bei jedem
  Kartenaufbau auf jedem Gerät.

Verworfen wurde ein **Canvas-Overlay mit einem Tiefenraster aus dem Worker**. Es wäre in der
Darstellung feiner gewesen, scheitert aber an drei Stellen:

1. Es liegt **außerhalb des Layer-Systems**. Ein `L.Layer` außerhalb des Element-Wegs erscheint
   nicht in der `LayersControl` der Einsatzkarte und ist nicht mit seinem Layer ein- und
   ausblendbar. Genau das war die Anforderung.
2. Es braucht auf **jedem** Client die Höhenkacheln, weil das Raster nicht gespeichert werden
   kann — 120 km² bei 1 m sind eine halbe Milliarde Zellen.
3. Jedes Overlay-Pixel bräuchte eine Umrechnung Lat/Lon → LAEA. Über einen Kartenausschnitt
   näherungsweise gerechnet ist das eine weitere Fehlerquelle in einer Kette, die schon
   genug davon hat.

## 5. Warum die Signatur

`wasserGerechnetFuer` trägt eine Signatur der Eingaben: Modellversion, Saatpunkt auf sechs
Stellen, Basishöhe, Zuschlag, Stufe. Passt sie nicht zum aktuellen Stand des Elements, gilt
das Ergebnis als **veraltet** und wird in Marker-Popup, Panel, Legende und Liste als solches
gekennzeichnet.

Dasselbe Muster wie `routedFor` beim Straßen-Routing
([docs/strassen-routing.md](strassen-routing.md)), und aus demselben Grund: **kein stilles
Nachrechnen.** Ein Lauf lädt Kacheln — bis zu 40 MB in der Detailstufe. Das darf nicht die
unsichtbare Nebenwirkung davon sein, dass jemand einen Marker angesehen hat. Und **kein
stilles Zeichnen** einer Fläche, die zu anderen Eingaben gehört: Eine Wasserfläche, die
sichtbar zum falschen Zuschlag gehört, ist schlimmer als keine.

`WASSERSTAND_MODEL_VERSION` steckt in der Signatur. Sie wird erhöht, wenn sich die
Flutfüllung, die Tiefenstufen (`BAND_DEPTHS_M`), die Kodierung der Ringe oder die Bedeutung
eines gespeicherten Feldes ändert. Danach gilt jedes vorher gerechnete Ergebnis als veraltet
— was richtig ist: Es wurde mit einem anderen Modell gerechnet.

## 6. Warum 4er-Nachbarschaft

Wasser breitet sich in der Füllung nur über Kanten aus, nicht über Ecken.

Mit 8er-Nachbarschaft sickert Wasser **diagonal durch einen ein Meter breiten Damm**: Zwei
diagonal benachbarte Zellen beidseits einer ein Zelle breiten Sperre gelten als verbunden.
Straßendämme, Bahndämme, Ufermauern und Sandsackverbauten sind aber genau die Objekte, für
die überhaupt mit 1 m Raster gerechnet wird — mit 10 m wären sie ohnehin verschwunden. Eine
Nachbarschaft, die sie durchlässt, macht das feine Raster wertlos.

Der Preis ist, dass eine echte diagonale Verbindung von genau einer Zelle Breite nicht
gefunden wird. Das ist der bessere Tausch: Ein zu kleines Ergebnis fällt beim Ansehen auf,
ein durch einen Damm gelaufenes nicht.

Im Code steht die Entscheidung als benannte Konstante `NEIGHBOURS_4` mit einem `void`-Verweis
am Dateiende, damit eine Umstellung nicht als Einzeiler durchgeht.

## 7. Warum `nodata` sperrt und ein fehlender Block anders zählt

Drei Fälle, die auseinandergehalten werden:

| Fall | Verhalten | Zähler |
| --- | --- | --- |
| `nodata` in der Zelle | sperrt wie hohes Gelände | — |
| Kachel existiert laut Index **nicht** | Ausbreitung endet, Rand des Modells | `wasserRandModell` |
| Kachel existiert, lädt aber nicht | Ausbreitung endet, Störung | `wasserKachelnFehlend` |

`nodata` **darf nie als Höhe durchgehen.** Der kodierte Wert ist `0xFFFFFF`; als Zahl gelesen
wären das 1.677.721,5 m, aber als „0 m" gelesen — was bei einem `NaN`, das irgendwo zu 0
wird, passiert — stünde ein halbes Bundesland unter Wasser. Deshalb ist `nodata` im
Blockspeicher ein eigener Wert und keine Gleitkomma-Sonderform.

Warum die beiden anderen Fälle **getrennt** gezählt werden: Offline ist ein 404 nicht von
einem Deich zu unterscheiden. Ohne die Trennung sähe die Landesgrenze — jenseits der es
schlicht keine Daten gibt — dauerhaft wie ein Netzfehler aus, und ein echter Netzfehler wie
eine Landesgrenze. Die Meldungen unterscheiden entsprechend: „Die Fläche reicht an den Rand
des Höhenmodells" gegen „n Kacheln konnten nicht geladen werden. Die Fläche ist
möglicherweise größer."

## 8. Die Tiefenschwellen und woher sie kommen

`BAND_DEPTHS_M = [0, 0,1, 0,3, 0,7, 1,5]` in Metern.

| Schwelle | Bedeutung | Herkunft |
| --- | --- | --- |
| 0 m | benetzt — die Fläche selbst | Modellgrenze |
| 0,1 m | flach | Ablesbarkeit, keine Fachgrenze |
| 0,3 m | für PKW nicht mehr befahrbar | Erfahrungswert der Einsatzpraxis |
| 0,7 m | Grenzbereich der Arbeitshöhe des Sandsackverbaus | Bezug zu [docs/dammbau-sandsaecke.md](dammbau-sandsaecke.md) |
| 1,5 m | tief | über der sinnvollen Höhe eines Sandsackdamms |

**Das sind Vorbelegungen der Darstellung, keine Größen aus einer Lehrunterlage.** Anders als
die Reibungstabelle der Löschwasserförderung oder die Verlege- und Befüllleistungen der
LU TE3 hat keine dieser Schwellen eine amtliche Quelle. Sie sind so gewählt, dass die
Darstellung an den Stellen wechselt, an denen im Einsatz eine Entscheidung hängt:
Befahrbarkeit, Verbaubarkeit, Aufgeben der Fläche.

Wer sie ändert, ändert `BAND_DEPTHS_M`, `WASSERSTAND_BANDS` und die Übersetzungsschlüssel
`band*` **gemeinsam** — `wasserstandFarben.ts` prüft die Übereinstimmung zur Ladezeit und
wirft sonst. Eine Legende, die eine andere Fläche beschreibt als die gezeichnete, ist
schlimmer als eine unschöne Farbe.

## 9. Warum eine feste Farbrampe

Die Höhenlinien spannen ihre Farbrampe auf die **Spanne des Kartenausschnitts** — dort ist
das richtig, weil eine Höhenlinie relativ zum umgebenden Gelände gelesen wird.

Hier wäre es falsch. Die Farben stehen für **absolute** Schwellen: 0,3 m ist die Grenze der
Befahrbarkeit, ob die Fläche daneben 0,4 m oder 4 m tief ist. Eine Rampe, die mit dem
Ausschnitt wandert, hieße: Beim Hineinzoomen wechselt die Farbe derselben Zelle, und die
Entscheidung „hier komme ich mit dem Fahrzeug nicht durch" hängt am Zoomfaktor.

Gezeichnet wird halbdurchlässig (Vorbelegung 45 %), weil Straßen und Gebäude unter der Fläche
lesbar bleiben müssen — sie sind der Grund, die Fläche überhaupt anzusehen.

## 10. Warum die Ringe kodiert gespeichert werden, und `evenodd`

**Kodierung.** Die Ringe liegen als Google-kodierter Polylinienzug mit Genauigkeit 1e-6 Grad
(`src/common/polylineCodec.ts`), nicht als JSON-Koordinatenliste wie `positions` bei den
übrigen Elementen. Bei 8.000 Stützpunkten sind das rund **35 KB gegen rund 190 KB**. Das
Element hängt auf **jedem** Gerät an einem Firestore-Live-Listener und wird bei jeder
Änderung vollständig übertragen; der Faktor 5 ist der Unterschied zwischen brauchbar und
nicht, wenn zehn Geräte am Rand der Netzabdeckung hängen.

1e-6 und nicht die üblichen 1e-5: das sind 0,11 m und damit unter der feinsten Rasterweite.
Mit 1e-5 lägen die Stützpunkte um bis zu 1,1 m falsch — mehr als die Zelle, aus der sie
kommen.

**`fillRule: 'evenodd'`.** Je Tiefenstufe wird **ein** Polygon mit **allen** seinen Ringen
gezeichnet. Trockene Inseln — Gebäude, Anhöhen, Dämme — sind damit von selbst Löcher, ohne
die Ringe in Außen- und Innenringe zu sortieren.

Das ist keine Bequemlichkeit, sondern notwendig: `chainSegments` (`contour.ts`) verkettet die
Segmente von Marching Squares ab einem **beliebigen** Segment und in **beide** Richtungen.
Die Umlaufrichtung eines Rings ist damit nicht garantiert und als Kriterium für „innen" nicht
zu gebrauchen. Der Wert wird ausdrücklich gesetzt und nicht der Leaflet-Vorbelegung
überlassen.

Die Kopplung an den Sandsackrechner prüft „Punkt in Fläche" mit **derselben** Even-odd-Regel
(`pointInRings`). Eine andere Regel dort hieße: Die Zahl im Rechner gehört zu einer anderen
Fläche als die, die man auf der Karte sieht.

**Konturiert wird das Tiefenfeld, nicht die Höhe.** Trockene Zellen werden dabei auf
−0,01 m gedeckelt. Am **echten Ufer** ist `h − Gelände` von selbst negativ, und die
Interpolation legt die Grenze auf den Geländeschnitt — dorthin, wo das Wasser wirklich endet.
An einer **Sperre** — tiefes, aber unverbundenes Gelände hinter einem Damm — wäre der Wert
positiv, und die Grenze wanderte in die trockene Seite hinein; der Deckel legt sie
stattdessen auf die Zellkante.

Gerechnet wird **blockweise mit einem Pixel Überlappung** in globalen Zellkoordinaten. Ein
Mosaik über die ganze Fläche wären bei 120 km² und 1 m Raster rund 480 MB; so ist immer nur
ein Fenster von (blockPx+1)² im Speicher, und weil die Segmente in globalen Koordinaten
entstehen, verkettet `chainSegments` über Blockkanten hinweg.

## 11. Die Budgets und was am Budget passiert

| Stufe | Budget | Fläche | Datenmenge |
| --- | --- | --- | --- |
| `overview` (10 m) | 25 Blöcke | 2.500 km² | rund 10 MB |
| `detail` (1 m) | 120 Blöcke | 120 km² | rund 40 MB |

Gezählt werden **verschiedene** Blöcke, nicht Ladevorgänge: Ein Block, den das Wasser später
von einer anderen Seite erreicht, kommt ein zweites Mal dran, kostet aber keine Kachel mehr.

Gerechnet wird in zwei Läufen mit **einem** Algorithmus. Lauf 1 über die Übersichtsstufe
wächst frei und ist nach „Höhenmodell vorladen" offline verfügbar; er beantwortet die Frage
in Sekunden. Bleibt die Fläche unter `AUTO_DETAIL_MAX_M2` (15 km²), läuft Lauf 2 mit 1 m von
selbst hinterher. Darüber bleibt er ein Knopf, dessen Aufschrift die Kacheln und die
Datenmenge nennt — am Netzrand entscheidet das der Mensch, nicht das Programm.

Der Regler rechnet **nicht** live. Jeder Lauf lädt Kacheln, und ein Regler, der beim Ziehen
Megabyte zieht, ist im Hochwasserfall das Falsche. Gerechnet wird auf „Berechnen".

Wird das Budget erreicht, steht `wasserAbbruch: 'budget'` am Element, und Panel und Legende
sagen „Fläche am Rechenbudget abgeschnitten — sie ist möglicherweise größer." Eine
abgeschnittene Fläche, die wie eine vollständige aussieht, wäre eine falsche Aussage über das
Einsatzgebiet.

## 12. Die Grenze des konstanten Wasserspiegels

Das Modell nimmt **einen** Wasserstand über die ganze Fläche an. Ein Fluss hat ein Gefälle:
Die Wulka fällt über ihren Unterlauf um mehrere Dezimeter je Kilometer.

Über etwa 5 km Ausdehnung (`GRADIENT_WARN_AXIS_M`) wird das zu einer grob falschen Annahme —
flussaufwärts läge der Spiegel höher, flussabwärts tiefer als angenommen. Ab dieser
Ausdehnung steht die Warnung in Panel und Legende: „Ausdehnung über n km: ein konstanter
Wasserspiegel ist hier eine grobe Annahme, das Flussgefälle ist nicht berücksichtigt."

Gemessen wird an der längsten Achse der Hülle, nicht an der Fläche: Eine lange schmale
Talfüllung entlang eines Flusses ist genau der Fall, in dem das Gefälle zählt, und die hat
wenig Fläche.

Ein Wasserspiegelgefälle einzubauen hieße, eine Fließrichtung und ein Gefälle je Gewässer zu
kennen. Das ist ein anderes Modell, keine Erweiterung dieses (Abschnitt 14).

## 13. Kopplung an den Sandsackrechner

An der Dammlinie steht „Wasserstand aus dem Modell". Der Knopf tastet die Trasse alle 10 m ab
— mit aktivem Straßen-Routing den tatsächlichen Verlauf, dieselbe Weite wie das Höhenprofil
der Löschwasserförderung — und setzt

```
Dammhöhe = größte Wassertiefe entlang der Linie + Freibord
```

**Größte Tiefe, nicht Mittelwert.** Der tiefste Punkt der Trasse entscheidet, wie hoch der
Damm werden muss. Ein Mittelwert wäre an genau der Stelle zu niedrig, an der der Damm
überströmt — und ein Damm, der an einer Stelle überströmt, ist kein Damm.

**Nass ist, was in der gespeicherten Fläche liegt**, nicht was tiefer als `h` liegt. Die
hydraulische Verbindung steckt schon im Ergebnis: Ein Punkt hinter einer Anhöhe zählt
trocken, auch wenn er unter dem Wasserstand liegt. Geprüft wird mit derselben
Even-odd-Regel wie in der Darstellung (Abschnitt 10). Liegt die Linie ganz außerhalb, sagt
der Rechner das und ändert nichts.

Das Ergebnis wird auf 0,1 m gerundet — die Schrittweite des Höhenreglers. Ein Vorschlag von
1,37 m an einem Regler mit 0,1er-Raster wäre eine Genauigkeit, die es nicht gibt.

Über der Reichweite des Reglers (2 m) wird **gewarnt, nicht gekappt**: „Wassertiefe plus
Freibord übersteigt 2 m — ein Sandsackverbau ist hier das falsche Mittel." Auf 2 m zu kappen
hieße, eine unhaltbare Zahl als haltbar auszugeben.

**Herkunft.** `dammHoeheQuelle: 'wasserstand'` und `dammWasserstandId` stehen am Element und
überleben einen Neustart; die Materialanforderung im Einsatztagebuch trägt „(aus
Wasserstandsmodell)". Eine Zahl aus dem Modell ist im Führungsvorgang etwas anderes als eine
geschätzte, und wer die Anforderung später liest, soll den Unterschied sehen. Wird die Höhe
von Hand geändert, fällt die Herkunft weg — sie kommt dann nicht mehr aus dem Modell.

## 14. Was hier nicht drin ist

- **2D-Hydrodynamik.** Von #727 ausdrücklich ausgenommen. Sie bräuchte Rauheiten, Randwerte
  und Rechenzeit in einer anderen Größenordnung — und eine Eingangsgröße, die besser ist als
  ein geschätzter Pegelzuschlag.
- **Dammbruch-Zeitverlauf.** Ebenfalls ausgenommen. „Wie lange dauert es, bis das Wasser
  hier ist?" ist eine andere Frage als „wie weit kommt es?", und nur die zweite beantwortet
  eine statische Füllung.
- **Ein Eintrag in der Interpolations-Registry.** #727 nimmt das aus; das Höhenmodell ist
  eine Rasterquelle, kein interpolierter Messwert.
- **Automatische Pegelkopplung.** Untersucht und verworfen: Die Seepegel in
  `PegelstandAction` liefern müA, die Flusspegel cm über **Pegelnullpunkt** — und der PNP
  steht in `pegelstand_stations` nicht drin. Ohne ihn ist ein Flusspegelwert in keine Höhe
  umzurechnen. Käme er dazu, wäre die Kopplung eine Vorbelegung des Zuschlags, nicht ein
  Ersatz für den Saatpunkt (Abschnitt 2).
- **Durchlässe, Verrohrungen, Kanalnetz.** Nicht in den Daten, und ohne Daten nicht zu
  modellieren. Sie sind der häufigste Grund, aus dem das Modell zu klein liegt.
- **Wasserspiegelgefälle** (Abschnitt 12).
- **Hillshade.** Wäre aus denselben Blöcken möglich, ist aber keine Anforderung.
