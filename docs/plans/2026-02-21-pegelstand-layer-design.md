# Pegelstand Layer Design

## Overview

Display real-time water level data (Pegelstande) from Burgenland rivers and lakes on the map. Data is scraped from the Burgenland water portal (`wasser.bgld.gv.at`), station coordinates are managed in Firestore with an admin UI for import and manual positioning.

## Data Sources

- **River stations**: https://wasser.bgld.gv.at/hydrographie/die-fluesse (~45 stations)
- **Lake stations**: https://wasser.bgld.gv.at/hydrographie/die-seen (~15 stations)
- **Station coordinates**: Austrian OGC Features API at `gis.lfrz.gv.at` provides WGS84 coordinates for ~47 stations via HZBNR identifiers
- **Missing stations**: ~12 stations not in the OGC API, coordinates entered manually via admin UI

## Data Model

### Firestore Collection: `pegelstand_stations`

Static station metadata with coordinates. Documents keyed by slug (e.g., `burg`, `neusiedl`).

```typescript
interface PegelstandStation {
  id: string;           // document ID = slug from detail URL
  name: string;         // display name, e.g., "Burg / Pinka"
  type: 'river' | 'lake';
  hzbnr?: string;       // OGC station ID, e.g., "210260"
  lat: number;
  lng: number;
  detailUrl: string;    // relative path, e.g., "/hydrographie/die-fluesse/burg"
}
```

### Live Data (runtime only, not persisted)

Scraped from HTML pages by server action.

```typescript
interface PegelstandData {
  slug: string;         // matches Firestore document ID
  name: string;         // station name from the page
  type: 'river' | 'lake';
  timestamp: string;    // "21.02.2026 21:00"
  waterLevel?: string;  // "210" (cm) for rivers, "115.47" (muA) for lakes
  waterLevelUnit: string; // "cm" or "muA"
  discharge?: string;   // "3.56" (m3/s), rivers only
  temperature?: string; // "2.5" (C)
  color: string;        // hex color extracted from page (color category)
  detailUrl: string;    // relative path to detail page
}
```

### Merged Data (client-side)

```typescript
interface PegelstandMarkerData extends PegelstandData {
  lat: number;
  lng: number;
}
```

## Architecture

### Server Action: `PegelstandAction.ts`

Location: `src/components/Map/layers/PegelstandAction.ts`

- `'use server'` directive
- `actionUserRequired()` for authentication
- Fetches both HTML pages in parallel using `Promise.all`
- Parses HTML tables with regex/string parsing (no extra dependency)
- Extracts: station slug (from href), name, timestamp, water level, discharge, temperature, color
- Uses `next: { revalidate: 300 }` for 5-minute server-side caching
- Returns `PegelstandData[]`

### Layer Component: `PegelstandLayer.tsx`

Location: `src/components/Map/layers/PegelstandLayer.tsx`

- Follows the PowerOutageLayer pattern exactly
- `usePegelstandData()` hook with `useState` + `useEffect` + 5-minute polling
- Fetches station coordinates from Firestore via `useFirebaseCollection`
- Merges live data with coordinates by matching on slug
- Stations without coordinates are skipped (not displayed)
- Renders markers with color-coded water drop SVG `divIcon`
- Popup content: station name, water level, discharge, temperature, timestamp, link to detail page (new tab)
- Attribution links to wasser.bgld.gv.at

### Map Registration

In `Map.tsx`, add after the Stromausfalle overlay:

```tsx
<LayersControl.Overlay name="Pegelstande">
  <PegelstandLayer />
</LayersControl.Overlay>
```

Also add to `LocationMapPicker.tsx` for consistency.

### Marker Icon

SVG water drop with dynamic fill color. Generated as template string in `L.divIcon`, similar to the PowerOutage lightning bolt.

8 color categories based on discharge relative to statistical thresholds:
- <Q95% (low water)
- Q95%-MQ
- MQ-HQ1
- HQ1-HQ5
- HQ5-HQ10
- HQ10-HQ30
- HQ30-HQ100
- \>HQ100

Colors are extracted from the HTML page's table/SVG styling during scraping.

## Admin UI

### New Tab: "Pegelstande" in AdminTabs

Location: `src/components/admin/PegelstandStations.tsx`

Features:
1. **Station table** listing all stations from Firestore with: name, type, lat, lng, hzbnr, detailUrl
2. **"Import from OGC API" button** fetches from `gis.lfrz.gv.at/api/geodata/i000501/ogc/features/v1/collections/i000501:messstellen_owf/items` filtered by Burgenland bbox, creates/updates Firestore documents for matching stations
3. **Add/Edit station** dialog with text fields for name, type, hzbnr, detailUrl, and lat/lng
4. **Position selection** uses the existing `LocationMapPicker` component (same as Einsatzorte) for click-to-set coordinates
5. **Delete station** with confirmation

### Admin Action: `PegelstandAdminAction.ts`

Location: `src/app/admin/PegelstandAdminAction.ts`

Server action for OGC API import:
- Fetches station data from OGC Features API
- Filters for Burgenland stations (hzbnr starting with "21")
- Returns station list with coordinates for admin to review before saving

## Firestore Rules

Add to both `firebase/dev/firestore.rules` and `firebase/prod/firestore.rules`:

```
match /pegelstand_stations/{doc=**} {
  allow read: if authorizedUser();
  allow write: if adminUser();
}
```

Pattern follows existing kostenersatz collections (read: authorized, write: admin).

## HTML Parsing Strategy

### River Page Table Structure

Each row contains:
- Station name as link: `<a href="/hydrographie/die-fluesse/burg">Burg / Pinka</a>`
- Timestamp: `21.02.2026 21:00`
- Discharge (Q): `3.56` m3/s
- Water level: `210` cm
- Temperature: `2.5` C

### Lake Page Table Structure

Each row contains:
- Station name as link: `<a href="/hydrographie/die-seen/neusiedl">Neusiedl</a>`
- Timestamp: `21.02.2026 21:00`
- Water level: `115.47` muA
- Temperature: `1.9` C

### Color Extraction

Colors are extracted from CSS classes or inline styles on table rows/SVG elements. The page uses a color gradient system with classes `.cls-1` through `.cls-14`. If colors cannot be reliably extracted from the HTML, fallback to a default blue color.

## Dependencies

No new npm dependencies required. HTML parsing uses regex/string matching.
