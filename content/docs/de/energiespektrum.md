# Energiespektrum

Die Energiespektrum-Seite analysiert Gamma-Spektren eines **RadiaCode-101**-Szintillators (CsI(Tl), 1024 Kanäle) und identifiziert automatisch die enthaltenen Nuklide. Die gesamte Auswertung läuft lokal im Browser – es werden keine Messdaten an einen Server übertragen.

:::info
Die Seite erreichst du über **Schadstoff → Energiespektrum** oder direkt über den Menüpunkt **Energiespektrum** im aktiven Einsatz. Gespeicherte Messungen sind Teil des Einsatzes und für alle berechtigten Benutzer sichtbar.
:::

## Funktionen

- **Spektren hochladen** Mehrere Dateien gleichzeitig (XML, rcspg, zrcspg, JSON, CSV) aus der offiziellen RadiaCode-App oder dem RadiaCode-Export
- **Automatische Nuklid-Erkennung** Peak-Finding mit 3σ-Signifikanz plus Matching gegen eine Bibliothek von 19 Nukliden mit Branching Ratios aus NNDC / IAEA
- **Manuelle Nuklid-Zuordnung** Automatik überschreiben, wenn du z.B. aus dem Kontext weißt, dass es sich um ein bestimmtes Präparat handelt
- **Mehrere Spektren überlagern** Vergleich von Probe, Untergrund und Referenz im selben Chart – lineare oder logarithmische Y-Achse
- **Referenz-Peaks einblenden** Beliebige Nuklide aus der Bibliothek mit ihren theoretischen Peak-Energien als Linien im Chart markieren
- **Direktlinks zu Nuklid-Datenbanken** Pro identifiziertem Nuklid Schnellzugriff auf NNDC NuDat 3, IAEA LiveChart und RadiaCode-Spektrenbibliothek
- **Speicherung im Einsatz** Hochgeladene Spektren werden als Einsatz-Item gespeichert und tauchen im Einsatztagebuch als Ereignis auf

## Anleitung

### 1. Spektrum hochladen

1. In der RadiaCode-App die Messung als Datei exportieren (XML, rcspg, zrcspg, JSON oder CSV)
2. In der Einsatzkarte **Energiespektrum** öffnen und auf **Datei(en) hochladen** klicken
3. Eine oder mehrere Spektrendateien auswählen
4. Die Spektren werden sofort analysiert; das Nuklid mit der höchsten Confidence erscheint als grüner Chip hinter dem Probennamen

:::info
Tipp: Lade zusätzlich zur Probe ein **Untergrundspektrum** hoch (RadiaCode-Messung ohne Probe, gleiche Messzeit). So erkennst du, welche Peaks wirklich aus der Probe stammen und welche vom natürlichen Untergrund kommen (K-40 bei 1461 keV, Ra-226 / Th-232-Zerfallsreihen).
:::

### 2. Identifikationsergebnis lesen

Jedes geladene Spektrum wird in der Liste mit dem erkannten Nuklid angezeigt:

- **Grüner Chip** – automatisch erkanntes Nuklid mit Confidence in Prozent (z.B. *Cs-137 (94%)*)
- **Blauer Chip** – manuell zugeordnetes Nuklid; die Automatik wird überschrieben
- **Gelber Chip "Nicht identifiziert"** – kein Referenz-Peak konnte innerhalb der Toleranz gematcht werden
- **Chip anklicken** – wenn weitere Kandidaten existieren, klappen diese auf; ein Klick auf einen Kandidaten blendet dessen Peak-Linien im Chart ein
- **RadiaCode / IAEA / NNDC** – Direktlinks zu den Referenzdatenbanken für das identifizierte Nuklid

### 3. Messung bearbeiten oder manuell zuordnen

1. In der Liste auf das **Stift-Symbol** der Messung klicken
2. Titel / Probenname, Beschreibung oder ein manuell zugeordnetes Nuklid eingeben
3. **Speichern** – die Zuordnung überschreibt die Auto-Erkennung in der Liste und im Einsatztagebuch; die ursprüngliche Auto-Erkennung bleibt als grauer Hinweis-Chip sichtbar

### 4. Chart bedienen

- **Auge-Symbol** – einzelne Spektren ein- oder ausblenden; der Chart aktualisiert sich automatisch
- **Logarithmisch** – logarithmische Y-Achse aktivieren, um schwache Peaks neben starken sichtbar zu machen
- **Peaks von Nukliden einblenden** – Dropdown mit allen Bibliotheks-Nukliden; ausgewählte Referenz-Peaks werden als farbige gestrichelte Linien dargestellt
- **Rote Linien** – Peaks des tatsächlich identifizierten (bzw. manuell zugeordneten) Nuklids der sichtbaren Spektren

:::warning
Achtung: Die Erkennung ersetzt keine qualifizierte Strahlenschutz-Analyse. Bei realen Einsätzen oder Verdacht auf Kontamination sind die offiziellen Stellen (z.B. Strahlenschutzabteilung des Landes, AGES) einzubinden. Die App dient der Vorab-Orientierung.
:::

## Wie funktioniert die Erkennung?

Die Analyse läuft in drei Stufen ab. Das Eingangs-XML wird vom RadiaCode-Spektrometer erzeugt und enthält pro Messung 1024 Kanäle (Counts) sowie die Kalibrierungs-Koeffizienten, mit denen jeder Kanal einer Energie in keV zugeordnet wird.

### Stufe 1 – XML-Parsing und Kalibrierung

Aus der Datei werden Metadaten (Probenname, Gerät, Mess-/Live-Zeit, Start/Ende), die drei Kalibrierungs-Koeffizienten (c₀, c₁, c₂) und die 1024 Kanal-Counts extrahiert. Daraus wird einmalig pro Kanal die Energie berechnet:

```
E(ch) = c₀ + c₁·ch + c₂·ch²
```

### Stufe 2 – Peak-Finding

Das Spektrum wird mit einem 5-Bin-Moving-Average geglättet. Ein Kanal gilt als Peak-Kandidat, wenn er ein striktes lokales Maximum im geglätteten Signal ist. Anschließend wird ein Poisson-Signifikanz-Test durchgeführt:

```
smoothed[i] > mean + 3·√mean
```

`mean` ist der Untergrund in benachbarten Kanälen (mit Ausschlusszone um den Peak, damit die Peak-Flanken den Untergrund nicht verfälschen). Die 3σ-Schwelle entspricht dem Currie'schen *Critical Level* für Brutto-Counts. Kanäle unterhalb von 40 keV werden ignoriert – dort dominiert elektronisches Rauschen des CsI(Tl)-Szintillators.

### Stufe 3 – Nuklid-Identifikation

Für jedes Bibliotheks-Nuklid werden die Referenz-Peaks mit den gefundenen Peaks verglichen. Die Match-Toleranz ist energieabhängig (Halbwertsbreite des Detektors, HWHM):

```
FWHM(E) = 0.12 · √(662 · E)   // RadiaCode-101: 12 % bei 662 keV
tolerance(E) = max(5 keV, 0.5 · FWHM(E))
```

Jeder Referenz-Peak wird dem nächstgelegenen gefundenen Peak innerhalb dieser Toleranz zugeordnet. Aus den Matches wird eine Confidence berechnet, die drei Aspekte kombiniert:

```
confidence = 0.40·intensityMatched + 0.45·avgStrength + 0.15·avgAccuracy
```

- **intensityMatched (40 %)** Branching-Ratio-gewichtete Abdeckung der Referenz-Peaks – gedeckelt auf 1.0, damit schwache Nuklide wie Ra-226 (3.6 % Gesamtemission) nicht automatisch den vollen Bonus bekommen
- **avgStrength (45 %)** Mittlere Counts der gematchten Peaks im Verhältnis zum stärksten Peak im Spektrum – bewertet, wie dominant das Nuklid im Spektrum ist
- **avgAccuracy (15 %)** Wie genau die gefundenen Peaks energetisch auf den Referenz-Energien liegen – 1.0 bei perfekter Übereinstimmung, 0 am Rand der Toleranz

## Bekannte Einschränkungen

- **Mischspektren** Dominante Nuklide drücken sekundäre Nuklide in der Confidence nach unten. Zwei schwache Quellen werden zuverlässig erkannt, eine schwache neben einer starken unter Umständen nicht.
- **Überlappende Peaks** Eng benachbarte Peaks innerhalb eines FWHM-Fensters (z.B. Co-57 bei 122.1 und 136.5 keV) werden vom Detektor als ein Peak aufgelöst.
- **Interferenzen** Nuklide mit identischen Peak-Energien (z.B. Tc-99m und Mo-99 bei 140.5 keV) lassen sich über ein einziges Spektrum nicht eindeutig unterscheiden.
- **Niedrigenergie-Bereich** Unter 40 keV wird wegen elektronischem Rauschen nicht gesucht. Am-241 (59.5 keV) und I-125 (35.5 keV) sind daher nur eingeschränkt bzw. gar nicht erkennbar.

## Referenzen

- **[RadiaCode Spektrenbibliothek](https://www.radiacode.com/spectrum-isotopes-library)** Referenzspektren einzelner Nuklide, aufgenommen mit dem RadiaCode-101
- **[NNDC NuDat 3](https://www.nndc.bnl.gov/nudat3/)** Nuclear Data Center – Peak-Energien und Branching Ratios
- **[IAEA LiveChart of Nuclides](https://www-nds.iaea.org/relnsd/vcharthtml/VChartHTML.html)** Interaktive Nuklidkarte mit Zerfallsdaten
