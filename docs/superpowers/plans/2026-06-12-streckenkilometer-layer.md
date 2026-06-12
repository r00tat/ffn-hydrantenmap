# Streckenkilometer-Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Projekt-Konvention (Memory):** Lean-Ausführung — keine Zwischen-Commits/Checks pro Step; alle Checks und Commits am Ende (Task 6).

**Goal:** Kilometertafeln der Autobahnen/Schnellstraßen im Burgenland (A4, A6, S31, S4, S7) als ein-/ausschaltbarer Leaflet-Overlay-Layer.

**Architecture:** Einmalige Extraktion der GIP-Bezugspunkte (Layer `BEPU_OGD` aus dem GIP-OGD-GeoPackage „C – References") in ein statisches GeoJSON unter `public/data/`. Eine neue Layer-Komponente lädt das GeoJSON lazy beim ersten Aktivieren und rendert nur die im Viewport sichtbare, zoom-gefilterte Teilmenge als blaue km-Tafel-Labels (`L.divIcon`).

**Tech Stack:** Next.js 16, React 19, react-leaflet, next-intl, Vitest. Extraktion: TypeScript-Script nach bestehendem `src/server/`-Muster, liest das GeoPackage über die `sqlite3`-CLI (`/usr/bin/sqlite3`, GDAL ist nicht installiert).

**Spec:** `docs/superpowers/specs/2026-06-12-streckenkilometer-layer-design.md`

---

## Umsetzungs-Abweichung (nach Task 1 festgestellt)

`BEPU_OGD` enthält **keine** Autobahn-Bezugspunkte (ASFINAG publiziert nicht
im OGD-Export). Die Extraktion wurde auf die kilometrierten
Richtungsfahrbahn-Routen der Tabelle `LinkEdgeRoute` (Routingexport
`A_routingexport_ogd_split.zip`) umgestellt: Link-Geometrien aus
`gip_network_ogd.gpkg` (`GIP_LINKNETZ_OGD`) werden je Route abgegangen und
alle 500 m wird ein km-Punkt interpoliert. Details siehe aktualisiertes
Spec-Dokument. Task 2 wurde entsprechend angepasst umgesetzt; die übrigen
Tasks blieben unverändert.

## Recherche-Ergebnisse (bereits erledigt)

- Download: `https://open.gip.gv.at/ogd/C_gip_reference_ogd.zip` (~259 MB, Stand 01/2026), Quelle: data.gv.at-Datensatz `3fefc838-791d-4dde-975b-a4131a54e7c5`.
- Layer im GeoPackage: `BEPU_OGD` (Bezugspunkte/Kilometertafeln). Relevante Felder laut GIP-Doku 09/2025: `OBJECTID`, `FROMKM`/`TOKM` (float, km), `FEATURENAME` (string, „Berechnete Bezeichnung"), `TYPE`, `ALIVE` (Historisierung), `EDGE_OBJECTID`.
- Koordinaten laut GIP-Doku in WGS84 (bei Extraktion verifizieren via `gpkg_geometry_columns.srs_id`; Fallback: `proj4` ist bereits devDependency).
- Lizenz CC BY 4.0, vorgeschriebene Attribution: „Datenquelle: gip.gv.at" mit Link auf `www.gip.gv.at`.
- GPKG-Geometrie-Blob: `GP`-Header (8 Byte: magic+version+flags+srs_id) + optionales Envelope (Länge laut Flags-Bits 1–3) + WKB. Punkt-WKB: 1 Byte Byteorder, 4 Byte Typ (1), 2×8 Byte Double (x=lng, y=lat).

## File Structure

- Create: `src/server/streckenkilometer-extract.ts` — Extraktions-Script (einmalig, lokal)
- Create: `public/data/streckenkilometer.geojson` — generierte Daten (committed)
- Create: `src/components/Map/layers/streckenkilometerUtils.ts` — pure Hilfsfunktionen (Format, Filter)
- Create: `src/components/Map/layers/streckenkilometerUtils.test.ts` — Tests dafür (TDD, vor Implementierung)
- Create: `src/components/Map/layers/StreckenkilometerLayer.tsx` — Layer-Komponente
- Modify: `package.json` — npm-Script `extractStreckenkilometer`
- Modify: `src/components/Map/Map.tsx` — Overlay registrieren
- Modify: `messages/de.json` + `messages/en.json` — Namespace `streckenkilometer`

---

### Task 1: GIP-Daten herunterladen und inspizieren

- [ ] **Step 1: Download + Entpacken (außerhalb des Repos, z.B. `/tmp/claude/gip/`)**

```bash
mkdir -p /tmp/claude/gip
curl -L -o /tmp/claude/gip/C_gip_reference_ogd.zip -H "User-Agent: Mozilla/5.0" https://open.gip.gv.at/ogd/C_gip_reference_ogd.zip
unzip -o /tmp/claude/gip/C_gip_reference_ogd.zip -d /tmp/claude/gip/
ls -la /tmp/claude/gip/
```

- [ ] **Step 2: Schema + Beispieldaten inspizieren**

```bash
GPKG=$(ls /tmp/claude/gip/*.gpkg | head -1)
sqlite3 "$GPKG" "SELECT table_name, srs_id FROM gpkg_geometry_columns;"
sqlite3 "$GPKG" "PRAGMA table_info(BEPU_OGD);"
sqlite3 -json "$GPKG" "SELECT OBJECTID, FROMKM, TOKM, FEATURENAME, TYPE, ALIVE FROM BEPU_OGD LIMIT 10;"
sqlite3 -json "$GPKG" "SELECT FEATURENAME, COUNT(*) c FROM BEPU_OGD WHERE FEATURENAME LIKE 'A4%' GROUP BY FEATURENAME LIMIT 20;"
```

Erwartung: Tabellen-/Spaltennamen bestätigen (ggf. abweichende Schreibweise übernehmen), `srs_id` = 4326, und klären, wie `FEATURENAME` aufgebaut ist (enthält es Straßenbezeichnung und/oder Richtung?). **Die WHERE-Klausel in Task 2 an den realen Datenaufbau anpassen** — Ziel: alle Tafeln von A4, A6, S31, S4, S7, nur `ALIVE`-Datensätze.

### Task 2: Extraktions-Script

- [ ] **Step 1: `src/server/streckenkilometer-extract.ts` schreiben**

Muster der bestehenden Scripts (z.B. `hydrant-geohash.ts`): eigenständiges CLI-Script, kompiliert via `tsc --outDir dist`. Liest das GPKG über die `sqlite3`-CLI (`-json`-Ausgabe mit `hex(geom)`), parst den GPKG-Geometrie-Header + Punkt-WKB, schreibt GeoJSON:

```typescript
/* eslint-disable no-console */
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';

// Streckenkilometer (Kilometertafeln) aus dem GIP-OGD-GeoPackage extrahieren.
// Quelle: https://open.gip.gv.at/ogd/C_gip_reference_ogd.zip (Layer BEPU_OGD)
// Lizenz: CC BY 4.0, Datenquelle: gip.gv.at
// Verwendung: npm run extractStreckenkilometer -- <pfad-zum-gpkg>

const ROADS = ['A4', 'A6', 'S31', 'S4', 'S7'];
const OUTPUT = 'public/data/streckenkilometer.geojson';

interface BepuRow {
  FROMKM: number;
  FEATURENAME: string;
  geomHex: string;
}

// GPKG-Blob: 2 Byte Magic 'GP', 1 Byte Version, 1 Byte Flags, 4 Byte srs_id,
// dann Envelope (Größe laut Flags Bits 1-3), dann Standard-WKB.
export function parseGpkgPoint(hex: string): [number, number] {
  const buf = Buffer.from(hex, 'hex');
  if (buf.toString('ascii', 0, 2) !== 'GP') {
    throw new Error('Kein GPKG-Geometrie-Blob');
  }
  const flags = buf[3];
  const envelopeType = (flags >> 1) & 0x07;
  const envelopeSizes = [0, 32, 48, 48, 64];
  const envelopeSize = envelopeSizes[envelopeType] ?? 0;
  const wkb = buf.subarray(8 + envelopeSize);
  const littleEndian = wkb[0] === 1;
  const geomType = littleEndian ? wkb.readUInt32LE(1) : wkb.readUInt32BE(1);
  if (geomType % 1000 !== 1) {
    throw new Error(`Kein Punkt-WKB (Typ ${geomType})`);
  }
  const x = littleEndian ? wkb.readDoubleLE(5) : wkb.readDoubleBE(5);
  const y = littleEndian ? wkb.readDoubleLE(13) : wkb.readDoubleBE(13);
  return [x, y];
}

// FEATURENAME → Straße/Richtung; Aufbau nach Task-1-Inspektion anpassen.
export function parseFeatureName(featureName: string): {
  strasse: string;
  richtung?: string;
} {
  const [strasse, ...rest] = featureName.split(/[\s_;]+/);
  return { strasse, richtung: rest.join(' ') || undefined };
}

function main() {
  const gpkg = process.argv[2];
  if (!gpkg) {
    console.error('Verwendung: streckenkilometer-extract <pfad-zum-gpkg>');
    process.exit(1);
  }
  const where = ROADS.map(
    // Anpassen, falls FEATURENAME anders aufgebaut ist (Task 1)
    (r) => `FEATURENAME = '${r}' OR FEATURENAME LIKE '${r} %'`
  ).join(' OR ');
  const sql = `SELECT FROMKM, FEATURENAME, hex(geom) AS geomHex
    FROM BEPU_OGD WHERE (${where})`;
  const out = execFileSync('/usr/bin/sqlite3', ['-json', gpkg, sql], {
    maxBuffer: 256 * 1024 * 1024,
    encoding: 'utf8',
  });
  const rows: BepuRow[] = out.trim() ? JSON.parse(out) : [];
  if (rows.length === 0) {
    console.error('Keine Bezugspunkte gefunden — WHERE-Klausel prüfen!');
    process.exit(1);
  }

  const features = rows.map((row) => {
    const [lng, lat] = parseGpkgPoint(row.geomHex);
    const { strasse, richtung } = parseFeatureName(row.FEATURENAME);
    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [
          Math.round(lng * 1e6) / 1e6,
          Math.round(lat * 1e6) / 1e6,
        ],
      },
      properties: { strasse, km: row.FROMKM, ...(richtung ? { richtung } : {}) },
    };
  });

  const counts = new Map<string, number>();
  features.forEach((f) =>
    counts.set(f.properties.strasse, (counts.get(f.properties.strasse) || 0) + 1)
  );
  console.log('Punkte je Straße:', Object.fromEntries(counts));

  writeFileSync(
    OUTPUT,
    JSON.stringify({ type: 'FeatureCollection', features })
  );
  console.log(`${features.length} Punkte → ${OUTPUT}`);
}

main();
```

Hinweise:

- Spaltennamen/WHERE an Task-1-Befund anpassen (inkl. `ALIVE = 1`-Filter, falls Spalte vorhanden und historisierte Datensätze enthalten sind).
- Falls `srs_id` ≠ 4326: mit `proj4` (bereits devDependency) nach WGS84 transformieren.
- Plausibilitätsprüfung: A4 muss bei Neusiedl (~16,8°E / 47,95°N) Punkte haben, km-Bereich A4 ≈ 0–66.

- [ ] **Step 2: npm-Script in `package.json` ergänzen** (nach `updateClusters`)

```json
"extractStreckenkilometer": "npx tsc --outDir dist src/server/streckenkilometer-extract && node dist/server/streckenkilometer-extract.js",
```

- [ ] **Step 3: Script ausführen und Ergebnis prüfen**

```bash
npm run extractStreckenkilometer -- /tmp/claude/gip/<datei>.gpkg
ls -la public/data/streckenkilometer.geojson
jq '.features | length' public/data/streckenkilometer.geojson
jq '[.features[].properties.strasse] | group_by(.) | map({(.[0]): length}) | add' public/data/streckenkilometer.geojson
jq '.features[0]' public/data/streckenkilometer.geojson
```

Erwartung: grob 800–1.600 Features, alle 5 Straßen vertreten, Koordinaten in Ostösterreich (lng 16–17, lat 47–48). Stichprobe gegen bekannten Punkt prüfen (A4 Abfahrt Neusiedl ≈ km 43).

### Task 3: Hilfsfunktionen mit Tests (TDD)

- [ ] **Step 1: `src/components/Map/layers/streckenkilometerUtils.test.ts` schreiben (vor der Implementierung, Vitest)**

```typescript
import { describe, expect, it } from 'vitest';
import {
  filterVisiblePoints,
  formatKm,
  StreckenkilometerPoint,
} from './streckenkilometerUtils';

const point = (
  strasse: string,
  km: number,
  lat: number,
  lng: number,
  richtung?: string
): StreckenkilometerPoint => ({ strasse, km, lat, lng, richtung });

describe('formatKm', () => {
  it('formatiert ganze Kilometer mit einer Nachkommastelle und Komma', () => {
    expect(formatKm(43)).toBe('43,0');
  });
  it('formatiert halbe Kilometer', () => {
    expect(formatKm(42.5)).toBe('42,5');
  });
});

describe('filterVisiblePoints', () => {
  const bounds = { south: 47.9, west: 16.7, north: 48.0, east: 16.9 };
  const inside = point('A4', 43, 47.95, 16.8);
  const insideHalf = point('A4', 43.5, 47.951, 16.81);
  const outside = point('A4', 50, 48.5, 17.5);

  it('liefert unterhalb Zoom 13 nichts', () => {
    expect(filterVisiblePoints([inside], 12, bounds)).toEqual([]);
  });

  it('liefert bei Zoom 13 nur ganze Kilometer innerhalb der Bounds', () => {
    expect(filterVisiblePoints([inside, insideHalf, outside], 13, bounds)).toEqual(
      [inside]
    );
  });

  it('liefert ab Zoom 15 auch Zwischen-Tafeln', () => {
    expect(
      filterVisiblePoints([inside, insideHalf, outside], 15, bounds)
    ).toEqual([inside, insideHalf]);
  });

  it('filtert Punkte außerhalb der Bounds', () => {
    expect(filterVisiblePoints([outside], 15, bounds)).toEqual([]);
  });
});
```

- [ ] **Step 2: `src/components/Map/layers/streckenkilometerUtils.ts` implementieren**

```typescript
export interface StreckenkilometerPoint {
  strasse: string;
  km: number;
  lat: number;
  lng: number;
  richtung?: string;
}

export interface SimpleBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export const MIN_ZOOM_FULL_KM = 13;
export const MIN_ZOOM_ALL = 15;

export function formatKm(km: number): string {
  return km.toFixed(1).replace('.', ',');
}

export function filterVisiblePoints(
  points: StreckenkilometerPoint[],
  zoom: number,
  bounds: SimpleBounds
): StreckenkilometerPoint[] {
  if (zoom < MIN_ZOOM_FULL_KM) return [];
  const fullKmOnly = zoom < MIN_ZOOM_ALL;
  return points.filter(
    (p) =>
      p.lat >= bounds.south &&
      p.lat <= bounds.north &&
      p.lng >= bounds.west &&
      p.lng <= bounds.east &&
      (!fullKmOnly || Number.isInteger(p.km))
  );
}
```

(GeoJSON→`StreckenkilometerPoint`-Konvertierung passiert in der Komponente beim Laden; falls Task 1 ergibt, dass es je Richtung eigene Tafeln gibt, bei `fullKmOnly` zusätzlich auf eine Richtung reduzieren — Test entsprechend ergänzen.)

### Task 4: Layer-Komponente

- [ ] **Step 1: `src/components/Map/layers/StreckenkilometerLayer.tsx` schreiben**

Muster: Lazy-Visibility wie `PegelstandLayer.tsx` (overlayadd/-remove), Icon-Cache, Marker mit Popup. Zusätzlich Viewport/Zoom-Tracking über `moveend`/`zoomend`.

```tsx
'use client';

import L from 'leaflet';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { LayerGroup, Marker, Popup, useMap } from 'react-leaflet';
import {
  filterVisiblePoints,
  formatKm,
  SimpleBounds,
  StreckenkilometerPoint,
} from './streckenkilometerUtils';

export const STRECKENKILOMETER_LAYER_NAME = 'Streckenkilometer';
const GEOJSON_URL = '/data/streckenkilometer.geojson';
const BOUNDS_PADDING = 0.2; // Puffer rund um den Viewport

interface StreckenkilometerFeature {
  geometry: { coordinates: [number, number] };
  properties: { strasse: string; km: number; richtung?: string };
}

const iconCache = new Map<string, L.DivIcon>();

function getKmTafelIcon(label: string): L.DivIcon {
  let icon = iconCache.get(label);
  if (!icon) {
    icon = L.divIcon({
      html: `<div style="background:#003d8f;color:#fff;border:1px solid #fff;border-radius:3px;padding:1px 4px;font-size:11px;font-weight:bold;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.5);">${label}</div>`,
      className: '',
      iconSize: undefined,
      iconAnchor: [24, 10],
    });
    iconCache.set(label, icon);
  }
  return icon;
}

function useLayerVisible(): boolean {
  const map = useMap();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onAdd = (e: L.LayersControlEvent) => {
      if (e.name === STRECKENKILOMETER_LAYER_NAME) setVisible(true);
    };
    const onRemove = (e: L.LayersControlEvent) => {
      if (e.name === STRECKENKILOMETER_LAYER_NAME) setVisible(false);
    };
    map.on('overlayadd', onAdd as L.LeafletEventHandlerFn);
    map.on('overlayremove', onRemove as L.LeafletEventHandlerFn);
    return () => {
      map.off('overlayadd', onAdd as L.LeafletEventHandlerFn);
      map.off('overlayremove', onRemove as L.LeafletEventHandlerFn);
    };
  }, [map]);
  return visible;
}

function useViewport(): { zoom: number; bounds: SimpleBounds } {
  const map = useMap();
  const toState = () => {
    const b = map.getBounds().pad(BOUNDS_PADDING);
    return {
      zoom: map.getZoom(),
      bounds: {
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      },
    };
  };
  const [viewport, setViewport] = useState(toState);
  useEffect(() => {
    const update = () => setViewport(toState());
    map.on('moveend', update);
    map.on('zoomend', update);
    return () => {
      map.off('moveend', update);
      map.off('zoomend', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return viewport;
}

function useStreckenkilometerData(visible: boolean): StreckenkilometerPoint[] {
  const [points, setPoints] = useState<StreckenkilometerPoint[]>([]);
  useEffect(() => {
    if (!visible || points.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(GEOJSON_URL);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const geojson = await response.json();
        if (cancelled) return;
        setPoints(
          (geojson.features as StreckenkilometerFeature[]).map((f) => ({
            strasse: f.properties.strasse,
            km: f.properties.km,
            richtung: f.properties.richtung,
            lng: f.geometry.coordinates[0],
            lat: f.geometry.coordinates[1],
          }))
        );
      } catch (err) {
        console.error('Streckenkilometer konnten nicht geladen werden', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, points.length]);
  return points;
}

export default function StreckenkilometerLayer() {
  const t = useTranslations('streckenkilometer');
  const visible = useLayerVisible();
  const points = useStreckenkilometerData(visible);
  const { zoom, bounds } = useViewport();

  const markers = useMemo(
    () => (visible ? filterVisiblePoints(points, zoom, bounds) : []),
    [visible, points, zoom, bounds]
  );

  return (
    <LayerGroup attribution='Datenquelle: <a href="https://www.gip.gv.at" target="_blank" rel="noopener noreferrer">gip.gv.at</a> (CC BY 4.0)'>
      {markers.map((p) => {
        const label = `${p.strasse} ${formatKm(p.km)}`;
        return (
          <Marker
            position={[p.lat, p.lng]}
            icon={getKmTafelIcon(label)}
            key={`${p.strasse}-${p.km}-${p.richtung || ''}`}
          >
            <Popup>
              <b>
                {p.strasse} km {formatKm(p.km)}
              </b>
              {p.richtung && (
                <>
                  <br />
                  {t('direction')}: {p.richtung}
                </>
              )}
            </Popup>
          </Marker>
        );
      })}
    </LayerGroup>
  );
}
```

Hinweis: `useViewport` initialisiert mit `useState(toState)` — lazy initializer, kein Effekt nötig für den Erstwert. Popup-Inhalt je nach Task-1-Befund (Richtungswerte) anpassen.

### Task 5: Registrierung in Map.tsx + i18n

- [ ] **Step 1: Overlay in `src/components/Map/Map.tsx` registrieren** (nach „Pegelstände", Zeile ~141)

```tsx
import StreckenkilometerLayer from './layers/StreckenkilometerLayer';
// ...
<LayersControl.Overlay name="Streckenkilometer">
  <StreckenkilometerLayer />
</LayersControl.Overlay>
```

Der Overlay-Name bleibt — wie alle bestehenden Overlay-Namen in `Map.tsx` („Einsatzorte", „Stromausfälle", „Pegelstände") — bewusst hartkodiert deutsch, weil das `overlayadd`-Event-Matching auf exakt diesem String basiert (`STRECKENKILOMETER_LAYER_NAME`). Eine Teil-Übersetzung nur dieses einen Namens wäre inkonsistent; die Übersetzung aller Layer-Namen ist ein separates Thema.

- [ ] **Step 2: i18n-Schlüssel in `messages/de.json` und `messages/en.json`** (alphabetisch einsortieren, Namespace `streckenkilometer`)

`de.json`:

```json
"streckenkilometer": {
  "direction": "Richtung"
}
```

`en.json`:

```json
"streckenkilometer": {
  "direction": "Direction"
}
```

(Weitere Schlüssel nur ergänzen, falls Task 1 zusätzliche Popup-Felder ergibt.)

### Task 6: Checks und Commits (am Ende, gemäß Projekt-Memory)

- [ ] **Step 1: Checks einzeln ausführen, Fehler beheben**

```bash
npx tsc --noEmit
npx eslint
npx vitest run
npx next build --webpack
```

Erwartung: alles grün, keine Warnings. TSC-Fehler dürfen NIEMALS ignoriert werden.

- [ ] **Step 2: Committen** (getrennt `git add` und `git commit`, keine Co-Authored-By-Zeile)

```bash
git add src/server/streckenkilometer-extract.ts package.json
git commit -m "feat: Extraktions-Script für GIP-Streckenkilometer"
git add public/data/streckenkilometer.geojson
git commit -m "feat: Streckenkilometer-Daten A4/A6/S31/S4/S7 aus GIP-Export"
git add src/components/Map/layers/streckenkilometerUtils.ts src/components/Map/layers/streckenkilometerUtils.test.ts src/components/Map/layers/StreckenkilometerLayer.tsx src/components/Map/Map.tsx messages/de.json messages/en.json
git commit -m "feat: Streckenkilometer-Layer mit km-Tafeln auf der Karte"
```

- [ ] **Step 3: Manuell verifizieren** — `npm run dev`, Layer „Streckenkilometer" aktivieren, zur A4 navigieren (z.B. Neusiedl ≈ km 43): ab Zoom 13 ganze km sichtbar, ab Zoom 15 alle Tafeln, Popup zeigt Straße/km/Richtung, Attribution unten rechts sichtbar.
