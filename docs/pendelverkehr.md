# Pendelverkehr und der Vergleich mit der Förderung

Der Pendelverkehr hängt an derselben Leitung wie die Förderung über lange
Wegstrecke ([docs/loeschwasserfoerderung.md](loeschwasserfoerderung.md)) und
wird im selben Panel gerechnet — umgeschaltet über
`Förderung | Pendelverkehr | Vergleich`.

Dieses Dokument hält fest, **woher jede Zahl kommt** und was Planungswert und
was gerechnet ist. Anders als bei der Förderung gibt es hier **keine
Papiertabelle**: Die Umlaufformel ist Arithmetik, die Vorgabewerte sind
Planungswerte. Das ist keine Formsache — die Entscheidung „Leitung legen oder
pendeln?" ist eine der ersten taktischen im Einsatz, und eine Empfehlung, deren
Annahmen niemand nachprüfen kann, ist im Führungsvorgang wertlos.

## Die Formel

```
t_umlauf = 2·s/v + t_füll + t_entleer
Q        = min( n·V / t_umlauf ,  V / t_füll )
```

`s` einfache Fahrstrecke in m, `v` Geschwindigkeit, `V` Tankinhalt, `n`
Fahrzeuge, Zeiten in Minuten, `Q` in l/min.

### Die Füllstelle ist eine Schranke, nicht ein Summand

Der zweite Term ist der Punkt, an dem ein naives `n·V/t_umlauf` falsch wird: An
einer Entnahmestelle füllt immer nur **ein** Fahrzeug. Die Entnahmestelle gibt
damit höchstens einen Tankinhalt je Füllzeit her, ganz unabhängig davon, wie
viele Fahrzeuge im Umlauf sind. Ab `n > t_umlauf/t_füll` stehen die weiteren in
der Schlange.

**Prüfstein:** 2000 m, 40 km/h, 2000 l, 4 + 3 min ⇒ Umlaufzeit 13 min. Die
Schranke ist 2000/4 = 500 l/min und greift ab 3,25 Fahrzeugen. Drei Fahrzeuge
liefern 461,5 l/min, vier liefern nicht 615,4 sondern **500**, und zehn liefern
auch nicht mehr. Das steht als Testzusicherung in `shuttle.test.ts`.

Ohne die Schranke wies der Regler eine Leistung aus, die keine Entnahmestelle
hergibt — und genau der Regler ist der Zweck des Panels.

### Abgeleitet, ohne weitere Annahme

- **Benötigte Fahrzeuge** für die geforderte Menge: `⌈Q_soll · t_umlauf / V⌉`
- **Kipppunkt** — die einfache Fahrstrecke, ab der die Menge nicht mehr getragen
  wird. Geschlossen gelöst, nicht gesucht: Aus `n·V / t_umlauf = Q_soll` folgt
  die zulässige Umlaufzeit `n·V/Q_soll`; was davon nach Füllen und Entleeren
  übrig bleibt, ist die Fahrzeit, und deren halbe Strecke die Entfernung.

  `s_kipp = v/2 · (n·V/Q_soll − t_füll − t_entleer)`

  **Kein Wert** in zwei Fällen, und in beiden wäre eine Zahl irreführend: Wenn
  die Füllstelle unter der Sollmenge deckelt, trägt *keine* Entfernung sie, auch
  0 m nicht — das ist kein Kippen, sondern eine harte Grenze. Und wenn die
  zulässige Umlaufzeit schon ohne Fahrzeit aufgebraucht ist, fehlt es nicht an
  Weg, sondern an Fahrzeugen.
- **Faltbehälter nötig**, wenn `n < ⌈t_umlauf / t_entleer⌉`: Dann ist nie
  durchgehend ein Fahrzeug am Entleeren, und die Abgabe hat Lücken. Das Panel
  nennt daneben die Zahl, die es ohne Puffer bräuchte.
- **Erste Wasserabgabe sofort** — das erste TLF steht voll an der Einsatzstelle.
  **Eingeschwungen** ist der Umlauf nach einer Umlaufzeit; das ist auch die
  Aufbauzeit im Vergleich.

## Vorgabewerte

Alle im Aufklapper überschreibbar. Es sind **Planungswerte**, keine
Tabellenwerte.

| Größe | Wert | Begründung |
| --- | --- | --- |
| Geschwindigkeit | 40 km/h | Einsatzfahrt mit vollem Tank, Ortsgebiet und Freiland gemischt. Die Literatur rechnet Pendelverkehr mit 30 km/h im Ort bis 50 km/h im Freiland; 40 liegt dazwischen. |
| Tankinhalt | 2000 l | untere Klasse der Tarifordnung („Tanklöschfahrzeug bis 2.000 l", s. `defaultKostenersatzRates.ts`) |
| Füllzeit | 4 min | 2000 l bei ~600 l/min plus Anfahren und Ankuppeln an der Füllstelle |
| Entleerzeit | 3 min | 2000 l über die eigene Pumpe plus Anfahren |
| Fahrzeuge | 2 | Der kleinste Pendelverkehr, der einer ist. |

**Neben den Zeitfeldern steht die Leistung, die sie bedeuten** („entspricht
500 l/min"). Das ist kein Beiwerk: Wer den Tankinhalt auf 4000 l ändert und die
Füllzeit bei 4 min stehen lässt, behauptet damit 1000 l/min an der
Entnahmestelle. Ohne die Zeile bliebe das unsichtbar.

Eine **Ableitung** der Zeiten aus Tankinhalt und Ergiebigkeit wäre möglich, ist
aber nicht umgesetzt: Ein Einsatzleiter schätzt die Füllzeit, er rechnet sie
nicht — und die Ergiebigkeit des Hydranten am Leitungsanfang kennt die App nicht
verlässlich. Die Hinweiszeile leistet dasselbe, ohne eine Genauigkeit zu
behaupten, die nicht da ist.

## Fahrstrecke

**Die Fahrstrecke ist nicht die Schlauchlänge.** Der Schlauch zickzackt über die
gesetzten Punkte und folgt der Straße, ohne sich an Einbahnen zu halten; das
Fahrzeug fährt die Straße, und zwar nur von einem Ende zum anderen.

Deshalb ein eigenes Routing mit dem Profil `drive` und ein eigener Satz Felder
(`pendelRoutedPositions`, `pendelRoutedFor`, `pendelRoutingFailed`). Eine neue
Server-Action braucht es nicht: `computeStreetRoutedPositions` nimmt das Profil
schon als Parameter, und `routedPath.ts` kennt `'drive'`.

- **Nur die beiden Enden** gehen ins Routing, in Förderrichtung. Ein
  Zwischenpunkt der Schlauchleitung ist kein Wegpunkt der Fahrt — und damit
  ändert ein verschobener Zwischenpunkt die Signatur nicht und kostet keinen
  Routing-Aufruf.
- **Gemessen wird die Geometrie** clientseitig mit demselben `calculateDistance`,
  das auch die Luftlinie misst. Die angezeigte Zahl ist damit immer die der
  gezeichneten Linie, und es braucht kein eigenes Meter-Feld.
- **Gezeichnet**, gestrichelt und in anderer Farbe als der Schlauchweg. Eine
  Strecke, die niemand sehen kann, ist im Einsatz eine Behauptung; gezeichnet
  ist sie nachprüfbar.
- **Abgefragt nur, wenn `versorgungsart !== 'foerderung'`.** Eine gewöhnliche
  Förderungsrechnung kostet keinen zusätzlichen Aufruf.
- **Ausfall:** Luftlinie × **1,3**, im Panel als „geschätzt" gekennzeichnet. #693
  nennt den Umwegfaktor als Ersatzweg; 1,3 ist der geläufige Planungswert Straße
  gegen Luftlinie im verbauten Gebiet. Die Signatur wird auch beim Fehlschlag
  gesetzt — sonst liefe bei jeder weiteren Änderung ein Aufruf, der schon
  gescheitert ist.

Der Schritt reiht sich in `ensureConnectionDerived` **hinter** Routing und
Höhenprofil ein. Anders als beim Höhenprofil ist die Reihenfolge hier nicht
zwingend: Die Route hängt nur an den Enden, nicht am gerouteten Verlauf des
Schlauchs. Sie steht zuletzt, weil sie am seltensten gebraucht wird.

## Vergleich

| Zeile | Pendelverkehr | Förderung |
| --- | --- | --- |
| Menge | `Q` aus der Formel | die geforderte Menge, **wenn** die Leitung darstellbar ist |
| Aufbauzeit | eine Umlaufzeit | `Länge·parallele / Verlegeleistung + Pumpen · Rüstzeit` |
| Gebundene Fahrzeuge | `n` | Pumpen, die Entnahmestelle mitgezählt |
| Engstelle | Entnahmestelle / Faltbehälter / geschätzte Strecke | „nicht darstellbar" bzw. Kupplungszahl |

Die Menge der Förderung ist **nicht** einfach die Fördermenge: Eine Leitung, die
mit diesen Mitteln nicht zu legen ist, liefert nichts. Ohne diese Unterscheidung
gewänne eine unmögliche Leitung den Vergleich, weil in ihrer Zeile die
Wunschzahl stünde.

### Die Aufbauzeit der Förderung braucht zwei Planungswerte

**Verlegeleistung 100 m/min** und **Rüstzeit 3 min je Pumpe**. Für die gibt es
keine Tabellenquelle. Sie sind deshalb

- im Aufklapper „Annahmen zur Aufbauzeit" änderbar,
- dort ausdrücklich als Planungswerte ohne Unterlage bezeichnet,
- und stehen in `VERGLEICH_DEFAULTS`, nicht verstreut im JSX.

Parallele Leitungen zählen als die **doppelte Strecke**: Zwei B-Leitungen sind
zweimal die Arbeit. Dass zwei Trupps sie gleichzeitig legen könnten, ist eine
Annahme über die Mannschaftsstärke, die dieser Rechner nicht kennt — und die
längere Zeit ist die, mit der man planen sollte.

Die Aufbauzeit des Pendelverkehrs ist dagegen **abgeleitet**: eine Umlaufzeit,
ohne neue Annahme.

### Die Empfehlung ist in einem Satz erklärbar

Wer die Sollmenge trägt, kommt in Frage; von denen gewinnt der kürzere Aufbau.

- Nur eine trägt ⇒ diese.
- Beide tragen ⇒ die schnellere. Bei gleicher Aufbauzeit **keine** Empfehlung:
  Sie wäre eine Münze, nicht ein Argument.
- Keine trägt ⇒ das wird gesagt, statt eine von zwei zu kleinen Varianten zu
  empfehlen. Die Antwort ist dort Nachalarmierung.
- Fehlt eine Seite ⇒ unklar. Eine Empfehlung, die nur eine Variante gesehen hat,
  ist keine.

Dazu die Zeile „kippt ab etwa *s* m" aus dem Kipppunkt.

### Kein gebundenes Personal

Bewusst nicht in der Tabelle. Es hinge an der Alarmierungsstärke und an der Frage,
wie viele Trupps gleichzeitig arbeiten — beides kennt der Rechner nicht, und eine
geratene Zahl neben gerechneten wäre nicht zu unterscheiden.

## Felder

Alle an `Connection`, alle in `data()`, **keine** in `fields()` — dieselbe
Begründung wie bei der Förderung: Sie gehören ins Panel, nicht in die generische
Feldliste.

`versorgungsart` (`'foerderung' | 'pendel' | 'vergleich'`, fehlt ⇒ `foerderung`,
also der Stand vor #693), `pendelFahrzeuge`, `pendelTankinhalt`,
`pendelGeschwindigkeit`, `pendelFuellzeit`, `pendelEntleerzeit`,
`pendelRoutedPositions`, `pendelRoutedFor`, `pendelRoutingFailed`,
`verlegeleistung`, `pumpenRuestzeit`.

`foerderung === 'true'` bleibt das Tor zu allem Abgeleiteten und wird vom Öffnen
des Panels gesetzt.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `pendel/shuttle.ts` | die Formel. Reine Zahlen, kein Firestore, keine Feldnamen |
| `pendel/pendelRoute.ts` | gespeicherte Fahrgeometrie, Signatur, Todo, Luftlinien-Ersatz |
| `pendel/ensureConnectionPendelRoute.ts` | schreibt sie |
| `pendel/pendelverkehr.ts` | die Fassade: Felder lesen, Vorgabewerte auffüllen |
| `pendel/versorgungVergleich.ts` | Gegenüberstellung, Empfehlung, Aufbauzeit |
| `connection/versorgungSummary.ts` | die Zeile für Popup und Elementliste, je Modus |

Formel und Fassade liegen getrennt, Fassade und Vergleich auch. Die Trennung ist
dieselbe wie bei `hydraulics.ts`/`foerderung.ts`, aus demselben Grund: Ein Test
soll die Formel widerlegen können, ohne dass Feldnamen im Spiel sind, und die
Empfehlung, ohne dass die Formel stimmt.

### Ein Panel, drei Sektionen

`LoeschwasserfoerderungPanel.tsx` hatte 803 Zeilen; mit drei Modi darin wären es
über 1200. Im Panel bleibt der Rahmen — Kopfzeile, Modus-Umschalter,
Förderrichtung, **geforderte Menge**, Höhen- und Routenabfrage, Speichern —, die
Inhalte liegen in `FoerderungSection`, `PendelSection` und `VergleichSection`.

**Die geforderte Menge steht im Rahmen, nicht in einer Sektion.** Sie ist die
Anforderung an der Einsatzstelle und keine Eigenschaft eines Fördermittels;
beide Varianten werden an derselben Zahl gemessen. Sie heißt im Panel deshalb
„Geforderte Menge" und nicht mehr „Fördermenge".

**„Pumpen als Marker ablegen" gibt es im reinen Pendelverkehr nicht.** Es legte
Standorte einer Leitung ab, die dort gar nicht gelegt wird. Im Vergleich bleibt
es, dort ist die Leitung eine der beiden Antworten.

### Karte

- Fahrtroute: gestrichelt, sichtbar bei `versorgungsart !== 'foerderung'`
- Pumpenmarker: sichtbar bei `versorgungsart !== 'pendel'` — im Vergleich will
  man beide sehen
- Keine zusätzlichen Marker an den Enden: Die Enden der Leitung sind gezeichnet,
  ein Marker daneben wiederholte, was schon dasteht

## Die Seite „Löschwasserversorgung"

Aus der Seitenleiste erreichbar (`/loeschwasserversorgung`, im Einsatz
`/einsatz/<id>/loeschwasserversorgung`): Karte links, Auswahl und Rechner
rechts.

Eine eigene Seite und nicht bloß ein Verweis auf die Karte, weil die Frage
„Leitung legen oder pendeln?" **vor** dem Zeichnen kommt. Man will eine Strecke
abstecken, um sie zu rechnen — nicht eine Leitung anlegen, um sie später zu
rechnen.

### Der Rechner ist aus dem Panel herausgelöst

`VersorgungRechner` trägt Zustand und Rechnung, aber **keinen Rahmen**. Er wird
an zwei Stellen gebraucht und sieht dort verschieden aus:

- über der Karte im schwebenden `LoeschwasserfoerderungPanel`,
- auf der Seite in der Spalte neben der Karte.

Er ist deshalb eine Flex-Spalte mit eigenem Scrollbereich und stehenbleibender
Fußzeile; wer ihn einbettet, gibt ihm eine Höhe. Der Schalter „Rechner für diese
Leitung verwenden" wanderte dabei aus der Panel-Kopfzeile in den Inhalt — sonst
gäbe es ihn auf der Seite nicht, und die Kopfzeile war ohnehin voll.

Das Panel zeichnet den Rechner **bedingt** statt in einem `Collapse`: Eine
Flex-Spalte mit innerem Scrollbereich übersteht den Höhenübergang eines Collapse
nicht. Die Fußzeile war auch vorher schon ohne Animation.

### Die Karte der Seite ist nicht die Einsatzkarte

`VersorgungMap` trägt Grundkarten, die Leitungen und das Zeichenwerkzeug — keine
Hydranten-Cluster, keine Fahrzeuge, keine Wetterstationen, keine Kartenleiste.
Zwei Gründe: Auf einer Rechenseite ist alles andere Beiwerk, und jede Ebene mehr
ist ein Firestore-Listener und eine weitere Stelle, an der eine **zweite
Leaflet-Instanz** stolpern kann. Wer die volle Karte braucht, hat sie eine
Menüzeile weiter oben.

Die Leitungen zeichnet `VersorgungLeitungenLayer` und bewusst **nicht**
`ConnectionComponent`: Die bringt verschiebbare Punktmarker, Punkt-Kontextmenü,
Bearbeiten-Knopf und ein eigenes schwebendes Panel mit. Hier wird eine Leitung
**ausgewählt**, nicht bearbeitet.

Die Seite wird wie `LayersWrapper` erst im Browser geladen (`useEffect`-Import).
Kein `next/dynamic` im Kartenbaum — die Begründung steht in
[docs/loeschwasserfoerderung.md](loeschwasserfoerderung.md).

### Zeichnen

Der `LeitungsProvider` liegt über Karte **und** Spalte: Das Zeichenwerkzeug
steckt in der Karte, der Knopf, der es startet, steht in der Liste daneben. Die
Vorlage hat `foerderung: 'true'` und `streetRouting: 'true'` — wer zum Rechnen
zeichnet, will den Rechner nicht danach erst einschalten.

Die neu gezeichnete Leitung wird von selbst gewählt. Dafür führt der Provider
`lastCreatedId`; die Seite übernimmt jede ID genau einmal und passt den Zustand
**während des Renderns** an, nicht in einem Effekt — ein Effekt gäbe eine
Kaskade und einen Frame, in dem die neue Leitung schon da, aber noch nicht
gewählt ist.

### Nur mit laufendem Einsatz

Gezeichnete Leitungen leben im Einsatz; ohne einen gibt es nichts zu listen und
nichts zu speichern. Ohne Einsatz steht dort deshalb der Weg zur Einsatzauswahl
und nicht ein Rechner, dessen Ergebnis niemand festhalten kann.

## Was hier nicht ist

- **Tankinhalt an den Fahrzeugstammdaten** und Auswahl der Einsatzfahrzeuge. Die
  Handeingabe reicht für die taktische Frage; ein Feld an den Stammdaten wäre ein
  eigener Vorgang mit eigener Pflege, und ein ungepflegtes Feld ist schlimmer als
  keines.
- **Gebundenes Personal** im Vergleich (siehe oben).
- **Ableitung der Füllzeit** aus der Ergiebigkeit des Hydranten am
  Leitungsanfang.
