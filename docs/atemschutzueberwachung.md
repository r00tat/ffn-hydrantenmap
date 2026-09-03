# Atemschutzüberwachung

Die Einsatzzeitkontrolle des Gruppenkommandanten: protokollierte Druckabfragen,
laufend fortgeschriebener Luftvorrat, Rückzugszeitpunkt und Warnungen.

Wer im Zusammenspiel mit dem Sammelplatz was tut — und was der Ablauf ohne
Sammelplatz ist —, steht in [atemschutz-ablauf.md](atemschutz-ablauf.md).

Code: [src/common/atemschutzUeberwachung.ts](../src/common/atemschutzUeberwachung.ts)
(die Rechnung), [src/components/Atemschutz/UeberwachungPage.tsx](../src/components/Atemschutz/UeberwachungPage.tsx)
(die Seite), [src/components/Atemschutz/sendUeberwachungWarnungen.ts](../src/components/Atemschutz/sendUeberwachungWarnungen.ts)
(der Lauf, der warnt und den nächsten Termin plant),
[src/server/atemschutz/ueberwachungTasks.ts](../src/server/atemschutz/ueberwachungTasks.ts)
(die Terminplanung über Cloud Tasks).

## Herkunft

Grundlage ist das ÖBFV-Fachhandbuch 06 „Atemschutz", Abschnitt 5.3.2
(Rückzugszeitpunkt, rechnerische Einsatzdauer, S. 44–49), 5.3.3
(Atemschutzüberwachung, S. 50–51) und 5.3.4 (Atemschutzsammelplatz, S. 52),
dazu Merkblatt M302 „Atemschutzüberwachung durchführen" aus ÖBFV-Heft 122.
Die Dateien liegen lokal unter `captures/ASUE/` und sind nicht im Repository
(`/captures/` ist gitignored).

## Warum eine eigene Seite und nicht ein Reiter des Sammelplatzes

Die Unterlage trennt beides ausdrücklich, und daraus folgt der Zuschnitt:

> „Der Kommandant der taktischen Einheit (zumeist Gruppenkommandant) ist für die
> Überwachung ‚seines(r)' Atemschutztrupps verantwortlich."

> „Diese übergeordnete Atemschutzüberwachung [am ASSP] hat ausschließlich
> logistische Aufgaben; sie führt **KEINE ZEITKONTROLLE** durch."

Begründet wird das zeitlich (der Sammelplatz existiert in der ersten
Einsatzphase noch nicht) und organisatorisch (die Lageübersicht hat der
Gruppenkommandant vor Ort). Deshalb `/atemschutzueberwachung` neben
`/atemschutz` und im Menü **vor** dem Sammelplatz: Die Zeitkontrolle beginnt mit
dem ersten Trupp, der Sammelplatz erst bei umfangreicheren Einsätzen. Ein Trupp
lässt sich hier auch dann erfassen, wenn er nie über einen Sammelplatz lief.

## Warum dieselbe Sammlung wie am Sammelplatz

Gearbeitet wird auf `call/{firecallId}/atemschutzTrupp` — derselben Sammlung wie
der Trupps-Reiter des Sammelplatzes. Ein Trupp ist ein Trupp; „vom Sammelplatz
übernehmen" heißt dann nichts anderes, als dass dasselbe Dokument
Überwachungsfelder bekommt. Zwei Sammlungen hießen zwei Zeiten und zwei Drücke
für denselben Trupp, die auseinanderlaufen können — und genau darauf käme es an.

Nebeneffekte, die ohne Zutun stimmen: Ein am Sammelplatz entsendeter Trupp
erscheint hier von selbst („nicht erst, wenn ich ihn suche"), und die
Einsatzsicherung ([useExport.ts](../src/hooks/useExport.ts)) trägt die neuen
Felder mit, ohne dass dort etwas nachgezogen werden muss.

## Was „Trupp übernehmen" tut

Der Knopf sieht nach einem Formular aus und ist in Wahrheit eine Anmeldung. Drei
Dinge passieren gleichzeitig (`uebernahmePatch`), und keines davon ist aus dem
Titel abzulesen — deshalb steht im Dialog ein Hinweis darüber und am Knopf ein
Tooltip:

1. **Die Verantwortung wechselt, und das wird protokolliert.**
   `ueberwachungSeit` hält den Zeitpunkt fest, ab dem der Gruppenkommandant die
   Zeitkontrolle führt und nicht mehr der Sammelplatz (FH-06 5.3.4). Der Stempel
   wird **nur beim ersten Mal** gesetzt; sonst verschöbe ihn jede nachträglich
   getippte Bemerkung nach vorn. Das Gegenstück ist `ueberwachungBis` (siehe
   „…oder zurück an den Sammelplatz").
2. **Dieses Gerät wird Empfänger der Warnungen.** Die eigene `uid` kommt in
   `ueberwachungUids`, und erst danach holt die Seite den Push-Token
   (`registerMessaging`). Die Erlaubnisfrage des Browsers gehört zu einer
   Handlung, die sie erklärt — beim Laden der Seite gestellt, wäre sie eine
   Frage ohne Anlass.
3. **Der Gerätesatz wird festgelegt.** Ohne ihn rechnet die Seite mit der
   Vorgabe aus dem Flaschenbestand. Das ist eine brauchbare Annahme, aber eine
   Annahme; erst hier steht sie sichtbar im Formular, und mit ihr stehen
   Drittelmarken und Rückzugszeitpunkt.

Wer einen Trupp auf dieser Seite selbst erfasst, hat die Zeitkontrolle damit
schon: `ueberwachungSeit` und die eigene `uid` werden beim Anlegen gesetzt, und
der Knopf heißt an dieser Karte von Anfang an „Überwachung bearbeiten". Ein
zweiter Klick auf „Übernehmen" wäre ein Klick ohne Erkenntnis.

**Der Einsatzauftrag tut dasselbe.** Wer einen Trupp unter Atemschutz schickt,
hat ab diesem Moment die Verantwortung (FH-06 5.3.4) — `entsendePatch` setzt
deshalb `ueberwachungSeit` und die eigene `uid` gleich mit. Ein
vorgeschalteter Klick auf „Trupp übernehmen" wäre derselbe Klick ohne
Erkenntnis. Der Knopf bleibt trotzdem: Er ist der protokollierte **Wechsel**
der überwachenden Stelle und trägt Gerätesatz, Auftrag, Einsatzziel und den
Namen der überwachenden Person nach.

Nicht übernommen wird die *Verantwortung für den Trupp* — die bleibt beim
Truppkommandanten und beim Kommandanten der taktischen Einheit (siehe „Was die
Überwachung ausdrücklich nicht ist").

## Druckabfragen sind ein Array, keine Untersammlung

`abfragen` ist ein Feld am Trupp-Dokument. Gründe, in dieser Reihenfolge:

- Es sind ein paar Zeilen je Bereitstellung, und die Anzeige braucht immer alle.
- `arrayUnion` hängt **serverseitig** an. Am Sammelplatz und beim
  Gruppenkommandanten schauen zwei Geräte auf denselben Trupp; wer das Array aus
  seinem geladenen Zustand neu schreibt, löscht die Abfrage, die eine Sekunde
  vorher von einem anderen Gerät kam.
- Die Einsatzsicherung nimmt Felder mit, eine weitere Untersammlung müsste dort
  eingetragen werden.

Der Abmarsch steht **nicht** in `abfragen`, sondern bleibt `abmarschZeit` +
`druckAbmarsch`: Zwei Wahrheiten über denselben Zeitpunkt wären eine zu viel.

**Der Druck ist optional.** Derselbe Dialog nimmt auch eine reine
Statusmeldung auf — über Funk kommt nicht jede Meldung mit einer Zahl, „starke
Verrauchung, wir arbeiten weiter" ist eine Meldung ohne Druck. Der Knopf heißt
deshalb „Druckabfrage / Status". Abgewiesen wird nur die Meldung, die gar
nichts sagt (`leereMeldung`): ohne Druck, ohne Ankunft, ohne Rückzug, ohne
Bemerkung.

Alles, was **rechnet**, lässt solche Zeilen aus — `berechneStand`,
`baueDruckVerlauf` und die Fälligkeitsprüfung der Warnungen filtern mit
`hatDruck`. Sie sind ein Ereignis, kein Messpunkt. Bei den Warnungen ist das
kein Nebeneffekt, sondern Absicht: Die Drittel-Erinnerung will einen
Flaschendruck aus dem Trupp holen, und eine Meldung ohne Zahl beantwortet die
Frage nicht, auf die sie zielt. `sortierteAbfragen` dagegen gibt alle
Meldungen heraus — der Verlauf zeigt sie, und „Trupp am Einsatzziel, kein
Druck durchgegeben" muss als Ankunft erkannt werden.

## Ein Druck je Abfrage, nicht einer je Person

> „Der Atemschutztrupp hat sich bei der Festlegung des Rückmarschzeitpunktes
> immer an dem Geräteträger mit dem größten Luftverbrauch zu orientieren."

Gerechnet wird ohnehin nur mit dem kleinsten Wert. Drei Werte abzufragen kostet
Funkzeit und bringt für die Rechnung nichts.

## Die rechnerische Einsatzdauer und ihre Gegenprüfung

```text
                 V × (Fülldruck × K − Reservedruck)
Einsatzdauer = ──────────────────────────────────────
                 durchschnittlicher Luftverbrauch
```

Reservedruck 55 bar, mittlerer Verbrauch 50 l/min, Korrekturfaktor K = 0,9 —
letzterer, weil Luft über 265 bar ihr Kompressionsverhalten ändert und der
Vorrat nicht mehr nach der Zustandsgleichung für ideale Gase zu rechnen ist.

Die drei Beispiele der Unterlage (S. 49) stehen als Tests in
[atemschutzUeberwachung.test.ts](../src/common/atemschutzUeberwachung.test.ts).
Dabei fällt auf, dass die Unterlage **unterschiedlich rundet**:

| Gerätesatz | gerechnet | Unterlage | Reserveluft gerechnet / Unterlage |
| --- | --- | --- | --- |
| 2×4 l / 200 bar | 23,2 min | 24 min | 440 l / 440 l |
| 1×6 l / 300 bar | 25,8 min | 26 min | 330 l / 330 l |
| 2×6,8 l / 300 bar | 58,48 min | 58 min | 748 l / 750 l |

Die Tests prüfen deshalb den exakten Wert und nicht die gerundete Angabe. Wer
eine Formel anfasst, muss weiterhin 23,2 / 25,8 / 58,48 treffen.

### Der Korrekturfaktor hängt am Nenndruck

`korrekturfaktor()` bekommt den **Nenndruck** der Flasche, nicht den gerade
anliegenden Druck. Das ist die Lesart der Unterlage („Dieser ist nur bei 300 bar
Flaschen erforderlich") und die einzige ohne Sprung: Am aktuellen Druck bemessen,
gewönne eine 300-bar-Flasche beim Unterschreiten von 265 bar plötzlich 10 %
Luftvorrat dazu. Für eine teilgefüllte 300er rechnet es den Vorrat leicht zu
klein — die sichere Richtung.

### Der Reservedruck ist nicht korrigiert

`V × (p × K − 55)`: Der Faktor wirkt nur auf den Fülldruck, nicht auf die
Reserve. Das ist die Formel der Unterlage, nachweisbar an ihren Reserveluftwerten
(6 l × 55 bar = 330 l, ohne K). Die Folge ist eine kleine Unstimmigkeit, die im
Code sichtbar bleibt: Die rechnerische Einsatzdauer eines 300-bar-Gerätes endet
bei 25,8 Minuten, die Druckprognose erreicht die 55-bar-Marke erst nach 26,5
Minuten. Der Unterschied von 0,7 Minuten ist die Unstimmigkeit der Unterlage
selbst — bei 200 bar (K = 1) fallen beide Werte exakt zusammen. Angezeigt werden
beide Größen getrennt und nie als dieselbe.

## Rückmarschdruck = doppelter Vormarschdruckabfall

**Wörtlich und als absoluter Druck:**

```text
Rückmarschdruck = 2 × (Abmarschdruck − Druck am Einsatzziel)
```

Der Trupp muss umkehren, solange noch doppelt so viel Luft in der Flasche ist,
wie der Hinweg gekostet hat — „Für den Rückweg ist die doppelte Luftmenge der
beim Hinweg verbrauchten Atemluft einzuplanen."

Diese Lesart weicht von der Formel im Issue-Text (#765) ab, dort stand
`Fülldruck − 2 × (Fülldruck − Druck am Ziel)`. Die Gegenprüfung entscheidet:
Beispiel 2 der Unterlage ist mit „Rückmarsch bei Ansprechen des Warnsignals
(55 ± 5 bar), da der doppelte Vormarschdruckabfall nur 40 bar beträgt"
beschriftet. Bei 20 bar Vormarschdruckabfall liefert die Formel oben 40 bar,
also weniger als 55 — genau die Aussage des Beispiels. Die andere Lesart käme bei
einem 300-bar-Gerät auf 260 bar; die Restdruckwarnung könnte dann **nie** zuerst
greifen, und der zugehörige Punkt im Testplan des Issues wäre unerreichbar.

Der maßgebliche Rückzugsdruck ist damit der **höhere** von Rückmarschdruck und
Restdruckwarnung (55 bar) — der Druck fällt, also greift der höhere Wert früher.
Ohne Ankunftsmeldung ist der Rückmarschdruck nicht berechenbar; dann gilt die
Restdruckwarnung, und die Karte weist mit einem Hinweis darauf hin, dass die
Ankunftsmeldung fehlt.

### Die Ankunft heißt nicht „Einsatzziel erreicht"

Die Unterlage nennt den Wert „Flaschendruck bei Erreichen des Einsatzzieles".
Als Beschriftung eines Hakens gemeldet („Meldung ‚Einsatzziel erreicht'") liest
sich das aber wie **„Auftrag erledigt"** und nicht wie „der Trupp ist
angekommen" — genau so wurde es beim Ausprobieren verstanden. Im Formular steht
deshalb „Trupp ist am Einsatzziel angekommen", im Druckverlauf „Ankunft".

Der Haken ist **nicht vorbelegt, solange die Ankunft fehlt**, obwohl die erste
Abfrage nach dem Abmarsch meist die Ankunftsmeldung ist. Aus ihr rechnet sich
der Rückmarschdruck; eine gewöhnliche Zwischenabfrage, die versehentlich als
Ankunft gilt, macht ihn zu einer Behauptung. Stattdessen erinnert ein Hinweis im
Dialog daran, dass die Ankunft für diesen Trupp noch fehlt — und dass bis dahin
die 55-bar-Warnung der Rückzugszeitpunkt ist.

Ist die Ankunft dagegen **schon gemeldet, entfällt der Haken ganz**. Sie ist
ein Ereignis und kein Zustand: Es gibt sie genau einmal, und maßgeblich ist die
**erste** Zielmeldung („Flaschendruck bei Erreichen des Einsatzzieles") —
`berechneStand` nimmt sie mit `find` und nicht die letzte. Die nächste Abfrage
hat dazu also nichts mehr zu sagen; ein Haken wäre eine Frage ohne
Antwortmöglichkeit. Dasselbe gilt für den angetretenen Rückzug.

Zwischenzeitlich war der Haken in diesem Fall **vorbelegt**, mit der Begründung,
der Trupp *sei* ja am Einsatzziel. Das war ein Fehler: Vorbelegt schrieb jede
weitere Abfrage erneut `amZiel` in das Dokument, und im Druckverlauf stand
danach an jeder Zeile „Ankunft" — die eine Meldung, auf die es ankommt, war
nicht mehr zu finden. Die Rechnung blieb zwar richtig (`find` nimmt die erste),
die Anzeige log. Für Zeilen aus dieser Zeit beschriftet die Karte deshalb nur
die erste Meldung je Ereignis, unabhängig davon, wie viele das Flag tragen.

## Zwei Verbrauchswerte, zwei Zwecke

- **Restzeit und Rückzugszeitpunkt** rechnen mit dem *gemessenen* Verbrauch,
  sobald zwei Druckwerte mit Zeitstempel vorliegen — aus dem **ersten und dem
  letzten** Wert und nicht aus den letzten zwei: Zwei kurz aufeinanderfolgende
  Abfragen können eine Verschnaufpause oder eine Treppenflucht treffen, und die
  Prognose sprünge bei jeder Abfrage. „Jede weitere Druckabfrage schreibt den
  Wert fort" heißt Mittelwert über den Einsatz.
- **Die Drittelmarken** rechnen mit dem Anhaltswert von 50 l/min, fest ab dem
  Abmarsch. Sie sind eine Meldedisziplin und müssen von Anfang an feststehen;
  zöge ein sparsamer Trupp sie nach hinten, käme die Nachfrage genau dann
  später, wenn niemand gemeldet hat.

Ein gestiegener oder gleicher Druck verwirft die Messung (Tippfehler, oder es
war ein anderer Geräteträger) und der Anhaltswert gilt weiter.

### Das Messfenster muss tragen

Eine Messung über weniger als `MESSFENSTER_MIN_MIN` = 3 Minuten ist kein Trend,
sondern ein Abschnitt. Beobachtet in dev: 70 bar über 2:18 min ergaben
30,3 bar/min, also rund 164 l/min — weit über „schwere Arbeit" (80–100 l/min),
weil das Fenster genau den Vormarsch traf. Die Prognose daraus setzte den
Rückzugszeitpunkt zwei Minuten in die Zukunft, und seine Warnschwelle damit
**eine Minute in die Vergangenheit**: Die Warnung kam im selben Augenblick, in
dem die Druckabfrage gespeichert wurde.

Die drei Minuten kommen aus der Ableseschärfe: Am Manometer wird auf etwa 10 bar
genau gelesen. Über drei Minuten fallen bei einem Standard-PA nach dem
Anhaltswert rund 28 bar — ein Ablesefehler ist dann ein Drittel der Rate; über
eine Minute wäre er die ganze Rate.

Unterhalb des Fensters gilt die **höhere** der beiden Raten, gekennzeichnet als
`vorlaeufig`. Nicht der Rückfall auf den Anhaltswert: Der wäre die unsichere
Richtung — er ergäbe für den beobachteten Trupp einen Rückzug fast fünf Minuten
später, und wenn der Trupp wirklich so schnell verbraucht, käme die Warnung dann
zu spät. Eine kurze Messung darf die Prognose verkürzen, aber nicht verlängern.
Ein zusätzlicher Mindestdruckabfall erübrigt sich damit: Eine winzige Differenz
ergibt eine kleine Rate, und dann greift ohnehin der Anhaltswert.

### Der Druckverlauf steht zeilenweise

Die Werte standen zuerst als Kette in einer Zeile („10:00 300 bar → 10:05
200 bar (Ankunft) → …"). Am Einsatzort wird das im Vorbeigehen gelesen, oft auf
einem Telefon, und dort bricht die Kette um — drei Zeitangaben in einer
umgebrochenen Zeile sind genau dann nicht zu erfassen. Jetzt trägt jeder Wert
eine eigene Zeile in einem Raster aus drei Spalten (Uhrzeit, Druck,
Bezeichnung), damit Uhrzeiten und Drücke untereinander stehen und mit
`tabular-nums` auch gleich breit sind.

Beschriftet sind nur Abmarsch, Ankunft und Rückkehr. Stünde an jeder Zeile
„Druckabfrage", fielen genau die drei Zeilen nicht mehr auf, auf die es ankommt.

### Die Kurve unter den Zeilen

Zusätzlich zur Zeilenliste steht der Verlauf als Grafik da
([DruckVerlaufChart.tsx](../src/components/Atemschutz/DruckVerlaufChart.tsx),
Modell in
[druckVerlaufModell.ts](../src/components/Atemschutz/druckVerlaufModell.ts)).
Nicht als Verschönerung: Aus Zahlen ist die **Steigung** nicht abzulesen, und
die ist die Frage am Einsatzort — wie schnell geht die Luft weg, und reicht sie
bis zur Marke? Beides steht deshalb im selben Bild: die durchgezogene Linie der
gemessenen Werte, gestrichelt die Fortschreibung bis zur maßgeblichen Schwelle,
senkrecht die Drittelmarken, das **rechnerische** Einsatzende (Anhaltswert der
Unterlage) und „jetzt", waagrecht Rückzugsdruck und Restdruckwarnung. Wer
schneller verbraucht als 50 l/min, sieht seine Linie vor der Marke „rechn. Ende"
unten ankommen — das ist die Aussage, für die es die Grafik gibt.

Jede Druckabfrage trägt einen **Punkt** auf der Linie (`showMark: true`, anders
als in den Wetterkurven, die ihre Punkte ausschalten): Hier sind es eine Handvoll
Ablesungen, und *wann* abgefragt wurde ist Teil der Aussage — der Knick der Linie
liegt genau dort. Dazu kommen die drei gemeldeten **Ereignisse** als senkrechte
Marken: Ankunft, angetretener Rückzug, Rückkehr. An ihnen bricht die Steigung,
und erst mit ihnen ist zu lesen, woran der Verbrauch hing: Ein steiler Abschnitt
zwischen Ankunft und Rückzug ist Arbeit unter Last, derselbe Abfall auf dem
Vormarsch wäre ein zu langer Anmarschweg.

Die Marken sind auf **zwei Beschriftungszeilen** verteilt: Fristen aus der
Rechnung oben und gestrichelt, gemeldete Ereignisse (und „jetzt") unten und
durchgezogen. Auf einer Höhe stünden bis zu sieben Beschriftungen übereinander,
und die Trennung ist zugleich die Aussage — oben, was gerechnet ist, unten, was
jemand gemeldet hat. Die Marke „zurück" hängt an `rueckkehrZeit` und nicht am
Rückkehr-*Punkt* der Linie: Den gibt es nur mit abgelesenem Druck, und der wird
beim Eintreffen oft nicht mehr abgefragt.

Den Zeitpunkt der Ankunft führt `berechneStand` als `zielSeit` neben
`druckAmZiel` mit — beides kommt aus derselben ersten Zielmeldung, und die Grafik
müsste ihn sonst ein zweites Mal aus den Abfragen suchen, mit dem Risiko, dabei
die letzte statt der ersten zu nehmen.

Gezeichnet wird mit **`@mui/x-charts`** — derselben Bibliothek wie die
Wetterhistorie, die Fahrtenbuch-Statistik und die Dosimetrie, also ohne neue
Abhängigkeit im Bündel. Zeitachse, Achsenbeschriftung, Tooltip und die
`ChartsReferenceLine` für Schwellen und Marken sind dort fertig; der erste
Versuch war ein handgeschriebenes Inline-SVG (wie beim Höhenprofil der Leitung)
und brauchte für dasselbe mehr Höhe und eigene Beschriftungslogik. Die Kurve ist
jetzt 150 px hoch, ohne Legende: Die Karte trägt darüber schon Zahlen und
Zeilen, und die Reihen sind im Tooltip benannt.

Zwei Reihen auf gemeinsamen Stützstellen, `null` heißt „hier kein Wert": So
liegt die gestrichelte Fortschreibung genau zwischen letztem Messwert und
Schwelle, ohne die durchgezogene Linie zu verlängern. Die Zeitachse bekommt
feste Grenzen (`min`/`max`) statt der Spanne der Messwerte — die Marken für
Drittel und rechnerisches Ende liegen in der Zukunft und wären sonst
abgeschnitten.

Das Modell liegt getrennt von der Zeichnung, weil dort die Aussagen stehen:
welcher Wert gemessen und welcher fortgeschrieben ist, wie weit die Achse
reicht. Eine gestauchte Druckachse macht aus einem harmlosen Verbrauch einen
Sturz, deshalb beginnt sie immer bei 0. Gezeichnet wird erst ab dem zweiten
Punkt — eine Grafik mit einem Punkt darin nimmt nur Platz weg. Der Test der
Komponente mockt die Bibliothek (wie die übrigen Chart-Tests, JSDOM hat keinen
`ResizeObserver`) und prüft die Verdrahtung: welche Werte in welche Reihe gehen
und welche Marken entstehen.

### Sekunden werden nicht abgeschnitten

`datetime-local` kennt nur Minuten. Die Dialoge für Abmarsch, Rückkehr und
Druckabfrage sind mit der aktuellen Zeit vorbelegt und schrieben diesen
gerundeten Wert auch dann, wenn niemand das Feld angefasst hatte — bis zu 59
Sekunden Fehler an jedem Ankerpunkt. Beim Abmarsch hängt daran jede weitere
Rechnung, und bei zwei kurz aufeinanderfolgenden Druckabfragen verschiebt eine
Minute den gemessenen Verbrauch erheblich (bei einem Standardgerät sind 8 bar
eine Minute).

Deshalb merken die Dialoge, ob die Zeit **von Hand** geändert wurde: Unverändert
gilt der genaue Zeitpunkt des Speicherns samt Sekunden, geändert der eingetippte
Wert. Die Druckabfrage schickt dann gar kein `zeitpunkt`-Feld, und
`buildDruckabfrage` nimmt `jetzt`.

### Der angetretene Rückzug beendet die Warnungen

Neben der Ankunft am Einsatzziel gibt es die Gegenmeldung: **„Trupp hat den
Rückzug angetreten"** — ein Feld an der Druckabfrage (`rueckzug`), weil die
Meldung „wir kommen zurück" über Funk zusammen mit einem Flaschendruck kommt und
genau dieses Paar eine Druckabfrage ist. Ein eigener Zeitstempel am Trupp wäre
eine zweite Wahrheit über denselben Funkspruch.

Ab dieser Meldung schweigen **alle** Warnungen (`faelligeWarnungen` liefert eine
leere Liste, `naechsteWarnung` plant keinen Termin mehr). Der Grund: Alle drei
Warnungen zielen darauf, den Trupp zum Umkehren zu bringen. Er kehrt um — eine
Meldung „Rückzug überfällig" wäre jetzt ein Fehlalarm, und ein Fehlalarm
entwertet jede weitere Warnung.

Beobachtet wird weiter, nur anderes: Die Karte zeigt statt der Frist „Rückzug
angetreten HH:MM" mit den Minuten seither, die Fortschreibung läuft auf die
Restdruckwarnung zu, und `dringlichkeit` richtet sich nach der Reserve —
`achtung`, solange der Trupp über 55 bar hat, `kritisch` darunter. Ausdrücklich
nicht `ok`: Der Trupp atmet weiter aus der Flasche, und eine grüne Karte hieße
„hier ist nichts zu tun".

Wie bei der Ankunft ist der Haken **nicht** vorbelegt, solange der Rückzug nicht
gemeldet ist: Er beendet die Warnungen, und das darf nicht aus Versehen
passieren. Ist er gemeldet, entfällt er — ein zweites „Rückzug angetreten" gibt
es nicht, und jede weitere Abfrage kommt aus dem Rückmarsch.

Auf dem Rückweg entfällt auch der Hinweis **„Keine Ankunftsmeldung"**. Er zielt
darauf, eine Ankunft nachzutragen, damit sich der Rückmarschdruck aus dem
doppelten Vormarschdruckabfall rechnen lässt; sobald der Trupp zurückkommt, ist
das erledigt. Er fragt außerdem nach der **Meldung** und nicht nach dem Druck:
Seit die Ankunft auch ohne Zahl gemeldet werden kann, sind das zwei
verschiedene Dinge, und an `druckAmZiel` gehängt stand der Hinweis an einem
Trupp, dessen Ankunft längst erfasst war.

### Die Anzeige nennt die Grundlage der Schätzung

Links vom vermuteten Druck steht der **Abmarsch** mit „seit *n* min", und unter
dem vermuteten Druck, ab welchem Messwert er fortgeschrieben ist
(`stand.letzterPunkt`). Beides ist kein Zierrat: Der vermutete Druck ist eine
Rechnung, und wie weit man ihr trauen kann, hängt genau daran — ein Wert, der
auf einer halben Stunde alten Ablesung beruht, ist etwas anderes als einer von
vor zwei Minuten. Wer nur die Zahl sieht, kann das nicht unterscheiden.

## Der Gerätesatz kommt aus dem eigenen Bestand

Vorbelegt wird aus den erfassten Flaschen der Gruppe: der häufigste Satz aus
`volumenLiter` und `nenndruck` der aktiven Geräte vom Typ `flasche`
(`vorgabeGeraetesatz`). Welche Flasche eine Wehr fährt, steht in ihren
Stammdaten, und eine dort abgelesene Vorbelegung ist genauer als jede Annahme im
Code. **Ohne erfasste Flaschen** — der Zustand jeder Feuerwehr am Tag der
Auslieferung — bleibt der Standard-Pressluftatmer mit 1×6 l / 300 bar, und die
Rechnung läuft trotzdem.

Am Trupp wählbar sind die drei Sätze, die FH-06 selbst durchrechnet, plus
„eigene Werte". Jeder weitere Eintrag wäre eine Behauptung darüber, was eine
Feuerwehr fährt.

## Geräte am Trupp: erst der Trupp, später die Person

Zu einem Trupp lassen sich Flaschen, Masken und Pressluftatmer hinterlegen — per
Scan oder Eingabe, über dieselben sechs Kennungen wie die Flaschensuche am
Sammelplatz (siehe [atemschutzsammelplatz.md](atemschutzsammelplatz.md)).

Die Zuordnung Gerät → Person ist **nicht Pflicht**: Beim Abmarsch steht selten
fest, wer welche Flasche aufnimmt; wer das erzwingt, hält den Trupp auf oder
bekommt einen erfundenen Namen. Nachgetragen wird bei der Rückkehr — damit steht
fest, welche Flasche im Einsatz war und gefüllt werden muss.

„Getragen von" ist eine **Auswahl aus den Mitgliedern dieses Trupps** und kein
Freitextfeld mit Vorschlägen aus dem ganzen Einsatz. Die weite Liste war die
falsche Menge: Ein Gerät trägt jemand aus diesem Trupp, jeder andere Name ist
keine Hilfe, sondern eine Fehlerquelle — auf dem Telefon liegt der falsche Name
einen Fingerbreit neben dem richtigen, und eine falsche Zuordnung Flasche →
Person fällt erst im Füllprotokoll auf, wenn niemand mehr weiß, wer sie
getragen hat. Zwei Einträge stehen trotzdem neben den Mitgliedern: „nicht
zugeordnet", weil die Zuordnung freiwillig bleibt und ein versehentlich
gesetzter Träger zurücknehmbar sein muss, und ein bereits erfasster Name, der
nicht (mehr) im Trupp steht — sonst verschwände er stillschweigend aus dem Feld,
sobald jemand die Mitgliederliste ändert.

Auf der Karte steht die Ausrüstung **nach Träger gebündelt**, eine Zeile je
Person (`gruppiereTruppGeraete`): Gefragt ist „was trägt Huber?" und nicht „was
wurde als Drittes gescannt". Bei einem Trupp zu drei Personen mit Flasche, Maske
und Gerät standen sonst neun Angaben mit angehängten Namen in einem Absatz.
Sortiert wird nach Person, innerhalb der Person nach Gerätetyp (Reihenfolge von
`ATEMSCHUTZ_GERAET_TYPEN`, also Flasche und Maske vor dem Zubehör) und dann nach
der Beschriftung — die mit der Kennung beginnt, womit die Flaschen nach
Flaschennummer stehen. Gruppiert wird ohne Rücksicht auf Groß- und
Kleinschreibung: Ältere Zuordnungen kommen aus einem Freitextfeld, und „huber"
und „Huber" sind derselbe Mann. Die noch **nicht zugeordnete** Ausrüstung steht
am Ende — sie ist eine offene Aufgabe und kein Träger; zwischen den Namen läse
sie sich wie eine Person.

Im Bearbeiten-Dialog bleibt die **Erfassungsreihenfolge**: Dort wird gescannt,
und eine Liste, die sich nach jeder Personenwahl neu sortiert, verschiebt die
Zeile unter dem Finger.

Bezeichnung und Kennung werden aus den Stammdaten **kopiert**: Ein Jahr später
soll noch dastehen, welche Flasche gemeint war, auch wenn der Stammdatensatz
umbenannt oder ausgeschieden wurde. Eine Fremdflasche ohne Stammdatensatz bleibt
erfassbar, dann trägt die Kennung allein.

## Warnungen: serverseitig, mit Buchführung am Dokument

Drei Warnungen, in dieser Reihenfolge der Dringlichkeit:

| Schlüssel | wann | Grundlage |
| --- | --- | --- |
| `drittel` | nach ⅓ der erwarteten Einsatzzeit, wenn seit dem Abmarsch keine Druckabfrage erfasst wurde | „Erfolgt nach einem Drittel der zu erwartenden Einsatzzeit keine Lage- und Flaschendruckmeldung durch den Trupp, hat die mit der Atemschutzüberwachung betraute Person die Flaschendrücke abzufragen." |
| `zweiDrittel` | nach ⅔, wenn seit der ⅓-Marke keine Abfrage kam | Erinnerung je Drittel ohne Meldung |
| `rueckzug` | 1 Minute vor dem prognostizierten Rückzugszeitpunkt | 5.3.2 |

Eine erfasste Druckabfrage **ist** die Lage- und Flaschendruckmeldung — deshalb
schweigt die Überwachung, sobald eine vorliegt.

**Warum serverseitig:** Die Fristen sind Vorschrift, und ein Gruppenkommandant
hat das Telefon in der Tasche, nicht die Seite offen. Eine Warnung, die nur
kommt, solange jemand hinsieht, ist für eine Sicherheitsfunktion keine.

### Der Vorlauf ist eine Minute, die Farbe drei

Zwei Zahlen, weil sie Verschiedenes tun. `RUECKZUG_VORLAUF_MIN` = 1 ist der
Vorlauf der **Meldung**: Er soll für das Absetzen einer Funkmeldung reichen und
nicht mehr. Vorher standen dort drei Minuten — bei rund 25 Minuten rechnerischer
Einsatzdauer ein Achtel, und die Meldung („Rückzugszeitpunkt erreicht — Trupp
zum Rückzug auffordern") wurde als „jetzt umkehren" gelesen. Damit nahm der
Vorlauf Einsatzzeit, ohne den Rückzugszeitpunkt zu verschieben.

`KRITISCH_AB_MIN` = 3 ist die **Farbe** der Karte. Sie warnt still und fordert
niemanden zum Umkehren auf; hinge `kritisch` am Vorlauf, würde die Karte erst in
der letzten Minute rot. Zwischen drei und einer Minute steht die Karte damit rot,
ohne dass eine Benachrichtigung hinausgeht — und wenn die Rückzugswarnung kommt,
ist die Karte immer schon `kritisch` oder `ueberschritten`. Das ist gewollt: Eine
Meldung, die bei gelber Karte einträfe, wäre ein Widerspruch. Die
Drittel-Erinnerungen können weiter bei `ok` oder `achtung` kommen — sie hängen an
der Meldedisziplin, nicht an der Restzeit.

Solange der Zeitpunkt nicht erreicht ist, sagt die Meldung „Rückzugszeitpunkt in
n min — Trupp vorwarnen" und ist orange; ab dem Zeitpunkt „erreicht seit n min —
Trupp zum Rückzug auffordern" und rot (`istVorwarnung`). Ein roter Fehler-Alert
mit dem Wort „vorwarnen" wäre ein Widerspruch in sich.

### Eine überholte Drittelmarke warnt nicht mehr

Liegt eine ⅓-/⅔-Marke **hinter** dem prognostizierten Rückzugszeitpunkt, ist sie
überholt: Der Trupp ist dann längst zum Umkehren aufgefordert, und eine
Erinnerung „keine Meldung nach einem Drittel" wäre ein Fehlalarm. Beobachtet in
dev lag die ⅓-Marke bei 7,5 min, der Rückzug bei 4,3 min. `faelligeWarnungen` und
`naechsteWarnung` überspringen solche Marken.

Die Marken selbst bleiben **fest** ab Abmarsch mit 50 l/min — die Begründung
oben gilt unverändert — und stehen weiter in `UeberwachungStand`, also in Karte
und Druckverlauf-Grafik. Dass eine Marke hinter dem Rückzug liegt, ist die
Information, dass der Verbrauch die erwartete Dauer überholt hat; sie soll nicht
verschwinden.

Folge für die Terminplanung: Liegen beide Marken hinter dem Rückzug, plant
`naechsteWarnung` nach der Rückzugswarnung keinen Termin mehr. Das ist richtig —
der Rückzug war die letzte Aussage, die die Rechnung zu machen hat — und spart
Cloud-Tasks-Termine. Eine Eskalation „Zeitpunkt überschritten und keine
Rückzugsmeldung" gibt es bewusst nicht.

### Auf der Seite eine Snackbar, nicht nur eine Benachrichtigung

`useUeberwachungHinweise` stieg vorher **vor** allem anderen aus, wenn
`Notification.permission` nicht `granted` war. Ohne erteilte Erlaubnis wurde
damit nicht einmal gerechnet, und auf der offenen Seite war von einer fälligen
Warnung nichts zu sehen — bei einer Sicherheitsfunktion die falsche Reihenfolge.
Jetzt ist die Anzeige auf der Seite der verlässliche Weg: Hinweise werden immer
gerechnet und vermerkt, die dringlichste geht als Snackbar hinaus, und die
Systembenachrichtigung ist die Zugabe für Geräte mit Erlaubnis — sie erreicht den
gesperrten Bildschirm, die Snackbar nur die offene Seite.

Nur die **dringlichste** je Tick, wie im Serverlauf: Drei Snackbars übereinander
sind keine Meldung mehr. Vermerkt werden trotzdem alle, sonst käme die überholte
Erinnerung im nächsten Tick nach. Die übrigen stehen als Alert auf ihrer
Trupp-Karte.

Die Snackbar **verschwindet von selbst** — 10 s beim Rückzug, 6 s bei den
Erinnerungen. Am Telefon verdeckt eine stehende Snackbar die Karte darunter, und
genau die trägt die Zahlen. Die Dauer gibt der Aufrufer mit und ist nicht an der
`severity` festgemacht: Der globale `SnackbarProvider` lässt `warning` und
`error` bewusst stehen, und das soll für seine 23 übrigen Aufrufer so bleiben.

### Der Push-Hinweis fragt nicht zweimal

Ob Benachrichtigungen erlaubt sind, steht am **Gerät** und nicht in der Sitzung
(`useNotificationPermission`). Vorher merkte die Seite nur, ob in *dieser*
Sitzung jemand auf „Benachrichtigungen einschalten" gedrückt hatte — nach jedem
Neuladen stand die Aufforderung wieder da, obwohl die Erlaubnis längst erteilt
war.

Gelesen wird über `useSyncExternalStore` und nicht in einem Effekt mit
`setState`: Der Wert kommt von außerhalb von React, darf beim Server-Rendern
nicht gelesen werden, und `react-hooks/set-state-in-effect` verbietet die naive
Variante ohnehin. Der Schnappschuss liegt in einer Modulvariablen — eine
Erlaubnis gilt für das ganze Gerät, nicht je Komponente. In der **App** fragt
der Hook das Betriebssystem (`AppPermissions.checkPermission`) und nicht die
WebView: Dort steht `Notification.permission` oft auf `default`, obwohl die App
die Erlaubnis hat.

Der Hinweis erscheint nur, wenn etwas zu tun oder zu wissen ist: bei erteilter
Erlaubnis **nichts** (die Bestätigung kommt einmal kurz als Einblendung), bei
`denied` ohne Knopf — der Browser fragt nach einer Ablehnung nicht wieder, das
geht nur über seine Website-Einstellungen. Solange die Erlaubnis noch nicht
gelesen ist, steht ebenfalls nichts da, sonst blitzte die Aufforderung beim
Laden auf.

Ist die Erlaubnis schon erteilt, holt die Seite den Push-Token ohne Zutun nach.
Ohne das hätte ein Gerät die Erlaubnis, aber keinen registrierten Token — die
Warnung käme dann nur, solange die Seite offen ist.

### Drei Wege, und warum es alle drei gibt

Gewarnt wird auf **drei** Wegen, die dasselbe rechnen und sich nicht ersetzen:

1. **Der Termin.** Sobald ein Trupp abmarschiert ist, legt die App eine
   Cloud-Tasks-Aufgabe auf den Zeitpunkt der nächsten Warnung. Das ist der
   Hauptweg; der Push geht an die Geräte in `ueberwachungUids`, auch an die mit
   geschlossener Seite.
2. **Das Netz.** Ein Zeitplan alle zehn Minuten sucht dieselben Fristen ab und
   plant fehlende Aufgaben nach — für den Fall, dass gar keine entstanden ist.
3. **Die offene Seite** zeigt die Warnung selbst an
   ([useUeberwachungHinweise.ts](../src/components/Atemschutz/useUeberwachungHinweise.ts)),
   zusätzlich zur Meldung auf der Karte.

Der dritte Weg ist nachgezogen worden, weil die ersten zwei an einer langen
Kette hängen: Zeitplan oder Queue, ein registrierter Push-Token, die Erlaubnis
des Browsers. Fehlt ein Glied, kommt **nichts** — und in der Entwicklung fehlt
beides grundsätzlich, weshalb dort siebzehn Minuten unter Atemschutz keine
einzige Meldung ergaben. Die geöffnete Seite rechnet die Fristen ohnehin jede
Sekunde mit; sie darf das Ergebnis auch sagen.

Zwei Feinheiten, ohne die es Doppelmeldungen oder stille Löcher gäbe:

- **Beide Wege verwenden denselben `tag`** (`asue-<truppId>`). Trifft der Push
  ein, während die Seite offen ist, ersetzt die eine Benachrichtigung die
  andere, statt sich darunter zu stapeln.
- **Die Seite vermerkt nichts am Dokument.** `warnungen.<key>` gehört dem
  Zeitplan; schriebe der Browser dort mit, unterdrückte er den Push an alle
  *anderen* Geräte — genau die, die die Seite nicht offen haben. Was dieses
  Gerät schon gezeigt hat, merkt es sich nur bei sich (ein `useRef`, das mit der
  Seite verschwindet).

Die Seite fragt auch **nicht von selbst** nach der Erlaubnis für
Benachrichtigungen: Ein Dialog, der aus einem Zeitgeber aufgeht, kommt ohne
Zusammenhang. Stattdessen steht ein Hinweis mit der Schaltfläche
„Benachrichtigungen einschalten" oben auf der Seite — dauerhaft und nicht nur
bei fehlender Erlaubnis, weil `Notification.permission` beim Rendern nicht
gelesen werden kann, ohne dass Server- und Client-Render auseinanderlaufen.
Erlaubnis und Token werden außerdem beim **Übernehmen** und beim **Erfassen
eines Trupps** geholt: Wer hier einen Trupp anlegt, überwacht ihn ab sofort —
ohne den zweiten Aufruf hätte ein Trupp, der nie über eine Übernahme lief,
weder Erlaubnis noch Token.

### Die Terminplanung (Cloud Tasks)

Zuerst lief das anders: Cloud Scheduler rief **jede Minute**
`POST /api/atemschutz/ueberwachung-check` auf. Das war ehrlich gerechnet
Verschwendung — rund 44.000 Läufe im Monat, die fast immer null Trupps fanden,
für ein paar Warnungen im Jahr. Die Termine stehen aber fest, sobald ein Trupp
abmarschiert ist: Drittel, zwei Drittel und der Rückzugszeitpunkt mit Vorlauf
lassen sich ausrechnen (`naechsteWarnung`). Statt nachzusehen liegt deshalb eine
Aufgabe auf genau diesem Zeitpunkt
([ueberwachungTasks.ts](../src/server/atemschutz/ueberwachungTasks.ts)).

Beide Aufrufer treffen denselben Endpoint mit einem OIDC-Token **desselben**
Invoker-Service-Accounts wie der Fahrtenbuch-Wochenbericht (dessen Name deshalb
historisch „fahrtenbuch" heißt). Die Queue liegt im Modul
[cloud-scheduler](../terraform/modules/cloud-scheduler), obwohl sie kein
Scheduler ist: Dort steht das Konto samt seiner `run.invoker`-Bindung, und ein
eigenes Modul müsste es übergeben oder duplizieren.

Was daran zu wissen ist:

- **Immer nur eine Aufgabe je Trupp.** Die Zeitpunkte verschieben sich, sobald
  eine Druckabfrage den gemessenen Verbrauch ändert oder der Gerätesatz
  korrigiert wird. Drei Aufgaben im Voraus wären nach der ersten Meldung drei
  falsche Termine. Der Lauf zum Termin plant die nächste selbst — die Kette
  hängt sich damit immer an den aktuellen Stand.
- **Der Aufgabenname ist die Dublettensperre**
  (`asue-<truppId>-<warnung>-<terminminute>`). Ein zweiter Aufruf mit demselben
  Ergebnis läuft in `ALREADY_EXISTS`, und das ist der Regelfall: Jeder
  Schreibvorgang plant neu. Die Minute und nicht die Sekunde, weil zwei Aufrufe
  kurz hintereinander denselben Termin mit Millisekundenunterschied ausrechnen.
- **Ein Termin zu früh ist harmlos, ein Termin zu spät gibt es nicht.**
  Verschiebt sich eine Frist nach hinten, bleibt die überholte Aufgabe stehen;
  sie läuft an, findet über `offeneWarnungen` nichts Fälliges und plant nur neu.
  Ob eine Drittelmarke wirklich zuschlägt, hängt daran, ob bis dahin eine
  Meldung kommt — das lässt sich nicht vorhersagen und wird deshalb erst zur
  Laufzeit entschieden.
- **Der Lauf bleibt ein Rundumblick** über alle Trupps im Einsatz und bearbeitet
  nicht den Trupp aus der Aufgabe. Der Rumpf der Aufgabe trägt dessen ID nur
  fürs Log. So repariert jeder Lauf auch das, was eine verlorene Aufgabe
  hinterlassen hätte.
- **Geplant wird serverseitig aus dem gelesenen Dokument.** Der Client schreibt
  direkt in Firestore und ruft danach eine Server Action
  ([ueberwachungTaskAction.ts](../src/components/Atemschutz/ueberwachungTaskAction.ts));
  die liest den Trupp selbst nach. Aus seinen Zeiten entsteht der Termin einer
  Sicherheitswarnung, und den soll der Aufrufer nicht bestimmen können.
- **Nichts weiter als einen Tag im Voraus.** `abmarschZeit` kommt aus einem
  Formularfeld; ein vertipptes Datum ergäbe eine Aufgabe, die in Wochen anläuft.
- **Ohne Queue wird nicht geplant** (`notConfigured`), und das ist kein Fehler:
  Lokal gibt es keine, und dort warnt die offene Seite. Die beiden
  Umgebungsvariablen dafür sind `ATEMSCHUTZ_TASKS_QUEUE` und
  `ATEMSCHUTZ_TASKS_INVOKER`.
- **Zwei Rechte, nicht eines.** Das Laufzeit-Konto des Dienstes braucht
  `roles/cloudtasks.enqueuer` an der Queue **und**
  `roles/iam.serviceAccountUser` am Invoker — ohne das zweite lehnt Cloud Tasks
  das Anlegen mit `PERMISSION_DENIED` ab, obwohl das Recht an der Queue stimmt.
- **Die Aufgabe wird wiederholt** (fünf Versuche, 10–60 s Backoff). Der Endpoint
  ist idempotent, weil jede verschickte Warnung am Dokument vermerkt ist; ein
  500 aus einem kalten Start darf keine Sicherheitswarnung verschlucken. Der
  Netz-Zeitplan wiederholt dagegen **nicht** — er kommt in zehn Minuten wieder.

Details des Laufs selbst, die nicht offensichtlich sind:

- **Der Zeitplan ist das Netz, nicht der Hauptweg** (`ueberwachung_schedule`,
  alle zehn Minuten). Für die Genauigkeit zählt er nicht mehr — der Termin liegt
  auf die Sekunde. Er fängt den Fall, dass beim Abmarsch gar keine Aufgabe
  entstanden ist: Funkloch, geschlossene App, ein Fehler in der Queue.
- **Die Abfrage ist eine Collection-Group-Abfrage** auf `atemschutzTrupp` mit
  `where('status','==','imEinsatz')`. Ein einzelnes Feld, deshalb genügt der
  automatische Index; außerhalb eines Einsatzes liefert sie null Dokumente.
- **Empfänger sind `ueberwachungUids`** — wer die Zeitkontrolle übernommen oder
  eine Druckabfrage erfasst hat. Bewusst nicht alle Gruppenmitglieder: Eine
  Warnung, die jede Feuerwehrfrau und jeden Feuerwehrmann erreicht, ist nach dem
  zweiten Einsatz eine, die niemand mehr ansieht. Der Push-Token wird deshalb
  erst beim Übernehmen geholt — dann gehört die Frage des Browsers nach der
  Erlaubnis zu einer Handlung, die sie erklärt.
- **Verschickt wird nur die dringlichste** fällige Warnung, vermerkt werden
  alle offenen. Ein Gerät, das eine Weile aus war, hätte sonst drei Meldungen
  gleichzeitig, und die wichtigste ginge zwischen zwei Erinnerungen unter.
- **Ohne Empfänger wird nichts vermerkt.** Ein Gerät, das sich später
  registriert, soll die Warnung noch bekommen; der nächste Lauf kostet ohne
  Empfänger nichts.
- **Die Buchführung steht am Dokument** (`warnungen.<key>`, per Punktpfad
  geschrieben, damit die anderen Einträge unberührt bleiben). Ohne sie käme jede
  Warnung mit jedem Lauf erneut — und sie entscheidet zugleich, welcher Termin
  als nächster geplant wird. Deshalb trägt der Lauf den Vermerk auch am
  gelesenen Objekt nach, bevor er plant.
- **Die Empfängerliste ist eine Sicherheitsgrenze.** `ueberwachungUids` steht am
  Trupp-Dokument, und schreiben darf sie jeder, der am Einsatz schreiben darf
  (`call/{id}/{subitem=**}` in den Firestore-Regeln) — einschließlich eines
  Einsatz-Gastes mit Schreibrecht. Der Lauf setzt daraus `user/{uid}` zusammen,
  und deshalb wird beim **Lesen** bereinigt (`sanitizeUeberwachungUids`), nicht
  nur beim Schreiben: Ein Eintrag mit Schrägstrich zeigte auf ein anderes
  Dokument (`user/foo/geheim/bar` statt `user/foo`), `.` und `..` ließen das SDK
  werfen — und dieser Wurf käme von außerhalb der Fehlerbehandlung je Trupp und
  hielte die Warnungen aller anderen Trupps auf. Deshalb liegt auch das Lesen
  der Token inzwischen *innerhalb* dieser Fehlerbehandlung. Zahl der Einträge
  und Zahl der Token sind ebenfalls gekappt (`MAX_UEBERWACHUNG_UIDS`,
  500 Token — mehr weist `sendEachForMulticast` komplett ab).
- **`sendEachForMulticast` wirft nicht, wenn alle Token abgelehnt werden.** Es
  meldet das in `successCount`. Ohne diese Prüfung wäre die Warnung als
  verschickt vermerkt, obwohl sie kein Gerät erreicht hat, und ginge nie wieder
  hinaus — bei einer Sicherheitsfunktion die falsche Richtung. Kam nichts durch,
  bleibt die Warnung offen.
- **Verschickt und nicht vermerkt ist ein eigener Zustand** (`sentUnrecorded`).
  Scheitert der Vermerk *nach* erfolgreichem Versand, geht die Warnung beim
  nächsten Lauf erneut hinaus; als `failed` gemeldet sähe genau das wie „nie
  verschickt" aus und die Wiederholung wäre nicht erklärbar.
- **Der Lauf rechnet ohne die Bestandsvorgabe.** `berechneStand` fällt dort auf
  den Standard-Pressluftatmer zurück, während die Seite den häufigsten Satz aus
  dem Flaschenbestand nimmt. Das fällt nicht auf, weil eine Warnung nur an
  Geräte geht, die die Zeitkontrolle übernommen haben — und dabei wird der
  Gerätesatz am Trupp festgeschrieben. Wer das ändern will, müsste je Einsatz
  die Gerätestammdaten der Gruppe nachlesen; das ist eine Abfrage je Einsatz für
  einen Fall, den es nicht gibt.
- **Ein gelöschter Einsatz wird übersprungen.** Dass ein Trupp darin noch auf
  `imEinsatz` steht, heißt nur, dass niemand ihn eingerückt hat.

Der Text der Benachrichtigung kommt fertig vom Server, aus dem **deutschen**
Katalog: Aufrufer ist der Zeitplan und nicht ein Browser mit Sprache — dieselbe
Vereinfachung wie beim Wochenbericht. Der Service Worker hat keinen
Übersetzungskatalog und würde einen Schlüssel anzeigen.

## Der Service Worker unterscheidet die Nutzlast

Der Worker hat bisher **jede** Data-Message als Chat-Nachricht angezeigt. Eine
Atemschutzwarnung erschiene damit als „Einsatz Chat: undefined". Deshalb trägt
sie `kind: 'asue'` ([atemschutzPush.ts](../src/common/atemschutzPush.ts)), und
der Worker prüft das zuerst. Die Nutzlast ist bewusst rein und ohne Import auf
Firestore oder `firebase-admin` — der Worker könnte das nicht bündeln.

Zwei Details in der Anzeige: `tag` ist **je Trupp** gesetzt, damit eine neue
Warnung die alte ersetzt statt sich darunter zu stapeln, und
`requireInteraction` nur bei `rueckzug` — die Sicherheitsmeldung soll nicht von
selbst verschwinden, die Erinnerungen dürfen es. Der Klick führt über
`notification.data.url` auf die Überwachungsseite des Einsatzes; vorher stand
dort fest `/chat`. Siehe auch
[service-worker-pwa.md](service-worker-pwa.md).

## Der Einsatzauftrag

Am Sammelplatz wird ein Trupp einer Einheit **zugeteilt** — er ist dann
`zugeteilt` und rüstet sich aus. Unter Atemschutz geht er erst mit dem
**Einsatzauftrag** der Einheit, und der hat einen eigenen Dialog:
[EinsatzauftragDialog.tsx](../src/components/Atemschutz/EinsatzauftragDialog.tsx).

Warum nicht derselbe Dialog wie am Sammelplatz: Die beiden tun verschiedene
Dinge. Der Sammelplatz bucht eine Ressource um und weiß weder Auftrag noch Ziel
— er entsendet einen Trupp nur *zu einer Einheit*. Die Einheit gibt den Befehl.
Ein Dialog, der sich je nach Aufrufer anders beschriftet und einen anderen
Patch schreibt, war einer zu wenig.

Sechs Felder, in der Reihenfolge, in der der Befehl gegeben wird:

| Feld | Bedeutung |
| --- | --- |
| Taktische Einheit | Zuordnung, vorbelegt aus `entsendetAn` oder dem Reiter |
| **Auftrag** | Das WAS — „Menschenrettung", „Brandbekämpfung", „Erkundung" |
| **Einsatzziel und -ort** | Das WO — „Keller Stiegenhaus links" |
| Überwachung durch | Wer die Zeitkontrolle führt, als Klartext |
| Abmarsch | „Uhrzeit beim Anschließen des Luftversorgungssystems" (FH-06) |
| Druck beim Abmarsch | Vorbelegt aus `druckUebergabe` — dazwischen ändert er sich nicht |

`auftrag` und `einsatzziel` sind zwei Felder und nicht eines: In FH-06 sind das
die zwei Teile desselben Befehls. Beide sind Freitext — eine Auswahlliste wäre
eine Behauptung darüber, welche Aufträge es gibt.

Der Gerätesatz fehlt bewusst. Im Regelfall ist er die Vorgabe aus dem eigenen
Flaschenbestand, und wenn er abweicht, steht er im Übernahme-Dialog. Sechs
Felder sind schon viel für ein Formular, das jemand mit Handschuhen bedient.

**Der Auftrag übernimmt zugleich die Zeitkontrolle** — `ueberwachungSeit` und
die eigene `uid` in `ueberwachungUids`, siehe „Was ‚Trupp übernehmen' tut". Erst
danach holt die Seite den Push-Token: Die Erlaubnisfrage des Browsers gehört zu
einer Handlung, die sie erklärt.

Ein schon gesetztes Ziel wird durch ein leeres Feld **nicht** gelöscht:
`entsendePatch` lässt das Feld aus dem Patch weg, wenn es leer ist.

„Abmarsch erfassen" hieß der Knopf einmal und klang nach reiner Dokumentation —
als würde etwas nachgetragen, was schon passiert ist. Er schickt den Trupp aber
wirklich in den Einsatz und startet die Zeitkontrolle, und genau das sagt er
jetzt: **„In den Einsatz schicken"**.

### Zugeteilt und bereit stehen zusammen

Auf dieser Seite stehen `bereit` und `zugeteilt` unter einer Überschrift: Aus
Sicht der Zeitkontrolle wartet beides auf den Einsatzauftrag. Der Unterschied —
hat schon eine Einheit oder nicht — steht auf der Karte, nicht in der
Überschrift. Am Sammelplatz liegt die Grenze genau andersherum: Dort stehen
`zugeteilt` und `imEinsatz` zusammen, weil der Trupp in beiden Fällen weg ist.

Ein zurückgekehrter Trupp kann über **„Bereit zum Abmarsch"** wieder auf
`zugeteilt` gesetzt werden — als neue Zeile (`naechsteZuteilung`). Das ist der
Weg ohne Sammelplatz: Die Einheit behält den Trupp, lässt ihn regenerieren und
schickt ihn später erneut. `ueberwachungBis` bleibt dabei ungesetzt, die
Zeitkontrolle wechselt nicht.

## Was ins Einsatztagebuch geht

Vier Ereignisse, jedes genau einmal je Bereitstellung: **Einsatzauftrag**,
**Ankunft am Einsatzziel**, **Rückzug angetreten**, **Rückkehr**. Sie sind
einsatzrelevant und gehören damit in das Dokument der Einsatzleitung.

Dazu die **freie Statusmeldung**: Im Dialog „Druckabfrage / Status" gibt es den
Haken *Eintrag ins Einsatztagebuch*, vorbelegt **aus**. Eine gewöhnliche
Zwischenabfrage ist Sache der Zeitkontrolle, nicht der Einsatzleitung; stünde
jede darin, gingen die vier wichtigen Zeilen unter. Bei einer neu gemeldeten
Ankunft oder einem neu gemeldeten Rückzug ist der Haken gesetzt **und
gesperrt** — der Eintrag entsteht ohnehin, und ein Dialog, der ihn verneint,
wäre eine Überraschung. Eine Meldung, die zugleich Ankunft oder Rückzug ist,
erzeugt dann nur die eine Zeile: Zwei oder drei Einträge über denselben
Funkspruch sind zwei zu viel.

Nicht ins Tagebuch gehen die Zuteilung durch den Sammelplatz, die Übergabe
zurück an den Sammelplatz und die Wiederbereitstellung. Das sind
Ressourcenbuchungen, keine Einsatzereignisse.

Gebaut wird der Text in
[truppDiaryEntry.ts](../src/components/Atemschutz/truppDiaryEntry.ts) — rein
und ohne React, die Wörter kommen als Labels vom Aufrufer (dasselbe Muster wie
`buildFoerderungDiaryEntry`). Geschrieben wird er in
[useTruppTagebuch.ts](../src/components/Atemschutz/useTruppTagebuch.ts), den
beide Seiten benutzen: Die Rückkehr eines Trupps ist dasselbe Ereignis, egal ob
sie am Sammelplatz oder bei der Einheit erfasst wird.

**Der Merker `tagebuch` steht am Dokument**, nicht im Code — aus demselben
Grund wie `warnungen`: Zwei Geräte sehen denselben Trupp, und ohne diese
Buchführung entstünde der Eintrag ein zweites Mal, sobald jemand einen Dialog
erneut speichert. Geschrieben wird er als **Punktpfad** (`tagebuch.amZiel`,
`tagebuchVermerk`): Ein ganzes `tagebuch`-Objekt zu schreiben löschte den
Schlüssel, den ein zweites Gerät eine Sekunde vorher gesetzt hat.

Die freie Statusmeldung bekommt keinen Merker — ein zweiter Haken ist eine
zweite Meldung.

Schlägt der Eintrag fehl, wird er verschluckt und nur in der Konsole vermerkt.
Der Zustandswechsel oder die Druckabfrage sind zu dem Zeitpunkt schon
geschrieben, und ein fehlender Tagebucheintrag darf eine Druckabfrage nicht
mitreißen — dasselbe Muster wie bei `planeWarnung`.

## Überwachung ohne Übernahme

Wer „meine Einheit" gesetzt hat, ist für deren Trupps zuständig, ohne dass
jemand „Trupp übernehmen" drückt: Die Seite trägt das eigene Konto still in
`ueberwachungUids` ein.

Nötig ist das für den **Push**. Die offene Seite warnt ohnehin
(`useUeberwachungHinweise` rechnet über `zuUeberwachen`), aber der Serverlauf
schickt nur an `ueberwachungUids` — ohne Eintrag bliebe das Telefon stumm,
sobald die Seite zu ist. Und genau dann soll es läuten.

Drei Schranken, damit ein Seitenaufruf nicht in den halben Einsatz schreibt:
nur Benutzer mit Schreibrecht, nur die jüngsten Zeilen (`trupps.aktuell`), nur
die nicht abgemeldeten. Dazu ein `useRef` mit den schon eingetragenen IDs —
ohne das liefe der Schreibvorgang bei jedem Tick der Uhr erneut, denn der
Effekt sieht seine eigene Wirkung erst, wenn Firestore sie zurückgespielt hat.

### Die taktische Einheit steht am Trupp

Getragen wird die Zuordnung von `entsendetAn` — **demselben** Feld, das der
Sammelplatz beim Entsenden füllt. Ein zweites Feld für „meine Einheit" wäre eine
zweite Wahrheit über dieselbe Frage: Ein Trupp gehört zu genau einer Einheit,
egal ob ihn der Sammelplatz dorthin geschickt hat oder ob die Einheit ihn selbst
ausgerüstet hat.

Zuerst war das Feld bei der Überwachung ausgeblendet, mit der Begründung, der
Gruppenkommandant habe niemanden, an den er den Trupp übergibt. Das war ein
Denkfehler: Die Angabe ist keine Übergabe, sondern die Zuordnung — und ohne sie
steht am Ende des Einsatzes an keinem Trupp, welche Einheit ihn hatte. Bei einem
Trupp, der nie über einen Sammelplatz lief, fehlte sie vollständig, und genau
das ist der Fall, für den die Seite gebaut ist: eine Einheit, die allein
arbeitet.

Gefragt wird an **drei** Stellen, weil der Trupp an dreien in die Hand genommen
wird: beim Erfassen (`TruppDialog`, nur bei der Zeitkontrolle — am Sammelplatz
steht dabei noch nicht fest, wohin er geht), beim Übernehmen der Zeitkontrolle
(`UeberwachungDialog`) und beim Einsatzauftrag (`EinsatzauftragDialog`).
Überall Freitext
mit Vorschlägen: Der Trupp geht meist zu einem Fahrzeug, manchmal zu einem
Gruppenkommandanten und gelegentlich zu einem Abschnitt, den es in keiner Liste
gibt. Leer heißt überall „nicht angefasst" und nie „löschen".

Die Vorschläge (`einheitOptionen` in
[einheiten.ts](../src/components/Atemschutz/einheiten.ts)) sind die am Trupp
schon vergebenen Einheiten **und** die Fahrzeuge und taktischen Einheiten des
Einsatzes. Nur die vergebenen wären beim ersten Trupp eine leere Liste — genau
dann, wenn die Einheit zu wählen ist; vorher konnte der Filter deshalb nie etwas
anderes als „alle Trupps" zeigen, solange niemand über einen Sammelplatz
entsendet hatte. Verglichen wird ohne Rücksicht auf Groß- und Kleinschreibung:
`entsendetAn` ist Freitext, und dasselbe Fahrzeug zweimal im Filter wären zwei
Ansichten desselben Einsatzes.

### Zwei Kategorien neben den benannten Einheiten

Ein Trupp ohne eingetragene Einheit ist nicht einfach „ohne Angabe" — es sind
zwei verschiedene Lagen, und `zuordnungKey` unterscheidet sie:

- **ASSP**: Den Trupp hat niemand übernommen (`!ueberwachungSeit`) oder er ist
  an den Sammelplatz zurückgegeben (`ueberwachungBis`). Dann ist er dort in
  Bereitschaft, wird regeneriert und ausgerüstet — eine gewöhnliche Station im
  Ablauf (FH-06 5.3.4), auf der Karte blau.
- **Nicht zugeordnet**: Jemand führt die Zeitkontrolle, hat aber nicht gesagt,
  für welche Einheit. Das ist eine Lücke im Protokoll und deshalb gelb.

Eine eingetragene Einheit gewinnt immer, auch nach der Rückgabe an den
Sammelplatz: Die Zeile ist der Nachweis über den Einsatz *dieser* Einheit und
soll in ihrem Protokoll stehen bleiben. Dass der Trupp danach zum Sammelplatz
ging, sagt der Chip „übergeben um …".

Der Zuordnungs-Chip steht deshalb **immer** im Kopf der Karte, auch ohne
Einheit: Eine leere Stelle wäre von „steht am Sammelplatz" nicht zu
unterscheiden.

### Ein Reiter je Einheit, nicht ein Filter über allem

Zuerst gab es einen Filter über der Liste, und Trupps ohne Zuordnung rutschten
durch jeden Wert davon durch — damit ein Trupp am Sammelplatz nicht unsichtbar
wird, wenn eine Einheit gewählt ist. Die Folge war schlimmer als das Problem:
„Zurück" und „Protokoll" änderten sich beim Wechsel der Einheit gar nicht, und
niemand konnte mehr sagen, welche Trupps die eigenen sind und welche irgendwo
sonst in Bereitschaft stehen.

Jetzt trennt `truppPasstZuEinheit` scharf, und die Einheiten sind **Reiter**
(`einheitTabs`): die eigene zuerst, dann die übrigen alphabetisch, dann ASSP und
Nicht-zugeordnet, zuletzt „Alle Trupps". Jeder Reiter trägt die Zahl der
aktuellen Bereitstellungen — über das Protokoll gezählt vervielfachte jeder
erneute Einsatz denselben Trupp. Der Reiter wirkt auf **alle** Abschnitte
einschließlich des Protokolls, und die Trupps des Sammelplatzes sind unter ihrem
eigenen Reiter zu finden, mit Anzahl.

In der Reiterzeile stehen nur Einheiten, an denen wirklich Zeilen hängen (plus
die eigene). Die Fahrzeuge des Einsatzes gehören in die **Wahl** der eigenen
Einheit, nicht in die Reiter: Das wären zwanzig Reiter, von denen neunzehn leer
sind.

Das **Protokoll** unter den drei Abschnitten ist eingeklappt (Accordion mit
`unmountOnExit`): Es wächst mit jeder Bereitstellung und schob die laufende Lage
nach oben aus dem Blick. Eingeklappt werden seine Karten samt ihrer Kurven auch
gar nicht gezeichnet.

Es zeigt außerdem nur, was oben **nicht** ohnehin steht — `gruppiereTrupps`
liefert dafür `frueher` neben `protokoll`. Vorher stand jeder Trupp unter
Atemschutz zweimal auf derselben Seite: oben in seinem Abschnitt und darunter
noch einmal als Protokollkarte, die nichts beitrug und die Seite doppelt so lang
aussehen ließ, wie der Einsatz ist. Übrig bleiben damit genau die Zeilen ohne
Karte oben: die älteren Bereitstellungen erneut entsendeter Trupps und die
abgemeldeten. Abgegrenzt wird über die Zeilen selbst und nicht über den Status —
ein abgemeldeter Trupp ist `aktuell`, hat oben aber keine Karte.

### „Meine Einheit" ist kein Filter

Die Auswahl über der Reiterzeile ist eine Angabe über *dieses Gerät*: Sie stellt
den eigenen Reiter voran, wählt ihn beim Laden aus, ordnet hier erfasste Trupps
zu und entscheidet, für welche Trupps die offene Seite selbst warnt. Angezeigt
wird, was der Reiter sagt.

Deshalb stehen dort **alle** Fahrzeuge und taktischen Einheiten des Einsatzes
zur Wahl (`einheitOptionen`) und nicht nur die mit Trupps: Die Einheit ist
festzulegen, *bevor* der erste Trupp erfasst ist. Ein hier erfasster Trupp
bekommt die Einheit des aktiven Reiters, sonst die eigene — wer unter „RLFA-ND"
einen Trupp anlegt, erwartet ihn dort und nicht unter einem Reiter, den er
gerade nicht ansieht.

Die **lokalen Warnungen** hängen bewusst nicht an der Ansicht: Ein Blick auf den
Reiter des Sammelplatzes darf die Warnungen der eigenen Trupps nicht
abschalten. Gewarnt wird für die Trupps der eigenen Einheit und für die, an
denen dieses Konto schon gearbeitet hat (`ueberwachungUids` — dieselbe Liste,
die auch der Push-Versand verwendet). Ohne festgelegte eigene Einheit bleibt es
bei allen Trupps im Einsatz: Wer die Gesamtlage offen hat, soll nicht weniger
sehen als vorher.

### Ein zurückgekehrter Trupp geht in einem Schritt wieder hinein

Am Sammelplatz führt der Weg über „Wieder bereitstellen": Dort wird der Trupp
regeneriert, ausgerüstet und *später* von jemand anderem entsendet — der
Zwischenzustand „bereit" ist dort die eigentliche Aussage. Bei der Zeitkontrolle
ist er einer zu viel: Der Gruppenkommandant schickt denselben Trupp wieder
hinein, und eine Zeile, die „bereit" behauptet, während der Trupp unter
Atemschutz steht, ist schlimmer als ein gesparter Klick. Deshalb gibt es an
einem zurückgekehrten Trupp **„Erneut in den Einsatz schicken"**
(`erneuterEinsatz`), und das legt in einem Schritt eine neue Bereitstellung mit
Zustand `imEinsatz` an.

Eine **neue Zeile** und kein Zustandswechsel zurück: `zurueck` ist ein
Endzustand (`TRANSITIONS`), und die alte Zeile ist der Nachweis über den ersten
Einsatz — mit ihren Drücken, ihren Abfragen und ihrer Rückkehrzeit. Zwischen
zwei Einsätzen wird gefüllt; ein überschriebener Abmarschdruck verlöre genau
den Verlauf, den das Protokoll belegen soll.

Übernommen wird, was am **Trupp** hängt, nicht an der einzelnen Entsendung:
Gerätesatz (`paTyp` und die Flaschenwerte), Einheit (`entsendetAn`) und wer die
Zeitkontrolle führt (`ueberwachtVon`, `ueberwachungUids`). Nicht übernommen
werden Messwerte, Warnungen — und das **Einsatzziel**: Das ist der Auftrag
dieser Entsendung, und der zweite Einsatz führt den Trupp oft woandershin; ein
stehengebliebenes „Stiegenhaus 3. OG" wäre eine Behauptung. `ueberwachungSeit`
steht auf jetzt: Die Verantwortung läuft weiter, aber auf dieser Zeile beginnt
sie hier.

Bei der **Ausrüstung** geht die Grenze nicht zwischen den Zeilen, sondern
zwischen den Gerätetypen — festgelegt in `nextBereitstellung`, also auch für
„Wieder bereitstellen" am Sammelplatz, weil es dieselbe Lage ist: Maske,
Pressluftatmer und Zubehör bleiben beim Träger, denn der Trupp legt sie zwischen
zwei Einsätzen nicht ab, und sie noch einmal zu scannen ist reine Tipparbeit.
Die **Flaschen** bleiben zurück: Sie sind leer und werden getauscht, und eine
mitgeschleppte Flaschennummer wäre eine Falschaussage darüber, welche Flasche im
zweiten Einsatz war — genau die, aus der später das Füllprotokoll wird. Bleibt
nichts übrig, fehlt das Feld ganz; ein leeres Array wäre eine Aussage über
Ausrüstung, die es nicht gibt, und Firestore lehnt `undefined` ab.

### …oder zurück an den Sammelplatz

Die zweite Möglichkeit an einem zurückgekehrten Trupp: **„An den Sammelplatz
übergeben"** (`sammelplatzUebergabePatch`). Das schreibt nur `ueberwachungBis`
und lässt den Zustand `zurueck` unberührt — der Trupp ist nicht weg, er wird
regeneriert, und wer das tut, steht am Sammelplatz. Die neue Bereitstellung
entsteht dort über „Wieder bereitstellen".

`ueberwachungSeit` bleibt dabei stehen. Beide Zeitstempel zusammen sind der
Zeitraum, in dem der Gruppenkommandant die Zeitkontrolle hatte; ein gelöschter
Anfang machte das Ende unlesbar. Die Übergabe der Verantwortung ist
protokollpflichtig, und zwar in **beide** Richtungen: Ohne diesen Vermerk stünde
am Ende des Einsatzes an jedem Trupp ein Gruppenkommandant, der ihn „überwacht",
Stunden nachdem er wieder Umgebungsluft atmet.

Sichtbar ist die Übergabe auf **beiden** Seiten — als Chip auf der
Überwachungskarte und auf der Truppkarte des Sammelplatzes („Von der
Atemschutzüberwachung übergeben"). Eine Übergabe, die nur der Übergebende sieht,
ist keine.

Danach bietet die Überwachungskarte an dieser Zeile keine Entsendung mehr an: Ab
hier entscheidet der Sammelplatz, wann der Trupp wieder bereitsteht. Ein
Fehlgriff ist damit nicht ausweglos — der Sammelplatz stellt den Trupp wieder
bereit, und die neue Zeile ist an der Zeitkontrolle wieder in vollem Umfang da.

## Wer was sieht

Alle für den Einsatz berechtigten Benutzer sehen **alle** Trupps — die
Firestore-Regeln für `call/{id}/{subitem=**}` gelten je Einsatz, nicht je
Einheit, und die Gesamtlage muss jemand sehen können. Für „meine Trupps" gibt es
einen Reiter je taktischer Einheit (`entsendetAn`) und die Angabe „meine
Einheit", die **je Gerät** im `localStorage` gemerkt wird: Welche Trupps die
eigenen sind, hängt am Gerät in der Hand, nicht am Konto — auf einem Fahrzeug
teilen sich mehrere Leute eines (siehe die Bedienung am Sammelplatz in
[atemschutzsammelplatz.md](atemschutzsammelplatz.md)). Bewusst **nicht** je
Einsatz: Dasselbe Fahrzeug ist im nächsten Einsatz dieselbe Einheit, und die
Wahl wäre sonst in jedem Einsatz neu zu treffen — im ungünstigsten Moment.
Reiter, Kategorien und die Abgrenzung zum Filter stehen unter „Die taktische
Einheit steht am Trupp".

Die Gesamtlage ist die ungefilterte Liste. Schreiben darf, wer am Einsatz
schreiben darf; ein Nur-Lese-Gast sieht die Überwachung, ändert sie aber nicht.

## Was die Überwachung ausdrücklich nicht ist

> „Die mit der Atemschutzüberwachung beauftragte Person übernimmt dabei NICHT
> die Verantwortung für den Atemschutztrupp, sondern unterstützt diesen nur."

Der Hinweis steht im Dialog **„Trupp übernehmen"** und nicht mehr dauerhaft oben
auf der Seite: Als Banner nahm er in jedem Einsatz die Zeile weg, in der der
erste Trupp stehen soll, und gelesen werden muss er in dem Moment, in dem jemand
die Zeitkontrolle übernimmt. Praktisch heißt das auch: Die
Papier-Rückfallebene bleibt. Fällt das Gerät oder die Verbindung aus, läuft die
Zeitkontrolle auf dem Formblatt weiter — die App ist die Unterstützung, nicht
die Vorschrift. Firestore puffert Schreibvorgänge offline und stellt sie später
zu, die Prognose rechnet ohne Netz weiter (sie braucht nur die Uhr des Geräts),
und die serverseitige Warnung fällt für die Dauer der Störung aus.

## Offene Punkte

- **Übernahme in den Einsatzbericht und ins Füllprotokoll.** Die Geräte am Trupp
  tragen `geraetId` und sind damit der Anknüpfungspunkt: Welche Flasche war im
  Einsatz und muss gefüllt werden. Der Weg von dort in eine vorbereitete
  Füllprotokollzeile ist noch nicht gebaut (#761).
- **Sprache der Benachrichtigung.** Der Push ist deutsch, unabhängig vom Profil
  des Empfängers. Erst wenn der Lauf die Profile aller Empfänger liest, wäre
  eine Sprache je Gerät möglich.
- **Kein Verlauf der Änderungen.** Wird eine Druckabfrage falsch erfasst, lässt
  sie sich derzeit nicht korrigieren — sie ist Teil des Protokolls. Ob eine
  Korrektur mit Vermerk nötig ist, zeigt der erste Einsatz.
