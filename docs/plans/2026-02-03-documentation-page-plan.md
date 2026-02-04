# Documentation Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a multi-page documentation section at `/docs` with Playwright-generated screenshots to help firefighters learn how to use the app.

**Architecture:** Next.js App Router pages with shared layout for sidebar navigation. Playwright captures authenticated screenshots via a manual npm script. Documentation content as React components using MUI.

**Tech Stack:** Next.js 16, React 19, MUI, Playwright

---

## Task 1: Install Playwright

**Files:**
- Modify: `package.json`

**Step 1: Install Playwright as dev dependency**

Run:
```bash
npm install -D @playwright/test
```

**Step 2: Install Playwright browsers**

Run:
```bash
npx playwright install chromium
```

**Step 3: Verify installation**

Run:
```bash
npx playwright --version
```
Expected: Version number displayed (e.g., `1.50.0`)

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add playwright for documentation screenshots"
```

---

## Task 2: Create Playwright Configuration

**Files:**
- Create: `playwright/playwright.config.ts`

**Step 1: Create playwright config**

Create `playwright/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1280, height: 800 },
    screenshot: 'off',
    trace: 'off',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    {
      name: 'screenshots',
      testMatch: 'screenshots.spec.ts',
    },
  ],
});
```

**Step 2: Commit**

```bash
git add playwright/playwright.config.ts
git commit -m "chore: add playwright configuration"
```

---

## Task 3: Create Screenshot Capture Script

**Files:**
- Create: `playwright/screenshots.spec.ts`

**Step 1: Create screenshot spec**

Create `playwright/screenshots.spec.ts`:

```typescript
import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const screenshotDir = path.join(__dirname, '../public/docs/screenshots');

// Ensure screenshot directory exists
fs.mkdirSync(screenshotDir, { recursive: true });

const pages = [
  { name: 'karte', path: '/', waitFor: '.leaflet-container' },
  { name: 'einsaetze', path: '/einsaetze', waitFor: 'main' },
  { name: 'tagebuch', path: '/tagebuch', waitFor: 'main' },
  { name: 'fahrzeuge', path: '/fahrzeuge', waitFor: 'main' },
  { name: 'schadstoff', path: '/schadstoff', waitFor: 'main' },
  { name: 'kostenersatz', path: '/kostenersatz', waitFor: 'main' },
  { name: 'geschaeftsbuch', path: '/geschaeftsbuch', waitFor: 'main' },
];

test.describe('Documentation Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    // Login with test credentials
    const email = process.env.DOCS_TEST_EMAIL;
    const password = process.env.DOCS_TEST_PASSWORD;

    if (!email || !password) {
      throw new Error(
        'DOCS_TEST_EMAIL and DOCS_TEST_PASSWORD must be set in environment'
      );
    }

    await page.goto('/login');

    // Wait for Firebase UI to load and click email sign-in
    await page.waitForSelector('[data-provider-id="password"]', { timeout: 10000 });
    await page.click('[data-provider-id="password"]');

    // Fill in credentials
    await page.waitForSelector('input[name="email"]', { timeout: 5000 });
    await page.fill('input[name="email"]', email);
    await page.click('button[type="submit"]');

    await page.waitForSelector('input[name="password"]', { timeout: 5000 });
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    // Wait for redirect after login
    await page.waitForURL('/', { timeout: 15000 });

    // Wait a bit for the app to fully load
    await page.waitForTimeout(2000);
  });

  for (const { name, path: pagePath, waitFor } of pages) {
    test(`capture ${name}`, async ({ page }) => {
      await page.goto(pagePath);
      await page.waitForSelector(waitFor, { timeout: 10000 });

      // Extra wait for dynamic content
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: path.join(screenshotDir, `${name}.png`),
        fullPage: false,
      });
    });
  }
});
```

**Step 2: Add npm script to package.json**

Add to `scripts` in `package.json`:
```json
"docs:screenshots": "playwright test --config=playwright/playwright.config.ts"
```

**Step 3: Create screenshots directory with .gitkeep**

Run:
```bash
mkdir -p public/docs/screenshots
touch public/docs/screenshots/.gitkeep
```

**Step 4: Commit**

```bash
git add playwright/screenshots.spec.ts package.json public/docs/screenshots/.gitkeep
git commit -m "feat: add playwright screenshot capture script"
```

---

## Task 4: Create Documentation Components

**Files:**
- Create: `src/components/docs/DocsSidebar.tsx`
- Create: `src/components/docs/DocsContent.tsx`
- Create: `src/components/docs/Screenshot.tsx`

**Step 1: Create DocsSidebar component**

Create `src/components/docs/DocsSidebar.tsx`:

```typescript
'use client';

import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const docPages = [
  { label: 'Übersicht', href: '/docs' },
  { label: 'Karte', href: '/docs/karte' },
  { label: 'Einsätze', href: '/docs/einsaetze' },
  { label: 'Tagebuch', href: '/docs/tagebuch' },
  { label: 'Fahrzeuge', href: '/docs/fahrzeuge' },
  { label: 'Schadstoff', href: '/docs/schadstoff' },
  { label: 'Kostenersatz', href: '/docs/kostenersatz' },
  { label: 'Geschäftsbuch', href: '/docs/geschaeftsbuch' },
];

export default function DocsSidebar() {
  const pathname = usePathname();

  return (
    <Paper
      sx={{
        width: 220,
        flexShrink: 0,
        height: 'fit-content',
        position: 'sticky',
        top: 16,
      }}
    >
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6">Dokumentation</Typography>
      </Box>
      <List component="nav" dense>
        {docPages.map(({ label, href }) => (
          <Link href={href} key={href} passHref style={{ textDecoration: 'none' }}>
            <ListItemButton selected={pathname === href}>
              <ListItemText primary={label} />
            </ListItemButton>
          </Link>
        ))}
      </List>
    </Paper>
  );
}
```

**Step 2: Create DocsContent component**

Create `src/components/docs/DocsContent.tsx`:

```typescript
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { ReactNode } from 'react';

interface DocsContentProps {
  children: ReactNode;
}

export default function DocsContent({ children }: DocsContentProps) {
  return (
    <Paper sx={{ p: 3, flexGrow: 1, minHeight: '80vh' }}>
      <Box sx={{ maxWidth: 900 }}>{children}</Box>
    </Paper>
  );
}
```

**Step 3: Create Screenshot component**

Create `src/components/docs/Screenshot.tsx`:

```typescript
import Box from '@mui/material/Box';
import Image from 'next/image';

interface ScreenshotProps {
  src: string;
  alt: string;
}

export default function Screenshot({ src, alt }: ScreenshotProps) {
  return (
    <Box
      sx={{
        my: 3,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        boxShadow: 1,
      }}
    >
      <Image
        src={src}
        alt={alt}
        width={1280}
        height={800}
        style={{ width: '100%', height: 'auto' }}
      />
    </Box>
  );
}
```

**Step 4: Commit**

```bash
git add src/components/docs/
git commit -m "feat: add documentation layout components"
```

---

## Task 5: Create Documentation Layout

**Files:**
- Create: `src/app/docs/layout.tsx`

**Step 1: Create docs layout**

Create `src/app/docs/layout.tsx`:

```typescript
import Box from '@mui/material/Box';
import { ReactNode } from 'react';
import DocsSidebar from '../../components/docs/DocsSidebar';
import DocsContent from '../../components/docs/DocsContent';

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 3, p: 2, minHeight: '100vh' }}>
      <DocsSidebar />
      <DocsContent>{children}</DocsContent>
    </Box>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/docs/layout.tsx
git commit -m "feat: add docs layout with sidebar"
```

---

## Task 6: Create Landing Page

**Files:**
- Create: `src/app/docs/page.tsx`

**Step 1: Create docs landing page**

Create `src/app/docs/page.tsx`:

```typescript
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Link from 'next/link';

export default function DocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Dokumentation
      </Typography>
      <Typography paragraph>
        Willkommen zur Dokumentation der Einsatzkarte. Hier finden Sie Anleitungen
        zu allen Funktionen der App.
      </Typography>

      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
        Inhalt
      </Typography>
      <List>
        <ListItem component={Link} href="/docs/karte">
          <ListItemText
            primary="Karte"
            secondary="Hydranten anzeigen, navigieren, Layer verwalten"
          />
        </ListItem>
        <ListItem component={Link} href="/docs/einsaetze">
          <ListItemText
            primary="Einsätze"
            secondary="Einsätze erstellen, bearbeiten und verwalten"
          />
        </ListItem>
        <ListItem component={Link} href="/docs/tagebuch">
          <ListItemText
            primary="Einsatztagebuch"
            secondary="Einträge im Einsatztagebuch erstellen und ansehen"
          />
        </ListItem>
        <ListItem component={Link} href="/docs/fahrzeuge">
          <ListItemText
            primary="Fahrzeuge"
            secondary="Fahrzeugpositionen und Status verwalten"
          />
        </ListItem>
        <ListItem component={Link} href="/docs/schadstoff">
          <ListItemText
            primary="Schadstoff"
            secondary="Gefahrstoffdatenbank durchsuchen"
          />
        </ListItem>
        <ListItem component={Link} href="/docs/kostenersatz">
          <ListItemText
            primary="Kostenersatz"
            secondary="Abrechnungen erstellen und exportieren"
          />
        </ListItem>
        <ListItem component={Link} href="/docs/geschaeftsbuch">
          <ListItemText
            primary="Geschäftsbuch"
            secondary="Geschäftsbucheinträge verwalten"
          />
        </ListItem>
      </List>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/docs/page.tsx
git commit -m "feat: add docs landing page"
```

---

## Task 7: Create Karte Documentation Page

**Files:**
- Create: `src/app/docs/karte/page.tsx`

**Step 1: Create karte docs page**

Create `src/app/docs/karte/page.tsx`:

```typescript
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Screenshot from '../../../components/docs/Screenshot';

export default function KarteDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Karte
      </Typography>
      <Typography paragraph>
        Die Karte zeigt Hydranten und andere wichtige Punkte im Einsatzgebiet an.
        Sie können die Karte verschieben, zoomen und verschiedene Layer aktivieren.
      </Typography>

      <Screenshot src="/docs/screenshots/karte.png" alt="Kartenansicht" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Hydranten anzeigen und Details abrufen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Karte verschieben und zoomen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Verschiedene Kartenlayer aktivieren" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Standort suchen" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Hydranten anzeigen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffnen Sie die Karte über das Menü oder die Startseite</li>
          <li>Hydranten werden als blaue Marker angezeigt</li>
          <li>Klicken Sie auf einen Hydranten für Details</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Layer wechseln
      </Typography>
      <Typography component="div">
        <ol>
          <li>Klicken Sie auf das Layer-Symbol rechts oben</li>
          <li>Wählen Sie den gewünschten Kartenlayer aus</li>
          <li>Aktivieren oder deaktivieren Sie Overlays nach Bedarf</li>
        </ol>
      </Typography>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/docs/karte/page.tsx
git commit -m "feat: add karte documentation page"
```

---

## Task 8: Create Einsaetze Documentation Page

**Files:**
- Create: `src/app/docs/einsaetze/page.tsx`

**Step 1: Create einsaetze docs page**

Create `src/app/docs/einsaetze/page.tsx`:

```typescript
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Screenshot from '../../../components/docs/Screenshot';

export default function EinsaetzeDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Einsätze
      </Typography>
      <Typography paragraph>
        Hier können Sie Einsätze erstellen, bearbeiten und verwalten. Jeder Einsatz
        kann mit Fahrzeugen, Mannschaft und anderen Elementen verknüpft werden.
      </Typography>

      <Screenshot src="/docs/screenshots/einsaetze.png" alt="Einsatzübersicht" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Neue Einsätze anlegen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Einsatzdetails bearbeiten" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Fahrzeuge und Mannschaft zuweisen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Einsätze abschließen" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Neuen Einsatz anlegen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Klicken Sie auf &quot;Neuer Einsatz&quot;</li>
          <li>Geben Sie die Einsatzdaten ein (Adresse, Art, Zeit)</li>
          <li>Speichern Sie den Einsatz</li>
        </ol>
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
        Elemente hinzufügen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffnen Sie einen bestehenden Einsatz</li>
          <li>Wählen Sie den Elementtyp (Fahrzeug, Person, etc.)</li>
          <li>Fügen Sie das Element mit den entsprechenden Daten hinzu</li>
        </ol>
      </Typography>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/docs/einsaetze/page.tsx
git commit -m "feat: add einsaetze documentation page"
```

---

## Task 9: Create Tagebuch Documentation Page

**Files:**
- Create: `src/app/docs/tagebuch/page.tsx`

**Step 1: Create tagebuch docs page**

Create `src/app/docs/tagebuch/page.tsx`:

```typescript
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Screenshot from '../../../components/docs/Screenshot';

export default function TagebuchDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Einsatztagebuch
      </Typography>
      <Typography paragraph>
        Das Einsatztagebuch dokumentiert alle wichtigen Ereignisse während eines
        Einsatzes in chronologischer Reihenfolge.
      </Typography>

      <Screenshot src="/docs/screenshots/tagebuch.png" alt="Einsatztagebuch" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Einträge erstellen mit Zeitstempel" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Chronologische Timeline ansehen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Einträge filtern und suchen" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Eintrag erstellen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffnen Sie das Einsatztagebuch</li>
          <li>Klicken Sie auf &quot;Neuer Eintrag&quot;</li>
          <li>Geben Sie die Beschreibung des Ereignisses ein</li>
          <li>Der Zeitstempel wird automatisch gesetzt</li>
          <li>Speichern Sie den Eintrag</li>
        </ol>
      </Typography>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/docs/tagebuch/page.tsx
git commit -m "feat: add tagebuch documentation page"
```

---

## Task 10: Create Fahrzeuge Documentation Page

**Files:**
- Create: `src/app/docs/fahrzeuge/page.tsx`

**Step 1: Create fahrzeuge docs page**

Create `src/app/docs/fahrzeuge/page.tsx`:

```typescript
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Screenshot from '../../../components/docs/Screenshot';

export default function FahrzeugeDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Fahrzeuge
      </Typography>
      <Typography paragraph>
        Verwalten Sie die Fahrzeuge der Feuerwehr und deren aktuelle Positionen
        und Status.
      </Typography>

      <Screenshot src="/docs/screenshots/fahrzeuge.png" alt="Fahrzeugübersicht" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Fahrzeugpositionen auf der Karte anzeigen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Fahrzeugstatus aktualisieren" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Fahrzeugdetails einsehen" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Fahrzeugstatus aktualisieren
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffnen Sie die Fahrzeugübersicht</li>
          <li>Wählen Sie das Fahrzeug aus</li>
          <li>Ändern Sie den Status (verfügbar, im Einsatz, etc.)</li>
          <li>Speichern Sie die Änderung</li>
        </ol>
      </Typography>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/docs/fahrzeuge/page.tsx
git commit -m "feat: add fahrzeuge documentation page"
```

---

## Task 11: Create Schadstoff Documentation Page

**Files:**
- Create: `src/app/docs/schadstoff/page.tsx`

**Step 1: Create schadstoff docs page**

Create `src/app/docs/schadstoff/page.tsx`:

```typescript
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Screenshot from '../../../components/docs/Screenshot';

export default function SchadstoffDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Schadstoff
      </Typography>
      <Typography paragraph>
        Die Schadstoffdatenbank enthält Informationen zu gefährlichen Stoffen
        und deren Handhabung im Einsatzfall.
      </Typography>

      <Screenshot src="/docs/screenshots/schadstoff.png" alt="Schadstoffdatenbank" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Gefahrstoffe suchen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Sicherheitsdatenblätter abrufen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Gefahrenhinweise anzeigen" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Gefahrstoff suchen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffnen Sie die Schadstoffdatenbank</li>
          <li>Geben Sie den Stoffnamen oder die UN-Nummer ein</li>
          <li>Wählen Sie den Stoff aus der Ergebnisliste</li>
          <li>Lesen Sie die Gefahrenhinweise und Maßnahmen</li>
        </ol>
      </Typography>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/docs/schadstoff/page.tsx
git commit -m "feat: add schadstoff documentation page"
```

---

## Task 12: Create Kostenersatz Documentation Page

**Files:**
- Create: `src/app/docs/kostenersatz/page.tsx`

**Step 1: Create kostenersatz docs page**

Create `src/app/docs/kostenersatz/page.tsx`:

```typescript
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Screenshot from '../../../components/docs/Screenshot';

export default function KostenersatzDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Kostenersatz
      </Typography>
      <Typography paragraph>
        Erstellen und verwalten Sie Kostenersatz-Abrechnungen für Einsätze gemäß
        der Tarifordnung.
      </Typography>

      <Screenshot src="/docs/screenshots/kostenersatz.png" alt="Kostenersatz" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Abrechnungen erstellen" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Positionen hinzufügen (Fahrzeuge, Material, Personal)" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Abrechnungen als PDF exportieren" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Abrechnung erstellen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffnen Sie den Kostenersatz-Bereich</li>
          <li>Wählen Sie den Einsatz aus oder erstellen Sie eine neue Abrechnung</li>
          <li>Fügen Sie die Positionen hinzu (Fahrzeuge, Mannstunden, Material)</li>
          <li>Überprüfen Sie die Summe</li>
          <li>Exportieren Sie die Abrechnung als PDF</li>
        </ol>
      </Typography>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/docs/kostenersatz/page.tsx
git commit -m "feat: add kostenersatz documentation page"
```

---

## Task 13: Create Geschaeftsbuch Documentation Page

**Files:**
- Create: `src/app/docs/geschaeftsbuch/page.tsx`

**Step 1: Create geschaeftsbuch docs page**

Create `src/app/docs/geschaeftsbuch/page.tsx`:

```typescript
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Screenshot from '../../../components/docs/Screenshot';

export default function GeschaeftsbuchDocsPage() {
  return (
    <>
      <Typography variant="h3" gutterBottom>
        Geschäftsbuch
      </Typography>
      <Typography paragraph>
        Das Geschäftsbuch dient zur Dokumentation aller offiziellen Vorgänge
        und Protokolle der Feuerwehr.
      </Typography>

      <Screenshot src="/docs/screenshots/geschaeftsbuch.png" alt="Geschäftsbuch" />

      <Typography variant="h5" gutterBottom>
        Funktionen
      </Typography>
      <List>
        <ListItem>
          <ListItemText primary="Einträge erstellen und verwalten" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Protokolle dokumentieren" />
        </ListItem>
        <ListItem>
          <ListItemText primary="Einträge suchen und filtern" />
        </ListItem>
      </List>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Anleitung
      </Typography>

      <Typography variant="h6" gutterBottom>
        Eintrag erstellen
      </Typography>
      <Typography component="div">
        <ol>
          <li>Öffnen Sie das Geschäftsbuch</li>
          <li>Klicken Sie auf &quot;Neuer Eintrag&quot;</li>
          <li>Geben Sie die Details des Vorgangs ein</li>
          <li>Speichern Sie den Eintrag</li>
        </ol>
      </Typography>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/docs/geschaeftsbuch/page.tsx
git commit -m "feat: add geschaeftsbuch documentation page"
```

---

## Task 14: Add Documentation Link to Navigation

**Files:**
- Modify: `src/components/site/AppDrawer.tsx`

**Step 1: Add HelpOutline icon import**

Add import at the top of `src/components/site/AppDrawer.tsx`:
```typescript
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
```

**Step 2: Add documentation link to drawerItems array**

Add this item to the `drawerItems` array before the Login item (around line 114):
```typescript
{ text: 'Dokumentation', icon: <HelpOutlineIcon />, href: '/docs' },
```

**Step 3: Commit**

```bash
git add src/components/site/AppDrawer.tsx
git commit -m "feat: add documentation link to navigation menu"
```

---

## Task 15: Generate Screenshots and Verify

**Step 1: Ensure test credentials are set**

Add to `.env.local` (do not commit):
```
DOCS_TEST_EMAIL=your-test-email@example.com
DOCS_TEST_PASSWORD=your-test-password
```

**Step 2: Run the screenshot script**

Run:
```bash
npm run docs:screenshots
```

Expected: Screenshots generated in `public/docs/screenshots/`

**Step 3: Verify screenshots exist**

Run:
```bash
ls -la public/docs/screenshots/
```

Expected: 7 PNG files (karte.png, einsaetze.png, etc.)

**Step 4: Start dev server and verify pages**

Run:
```bash
npm run dev
```

Open http://localhost:3000/docs and verify:
- Landing page loads with navigation
- Sidebar shows all sections
- Each documentation page displays correctly
- Screenshots appear in each page

**Step 5: Commit screenshots**

```bash
git add public/docs/screenshots/*.png
git commit -m "feat: add documentation screenshots"
```

---

## Task 16: Final Commit

**Step 1: Verify all changes**

Run:
```bash
git status
```

Expected: Clean working directory (all changes committed)

**Step 2: Create final summary commit if needed**

If any files were missed:
```bash
git add -A
git commit -m "docs: complete documentation page implementation"
```
