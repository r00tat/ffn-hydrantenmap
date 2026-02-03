# Documentation Page Design

## Overview

Add a dedicated documentation section at `/docs` to help firefighters understand how to use the app. The documentation will be in German, targeting end users with "how to" guides for each feature.

## Routes

| Route | Content |
|-------|---------|
| `/docs` | Landing page with overview and quick links |
| `/docs/karte` | Map & Hydrants documentation |
| `/docs/einsaetze` | Operations management |
| `/docs/tagebuch` | Operational diary |
| `/docs/fahrzeuge` | Vehicle tracking |
| `/docs/schadstoff` | Hazmat database |
| `/docs/kostenersatz` | Cost recovery |
| `/docs/geschaeftsbuch` | Business logbook |

## Page Layout

```
┌─────────────────────────────────────────────┐
│  App Header (existing)                      │
├──────────┬──────────────────────────────────┤
│ Sidebar  │  Content Area                    │
│          │                                  │
│ • Über-  │  # Page Title                    │
│   sicht  │                                  │
│ • Karte  │  Description text...             │
│ • Ein-   │                                  │
│   sätze  │  ┌─────────────────────────┐    │
│ • Tage-  │  │    Screenshot           │    │
│   buch   │  └─────────────────────────┘    │
│ • Fahr-  │                                  │
│   zeuge  │  ## Section heading              │
│ • Schad- │  More content...                 │
│   stoff  │                                  │
│ • Kosten │                                  │
│ • Gesch. │                                  │
└──────────┴──────────────────────────────────┘
```

The sidebar is a shared layout component at `/docs/layout.tsx`.

## Content Structure

Each documentation page follows a consistent format:

```markdown
# [Feature Name]

Short description (1-2 sentences).

[Screenshot]

## Funktionen

- Key capabilities
- What users can do

## Anleitung

### [Task 1]
1. Step one
2. Step two

### [Task 2]
1. ...

## Tipps

Optional tips or best practices.
```

### Content per Page

| Page | Key Topics |
|------|------------|
| Karte | Navigieren, Hydranten anzeigen, Layer wechseln, Suche |
| Einsätze | Einsatz erstellen, bearbeiten, abschließen, Elemente hinzufügen |
| Tagebuch | Einträge erstellen, Timeline ansehen, filtern |
| Fahrzeuge | Fahrzeugpositionen, Status aktualisieren |
| Schadstoff | Suche nach Gefahrstoffen, Datenblätter |
| Kostenersatz | Abrechnung erstellen, Positionen, Export |
| Geschäftsbuch | Einträge verwalten, Protokolle |

## Playwright Screenshots

### Setup

Add to `devDependencies`:
```json
"@playwright/test": "^1.50.0"
```

### File Structure

```
/playwright/
  playwright.config.ts      # Configuration
  screenshots.spec.ts       # Screenshot capture script
  auth.setup.ts            # Authentication helper

/public/docs/screenshots/
  karte.png
  einsaetze.png
  tagebuch.png
  fahrzeuge.png
  schadstoff.png
  kostenersatz.png
  geschaeftsbuch.png
```

### Workflow

1. Start dev server (or connect to running one)
2. Authenticate with test credentials (`DOCS_TEST_EMAIL` / `DOCS_TEST_PASSWORD` from `.env.local`)
3. Navigate to each page
4. Wait for content to load
5. Capture at 1280x800 viewport
6. Save to `/public/docs/screenshots/`

### NPM Script

```json
"docs:screenshots": "playwright test playwright/screenshots.spec.ts"
```

Screenshots are committed to git for availability without regeneration.

## Components

### New Files

```
/src/app/docs/
  layout.tsx              # Shared sidebar layout
  page.tsx                # Landing page
  karte/page.tsx
  einsaetze/page.tsx
  tagebuch/page.tsx
  fahrzeuge/page.tsx
  schadstoff/page.tsx
  kostenersatz/page.tsx
  geschaeftsbuch/page.tsx

/src/components/docs/
  DocsSidebar.tsx         # Navigation sidebar
  DocsContent.tsx         # Content wrapper
  Screenshot.tsx          # Image component
```

### Navigation Integration

Add "Dokumentation" link to the main app drawer menu, linking to `/docs`.

## Access Control

- Documentation pages are publicly accessible (no login required)
- Screenshots are static images captured from authenticated sessions

## Styling

- Use existing MUI components (Typography, Box, List, Paper)
- Consistent with app's existing look and feel
