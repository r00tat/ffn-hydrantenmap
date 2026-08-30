# Atemschutzsammelplatz

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

- `lookupKeys()` sammelt **sechs** Kennungen: `barcodes`, `nummer`,
  `inventarNr`, `zusatzInventarNr`, `seriennummer`, `externeId`. Die wichtigste
  Brücke zur ASSP-Liste ist `zusatzInventarNr` (`AF-2.16.19` → `2.16.19`).
- `findByCode()` gibt eine **Liste** zurück, nicht ein Gerät. Sobald die
  Barcode-Spalte gepflegt wird, können sich mehrere Flaschen einen Code teilen;
  der Dialog fragt dann nach, statt still den ersten Treffer zu nehmen.

Für Flaschen ohne brauchbaren Barcode lassen sich eigene QR-Etiketten drucken,
und ein gescannter unbekannter Code kann am Gerät als weiterer `barcodes`-
Eintrag angelernt werden (`addAtemschutzBarcode`).

Das Etikett trägt die **Flaschennummer im Klartext**, nicht die Firestore-ID:
Sie steht auch lesbar darauf, `lookupKeys()` findet sie, und das Etikett
überlebt so einen Neuimport der Stammdaten. Gedruckt wird über
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

## Berechtigungen

- **Protokolle am Einsatz** (`call/{id}/atemschutzTrupp`,
  `call/{id}/atemschutzAusgabe`): Wer den Einsatz bearbeiten darf, führt hier
  Protokoll. Dafür ist **keine eigene Firestore-Regel nötig** — die bestehende
  `match /{subitem=**}` unter `call/{doc}` deckt jede neue Untersammlung ab.
- **Füllprotokoll** (`groups/{groupId}/atemschutzFuellung`): lesen *und
  schreiben* jedes Gruppenmitglied (`fahrtenbuchMember()`). Anders als bei den
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
- **„Entsendet an" ist optional** und schlägt **Fahrzeuge und taktische
  Einheiten** des Einsatzes vor — bewusst **keine Personen**. Ein Trupp wird
  einer Einheit unterstellt, nicht einem Menschen; wer sie gerade führt, steht
  an der Einheit und kann wechseln, während der Trupp draußen ist. Ein
  Personenname im Protokoll wäre dann falsch, ohne dass es auffällt. Und am
  Sammelplatz steht oft nur fest, *dass* der Trupp abmarschiert — ein
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
  (`geraetKennung`: Nummer → Inventar-Nr. → Seriennummer), nicht die
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
