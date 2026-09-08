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

## Anzeige und Austausch

`formatBesatzung()` ist die einzige Stelle, die das `1:` schreibt — Marker-Popup,
Einsatztagebuch, Fahrzeugdruck, Stärketabelle und die Zusammenfassung für den
Sprachassistenten gehen darüber. Der Export nach lagekarte.info trägt die Stärke als
Text (`infoData.mannschaftAnz`) und bekommt deshalb ebenfalls die angeschriebene Form
`1:8`, nicht die gespeicherte Zahl (siehe [lagekarte-austausch.md](lagekarte-austausch.md)).
