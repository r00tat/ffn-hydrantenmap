# Sandsackbedarf für den Dammbau

Der Rechner hängt an der gezeichneten **Linie** (`line`): Länge und Verlauf liegen
dort schon, mit aktivem Straßen-Routing als tatsächlicher Straßenverlauf. Eine
Linie mit aktivem Rechner heißt in Popup und Elementliste „Dammlinie".

Zwei Wege hinein, genau wie bei der Löschwasserversorgung:

- **Auf der Karte** über das Fundament-Symbol im Popup der Linie — das
  schwebende Panel neben der Lage, wenn die Linie schon da ist.
- **Über die Seite „Dammbau"** aus der Seitenleiste
  ([components/pages/Dammbau.tsx](../src/components/pages/Dammbau.tsx)): schmale
  Karte links, Liste der Abschnitte und Rechner rechts. Diese Seite ist der Weg,
  wenn noch nichts gezeichnet ist — die Frage „reichen Säcke und Kräfte für diese
  Strecke?" kommt **vor** dem Zeichnen. Der Knopf „Dammlinie einzeichnen" steckt
  eine Strecke ab, die dabei entstehende Linie ist sofort gewählt und gerechnet.

Beide zeigen denselben Rechner (`SandsackRechner`); nur der Rahmen ist ein
anderer. Die Karte der Seite ist bewusst nicht die Einsatzkarte, sondern die
schmale [RechnerMap](../src/components/Map/RechnerMap.tsx), die sie mit der Seite
„Löschwasserversorgung" teilt.

Dieses Dokument hält fest, **woher jede Zahl kommt**. Das ist keine Formsache:
Die Sackzahl entscheidet über die Nachforderung von Material und Personal, und
eine Zahl, die niemand nachprüfen kann, ist im Führungsvorgang wertlos.

## Quelle

**Maßgeblich:** „Feuerwehr und Hochwasser", Abschnitt 3.3 „Sandsackanwendung und
Dammverteidigung", Lehrunterlage `LU_TE3_Gesamt_Teil1_20200130_v03`, S. 34–37.

Alle Kennzahlen des Rechners stehen dort. Es wird **nichts abgeleitet, was die
Unterlage selbst angibt** — dieselbe Haltung wie bei der Reibungstabelle der
Löschwasserförderung: Wo eine Tabelle da ist, wird die Tabelle genommen.

Was aus der Unterlage stammt, und wo:

| Kennzahl | Wert | Seite |
| --- | --- | --- |
| Sackformat | 30 × 60 cm (auch 40 × 70) | 35 |
| Sackgewicht | trocken ca. 15 kg, nass ca. 20 kg | 35 |
| Füllgrad | „bis max. 2/3 ihres Volumens" | 36 |
| Sand | Korn bis 8 mm, Sand-Kies bis 16 mm, trocken und frostfrei | 34 |
| Sandbedarf beim Füllen | ca. 1 m³ je Mann und Stunde | 36 |
| Befüllleistung | Tabelle je Truppgröße, mit/ohne Trichter, mit/ohne Rödeln | 36 |
| Transport händisch | 80–100 Säcke je Person und Stunde, 10 m weit | 36 |
| Sandsackkette | je Meter etwa 1 Helfer | 36 |
| Säcke je Fläche | 8 Säcke/m² | 37 |
| Säcke je Volumen | 80 Säcke/m³ | 37 |
| Palette | 50 Säcke, ca. 1000 kg | 37 |
| LKW | 10 t = 10 Paletten = 500 Säcke | 37 |
| Sackbedarf und Verlegezeit | Tabelle je Dammhöhe | 37 |
| Notdamm | „ungefähr die Hälfte der Säcke und die Hälfte der Zeit" | 37 |

Nicht aus der Unterlage und deshalb als Vorbelegung gekennzeichnet: das
**Freibord** (30 cm), die **Sackreserve** (10 %) und der **Folienbedarf**. Sie
sind unten je einzeln begründet und im Rechner überschreibbar.

## Der Sandsack

| | randvoll | bei 66 % Füllgrad |
| --- | --- | --- |
| Füllvolumen | 15 l | 9,9 l |
| Gewicht trocken bei 1,5 t/m³ | 22,5 kg | **14,9 kg** |
| Gewicht nass | 30 kg | **19,8 kg** |

Das Standardformat ist auf die Unterlage **kalibriert**, nicht geschätzt:

- 8 Säcke je m² verlegter Fläche sind 0,125 m² je Sack — hier 0,50 × 0,25 m.
- 80 Säcke je m³ sind 0,0125 m³ verlegt je Sack. Mit 0,125 m² Grundfläche ist die
  **Lagenhöhe 10 cm**; beide Kennzahlen der Unterlage passen also zusammen.
- 15 kg trocken bei einer Schüttdichte von 1,5 t/m³ sind 0,010 m³ Sand. Bei „max.
  2/3" ist das ein randvolles Volumen von 0,015 m³.

Damit schließt sich der Kreis: Bei 66 % Füllgrad rechnet das Modell 80,8 Säcke je
m³ gegen die 80 der Unterlage — ein Prozent mehr Säcke, und das ist die richtige
Seite.

**Das verlegte Volumen ist keine Eigenschaft des Formats**, sondern folgt aus dem
Inhalt: 0,0125 m³ verlegt bei 0,010 m³ Sand sind ein Viertel mehr, und dieser
Fugenanteil bleibt gleich, wenn der Sack voller wird. Ein zu 100 % gefüllter Sack
nimmt mehr Raum ein — es gehen weniger Säcke in einen m³ Damm, und der Sack wird
nass 30 kg schwer. Ab 25 kg nass warnt der Rechner: Den trägt niemand mehr.

**Das große Format nimmt nicht mehr Sand auf.** Die Unterlage nennt „30x60
(40x70) cm" mit **demselben** Gewicht. Der größere Sack wird also nur weniger
voll — und liegt dafür flacher und formschlüssiger. Deshalb steht je Format das
Volumen des randvollen Sackes, und der Füllgrad sagt, was hineinkommt. Ein 40 ×
70 zu 66 % gefüllt ist nass 30 kg schwer, und der Rechner sagt das.

**Zubinden (Rödeln)** halbiert die Befüllleistung — und ist für einen Damm nicht
vorgesehen. Die Unterlage ist eindeutig: „Sack nicht zubinden, wenn er für
weitgehend wasserdichte Dammerhöhung, Ring- oder Notdämme verwendet wird", denn
nicht zugebundene Säcke passen sich Unebenheiten besser an. Zugebunden wird für
den Verbau von Dammschäden, zur Beschwerung und im Unterwasserbau. Vorbelegung
deshalb: **nicht zubinden**.

## Sackbedarf je Meter

Die maßgebliche Tabelle (S. 37, „Bedarf an Helfern zum Verlegen"):

| Höhe in m | 0,5 | 1,0 | 1,5 | 2,0 |
| --- | --- | --- | --- | --- |
| **Säcke je Meter** | **40** | **120** | **275** | **500** |
| Minuten je Meter bei 10 Helfern | 3 | 9 | 21 | 38 |

### Warum die Tabelle und kein Querschnittsmodell

Naheliegend wäre, ein Trapez mit Böschung anzusetzen und daraus die Sackzahl zu
rechnen. Das geht nicht auf. Ein Trapez mit Kronenbreite c und Basis s·h hat die
Fläche `c·h/2 + s·h²/2` — ein Polynom `a·h + b·h²` mit **positivem** a. Aus der
Tabelle gefittet:

| Stützstellen | a | b | Vorhersage bei 2,0 m | Tabelle |
| --- | --- | --- | --- | --- |
| 0,5 / 1,0 | 40 | 80 | 400 | **500** |
| 1,0 / 2,0 | −10 | 130 | — | — |

Über 0,5 und 1,0 gefittet liegt das Modell bei 2 m um 20 % zu niedrig; über 1,0
und 2,0 gefittet wird a negativ, also unphysikalisch. Die Reihe wächst
**überquadratisch** (von 1 m auf 2 m wäre das Vierfache 480, die Tabelle sagt
500), und kein Trapezquerschnitt wird überquadratisch. Ein aus der Tabelle
„eruiertes" Böschungsverhältnis trägt genau die Tabelleninformation, nur schwerer
nachprüfbar — dasselbe Argument wie bei der Reibungstabelle.

**Interpoliert wird in h², nicht in h**: Der Bedarf wächst mit dem Querschnitt.
Unter der ersten Zeile wird auf (0 | 0) hinuntergeführt, über der letzten mit der
Steigung des letzten Abschnitts weiter — und dort warnt der Rechner, dass die
Tabelle zu Ende ist.

### Gegenprüfung mit der zweiten Tabelle

Die Unterlage hat auf S. 35 eine zweite Tabelle, „Sandsackbedarf für 100
Laufmeter", mit Spannen und Anordnungsskizzen:

| Höhe | Anordnung | je 100 m | je lfm | Modell |
| --- | --- | --- | --- | --- |
| 10 cm | quer, einlagig | 400–500 | 4–5 | 4,0 (Wall) |
| 30 cm | quer, mehrlagig | 800–1.250 | 8–12,5 | 12,1 (Wall) |
| 30 cm | Stapel | 2.400–3.000 | 24–30 | 14,4 (Tabelle) |
| 50 cm | Stapel | 4.000–7.000 | 40–70 | **40** |
| 100 cm | Stapel | 12.000–14.000 | 120–140 | **120** |

Vier von fünf Zeilen treffen. Bei 50 cm und 100 cm trifft das Modell die
**untere** Grenze der Spanne — die Verlegetabelle nennt genau diese Werte. Das ist
konsistent und heißt: Die Spanne nach oben (bis +17 %) deckt Sackgröße, Füllgrad,
Sandfeuchte und Verlegeart ab, wie die Unterlage selbst schreibt. Genau dafür ist
die **Sackreserve** da. Bemerkenswert ist, dass auch der geometrische Wall die
Tabelle trifft (4,0 gegen 4–5 bei 10 cm, 12,1 gegen 8–12,5 bei 30 cm), obwohl er
gar nicht aus ihr kommt — die verlegten Sackmaße der Unterlage stimmen mit ihren
eigenen Bedarfszahlen zusammen.

Nur die Stapelzeile bei 30 cm weicht ab: 14,4 gegen 24–30. Das ist die Grenze der
Extrapolation unterhalb der ersten Tabellenzeile. Wer einen 30 cm hohen Damm als
Stapel baut, sollte die Zahl daher als untere Schranke lesen — für diese Höhe ist
sie aber klein genug, dass die Reserve sie trägt.

### Bauweisen

| Bauweise | Sackbedarf | Grenzen |
| --- | --- | --- |
| **Pyramidenstapel** | Verlegetabelle | bis 2 m (Tabellenende) |
| **Notdamm** | halbe Tabelle | dito |
| **Einreihiger Wall** | Geometrie, eine Sacklänge breit | bis 30 cm |
| **Dammbalken-Ersatz** | Geometrie, zwei Sacklängen breit | Öffnungshöhe |

Der **Notdamm** ist keine eigene Rechnung, sondern die Aussage der Unterlage:
„Beim Aufbau eines Sandsacknotdammes kann ungefähr von der Hälfte der Sandsäcke
und der Hälfte der Zeit ausgegangen werden." Die halbe Zeit ergibt sich von
selbst — die Verlegezeit hängt an der Sackzahl.

Den **einreihigen Wall** zeigt die Unterlage bis 30 cm; darüber nur noch Stapel.
Der Rechner warnt entsprechend. Der **Dammbalken-Ersatz** ist der Verbau einer
Öffnung — Tor, Hofeinfahrt, Türstock. Er steckt zwischen den Wangen und braucht
keine Böschung, aber zwei Sacklängen Tiefe, damit er dicht wird und nicht kippt.

### Der Querschnitt kommt aus der Sackzahl, nicht umgekehrt

Für das Bild braucht es eine Form. Sie wird **zurückgerechnet**: Die Tabelle sagt
die Säcke je Meter, das verlegte Volumen macht daraus eine Fläche, und ein Trapez
mit einer Sacklänge Krone gibt die Basis.

| Dammhöhe | Säcke/m | Querschnitt | Basis | Basis ÷ Höhe |
| --- | --- | --- | --- | --- |
| 0,5 m | 40 | 0,50 m² | 1,48 m | 2,97 |
| 1,0 m | 120 | 1,49 m² | 2,47 m | 2,47 |
| 1,5 m | 275 | 3,40 m² | 4,04 m | 2,70 |
| 2,0 m | 500 | 6,19 m² | 5,69 m | 2,85 |

Damit stimmen Bild und Zahl aus **einer** Quelle: Gezeichnet wird der Damm, für
den die Tabelle ihre Säcke nennt. Die Basis liegt bei rund dem 2,5- bis
3-fachen der Höhe — was den Faustwert „Basis = 3 × Höhe" aus der
Hochwasserliteratur bestätigt, ihn aber nicht mehr braucht.

### Das Feld „Basisbreite"

Der Wert ist ein **Faktor auf die Dammhöhe**, keine Länge und keine Rate je
Meter: `Basis = Faktor × Dammhöhe`.

| Basisbreite | bei 0,5 m Höhe | bei 1 m Höhe | bei 1,5 m Höhe |
| --- | --- | --- | --- |
| 2 | 1,00 m | 2,00 m | 3,00 m |
| 3 | 1,50 m | 3,00 m | 4,50 m |
| 4 | 2,00 m | 4,00 m | 6,00 m |

Die Böschung je Seite folgt daraus: `(Basis − Krone) / 2` waagrecht auf die
Dammhöhe senkrecht. Bei 3 und 1 m Höhe sind das 1,25 m je Seite, also etwa
1:1,25.

**Das Feld ist leer, und das ist der Normalfall.** Leer heißt: aus der
Verlegetabelle rechnen. Ein eingetragener Wert ist eine **Handeingabe** und
schaltet auf die Geometrie um — für den Fall, dass an eine Mauer angebaut wird
und nur eine wasserseitige Böschung nötig ist. Der Rechner sagt in beiden Fällen
über der Sackzahl, woher sie kommt. Dasselbe Muster wie die Handeingabe des
Höhenunterschieds bei der Löschwasserförderung: Handeingabe schlägt die
abgeleitete Quelle, und man sieht, welche gilt.

## Freibord und Wasserstand

Eingegeben wird die **Dammhöhe**, nicht der Wasserstand. Der Rechner zeigt
daneben, welcher Wasserstand mit dem eingestellten Freibord noch gehalten wird:
`Wasserstand = Dammhöhe − Freibord`. Umgekehrt gerechnet gäbe es zwei Wahrheiten
für dieselbe Höhe, und der Sackbedarf hängt an der Dammhöhe.

Die Vorbelegung von **30 cm ist nicht aus der Unterlage** — sie enthält zum
Freibord eines Sandsackdammes keine Angabe. 30 cm sind der in der
Hochwasserliteratur übliche Zuschlag gegen Wellenschlag und Setzung. Das Feld ist
überschreibbar; ist das Freibord so hoch wie der Damm, warnt der Rechner.

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

Gerechnet wird in **Personenstunden** je Sack, aus drei Leistungswerten der
Unterlage.

### Füllen — Tabelle je Truppgröße (S. 36)

| Team | ohne Trichter, ohne Rödeln | ohne Trichter, mit Rödeln | mit Trichter, ohne Rödeln | mit Trichter, mit Rödeln |
| --- | --- | --- | --- | --- |
| 2 Personen | 60 | 30 | 100 | 50 |
| 6 Personen | 320 | 160 | 400 | 200 |
| 10 Personen | 500 | 250 | 600 | 300 |
| 50 Personen | 2500 | 1250 | 3000 | 1500 |

Es ist eine **Trupp**leistung, keine Personenleistung: Der Zweiertrupp bringt 30
Säcke je Person und Stunde, der Zehnertrupp 50. Die Kette braucht eine
Mindestgröße, um zu laufen. Nachgeschlagen wird deshalb mit der **ganzen
Mannschaft** — das ist das „Team", von dem die Tabelle spricht —, und
zwischen den Zeilen linear in der Truppgröße: Doppelt so viele Schaufeln füllen
doppelt so viele Säcke, solange Sand da ist. Dass die Füllleistung je Person mit
der Truppgröße steigt, ist der Grund, warum die Bauzeit schneller fällt als bloß
umgekehrt proportional zum Personal.

Die Unterlage nennt dazu die Sandseite: **ca. 1 m³ Sand je Mann und Stunde**.
Beim Zehnertrupp sind 500 Säcke je Stunde 5 m³ Sand — die Sandzufuhr muss also
mithalten, sonst ist sie das langsamste Glied. Der Rechner rechnet das nicht,
aber die Zahl steht hier, damit sie beim Planen der Fuhren nicht vergessen wird.

Eine Füllanlage kennt die Unterlage nur qualitativ („eine deutliche Steigerung
der Befüllleistung ist durch den Einsatz von Befüllanlagen möglich"). Deshalb ist
die Füllleistung von Hand überschreibbar; die Tabelle gilt, solange das Feld leer
ist.

### Transport — 80 Säcke je Person und Stunde auf 10 m (S. 36)

„In einer Stunde bewegt ein Mann ca 80 – 100 Sandsäcke 10 m weit (Aufnehmen,
Transportieren, Ablegen)." Genommen wird die **untere** Grenze: Beim Nachfordern
von Kräften ist die vorsichtige Zahl die brauchbarere.

Gerechnet wird umgekehrt proportional zur Trageweite — 20 m weit sind halb so
viele Säcke. Das unterschlägt, dass Aufnehmen und Ablegen von der Weite
unabhängig sind, und liegt damit wieder auf der sicheren Seite. Dazu die
Faustregel der Unterlage: **je Meter Kette etwa 1 Helfer**; der Rechner nennt sie
neben der Trageweite.

### Verlegen — 80 Säcke je Person und Stunde

Nicht angenommen, sondern **aus der Verlegetabelle abgeleitet**. Die Zeitzeile
mal 10 Helfer, geteilt durch die Sackzahl, ergibt über alle vier Höhen denselben
Wert:

| Höhe | 0,5 m | 1,0 m | 1,5 m | 2,0 m |
| --- | --- | --- | --- | --- |
| Personenminuten je Sack | 0,75 | 0,75 | 0,76 | 0,76 |
| Säcke je Person und Stunde | 80 | 80 | 78,6 | 79,0 |

Das ist die Aussage hinter der Zeitzeile: Verlegen kostet rund 0,75
Personenminuten je Sack, unabhängig von der Dammhöhe. Die Streuung ist die
Rundung der Tabelle.

### Die Rechnung

```
Personenstunden je Sack = 1/Füllen + 1/Transport + 1/Verlegen
Bauzeit                 = Säcke × Personenstunden je Sack / Kräfte
```

Die Kräfte verteilen sich nach dem Arbeitsanfall auf die drei Tätigkeiten (nach
größten Resten, damit die Summe die eingetragene Zahl trifft).

### Vorgegeben wird eines von beiden

Personal und Zeit sind **eine** Gleichung. Beides einzugeben und beides
zurückzubekommen hieße, dieselbe Rechnung zweimal in verschiedene Richtungen zu
führen und zwei Zahlen zu erhalten, von denen keine gilt. Deshalb gibt es im
Rechner einen Umschalter:

| Vorgabe | Eingabe | Ergebnis |
| --- | --- | --- |
| **Kräfte** (Vorbelegung) | eingesetzte Kräfte | Bauzeit |
| **Fertigstellung** | gewünschte Zeit | Personalbedarf |

Vorbelegt sind die **Kräfte**: Im Einsatz ist zuerst bekannt, wer da ist — die
Frage lautet dann, wie lange es dauert. Wer von der anderen Seite kommt
(„der Damm muss bis 22 Uhr stehen"), schaltet um.

Bei Vorgabe der Zeit wird die **kleinste** Mannschaft gesucht, die sie hält. Das
geht, weil die Bauzeit monoton mit dem Personal fällt — und sie fällt schneller
als bloß umgekehrt proportional, weil die Füllleistung je Person mit der
Truppgröße steigt. Genau deshalb hängen auch Leistungswerte und Kräfteverteilung
an der **gerechneten** Mannschaft und nicht an einer eingetragenen: Ein Trupp von
40 füllt anders als einer von 12. Hält keine Mannschaft die Zeit, sagt der
Rechner das statt eine Zahl zu nennen.

**Die Probe ist die Unterlage selbst.** 100 m Damm mit 1 m Höhe sind 12.000
Säcke. Bei 80 Säcken je Person und Stunde und 10 Helfern entfallen
12.000 ÷ 80 ÷ 10 = **15 h** aufs Verlegen — genau die 9 Minuten je Meter mal 100
Meter aus der Verlegetabelle. Das Modell reproduziert die Zeile, aus der es
kommt.

Insgesamt sind es für diesen Damm mit 10 Kräften ohne Füllhilfe 0,045
Personenstunden je Sack, also 540 Personenstunden und **54 Stunden Bauzeit**.
Die Zahlen sind unbequem, und das ist die Auskunft: Wer die 54 Stunden früh
sieht, fordert früh nach. Mit Füllhilfe, kurzer Kette und mehr Kräften wird es
deutlich weniger — genau dafür sind die Felder da.

## Logistik

Alles aus der Unterlage (S. 37):

- **50 Säcke je Palette**, Palette ca. 1000 kg. Mit 20 kg je nassem Sack geht das
  genau auf — die Palette ist nass gerechnet.
- **LKW 10 t = 10 Paletten = 500 Säcke.** Der Rechner nennt Paletten und
  LKW-Fuhren getrennt; die Nutzlast ist überschreibbar.
- Für den **losen Sand** zur Füllstelle gilt dieselbe Nutzlast: Sandmasse ÷ 10 t.

Aufgerundet wird über die **Gesamtmenge** und nicht je Abschnitt: Ein halb
beladener LKW fährt nicht zweimal.

## Folie und Materialliste

Ein Sandsackdamm ist nicht dicht — dicht ist die Folie auf der Wasserseite. Die
Unterlage nennt Vliese und Folien als Verteidigungsmittel, gibt aber **kein Maß**
an. Die Bahnbreite ist deshalb als Planungswert mit `2 × Dammhöhe + 1 m`
angesetzt: hoch über die wasserseitige Böschung, über die Krone, und ein Meter
für die Fußsicherung. Auf die Länge kommen 10 % für die Überlappung der Bahnen.

Die Materialliste nennt die **Anforderungsmenge**, also mit Sackreserve
(Vorbelegung 10 % für Bruch und Fehlfüllung) — nachgefordert wird, was gebraucht
wird, nicht das rechnerische Minimum. Sie ist zugleich die Antwort auf die Spanne
der 100-Laufmeter-Tabelle oben. Schaufeln und Füllhilfen richten sich nach den
Kräften, die auf das Füllen fallen.

Zum Sand hält die Unterlage fest: **Korngröße bis 8 mm**, Sand-Kiesgemisch bis
16 mm, trocken und frostfrei — „je feiner der Sand desto dichter wird der
Sandsack im nassen Zustand".

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

**Die Bauzeit summiert sich nicht, sie ist die des längsten Abschnitts:** Jeder
Abschnitt hat seine eigene Mannschaft, und die Abschnitte werden gleichzeitig
gebaut. Fertig ist der Damm, wenn der letzte steht.

**Beim Personal zählt die Summe.** Nachgefordert werden Kräfte genauso wie
Material, und gebraucht wird die Zahl über **alle** Abschnitte — nicht die des
Abschnitts, den man gerade angeklickt hat. Sie steht deshalb als eigene Zeile im
Gesamtbedarf auf der Seite, in der Summentabelle des Rechners und im
Tagebucheintrag der Materialanforderung.

Gezählt werden die **wirksamen** Kräfte je Abschnitt: die eingetragenen, wo die
Kräfte vorgegeben sind, und die gerechneten, wo die Fertigstellung vorgegeben
ist. Bei gemischten Vorgaben ist die Summe damit die Antwort auf „wie viele
brauchen wir insgesamt?".

## Wohin das Ergebnis geht

Der Rechner schreibt **nichts von selbst**. Am Regler wird probiert; in den
Verlauf gehört die Menge, die tatsächlich abgesetzt wurde. Auf Knopfdruck legt
„Materialanforderung ins Tagebuch" **einen** Eintrag der Art `M` im
Einsatztagebuch ab, mit Abschnitt, Sackzahl, Sandmenge, Paletten, Fuhren, Folie,
Bauzeit samt Kräften und — bei mehreren Abschnitten — der Gesamtsumme. Es steht
nur **eine** Zeile für Personal und Zeit darin: die wirksame Kombination, egal
welche der beiden vorgegeben war.

Die Parameter selbst liegen an der Linie und werden mit „Übernehmen" gespeichert.
Damit steht die geplante Dammlinie samt Bedarf in der Lagekarte und ist nach dem
Einsatz nachvollziehbar.

## Offene Punkte

- **Geländehöhe entlang der Linie.** Gerechnet wird mit konstanter Dammhöhe. Ein
  Höhenprofil gäbe es über
  [ensureConnectionElevation](../src/components/FirecallItems/elements/connection/foerderung/ensureConnectionElevation.ts)
  — dieselbe Abfrage wie bei der Löschwasserförderung. Nicht gebaut, weil die
  Höhengenauigkeit von EU-DEM 25 m in der Größenordnung der Dammhöhe selbst
  liegt: Ein Modell mit ±1 m Unsicherheit taugt nicht, um 20 cm Dammhöhe zu
  bestimmen.
- **Sandzufuhr als Schranke.** Die Unterlage nennt 1 m³ Sand je Mann und Stunde;
  der Rechner prüft nicht, ob die Fuhren mit der Füllleistung mithalten. Das wäre
  eine Warnung wie die Füllstellen-Schranke beim Pendelverkehr.
- **Druck-/PDF-Ansicht der Materialanforderung.** Der Tagebucheintrag ist der Weg
  über die vorhandene Dokumentation; eine eigene Druckansicht ist offen.
- **Freibord, Sackreserve und Folienmaß** stehen nicht in der Unterlage und sind
  als Planungswerte gekennzeichnet.
