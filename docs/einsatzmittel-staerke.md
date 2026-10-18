# Stärke der Einsatzmittel: die Schreibweise „1:8" und die Art des Einsatzmittels

## Wer die `1` ist

Die Mannschaftsstärke wird in Österreich als `Führungskräfte : übrige Mannschaft`
angeschrieben. Die `1` vor dem Doppelpunkt ist die **Führungskraft** — beim Fahrzeug
der Fahrzeugkommandant, beim Boot der Bootsführer. Die Zahl dahinter sind alle
weiteren Mitglieder, der Maschinist eingeschlossen. Die Gesamtstärke ist die Summe:
`TLFA 1:8` sind neun Personen, `1:2` ein Trupp, `1:5` eine Staffel, `1:8` eine Gruppe.

Der Fahrer ist also **nicht** die `1` — er steckt in der Zahl dahinter. Ältere
Plan-Dokumente unter `docs/plans/` begründen den Zuschlag mit „+1 für Fahrer"; die
Rechnung stimmt, die Begründung nicht. Für ein Einsatzmittel ohne eigene Führungskraft
macht das den Unterschied, siehe unten.

Deutschland schreibt dieselbe Angabe mit Schrägstrichen und mit angeschriebener
Gesamtsumme (`1/8/9`, vierteilig `1/1/7//9`). Beide Formen tauchen in Meldungen auf,
die hier eingetippt oder von einem Sprachmodell erzeugt werden — deshalb liest
`parseBesatzung()` sie mit.

## Was das Feld speichert

`Fzg.besatzung` hält **nur die Zahl hinter dem Doppelpunkt** — die Mannschaft ohne
Führung. Das Dialogfeld heißt entsprechend „Besatzung 1:? (ohne Kommandant)", die
Anzeige setzt das `1:` davor.

Gelesen wird trotzdem tolerant: `parseBesatzung()` nimmt `8`, `1:8`, `1/8` und `1/8/9`.
Der Grund ist nicht Bequemlichkeit, sondern dass die Schreibweise `1:8` überall sonst
steht. Ohne die Toleranz wurde aus einem über den MCP-Server oder den
Sprachassistenten geschriebenen `"1:8"` per `parseInt` eine `1` — angezeigt als
„1:1", gezählt als zwei Personen. Die schreibenden Wege normalisieren zusätzlich beim
Anlegen, damit im Dokument die kanonische Form landet.

Ohne erfassten Wert zählen die Personen der Besatzungszuordnung
(`call/{id}/crew`). Davon wird die Führungskraft abgezogen, weil das Ergebnis die Zahl
hinter dem Doppelpunkt ist — neun zugeordnete Personen ergeben `1:8`. Ein erfasster
Wert hat Vorrang: Wer die Stärke ausdrücklich einträgt, will nicht, dass eine
unvollständige Zuordnung sie überschreibt.

## Zwei Konventionen in derselben Spalte

Am **Fahrzeug** steht die Mannschaft ohne Führung (`besatzung`, Feld „Besatzung 1:?"),
an der **taktischen Einheit** die Gesamtstärke (`mann`, Feld „Mannschaftsstärke").
`calculateStrength()` addiert deshalb nur beim Einsatzmittel die Führungskraft dazu
und übernimmt bei der Einheit den Wert unverändert. Die Summen stimmen zusammen; wer
aber in ein Fahrzeug die Gesamtstärke einträgt, verschiebt sie um eins.

## Art des Einsatzmittels (#795)

Ein Wechselladeaufbau oder ein Anhänger ist auf der Karte dasselbe Ding wie ein
Fahrzeug — Position, Feuerwehr, Alarmierungs- und Eintreffzeit, dieselbe Liste.
Nur zwei Dinge verhalten sich anders. Deshalb ein Feld `kategorie` am `Fzg` und kein
eigener Item-Typ: Ein eigener Typ zöge Marker, Dialog, Layer-Zuordnung, Export/Import
und Backup mit, ohne dass sich an der Darstellung etwas ändern würde.

| Kategorie   | eigene Führungskraft | Personenzuordnung |
| ----------- | -------------------- | ----------------- |
| `fahrzeug`  | ja                    | ja                |
| `boot`      | ja (Bootsführer)      | ja                |
| `anhaenger` | nein                  | nein              |
| `aufbau`    | nein                  | nein              |

Der Grund ist derselbe für beide Spalten: Ein Aufbau fährt nicht selbst, er wird
gebracht. Seine Mannschaft ist die des Zugfahrzeugs und dort schon gezählt. Stünde
jeder Aufbau mit `1` in der Stärketabelle, wäre die Gesamtstärke des Einsatzes um
jeden Aufbau und jeden Anhänger zu hoch — der Ausgangspunkt von #795. Und wo niemand
sitzt, ist auch die Personenzuordnung im Personal-Board fachlich falsch: Der Aufbau
taucht in keinem Fahrzeug-Auswahlfeld auf. Am Aufbau steht deshalb auch kein `1:0` an,
sondern nichts.

Im Personal-Board bekommt er seit #801 auch keine eigene Spalte mehr. Eine Spalte, in
der nie jemand stehen kann, ist nur Platzhalter — auf dem Desktop schob jede von ihnen
220 px weit die Fahrzeuge aus dem Bild, um die es geht; in einem Einsatz mit
WLA-Bergung, Mulden und Anhängern war das die halbe Breite. Aus dem Einsatz entfernt
werden die Einsatzmittel über die Fahrzeug-Chips oberhalb des Boards, dafür braucht es
die Spalte nicht. Ausgenommen sind Zuordnungen aus der Zeit vor #795: Hängen an einem
Aufbau noch Personen, bleibt er mitsamt Hinweis stehen — sonst wären sie unsichtbar
zugeordnet und ließen sich nicht mehr auf ein Fahrzeug umhängen.

Die ersten drei Werte sind die Kategorien der Fahrtenbuch-Stammdaten
(`FahrtenbuchVehicleKategorie`), damit `kategorieAusName()` weiterverwendet werden
kann; `aufbau` kommt dazu. Im Fahrtenbuch laufen WLA-Aufbauten bei den **Anhängern**,
weil sie kein eigenes Fahrtenbuch führen — auf der Karte ist „Aufbau" die genauere
Auskunft, und die Stärke behandelt beide gleich.

Gepflegt wird das Feld im Fahrzeug-Dialog; der leere Wert („aus dem Namen") bleibt
wählbar. Fehlt es — der Normalfall für alles, was vor dem Feld angelegt wurde —,
leitet `einsatzmittelKategorie()` die Art aus dem Namen ab. Damit rechnet ein
bestehender Einsatz nach dem Reload richtig, ohne dass Daten nachgezogen werden
müssen. Ein gepflegter Wert hat Vorrang: Wer ein Einsatzmittel ausdrücklich
einordnet, will nicht, dass ein Wort im Namen die Einordnung wieder umwirft.

## Fremdorganisation und Farbe

Ein Einsatzmittel trägt zwei weitere Felder: `fremd` (Schaltfeld, `'true'`/`'false'`
wie überall) und `color`. Der Balken auf der Karte wird damit eingefärbt —
`vehicleMarkerColor()` nimmt die gewählte Farbe, sonst Blau bei `fremd` und
sonst Rot.

Der Schalter rechnet nichts anders — er **sortiert**. Besatzung und ATS-Träger
eines Fremdfahrzeugs werden wie an jedem anderen Einsatzmittel gezählt; sie
zählen nur nicht zu den eigenen Kräften. Deshalb liefert `calculateStrength()`
neben der Gesamtsumme zwei Gruppen (`eigene`, `fremde`) derselben Bauart, und
die Stärketabelle zeigt bei gemischter Lage zwei Abschnitte mit je einer
Zwischensumme und darunter die Gesamtsumme. Sind keine Fremdkräfte da, bleibt
die Tabelle wie zuvor eine Liste mit einer Gesamtzeile — ein leerer Abschnitt an
jedem Einsatz der eigenen Wehr wäre Ballast.

Warum überhaupt getrennt: „Wie viele eigene Leute habe ich" und „wer ist sonst
noch da" sind zwei Fragen, und eine Zahl, die beides vermengt, beantwortet
keine von beiden. Die eigene Feuerwehr (`fw`) taugt dafür nicht als Merkmal —
auch eine Fremdorganisation trägt dort einen Namen, und mehrere Feuerwehren im
Einsatz sind alle Feuerwehr. Fremd ist, was keine Feuerwehr ist — gesetzt wird der
Schalter von Hand.

Der Schalter hängt am **Fahrzeug**. Eine taktische Einheit (`tacticalUnit`)
kennt ihn nicht und zählt daher zu den eigenen Kräften; wer fremde Einheiten
ohne Fahrzeug führen will, braucht das Feld dort ebenfalls.

Die Farbe setzt der Schalter **nicht**, er ändert nur die Vorgabe. Sonst
verlöre, wer einmal eine eigene Farbe gewählt hat, sie beim nächsten Umschalten.

## Fahrzeuge nach Feuerwehr in der Besatzung

Im Personal-Board und in jedem Fahrzeug-Auswahlfeld der Besatzung (Tabelle,
Fahrzeugdialog, „Entsendet an" der Atemschutzseiten) stehen die **eigenen**
Fahrzeuge vorne, danach die fremden je Feuerwehr, alphabetisch; fremde ohne
Feuerwehrangabe — Rettung, Polizei — zuletzt unter „Ohne Feuerwehr". Die
Logik steht in `src/common/vehicleGroups.ts`.

Erkennungsmerkmal eines eigenen Fahrzeugs ist der **Name**: Eigen sind die
vorgefertigten Fahrzeuge — dieselbe Liste der Kostenersatz-Fahrzeuge, aus der
die Chip-Leiste Fahrzeuge anlegt (`useKostenersatzVehicles`). Die
Feuerwehrangabe allein trägt nicht, weil sie im Fahrzeugdialog leer vorbelegt
ist: Kommen mehrere Feuerwehren zum Einsatz, wird sie bei den fremden
Fahrzeugen leicht vergessen. Ein solches Fahrzeug hat dann ebenso keine wie
viele gewachsene Einträge der eigenen Wehr — erst der Name trennt die beiden.

Die Regel in der Reihenfolge, in der sie geprüft wird (`isOwnVehicle()`):

1. Als `fremd` markiert → fremd.
2. Feuerwehr gesetzt und nicht die des Einsatzes → fremd. Ein „TLFA 4000"
   aus Weiden gehört nach Weiden, auch wenn die eigene Wehr ein
   gleichnamiges Fahrzeug führt.
3. Vorgefertigtes Fahrzeug → eigen.
4. Feuerwehr ausdrücklich die des Einsatzes → eigen; wer sie einträgt, meint es.
5. Sonst — keine Feuerwehr, kein bekannter Name → fremd, „Ohne Feuerwehr".

Der Vergleich der Feuerwehr ist normalisiert (Groß-/Kleinschreibung,
Leerraum, Präfix „FF"), weil die Chip-Leiste „Neusiedl am See" schreibt und
eine Eingabe von Hand oft „FF Neusiedl am See"; der des Namens ebenso
(Groß-/Kleinschreibung, Leerraum). Die Feuerwehr des Einsatzes ist sein
`fw`, ohne Angabe die Vorgabe „Neusiedl am See".

Die beiden Merkmale können auseinanderlaufen: Ein Fahrzeug einer Nachbarwehr
oder ein Rettungswagen ohne gesetzten `fremd`-Schalter steht im Board bei den
fremden, in der Stärketabelle aber bei den eigenen Kräften. Das ist gewollt — das Board
ordnet nach Zugehörigkeit, die Stärke folgt der ausdrücklichen Kennzeichnung.

Fremden Fahrzeugen wird selten jemand zugeordnet. Ihr Abschnitt im Board ist
deshalb **zugeklappt**, solange dort niemand steht; mit zugeordneten Personen
ist er offen, damit niemand unsichtbar an einem Fahrzeug hängt. Von Hand
umgeschaltet gilt die Wahl, bis die Seite neu geladen wird. Gibt es keine
fremden Fahrzeuge, bleibt alles ohne Überschriften wie zuvor.

## Anzeige und Austausch

`formatBesatzung()` ist die einzige Stelle, die das `1:` schreibt — Marker-Popup,
Einsatztagebuch, Fahrzeugdruck, Stärketabelle und die Zusammenfassung für den
Sprachassistenten gehen darüber. Der Export nach lagekarte.info trägt die Stärke als
Text (`infoData.mannschaftAnz`) und bekommt deshalb ebenfalls die angeschriebene Form
`1:8`, nicht die gespeicherte Zahl (siehe [lagekarte-austausch.md](lagekarte-austausch.md)).

## Schnelleingabe auf der Seite „Einsatzmittel"

Die Eingabezeile oberhalb der Stärketabelle
([EinsatzmittelQuickAdd.tsx](../src/components/pages/EinsatzmittelQuickAdd.tsx), Logik in
[quick-add-utils.ts](../src/components/pages/quick-add-utils.ts)) legt Fahrzeuge und
taktische Einheiten ohne Dialog an. Sie hält sich an die beiden Konventionen oben:

- Am **Fahrzeug** geht das Stärkefeld durch `parseBesatzung()` und landet kanonisch als
  Zahl hinter dem Doppelpunkt — wie bei jedem anderen schreibenden Weg.
- An der **Einheit** speichert `mann` die Gesamtstärke. Gemeldet wird eine Einheit aber
  als „1:8"; `parseTotalStrength()` addiert deshalb die Teile bzw. nimmt bei „1/8/9" die
  angeschriebene Summe. Ein `parseInt` ergäbe aus „1:8" eine `1`.
- Leere Felder bleiben weg statt als `0` gespeichert zu werden — eine `0` am Fahrzeug
  überschriebe den Rückfall auf die Besatzungszuordnung.

Der Schalter **Fremd** steht auf aus und schaltet sich nicht selbst ein. „Fremd" heißt
Fremdorganisation — Rettung, Polizei, Bundesheer —, und eine Nachbarwehr ist Feuerwehr,
keine Fremdorganisation. Eine Vorgabe aus dem Feld „Feuerwehr" (an bei jeder anderen als
der eigenen Wehr) hat deshalb jede nachrückende Feuerwehr fälschlich unter die
Fremdkräfte sortiert; wer eine Fremdorganisation einträgt, schaltet von Hand ein. Das Feld
**Feuerwehr / Organisation** beginnt leer und wird bei jedem Wechsel auf „Fahrzeug" — von
Hand oder nach dem Anlegen einer Einheit — wieder geleert, Fremd geht dabei wieder aus: Nachrückende Kräfte sind in
größeren Einsätzen nicht immer die eigene Feuerwehr, und eine stillschweigend vorbelegte
eigene Wehr landete sonst an fremden Fahrzeugen. Die eigene Feuerwehr steht als erster
Vorschlag in der Liste. Feuerwehr,
Fremd und „Eingetroffen" bleiben nach dem Anlegen stehen — nachrückende Kräfte sind meist
mehrere Fahrzeuge derselben Organisation. Die Chips der eigenen Fahrzeuge legen dagegen
immer eigene Kräfte ohne Stärkeangabe an, auch wenn im Feld gerade eine Nachbarwehr steht.

Ohne „Eingetroffen" setzt die Schnelleingabe die **Alarmierung** auf jetzt. Das
Einsatztagebuch speichert für Einsatzmittel keine eigenen Einträge, es leitet
„alarmiert", „eingetroffen" und „abgerückt" aus diesen Zeitfeldern ab
(`buildDiaries()` in `diary-entries.ts`) — ohne eine der beiden Zeiten stünde das
neue Einsatzmittel nicht im Tagebuch. Das gilt für taktische Einheiten genauso wie
für Fahrzeuge; sie tragen dieselben drei Zeitfelder, die Stärke steht als
„Stärke 9" (Gesamtstärke aus `mann`) statt als „Besatzung 1:8".

Position ist die Einsatzadresse wie beim Personal-Board; wer das Element auf der Karte
genauer haben will, verschiebt es dort.

## Fahrzeuge unter einer taktischen Einheit

Ein Fahrzeug gehört über `Fzg.tacticalUnitId` zu einer taktischen Einheit. Das Feld
steht am **Fahrzeug**, nicht als Liste an der Einheit: Ein Fahrzeug gehört höchstens
einer Einheit an, und so bleibt jede Zuordnung ein Schreibvorgang an einem Dokument —
offline zwei Listen gegeneinander abzugleichen hieße, dass der letzte Schreiber die
Zuordnung des anderen verwirft.

**Einheiten unter Einheiten.** Dasselbe Feld trägt auch die Einheit
(`TacticalUnit.tacticalUnitId`): Eine KHD-Bereitschaft hat zwei Züge, die Züge ihre
Fahrzeuge. Ein Baum statt einer festen Ebene, weil die Gliederung der Formationen
(Trupp, Gruppe, Zug, Bereitschaft, Abschnitt …) je nach Einsatz verschieden tief ist.
Gelesen wird der Baum an jeder Stelle über
[unit-tree.ts](../src/components/pages/unit-tree.ts): `parentMap()` behandelt einen
Verweis auf eine fehlende Einheit und einen **Zyklus** gleich — als „ohne Einheit". Die
Oberfläche bietet einer Einheit weder sich selbst noch etwas unter ihr an
(`parentCandidates()`), ein Zyklus kann aber entstehen, wenn zwei Geräte offline
gleichzeitig umhängen. Dann stehen die betroffenen Einheiten oben, statt dass eine
Rekursion hängt oder Zeilen verschwinden.

**Stärke.** Hängt etwas an einer Einheit, ist ihre Stärke die Summe darunter
(`nestUnderUnits()` in [fahrzeuge-utils.ts](../src/components/pages/fahrzeuge-utils.ts)),
und ihr eingetragenes `mann` tritt zurück. Das gilt auf jeder Ebene: Die Bereitschaft
summiert ihre Züge, ein Zug seine Fahrzeuge — gezählt wird nur die unterste Ebene, ein
Zug ohne Fahrzeuge also mit seinem gemeldeten `mann`. Die Zeile der Einheit trägt dann
`childCount` und zählt in keiner Summe mit — sonst stünde jede Person zweimal in der
Gesamtstärke. Ohne Fahrzeuge bleibt es beim eingetragenen `mann`, damit eine als „1:8"
gemeldete Einheit ohne erfasste Fahrzeuge weiter zählt. Eine Einheit aus lauter fremden
Fahrzeugen ist selbst fremd; sonst stünde sie bei den eigenen Kräften und ihre
Fahrzeuge unter „Fremdkräfte". Der Filter der Tabelle nimmt zur passenden Einheit alles
unter ihr mit und zum passenden Fahrzeug die ganze Kette der Einheiten darüber. Die
Tabelle rückt jede Ebene weiter ein (`depth` an der Zeile).

**Versetzen.** Wer eine Einheit einem Einsatzort zuordnet — in der Tabelle, auf der
Seite „Einsatzorte" oder im Dialog des Einsatzorts —, nimmt alles unter ihr mit, auch
die Züge einer Bereitschaft samt deren Fahrzeugen
(`unitWithVehicles()` und `moveItemsToLocation()` in
[location-assignment.ts](../src/components/pages/location-assignment.ts), ausgeführt von
[useAssignToLocation.ts](../src/components/Einsatzorte/useAssignToLocation.ts)). Je
Einsatzort entsteht genau eine Änderung an `vehicles`, sonst überschriebe die zweite
Schreiboperation die erste. Im Einsatztagebuch steht ein Eintrag „1. Zug mit TLF …
zugeordnet" und je bisherigem Einsatzort einer mit dem, was dort abgezogen wurde. Ein
Fahrzeug oder eine Einheit, die einer Einheit beitritt, wird an deren Einsatzort
versetzt. Ein einzeln
woandershin geschicktes Fahrzeug bleibt in der Einheit; die Übersicht nach Einsatzort
zeigt es dort, wo es steht.

**Schnelleingabe.** Die taktische Einheit hat dort kein Feld „Feuerwehr" mehr: Ein Zug
heißt im Einsatz „FW Neusiedl" oder „1. Zug Nord", und die Organisation in ein zweites
Feld zu zerlegen, war nur Tipparbeit. Nach dem Anlegen einer Einheit springt die Zeile
auf „Fahrzeug" mit der neuen Einheit vorgewählt, sodass ihre Fahrzeuge direkt
hintereinander folgen. Bei „Taktische Einheit" heißt dieselbe Auswahl „Übergeordnete
Einheit": Wer dort die Bereitschaft wählt, legt den Zug darunter an. Die Wahl bleibt
stehen, wie beim Fahrzeug — für den zweiten Zug wählst du die Bereitschaft wieder,
weil die Zeile nach dem ersten Zug auf diesen gesprungen ist. Eine Heuristik „eine Ebene
höher" hätte bei drei Ebenen ebenso oft falsch geraten.

## Übersicht nach Einsatzort

Die Seite „Einsatzmittel" zeigt wahlweise die Tabelle oder je Einsatzort eine Karte
([EinsatzmittelOverview.tsx](../src/components/pages/EinsatzmittelOverview.tsx), Logik in
[einsatzmittel-overview.ts](../src/components/pages/einsatzmittel-overview.ts)). Gibt es
Einsatzorte, ist die Übersicht voreingestellt. Die Tabelle beantwortet „wie viele", die
Übersicht „was steht wo": Einheiten mit ihren Fahrzeugen, der Stand aus den Zeitfeldern
(der späteste erfasste zählt) und die Stärke je Einsatzort nach denselben Regeln wie
die Tabelle. Einsatzorte ohne Einsatzmittel fallen weg, nicht zugeordnete stehen am Ende.

Mit Schreibrecht trägt jede Zeile dieselbe Einsatzort-Auswahl wie die Tabelle
([LocationSelect.tsx](../src/components/pages/LocationSelect.tsx)), und die Zuordnung
läuft über denselben Hook `useAssignToLocation`: Tagebuch, Position auf der Karte und
die Fahrzeuge einer Einheit gehen genauso mit. Zwei Wege mit eigener Logik würden
auseinanderlaufen — die Übersicht bekommt deshalb nur `onAssign` hereingereicht und
bleibt ohne ihn reine Anzeige.
