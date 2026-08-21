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
t_füll   = V/L + t_rangier
t_umlauf = 2·s/v + t_füll + t_entleer
Q        = min( n·V / t_umlauf ,  V / t_füll )
```

`s` einfache Fahrstrecke in m, `v` Geschwindigkeit, `V` Tankinhalt, `L`
Ergiebigkeit der Entnahmestelle in l/min, `n` Fahrzeuge, Zeiten in Minuten, `Q`
in l/min.

### Die Füllzeit ist gerechnet, nicht eingegeben

Sie war einmal ein Eingabefeld mit dem Vorgabewert 4 Minuten. Das war
stillschweigend die Behauptung **„500 l/min an jeder Entnahmestelle"** — eine
Zahl, die aus nichts folgt und die dann die Menge des ganzen Pendelverkehrs
deckelt. Wer den Tankinhalt auf 4000 l änderte, behauptete damit unbemerkt
1000 l/min.

Eingegeben wird deshalb die **Ergiebigkeit**, und die Füllzeit folgt daraus.
Woher sie kommt:

1. **Der Hydrant an der Entnahmestelle**, wenn einer innerhalb von **100 m**
   steht und eine Leistungsangabe hat. 100 m ist die Weite, in der ein Fahrzeug
   noch am Hydranten steht und nicht erst hinfährt; weiter weg wäre es eine
   eigene Fahrstrecke, die in der Umlaufzeit fehlt. Gesucht wird über dieselbe
   Geohash-Umkreissuche wie beim Assistenten (`queryClusters` +
   `collectWaterSupplyCandidates`).
2. **Die Eingabe**, wenn keiner in Reichweite ist oder die Angabe fehlt. Der
   eingetragene Wert gewinnt immer gegen den Hydranten: Wer ihn setzt, hat einen
   Grund — gemessen, oder ein anderer Anschluss als der, den die GIS-Daten
   kennen.
3. **Nichts.** Ohne Ergiebigkeit wird nicht gerechnet, sondern gefragt. Ein
   Vorgabewert wäre genau die Annahme, die hier abgeschafft wurde.

Gespeichert wird nur der von Hand gesetzte Wert. Käme der Wert aus dem
Hydranten, schriebe ein Speichern ihn fest — und ein verschobener Anfangspunkt
rechnete danach weiter mit dem alten Hydranten.

Das Feld `leistung` des GIS-Imports ist Freitext („1074", „800 l/min", „1.200").
Ein Punkt oder Komma mit **genau drei Ziffern dahinter** ist deutsche
Tausendertrennung und kein Dezimaltrenner: „1.200" sind 1200 l/min, nicht 1,2.
Ohne diesen Schritt las der Rechner am starken Hydranten die schwächste Leistung
im Datensatz.

Ein näherer Hydrant **ohne** Leistungsangabe verdrängt keinen weiter entfernten
mit: Gesucht ist die Zahl, nicht der Hydrant.

#### „Kein Hydrant" und „Hydrant ohne Leistungsangabe" sind zwei Meldungen

`leistung` steht in **keinem** GIS-Import. Das Feld wird von Hand gepflegt und
vom CSV-Import über `preservedFields` gerettet — im Datenbestand ist es meist ein
leerer String. Der Regelfall ist deshalb nicht „kein Hydrant in der Nähe",
sondern „der Hydrant daneben hat keine Zahl".

`lookupFuellstelle` gibt beides zurück: die Füllstelle mit Leistungsangabe, und
in jedem Fall den nächsten Hydranten. Eine Meldung, die beides zu „Kein Hydrant
mit Leistungsangabe in 100 m" zusammenfasst, widerspricht dem, was der Melder
auf der Karte vor sich hat, und lässt offen, ob die Suche überhaupt gelaufen ist.

#### Die Umkreissuche fand unter 500 m gar nichts

`geohashQueryBounds` wählt die Genauigkeit der Grenzen nach dem Radius: je
kleiner der Kreis, desto **länger** die Präfixe. Unter etwa 500 m sind sie
siebenstellig — die Dokumente in `clusters6` tragen aber immer einen
**sechsstelligen** Geohash. Und `'u2ebz1' < 'u2ebz1n'`: Die Kachel, in der man
selbst steht, liegt lexikografisch vor der Untergrenze ihres eigenen Bereichs
und fällt aus der Abfrage heraus.

Der 100-m-Radius der Füllstellensuche lag voll in dieser Lücke und lieferte
**null** Cluster — nicht zu wenige. Der Rechner meldete deshalb „kein Hydrant",
während zwei davor standen.

`clusterQueryBounds` ([src/common/clusterGeohash.ts](../src/common/clusterGeohash.ts))
kürzt die Grenzen auf sechs Zeichen und sortiert die dabei zusammenfallenden
Bereiche aus. Das vergrößert den abgefragten Bereich, und das ist die richtige
Richtung: Die Grenzen decken ohnehin mehr ab als den Radius, auf Distanz filtert
der Aufrufer.

Dasselbe traf den KI-Assistenten: Seine Suche nach Wasserentnahmestellen beginnt
bei 300 m, also ebenfalls siebenstellig. Sie fand nie etwas und eskalierte
stillschweigend auf 600 m — dort greifen sechsstellige Grenzen, und es sah nach
einer Suche aus, die einfach weiter schauen musste.

Nur Hydranten. Saugstelle und Löschteich tragen ihre Ergiebigkeit in anderen
Feldern (`wasserentnahme`, `zufluss`) und sind ein eigener Fall — mit eigener
Frage, ob eine Saugstelle überhaupt als Füllplatz für mehrere Fahrzeuge taugt.

### Die Füllstelle ist eine Schranke, nicht ein Summand

Der zweite Term ist der Punkt, an dem ein naives `n·V/t_umlauf` falsch wird: An
einer Entnahmestelle füllt immer nur **ein** Fahrzeug. Die Entnahmestelle gibt
damit höchstens einen Tankinhalt je Füllzeit her, ganz unabhängig davon, wie
viele Fahrzeuge im Umlauf sind. Ab `n > t_umlauf/t_füll` stehen die weiteren in
der Schlange.

Die Schranke ist ein Tankinhalt je **Füllzeit** und liegt damit unter der
Ergiebigkeit, sobald Rangierzeit im Spiel ist: Die Entnahmestelle ist auch dann
besetzt, wenn gerade kein Wasser läuft. Ohne Rangierzeit fallen beide zusammen.

**Prüfstein:** 2000 m, 40 km/h, 2000 l, 800 l/min, 1 min Rangieren, 3 min
Entleeren ⇒ Füllzeit 3,5 min, Umlaufzeit 12,5 min. Ein Fahrzeug liefert
160 l/min, drei liefern 480. Die Schranke ist 2000/3,5 = 571 l/min und greift ab
3,57 Fahrzeugen; vier liefern deshalb nicht 640 sondern **571**, und zehn
liefern auch nicht mehr. Das steht als Testzusicherung in `shuttle.test.ts`.

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
| **Ergiebigkeit** | **kein Vorgabewert** | Hydrant in 100 m oder Eingabe — siehe oben |
| Rangierzeit | 1 min | An- und Abfahren an der Entnahmestelle, Kuppeln inbegriffen |
| Entleerzeit | 3 min | 2000 l über die eigene Pumpe plus Anfahren |
| Fahrzeuge | 2 | Der kleinste Pendelverkehr, der einer ist. |

Neben der Rangierzeit steht die **gesamte** Füllzeit, die daraus folgt, und neben
der Entleerzeit die Leistung, die sie bedeutet. Beides hält die Zahlen
nachprüfbar, ohne sie zweimal eingeben zu lassen.

## Fahrstrecke: die gezeichnete Leitung

Die Fahrstrecke ist **diese Leitung**, über **alle** Punkte.

Es gab hier einmal eine zweite Geometrie: ein eigenes Routing zwischen den
beiden Enden, gestrichelt neben der Leitung gezeichnet, mit Luftlinie × 1,3 als
Ersatz. Das war falsch gedacht, und im Einsatz sofort sichtbar falsch. **Wer eine
Pendelstrecke absteckt, setzt die Punkte dorthin, wo gefahren wird.** Eine zweite
Linie, die sich einen eigenen Weg von Ende zu Ende sucht, ignoriert genau diese
Arbeit, lässt die abgesteckten Zwischenpunkte liegen und behauptet eine Strecke,
die niemand bestellt hat.

Damit die Strecke der Straße folgt, wird die Leitung auf **Routing mit dem Profil
`drive`** gestellt — dieselben Felder wie beim Schlauch, nur ein anderes Profil.
Das Profil steht deshalb jetzt an der Leitung zur Wahl („Schlauch" /
„Fahrzeug"); vorher gab es das bewusst nicht, weil ein Schlauch nicht fährt. Im
Pendelverkehr fährt er.

- **Gemessen wird `connectionDisplayPositions`** — der Verlauf, den die Karte
  zeichnet, mit Routing der Straßenverlauf, sonst die Luftlinien zwischen den
  Punkten. Dieselbe Funktion wie für die Schlauchlänge.
- **Kein Umwegfaktor.** Er gehörte zur automatisch gerouteten zweiten Linie. Auf
  eine Strecke, die von Hand entlang der Straße abgesteckt wurde, einen Aufschlag
  zu rechnen, zählte den Umweg doppelt.
- **Nicht für ein Fahrzeug geroutet** heißt: gerechnet wird trotzdem, mit der
  gezeichneten Länge, und das Panel sagt es — mit einem Knopf, der die Leitung
  umstellt. Das Fußgänger-Profil zählt dabei nicht als geroutet: Es ignoriert
  Einbahnen und schneidet über Fußwege ab.
- **Kein eigener Schritt** in `ensureConnectionDerived` mehr. Das Routing der
  Leitung erledigt es.

Ein Umstellen auf `drive` ändert auch den Verlauf, an dem das **Höhenprofil**
hängt, und zieht damit eine neue Höhenabfrage nach. Das ist richtig so: Es ist
eine andere Linie.

## Vergleich

| Zeile | Pendelverkehr | Förderung |
| --- | --- | --- |
| Menge | `Q` aus der Formel | die geforderte Menge, **wenn** die Leitung darstellbar ist |
| Aufbauzeit | eine Umlaufzeit | `Länge·parallele / Verlegeleistung + Pumpen · Rüstzeit` |
| Gebundene Fahrzeuge | `n` | Pumpen, die Entnahmestelle mitgezählt |
| Engstelle | Entnahmestelle / Faltbehälter / nicht geroutete Strecke | „nicht darstellbar" bzw. Kupplungszahl |

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
`pendelGeschwindigkeit`, `pendelFuellleistung`, `pendelRangierzeit`,
`pendelEntleerzeit`, `verlegeleistung`, `pumpenRuestzeit`.

Für die Fahrstrecke gibt es **keine** eigenen Felder: Sie steckt in
`streetRouting` und `routingProfile` der Leitung.

`foerderung === 'true'` bleibt das Tor zu allem Abgeleiteten und wird vom Öffnen
des Panels gesetzt.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `pendel/shuttle.ts` | die Formel. Reine Zahlen, kein Firestore, keine Feldnamen |
| `pendel/pendelRoute.ts` | Versorgungsart, Fahrstrecke aus dem gezeichneten Verlauf, „ist das für ein Fahrzeug geroutet?" |
| `pendel/fuellstelle.ts` | Ergiebigkeit aus dem nächsten Hydranten, Freitext-Leistung parsen |
| `common/clusterGeohash.ts` | Geohash-Grenzen der Umkreissuche, auf die Länge der Cluster-Dokumente gekürzt |
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

- Pumpenmarker: sichtbar bei `versorgungsart !== 'pendel'` — im Vergleich will
  man beide sehen
- **Keine zweite Linie.** Die Fahrstrecke ist die Leitung; sie ist schon
  gezeichnet.
- Keine zusätzlichen Marker an den Enden: Die Enden der Leitung sind gezeichnet,
  ein Marker daneben wiederholte, was schon dasteht

### Wenn die Höhendaten nicht kommen

„Höhendaten werden abgerufen …" blieb im Einsatz stehen, ohne dass ein Ergebnis
kam — und ein Fehlschlag war nicht zu sehen. Drei Ursachen, alle behoben:

1. **Der Fehlschlag wurde nie angezeigt.** `foerderungElevationFailed` gab es im
   Code, benutzt hat es niemand. Der Rechner zeigte nur das allgemeine „keine
   Höhendaten" — und solange der Ladehinweis stand, auch das nicht. Jetzt ist
   `elevationFailed` eine eigene Warnung mit dem Knopf **„Erneut versuchen"**:
   „liegt nicht vor" und „ließ sich nicht holen" sind zwei verschiedene Lagen,
   und die zweite ist ein Anlass, es noch einmal zu versuchen.
   `ensureConnectionElevation` nimmt dafür `{ force: true }` — ohne das bliebe
   eine Leitung nach einem einzigen Aussetzer für immer bei der Handeingabe,
   denn genau das verhindert der Vermerk sonst absichtlich.
2. **Das Speichern löschte das Profil wieder weg.** `persist` schrieb den
   Schnappschuss aus dem Render, und `updateItem` schreibt ohne `merge`. War das
   Profil zwischen Render und Speichern eingetroffen, war es danach wieder fort,
   die Abfrage lief erneut — und das sah aus wie ein Rechner, der nie fertig
   wird. Geschrieben wird jetzt `itemRef.current`.
3. **Ein Wachhund.** Nach 25 s ist ein Ladehinweis eine Lüge, ganz gleich warum.
   Dann wird gesagt, dass es nicht geklappt hat, und der Rechner rechnet mit der
   Handeingabe weiter. Die Abfragen haben je 8 s Zeitlimit; alles darüber liegt
   an etwas, das kein Zeitlimit hat.

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
- **Saugstelle und Löschteich als Füllstelle.** Ihre Ergiebigkeit steht in den
  GIS-Daten (`wasserentnahme`, `zufluss`), aber ob eine Saugstelle als Füllplatz
  für mehrere Fahrzeuge taugt, ist eine eigene Frage.
