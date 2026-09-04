# Atemschutzsammelplatz

Wer im Zusammenspiel mit der taktischen Einheit was tut — mit und ohne
Sammelplatz —, steht in [atemschutz-ablauf.md](atemschutz-ablauf.md).

## Herkunft

Die Seite löst eine Excel ab (`ASSP.xlsx`, sieben Blätter: Deckblatt,
Füllprotokoll, Atemschutztrupps, Bezirk, ND, Daten, Druck). Zwei Dinge daraus
sind in der App bewusst *anders*:

- Die Blätter **Bezirk** und **ND** waren Bestandslisten *je Einsatz* mit
  Druckwerten je Flasche — also dieselbe Angabe wie im Füllprotokoll an einer
  zweiten Stelle. In der App ist der Bestand reine Stammdaten je Gruppe, und
  jeder Druck steht genau einmal: in einer Füllzeile.
- Das Blatt **Atemschutztrupps** hatte je Trupp *eine* Zeile mit einem
  Abmarsch und einer Rückkehr. Ein zweiter Einsatz desselben Trupps war darin
  nicht abbildbar. In der App ist jede Bereitstellung eine eigene Zeile.

Ein PDF-Export gibt es bewusst nicht: Das Protokoll lebt in der App.

## Abgrenzung zur Atemschutzüberwachung

Der Sammelplatz ist **Logistik**: Trupps bereitstellen, Ausrüstung ausgeben,
Flaschen füllen. Die **Einsatzzeitkontrolle** gehört nicht hierher — „Diese
übergeordnete Atemschutzüberwachung hat ausschließlich logistische Aufgaben; sie
führt KEINE ZEITKONTROLLE durch." (FH-06 5.3.4). Sie liegt beim
Gruppenkommandanten und hat eine eigene Seite:
[atemschutzueberwachung.md](atemschutzueberwachung.md). Beide arbeiten auf
derselben Sammlung `call/{id}/atemschutzTrupp` — ein hier zugeteilter Trupp
erscheint dort von selbst.

Die Grenze verläuft entlang zweier Zustände: Der Sammelplatz **teilt zu**
(`zugeteilt`) — er übergibt eine Ressource an eine taktische Einheit. Die
Einheit **schickt in den Einsatz** (`imEinsatz`) — sie gibt den Einsatzauftrag,
und erst damit beginnt die Zeitkontrolle. Der Sammelplatz weiß nicht, wann der
Trupp anschließt; ihn das entscheiden zu lassen hieße, die Fristen zu früh
starten zu lassen. Der ganze Ablauf steht in
[atemschutz-ablauf.md](atemschutz-ablauf.md).

## Warum jede Bereitstellung eine eigene Zeile ist

`atemschutzTrupp` speichert **eine Bereitstellung**, nicht einen Trupp. Ein
zurückgekehrter Trupp, der wieder einsatzbereit ist, bekommt über
`nextBereitstellung()` ein *neues* Dokument mit demselben `truppKey` und
`laufendeNummer + 1`; die alte Zeile bleibt unverändert stehen.

Der Grund ist der Druck: Zwischen zwei Einsätzen wird gefüllt. Stünde der
geringste Druck am Trupp und würde bei jedem Abmarsch überschrieben, verlöre
das Protokoll genau den Verlauf, den es belegen soll. `truppKey` bindet die
Zeilen zusammen, ohne dass eine die andere ändert.

`zurueck` ist deshalb ein Endzustand, und `imEinsatz → abgemeldet` fehlt in
`TRANSITIONS`: Ein Trupp, der draußen ist, muss erst zurückkommen — sonst
behauptet die Übersicht, niemand sei mehr im Einsatz.

## Warum die Barcode-Spalte des Exports nicht allein trägt

Der Sybos-Artikelexport hat eine Spalte `Barcodes`. Sie wird importiert und ist
der erste Nachschlagewert — heute ist sie aber in **einer von 214 Zeilen**
gefüllt, und dieser eine Wert (`4026056001293`) ist eine EAN-13, die den
*Artikeltyp* bezeichnet und nicht das einzelne Stück.

Daraus folgen zwei Dinge im Code:

- `lookupEntries()` sammelt **sechs** Kennungen: `barcodes`, `nummer`,
  `inventarNr`, `zusatzInventarNr`, `seriennummer`, `externeId` — jede mit dem
  Feld, aus dem sie stammt. Die wichtigste Brücke zur ASSP-Liste ist
  `zusatzInventarNr` (`AF-2.16.19` → `2.16.19`).
- `findByCode()` gibt eine **Liste** zurück, nicht ein Gerät. Sobald die
  Barcode-Spalte gepflegt wird, können sich mehrere Flaschen einen Code teilen;
  der Dialog fragt dann nach, statt still den ersten Treffer zu nehmen.

### Starke Kennung verdrängt schwache

`barcodes`, `nummer`, `inventarNr` und `zusatzInventarNr` gelten als **stark**:
Sie stehen am Stück oder wurden dort angelernt. `seriennummer` und `externeId`
gelten als **schwach**. Trifft ein Code mindestens ein Gerät über ein starkes
Feld, fallen die Treffer weg, die nur an einem schwachen hängen.

Der Anlass steht im Bestand und ist kein Sonderfall: **42 der Codes sind
mehrdeutig**, 11 davon nur wegen der Seriennummer. Sechs Masken der Serie
„Vollatemmaske Normaldruck 2–8" tragen in `seriennummer` die *Inventarnummer
einer anderen Maske* — ein Erfassungsfehler in Sybos. Ein Scan des Etiketts
`2016-MU-046` traf deshalb zwei Masken, und die App fragte bei jedem einzelnen
Scan nach, obwohl die Antwort feststeht.

Die schwachen Felder bleiben suchbar: Sind sie der *einzige* Treffer, wird er
geliefert — eine Flasche über ihre eingeprägte Seriennummer zu finden, muss
weiter gehen. Und wo eine Auswahl übrig bleibt, nennt der Scanner-Dialog je
Zeile das treffende Feld (`matchedFields()`), damit „getroffen über
Inventarnummer" von „getroffen über Seriennummer" zu unterscheiden ist.

Das behebt die Ursache nicht — die liegt in Sybos. Es sorgt nur dafür, dass ein
Erfassungsfehler in einem Feld, das auf keinem Aufkleber steht, nicht bei jedem
Scan einen Handgriff kostet.

### Welche Kennung führt

`geraetKennung()` ist `inventarNr ?? nummer ?? seriennummer` — **die
Inventarnummer führt, für jeden Typ.** Sie steht auf dem aufgeklebten Etikett
und ist die, die gescannt wird.

Vorher führte `nummer`, und das ging schief: Der Import leitet `nummer` aus der
Zusatz-Inventar-Nr. ab (gedacht für die ASSP-Flaschennummer `AF-2.16.19`),
wendet das aber auf jeden Typ an. Bei **allen 81 Masken** stand damit eine
andere Kennung am Bildschirm als auf dem Etikett — ein Scan von `2016-MU-046`
schlug eine Maske `2.16.36` vor, dieselbe Maske, nur nicht wiederzuerkennen.
Bei einer Maske stand als „Kennung" sogar der Modellname `XPLORE4`.

**Folge für gespeicherte Daten:** `flaschenNummer` am Füllprotokoll und
`kennung` am Trupp-Gerät sind Kopien der führenden Kennung. Neue Einträge
tragen daher die Inventarnummer, ältere behalten, was zum Zeitpunkt der
Erfassung galt. Beides bleibt über `geraetId` mit dem Stammdatensatz
verbunden.

Die Regel gilt **überall dort, wo ein Gerät angezeigt wird**, nicht nur beim
Scan: Geräteverwaltung, Import-Vorschau, QR-Etikett, Gerätedialog und der Name,
der an einen Mangel kopiert wird, gehen alle über `geraetKennung()` bzw.
`geraetLabel()`. Die Geräteliste zeigte davor `nummer` als Überschrift — also
bei jeder Maske und jedem Pressluftatmer eine Nummer, die auf dem Stück gar
nicht steht.

Was **nicht** führt, verschwindet trotzdem nicht: `geraetNebenkennungen()`
liefert die übrigen Kennungen (Flaschennummer, Zusatz-Inventar-Nr.,
Seriennummer) für die Zeile unter dem Etikett — ohne die führende zu
wiederholen und ohne Dubletten, denn der Import leitet `nummer` aus der
Zusatz-Inventar-Nr. ab, und beide Felder tragen dann denselben Text. Am
Sammelplatz wird die Flaschennummer gesprochen; sie muss lesbar bleiben, nur
eben als Zusatz.

Für Flaschen ohne brauchbaren Barcode lassen sich eigene QR-Etiketten drucken,
und ein gescannter unbekannter Code kann am Gerät als weiterer `barcodes`-
Eintrag angelernt werden (`addAtemschutzBarcode`).

Das Etikett trägt die **führende Kennung im Klartext** — im Regelfall also die
Inventarnummer —, nicht die Firestore-ID: Sie steht auch lesbar darauf,
`lookupKeys()` findet sie, und das Etikett überlebt so einen Neuimport der
Stammdaten. Ältere Etiketten mit der Flaschennummer bleiben gültig, weil
`lookupKeys()` beide Felder abdeckt. Ein Stück, das nur eine Inventarnummer
hat, war davor gar nicht etikettierbar. Gedruckt wird über
`printShareLinkQr` aus dem Fahrtenbuch — eine `@media print`-Regel im Dialog
nähme dessen Overlay- und Scroll-Container mit auf den Ausdruck, deshalb baut
jene Funktion ein eigenständiges Dokument in einem neuen Fenster.

## Warum der Import Dubletten behandeln muss

Im Export sind die Kennungen **nicht eindeutig**: 205 verschiedene IDs bei 214
Zeilen, 96 verschiedene Seriennummern bei 123 befüllten, 191 verschiedene
Inventar-Nummern bei 198 befüllten. Ohne Abgleich überschriebe die zweite Zeile
still die erste.

`abgleich()` prüft in der Reihenfolge `externeId` → `inventarNr` →
`seriennummer` — das ist die Reihenfolge nach Verlässlichkeit — und markiert
Kollisionen *innerhalb* der Datei, die in der Vorschau auf „überspringen"
vorbelegt werden.

Als Kollision zählt dabei nur die **führende** Kennung, also die, die den
Abgleich tatsächlich entscheidet. Über alle drei geprüft meldete der echte
Export 41 von 214 Zeilen als Dublette, tatsächlich kollidieren nur 9. Die
übrigen 32 haben eine eigene Sybos-ID und landen sauber in eigenen Dokumenten —
sie zum Überspringen vorzuschlagen hieße, ein Sechstel des Bestands beim Import
zu verlieren.

Nenndruck, Volumen und Material stehen im Export nirgends als Feld; sie werden
aus dem Klartext der Bezeichnung abgeleitet („CFK 6,8 l", „Stahl 6 l") und aus
einer Bemerkung wie „200BAR". Die Ableitung ist eine Erleichterung, keine
Behauptung — im Vorschaudialog ist jeder Wert änderbar. Ebenso die
Bezirksreserve: Im Export steht bei diesen 25 Flaschen als Dienststelle
trotzdem „Neusiedl am See", nur die Bezeichnung verrät sie.

**Nenndruck und Volumen gibt es nur an der Flasche** — im Import, im
Gerätedialog (dort sind die beiden Felder bei jedem anderen Typ ausgeblendet)
und in `buildGeraetPayload`, damit die Regel nicht auf der Ehrlichkeit des
Clients steht. An einer Maske wären beide Werte eine Erfindung, und die
Ableitung aus dem Klartext greift dort daneben: „Atemluftkompressor Mobil 300
l/min" ergab eine 300-Liter-Flasche. Gelesen werden sie ohnehin nur an
Flaschen — `vorgabeGeraetesatz()` überspringt jeden anderen Typ.

### Füllstationen kommen aus einem zweiten Export

Sybos gibt die Atemlufterzeugung in einem eigenen Lauf aus, mit eigenem
Klassenbaum: Klasse 3 ist dort **leer**, der Typ steht in Klasse 1
(„Atemlufterzeugung") und Klasse 2 („Atemluftfüllstation",
„Atemluftkompressor").

`typAusKlassen()` prüft deshalb Klasse 3 zuerst und allein und zieht die
gröberen Klassen erst heran, wenn Klasse 3 nichts hergibt — und dort nur die
Atemlufterzeugung. Im Geräteexport steht in Klasse 2 nämlich durchgehend
„Pressluftatmer", auch bei den 81 Masken; zöge Klasse 2 gleichberechtigt mit,
wäre jede Maske ein Pressluftatmer.

Der Standort wird ausschließlich aus dem Klartext gelesen
(„Atemluftfüllstation Stationär" → `fix`, „Atemluftkompressor Mobil" →
`mobil`), nicht aus der Klasse: Ob die Luft aus einem Kompressor oder einer
Füllstation kommt, sagt nichts darüber, ob das Gerät fest steht oder auf dem
Anhänger liegt. Fehlt das Wort, bleibt der Standort offen und wird im
Gerätedialog gesetzt, statt beim Import geraten zu werden.

### Inaktive Artikel werden übersprungen

Eine Zeile mit `Status: inaktiv` wird gar nicht erst übernommen — für jeden
Typ, nicht nur für Füllstationen. Im Geräteexport betrifft das 23 der 214
Zeilen, im Stationsexport die fest verbaute Füllstation („Derzeit wegen
Hausumbau inaktiv!"). Sie mit `active: false` anzulegen erzeugte ein Dokument,
das der Sammelplatz ohnehin überall ausblendet, das aber bei jedem Import
wieder mitgeschrieben wird.

Der Preis ist bewusst in Kauf genommen: Wird ein **bereits importiertes** Gerät
in Sybos nachträglich inaktiv gesetzt, deaktiviert ein erneuter Import es
nicht — die Zeile fehlt ja im Lauf. Ausgeschieden wird dann von Hand im
Gerätedialog.

Unbekannte oder leere Statuswerte werden importiert. Der Export kennt nur
„aktiv" und „inaktiv"; an einem unerwarteten Wert stillschweigend Bestand zu
verlieren wäre der schlechtere Ausgang.

## Warum das Füllprotokoll unter der Gruppe liegt

Trupps und Ausrüstungsausgabe hängen am Einsatz — sie beginnen mit ihm und
enden mit ihm. Das Füllprotokoll nicht: Gefüllt wird überwiegend im
Feuerwehrhaus, zwischen den Einsätzen, und der Nachweis ist einer über die
**Flasche**, nicht über den Einsatz. Es liegt deshalb unter
`groups/{groupId}/atemschutzFuellung`, mit einem eigenen Menüpunkt
`/atemschutz/fuellprotokoll` unter „Fahrzeuge". Der Reiter am Sammelplatz zeigt
dieselbe Komponente, nur auf den laufenden Einsatz gefiltert.

Zwei Felder stehen **immer** am Dokument, auch wenn sie leer bzw. `false` sind:

- **`firecallId`** — `''` heißt „an der Station, ohne Einsatz". Firestore kann
  nicht auf „Feld fehlt" abfragen; wäre das Feld bei Stationsfüllungen
  weggelassen, ließe sich *Ohne Einsatz* nicht als gewöhnlicher Filter bauen.
  Dazu gehört der zusammengesetzte Index `firecallId ASC, zeitpunkt DESC`.
- **`verrechnen`** — aus demselben Grund: `where('verrechnen','==',true)` würde
  sonst jede Zeile übersehen, an der das Feld fehlt. (Die Rechnungsstellung
  selbst ist ein eigenes Vorhaben, siehe Issue #754.)

`firecallName` und `fuellstationName` sind Kopien: Die Zeile soll ohne Join
lesbar bleiben.

### Die Füllstation ist ein Gerätetyp

Ein Kompressor ist Ausrüstung der Feuerwehr und steht deshalb als
`typ: 'fuellstation'` in denselben Stammdaten wie die Flaschen — statt einer
eigenen Sammlung, die dieselben Felder noch einmal hätte. Dazu kommen
`standort` (`fix` = Feuerwehrhaus, `mobil` = auf einem Fahrzeug) und bei
`mobil` der Träger; der Neusiedler Kompressor ist auf dem Atemschutzanhänger
verladen.

Der Träger ist ein Feld mit **freier Eingabe** neben der Fahrzeugliste der
Gruppe, keine reine Auswahl: Anhänger stehen nicht im Fahrtenbuch, weil sie
keines führen — genau der Atemschutzanhänger wäre also nicht eintragbar. Wird
ein Fahrzeug der Gruppe gewählt, bleibt der Bezug über `vehicleId` erhalten;
bei freiem Text steht nur `vehicleName`. Deshalb sind beide Felder optional.

Wird der Anhänger als Fahrzeug der Gruppe gepflegt, steht er in der Auswahl
unter der Überschrift „Anhänger" — siehe „Kategorie und Anzeigereihenfolge der
Fahrzeuge" in [fahrtenbuch.md](fahrtenbuch.md).

Aus dem Sybos-Export kommt der Träger nicht — der Artikelexport kennt keine
Verlastung. Er wird im Gerätedialog gesetzt.

Im Ausrüstungsreiter sind Füllstationen ausgeblendet: Eine Station wird nicht
ausgegeben und nicht zurückgenommen.

Der Dialog verhält sich nach `waehleFuellstation`:

| Stationen | Verhalten |
| --- | --- |
| keine | kein Feld — am Tag der Auslieferung hat keine Wehr einen Kompressor angelegt, daran darf nichts hängen |
| genau eine | fest zugeordnet, nur als Text angezeigt; ein Auswahlfeld mit einem Eintrag wäre eine Klickfalle |
| mehrere | Auswahlfeld, die letzte Wahl aus dem `localStorage` vorweggenommen |

### Wann „zu verrechnen" vorbelegt ist

`verrechnenVorgabe` entscheidet beim *Anlegen*:

- **Im Einsatz immer aus.** Dort ist es Nachbarschaftshilfe, keine
  Dienstleistung.
- **An der Station an**, wenn die Feuerwehr der Flasche nicht die eigene ist.
  Verglichen wird über `normalizeCode` — „Neusiedl am See" und
  „neusiedl-am-see" sind dieselbe Wehr.

Die eigene Wehr steht als `feuerwehrName` am Gruppendokument, gepflegt unter
`/admin/fahrtenbuch` (`saveFahrtenbuchGroupFeuerwehrName`, Gruppen-Admin).
Bewusst getrennt vom Gruppennamen: Der ist ein Verwaltungsbegriff („FF Neusiedl
am See"), die `feuerwehr`-Felder der Stammdaten tragen die Schreibweise des
Sybos-Exports. Ein Vergleich über `name` ginge still schief und markierte jede
eigene Füllung als zu verrechnen. Ohne gepflegten Wert bleibt der Schalter aus.

Die Vorbelegung zieht nach, solange der Benutzer den Schalter nicht selbst
angefasst hat: Das Feuerwehr-Feld ist beim Öffnen leer und wird erst danach
ausgefüllt oder durch einen Scan gesetzt. Beim Bearbeiten einer gespeicherten
Füllung gilt der Schalter als angefasst — der gespeicherte Wert ist eine
getroffene Entscheidung.

### Der Zweck einer Füllung

`zweck` (`einsatz` | `uebung` | `sonstiges`) steht neben `verrechnen` am
Dokument und beantwortet, was `firecallId` allein nicht kann: **Ohne Einsatz
sind Übung und Stationsfüllung dasselbe** — beide „ohne Einsatz" —, und für die
Jahresauswertung ist genau das der Unterschied, der zählt.

Drei Werte und nicht mehr. Jeder weitere müsste am Sammelplatz in derselben
Sekunde entschieden werden, in der die Flasche am Kompressor hängt.

Vorbelegt über `zweckVorgabe`: mit Einsatz `einsatz`, ohne Einsatz
`sonstiges` — **nicht** `uebung`. Der Regelfall an der Station ist das
Nachfüllen nach dem Einsatz oder für den Bestand; wer geübt hat, stellt um.
Eine falsche Vorbelegung auf „Übung" bekäme dagegen niemand zu sehen. Der Wert
zieht mit dem gewählten Einsatz nach, solange der Benutzer ihn nicht selbst
gesetzt hat — dieselbe Regel wie bei `verrechnen`.

Anders als `verrechnen` ist das Feld **optional**: Zeilen aus der Zeit davor
haben keines. `zweckOf` leitet ihn für sie aus `firecallId` ab, statt sie aus
jedem Filter fallen zu lassen; eine Migration aller Bestandszeilen spart das
ebenfalls — dieselbe Abwägung wie bei `rechnungId`. Der Zweckfilter läuft
deshalb clientseitig, der Zeitraumfilter dagegen serverseitig: Ein Bereich auf
`zeitpunkt`, also auf dem Sortierfeld, kostet keinen weiteren Index.

### Der Einsatz ist ein Feld des Dialogs, nicht des Aufrufers

Am Sammelplatz steht der Einsatz fest und der Dialog zeigt ihn nur an. Auf
`/atemschutz/fuellprotokoll` ist er ein Auswahlfeld — sonst übernähme eine dort
bearbeitete Zeile den *Filter* als Einsatz, und eine Einsatzfüllung, die bei
Filter „Alle" korrigiert wird, verlöre ihren Einsatz. `buildFuellungDocument`
gibt deshalb `input.firecallId` den Vorrang vor dem Kontext.

Ein Einsatz, der nicht mehr in der Auswahl steht — die Liste führt die letzten
50 —, bekommt einen eigenen Eintrag aus der Namenskopie am Dokument. Ohne den
stünde das Feld leer und ein Speichern nähme der Zeile den Einsatz.

Angezeigt wird er am Sammelplatz **auch beim Anlegen**, dafür gibt es die Prop
`firecallName`. Der Name steht sonst erst am gespeicherten Dokument, und wer
eine Füllung erfasst, soll sehen, welchem Einsatz sie zugeht. Beim Bearbeiten
gilt der Einsatz *der Zeile* und nicht der des Kontexts — sonst behauptete das
Formular für eine ältere Zeile den laufenden Einsatz.

Aus demselben Grund steht beim Bearbeiten der **Zeitpunkt** im Formular: Der
Dialog schickte ihn vorher nicht mit, und `buildFuellungDocument` setzte
mangels Angabe die aktuelle Zeit — jede Korrektur verschob die Füllung
stillschweigend auf jetzt. Beim *Anlegen* fehlt das Feld weiterhin: Dort ist
der Zeitpunkt „jetzt", und ein vorbelegtes Feld wäre am Sammelplatz zwischen
Öffnen und Speichern schon wieder veraltet.

### Wer eine Füllung nachträglich ändern darf

Anlegen darf jedes Gruppenmitglied, **ändern und löschen nur der Erfasser oder
ein Gruppen-Admin** — und beide nicht mehr, sobald die Zeile auf einer Rechnung
steht. Vorher hing beides allein an `canWrite`, das auf der zentralen Seite
`!!groupId` war: Jedes Mitglied durfte jede fremde Zeile ändern und löschen.

Die Entscheidung steht als `fuellungSperre` in `common/atemschutz.ts` und wird
an drei Stellen gebraucht — in der Liste (Knöpfe), in den Server Actions und,
so weit sie es kann, in den Firestore-Regeln:

| Zustand | Erfasser | Gruppen-Admin | anderes Mitglied |
| --- | --- | --- | --- |
| gewöhnlich | ändern, löschen | ändern, löschen | nur lesen |
| `rechnungId` gesetzt | nur lesen | nur lesen | nur lesen |

Die Sperre für abgerechnete Zeilen gilt **auch für den Gruppen-Admin**: Ihr
Inhalt steht auf einem Beleg, der das Haus verlassen hat. Der Weg zurück führt
über das Storno der Rechnung, nicht über die Zeile.

Zeilen ohne `createdBy` bleiben dem Gruppen-Admin vorbehalten. Das ist die
sichere Richtung — `createdBy: ''` gegen ein leeres `uid` zu vergleichen gäbe
sonst jedem abgemeldeten Zustand das Recht.

**Zwei Schreibwege, und warum.** Die Firestore-Regel kann nur die eigene Zeile
freigeben: Die Gruppen-Admin-Rolle steckt in keinem Custom Claim und ist für
Regeln nicht sichtbar (siehe [berechtigungen.md](berechtigungen.md)). Der
Gruppen-Admin korrigiert deshalb über `updateFremdeFuellung` /
`deleteFremdeFuellung` mit dem Admin SDK, das die Prüfung noch einmal selbst
macht. Die Action akzeptiert nur die Felder des Dialogs — `createdBy`,
`rechnungId` und die Zeitstempel stehen nicht darin: Wer eine fremde Zeile
korrigiert, wird nicht ihr Erfasser.

Diesen zweiten Weg gibt es **nur auf `/atemschutz/fuellprotokoll`**, nicht am
Sammelplatz. Eine Server Action scheitert an der schlechten Verbindung am
Sammelplatz — genau dem Grund, aus dem dort der Client schreibt. Eine fremde
Zeile korrigiert man am Schreibtisch.

Die Regel bindet zusätzlich `createdBy` beim Anlegen an den Aufrufer und
verbietet, es beim Ändern zu verschieben oder sich selbst eine `rechnungId`
anzuhängen. Ohne das schriebe ein manipulierter Client eine fremde uid hinein
und sperrte die Zeile für den, der sie zu sehen bekommt.

## Ausdruck, Export und Import des Füllprotokolls

Das Füllprotokoll ist ein Nachweisdokument und muss das Haus verlassen können.
Drei Wege, mit drei verschiedenen Begründungen, wo sie laufen:

| Weg | läuft | warum dort |
| --- | --- | --- |
| **PDF** | Server Action | react-pdf gehört nicht ins Client-Bundle, und der Ausdruck soll den vollen Zeitraum abdecken, nicht nur die geladenen 500 Zeilen |
| **CSV-Export** | Browser | Die Zeilen stehen schon auf dem Bildschirm; Datum und Uhrzeit gehören in die Ortszeit des Benutzers, und der Server läuft in UTC |
| **CSV-Import** | zerlegt im Browser, geschrieben auf dem Server | dieselbe Zeitzonenfrage beim Lesen; der Dublettenabgleich braucht dagegen den Bestand |

Der Ausdruck nennt im Kopf **den gedruckten Ausschnitt** — Einsatz, Zweck,
„nur zu verrechnende" — und den Zeitraum. Ein Blatt, dem man nicht ansieht,
dass es nur die Übungen eines Monats zeigt, ist als Beleg wertlos. Ohne
gesetzten Zeitraum steht der der geladenen Zeilen im Kopf und nicht ein
erfundenes „seit Beginn der Aufzeichnung". Gerendert wird in Teilen zu je 100
Zeilen und danach zusammengefügt — dieselbe Speicherfalle wie beim
Fahrtenbuch-Export (#665), nachzulesen in `renderFahrtenbuchPdf.ts`.

**Import und Export teilen sich ein Format**, weil es für den Import keine
fremde Quelle gibt: Nachgetragen werden Altbestände aus Excel-Listen, die jede
Wehr anders geführt hat. Statt ein fremdes Layout zu erraten, gibt der Export
die Vorlage vor — einmal exportieren, Zeilen ergänzen, zurückspielen. Die
Spaltennamen sind deutscher Klartext und keine Schlüssel: Die Datei wird in
einer Tabellenkalkulation geöffnet, und dort ist „Enddruck" lesbar und
`enddruck` nicht. Semikolon und BOM, weil Excel die Datei sonst in einer
einzigen Spalte öffnet und jeden Umlaut zerlegt.

Der **Dublettenschlüssel** ist Flasche + Feuerwehr + Zeitpunkt auf die
**Minute**, alles über `normalizeCode` vereinheitlicht. Die Minute, weil die
Datei nur Minuten trägt — auf die Sekunde verglichen fände ein Reimport nie
eine Dublette. Bewusst ohne Enddruck und Anzahl: Wer eine Zeile korrigiert und
die Datei erneut einspielt, will keine zweite daneben. Geprüft wird gegen den
Bestand *und* innerhalb der Datei, und beim Schreiben noch einmal — der Status
kommt vom Client, und zwischen Vorschau und Import kann jemand dieselbe Datei
eingespielt haben.

Der Import setzt **keinen Einsatzbezug**: In der Datei steht nur ein Name, und
eine geratene Einsatz-ID wäre schlimmer als keine. Der Name bleibt als
`firecallName` stehen, damit der Nachtrag lesbar ist. Importieren darf nur der
Gruppen-Admin — Nachtragen ist ein Verwaltungsakt, kein Protokollieren;
derselbe Zuschnitt wie beim Geräteimport.

**Offen (Punkt 7 aus #761):** Ob und wie die Füllungen nach Sybos übernommen
werden — über die Chrome-Extension wie beim Einsatzbericht oder als Exportdatei
zum manuellen Import — ist noch nicht entschieden.

## Verrechnung der Füllungen

Was `verrechnen` markiert, wird unter `/atemschutz/verrechnung` je Feuerwehr
gebündelt, zu einer Rechnung gemacht und per Mail mit PDF verschickt. Die
Rechnungen, das Adressbuch und die Konfiguration liegen als
`atemschutzRechnung`, `atemschutzEmpfaenger` und `atemschutzConfig/rechnung`
unter der Gruppe — aus demselben Grund wie das Füllprotokoll selbst.

### Der Tarif kommt nicht aus dem Volumen

Vorgabe ist `5.01` („bis 6 Liter") für **jede** Position, unabhängig von der
Flasche. In der Praxis wird auch für eine 6,8-l-CFK der 6-l-Preis verrechnet.
Das Volumen steht in der Position nur zur Information; wer `5.02` braucht,
stellt es je Zeile oder über „Alle auf Tarif" um.

### Die Preise kommen aus dem Kostenersatz-Katalog

`5.01` und `5.02` stehen als Tarife der Kategorie 5 bereits im
Kostenersatz-Katalog (LGBl. Nr. 77/2023). Eine eigene, in der Gruppe pflegbare
Zahl wäre eine zweite Quelle für denselben Betrag und würde driften — das
Landesgesetzblatt gilt landesweit gleich.

Der Dialog zeigt die Preise über `useKostenersatzRates()`, also aus derselben
Firestore-Collection, die auch der Kostenersatz liest. Verbindlich ist
trotzdem nur, was der Server auflöst: `loadFuellungTarife()` liest den Katalog
über das Admin SDK noch einmal und friert Preis und `rateVersion` in die
Position ein. Ein vom Client geschickter Betrag wird nie geglaubt, und eine
gestellte Rechnung ändert sich nicht mehr, wenn der Katalog später gepflegt
wird.

### Warum Kostenersatz-Freigabe und nicht Gerätemeister

`actionFuellungRechnungRequired(groupId)` verlangt **Gruppenmitglied und
Kostenersatz-Freischaltung**. Wer den Kostenersatz der Feuerwehr macht, macht
auch diese Rechnungen, und das ist nicht zwangsläufig der Gerätemeister — die
Rolle wäre hier die falsche Grenze.

Der Zuschnitt hat einen zweiten Grund: Die Firestore-Regel trägt wörtlich
denselben Satz (`fahrtenbuchMember() && kostenersatzUser()`). Regel und Action
können damit nicht auseinanderlaufen, und der Client darf den Tarifkatalog
selbst lesen — sonst bräuchte die Vorschau eine eigene Server Action.

Die Konfiguration (Betreff, Text, CC, Zahlungsziel, Vorgabetarif) hängt
dagegen an `actionGroupAdminRequired`: Sie gilt für alle Rechnungen der Gruppe
und ist keine Tagesarbeit.

### Wo die Rechnungsstammdaten stehen

Zahlungsziel, Umsatzsteuerhinweis und der Leistungstext liegen in
`atemschutzConfig/rechnung` und werden unter `/admin/atemschutz` gepflegt
(Gruppen-Admin).

**Absender, Anschrift, Kontakt, Kontoinhaber, IBAN, BIC und das Logo stehen
nicht mehr hier**, sondern in den Gruppen-Stammdaten
(`groups/{groupId}/groupConfig/stammdaten`, Reiter „Stammdaten"). Sie gelten
auch für den Kostenersatz: Dieselbe IBAN an zwei Orten liefe auseinander,
sobald sich das Konto ändert. Begründung und Aufbau:
[docs/gruppen-stammdaten.md](gruppen-stammdaten.md).

Fehlen Absender, Anschrift oder IBAN, ist das Erstellen einer Rechnung
**gesperrt** — nicht nur mit einem Hinweis versehen. Die Verrechnungsseite
zeigt den Grund mit Sprung in die Stammdaten, und `createFuellungRechnung`
weist den Aufruf auch dann ab, wenn er anders hereinkommt. Ohne diese Angaben
weiß der Empfänger weder, von wem die Rechnung kommt, noch wohin er
überweisen soll; ein Blatt ohne beides sieht aus wie ein Beleg und ist keiner.

Das PDF prüft die Bankdaten trotzdem noch einmal selbst (`hatBankdaten`) und
lässt den Zahlungsblock weg, wenn sie fehlen: Eine bereits gestellte Rechnung
muss auch dann noch druckbar sein, wenn jemand die Stammdaten später leert.

Zum Umsatzsteuerhinweis gibt es **bewusst keinen Vorgabetext**: Ob und wie eine
Feuerwehr hier unternehmerisch tätig wird, ist ihre eigene steuerliche
Beurteilung und gehört nicht als Behauptung in den Code.

Das Zahlungsziel wird in **UTC** gerechnet (`setUTCDate`). In Ortszeit
verschöbe die Zeitumstellung das Ergebnis um eine Stunde, und da das PDF
serverseitig auf einem UTC-Host entsteht, fiele das Fälligkeitsdatum dann
einen Tag zu früh aus.

### Der Empfänger wird in die Rechnung kopiert

Die Rechnung trägt Name, Anschrift und E-Mail als eingebettete Kopie, nicht als
Verweis ins Adressbuch. `empfaengerId` bleibt nur als Herkunftsnachweis stehen
und wird nie nachgelesen. Sonst änderte eine gepflegte Adresse rückwirkend
eine bereits verschickte Rechnung.

### Die Feuerwehr am Empfänger ist der Zuordnungsschlüssel

`empfaengerFuerFeuerwehr` vergleicht über `normalizeCode` gegen die
`feuerwehr` an der Flasche. „FF Podersdorf" trifft „Podersdorf" damit *nicht*.
Deshalb ist das Feld im Empfängerdialog eine Auswahl über die Schreibweisen,
die tatsächlich in den Gerätestammdaten stehen, und warnt bei einem Wert, der
zu keiner davon passt.

Bewusst **kein** unscharfer Vergleich, der ein vorangestelltes „FF" oder
„Freiwillige Feuerwehr" wegschneidet: Das wäre geraten und könnte zwei
verschiedene Wehren zusammenwerfen. Die Auswahl macht das Problem stattdessen
unmöglich.

### Was sich am Entwurf noch ändern lässt

`updateFuellungRechnung` greift nur bei `status === 'draft'`. Änderbar sind
Empfänger, Rechnungsdatum, Bemerkung und der Tarif je Position; die Preise
werden dabei **neu aufgelöst** statt aus den Positionen übernommen. Ein
Entwurf ist nicht gestellt — ändert sich der Katalog davor, gilt der neue
Preis. Eingefroren wird beim Verschicken, ab dann lässt
`rechnungStatusErlaubt` diese Action nicht mehr zu.

Positionen kommen weder hinzu noch weg. Das gäbe Füllungen frei bzw. bände
neue, und beides ist der Weg über Storno und Neuanlage — ein Klick, dafür ohne
halb gebundene Zeilen, wenn jemand mittendrin abbricht.

### Warum der EPC-QR-Code fehlen darf

`buildEpcPayload` gibt `undefined` zurück, sobald Empfänger, IBAN oder ein
Betrag zwischen 0,01 und 999.999.999,99 fehlen, und das PDF lässt den Code
dann weg. Lieber keiner als ein falscher: Ein QR-Code, der zu einer
unvollständigen Überweisung führt, sieht aus, als könnte man ihm vertrauen.

### Was das Storno mit `verrechnen` macht: nichts

Storniert wird aus jedem Status außer dem Storno selbst; heraus führt kein Weg.
Dabei verschwindet ausschließlich `rechnungId` an den Füllungen — `verrechnen`
bleibt unangetastet. Die Aussage „das ist zu verrechnen" hat sich nicht
geändert, nur die Rechnung ist weg, und die Zeilen stehen sofort wieder unter
den offenen.

### Warum `rechnungId` optional ist

`verrechnen` und `firecallId` sind an jeder Füllung gesetzt, `rechnungId` nicht.
Die Übersicht fragt `where('verrechnen','==',true)` serverseitig ab und filtert
`rechnungId` clientseitig — das erspart die Migration aller Bestandszeilen und
einen weiteren zusammengesetzten Index. Serverseitig gefiltert wird nur, was
die Liste selbst ausmacht.

### Offener Punkt

`atemschutzFuellung` bleibt clientseitig schreibbar — das ist die
Offlinefähigkeit am Sammelplatz, an der sich nichts ändern soll. Ein
Gruppenmitglied könnte damit `rechnungId` von Hand entfernen und eine Füllung
ein zweites Mal abrechnen. Dieselbe Vertrauensebene wie beim
`verrechnen`-Schalter selbst; wer sie enger zieht, verliert das Nachtragen bei
schlechter Verbindung.

## Berechtigungen

- **Protokolle am Einsatz** (`call/{id}/atemschutzTrupp`,
  `call/{id}/atemschutzAusgabe`): Wer den Einsatz bearbeiten darf, führt hier
  Protokoll. Dafür ist **keine eigene Firestore-Regel nötig** — die bestehende
  `match /{subitem=**}` unter `call/{doc}` deckt jede neue Untersammlung ab.
- **Füllprotokoll** (`groups/{groupId}/atemschutzFuellung`): lesen und
  *anlegen* jedes Gruppenmitglied (`fahrtenbuchMember()`); ändern und löschen
  nur der Erfasser, der Gruppen-Admin über eine Server Action, und beide nicht
  mehr nach der Verrechnung — siehe „Wer eine Füllung nachträglich ändern
  darf". Anders als bei den
  Stammdaten schreibt hier der **Client** und nicht eine Server Action: Am
  Sammelplatz ist die Verbindung schlecht, und Firestore stellt
  Client-Schreibvorgänge offline zurück und spielt sie nach — eine Server
  Action scheitert. Und anders als beim Anlegen eines Geräts ist Schreiben hier
  kein Verwaltungsakt: Wer füllt, protokolliert, und das ist selten ein Admin.
  **Einsatz-Gäste** (Zugang über einen Share-Link) sind damit außen vor; sie
  sind keine Gruppenmitglieder. Der Reiter zeigt ihnen statt der Liste einen
  Hinweis — ein verschwundener Reiter würde als Fehler gelesen. Sie könnten die
  Geräte-Stammdaten ohnehin nicht lesen.
- **Stammdaten** (`groups/{groupId}/atemschutzGeraet`): lesen jedes
  Gruppenmitglied, schreiben `actionGroupAdminRequired(groupId)` — also der
  globale Admin *oder* der Gruppen-Admin dieser Feuerwehr (Rolle aus PR #752,
  siehe [berechtigungen.md](berechtigungen.md)). Die Firestore-Regel
  steht wörtlich wie bei `vehicle` auf `adminUser()`; geschrieben wird ohnehin
  ausschließlich serverseitig, kein Client hat hier Schreibrechte.
- **Ausrüstungsmängel**: gemeldet über `createAtemschutzMangel`, geschützt mit
  `actionUserRequired()` plus Gruppenprüfung. Bewusst **nicht**
  `actionGroupAdminRequired()`: Am Sammelplatz fällt der Mangel auf, und wer
  ihn bemerkt, verwaltet die Gruppe in aller Regel nicht.

## Bedienung am Sammelplatz

Vier Entscheidungen, die von der ersten Fassung abweichen und aus der Erprobung
stammen:

- **Namenslisten sind Chip-Felder** (`PersonChipsInput`), nicht eine Zeile je
  Person mit „Hinzufügen" darunter. Getippt, Enter, nächster Name; Komma und
  Strichpunkt trennen ebenfalls, weil Listen oft aus einer Nachricht kopiert
  werden. `autoSelect` ist dabei kein Detail: Ohne es verwirft MUI bei
  `freeSolo` den offenen Text, sobald das Feld verlassen wird — der zuletzt
  getippte Name ginge beim Klick auf „Speichern" verloren. Betrifft
  Füllpersonal und Truppmitglieder.
- **„Entsenden" übergibt an eine Einheit und setzt keinen Abmarsch.** Der
  Dialog fragt nach der Einheit, der **Übergabezeit** und dem Druck *bei der
  Übergabe*; der Trupp steht danach auf `zugeteilt`. Den Abmarsch
  (`abmarschZeit`) setzt erst der Einsatzauftrag der Einheit — an ihm hängt
  jede Rechnung der Zeitkontrolle, und ein hier gesetzter Wert ließe die
  Fristen laufen, während der Trupp noch anlegt. Begründung und Zahlen:
  [atemschutz-ablauf.md](atemschutz-ablauf.md).
- **„Zugeteilt" und „Im Einsatz" stehen unter einer Überschrift.** Aus Sicht
  des Sammelplatzes ist der Trupp in beiden Fällen weg; ob er schon anliegt,
  weiß hier niemand. Zwei Überschriften behaupteten eine Auskunft, die es an
  dieser Stelle nicht gibt.
- **„Entsendet an" ist optional** und schlägt **Fahrzeuge und taktische
  Einheiten** des Einsatzes vor — bewusst **keine Personen**. Ein Trupp wird
  einer Einheit unterstellt, nicht einem Menschen; wer sie gerade führt, steht
  an der Einheit und kann wechseln, während der Trupp draußen ist. Ein
  Personenname im Protokoll wäre dann falsch, ohne dass es auffällt. Und am
  Sammelplatz steht oft nur fest, *dass* der Trupp einer Einheit zugeht — ein
  Pflichtfeld führte zu einem erfundenen Eintrag oder zu gar keiner Zeile.
- **Die Anzahl ist nur für Flaschen ohne Nummer da.** Sobald eine Nummer
  dasteht — getippt oder aus dem Bestand gewählt —, verschwindet das Feld und
  die Zeile zählt genau eine Flasche. Sichtbar bleibt es für die
  Sammelerfassung, bei der niemand einzelne Nummern aufnimmt.
- **Ein Scan in der Ausrüstung öffnet sofort Ausgabe oder Rücknahme** — welches
  von beiden, ergibt der Zustand des Stücks. Die Liste danach zu filtern war
  ein Zwischenschritt, den niemand mit Handschuhen tippt. Ohne Stammdatensatz
  oder ohne Schreibrecht bleibt es beim Setzen der Suche.
- **Die Flaschennummer im Füllprotokoll ist die führende Kennung**
  (`geraetKennung`: Inventar-Nr. → Nummer → Seriennummer), nicht die
  Bezeichnung. Eine Flasche ohne eigene Nummer stand sonst als „Atemluftflasche
  CFK 6,8 l" im Protokoll und war von der Nachbarflasche desselben Typs nicht
  zu unterscheiden. Welche Flasche gewählt ist, steht als `geraetDetails` unter
  dem Feld.

## Die Listen sehen gleich aus

Füllprotokoll und Ausrüstung rendern ihre Zeilen über dasselbe Bauteil
(`AtemschutzZeile`), weil sie zuvor auseinanderliefen: Die eine begann die
zweite Zeile mit der Bezeichnung, die andere mit der Wehr. Der Aufbau ist
dreiteilig — Kennung als Überschrift mit den Chips daneben, darunter die
**Wehr zuerst**, darunter Namen, Zeiten und Bemerkungen.

Die Wehr steht vorn, weil am Sammelplatz Stücke mehrerer Feuerwehren
durcheinander liegen und beim Durchsehen genau danach gesucht wird. Die Kennung
steht eine Stufe über dem Fließtext und fett: genug, um sie beim Überfliegen zu
finden, ohne dass eine Liste mit dreißig Flaschen zur Bildschirmseite je Eintrag
wird. Groß und ausführlich ist die Anzeige nur dort, wo *ein* Stück feststeht —
in `GeraetBestaetigung` im Dialog.

## Ein Trupp steht nur einmal auf der Tafel

`gruppiereTrupps` zeigt in den drei Abschnitten oben je Trupp **nur die jüngste
Bereitstellung**. Ein Trupp, der zurückgekommen, wieder bereitgestellt und
erneut hinausgegangen ist, hat zwei Zeilen: die alte auf `zurueck`, die neue auf
`imEinsatz`. Ohne diese Regel stünde er gleichzeitig unter „Im Einsatz" und
unter „Zurück & Regeneration", und wer auf die Tafel schaut, zählt einen Trupp
zu viel. Entschieden wird über `laufendeNummer`, nicht über die Sortierung —
zwei Bereitstellungen können in derselben Sekunde entstehen. Die alte Zeile
bleibt im Protokoll, wo sie als Nachweis hingehört.

Aus demselben Grund trägt `TruppCard` ein `istAktuell`: Nur an der jüngsten
Bereitstellung darf der Zustand geändert werden. Eine ältere Zeile im Protokoll
bot sonst weiterhin „Abmelden" an, obwohl der Trupp längst abgemeldet ist — ein
Klick darauf öffnete eine zweite Wahrheit über denselben Trupp.

Genannt wird ein Trupp über `truppLabel`: **Feuerwehr zuerst**, dann sein Name
(„Neusiedl am See Trupp 1"). „Trupp 1" allein gibt es am Sammelplatz mehrfach,
sobald mehr als eine Wehr da ist.

## Externer Handscanner

Neben der Kamera wird ein **Handscanner als Tastatur** (HID) benutzt: Er tippt
den Code in das gerade fokussierte Feld und schickt ein Enter hinterher. Enter
muss deshalb überall dort etwas Sinnvolles tun, wo ein Code eingegeben werden
kann — an drei Stellen mit bewusst unterschiedlicher Schärfe:

| Feld | Enter |
| --- | --- |
| „Nummer von Hand eingeben" im Scanner-Dialog | Exakter Treffer → gewohnter Weg (klärt auch mehrere Treffer); sonst **der oberste Vorschlag** |
| Flaschennummer im Füllprotokoll | **Nur** ein exakter Treffer wird übernommen |
| Suche im Ausrüstungsreiter | Öffnet Ausgabe/Rücknahme, wenn genau ein Stück übrig bleibt |

Der Unterschied ist Absicht. Im Scanner-Dialog ist ein Code das einzige, was
eingegeben wird — dort darf der oberste Vorschlag gewinnen. Im Füllprotokoll
und in der Suche tippen auch Menschen, und ein zufällig angerissener Vorschlag
dürfte weder eine Fremdflasche überschreiben noch einen Dialog aufreißen.

`autoHighlight` von MUI hilft hier **nicht**: `useAutocomplete` schaltet die
Enter-Auswahl einer automatischen Vorauswahl bei `freeSolo` ausdrücklich ab,
sobald der Benutzer getippt hat (`shouldCommitFreeSoloOverProgrammaticHighlight`)
— sonst ließe sich kein freier Wert mehr eingeben. Deshalb reicht
`GeraetAutocomplete` die angezeigten Vorschläge an `onSubmit` weiter und der
Aufrufer entscheidet.

## Warum die Kennung aus den Stammdaten kommt

Die Anzeige einer Füllzeile nimmt die Kennung des **verknüpften Geräts** und
erst dann die beim Erfassen eingetragene `flaschenNummer`. Grund ist eine Zeile
aus dem Betrieb: Über die Kamera erfasste Flaschen standen als „Atemluftflasche
CFK 6,8 l" im Protokoll, weil der Dialog damals die Bezeichnung ins Feld
schrieb. Die Verknüpfung (`geraetId`) war richtig — nur der eingefrorene Text
war es nicht. Wer die Kennung aus den Stammdaten liest, ist gegen solche
Altlasten und gegen spätere Korrekturen der Stammdaten immun.

## Mangel direkt aus der Sichtkontrolle

Die Sichtkontrolle ist mit **„in Ordnung"** vorbelegt
(`DEFAULT_SICHTKONTROLLE`). Wer eine Flasche in die Hand nimmt, um sie zu
füllen oder auszugeben, sieht sie dabei an — der Regelfall ist die unauffällige
Flasche. Stünde „offen" vorbelegt, wären am Ende des Einsatzes fast alle Zeilen
„offen" und die Angabe damit wertlos. „Offen" bleibt wählbar für den Fall, dass
wirklich niemand hingesehen hat.

Steht die Sichtkontrolle im Füll- oder im Ausgabedialog auf „Mangel", erscheint
dort dieselbe Eingabe wie im eigenen Mangel-Dialog (`MangelFelder`:
Beschreibung und Bilder) und der Mangel wird mitgespeichert. Zuvor setzte der
Zustand nur ein Feld, und der Mangel musste an anderer Stelle noch einmal
erfasst werden — was in der Praxis unterblieb.

Drei Festlegungen dazu:

- **Der Mangel wird vor dem Protokolleintrag angelegt.** Schlägt er fehl, soll
  im Protokoll nicht „Mangel" stehen, ohne dass er in der Mängelliste
  angekommen ist.
- **„Mangel" ohne Beschreibung ist gesperrt.** Sonst entstünde ein Zustand, zu
  dem niemand mehr findet, was war.
- **Zu einer Fremdflasche geht es nicht.** `createAtemschutzMangel` hängt den
  Mangel an ein Gerät der Stammdaten; eine frei getippte Flaschennummer hat
  keins. Der Dialog sagt das und verweist auf die Bemerkung, statt das
  Speichern zu blockieren. Ebenso wird beim Bearbeiten einer Zeile, die schon
  einen `mangelId` trägt, kein zweiter Mangel angelegt.

Ist ein Stück gewählt, steht es als `GeraetBestaetigung` im Dialog: Kennung in
Überschriftgröße, Bezeichnung und Wehr darunter. Vorher war das ein grauer
Hilfstext unter dem Feld — am Sammelplatz wird mit Handschuhen bei Tageslicht
auf ein Handy geschaut, und die Verwechslung zweier Flaschen desselben Typs ist
genau der Fehler, den das Protokoll verhindern soll.

`saveAtemschutzMangel` und `useMangelFehlerText` in `mangelErfassung.ts` sind
der gemeinsame Weg aller drei Stellen. Bildfehler tragen die Schlüssel des
Fahrtenbuchs (`fahrtenbuch.maengel.errors.*`) samt Dateiname und Höchstgröße —
ein zweiter Satz derselben Meldungen liefe auseinander.

## Kamera

Der Scanner nutzt `BarcodeDetector`, wo es das gibt (Chrome, Android-WebView),
und lädt sonst `@zxing/browser` **dynamisch** nach — wer nie scannt, lädt die
Bibliothek nie.

Zwei Fallstricke:

- `getUserMedia` ist ein Secure-Context-API. Über eine `nip.io`-Adresse ohne
  TLS meldet der Scanner `unsupported`; das ist richtig und kein Fehler.
- Die Android-App braucht `android.permission.CAMERA` im Manifest. Sie ist ein
  WebView auf `einsatz.ffnd.at`, die Berechtigung wirkt daher erst mit dem
  nächsten App-Release. Bis dahin steht die Handeingabe gleichwertig daneben —
  die Seite ist ohne Kamera vollständig bedienbar.

### Was gelesen wurde, steht am Bildschirm

Der Scan zeigt **Rohtext, Symbologie und Detektor** an — dauerhaft und für alle,
nicht hinter dem Debug-Schalter. Der Grund ist eine Fehlersuche, die ohne diese
Angaben nicht zu führen war: Wird ein Gerät vorgeschlagen, das nicht zur Flasche
in der Hand passt, sind zwei völlig verschiedene Ursachen möglich, und der
Bildschirm zeigte bisher keine davon.

- Steht dort ein **falscher Text** oder eine falsche Symbologie — ein Etikett in
  Code 128, gemeldet als `code_39` —, ist es ein Fehllesen.
- Steht dort der **richtige** Text, wurde er falsch aufgelöst: `normalizeCode()`
  wirft Trennzeichen weg und `lookupKeys()` durchsucht sechs Felder, zwei
  Stücke können also auf demselben normalisierten Code landen.

`BarcodeScanEvent` trägt deshalb **alle** Rohtreffer eines Bildes, nicht nur den
übernommenen: Liest der native Detektor dasselbe Etikett zugleich als `code_128`
und als `code_39`, entscheidet allein die Reihenfolge, und genau das sieht man
sonst nirgends. Der ZXing-Fallback liefert immer nur einen Eintrag — sein
`MultiFormatReader` bricht beim ersten Leser ab, der etwas herausbekommt.

Die Zeile reist mit dem Treffer weiter bis an `GeraetBestaetigung` im
Folgedialog. Sie dort und nicht nur im Scanner-Dialog zu zeigen ist der
eigentliche Punkt: Bei **genau einem** Treffer schließt sich der Scanner sofort,
und die Ausgabe- oder Füllmaske ist die einzige Stelle, an der die Rohlesung
neben dem gewählten Stück steht — also dort, wo die Verwechslung auffällt.

Solange nichts gelesen ist, steht stattdessen die **Auflösung des Videobildes
und die Zahl der geprüften Bilder** da. „Kamera läuft, Decoder findet nichts"
sah vorher aus wie ein Hänger, und die Auflösung erklärt den Fall: Ein
Strichcode braucht Pixel je Modul. Ein Code-128-Etikett aus 30 cm Abstand ist in
einem 640×480-Bild nachweislich nicht lesbar — der Hook zeichnet das Videobild
1:1 ins Canvas, ohne Zuschnitt auf den Zielrahmen und ohne Hochskalierung. Der
Rahmen im Dialog (`inset: '30% 10%'`) ist reine Dekoration; ausgewertet wird das
ganze Bild.

## Mangel-Verallgemeinerung

`Mangel` trägt seit diesem Feature `itemType`, `itemId` und `itemName`;
`vehicleId`/`vehicleName` sind optional geworden. **Dokumente ohne `itemType`
sind Fahrzeugmängel** — deshalb nie das Feld direkt lesen, sondern
`mangelItemType()`, `mangelItemId()`, `mangelItemName()`.

Bei einem Fahrzeugmangel schreibt `buildMangelDocument` weiterhin *beide*
Feldpaare: Daran hängen die Fahrzeugkarte, ihr Zähler und die Abfrage
`where('vehicleId', '==', …)`.

Der Typfilter auf der Mängelseite arbeitet **im Speicher** und nicht als
`where`-Bedingung: Eine Firestore-Abfrage auf ein fehlendes Feld findet die
alten Dokumente nicht, `mangelItemType()` kennt dagegen die Vorgabe.

Ein Ausrüstungsmangel löst **keine Mail** aus. `notifyMangel` verlangt eine
Fahrt (`entry` + `vehicle`) und wird nur aus `createMangelForEntry` gerufen —
auch ein direkt am Fahrzeug gemeldeter Mangel benachrichtigt heute niemanden.

Er steht auch **nicht im Fahrtenbuch-Wochenbericht**: Der ist der Bericht über
die Fahrzeuge — er listet sie, ihre Fahrten und ihre Warnungen — und eine Mail,
die bereits verschickt wird, sollte nicht stillschweigend eine neue Zeilenart
bekommen. Sichtbar ist der Ausrüstungsmangel auf der Mängelseite unter dem
Typfilter „Atemschutz" und am Ausrüstungsreiter des Einsatzes.
