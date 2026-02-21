# Pegelstand Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display real-time water level data from Burgenland rivers and lakes as color-coded markers on the map, with admin UI for managing station coordinates.

**Architecture:** Server action scrapes HTML tables from wasser.bgld.gv.at and returns parsed station data. Client merges this with Firestore-stored coordinates and renders markers. Admin UI allows importing coordinates from Austrian OGC API and manual position selection via the existing LocationMapPicker.

**Tech Stack:** Next.js server actions, React Leaflet markers with SVG divIcons, Firestore for station coordinates, existing useFirebaseCollection hook.

---

### Task 1: Firestore Rules for pegelstand_stations

**Files:**
- Modify: `firebase/dev/firestore.rules` (before the catch-all rule at line 120)
- Modify: `firebase/prod/firestore.rules` (before the catch-all rule at line 120)

**Step 1: Add rules to both dev and prod firestore.rules**

Add before the catch-all `match /{document=**}` block. This follows the exact same pattern as `kostenersatzVehicles` (lines 115-118):

```
    // Pegelstand stations - read for all authorized, write for admin
    match /pegelstand_stations/{doc=**} {
      allow read: if authorizedUser();
      allow write: if adminUser();
    }
```

**Step 2: Commit**

Commit message: `feat: add Firestore rules for pegelstand_stations collection`

---

### Task 2: Server Action for HTML Scraping

**Files:**
- Create: `src/components/Map/layers/PegelstandAction.ts`

Reference pattern: `src/components/Map/layers/PowerOutageAction.ts`

**Step 1: Create the server action**

The file should:
- Use `'use server'` directive
- Import and call `actionUserRequired()` from `../../../app/auth`
- Export a `PegelstandData` interface with fields: `slug`, `name`, `type` ('river' | 'lake'), `timestamp`, `waterLevel?`, `waterLevelUnit`, `discharge?`, `temperature?`, `color`, `detailUrl`
- Export `fetchPegelstandData()` that:
  1. Calls `actionUserRequired()`
  2. Fetches both URLs in parallel with `Promise.all`:
     - `https://wasser.bgld.gv.at/hydrographie/die-fluesse`
     - `https://wasser.bgld.gv.at/hydrographie/die-seen`
  3. Uses `{ next: { revalidate: 300 } }` for 5-min server cache
  4. Parses each HTML page's table rows using regex
  5. River table rows: extract slug from `<a href="/hydrographie/die-fluesse/{slug}">`, then cells for timestamp, discharge (m3/s), water level (cm), temperature (C)
  6. Lake table rows: extract slug from `<a href="/hydrographie/die-seen/{slug}">`, then cells for timestamp, water level (muA), temperature (C)
  7. Uses a default blue color `#2196F3` when color extraction fails
  8. Returns combined `PegelstandData[]`

**Important:** The HTML parsing patterns are a starting point. After first deploy, verify them against actual page HTML and adjust. The pages are server-rendered so structure should be stable.

**Step 2: Verify build compiles**

Run: `npm run build`

**Step 3: Commit**

Commit message: `feat: add server action for scraping Pegelstand data from wasser.bgld.gv.at`

---

### Task 3: Pegelstand Map Layer Component

**Files:**
- Create: `src/components/Map/layers/PegelstandLayer.tsx`

Reference pattern: `src/components/Map/layers/PowerOutageLayer.tsx`

**Step 1: Create the layer component**

The file should:
- Use `'use client'` directive
- Export a `PegelstandStation` interface (used by admin component too): `id`, `name`, `type`, `hzbnr?`, `lat`, `lng`, `detailUrl`
- Create a `createWaterDropIcon(color: string)` function returning `L.divIcon` with an SVG water drop path, size [28,28], anchor at bottom center [14,28]
- Cache icons by color in a `Map<string, L.DivIcon>` to avoid recreating
- `usePegelstandData()` hook: `useState` + `useEffect` + 5-minute polling via `setInterval(refresh, 300000)`, same mounted-ref cleanup pattern as PowerOutageLayer
- Fetch station coordinates from Firestore: `useFirebaseCollection<PegelstandStation>({ collectionName: 'pegelstand_stations' })`
- `useMemo` to merge live data with station coordinates by matching on slug, skip stations without coordinates
- Render `<LayerGroup>` with attribution to wasser.bgld.gv.at
- Each marker gets `getWaterDropIcon(marker.color)` as icon
- Popup shows: bold name, water level + unit, discharge (m3/s), temperature (C), timestamp, and a link to `https://wasser.bgld.gv.at{detailUrl}` with `target="_blank"`

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

Commit message: `feat: add PegelstandLayer component with color-coded water drop markers`

---

### Task 4: Register Layer in Map and LocationMapPicker

**Files:**
- Modify: `src/components/Map/Map.tsx` (add import + overlay after Stromausfaelle)
- Modify: `src/components/Einsatzorte/LocationMapPicker.tsx` (add import + overlay after Stromausfaelle)

**Step 1: Add to Map.tsx**

Add import of `PegelstandLayer` from `./layers/PegelstandLayer` (after the PowerOutageLayer import on line 27).

Add `<LayersControl.Overlay name="Pegelstande">` wrapping `<PegelstandLayer />` after the Stromausfaelle overlay (line 112).

**Step 2: Add to LocationMapPicker.tsx**

Add import of `PegelstandLayer` from `../Map/layers/PegelstandLayer` (after the PowerOutageLayer import on line 24).

Add `<LayersControl.Overlay name="Pegelstande">` wrapping `<PegelstandLayer />` after the Stromausfaelle overlay (line 171).

**Step 3: Verify dev server**

Run: `npm run dev`
Open http://localhost:3000/map and verify "Pegelstande" appears in the layer control. No markers yet (no stations imported).

**Step 4: Commit**

Commit message: `feat: register PegelstandLayer in Map and LocationMapPicker`

---

### Task 5: Admin Server Action for OGC API Import

**Files:**
- Create: `src/app/admin/PegelstandAdminAction.ts`

Reference pattern: `src/app/admin/adminActions.ts`

**Step 1: Create the admin server action**

The file should:
- Use `'use server'` directive
- Import `actionAdminRequired` from `../auth` and `firestore` from `../../server/firebase/admin`
- Export `OgcStation` interface: `hzbnr`, `name`, `river`, `lat`, `lng`
- Export `PegelstandStationDoc` interface: `name`, `type`, `hzbnr?`, `lat`, `lng`, `detailUrl`
- `fetchOgcStations()`: calls `actionAdminRequired()`, fetches from `https://gis.lfrz.gv.at/api/geodata/i000501/ogc/features/v1/collections/i000501:messstellen_owf/items?f=json&limit=200&bbox=15.8,46.8,17.2,48.2`, filters for hzbnr starting with "21", returns `OgcStation[]`
- `savePegelstandStation(slug, station)`: saves a single station doc to `pegelstand_stations` with merge
- `deletePegelstandStation(slug)`: deletes a station doc
- `importOgcStations(ogcStations, scrapedSlugs)`: matches OGC stations to scraped station names using fuzzy name matching (lowercase, split on `/` and `(`), writes matched stations as batch, returns import count

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

Commit message: `feat: add admin server actions for OGC station import and Pegelstand management`

---

### Task 6: Admin UI Component

**Files:**
- Create: `src/components/admin/PegelstandStations.tsx`
- Modify: `src/components/admin/AdminTabs.tsx` (add import, tab, panel)
- Modify: `src/components/admin/index.ts` (add export)

**Step 1: Create PegelstandStations component**

The component should:
- Use `useFirebaseCollection<PegelstandStation>({ collectionName: 'pegelstand_stations' })` to list all stations
- Display a MUI `Table` with columns: Slug, Name, Typ, HZBNR, Lat, Lng, Aktionen (edit/delete icons)
- "Import von OGC API" button that: fetches OGC stations, fetches live scraped data (to get slugs/names), calls `importOgcStations`, shows result count
- "Hinzufugen" button opens add dialog
- Edit/Delete action buttons per row
- Add/Edit dialog with: slug (only for new), name, type (select: Fluss/See), hzbnr, detailUrl, lat+lng fields with a "Karte" button
- "Karte" button opens `LocationMapPicker` (from `src/components/Einsatzorte/LocationMapPicker.tsx`) for click-to-set coordinates
- Save writes to Firestore via `setDoc(doc(firestore, 'pegelstand_stations', slug), {...}, { merge: true })`
- Delete uses `deleteDoc(doc(firestore, 'pegelstand_stations', slug))` with confirmation

**Step 2: Register in AdminTabs**

In `src/components/admin/AdminTabs.tsx`:
- Add import: `import PegelstandStations from './PegelstandStations';`
- Add `<Tab label="Pegelstande" {...a11yProps(4)} />` after the Kostenersatz tab
- Add `<TabPanel value={value} index={4}><PegelstandStations /></TabPanel>` after the Kostenersatz panel

**Step 3: Add export to index.ts**

Add: `export { default as PegelstandStations } from './PegelstandStations';`

**Step 4: Verify in dev server**

Run: `npm run dev`
Navigate to /admin, verify "Pegelstande" tab loads without errors.

**Step 5: Commit**

Commit message: `feat: add Pegelstand admin UI with OGC import and station management`

---

### Task 7: End-to-End Testing

**Step 1: Test the import flow**

1. Navigate to `/admin` -> "Pegelstande" tab
2. Click "Import von OGC API"
3. Verify stations appear in the table with coordinates
4. Edit a station, use map picker to adjust position

**Step 2: Test the map layer**

1. Navigate to `/map`, enable "Pegelstande" layer
2. Verify water drop markers appear at station locations
3. Click a marker, verify popup shows name, values, timestamp, and detail link
4. Click detail link, verify it opens wasser.bgld.gv.at in a new tab

**Step 3: Test manual station add**

1. In admin, click "Hinzufugen"
2. Fill in slug, name, type, detailUrl
3. Click "Karte" to open map picker, click a position
4. Save, verify it appears in the table and on the map

**Step 4: Verify build and lint**

Run: `npm run build`
Run: `npm run lint`

**Step 5: Commit any fixes**

Commit message: `fix: address issues found during end-to-end testing`

---

### Task 8: Refine HTML Parsing (if needed)

After Task 7, the HTML parsing in `PegelstandAction.ts` may need adjustments.

**Step 1: Debug parsing**

If no stations appear, add temporary logging in the server action to inspect raw HTML structure. Common adjustments:
- Table cell ordering
- Extra whitespace or HTML entities
- Missing data cells for some stations

**Step 2: Commit fixes**

Commit message: `fix: refine HTML parsing for Pegelstand data extraction`
