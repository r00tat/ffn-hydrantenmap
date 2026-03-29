# Dosisleistungsrechner (Nuklidbasiert)

## Formel

**H = Gamma × A** (Dosisleistung in 1m Abstand)

- H = Ortsdosisleistung in 1m Abstand (µSv/h)
- Gamma = Dosisleistungskonstante des Nuklids (µSv·m²/(h·GBq))
- A = Aktivität (intern in GBq)

Bidirektional: A → H oder H → A (ein Feld leer lassen).

## UI

1. **Nuklid-Dropdown** (Select) — setzt Gamma-Konstante, zeigt Wert als Info
2. **Aktivität-Feld** + **Einheiten-Dropdown** (GBq, MBq, TBq, Ci)
3. **Dosisleistung-Feld** (µSv/h)
4. Berechnen + Löschen Buttons
5. Grüne Ergebnisbox mit Formel (wie bestehende Rechner)
6. Berechnungsverlauf

## Nuklid-Liste

| Nuklid | Gamma (µSv·m²/(h·GBq)) | Anwendung |
|--------|------------------------|-----------|
| Na-22 | 327 | Forschung, Kalibrierung |
| Cr-51 | 5 | Medizin |
| Mn-54 | 122 | Stahlindustrie |
| Co-57 | 16 | Kalibrierung |
| Co-60 | 351 | Industrieradiografie, Bestrahlung |
| Zn-65 | 82 | Forschung |
| Se-75 | 56 | Industrieradiografie |
| Sr-90 | 6 | Industrie, RTGs (reiner Beta-Strahler, nur Bremsstrahlung) |
| Mo-99 | 26 | Medizin (Tc-99m Generator) |
| Tc-99m | 17 | Medizinische Diagnostik |
| I-125 | 17 | Medizin, Forschung |
| I-131 | 66 | Schilddrüsentherapie |
| Ba-133 | 52 | Kalibrierung |
| Cs-137 | 92 | Industriemessung, Medizin |
| Eu-152 | 168 | Kalibrierung |
| Ir-192 | 130 | Industrieradiografie |
| Au-198 | 62 | Medizin |
| Ra-226 | 195 | Altquellen |
| Am-241 | 3.1 | Rauchmelder, Messgeräte |

## Aktivitätseinheiten

| Einheit | Faktor zu GBq |
|---------|--------------|
| GBq | 1 |
| MBq | 0.001 |
| TBq | 1000 |
| Ci | 37 |

## Datei-Änderungen

- `src/common/strahlenschutz.ts` — Nuklid-Daten, Typen, Berechnungsfunktion
- `src/common/strahlenschutz.test.ts` — Tests
- `src/components/pages/Strahlenschutz.tsx` — UI-Komponente
