import { describe, expect, it, vi } from 'vitest';
import {
  createValidatingLookup,
  requestCimdDocument,
  CimdRequestError,
} from './cimdRequest';

/**
 * Ruft die `lookup`-Funktion so auf, wie `net.connect` es tut, und liefert das
 * Ergebnis als Promise.
 */
function callLookup(
  lookupFn: ReturnType<typeof createValidatingLookup>,
  hostname: string,
  options: Record<string, unknown> = {},
): Promise<{ address: unknown; family?: number }> {
  return new Promise((resolve, reject) => {
    (lookupFn as unknown as (
      h: string,
      o: unknown,
      cb: (err: Error | null, address: unknown, family?: number) => void,
    ) => void)(hostname, options, (err, address, family) => {
      if (err) reject(err);
      else resolve({ address, family });
    });
  });
}

describe('createValidatingLookup', () => {
  it('liefert die geprüfte Adresse an die Verbindung', async () => {
    const lookupFn = createValidatingLookup(async () => ['104.18.0.1']);
    await expect(callLookup(lookupFn, 'claude.ai')).resolves.toEqual({
      address: '104.18.0.1',
      family: 4,
    });
  });

  it('bedient auch die all-Form, die Node mit autoSelectFamily nutzt', async () => {
    const lookupFn = createValidatingLookup(async () => [
      '104.18.0.1',
      '2606:4700::1',
    ]);
    await expect(
      callLookup(lookupFn, 'claude.ai', { all: true }),
    ).resolves.toMatchObject({
      address: [
        { address: '104.18.0.1', family: 4 },
        { address: '2606:4700::1', family: 6 },
      ],
    });
  });

  it('verweigert die Auflösung bei einer gesperrten Adresse', async () => {
    const lookupFn = createValidatingLookup(async () => ['169.254.169.254']);
    await expect(callLookup(lookupFn, 'evil.example')).rejects.toThrow(
      /blocked address/,
    );
  });

  it('verwirft den ganzen Satz, wenn nur eine Adresse gesperrt ist', async () => {
    // Ein Angreifer kann mehrere A-Records setzen und darauf spekulieren, dass
    // der Verbindungsaufbau eine andere wählt als die geprüfte.
    const lookupFn = createValidatingLookup(async () => [
      '104.18.0.1',
      '127.0.0.1',
    ]);
    await expect(
      callLookup(lookupFn, 'evil.example', { all: true }),
    ).rejects.toThrow(/blocked address/);
  });

  it('prüft bei jedem Aufruf neu — genau das schließt DNS Rebinding', async () => {
    // Erste Auflösung öffentlich, zweite intern: Wäre das Ergebnis der ersten
    // gespeichert, ginge die Verbindung an die interne Adresse.
    const resolveHost = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce(['104.18.0.1'])
      .mockResolvedValueOnce(['169.254.169.254']);
    const lookupFn = createValidatingLookup(resolveHost);

    await expect(callLookup(lookupFn, 'evil.example')).resolves.toMatchObject({
      address: '104.18.0.1',
    });
    await expect(callLookup(lookupFn, 'evil.example')).rejects.toThrow(
      /blocked address/,
    );
  });

  it('meldet eine leere Auflösung als Fehler', async () => {
    const lookupFn = createValidatingLookup(async () => []);
    await expect(callLookup(lookupFn, 'nirgends.example')).rejects.toThrow(
      /could not resolve/,
    );
  });

  it('reicht einen Auflösungsfehler durch', async () => {
    const lookupFn = createValidatingLookup(async () => {
      throw new Error('SERVFAIL');
    });
    await expect(callLookup(lookupFn, 'kaputt.example')).rejects.toThrow(
      /SERVFAIL/,
    );
  });
});

describe('requestCimdDocument', () => {
  it('bindet die Verbindung an die geprüfte Auflösung', async () => {
    // Der Name löst nirgends auf. Käme hier `ENOTFOUND`, hätte Node die
    // eigene `lookup`-Funktion gar nicht verwendet — und der ganze Schutz wäre
    // wirkungslos. Die Meldung „blocked address" kann nur aus ihr stammen.
    await expect(
      requestCimdDocument(new URL('https://nicht-vorhanden.invalid/client'), {
        timeoutMs: 1000,
        maxBytes: 1024,
        resolveHost: async () => ['127.0.0.1'],
      }),
    ).rejects.toThrow(/blocked address \(127\.0\.0\.1\)/);
  });

  it('meldet einen Fehler als CimdRequestError', async () => {
    await expect(
      requestCimdDocument(new URL('https://nicht-vorhanden.invalid/client'), {
        timeoutMs: 1000,
        maxBytes: 1024,
        resolveHost: async () => [],
      }),
    ).rejects.toThrow(CimdRequestError);
  });
});
