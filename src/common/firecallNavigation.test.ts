import { describe, expect, it } from 'vitest';
import {
  canNavigateInPlace,
  parseFirecallSectionPath,
} from './firecallNavigation';

const ID = 'AAAAAAAAAAAAAAAAAAAA';

describe('parseFirecallSectionPath', () => {
  it('erkennt die Karte eines Einsatzes', () => {
    expect(parseFirecallSectionPath(`/einsatz/${ID}`)).toEqual({ firecallId: ID, section: '' });
    expect(parseFirecallSectionPath(`/einsatz/${ID}/`)).toEqual({ firecallId: ID, section: '' });
  });

  it('erkennt die Abschnitte eines Einsatzes', () => {
    expect(parseFirecallSectionPath(`/einsatz/${ID}/atemschutzueberwachung`)).toEqual({
      firecallId: ID,
      section: 'atemschutzueberwachung',
    });
  });

  it('nimmt keine Seiten mit eigener Route und keine unbekannten Abschnitte', () => {
    expect(parseFirecallSectionPath(`/einsatz/${ID}/kostenersatz`)).toBeNull();
    expect(parseFirecallSectionPath(`/einsatz/${ID}/schadstoff/datenbank`)).toBeNull();
    expect(parseFirecallSectionPath(`/einsatz/${ID}/gibtsnicht`)).toBeNull();
    expect(parseFirecallSectionPath('/tagebuch')).toBeNull();
    expect(parseFirecallSectionPath('/einsatz')).toBeNull();
  });
});

describe('canNavigateInPlace', () => {
  it('wechselt innerhalb desselben Einsatzes ohne Server', () => {
    expect(canNavigateInPlace(`/einsatz/${ID}`, `/einsatz/${ID}/tagebuch`)).toBe(true);
    expect(canNavigateInPlace(`/einsatz/${ID}/tagebuch`, `/einsatz/${ID}/atemschutz`)).toBe(true);
    expect(canNavigateInPlace(`/einsatz/${ID}/details`, `/einsatz/${ID}`)).toBe(true);
  });

  it('nimmt auch eine vollständige Adresse der eigenen Origin', () => {
    expect(
      canNavigateInPlace(`/einsatz/${ID}`, `https://einsatz.example.at/einsatz/${ID}/tagebuch`, 'https://einsatz.example.at'),
    ).toBe(true);
    expect(
      canNavigateInPlace(`/einsatz/${ID}`, `https://example.org/einsatz/${ID}/tagebuch`, 'https://einsatz.example.at'),
    ).toBe(false);
  });

  it('navigiert normal zu einem anderen Einsatz oder außerhalb', () => {
    expect(canNavigateInPlace(`/einsatz/${ID}`, '/einsatz/BBBBBBBBBBBBBBBBBBBB/tagebuch')).toBe(false);
    expect(canNavigateInPlace(`/einsatz/${ID}`, '/einsaetze')).toBe(false);
    expect(canNavigateInPlace('/einsaetze', `/einsatz/${ID}`)).toBe(false);
    expect(canNavigateInPlace(`/einsatz/${ID}`, `/einsatz/${ID}/kostenersatz`)).toBe(false);
  });

  it('lässt dieselbe Seite dem Router', () => {
    expect(canNavigateInPlace(`/einsatz/${ID}/tagebuch`, `/einsatz/${ID}/tagebuch`)).toBe(false);
  });
});
