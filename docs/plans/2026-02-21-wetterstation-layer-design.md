# Weather Station Layer (Wetterstationen) Design

## Data Source

GeoSphere Austria TAWES (Teilautomatische Wetterstationen) API — fully client-side, no API key, CORS enabled (`Access-Control-Allow-Origin: *`).

- **Base URL**: `https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min`
- **Metadata**: `GET /metadata` — returns all stations with id, name, state, lat, lon, altitude
- **Data**: `GET ?parameters=TL,FF,FFX,DD,RF,P,RR,SCHNEE,SO,GLOW&station_ids=...&output_format=geojson`
- **Update frequency**: Every 10 minutes
- **License**: CC-BY (GeoSphere Austria)

## Parameters

| Code | Name | Unit | Description |
|------|------|------|-------------|
| TL | Lufttemperatur | °C | Air temperature |
| FF | Windgeschwindigkeit | m/s | Wind speed (10min avg) |
| FFX | Windspitze | m/s | Wind gusts (10min max) |
| DD | Windrichtung | ° | Wind direction |
| RF | Relative Feuchte | % | Relative humidity |
| P | Luftdruck | hPa | Air pressure |
| RR | Niederschlag | mm | Precipitation (last 10min) |
| SCHNEE | Schneehöhe | cm | Snow depth |
| SO | Sonnenscheindauer | sec | Sunshine duration (10min) |
| GLOW | Globalstrahlung | W/m² | Solar radiation |

## Geographic Scope

Burgenland stations + nearby stations from NÖ, Steiermark, Wien within bounding box (lat 46.8–48.2, lon 15.8–17.2). Approximately 40 stations.

Filtering strategy: fetch `/metadata` once, filter by `state === "Burgenland"` OR within bounding box, then request data only for those station IDs.

## Architecture

Purely client-side. No server action, no Firestore, no admin UI.

### New Files

- `src/components/Map/layers/WetterstationLayer.tsx` — client component with custom data hook and markers

### Modified Files

- `src/components/Map/Map.tsx` — register layer in `LayersControl.Overlay`
- `src/components/Einsatzorte/LocationMapPicker.tsx` — register layer

### Data Flow

1. Component mounts → fetch `/metadata`, filter stations by region
2. Fetch current data for filtered `station_ids` as GeoJSON
3. Merge: coordinates from GeoJSON geometry, measurements from properties
4. Render markers with popups
5. Poll every 10 minutes (matches TAWES update interval)

### Custom Hook: `useWetterstationData()`

- State: station data array
- On mount: fetch metadata → filter → fetch data → set state
- Interval: refresh data every 10 minutes (metadata cached, only data refetched)
- Cleanup: clear interval, mounted ref guard

## Marker Design

- **Icon**: Thermometer SVG `divIcon` (28x28), color-coded by temperature
- **Color scale**: blue (≤0°C) → green (~15°C) → orange (~25°C) → red (≥35°C)
- **Icon cache**: `Map<string, L.DivIcon>` keyed by hex color (same pattern as Pegelstand)

### Popup Content

Compact table showing all available measurements:

```
**Station Name** (altitude m)
Temperatur:     5.3 °C
Wind:           4.3 m/s (W) ← direction arrow
Böen:           5.3 m/s
Feuchte:        79 %
Luftdruck:      1002.1 hPa
Niederschlag:   0.0 mm
Schneehöhe:     5.0 cm
Sonnenschein:   0 sec
Strahlung:      0 W/m²
Stand: 21.02.2026, 23:10
```

Null/missing values are omitted from the popup.

## API Response Format

The GeoJSON response provides coordinates and data together:

```json
{
  "type": "FeatureCollection",
  "timestamps": ["2026-02-21T22:10+00:00"],
  "features": [{
    "type": "Feature",
    "geometry": { "type": "Point", "coordinates": [16.538, 47.854] },
    "properties": {
      "parameters": {
        "TL": { "name": "Lufttemperatur", "unit": "°C", "data": [5.3] },
        "FF": { "name": "Windgeschwindigkeit", "unit": "m/s", "data": [4.3] }
      },
      "station": "11190"
    }
  }]
}
```
