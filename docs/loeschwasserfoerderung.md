# Löschwasserförderung über lange Wegstrecke

Der Rechner hängt an der gezeichneten Leitung (`connection`): Länge und Verlauf
liegen dort schon, mit aktivem Straßen-Routing als tatsächlicher Straßenverlauf.
Eingestiegen wird über den Wassertropfen im Popup der Leitung.

Dieses Dokument hält fest, **woher jede Zahl kommt** und warum sie so gerechnet
wird. Das ist keine Formsache: Die Pumpenzahl entscheidet im Einsatz über
Nachalarmierung, und eine Zahl, die niemand nachprüfen kann, ist im
Führungsvorgang wertlos.

## Quellen

- **Primärquelle:** „Tabellen für Löschwasserförderung", Ausbildungsunterlage der
  Freiwilligen Feuerwehr Ebersdorf, HBI Jürgen Stark, Stand 07/2020.
- **Gegenprüfung:** Wikipedia, „Löschwasserförderung über lange Wegstrecken"
  (deutsche Werte).
- **Höhendaten:** EU-DEM 25 m (Copernicus) über
  [OpenTopoData](https://www.opentopodata.org/). Namensnennung im Panel, an der
  Zeile zur Höhenquelle.

Die Reibungsquelle steht **hier** und nicht mehr im Panel: Sie gehört zur
Nachprüfbarkeit der Zahlen, nicht in die Bedienung. Im Panel war sie eine Zeile,
die bei jedem Blick mitgelesen werden musste, ohne je gebraucht zu werden.

## Reibungsverlust B 75, bar je 100 m

| l/min | 200 | 400 | 600 | 800 | 1000 | 1200 | 1600 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **AT (maßgeblich)** | 0,10 | 0,25 | 0,50 | **1,00** | 1,50 | 2,50 | 5,00 |
| DE (Gegenprüfung) | 0,10 | 0,30 | 0,60 | **1,00** | 1,40 | 2,00 | 4,00 |

Bis 1000 l/min stimmen die Reihen praktisch überein. Darüber ist die
österreichische konservativer (1200: 2,50 gegen 2,00; 1600: 5,00 gegen 4,00).
**Maßgeblich ist die österreichische Reihe** — es ist die Unterlage, mit der hier
ausgebildet wird, und sie liegt auf der sicheren Seite: Über 600 m Leitung sind
das bei 1600 l/min 6 gegen 4,8 bar, unter Umständen eine ganze Pumpe
Unterschied.

### Warum die Tabelle und kein Rechenmodell

Naheliegend wäre, λ aus der Tabelle zurückzurechnen und dann durchgängig mit
Darcy-Weisbach zu arbeiten. Das geht nicht auf:

| l/min | 200 | 400 | 600 | 800 | 1000 | 1200 | 1600 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Re (·10³) | 43 | 86 | 130 | 173 | 216 | 259 | 346 |
| λ aus der Tabelle | 0,0264 | 0,0165 | 0,0146 | 0,0165 | 0,0158 | 0,0183 | 0,0206 |

λ müsste mit steigender Reynoldszahl **monoton fallen** oder auf einen
Rauheitswert einlaufen. Es fällt, steigt, fällt, steigt — die Tabelle ist
gerundete Praktikerdaten, keine konsistente Hydraulikkurve. Ein daraus
„eruiertes" λ(Q) trägt genau die Tabelleninformation; damit zu rechnen ist
rechnerisch identisch zum Interpolieren, nur schwerer nachprüfbar.

Umgekehrt reproduziert ein konsistentes Modell die Tabelle nicht. Mit bei
800 l/min kalibriertem λ = 0,0165:

| l/min | 200 | 400 | 600 | 800 | 1000 | 1200 | 1600 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tabelle | 0,10 | 0,25 | 0,50 | **1,00** | 1,50 | 2,50 | 5,00 |
| Modell, λ konstant | 0,06 | 0,25 | 0,56 | **1,00** | 1,56 | 2,25 | 4,00 |
| Modell mit λ(Re) | 0,08 | 0,28 | 0,57 | **1,00** | 1,39 | 1,91 | 3,16 |

Im Arbeitsbereich 400–1200 l/min liegen alle drei innerhalb ~10 %. Bei
1600 l/min trennt es sich: Die Tabelle verläuft dort **überquadratisch**, und
kein Rohrhydraulik-Modell kann überquadratisch werden — λ fällt mit Re, es steigt
nie.

**Interpoliert wird in Q², nicht in Q**: Der Verlust wächst quadratisch mit der
Menge, eine lineare Interpolation läge in der Mitte jedes Intervalls zu hoch. An
den Stützstellen ist das Ergebnis exakt der Tabellenwert. Außerhalb (unter 200,
über 1600 l/min) wird mit Q² extrapoliert.

### Andere Dimensionen

Für A, C, D und F gibt es keine österreichische Tabelle. Aus Darcy-Weisbach folgt
mit v = Q/A und A ∝ d²:

> Δp ∝ λ · Q² / d⁵

Bei gleicher Fördermenge und gleichem λ ist der Verlust einer Dimension d damit
das (75/d)⁵-fache des B-75-Werts:

| Dimension | d | Faktor gegen B 75 |
| --- | --- | --- |
| A 110 | 110 mm | 0,147 |
| B 75 | 75 mm | 1 |
| C 52 | 52 mm | 6,24 |
| C 42 | 42 mm | 18,15 |
| D 25 | 25 mm | 243 |
| F 152 | 152 mm | 0,0273 |

Gegenprüfung an den deutschen C-Tabellen: C 52 bei 800 l/min 6,5 bar gegen B 75
mit 1,0 → gemessener Faktor 6,5 bei berechneten 6,24, also 4 % ab. Über die
C-52-Reihe (200/400/600/800 l/min) liegt die Abweichung bei **7–11 %**.

Bei **C 42** wird sie größer: bei 400 l/min 5,45 berechnet gegen 8,8
veröffentlicht, **38 % ab**. Kleine Durchmesser sind relativ rauer, als das
konstante λ annimmt. Praktisch belanglos — eine Zubringleitung ist nie C 42, und
die Werte liegen dort ohnehin jenseits jeder Darstellbarkeit.

**Abgeleitete Werte sind im Dialog als abgeleitet gekennzeichnet**, damit eine
Zahl aus der Formel nicht für einen Tabellenwert genommen wird.

Das Feld `dimension` der Leitung ist Freitext. Es wird gelesen, nicht
nachgeschlagen: Eine ausgeschriebene Zahl gewinnt gegen den Standardwert des
Buchstabens, „C 42" ist ein anderer Schlauch als „C". Ein unbekannter Wert führt
**nicht** zu einer geratenen Zahl, sondern zum Hinweis, dass nicht gerechnet
wird.

## Übrige Werte

| Größe | Wert | Quelle |
| --- | --- | --- |
| Steigungsverlust | −0,1 bar je m | AT-Unterlage; DE nennt „1 bar je 10 m", identisch |
| Druckgewinn | +0,1 bar je m Gefälle | AT-Unterlage |
| Mindest-Eingangsdruck | 1,5 bar | AT-Unterlage; DE nennt 1,5–2,0 bar |
| Verlust Verteiler + Löschleitung | 1,00 bar | AT-Unterlage |
| Ausgangsdruck B-/C-Strahlrohr | ca. 5 bar | AT-Unterlage (Faustregel) |
| **Zieldruck am Leitungsende** | **6,0 bar** (5 + 1) | abgeleitet aus den beiden Zeilen darüber |
| **Pumpen-Ausgangsdruck** | **8 bar**, wählbar 6/8/10 | DE: PFPN 10-1000 liefert 1000 l/min bei ca. 8 bar im **Dauerbetrieb**. Die 10 bar der AT-Unterlage sind der Nennwert ohne Reserve. |
| Nennförderstrom | 1000 l/min | FPN 10-1000 |
| Fördermenge | 1000 l/min | normale Fördermenge einer Zubringleitung |

## Rechenweg

1. `rv = frictionLossPer100m(foerderMenge / paralleleLeitungen, dimension) / 100`
2. **Rückwärtslauf** ab dem Ende: `need[i]` ist der Druck, der an Abtastpunkt i
   nötig wäre, um das Ende mit dem Zieldruck zu erreichen, ohne weitere Pumpe.
3. **Vorwärtslauf** ab der Entnahmestelle mit dem Ausgangsdruck. Ist `need` am
   Standort der aktuellen Pumpe ≤ Ausgangsdruck, ist die Leitung fertig. Sonst
   steht die nächste Pumpe am **ersten** Punkt, von dem aus das Ende noch
   erreichbar ist, sonst am **weitesten** mit Eingangsdruck ≥ 1,5 bar.

Der Rückwärtslauf ist der Grund, dass die letzte Pumpe nicht auf Maximalabstand
steht: Ein reines Vorwärts-Greedy schöpft den Eingangsdruck aus und erreicht das
Ende unter dem Zieldruck — es würde **eine Pumpe zu wenig** ausweisen.

Der erste Treffer statt des weitesten für die letzte Pumpe: Auf 2000 m flach wäre
der weiteste Punkt 1950 m — 50 m vor dem Verteiler, ein unsinniger Standort. Die
Pumpenzahl ist dieselbe, die Reserve am Ende größer.

### Die Standorte werden auf der Strecke gelöst, nicht aufs Raster gerundet

Gerechnet wird über die kumulierte Druckabnahme, und der Standort einer Pumpe ist
der Streckenmeter, an dem sie einen Zielwert erreicht — **nicht** der nächste
Abtastpunkt. Zwischen zwei Punkten verläuft die Abnahme linear, weil das Modell
dort nichts anderes kennt; ein Standort dazwischen ist damit genauso begründet wie
einer darauf.

Das ist kein Feinschliff. Bei 1600 l/min sind die Pumpenabstände 130 m, das Profil
ist aber nur alle 50 m abgetastet. Auf das Raster gerundet:

- Aus 130 m Abstand werden 100 m — **20 Pumpen statt 16**.
- Der letzte Abschnitt darf nur 40 m lang sein. Auf dem 50-m-Raster gibt es
  keinen solchen Standort, und der Rechner meldete **„nicht darstellbar"**,
  obwohl eine Pumpe 40 m vor dem Verteiler die Förderung trägt. Eine falsche
  Aussage, nicht bloß eine ungenaue.

Dasselbe gilt für die Koordinate des Pumpenpunkts auf der Karte: Sie wird zwischen
den Abtastpunkten interpoliert, sonst verschöbe sie sich um bis zu 25 m.

### `darstellbar` heißt „nicht mit diesen Mitteln", nicht „geometrisch unmöglich"

Seit die Standorte stetig gelöst werden, ist geometrisch fast jede Lage
darstellbar — eine Pumpe lässt sich überall setzen, also ist jede Steigung mit
genügend Pumpen zu überwinden. Die echte Grenze ist deshalb nicht die Geometrie,
sondern was ein Bezirk aufstellen kann: `MAX_PUMPS = 30`. Darüber lautet die
Antwort „nicht mit diesen Mitteln", und dieselbe Schranke schützt die Schleife
gegen eine Lage ohne Fortschritt.

**Prüfstein:** 800 l/min flach in B 75 mit 8 bar Ausgangs- und 1,5 bar
Eingangsdruck ergibt (8 − 1,5) / 0,01 = **650 m** Pumpenabstand. Veröffentlicht
ist „etwa alle 600 m eine Verstärkerpumpe". Das steht als Testzusicherung in
`hydraulics.test.ts`.

**Die Pumpe an der Entnahmestelle zählt nicht als Verstärkerpumpe.** Sie steht
dort ohnehin, um aus Hydrant, Saugstelle oder Behälter zu fördern; sie ist Pumpe 0
und die ausgewiesene Zahl ist `pumps.length − 1`. Sonst würde eine Leitung, die
mit einer einzigen Pumpe auskommt, „1 Verstärkerpumpe" melden.

**`paralleleLeitungen` wirkt zweifach in Gegenrichtung**: bei der Fördermenge als
**Teiler** (jede Leitung trägt Q/n), beim Schlauchbedarf als **Faktor**. Zwei
B-Leitungen bei 800 l/min ergeben so 0,25 bar/100 m — veröffentlicht sind „etwa
0,3 bar" gegen 1,0 bar bei einer Leitung.

## Förderrichtung

Eine Leitung wird gezeichnet, wie es gerade passt — ob das Wasser am ersten oder
am letzten Punkt entnommen wird, steht damit **nicht** fest. Für die Rechnung ist
das keine Nebensache: Das Vorzeichen jeder Steigung hängt daran, und damit die
Pumpenzahl.

Vorbelegt ist die Zeichenrichtung, erster Punkt ⇒ Entnahmestelle. Umgekehrt wird
über `foerderungUmgekehrt` am Element, im Panel sichtbar als „Punkt n → Punkt 1"
samt beiden Höhen und einem Knopf zum Umkehren. Auch die Achse des Höhenprofils
läuft immer in Förderrichtung und trägt „Entnahme" und „Ziel" an ihren Enden.

**Gedreht wird nur die Rechnung, nicht die Geometrie.** Die Abtastung bleibt in
Zeichenrichtung, und damit bleibt die Signatur `elevationFor` gültig: Ein
Umkehren kostet keine neue Höhenabfrage. `foerderungView` rechnet dazu die
Abtastpunkte auf `Länge − Streckenmeter` um und dreht sie mit den Höhen zusammen
herum; alles danach — Hydraulik, Diagramm, Kartenpositionen — arbeitet
unverändert in Förderrichtung.

Die Punkte des Elements zu drehen wäre teurer und unschärfer: Es würde
`positions` **und** `routedPositions` ändern, die Punktnummern in den Popups
vertauschen und jedes Umkehren mit einer neuen Höhenabfrage bezahlen.

## Höhendaten

### Warum nicht Burgenland GIS

Naheliegend wäre das Land Burgenland als Quelle. Es geht nicht:

- Der öffentliche ArcGIS-Ordner
  (`gisenterprise.bgld.gv.at/arcgis/rest/services/public`) enthält
  `CentropeMap`, `ESRI_Webmap`, `Geoland`, zwei Flächenwidmungs-Dienste und
  `Orthofoto` — **keinen Höhen-ImageServer**.
- Alle übrigen Ordner (`GeoDatenKooperation`, `SAT`, `BD_WASSERVERSORGUNG`, …)
  antworten mit `{"error":{"code":499,"message":"Token Required"}}`.
- Das DGM aus der ALS-Befliegung 2019 (50 cm Raster, ±15 cm, CC BY 4.0) gibt es
  nur als **Download** über das Downloadportal, nicht als Dienst.

Ein Import des DGM bliebe der Weg zu höherer Genauigkeit und Unabhängigkeit von
fremden Diensten (Bezirksgebiet auf 5 m resampelt wären ~30 MB). Er ist bewusst
nicht umgesetzt: Bei 0,1 bar je Meter ist der Unterschied zwischen 25-m- und
0,5-m-Raster für die Pumpenzahl belanglos, der Bauaufwand erheblich, und
außerhalb des importierten Gebiets bräuchte es trotzdem einen Fallback.

Die Google Elevation API wäre die zuverlässige Alternative, verlangt aber einen
**API-Key** — OAuth über den Service Account lehnt sie ab
(`REQUEST_DENIED — You must use an API key`), anders als die Routes API. Das wäre
das erste Secret dieser Art im Deployment.

### Abtastung und Cache

- Abgetastet wird `displayPositions()` — also der geroutete Verlauf, wenn es
  einen gibt. Alle ~50 m, höchstens **100** Punkte: die Grenze, die OpenTopoData
  je Anfrage annimmt. Damit kostet eine Änderung an der Leitung genau **eine**
  Anfrage, ohne Stückelung und ohne Wartezeit zwischen Teilanfragen.
- Über 5 km wächst der Abstand über 50 m (10 km ⇒ 100 m). Die richtige Seite des
  Kompromisses: Eine Kuppe, die auf 100 m nicht auffällt, verschiebt einen
  Standort um weniger als eine B-Länge.
- **Nur das Höhenprofil wird gecacht** (`elevationProfile` mit der Signatur
  `elevationFor`, Muster wie `routedPositions`/`routedFor`). Die Pumpenrechnung
  selbst ist reine Mathematik und läuft bei jedem Render neu — es gibt nichts zu
  invalidieren. Ein Punkt wird verschoben, das Profil wird nachgezogen, die
  Pumpen wandern mit.
- **Abgefragt wird nur bei `foerderung === 'true'`.** Eine gewöhnliche Leitung
  kostet keine Anfrage.
- Ein einzelner Punkt ohne Höhe verwirft die ganze Anfrage: Ein Profil mit
  Löchern ergibt Druckwerte, die im Einsatz niemand nachprüfen kann.

### Eingeschaltet mit dem Öffnen, Höhen sofort

Die Höhenabfrage hängt an `foerderung === 'true'` — sonst kostete jede
gewöhnliche Leitung eine Anfrage. Solange dieses Feld erst durch „Übernehmen"
gesetzt wurde, stand beim Öffnen des Rechners „keine Höhendaten verfügbar", und
zwar auch dort, wo es welche gibt. Das war die falsche Antwort auf die erste
Frage, die der Rechner beantworten soll.

Deshalb schaltet das **Öffnen** den Rechner ein und speichert das. Zwei Wege, je
nachdem, was am Element steht:

- Noch nicht eingeschaltet ⇒ das Panel speichert, und `ensureConnectionDerived`
  zieht dabei Straßenverlauf und Höhenprofil nach.
- Eingeschaltet, aber ohne Profil ⇒ das Panel ruft `ensureConnectionElevation`
  direkt; gespeichert wird nichts.

Solange die Abfrage läuft, steht ein Ladehinweis, und die Warnung „keine
Höhendaten" wird zurückgehalten — sie wäre zu diesem Zeitpunkt bloß voreilig.

Der Schalter in der Kopfzeile bleibt für den umgekehrten Weg: den Rechner an
dieser Leitung wieder abzuschalten. Dass das Speichern die Pumpen auch auf der
Karte und die Zusammenfassung am Element sichtbar macht, ist der Zweck und kein
Nebeneffekt — so war die Entscheidung „Ergebnis an der Leitung mitführen".

### Reihenfolge: erst Routing, dann Höhen

Das Profil hängt am gerouteten Verlauf. Liefe es auf der unveränderten Kopie im
Speicher, tastete es die Geometrie von **vor** dem Routing ab, und das Profil
gehörte zu einer Linie, die die Karte nicht zeichnet. Dafür gibt es
`ensureConnectionDerived`: Es ruft `ensureConnectionRouting`, führt dessen
Änderungen ins Element zusammen und ruft dann `ensureConnectionElevation`.
`ensureConnectionRouting` gibt seine Änderungen deshalb zurück, statt sie nur zu
schreiben. Die drei Mutationsstellen rufen den Orchestrator, nicht mehr das
Routing allein.

### Ausfall

Die öffentliche OpenTopoData-Instanz gibt **keine Verfügbarkeitszusage**
(Richtwert 1000 Anfragen/Tag, 1 Anfrage/s). Fällt sie aus, steht
`elevationFailed`, der Dialog sagt „Höhendaten nicht verfügbar" und rechnet mit
dem eingegebenen Höhenunterschied. Der Rechner bleibt benutzbar.

### Profil oder Handeingabe, nie beides

Liegt ein Profil vor, rechnet die Hydraulik mit den Höhen **je Abschnitt** — eine
Kuppe in der Mitte erzwingt eine Pumpe, auch wenn Anfang und Ende gleich hoch
liegen. Das Feld `hoehenunterschied` ist dann wirkungslos und im Dialog gesperrt.

Fehlt das Profil, gilt `hoehenunterschied` als Gesamtdifferenz Anfang → Ende und
wird linear über die Länge verteilt; Zwischenkuppen sind unbekannt, und der
Dialog sagt das.

Eine Übersteuerung *bei vorhandenem Profil* gibt es bewusst nicht: Eine geänderte
Gesamtdifferenz bei beibehaltener Profilform wäre ein Mischwert, dessen
Abschnittshöhen zu keiner der beiden Quellen passen.

## Pumpenstandorte auf der Karte

Berechnet und **gezeichnet, nicht gespeichert**: Sie wandern damit bei jeder
Änderung mit, ohne dass ungefragt Elemente entstehen, die vielleicht schon
besetzte Standorte behaupten. Ein Marker, den die Karte selbst versetzt, obwohl
dort schon eine TS steht, ist im Einsatz irreführend.

„Pumpen als Marker ablegen" friert den Vorschlag als `marker`-Elemente ein — kein
neuer Item-Typ — und schreibt **einen** Tagebucheintrag (`type: 'diary'`). Nur
beim Ablegen, nicht beim Rechnen: Am Regler wird probiert, nur die getroffene
Entscheidung gehört in den Verlauf. Die Pumpe an der Entnahmestelle wird
mitabgelegt, aber als solche benannt.

## Ein Panel über der Karte, kein Dialog

Der Rechner ist ein **nicht modales** Panel, das über der Karte schwebt und über
einen Portal an `document.body` hängt. Grund: Beim Schieben des Reglers wandern
die Pumpen auf der Leitung mit, und genau das will man dabei sehen. Ein
bildschirmfüllender Dialog verdeckte die Karte — am Handy war er von einer eigenen
Seite nicht zu unterscheiden.

Aus demselben Grund steht die **Antwort oben**: Regler und Pumpenzahl direkt
untereinander, alles Sekundäre darunter oder in Aufklappern. Ein Panel, in dem man
zur Antwort scrollen muss, verfehlt seinen Zweck.

### Kein lazy geladenes Modul im Kartenbaum

Das Panel wird **statisch** importiert, nicht über `next/dynamic`. Ein lazy
geladenes Modul suspendiert beim ersten Rendern; ohne eigene Suspense-Grenze
steigt die Suspension bis zur Route, React verwirft den Teilbaum samt
`MapContainer`, und der trifft beim Wiederaufbau auf seinen DOM-Container mit der
alten Leaflet-Instanz. Das Ergebnis war
`Error: Map container is being reused by another instance`, gefolgt von einem
`TileLayer`, dessen `getPane()` `undefined` liefert — die ganze Kartenseite lief
in die Fehlergrenze, sobald man den Rechner öffnete.

Der Importzyklus, für den der dynamische Import gedacht war
(`FirecallMultiPoint` → `ConnectionComponent` → Panel → `useFirecallItemUpdate` →
`elements/index.tsx` → `FirecallConnection` → `FirecallMultiPoint`), ist
stattdessen dort aufgelöst, wo `useFirecallItemAdd` es schon vorgemacht hat:
`useFirecallItemUpdate` lädt die Item-Klassen-Registry erst im Callback.

**Wer im Kartenbaum etwas lazy laden will, braucht eine eigene
`<Suspense>`-Grenze** — sonst stirbt die Karte.

## Felder

Alle an `Connection`, **nicht** an `MultiPointItem` — eine Linie fördert kein
Wasser. Alle in `data()`: Das ist die Grundlage jedes Schreibvorgangs, und was
dort fehlt, löscht ein Speichern aus dem Dialog (`setDoc` ohne `merge`). In
`fields()` erscheinen sie **nicht** — sie gehören in den eigenen Dialog, nicht in
die generische Feldliste.

`foerderung`, `foerderungUmgekehrt`, `foerderMenge`, `zielDruck`,
`pumpenAusgangsdruck`, `pumpenEingangsdruck`, `pumpenNennstrom`,
`paralleleLeitungen`, `hoehenunterschied`, `elevationProfile`, `elevationFor`,
`elevationFailed`.

## Was hier nicht ist

- Pumpendaten an den Fahrzeugstammdaten. Der Rechner arbeitet mit belegten
  Normwerten, die im Dialog überschreibbar sind. Nenndruck und Nennförderstrom an
  den Fahrzeugen zu pflegen gehört zu #693, das Tankinhalte ohnehin braucht.
- Ableitung der Fördermenge aus den `rohr`-Items. 1000 l/min ist die normale
  Fördermenge; eine Ableitung bräuchte außerdem eine Regel, welches Rohr an
  welcher Leitung hängt.
- Der Vergleich mit dem Pendelverkehr steht in
  [docs/pendelverkehr.md](pendelverkehr.md) — er hängt an derselben Leitung und
  wird im selben Panel gerechnet.
