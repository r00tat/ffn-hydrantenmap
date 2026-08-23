# Sandsackbedarf für den Dammbau

Der Rechner hängt an der gezeichneten **Linie** (`line`): Länge und Verlauf liegen
dort schon, mit aktivem Straßen-Routing als tatsächlicher Straßenverlauf.
Eingestiegen wird über das Fundament-Symbol im Popup der Linie; eine Linie mit
aktivem Rechner heißt in Popup und Elementliste „Dammlinie".

Warum an der Linie und nicht an der Leitung: Eine Dammlinie führt kein Wasser.
Dieselbe Aufteilung wie umgekehrt bei der Löschwasserförderung, die an
`Connection` hängt und nicht an `MultiPointItem` — die Felder stehen dort, wo sie
eine Bedeutung haben.

Dieses Dokument hält fest, **woher jede Zahl kommt**. Das ist keine Formsache:
Die Sackzahl entscheidet über die Nachforderung von Material und Personal, und
eine Zahl, die niemand nachprüfen kann, ist im Führungsvorgang wertlos.

## Herkunft der Zahlen

Anders als bei der Löschwasserförderung gibt es hier **keine maßgebliche
Tabelle**. Der Bedarf ist Geometrie: Querschnitt × Länge, geteilt durch das
verlegte Volumen eines Sackes. Alles, was das Modell an Annahmen braucht, sind

1. das **verlegte Maß** eines gefüllten Sackes,
2. das **Böschungsverhältnis** des Pyramidenstapels,
3. die **Leistungswerte** für Füllen, Transport und Verbauen.

Diese drei sind Planungswerte, nicht Messwerte. Sie stehen unten mit ihrer
Begründung und sind im Rechner **alle überschreibbar** — genau deshalb: Wer einen
belegten eigenen Wert hat, setzt ihn ein, statt gegen eine versteckte Annahme zu
rechnen. Die Vorbelegungen sind so gewählt, dass sie mit den in der
Hochwasser-Fachliteratur verbreiteten Faustwerten zusammenpassen; die
Gegenprüfung steht weiter unten.

> **Offen:** Die drei Annahmen sind noch mit der eigenen Ausbildungsunterlage
> abzugleichen. Bis dahin sind sie als Planungswerte gekennzeichnet und nicht als
> Vorschrift — sie liegen durchgängig auf der sicheren Seite (mehr Säcke, mehr
> Zeit).

## Der Sandsack

| | randvoll | bei 66 % Füllgrad |
| --- | --- | --- |
| Füllvolumen | 15 l | 9,9 l |
| Gewicht bei 1,5 t/m³ | 22,5 kg | **14,9 kg** |

**Zwei Drittel ist der Füllgrad, nicht drei Viertel:** Nur ein zu etwa 2/3
gefüllter Sack lässt sich binden, formt sich beim Verlegen in die Fuge und bleibt
mit rund 15 kg von einer Person tragbar. Über 80 % warnt der Rechner — dann gilt
das verlegte Maß unten nicht mehr, weil der Sack rund bleibt statt flach zu
werden.

Die Formate nach dem **leeren** Sackmaß in cm:

| Format | Füllvolumen | verlegt (L × B × H) | verlegtes Volumen |
| --- | --- | --- | --- |
| 30 × 60 (Standard) | 15 l | 0,50 × 0,30 × 0,10 m | 15,0 l |
| 40 × 60 (groß) | 20 l | 0,50 × 0,40 × 0,10 m | 20,0 l |
| 30 × 50 (klein) | 12,5 l | 0,42 × 0,30 × 0,10 m | 12,6 l |

**Warum zwei Volumen und nicht eines.** Das Füllvolumen sagt, was hineingeht —
daraus kommen Sandmenge und Sackgewicht. Das verlegte Volumen sagt, welchen Raum
der Sack **im Damm** einnimmt, Fugen eingerechnet — daraus kommt die Sackzahl.
Beides über einen Weg zu rechnen wäre in beide Richtungen falsch: Über das
Sandvolumen käme eine Sackzahl heraus, die die Fugen unterschlägt; über das
verlegte Volumen ein Sackgewicht, das keiner trägt.

Beim Standardsack ergibt das **67 Säcke je m³** verbautem Damm.

## Querschnitt je Bauweise

Die Krone ist immer eine **Sacklänge** breit (0,50 m): Weniger lässt sich nicht
verlegen.

| Bauweise | Querschnittsfläche | bis Höhe |
| --- | --- | --- |
| Einreihiger Wall | `Krone × h` | 0,5 m |
| Pyramidenstapel | `h × (Krone + Basis) / 2`, `Basis = 3 h` | 2 m |
| Dammbalken-Ersatz | `2 × Krone × h` | Öffnungshöhe |

**Einreihiger Wall bis 50 cm.** Darüber kippt er unter dem Wasserdruck; der
Rechner warnt und verweist auf den Pyramidenstapel. Der Wall ist die Bauweise für
das rasche Umleiten von Oberflächenwasser, nicht für einen Damm.

**Basis = 3 × Höhe.** Das ist der in der Hochwasser-Fachliteratur verbreitete
Faustwert für einen freistehenden Sandsackdamm — flacher gebaut kippt er, steiler
gebaut sickert er durch. Er steht im Rechner als Feld „Basisbreite je m Höhe" und
ist überschreibbar: Wer an eine Mauer anbaut und nur eine wasserseitige Böschung
braucht, setzt 2.

**Dammbalken-Ersatz** ist der Verbau einer Öffnung — Tor, Hofeinfahrt, Türstock.
Er steckt zwischen den Wangen und braucht keine Böschung, aber zwei Sacklängen
Tiefe, damit er dicht wird und nicht kippt. Deshalb rechteckig und 1,0 m breit.

### Was das je laufendem Meter bedeutet

Standardsack, Pyramidenstapel:

| Dammhöhe | 0,3 m | 0,5 m | 0,8 m | 1,0 m | 1,5 m |
| --- | --- | --- | --- | --- | --- |
| Querschnitt (m²) | 0,21 | 0,50 | 1,16 | 1,75 | 3,75 |
| Säcke je lfm | 14 | 34 | 78 | **117** | 250 |
| Sand je lfm (t) | 0,21 | 0,50 | 1,15 | **1,73** | 3,71 |

Die Zeile „Sand je lfm in t" ist zahlenmäßig praktisch die Zeile „Querschnitt in
m²" — bei 66 % Füllgrad und 1,5 t/m³ ist `0,0099 · 1,5 / 0,015 = 0,99`. Als
Kopfrechnung: **ein m² Querschnitt ist eine Tonne Sand je laufendem Meter.**

### Gegenprüfung

| Faustwert | Modell |
| --- | --- |
| „1 m hoher Sandsackdamm: rund 100 Säcke je lfm" | 117 |
| „je m² Querschnitt rund 1 t Sand" | 0,99 t |
| „Sandsack ca. 15 kg" | 14,9 kg |

Das Modell liegt bei der Sackzahl rund 17 % über dem verbreiteten Faustwert. Das
ist gewollt und kommt aus der Basisbreite: Mit `Basis = 2,5 h` träfe es den
Faustwert genau. Beim Nachfordern von Material ist die höhere Zahl die
brauchbarere — ein Damm, dem 200 Säcke fehlen, ist kein Damm.

## Freibord und Wasserstand

Eingegeben wird die **Dammhöhe**, nicht der Wasserstand. Der Rechner zeigt
daneben, welcher Wasserstand mit dem eingestellten Freibord (Vorbelegung 30 cm)
noch gehalten wird: `Wasserstand = Dammhöhe − Freibord`.

Umgekehrt gerechnet — Wasserstand eingeben, Dammhöhe ableiten — gäbe es zwei
Wahrheiten für dieselbe Höhe, und die Geometrie hängt an der Dammhöhe. Ist das
Freibord so hoch wie der Damm, warnt der Rechner.

### Warum der Pegelstand nicht vorbelegt wird

Der [PegelstandLayer](../src/components/Map/layers/PegelstandLayer.tsx) liefert
Pegelstände in cm über **Pegelnull** — dem Höhenbezug der Messstelle, nicht dem
Gelände an der Dammlinie. Um daraus eine Dammhöhe zu machen, bräuchte es die
absolute Höhe von Pegelnull **und** ein Höhenmodell entlang der Linie; die
Differenz zweier Zahlen mit je einem halben Meter Unsicherheit ist keine
Dammhöhe, sondern eine Zahl, die aussieht wie eine.

Der Pegelstand bleibt deshalb, was er ist: die Lageinformation daneben. Die
Dammhöhe wird von der Einsatzleitung gesetzt, und das Freibord macht sichtbar,
gegen welchen Wasserstand sie gilt.

## Personal und Bauzeit

Der Bedarf wird in **Personenstunden** gerechnet und dann auf die eingesetzten
Kräfte verteilt. Drei Tätigkeiten, drei Leistungswerte, alle je Person und Stunde:

| Tätigkeit | Säcke je Person und Stunde | Begründung |
| --- | --- | --- |
| Füllen | 40 | Trupp aus 3 (2 Schaufeln, 1 Halter) füllt rund 120 Säcke/h |
| Transport | 50 | Tragen und Anreichen über kurze Wege, Kette |
| Verbauen | 60 | Verlegen, Ausrichten, Festtreten |

```
Personenstunden = Säcke × (1/40 + 1/50 + 1/60) = Säcke × 0,0617
Bauzeit         = Personenstunden / Kräfte
Kräfte für Zielzeit = Personenstunden / Zielzeit, aufgerundet
```

Das Modell nimmt die Arbeit als **teilbar** an: Die Kräfte verteilen sich nach dem
Arbeitsanfall auf die drei Tätigkeiten (nach größten Resten, damit die Summe die
eingetragene Zahl trifft), und die Kette läuft durch. Das ist die obere Grenze der
Leistung — Rüstzeit, Wechsel, Ermüdung und Wege sind nicht darin. Für die Frage
„reichen die Kräfte?" ist das die richtige Richtung: Wenn schon die obere Grenze
die Zielzeit reißt, reicht es sicher nicht, und der Rechner warnt.

**Die Zahlen sind unbequem, und das ist die Auskunft.** 100 m Damm mit 0,8 m Höhe
sind 7.800 Säcke, 477 Personenstunden — mit 20 Kräften rund 24 Stunden. Eine
Sandsackfüllmaschine ersetzt den Füllwert (dann eher 200–300 Säcke/h je Anlage),
und genau dafür ist das Feld überschreibbar. Wer die 24 Stunden früh sieht, fordert
früh nach; das ist der Zweck des Rechners.

## Folie und Materialliste

Ein Sandsackdamm ist nicht dicht — dicht ist die Folie auf der Wasserseite. Ihre
Bahnbreite ist mit `2 × Dammhöhe + 1 m` angesetzt: hoch über die wasserseitige
Böschung, über die Krone, und ein Meter für die Fußsicherung, die die Folie
unterströmungssicher hält. Auf die Länge kommen 10 % für die Überlappung der
Bahnen.

Die Materialliste nennt die **Anforderungsmenge**, also mit Sackreserve
(Vorbelegung 10 % für Bruch und Fehlfüllung) — nachgefordert wird, was gebraucht
wird, nicht das rechnerische Minimum. Schaufeln und Füllhilfen richten sich nach
den Kräften, die auf das Füllen fallen (eine Schaufel je Füller, eine Füllhilfe je
zwei).

LKW-Fuhren werden über die **Gesamtmenge** aufgerundet und nicht je Abschnitt: Ein
halb beladener LKW fährt nicht zweimal. Ladevolumen je Fuhre: 8 m³, überschreibbar.

## Mehrere Dammabschnitte

Ein Damm wird selten in einem Stück gebaut: Die Uferstraße bekommt 80 cm, die
Hofeinfahrt einen Dammbalken-Ersatz, der Feldweg 50 cm. Jeder Abschnitt ist eine
eigene Linie mit eigener Höhe und Bauweise.

Nachgefordert wird aber **einmal**. Deshalb summiert
[dammSumme](../src/components/FirecallItems/elements/damm/dammSumme.ts) über alle
Dammlinien der Lage, und der Rechner zeigt die Summe, sobald es mehr als einen
Abschnitt gibt. Sie rechnet mit dem gespeicherten Stand der anderen Abschnitte,
aber mit den Reglerwerten des gerade offenen — sonst zeigte die Gesamtmenge etwas
anderes als die Zeilen darüber.

## Wohin das Ergebnis geht

Der Rechner schreibt **nichts von selbst**. Am Regler wird probiert; in den
Verlauf gehört die Menge, die tatsächlich abgesetzt wurde. Auf Knopfdruck legt
„Materialanforderung ins Tagebuch" **einen** Eintrag der Art `M` im
Einsatztagebuch ab, mit Abschnitt, Sackzahl, Sandmenge, Fuhren, Folie, Bauzeit und
— bei mehreren Abschnitten — der Gesamtsumme.

Die Parameter selbst liegen an der Linie und werden mit „Übernehmen" gespeichert.
Damit steht die geplante Dammlinie samt Bedarf in der Lagekarte und ist nach dem
Einsatz nachvollziehbar.

## Offene Punkte

- **Geländehöhe entlang der Linie.** Gerechnet wird mit konstanter Dammhöhe. Ein
  Höhenprofil gäbe es über
  [ensureConnectionElevation](../src/components/FirecallItems/elements/connection/foerderung/ensureConnectionElevation.ts)
  — dieselbe Abfrage wie bei der Löschwasserförderung. Damit ließe sich die
  Dammhöhe je Abschnitt gegen ein Zielniveau rechnen statt gegen das Gelände am
  Anfangspunkt. Nicht gebaut, weil die Höhengenauigkeit von EU-DEM 25 m in der
  Größenordnung der Dammhöhe selbst liegt: Ein Modell mit ±1 m Unsicherheit taugt
  nicht, um 20 cm Dammhöhe zu bestimmen.
- **Druck-/PDF-Ansicht der Materialanforderung.** Der Tagebucheintrag ist der Weg
  über die vorhandene Dokumentation; eine eigene Druckansicht ist offen.
- **Die drei Planungswerte** (verlegtes Maß, Böschung, Leistungswerte) sind mit
  der eigenen Ausbildungsunterlage abzugleichen, siehe oben.
