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
| Rolle (rein, auch im Client) | [`src/common/bekleidungPermissions.ts`](../src/common/bekleidungPermissions.ts) |
| Namensabgleich beim Import | [`src/common/personNameMatch.ts`](../src/common/personNameMatch.ts) |
| Excel-Import: Parser, Vorschau, Plan | [`src/common/bekleidungImport.ts`](../src/common/bekleidungImport.ts) |
| Guard | [`src/components/Bekleidung/bekleidungGuard.ts`](../src/components/Bekleidung/bekleidungGuard.ts) |
| Server Actions | [`src/components/Bekleidung/bekleidungActions.ts`](../src/components/Bekleidung/bekleidungActions.ts) |
| Rolle vergeben | [`src/components/Bekleidung/bekleidungswartActions.ts`](../src/components/Bekleidung/bekleidungswartActions.ts) |
| Seite | `/bekleidung` |

## Datenmodell

Alle Sammlungen liegen unter `groups/{groupId}/` und werden **nur von Server
Actions** geschrieben.

| Sammlung | Inhalt |
| --- | --- |
| `bekleidungArtikel` | Artikeltyp: `kategorie` (`einsatz`/`dienst`), `bezeichnung`, `hersteller`, `fuehrung` (`einzeln`/`menge`), optional `maxWaschgaenge`, `aktiv` |
| `bekleidungStueck` | Einzelstück eines Artikels mit `fuehrung: 'einzeln'`: `tagNummer` (optional, je Gruppe eindeutig), `groesse`, `charge`, `eigentum`, `status`, aktuelle Ausgabe (`personId`, `ausgabeId`, `ausgegebenAm`), Waschzähler |
| `bekleidungBestand` | Lagerzahl je Artikel mit `fuehrung: 'menge'` und Größe; Dokument-ID aus Artikel und normalisierter Größe (`bestandDocId`) |
| `bekleidungAusgabe` | Verlauf: eine Zeile je Ausgabe, offen solange `zurueckAm` fehlt |
| `bekleidungWaesche` | Waschgang: `datum`, `programm` (`standard`/`impraegnierung`/`sonstiges` mit `programmText`), `stueckIds` |

Ausgegeben wird an die Personen der Gruppe aus dem Fahrtenbuch
(`groups/{groupId}/person`) — dieselbe Liste, damit ein Mitglied nicht zweimal
gepflegt wird.

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

Die Führung lässt sich nicht mehr ändern, sobald Stücke oder Bestand des
Artikels existieren (`fuehrungLocked`) — die Daten passten sonst nicht mehr zum
Modell.

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

Die Rolle heißt **Bekleidungswart** (`user/{uid}.bekleidungswart: string[]`),
gebaut wie der Gerätemeister: Admin oder Gruppen-Admin vergeben sie im Reiter
„Einstellungen", der Gruppen-Admin schließt sie ein, Mitgliedschaft ist
Voraussetzung (siehe [berechtigungen.md](berechtigungen.md)).

Anders als bei Geräten & Material sieht ein einfaches Mitglied **nichts**:
Größen und wer was hat sind keine Gruppenöffentlichkeit. Die Gruppenrollen
stehen nicht im Token, darum liest die Firestore-Regel das Benutzerdokument
(`get()` in `bekleidungRole()`), aber nur nachdem `fahrtenbuchMember()` die
Anmeldung und Mitgliedschaft geprüft hat. Das kostet je Regelprüfung einen
Dokument-Read; bei einer Handvoll Bekleidungswarte ist das vernachlässigbar und
erspart, alle Lesevorgänge über Server Actions zu führen — die Listen
aktualisieren sich live und sind offline aus dem Cache lesbar.

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
- **Doppelte Tag-Nummern** (11 Nummern in 24 Zeilen): Das erste Stück behält die
  Nummer, die anderen bekommen „Tag-Nummer doppelt: …" in die Bemerkung.
- **Status** wird vereinheitlicht; „Reinigung" und „bestellen!" werden `lager`
  mit dem Originaltext in der Bemerkung, „nicht da" wird `nicht_auffindbar`.
- **Freitext in der Namensspalte** ohne Vorname und Datum („Tasche abgerissen –
  Kontrolle") ist eine Bemerkung, keine Person.
- **Datum:** „nicht bekannt" ergibt eine Ausgabe ohne Datum; Jahreszahlen allein
  und unplausible Jahre (Tippfehler wie 0263) gelten als unbekannt mit
  Bemerkung; Text in „zurück am" heißt zurückgegeben, Datum unbekannt.
- **Widersprüche** zwischen Status und Ausgabeblöcken (92 Zeilen) zeigt die
  Vorschau an. Ein offener Block bei einem Stück, das nicht ausgegeben ist, wird
  mit dem Importdatum geschlossen; bei mehreren offenen Blöcken bleibt nur der
  letzte offen. Ein Stück mit Status „ausgegeben" ohne offenen Block bleibt
  ausgegeben, aber ohne Person — Rücknahme und Statuswechsel kommen damit
  zurecht.
- **Personen** werden über Vor- und Nachname in beiden Reihenfolgen abgeglichen;
  fehlende legt der Import nach Bestätigung an. Unsichere Treffer — ähnliche
  Schreibweise (Abstand ≤ 2) oder mehrere gleichnamige Personen — sind
  **nicht vorbelegt**: Ein vorgewählter Kandidat wird leicht übersehen und
  hängt die Ausgaben an die falsche Person. Der Import bleibt gesperrt, bis jede
  unsichere Person einen Kandidaten oder „neu anlegen" hat. Der Server lehnt
  ein „neu anlegen" ab, dessen Name es in der Gruppe schon gibt oder das im
  selben Import zweimal vorkommt (`personExists`).
- **Leere Größe** wird `–` (`GROESSE_UNBEKANNT`): Ohne Größe hätte das Stück
  kein gültiges Pflichtfeld und der Mengenbestand keine Dokument-ID.
- **Datum als ISO-Zeitstempel** (`2023-11-20T00:00:00.000Z`) gilt als
  Kalenderdatum; genommen werden die ersten zehn Zeichen.
- **Artikeltyp** ist Kategorie + Art + Hersteller. Bei Handschuhen steht das
  Modell in der Herstellerspalte, daher entstehen dort viele Artikeltypen.

## Bewusst nicht enthalten

- Ankauf und Budget, Spindraumbelegung, Bestelllisten der Tauschaktionen
- Etikettendruck
- Sicht der Mitglieder auf die eigene Ausrüstung
- Schreiben ohne Netz
- Zusammenführen von Artikeltypen nach dem Import
