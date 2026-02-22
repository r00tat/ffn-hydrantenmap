# Weather Station History Charts Design

## Overview

A dedicated page showing historical weather data charts for a single TAWES station, accessible via a "Verlauf" link in the map marker popup.

## Data Source

GeoSphere Austria historical TAWES API — client-side, no auth, CORS enabled.

- **Endpoint**: `https://dataset.api.hub.geosphere.at/v1/station/historical/tawes-v1-10min`
- **Query**: `?parameters=TL,FF,FFX,DD,RF,P,RR,SCHNEE,SO,GLOW&station_ids={id}&start={iso}&end={iso}&output_format=geojson`
- **Response**: `timestamps[]` array + `features[0].properties.parameters.{code}.data[]` arrays
- **For 7d preset**: use `klima-v1-1h` endpoint (hourly resolution) to keep data volume manageable (~168 points vs 1008)

## Route & Navigation

- **URL**: `/wetter/[stationId]` (e.g. `/wetter/11194`)
- **Entry**: "Verlauf" link added to WetterstationLayer marker popup
- Station name + altitude shown as page header, fetched from TAWES metadata endpoint

## Time Range Presets

MUI ButtonGroup at top of page: **12h** | **24h** (default) | **48h** | **7d**

| Preset | Data points | Resolution | API endpoint |
|--------|-------------|------------|--------------|
| 12h | 72 | 10 min | tawes-v1-10min |
| 24h | 144 | 10 min | tawes-v1-10min |
| 48h | 288 | 10 min | tawes-v1-10min |
| 7d | ~168 | 1 hour | klima-v1-1h |

## Charts

Stacked vertically using recharts `ResponsiveContainer` + chart components. Each chart ~200px height. Charts with all-null data are hidden automatically.

| Chart title | Parameter(s) | Unit | Chart type | Color |
|-------------|-------------|------|------------|-------|
| Temperatur | TL | °C | LineChart | #e53935 (red) |
| Wind | FF + FFX | m/s | LineChart | FF: #1976d2, FFX: #1976d2 dashed |
| Niederschlag | RR | mm | BarChart | #1565c0 (blue) |
| Luftfeuchtigkeit | RF | % | LineChart | #43a047 (green) |
| Luftdruck | P | hPa | LineChart | #6d4c41 (brown) |
| Schneehöhe | SCHNEE | cm | AreaChart | #90caf9 (light blue) |
| Sonnenschein | SO | min | BarChart | #fdd835 (yellow) |
| Strahlung | GLOW | W/m² | AreaChart | #ff9800 (orange) |

### Chart features
- Shared time X-axis: `HH:mm` format for ≤48h, `dd.MM HH:mm` for 7d
- Tooltip on hover: exact value + formatted timestamp
- Y-axis with unit label
- Wind chart: solid line for speed, dashed line for gusts, legend to distinguish
- Sunshine: convert seconds to minutes for display
- Loading spinner while data is fetched

## New Dependencies

- `recharts` — React charting library (SVG-based, D3 under the hood)

## New Files

- `src/app/wetter/[stationId]/page.tsx` — Next.js page component (thin wrapper)
- `src/components/Wetter/WetterstationHistory.tsx` — main client component with data fetching hook and chart rendering

## Modified Files

- `src/components/Map/layers/WetterstationLayer.tsx` — add "Verlauf →" link to each marker popup
- `package.json` / `package-lock.json` — add recharts dependency
