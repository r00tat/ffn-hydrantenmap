# Design: Geohash-Cluster für Wetterstationen und Pegelstände

## Zusammenfassung

Wetterstationen und Pegelstände werden in die bestehende `clusters6` Firestore-Collection integriert (GeohashCluster erweitert). Die Stationspositionen (Metadaten) werden als Teil der Cluster-Dokumente mitgeladen. Live-Daten (Temperatur, Wasserstand etc.) werden erst per Server Action geholt, wenn der jeweilige Layer eingeblendet wird.

## Architektur

### 1. GeohashCluster erweitern

```typescript
interface GeohashCluster {
  geohash: string;
  hydranten?: HydrantenRecord[];
  risikoobjekt?: RisikoObjekt[];
  gefahrobjekt?: GefahrObjekt[];
  loeschteich?: Loeschteich[];
  saugstelle?: Saugstelle[];
  wetterstationen?: WetterstationRecord[];   // NEU
  pegelstaende?: PegelstandRecord[];         // NEU
}
```

**WetterstationRecord** (statische Metadaten):
- `id` (string) - TAWES Station ID
- `name` (string)
- `lat`, `lng` (number)
- `altitude` (number)
- `state` (string) - Bundesland

**PegelstandRecord** (statische Metadaten):
- `id` (string) - Slug/Stationsnummer
- `name` (string)
- `lat`, `lng` (number)
- `type` ('river' | 'lake')
- `source` ('bgld' | 'noe' | 'stmk')
- `detailUrl` (string)
- `rivername?` (string)

### 2. Datenfluss

```
Map laden → useClusters() lädt clusters6 → Hydranten etc. + Stationspositionen
                                                                    ↓
                                              wetterstationen[] und pegelstaende[] verfügbar
                                                                    ↓
User blendet Layer ein → sichtbare Station-IDs → Server Action
                                                                    ↓
                                              Live-Daten für diese IDs zurück
                                                                    ↓
                                              Marker mit Live-Daten rendern
                                                                    ↓
                                              Polling (Wetter 10min, Pegel 5min)
                                              solange Layer eingeblendet
```

### 3. Server Actions für Live-Daten

**`fetchWetterstationLiveData(stationIds: string[])`**
- GeoSphere TAWES API aufrufen
- Daten auf angefragte Station-IDs filtern
- Rückgabe: `Record<string, WetterstationLiveData>`

**`fetchPegelstandLiveData(stations: {id: string, source: string}[])`**
- Bestehende Scraping-Logik nutzen (HTML-Scraping liefert alle Daten)
- Server-seitig auf angefragte Stationen filtern
- Next.js `revalidate: 300` für 5-Minuten-Cache
- Rückgabe: `Record<string, PegelstandLiveData>`

### 4. Layer-Komponenten (angepasst)

**WetterstationLayer:**
- Erhält `wetterstationen[]` aus `useClusters()` (Positionen)
- Bei Layer-Aktivierung: Station-IDs → `fetchWetterstationLiveData()`
- Polling alle 10 Min solange Layer sichtbar
- Marker rendern mit Live-Daten (Temperatur-Farbe etc.)

**PegelstandLayer:**
- Erhält `pegelstaende[]` aus `useClusters()` (Positionen)
- Bei Layer-Aktivierung: Stations → `fetchPegelstandLiveData()`
- Polling alle 5 Min solange Layer sichtbar
- Marker rendern mit Live-Daten (Wasserstand, Farbe etc.)

### 5. Cluster-Import erweitern

Bestehenden `update-clusters` Admin-Mechanismus erweitern:

**Wetterstationen:**
- GeoSphere Metadata API → Stationen filtern (Burgenland + Umgebung)
- Geohash generieren → in clusters6 Dokumente einfügen

**Pegelstände:**
- Bgld: Aus Firestore `pegelstand_stations` lesen
- NÖ: MapList.json API → distanzgefiltert
- Stmk: hydavis API → distanzgefiltert
- Geohash generieren → in clusters6 Dokumente einfügen

### 6. Kein Breaking Change

- `useClusters()` liefert zusätzliche Arrays, bestehende Layer unberührt
- Cluster-Dokumente werden per `merge: true` geschrieben
- Bestehende Hydranten-/Risikoobjekt-Funktionalität bleibt identisch
