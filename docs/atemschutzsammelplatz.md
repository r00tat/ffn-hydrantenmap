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

Der FDISK-Artikelexport hat eine Spalte `Barcodes`. Sie wird importiert und ist
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
übrigen 32 haben eine eigene FDISK-ID und landen sauber in eigenen Dokumenten —
sie zum Überspringen vorzuschlagen hieße, ein Sechstel des Bestands beim Import
zu verlieren.

Nenndruck, Volumen und Material stehen im Export nirgends als Feld; sie werden
aus dem Klartext der Bezeichnung abgeleitet („CFK 6,8 l", „Stahl 6 l") und aus
einer Bemerkung wie „200BAR". Die Ableitung ist eine Erleichterung, keine
Behauptung — im Vorschaudialog ist jeder Wert änderbar. Ebenso die
Bezirksreserve: Im Export steht bei diesen 25 Flaschen als Dienststelle
trotzdem „Neusiedl am See", nur die Bezeichnung verrät sie.

## Berechtigungen

- **Protokolle** (`call/{id}/atemschutz*`): Wer den Einsatz bearbeiten darf,
  führt hier Protokoll. Dafür ist **keine eigene Firestore-Regel nötig** — die
  bestehende `match /{subitem=**}` unter `call/{doc}` deckt jede neue
  Untersammlung ab.
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
- **„Entsendet an" ist optional** und schlägt die **Fahrzeuge des Einsatzes**
  vor, danach die Gruppenkommandanten. Der Trupp wird einem Fahrzeug
  unterstellt, nicht einer Person; und am Sammelplatz steht oft nur fest,
  *dass* er abmarschiert. Ein Pflichtfeld führte hier zu einem erfundenen
  Eintrag oder zu gar keiner Protokollzeile.
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

## Mangel direkt aus der Sichtkontrolle

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
