import { readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_SHELL_EXCLUDED_ROUTES,
  APP_SHELL_FIRECALL_PATHS,
  APP_SHELL_PAGES,
  FIRECALL_SECTION_NAMES,
} from './appShellRoutes';

const APP_DIR = join(__dirname, '..', 'app');
const FIRECALL_PREFIX = '/einsatz/[firecallId]';

/** Alle Routen unter `src/app`, in der Schreibweise des Dateisystems. */
function appRoutes(): string[] {
  return readdirSync(APP_DIR, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith(`${sep}page.tsx`) || file === 'page.tsx')
    .map((file) => {
      const dir = file.slice(0, -'page.tsx'.length);
      return '/' + dir.split(sep).filter(Boolean).join('/');
    })
    .sort();
}

/** Ausgeschlossen ist eine Route selbst oder alles unterhalb eines Eintrags. */
function isExcluded(route: string): boolean {
  return Object.keys(APP_SHELL_EXCLUDED_ROUTES).some(
    (excluded) => route === excluded || route.startsWith(`${excluded}/`),
  );
}

describe('App-Shell-Routen', () => {
  it('ordnet jede Seite unter src/app ein: vorgehalten oder ausdrücklich ausgenommen', () => {
    const firecallPaths = new Set<string>(APP_SHELL_FIRECALL_PATHS);
    const pages = new Set<string>(APP_SHELL_PAGES);
    const unclassified: string[] = [];
    const routes = appRoutes();
    expect(routes.length).toBeGreaterThan(50);

    for (const route of routes) {
      if (isExcluded(route)) continue;
      if (route === `${FIRECALL_PREFIX}/[section]`) {
        // Die Abschnitte stehen in FIRECALL_SECTION_NAMES; die Seite selbst
        // erzwingt per Typ, dass die Liste vollständig ist.
        for (const section of FIRECALL_SECTION_NAMES) {
          if (!firecallPaths.has(`/${section}`)) unclassified.push(`${route} (${section})`);
        }
        continue;
      }
      if (route === FIRECALL_PREFIX || route.startsWith(`${FIRECALL_PREFIX}/`)) {
        const rest = route.slice(FIRECALL_PREFIX.length);
        if (!firecallPaths.has(rest)) unclassified.push(route);
        continue;
      }
      if (!pages.has(route)) unclassified.push(route);
    }

    expect(unclassified).toEqual([]);
  });

  it('enthält keine Seiten, die es nicht mehr gibt', () => {
    const routes = new Set(appRoutes());
    const stale = APP_SHELL_PAGES.filter((page) => page !== '/' && !routes.has(page));
    expect(stale).toEqual([]);
    expect(routes.has('/')).toBe(true);
  });

  it('hält die Atemschutzseiten und die Rückfallseite vor', () => {
    for (const page of ['/', '/map', '/atemschutz', '/atemschutzueberwachung', '/offline']) {
      expect(APP_SHELL_PAGES).toContain(page);
    }
    for (const path of ['', '/atemschutz', '/atemschutzueberwachung', '/tagebuch']) {
      expect(APP_SHELL_FIRECALL_PATHS).toContain(path);
    }
  });

  it('nennt für jede Ausnahme einen Grund', () => {
    for (const reason of Object.values(APP_SHELL_EXCLUDED_ROUTES)) {
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});
