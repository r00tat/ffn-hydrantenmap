# Print-Seite Redesign

## Zusammenfassung

Komplette Neustrukturierung der Print-Seite (`/print`) als druckoptimiertes Einsatz-Dokument. Alle Sektionen werden nur angezeigt wenn Daten vorhanden sind.

## Seitenstruktur

1. **Einsatz-Kopfzeile** - Name, Datum, Beschreibung aus `Firecall`
2. **Einsatzkarte** - Leaflet inline, volle Breite
3. **Einsatzmittel-Zusammenfassung** - `StrengthTable` + Zeitleiste (erste Alarmierung → letztes Abrücken)
4. **Einsatzmittel pro Layer** - Gruppiert nach Layer, pro Item: `title()`, `info()`, `body()` mit vollen Details
5. **Einsatzorte** - Tabelle: Name, Adresse, Status, Zeiten, zugewiesene Fahrzeuge
6. **Messungen** - Spectrum-Items: Probe, Gerät, Nuklid, Konfidenz, Messzeit
7. **Einsatztagebuch** - Kompakte Tabelle, aufsteigend, ohne Edit-Buttons
8. **Geschäftsbuch** - Kompakte Tabelle, aufsteigend, ohne Edit-Buttons

## Technische Details

- `PrintPage.tsx` komplett neu geschrieben
- `FahrzeugePrint.tsx` wird ersetzt
- CSS `@media print` Styles in `globals.css`
- Wiederverwendung: `StrengthTable`, `calculateStrength`, `useVehicles`, `useFirecallLocations`, `useDiaries`, `getItemInstance`

## Bedingte Anzeige

Jede Sektion wird nur gerendert wenn entsprechende Daten existieren (z.B. keine Einsatzorte-Sektion wenn keine Locations, keine Messungen wenn keine Spectrum-Items).
