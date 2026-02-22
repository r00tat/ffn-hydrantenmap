# NÖ Pegelstände Integration Design

## Goal

Extend the existing Pegelstände map layer with water level and related measurement data from Niederösterreich (NÖ), showing all stations within ~50km of the Burgenland border.

## Data Source

**NÖ API:** `https://www.noel.gv.at/wasserstand/kidata/maplist/MapList.json`

- Public JSON endpoint, no authentication required
- Returns ~1074 entries across 12 parameter types
- Each entry includes lat/lng coordinates (no Firestore storage needed)
- Undocumented API; no CORS headers (server-side fetch required)

### Parameter Types (all included)

| Parameter | Unit | Description |
|-----------|------|-------------|
| Wasserstand | cm | Water level |
| WasserstandPrognose | cm | Water level forecast |
| Durchfluss | m³/s | Discharge |
| DurchflussPrognose | m³/s | Discharge forecast |
| Wassertemperatur | °C | Water temperature |
| Grundwasserspiegel | m ü.A. | Groundwater level |
| Niederschlag03h | mm | 3-hour precipitation |
| Niederschlag12h | mm | 12-hour precipitation |
| Niederschlag24h | mm | 24-hour precipitation |
| Lufttemperatur | °C | Air temperature |
| Luftfeuchtigkeit | % | Humidity |

### Alert Levels (ClassID)

| ClassID | Color | Meaning |
|---------|-------|---------|
| 1 | #87cefa | Below mean water |
| 2 | #4169e1 | Above mean water |
| 3 | #ffff00 | > HW1 (1-year flood) |
| 4 | #ff8c00 | > HW5 (5-year flood) |
| 5 | #ff0000 | > HW30 (30-year flood) |

## Bounding Box Filter

Burgenland spans roughly 46.85°N–48.1°N, 16.1°E–17.1°E. With ~50km buffer:

- **Latitude:** 46.4 – 48.55
- **Longitude:** 15.45 – 17.75

Applied server-side when processing MapList.json results.

## Architecture

### Data Flow

1. Server action fetches NÖ MapList.json (5-min revalidate, same as Burgenland)
2. Filter entries by bounding box
3. Group entries by Stationnumber → merge all parameters into one record per station
4. Marker color from Wasserstand ClassID → fallback to Durchfluss → fallback to default blue
5. Return alongside Burgenland data using extended PegelstandData interface

### Files Modified

| File | Changes |
|------|---------|
| `PegelstandAction.ts` | Add NÖ fetch + parse + bounding box filter; extend `PegelstandData` with source field and optional NÖ-specific fields; merge into `fetchPegelstandData()` |
| `PegelstandLayer.tsx` | Handle NÖ entries (coordinates in data, no Firestore lookup); extend popup for all parameter types; conditional detail link (Bgld vs NÖ); update attribution |

### PegelstandData Extension

New optional fields on existing interface:
- `source: 'bgld' | 'noe'` — distinguishes data origin
- `lat?: number`, `lng?: number` — NÖ entries carry coordinates directly
- `waterLevelForecast?: string` — WasserstandPrognose
- `dischargeForecast?: string` — DurchflussPrognose
- `groundwaterLevel?: string` — Grundwasserspiegel
- `precipitation3h/12h/24h?: string` — Niederschlag
- `airTemperature?: string` — Lufttemperatur
- `humidity?: string` — Luftfeuchtigkeit
- `classId?: string` — NÖ alert level ID
- `rivername?: string` — River name from NÖ API

### Marker Merge Logic (PegelstandLayer)

NÖ entries already have coordinates → skip Firestore lookup:
```
if (entry.source === 'noe' && entry.lat && entry.lng) → use directly
if (entry.source === 'bgld') → lookup from Firestore stations (existing logic)
```

### Popup Content

Unified popup showing all available fields:
- Station name + river name (if available)
- Alert level indicator (colored dot)
- Water level + forecast (if available)
- Discharge + forecast (if available)
- Temperature, precipitation, groundwater, air temp, humidity
- Timestamp
- Detail link → bgld or noe URL depending on source
- Source attribution line

### Attribution

Layer attribution updated to include both:
```
Pegelstände: Wasserportal Burgenland | Land Niederösterreich
```

## What's NOT Changing

- Firestore `pegelstand_stations` collection (only used for Burgenland)
- Admin station management UI (NÖ stations don't need manual coordinate management)
- 5-minute refresh interval
- Water drop icon style and caching
