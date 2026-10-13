# Bekleidung

Einsatz- und Dienstbekleidung einer Gruppe: Bestand, Ausgabe an Personen mit
Verlauf („wann an wen wie lange"), Lagerstand und Wäschen. Bisher wurde das in
einem von Hand gepflegten Excel geführt („Einsatz- und Dienstbekleidung.xlsx"),
das mit der Zeit unübersichtlich wurde; der Import übernimmt dessen
Bestandslisten einmalig.

| Teil | Ort |
| --- | --- |
| Typen, Sammlungsnamen, Größen- und Tag-Normalisierung, Waschzähler | [`src/common/bekleidung.ts`](../src/common/bekleidung.ts) |
| Lagerstand (rein) | [`src/common/bekleidungLagerstand.ts`](../src/common/bekleidungLagerstand.ts) |
| Rechte `bekleidung.read`/`bekleidung.manage` (rein, auch im Client) | [`src/common/permissions.ts`](../src/common/permissions.ts) |
| Namensabgleich beim Import | [`src/common/personNameMatch.ts`](../src/common/personNameMatch.ts) |
| Excel-Import: Parser, Vorschau, Plan | [`src/common/bekleidungImport.ts`](../src/common/bekleidungImport.ts) |
| Guard | `actionPermissionRequired` aus [`src/app/auth.ts`](../src/app/auth.ts) |
| Server Actions | [`src/components/Bekleidung/bekleidungActions.ts`](../src/components/Bekleidung/bekleidungActions.ts) |
| Rolle vergeben | Ansicht „Mitglieder und Rollen" der Gruppe, siehe [berechtigungen.md](berechtigungen.md#wer-vergibt-was) |
| Seite | `/bekleidung` |

## Datenmodell

Alle Sammlungen liegen unter `groups/{groupId}/` und werden **nur von Server
Actions** geschrieben.

| Sammlung | Inhalt |
| --- | --- |
| `bekleidungArtikel` | Artikeltyp: `kategorie` (`einsatz`/`dienst`), `bezeichnung`, `hersteller`, `fuehrung` (`einzeln`/`menge`), optional `maxWaschgaenge`, `aktiv` |
| `bekleidungStueck` | Einzelstück eines Artikels mit `fuehrung: 'einzeln'`: `tagNummer` (optional, je Gruppe eindeutig), `groesse`, `charge`, `eigentum`, `status`, aktuelle Ausgabe (`personId`, `ausgabeId`, `ausgegebenAm`), Waschzähler |
| `bekleidungBestand` | Lagerzahl je Artikel mit `fuehrung: 'menge'`, Größe und optional `charge`; Dokument-ID aus Artikel, normalisierter Größe und Charge (`bestandDocId`) |
| `bekleidungAusgabe` | Verlauf: eine Zeile je Ausgabe, offen solange `zurueckAm` fehlt; bei Mengen die `charge`, aus der sie kam |
| `bekleidungWaesche` | Waschgang: `datum`, `programm` (`standard`/`impraegnierung`/`sonstiges` mit `programmText`), `stueckIds` |

Ausgegeben wird an die Personen der Gruppe (`groups/{groupId}/person`) —
dieselbe Liste wie im Fahrtenbuch, damit ein Mitglied nicht zweimal gepflegt
wird. Gepflegt wird sie auf der Seite „Personal" (siehe
[personal.md](personal.md)); „Neue Person" hier ist nur die Abkürzung während
einer Ausgabe.

### Einzeln oder Menge — je Artikeltyp

Einsatzbekleidung hat Seriennummern (Tag-Nummern), und es zählt, *welche* Jacke
jemand trägt und wie oft *sie* gewaschen wurde. Bei Dienstbekleidung zählt meist
nur die Größe. Statt die Kategorie darüber entscheiden zu lassen, legt es der
Artikeltyp fest (`fuehrung`): Auch Handschuhe oder Stiefel der Einsatzbekleidung
haben keine Tag-Nummer, und manche Dienstbekleidung (A-Mantel) hat eine.

- **einzeln:** jedes Stück ein Dokument; Ausgabe, Rücknahme und Wäsche betreffen
  genau dieses Stück.
- **menge:** nur eine Lagerzahl je Größe; eine Ausgabe trägt `menge`, eine
  Teilrücknahme teilt den Ausgabe-Eintrag in einen geschlossenen und einen
  offenen.

Im Bearbeitungsdialog lässt sich die Führung nicht mehr ändern, sobald Stücke
oder Bestand des Artikels existieren (`fuehrungLocked`) — die Daten passten
sonst nicht mehr zum Modell. Von einzeln auf Menge geht es danach nur über die
Umstellung, die die Daten mitnimmt (siehe „Von einzeln auf Menge umstellen").

### Chargen bei Mengenartikeln

Handschuhe gibt es in mehreren Lieferungen nebeneinander („Brand", „Brand -
2024", „Technisch"), in jeder Größe mit eigener Anzahl. Jede Kombination aus
Artikel, Größe und Charge ist ein **eigenes Bestandsdokument**:
`bestandDocId(artikelId, groesse, charge)` hängt an die bisherige ID `__c_` und
die kodierte, großgeschriebene Charge. Ohne Charge bleibt die ID wie vor den
Chargen, vorhandener Bestand muss also nicht umgeschrieben werden. „brand" und
„Brand" sind dieselbe Charge; gespeichert bleibt die Schreibweise des
vorhandenen Bestands.

- **Ausgabe:** Die Charge wird nur abgefragt, wenn in der Größe mehr als eine
  Charge Bestand hat; sonst nimmt die Oberfläche die einzige. Die Ausgabe trägt
  die Charge, eine Rücknahme bucht in dieselbe Charge zurück.
- **Lagerstand:** Sobald in einer Zeile eine Charge vorkommt, folgt je Charge
  eine eingerückte Zeile (`LagerstandRow.chargen`). Zugang und Korrektur gehen
  dann je Charge, nicht über die Summenzeile.
- **Import:** Die Spalte „Charge" bestimmt den Bestand und geht an die
  Mengen-Ausgaben.

Warum nicht wie bei den Geräten (Chargen als Aufteilung *in* einem
Bestandsdokument, siehe [geraete-lager.md](geraete-lager.md))? Dort hängt die
Zeile am Sybos-Import (`lagerortKey`), Sets und der idempotente Abgleich des
Verbrauchs setzen eine Zeile je Artikel und Lagerort voraus. Nichts davon gibt
es hier; getrennte Dokumente halten Ausgabe, Rücknahme und Korrektur bei
derselben einfachen Transaktion auf genau ein Dokument.

### Eigentum

`eigentum: 'privat'` markiert Stücke, die dem Mitglied selbst gehören
(im Excel: „Eigen" in der Tag-Spalte, meist Handschuhe). Sie erscheinen in der
Übersicht der Person, zählen aber nicht zum Lagerstand.

Bei Mengenartikeln gibt es kein Stück, das das Eigentum tragen könnte. Private
Zeilen eines Mengenartikels im Excel werden deshalb Ausgaben mit
`eigentum: 'privat'`. Sie zählen im Lagerstand nicht als ausgegeben, die
Personenansicht kennzeichnet sie als privat, und eine Rücknahme schließt sie
nur — auch mit Ziel „ins Lager" kommt nichts in den Bestand der Feuerwehr.
Ausgaben aus der App tragen das Feld nicht; sie kommen immer aus dem Bestand.

### Waschzähler

`waschgaenge` zählt die in der App erfassten Wäschen, `waschgaengeAltbestand`
ist der Startwert aus dem Excel, für den es keine einzelnen Waschgänge gibt.
Angezeigt wird die Summe (`totalWaschgaenge`). Das Programm (Standard,
Imprägnierung, Sonstiges) wird je Waschgang festgehalten, damit sich später
ablesen lässt, wie ein Stück behandelt wurde. Eine `maxWaschgaenge` am
Artikeltyp warnt ab 90 % und beim Erreichen, sperrt aber nichts — die Grenze
des Herstellers ist eine Prüfempfehlung, kein Ablaufdatum.

## Rolle und warum per Regel gelesen wird

Die Rolle heißt **Bekleidungswart** (`bekleidungswart` in
`user/{uid}.groupRoles`) und bringt die Rechte `bekleidung.read` und
`bekleidung.manage`. Der Gruppen-Admin hat beide ebenfalls. Vergeben wird sie
wie jede Gruppenrolle in der Ansicht „Mitglieder und Rollen" — vom globalen
Admin oder vom Gruppen-Admin der Gruppe; der frühere Reiter „Einstellungen" auf
`/bekleidung` verlinkt dorthin. Mitgliedschaft ist Voraussetzung (siehe
[berechtigungen.md](berechtigungen.md)).

Anders als bei Geräten & Material sieht ein einfaches Mitglied **nichts**:
Größen und wer was hat sind keine Gruppenöffentlichkeit. Fachrechte stehen
nicht im Token, darum liest die Firestore-Regel das Benutzerdokument
(`hasPerm(groupId, 'bekleidung.read')`, ein `get()` auf `groupPerms`), aber
nur nachdem `member()` Anmeldung und Mitgliedschaft aus dem Claim geprüft hat.
Das kostet je Regelprüfung einen Dokument-Read; bei einer Handvoll
Bekleidungswarte ist das vernachlässigbar und erspart, alle Lesevorgänge über
Server Actions zu führen — die Listen aktualisieren sich live und sind offline
aus dem Cache lesbar. Ein entzogenes Recht wirkt dafür sofort, ohne
Token-Refresh (Hintergrund:
[berechtigungen.md](berechtigungen.md#claim-gegen-get)).

Die Server Actions verlangen zum Pflegen `bekleidung.manage`, reine
Lese-Actions `bekleidung.read` (`actionPermissionRequired`).

Geschrieben wird nur über Server Actions, weil Ausgabe, Rücknahme und Wäsche
Stück, Verlauf und Zähler in **einer Transaktion** fortschreiben: Geben zwei
Personen gleichzeitig dasselbe Stück aus, scheitert die zweite
(`alreadyIssued`). Aus demselben Grund gibt es kein Schreiben offline; die
Knöpfe stehen hinter `OnlineOnly`. Ausgegeben wird im Feuerwehrhaus, mit Netz.

Erwartete Fehler (`alreadyIssued:<id>`, `notEmpty`, …) geben die Actions als
`{ success: false, error }` zurück, statt sie zu werfen: Next.js ersetzt die
Meldung einer geworfenen Ausnahme im Produktionsbuild durch einen allgemeinen
Text, und die Oberfläche braucht den Code. Anders als bei den Geräten gibt es
hier keine Offline-Warteschlange, die auf eine Ausnahme angewiesen wäre.

## Import aus dem Excel

Gelesen werden nur die Blätter „Bestandsliste Einsatzbekleidung" und
„Bestandsliste Dienstbekleidung", gesucht **über den Namen**
(`readXlsxSheetByName`, über `xl/workbook.xml` und die Relationships) — die
Datei hat 16 Blätter, und die Reihenfolge der Blätter entspricht nicht den
Dateinummern. Ankauf, Budget, Spindraumbelegung und die Tauschlisten bleiben
außen vor.

Ablauf: Datei wählen, der Browser zeigt die Vorschau, nach der Bestätigung
parst der Server die Datei **erneut** und schreibt (dem Plan aus dem Browser
wird nicht vertraut). Der Import läuft nur in einen **leeren** Bestand
(`notEmpty`, geprüft über alle fünf Sammlungen samt `bekleidungWaesche`):
Stücke ohne Tag-Nummer lassen sich nicht wiedererkennen, ein zweiter Lauf legte
sie doppelt an.

### Sperre und Zurückrollen

Geschrieben wird in Batches, nicht in einer Transaktion — mehrere hundert
Stücke sprengen deren Grenze. Damit zwei gleichzeitige Importe (zwei Tabs, ein
Doppelklick) nicht beide schreiben, nimmt der Import vorher eine Sperre: In
einer Transaktion liest er `groups/{g}/bekleidungMeta/import`, prüft die Leere
erneut über `limit(1)`-Abfragen und legt die Sperre mit `create` an
(`state: 'running'`). Ein zweiter Import sieht sie und bekommt
`importRunning`; nach dem Erfolg steht sie auf `done` mit Zählern, ein weiterer
Import bekommt `notEmpty`. Kein Client liest oder schreibt `bekleidungMeta`.

Scheitert ein Batch, löscht der Import alle Dokumente des Plans — deren IDs
stehen vorab fest, auch die der neu angelegten Personen — und erst danach die
Sperre. Scheitert auch das Löschen, bleibt die Sperre auf `running`: Lieber
von Hand aufräumen als ein zweiter Import auf halb geschriebene Daten.

### Eigenheiten der Datei

Beobachtet am Stand Oktober 2026 (657 Zeilen Einsatz-, 343 Zeilen
Dienstbekleidung):

- **Spalten** werden über die Kopfzeile zugeordnet; „ Art" steht mit führendem
  Leerzeichen, die Dienstbekleidung hat eine Spalte „Bemerkung" und keine
  „Waschgänge". Danach folgen bis zu vier Blöcke „ausgegeben an" (Nachname,
  Vorname), „ausgegeben am", „zurück am".
- **Zahlen** stehen teils in E-Schreibweise (`2.2081702E7`), Größen als `6.0`,
  Chargen als `2020.0` — normalisiert zu `22081702`, `6`, `2020`.
- **Tag-Spalte:** Zahl oder alphanumerischer Code (mindestens vier Ziffern, keine
  Leerzeichen) ist eine Tag-Nummer; „Feuerwehr" oder leer heißt keine Nummer;
  „Eigen" heißt keine Nummer und Privateigentum; anderer Text wird Bemerkung.
- **Doppelte Tag-Nummern** (11 Nummern in 24 Zeilen) bereinigt man in der
  Vorschau: Je betroffene Zeile steht ein Feld mit der Tag-Nummer. Vorbelegt
  behält die erste Zeile die Nummer, die übrigen sind leer, also ohne Nummer
  (`defaultRowDecisions`). Eine neue Nummer lässt sich eintragen; solange eine
  Nummer — auch gegen eine andere Zeile der Datei — doppelt bleibt, ist der
  Import gesperrt (`findTagCollisions`, im Browser und noch einmal am Server:
  `tagExists`).
- **Status** wird vereinheitlicht; „Reinigung" und „bestellen!" werden `lager`
  mit dem Originaltext in der Bemerkung, „nicht da" wird `nicht_auffindbar`.
- **Freitext in der Namensspalte** ohne Vorname und Datum („Tasche abgerissen –
  Kontrolle") ist eine Bemerkung, keine Person.
- **Datum:** „nicht bekannt" ergibt eine Ausgabe ohne Datum; Jahreszahlen allein
  und unplausible Jahre (Tippfehler wie 0263) gelten als unbekannt mit
  Bemerkung; Text in „zurück am" heißt zurückgegeben, Datum unbekannt.
- **Widersprüche** zwischen Status und Ausgabeblöcken (92 Zeilen) bereinigt man
  ebenfalls in der Vorschau: je Zeile den Status und, bei „ausgegeben", welcher
  offene Block offen bleibt. Ohne Eingriff gilt: Ein offener Block bei einem
  Stück, das nicht ausgegeben ist, wird mit dem Importdatum geschlossen; bei
  mehreren offenen Blöcken bleibt nur der letzte offen. Ein Stück mit Status
  „ausgegeben" ohne offenen Block bleibt ausgegeben, aber ohne Person —
  Rücknahme und Statuswechsel kommen damit zurecht.
- **Entscheidungen je Zeile** gehen als `rows` (Schlüssel `importRowRef`,
  z. B. `einsatz:12`) an den Server; er nimmt nur Zeilen der Datei an. Jede
  Abweichung vom Excel steht als Bemerkung am Stück bzw. an der Ausgabe
  („Status beim Import geändert (Excel: …)", „Tag-Nummer … beim Import
  entfernt"), damit sich später nachvollziehen lässt, was die Liste sagte. Die
  Zahl der offenen Ausgaben je Person in der Vorschau rechnet mit den Werten
  aus dem Excel, nicht mit der Bereinigung.
- **Personen** werden über Vor- und Nachname in beiden Reihenfolgen abgeglichen;
  fehlende legt der Import nach Bestätigung an. Unsichere Treffer — ähnliche
  Schreibweise (Abstand ≤ 2) oder mehrere gleichnamige Personen — sind
  **nicht vorbelegt**: Ein vorgewählter Kandidat wird leicht übersehen und
  hängt die Ausgaben an die falsche Person. Der Import bleibt gesperrt, bis jede
  unsichere Person einen Kandidaten oder „neu anlegen" hat. Der Server lehnt
  ein „neu anlegen" ab, dessen Name es in der Gruppe schon gibt oder das im
  selben Import zweimal vorkommt (`personExists`).
- **Ehemalige Mitglieder:** Das Excel reicht Jahre zurück, viele Namen sind
  nicht mehr aktiv. Der Abgleich läuft deshalb gegen **alle** Personen der
  Gruppe, auch die im Fahrtenbuch schon inaktiven; die Auswahl kennzeichnet
  sie mit „(inaktiv)". Eine fehlende Person ist mit **„neu anlegen
  (inaktiv)"** vorbelegt (`{ create, active: false }`): Wer heute dabei ist,
  steht fast immer schon im Fahrtenbuch, und aktivieren geht danach jederzeit
  — umgekehrt bekäme die Gruppe sonst Dutzende ehemalige Mitglieder als aktiv
  in jede Personenauswahl. Als Entscheidungshilfe zeigt die Vorschau je Person,
  wie viele Ausgaben nach dem Import offen bleiben (`openCount`, nach derselben
  Regel wie der Plan: nur der letzte offene Block einer Zeile mit Status
  „ausgegeben"). Ein Knopf stellt alle neuen Personen **mit** offener Ausgabe
  gesammelt auf aktiv. Eine inaktive Person kann nichts ausgefasst bekommen
  (`personInactive`); offene Ausgaben an sie übernimmt der Import unverändert,
  zurücknehmen geht weiterhin.
- **Lager statt Person:** In den Namensspalten steht manchmal keine Person,
  sondern ein Platz („Achtung! kaputt"). Dafür gibt es je Person die Wahl
  **„Ist ein Lager"** (`{ lagerort }`, der Name wird zum Lagerort). Bleibt der
  offene Block einer Zeile bei einem Lager, liegt das Stück mit diesem
  Lagerort im Lager — bei Mengenartikeln zählt die Zeile zum Bestand. Ein
  geschlossener Block bei einem Lager wird keine Ausgabe, sondern eine
  Bemerkung am Stück („Im Excel bei „…" (von – bis)"): Ein Lager hat keine
  Ausgabehistorie, und eine Person dieses Namens soll nicht entstehen.
- **Leere Größe** wird `–` (`GROESSE_UNBEKANNT`): Ohne Größe hätte das Stück
  kein gültiges Pflichtfeld und der Mengenbestand keine Dokument-ID.
- **Datum als ISO-Zeitstempel** (`2023-11-20T00:00:00.000Z`) gilt als
  Kalenderdatum; genommen werden die ersten zehn Zeichen.
- **Artikeltyp** ist Kategorie + Art + Hersteller. Bei Handschuhen steht das
  Modell in der Herstellerspalte, daher entstehen dort viele Artikeltypen —
  oft nur Schreibvarianten desselben Modells. Siehe „Artikeltypen
  zusammenführen".

## Artikeltypen zusammenführen

Schreibvarianten („Fa. X" und „Fa X") lassen sich an zwei Stellen in einen
Artikeltyp zusammenführen:

- **In der Import-Vorschau,** Reiter „Artikel", Spalte „Zusammenführen mit".
  Die Entscheidung geht als `merge` (Quell- → Ziel-Schlüssel) an den Server;
  der Plan ordnet die Zeilen der Quelle dem Ziel zu und nimmt dessen Führung.
  `invalidMergeReason` lehnt unbekannte Schlüssel, eine Zusammenführung mit
  sich selbst, eine andere Kategorie und Ketten ab — ein Ziel, das selbst
  zusammengeführt wird, wäre nicht eindeutig.
- **Nach dem Import,** Reiter „Artikel", Knopf je Artikel: `mergeArtikel`
  hängt Stücke und Ausgaben um, addiert den Mengenbestand je Größe und Charge
  auf das Ziel und löscht die Quelle. Wäschen hängen an Stücken und bleiben
  unberührt. Nur bei gleicher Kategorie **und** Führung (`mergeMismatch`) —
  ein Einzelartikel wird vorher auf Menge umgestellt. Alles läuft
  in einer Transaktion, damit nichts halb umgehängt liegen bleibt; deshalb
  gibt es eine Obergrenze von 450 Schreibvorgängen (`mergeTooLarge`).

Der Import trennt Artikeltypen nach Kategorie, Bezeichnung **und** Hersteller
(`artikelKey`). Stiefel von Haix, Jolly und Rosenbauer werden so drei
Artikeltypen, obwohl sie für die Ausgabe ein Artikel mit Varianten sind. Damit
die Unterscheidung beim Zusammenführen nach dem Import nicht verloren geht,
gibt es die Option „Hersteller als Charge übernehmen“ (`chargeFromHersteller`,
standardmäßig an). `chargeWithHersteller` stellt den Hersteller vor die
vorhandene Charge, denn das Excel hat eine eigene Chargen-Spalte. Bei Haix
heißt die Charge zum Beispiel „Fire Flash“, bei Fenz „2023“, und daraus werden
„Haix Fire Flash“ und „Fenz 2023“. Fehlt die Charge, steht der Hersteller
allein. Beginnt die Charge schon mit dem Hersteller (Jolly / „Jolly“), bleibt
sie, wie sie ist.

Das gilt für alle Stücke, Ausgaben und Bestände der Beteiligten, auch für die
des Ziels. Dessen Hersteller entfällt danach, weil der Artikel jetzt mehrere
umfasst. Bestand, dessen Charge sich ändert, zieht in das Dokument der neuen
Charge um.

## Von einzeln auf Menge umstellen

Der Import schlägt **einzeln** vor, sobald eine Zeile des Artikels eine
Tag-Nummer trägt. Im Excel stehen aber auch bei A-Bluse oder A-Hose
gelegentlich Nummern, und dann landet jedes Stück als eigenes Dokument. Damit
das ohne erneuten Import (der einen leeren Bestand verlangt) zu beheben ist,
stellt `convertArtikelToMenge` einen Einzelartikel um. Der Dialog im Reiter
„Artikel“ rechnet mit `planConversionToMenge`, derselben Funktion wie der
Server, und zeigt vorher die Zahlen:

- **Lagerstück der Feuerwehr:** zählt als +1 Bestand in Größe und Charge.
- **Ausgabe mit Stückbezug,** offen oder im Verlauf: verliert `stueckId`, bleibt
  als Mengen-Ausgabe erhalten und übernimmt Charge und Eigentum des Stücks.
- **Entfällt:** das private Lagerstück, das ausgeschiedene oder nicht
  auffindbare Stück und das ausgegebene ohne Ausgabe (Import ohne Person). Als
  Menge hat es keine Entsprechung.
- **Geht verloren:** Tag-Nummern und Waschzähler samt Altbestand. Sind
  Wäschen in der App erfasst (`waschgaenge > 0`), bricht die Umstellung ab
  (`hasWaeschen`). Diese Wäschen stehen an den Stücken, ein stiller Verlust
  wäre nicht zu erklären.

Geschrieben wird in zwei Phasen. Zuerst gehen die Ausgaben in Batches zu 400.
Das kann bei einem viel ausgegebenen Artikel mehr sein, als in eine
Transaktion passt. Ein Abbruch in dieser Phase ist unschädlich: Der Artikel ist
noch einzeln geführt, und ein zweiter Lauf schreibt dieselben Werte noch einmal.
Danach laufen in einer Transaktion das Löschen der Stücke, der addierte Bestand
und die neue Führung. Der Plan wird darin neu gerechnet, ein zwischenzeitlich
ausgegebenes Stück zählt also richtig. Stücke und Bestand zusammen sind auf 450
Schreibvorgänge begrenzt (`convertTooLarge`). Geprüft wird vor Phase 1, damit
nichts halb umgestellt liegen bleibt.

Zurück von Menge auf einzeln gibt es nicht: Aus einer Lagerzahl lässt sich
keine Tag-Nummer gewinnen.

## Lagerstand und Stückliste aufgeklappt

Nach dem Import hat ein Artikel Dutzende Größen oder hunderte Stücke. Beide
Reiter zeigen deshalb je Artikel eine Zeile mit den Summen und klappen die
Details erst auf Klick auf. Im Lagerstand sind das die Größen samt Chargen, in
der Stückliste die Stücke, je Artikel seitenweise zu 100. Engen Suche,
Artikel- oder Personenfilter die Stückliste ein, sind die Treffer gleich
aufgeklappt, denn wer sucht, will das Stück sehen.

## Weitergeben und Bemerkungen

Eine Ausgabe lässt sich aus dem Stück-Detail und im Personen-Reiter direkt
öffnen: zurücknehmen, an eine andere Person **weitergeben** oder die Bemerkung
ergänzen. Weitergeben (`reassignItems`) geht ohne Umweg über das Lager: Die
bisherige Ausgabe wird mit dem Datum geschlossen, die neue Person bekommt ab
demselben Datum eine offene. Der Bestand bleibt unberührt, Charge und Eigentum
einer Menge wandern mit. Eine Teilmenge teilt die Ausgabe wie bei der
Rücknahme (gemeinsamer Helfer `closeMengeAusgabe`). Dieselbe oder eine inaktive
Person lehnt der Server ab (`samePerson`, `personInactive`).

Bemerkungen gibt es am Artikel (Hinweis, im Stück- und Ausgabe-Detail
mitgezeigt), am Stück und an jeder Ausgabe, auch einer geschlossenen. Die
eigenen Actions `setStueckBemerkung` und `setAusgabeBemerkung` ändern nur
dieses Feld, damit ein kurzer Nachtrag nicht die übrigen Stammdaten mit
schreibt.

In der Stückliste hat die Charge eine eigene Spalte, und die Artikelzeile
nennt die Stücke je Charge — nach dem Zusammenführen steht dort, welche
Hersteller in einem Artikeltyp stecken.

## Bewusst nicht enthalten

- Ankauf und Budget, Spindraumbelegung, Bestelllisten der Tauschaktionen
- Etikettendruck
- Sicht der Mitglieder auf die eigene Ausrüstung
- Schreiben ohne Netz
