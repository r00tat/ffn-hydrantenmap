# Wetter

Die Wetter-Funktion zeigt aktuelle und historische Wetterdaten von TAWES-Messstationen (GeoSphere Austria) an. Die Daten werden in 10-Minuten-Intervallen erfasst und als interaktive Diagramme dargestellt.

## Funktionen

- Wetterstationen auf der Karte anzeigen (über Overlay-Layer "Wetterstationen")
- Detailansicht pro Station mit Diagrammen
- Verfügbare Messwerte: Temperatur (°C), Windgeschwindigkeit (km/h), Windspitzen (km/h), Windrichtung (°), Luftfeuchtigkeit (%), Luftdruck (hPa), Niederschlag (mm), Schneehöhe (cm), Sonnenscheindauer (min), Globalstrahlung (W/m²)
- Zeitraum wählen: 12h, 24h, 48h, 7 Tage
- Aggregationsintervall: 10min, 30min, 1h, 3h (je nach Zeitraum)
- Min/Max-Bänder bei aggregierten Daten anzeigen
- Verschiedene Diagrammtypen: Linien, Balken, Flächen

## Anleitung

### Wetterstation auf Karte finden

1. Overlay "Wetterstationen" in der Karte aktivieren
2. Stationsmarker anklicken

### Wetterdaten anzeigen

1. Station öffnet Detailseite mit allen verfügbaren Diagrammen
2. Stationsname, Höhe und Standort werden angezeigt

### Zeitraum ändern

1. ButtonGroup oben: 12h, 24h, 48h oder 7d wählen
2. Diagramme aktualisieren sich automatisch

### Aggregation anpassen

1. ToggleButtonGroup für Intervall: 10min/30min/1h/3h
2. Bei längeren Zeiträumen sind größere Intervalle verfügbar

### Min/Max-Bänder anzeigen

1. Schalter aktivieren
2. Zeigt Minimum- und Maximum-Werte als Band um die Linie
3. Nur bei aggregierten Intervallen > 10min verfügbar

### Zurück zur Karte

1. Link "← Zurück zur Karte" oben klicken

:::info
Tipp: Die Wetterdaten stammen von GeoSphere Austria (TAWES-Netzwerk) und werden alle 10 Minuten aktualisiert.
:::

:::info
Tipp: Für einen schnellen Überblick nutze den 24h-Zeitraum mit 1h-Aggregation. Für detaillierte Analysen den 12h-Zeitraum mit 10min-Intervall.
:::
