// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_SHELL_WARM_REQUEST } from '../common/serviceWorker';
import {
  APP_SHELL_FIRECALL_SECTIONS,
  APP_SHELL_PAGES,
  buildAppShellUrls,
  requestAppShellWarmup,
} from './appShellWarmup';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubController(postMessage: (msg: unknown, ports: MessagePort[]) => void) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { controller: { postMessage } },
  });
}

describe('buildAppShellUrls', () => {
  it('enthält die Kernseiten und die Offline-Rückfallseite', () => {
    const urls = buildAppShellUrls();
    for (const page of ['/', '/einsaetze', '/tagebuch', '/atemschutz', '/atemschutzueberwachung', '/offline']) {
      expect(urls).toContain(page);
    }
    expect(urls).toEqual(APP_SHELL_PAGES);
  });

  it('nimmt die Seiten des aktuellen Einsatzes dazu', () => {
    const urls = buildAppShellUrls('AAAAAAAAAAAAAAAAAAAA');
    expect(urls).toContain('/einsatz/AAAAAAAAAAAAAAAAAAAA');
    for (const section of APP_SHELL_FIRECALL_SECTIONS) {
      expect(urls).toContain(`/einsatz/AAAAAAAAAAAAAAAAAAAA/${section}`);
    }
    expect(APP_SHELL_FIRECALL_SECTIONS).toEqual(
      expect.arrayContaining(['tagebuch', 'atemschutz', 'atemschutzueberwachung']),
    );
  });

  it('übergeht den Platzhalter-Einsatz', () => {
    expect(buildAppShellUrls('unknown')).toEqual(APP_SHELL_PAGES);
  });
});

describe('requestAppShellWarmup', () => {
  it('schickt die Adressen an den Service Worker und liefert seine Antwort', async () => {
    stubController((msg, [port]) => {
      expect(msg).toEqual({ type: APP_SHELL_WARM_REQUEST, urls: ['/a'] });
      port.postMessage({ cached: 1, failed: [] });
    });
    await expect(requestAppShellWarmup(['/a'])).resolves.toEqual({ cached: 1, failed: [] });
  });

  it('liefert null ohne Service Worker (Entwicklung)', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    });
    await expect(requestAppShellWarmup(['/a'])).resolves.toBeNull();
  });

  it('liefert null, wenn der Worker nicht antwortet', async () => {
    vi.useFakeTimers();
    try {
      stubController(() => {});
      const pending = requestAppShellWarmup(['/a'], 1000);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
