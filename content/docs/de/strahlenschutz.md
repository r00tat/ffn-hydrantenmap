# Strahlenschutz

Der Strahlenschutz-Rechner vereint Werkzeuge zur Abschätzung von Dosisleistung, Abschirmung, Aufenthaltszeit, Nuklidaktivität, Fallout-Dosis nach Kernwaffeneinsatz und Einheitenumrechnung. Alle Berechnungen laufen rein clientseitig im Browser.

:::info
Die Seite erreichst du über **Schadstoff → Strahlenschutz**. Für die Gamma-Spektroskopie und Nuklid-Identifikation aus RadiaCode-Messungen siehe [Energiespektrum](/docs/energiespektrum).
:::

:::warning
Hinweis: Die Rechner liefern eine schnelle Lage-Abschätzung. Für reale Einsatzentscheidungen sind die Werte der eingesetzten Dosimeter sowie die offiziellen Grenzwerte und Empfehlungen (Strahlenschutzbeauftragter, Land, Strahlenschutzabteilung) verbindlich.
:::

## Funktionen

- **Quadratisches Abstandsgesetz** Dosisleistung bei Abstandsänderung berechnen
- **Schutzwert (Abschirmung)** Reduktion der Dosisleistung durch mehrere Schichten Abschirmung
- **Aufenthaltszeit** Zulässige Einsatzdauer bei gegebener Dosisleistung und Grenzdosis
- **Dosisleistung aus Nuklidaktivität** Dosisleistung in 1 m Abstand aus Aktivität und Nuklid-Gamma-Konstante
- **Kernwaffeneinsatz / Fallout** Bezugsdosisleistung R₁ aus Messung, Zerfall zu beliebiger Zeit, Gesamtdosis bei Aufenthalt im Fallout-Gebiet, Visualisierung als FM-3-3-1-Nomogramm (STS Silber)
- **Einheitenumrechnung** Sv / mSv / µSv / nSv, Gy, R und Dosisleistungen
- **Berechnungsverlauf** Jeder Rechner merkt sich die letzten Ergebnisse inkl. Formel und Werte für die Dokumentation im Einsatz

## Allgemeine Bedienung

Alle Rechner funktionieren nach demselben Prinzip: Du gibst alle bis auf eine Variable ein und lässt das zu berechnende Feld **leer**. Mit Klick auf **Berechnen** wird der fehlende Wert ermittelt und der aktuelle Durchgang dem Verlauf hinzugefügt. **Löschen** setzt die Eingaben zurück, ohne den Verlauf zu verwerfen.

- Dezimaltrennung: Komma und Punkt werden beide akzeptiert
- Leere Eingaben zählen als "unbekannt"
- Alle Rechner zeigen unter dem Ergebnis die verwendete Formel und die eingesetzten Werte — praktisch für den Übertrag ins Einsatztagebuch

## 1. Quadratisches Abstandsgesetz

Die Dosisleistung einer punktförmigen Quelle nimmt quadratisch mit dem Abstand ab:

```
D1² × R1 = D2² × R2
```

Eingaben: Abstand 1 (m), Dosisleistung 1 (µSv/h), Abstand 2 (m), Dosisleistung 2 (µSv/h). Genau drei Felder füllen, das vierte leer lassen.

:::info
Beispiel: Bei 1 m gemessen 100 µSv/h — wie groß ist die Dosisleistung in 5 m Abstand? Felder: D1 = 1, R1 = 100, D2 = 5, R2 leer → R2 = 4 µSv/h.
:::

## 2. Schutzwert (Abschirmung)

Bei Abschirmung mit einem Material vom Schutzwert S reduziert sich die Dosisleistung pro Schicht um den Faktor S:

```
R = R₀ / S^n
```

R₀ ist die Dosisleistung ohne Abschirmung, R mit n Schichten. Typische Schutzwerte (Gamma-Strahlung, Richtwert): Blei S ≈ 2, Stahl S ≈ 1.5, Beton S ≈ 1.3 pro Halbwertsschicht. Bei unbekanntem S wird dieses vom Rechner ermittelt.

## 3. Aufenthaltszeit

Wie lange darf eine Einsatzkraft bei einer bestimmten Dosisleistung bleiben, um eine zulässige Dosis nicht zu überschreiten?

```
t = D / R
```

t = Aufenthaltszeit (h), D = zulässige Dosis (mSv), R = Dosisleistung (mSv/h). Das Ergebnis wird zusätzlich in Tagen / Stunden / Minuten / Sekunden ausgegeben, damit kurze Einsatzzeiten sofort ablesbar sind.

:::info
Referenzwerte (ÖNORM S 5207): Einsatzkräfte 15 mSv/Jahr (allgemein), 100 mSv einmalig zur Abwehr von Gefahren für Leib und Leben, 250 mSv nur zur Rettung von Menschenleben — die zulässige Dosis immer mit dem Strahlenschutzbeauftragten abstimmen.
:::

## 4. Dosisleistung aus Nuklidaktivität

Aus der Aktivität einer Quelle und der nuklidspezifischen Gamma-Konstante Γ lässt sich die Dosisleistung in 1 m Abstand berechnen:

```
Ḣ = Γ × A
```

Γ hat die Einheit µSv·m²/(h·GBq) und ist für jedes Nuklid in der Bibliothek hinterlegt. Die Aktivität kann in Bq, kBq, MBq, GBq oder TBq eingegeben werden; der Rechner rechnet intern auf GBq um. Wähle zuerst das Nuklid, dann die Einheit und anschließend entweder Aktivität oder Dosisleistung — das jeweils leere Feld wird berechnet.

:::info
Beispiel: Cs-137-Quelle mit 10 MBq, wie hoch ist die Dosisleistung in 1 m? Nuklid: Cs-137, Aktivität: 10 MBq, Dosisleistung leer → Ergebnis in µSv/h. Für andere Abstände das Ergebnis über das *Quadratische Abstandsgesetz* umrechnen.
:::

## 5. Kernwaffeneinsatz / Fallout (STS Silber)

Nach einer Kernwaffendetonation folgt die Dosisleistung im Fallout-Gebiet näherungsweise dem Way-Wigner-Zerfallsgesetz (FM 3-3-1 "Nuclear Contamination Avoidance"):

```
R(t) = R₁ · t^(-1,2)
```

R₁ = Bezugsdosisleistung bei H+1 Stunde (mSv/h), t = Stunden nach Detonation. Faustregel (7:10): nach 7-facher Zeit fällt die Dosisleistung auf etwa ein Zehntel ab.

Der Rechner gliedert sich in drei Schritte, die alle dieselbe R₁ teilen:

### Schritt 1 — Bezugsdosisleistung R₁ ermitteln

R₁ wird entweder direkt eingegeben oder aus einer aktuellen Messung zurückgerechnet:

```
R₁ = R(t) · t^1,2
```

Wird R(t) und t eingegeben, liefert der Rechner R₁ automatisch. Wird R₁ direkt eingegeben, kann umgekehrt R(t) oder t berechnet werden, falls der andere Wert bekannt ist. Das jeweils leere Feld wird berechnet.

Beispiel: Messung 4 Stunden nach Detonation ergibt 50 mSv/h → R₁ = 50 · 4^1,2 ≈ 264 mSv/h.

### Schritt 2 — Dosisleistung zu beliebiger Zeit

Mit dem in Schritt 1 ermittelten R₁ lässt sich die Dosisleistung R(t') zu jeder anderen Zeit t' nach Detonation berechnen — oder umgekehrt aus R(t') die Zeit t', zu der dieser Wert auftritt.

### Schritt 3 — Gesamtdosis bei Aufenthalt

Die akkumulierte Dosis bei Aufenthalt von der Eintrittszeit Te über die Dauer Ts ergibt sich aus dem Integral:

```
D = 5 · R₁ · ( Te^(-0,2) − (Te + Ts)^(-0,2) )
```

Mit dem R₁ aus Schritt 1 und beliebigen zwei der drei Größen Te, Ts, D wird die fehlende vierte berechnet (Te über numerische Bisektion in Log-Space).

:::info
Dauern werden als Textfeld eingegeben und akzeptieren mehrere Formate: `2.5` (dezimal), `2h 15min`, `1h30min` oder `45min`. Komma als Dezimaltrenner ist erlaubt.
:::

:::info
FM-3-3-1-Beispiel: R₁ = 300 mSv/h, Te = 2h, Ts = 1h → D ≈ 101,7 mSv.
:::

### Nomogramm

Das Nomogramm visualisiert die Berechnung wie in FM 3-3-1: links die Te-Skala, rechts die Tₐ = Te + Ts-Skala, in der Mitte der Dosis-Multiplikator M = D / R₁. Eine Verbindungslinie zwischen Te (links) und Tₐ (rechts) schneidet die Mittelskala an der Stelle des Multiplikators. Die Gesamtdosis ist D = R₁ · M.

## 6. Einheitenumrechnung

Schnelle Umrechnung zwischen gängigen Dosis- und Dosisleistungseinheiten. Die Zieleinheit ist auf Einheiten des gleichen Typs beschränkt (Dosis oder Dosisleistung), inkompatible Kombinationen werden automatisch ausgeblendet.

- **Dosis:** Sv, mSv, µSv, nSv, Gy, mGy, µGy, R, mR, µR
- **Dosisleistung:** Sv/h, mSv/h, µSv/h, nSv/h, Gy/h, mGy/h, µGy/h, R/h, mR/h, µR/h
- Faustformel: 1 R ≈ 0,01 Sv (Gamma-Strahlung, Weichteilgewebe)

## Berechnungsverlauf nutzen

Jeder Rechner führt einen eigenen Verlauf. Pro Eintrag werden die verwendeten Eingabewerte, die berechnete Größe, die Formel und der Zeitpunkt dokumentiert. Ein Klick auf das Papierkorb-Symbol löscht einzelne Einträge; der Verlauf wird nicht in der Datenbank gespeichert und geht beim Neuladen der Seite verloren. Für die dauerhafte Dokumentation Ergebnisse manuell ins [Einsatztagebuch](/docs/tagebuch) übertragen.
