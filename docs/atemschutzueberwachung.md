# Atemschutzüberwachung

Die Einsatzzeitkontrolle des Gruppenkommandanten: protokollierte Druckabfragen,
laufend fortgeschriebener Luftvorrat, Rückzugszeitpunkt und Warnungen.

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

Der Haken ist außerdem **nicht vorbelegt**, obwohl die erste Abfrage nach dem
Abmarsch meist die Ankunftsmeldung ist. Aus ihr rechnet sich der
Rückmarschdruck; eine gewöhnliche Zwischenabfrage, die versehentlich als Ankunft
gilt, macht ihn zu einer Behauptung. Stattdessen erinnert ein Hinweis im Dialog
daran, dass die Ankunft für diesen Trupp noch fehlt — und dass bis dahin die
55-bar-Warnung der Rückzugszeitpunkt ist.

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
| `rueckzug` | 3 Minuten vor dem prognostizierten Rückzugszeitpunkt | 5.3.2 |

Eine erfasste Druckabfrage **ist** die Lage- und Flaschendruckmeldung — deshalb
schweigt die Überwachung, sobald eine vorliegt.

**Warum serverseitig:** Die Fristen sind Vorschrift, und ein Gruppenkommandant
hat das Telefon in der Tasche, nicht die Seite offen. Eine Warnung, die nur
kommt, solange jemand hinsieht, ist für eine Sicherheitsfunktion keine.

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

## „In den Einsatz schicken", nicht „entsenden"

Am Sammelplatz wird ein Trupp **abgegeben**: „Entsendet an" ist dort die
entscheidende Angabe, denn wer nicht festhält, an welche taktische Einheit,
verliert die Spur. Bei der Überwachung steht der Gruppenkommandant selbst davor
— er schickt den Trupp in *seinen* Einsatz und hat niemanden, an den er ihn
übergibt. Das Feld wäre dort eine Frage ohne Antwort und ist deshalb
ausgeblendet (`TruppZeitKontext` in
[TruppZeitDialog.tsx](../src/components/Atemschutz/TruppZeitDialog.tsx)).

Ein am Sammelplatz gesetztes Ziel wird dabei **nicht** gelöscht: `entsendePatch`
lässt das Feld aus dem Patch weg, wenn es fehlt.

Aus demselben Grund heißen die Beschriftungen anders. „Abmarsch erfassen" klang
nach reiner Dokumentation — als würde etwas nachgetragen, was schon passiert
ist. Der Knopf schickt den Trupp aber wirklich in den Einsatz und startet die
Zeitkontrolle, und genau das sagt er jetzt: **„In den Einsatz schicken"**. Der
Zeitpunkt heißt dort „Abmarsch (Anschließen der Luftversorgung)" — so definiert
ihn die Unterlage.

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
einen Filter auf „Entsendet an", der **je Gerät und je Einsatz** im
`localStorage` gemerkt wird: Welche Trupps die eigenen sind, hängt am Gerät in
der Hand, nicht am Konto — auf einem Fahrzeug teilen sich mehrere Leute eines
(siehe die Bedienung am Sammelplatz in
[atemschutzsammelplatz.md](atemschutzsammelplatz.md)).

Die Gesamtlage ist die ungefilterte Liste. Schreiben darf, wer am Einsatz
schreiben darf; ein Nur-Lese-Gast sieht die Überwachung, ändert sie aber nicht.

## Was die Überwachung ausdrücklich nicht ist

> „Die mit der Atemschutzüberwachung beauftragte Person übernimmt dabei NICHT
> die Verantwortung für den Atemschutztrupp, sondern unterstützt diesen nur."

Der Hinweis steht deshalb oben auf der Seite. Praktisch heißt das auch: Die
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
