# Weather

The weather feature displays current and historical weather data from TAWES measurement stations (GeoSphere Austria). The data is captured in 10-minute intervals and shown as interactive charts.

## Features

- Show weather stations on the map (via the "Weather stations" overlay layer)
- Detail view per station with charts
- Available measurements: temperature (°C), wind speed (km/h), wind gusts (km/h), wind direction (°), humidity (%), pressure (hPa), precipitation (mm), snow depth (cm), sunshine duration (min), global radiation (W/m²)
- Choose time range: 12h, 24h, 48h, 7 days
- Aggregation interval: 10min, 30min, 1h, 3h (depending on the range)
- Show min/max bands for aggregated data
- Different chart types: lines, bars, areas

## Instructions

### Find a weather station on the map

1. Enable the "Weather stations" overlay on the map
2. Click a station marker

### Show weather data

1. The station opens a detail page with all available charts
2. Station name, altitude and location are displayed

### Change the time range

1. ButtonGroup at the top: choose 12h, 24h, 48h or 7d
2. The charts update automatically

### Adjust aggregation

1. ToggleButtonGroup for the interval: 10min / 30min / 1h / 3h
2. Larger intervals are available for longer ranges

### Show min/max bands

1. Enable the switch
2. Shows minimum and maximum values as a band around the line
3. Available only for aggregated intervals > 10min

### Back to the map

1. Click the "← Back to map" link at the top

:::info
Tip: The weather data comes from GeoSphere Austria (TAWES network) and is updated every 10 minutes.
:::

:::info
Tip: For a quick overview use the 24h range with 1h aggregation. For detailed analysis use the 12h range with the 10min interval.
:::
