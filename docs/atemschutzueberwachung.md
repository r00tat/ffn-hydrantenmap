# Atemschutzüberwachung

Die Einsatzzeitkontrolle des Gruppenkommandanten: protokollierte Druckabfragen,
laufend fortgeschriebener Luftvorrat, Rückzugszeitpunkt und Warnungen.

Code: [src/common/atemschutzUeberwachung.ts](../src/common/atemschutzUeberwachung.ts)
(die Rechnung), [src/components/Atemschutz/UeberwachungPage.tsx](../src/components/Atemschutz/UeberwachungPage.tsx)
(die Seite), [src/components/Atemschutz/sendUeberwachungWarnungen.ts](../src/components/Atemschutz/sendUeberwachungWarnungen.ts)
(der Zeitplan-Lauf).

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
Ohne Zielmeldung ist der Rückmarschdruck nicht berechenbar; dann gilt die
Restdruckwarnung, und die Karte weist mit einem Hinweis darauf hin, dass die
Zielmeldung fehlt.

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
Clientseitig zeigt die Karte dieselben Warnungen zusätzlich als Meldung an; das
ersetzt den Push nicht, es kommt ihm nur zuvor.

Der Lauf hängt an Cloud Scheduler
([terraform/modules/cloud-scheduler](../terraform/modules/cloud-scheduler)) und
ruft `POST /api/atemschutz/ueberwachung-check` mit einem OIDC-Token auf —
derselbe Weg und derselbe Invoker-Service-Account wie beim
Fahrtenbuch-Wochenbericht (dessen Name deshalb historisch „fahrtenbuch" heißt).

Details, die nicht offensichtlich sind:

- **Jede Minute.** Die Drittelmarken eines Standardgerätes liegen bei rund acht
  Minuten, die Rückzugswarnung hat drei Minuten Vorlauf; ein Lauf alle fünf
  Minuten könnte die Vorwarnung um zwei Minuten verpassen. Der Preis: Der Dienst
  bekommt damit rund um die Uhr eine Anfrage je Minute und skaliert praktisch
  nicht mehr auf null. Wem das zu teuer wird, stellt `ueberwachung_schedule` um
  — die Variable ist genau dafür da.
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
  registriert, soll die Warnung noch bekommen; der Lauf kommt in einer Minute
  ohnehin wieder und kostet ohne Empfänger nichts.
- **Die Buchführung steht am Dokument** (`warnungen.<key>`, per Punktpfad
  geschrieben, damit die anderen Einträge unberührt bleiben). Ohne sie käme jede
  Warnung sechzigmal je Stunde erneut.
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
