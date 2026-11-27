import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { decodeBody, evisClient, evisUrl, parseChecksum } from './evisHttp';

describe('evisUrl', () => {
  it('baut die Adresse aus Paket, Region und Schlüssel', () => {
    expect(evisUrl('getdata', 'EventsPlanned', 'AT-1', 'a b')).toBe(
      'https://datasupply-evis.asfinag.at/1.0/getdata/EventsPlanned/AT-1/2.2.3?apiKey=a%20b'
    );
  });
});

describe('decodeBody', () => {
  it('entpackt gzip auch ohne Content-Encoding', () => {
    expect(decodeBody(gzipSync(Buffer.from('<x>ä</x>')))).toBe('<x>ä</x>');
  });

  it('lässt unkomprimierte Antworten und ein BOM durch', () => {
    expect(decodeBody(Buffer.from('﻿<x/>'))).toBe('<x/>');
  });
});

describe('parseChecksum', () => {
  it('liest die Prüfsumme aus der JSON-Antwort', () => {
    expect(
      parseChecksum('{"DataVersion":"2.2.3","Region":"AT-1","Checksum":"abc"}')
    ).toBe('abc');
  });

  it('nimmt die Prüfsumme auch als Zahl, wie EVIS sie liefert', () => {
    expect(
      parseChecksum(
        '{"DataVersion":"2.2.3","DataType":"EventsPlanned","Region":"AT-1","Checksum":1795772929366}'
      )
    ).toBe('1795772929366');
  });

  it('wirft, wenn keine Prüfsumme drinsteht', () => {
    expect(() => parseChecksum('{}')).toThrow();
  });
});

describe('evisClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('liefert bei 204 einen leeren Text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 }))
    );
    await expect(
      evisClient.fetchData('EventsUnplanned', 'AT-1', 'k')
    ).resolves.toBe('');
  });

  it('nennt im Fehler den Status, aber nie die Adresse mit dem Schlüssel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 401 }))
    );
    const error = await evisClient
      .fetchData('EventsPlanned', 'AT-1', 'geheim')
      .catch((e: Error) => e);
    expect(String(error)).toContain('401');
    expect(String(error)).not.toContain('geheim');
  });
});
