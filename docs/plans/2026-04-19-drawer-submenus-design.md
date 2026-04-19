# Drawer Submenus für Schadstoff und Admin

Datum: 2026-04-19
Branch: `feature/drawer-submenus`

## Motivation

Die Seiten `Schadstoff` und `Admin` sind aktuell Sammelseiten mit internen Tabs. Dadurch sind die einzelnen Bereiche (z.B. Strahlenschutz, GIS Data Pipeline) nicht direkt verlinkbar und die Navigation wirkt überladen. Ziel: die Tabs durch echte Unterseiten ersetzen und im Drawer als aufklappbare Submenus darstellen.

## Scope

- Drawer (`src/components/site/AppDrawer.tsx`) unterstützt verschachtelte Menüpunkte mit Expand/Collapse.
- `Schadstoff` wird in drei Unterseiten aufgeteilt (Datenbank, Strahlenschutz, Energiespektrum) — sowohl unter `/schadstoff/*` als auch unter `/einsatz/[id]/schadstoff/*`.
- `Admin` wird in sieben Unterseiten aufgeteilt (Actions, GIS Data, Hydrant Clusters, Kostenersatz, Pegelstände, Deleted Items, Hydranten CSV Import). `Kostenersatz` existiert bereits als eigene Route.
- Die Tab-Komponenten (`AdminTabs`, Tab-Code in `SchadstoffPage`) entfallen.

Nicht im Scope: inhaltliche Änderungen an den einzelnen Komponenten, Restrukturierung anderer Navigationspunkte.

## Drawer-Navigation

### Typen

```ts
interface DrawerItem {
  text: string;
  icon: React.ReactNode;
  href: string;
  admin?: boolean;
  einsatzSection?: string;
  children?: DrawerItem[]; // NEU
}
```

Ein Item mit `children` ist ein Parent: kein Link, nur Expand/Collapse. Ein Klick togglet den lokalen `open`-State (keyed by `text`). Rendering via MUI `<Collapse>` und eingerückten `ListItemButton`s. `ExpandLess` / `ExpandMore`-Icons rechts im Parent.

### Auto-Expand

Beim Initialisieren des `open`-States wird jedes Parent-Item, dessen `href` ein Präfix des aktuellen `pathname` ist, als offen markiert. So ist nach Direktaufruf einer Unterseite (z.B. `/admin/gis-data`) das passende Submenu beim Öffnen des Drawers bereits offen. Gleiches gilt für `/einsatz/[id]/schadstoff/...` — der Schadstoff-Parent expandiert dann ebenfalls.

### Parent-Verhalten

Klick auf einen Parent navigiert NICHT. Er togglet ausschließlich Expand/Collapse. Der Nutzer wählt anschließend explizit eine Unterseite.

### Struktur

Zwei Parents mit Children:

- **Schadstoff** (Icon: `mdiBiohazard`, `einsatzSection: 'schadstoff'`)
  - Schadstoffdatenbank → `/schadstoff/datenbank`
  - Strahlenschutz → `/schadstoff/strahlenschutz`
  - Energiespektrum → `/schadstoff/energiespektrum`
- **Admin** (Icon: `AdminPanelSettingsIcon`, `admin: true`)
  - Admin Actions → `/admin/actions`
  - GIS Data Pipeline → `/admin/gis-data`
  - Hydrant Clusters → `/admin/hydrant-clusters`
  - Kostenersatz → `/admin/kostenersatz`
  - Pegelstände → `/admin/pegelstaende`
  - Deleted Items → `/admin/deleted-items`
  - Hydranten CSV Import → `/admin/hydranten-csv-import`

Children erben `admin` / `einsatzSection` vom Parent (via Merge beim Rendern), damit die bestehende Einsatz-URL-Umleitung weiterhin greift.

Alle übrigen Drawer-Einträge bleiben unverändert.

## Schadstoff-Routen

Ziel-Struktur (gleich für Top-Level und Einsatz-Kontext):

| Route | Inhalt |
|-------|--------|
| `/schadstoff` | `redirect('/schadstoff/datenbank')` |
| `/schadstoff/datenbank` | Schadstoffdatenbank (UN-Suche, Ericards) |
| `/schadstoff/strahlenschutz` | `<Strahlenschutz />` |
| `/schadstoff/energiespektrum` | `<EnergySpectrum />` (dynamic import, ssr: false) |

### Änderungen

- Neue Komponente `src/components/pages/Schadstoffdatenbank.tsx` — enthält den Datenbank-Code aus der bisherigen `SchadstoffPage` (Such-Felder, `useHazmatDb`, Ergebnis-Cards, Ericards-Submit).
- `src/components/pages/Schadstoff.tsx` wird gelöscht.
- `src/app/schadstoff/layout.tsx`: rendert nur noch einen gemeinsamen Header (`<Typography variant="h4">Schadstoff</Typography>`) und `{children}`. Kein `SchadstoffPage` mehr.
- `src/app/schadstoff/page.tsx`: `redirect('/schadstoff/datenbank')`.
- Neue Datei `src/app/schadstoff/datenbank/page.tsx`.
- `src/app/schadstoff/strahlenschutz/page.tsx` und `energiespektrum/page.tsx`: rendern die echten Komponenten statt `null`.
- Analog unter `src/app/einsatz/[firecallId]/schadstoff/*`: Layout-Header, `page.tsx` als Redirect auf `/einsatz/[id]/schadstoff/datenbank`, neue `datenbank/page.tsx`, bestehende Subroutes rendern Inhalt.

Die URL-Parsing-Logik aus der alten Schadstoff-Page (`parseSchadstoffPath`, `TAB_ROUTES`) entfällt vollständig.

## Admin-Routen

Ziel-Struktur:

| Route | Inhalt |
|-------|--------|
| `/admin` | `redirect('/admin/actions')` |
| `/admin/actions` | `<AdminActions />` |
| `/admin/gis-data` | `<GisDataPipeline />` |
| `/admin/hydrant-clusters` | `<HydrantClusters />` |
| `/admin/kostenersatz` | `<KostenersatzAdminSettings />` (existiert) |
| `/admin/pegelstaende` | `<PegelstandStations />` |
| `/admin/deleted-items` | `<DeletedItems />` |
| `/admin/hydranten-csv-import` | `<HydrantenCsvImport />` |

### Änderungen

- Neues `src/app/admin/layout.tsx`: umschließt `{children}` mit `<AdminGuard>` und `<Box sx={{ margin: 2 }}>` plus `<Typography variant="h3">Admin</Typography>`. Unterseiten brauchen kein Guard/Heading-Boilerplate mehr.
- `src/app/admin/page.tsx`: `redirect('/admin/actions')`.
- Neue Page-Files für die sechs neuen Routen (jeweils nur die entsprechende Komponente rendern, `'use client'` wo nötig).
- `src/app/admin/kostenersatz/page.tsx`: `<AdminGuard>` und `<Container>` entfernen (Guard kommt aus Layout). Rendert nur `<KostenersatzAdminSettings />`.
- `src/components/admin/AdminTabs.tsx` wird gelöscht.
- `src/components/admin/index.ts`: Export von `AdminTabs` entfernen.

## Testing

- Existierende Tests in `src/components/admin/` / `src/components/pages/` bleiben funktional (sie testen die einzelnen Komponenten, nicht die Tab-Wrapper).
- Neue Tests für den Drawer: Expand/Collapse-Verhalten für Parent-Items, Auto-Expand bei aktivem Pathname, korrekte `href`-Auflösung bei `einsatzSection` in Children.
- `npm run check` muss grün laufen (tsc, lint, test, build).

## Migration / Kompatibilität

- Bookmarks auf `/schadstoff` und `/admin` funktionieren via Redirect weiter.
- `/schadstoff/strahlenschutz` und `/schadstoff/energiespektrum` existieren heute schon — Pfade bleiben stabil.
- `/admin/kostenersatz` existiert schon — Pfad bleibt stabil.
- Neue Pfade (`/admin/actions` etc.) sind erstmal ohne externe Nutzer.

## Offene Punkte

Keine.
