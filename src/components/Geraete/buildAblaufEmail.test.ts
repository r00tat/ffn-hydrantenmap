import { describe, expect, it } from 'vitest';
import type { Geraet, GeraetBestand, GeraetCharge } from '../../common/geraet';
import type { ExpiringCharge } from '../../common/geraetCharge';
import { buildAblaufEmail } from './buildAblaufEmail';

const geraet: Geraet = {
  id: 'g1',
  bezeichnung: 'Bindemittel <Öl>',
  verbrauchsmaterial: true,
  einheit: 'Sack',
} as Geraet;

function charge(overrides: Partial<GeraetCharge>): GeraetCharge {
  return {
    id: 'c1',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'test',
    ...overrides,
  };
}

function bestand(id: string, lagerort: GeraetBestand['lagerort']): GeraetBestand {
  return {
    id,
    geraetId: 'g1',
    lagerortKey: id,
    lagerort,
    anzahl: 10,
  } as GeraetBestand;
}

const tank = bestand('b1', { art: 'fahrzeug', fahrzeug: 'TLFA 4000', laderaum: 'G3' });
const lager = bestand('b2', { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' });

const abgelaufen: ExpiringCharge = {
  geraet,
  charge: charge({ id: 'c1', produktionsNummer: 'L-42', ablaufDatum: '2026-09-30' }),
  status: 'abgelaufen',
  menge: 3,
  jeBestand: [
    { bestand: tank, menge: 1 },
    { bestand: lager, menge: 2 },
  ],
};

const bald: ExpiringCharge = {
  geraet: { ...geraet, id: 'g2', bezeichnung: 'Ölsperre', einheit: undefined } as Geraet,
  charge: charge({ id: 'c2', bezeichnung: 'Lieferung März', ablaufDatum: '2026-11-15' }),
  status: 'bald',
  menge: 1.5,
  jeBestand: [{ bestand: lager, menge: 1.5 }],
};

const base = {
  baseUrl: 'https://karte.example.at/',
  from: 'noreply@example.at',
  to: 'zeugwart@example.at',
};

function decodeSubject(raw: string): string {
  const match = raw.match(/Subject: =\?UTF-8\?B\?(.+)\?=/);
  return Buffer.from(match![1], 'base64').toString();
}

describe('buildAblaufEmail', () => {
  it('zählt abgelaufene und bald ablaufende Chargen im Betreff', () => {
    const { subject, raw } = buildAblaufEmail({ ...base, items: [abgelaufen, bald, bald] });
    expect(subject).toBe('Chargen: 1 abgelaufen, 2 laufen bald ab');
    expect(decodeSubject(raw)).toBe(subject);
  });

  it('nennt nur die vorhandene Hälfte im Betreff', () => {
    expect(buildAblaufEmail({ ...base, items: [abgelaufen] }).subject).toBe(
      'Chargen: 1 abgelaufen',
    );
    expect(buildAblaufEmail({ ...base, items: [bald] }).subject).toBe(
      'Chargen: 1 läuft bald ab',
    );
  });

  it('hängt den Gruppennamen an den Betreff', () => {
    const { subject } = buildAblaufEmail({
      ...base,
      groupName: ' FF Neusiedl am See ',
      items: [bald],
    });
    expect(subject).toBe('Chargen: 1 läuft bald ab — FF Neusiedl am See');
  });

  it('listet Artikel, Charge, Ablaufdatum, Status, Menge und Lagerorte im Text', () => {
    const { text } = buildAblaufEmail({ ...base, items: [abgelaufen, bald] });
    expect(text).toContain('Bindemittel <Öl>');
    expect(text).toContain('LOT L-42');
    expect(text).toContain('30.09.2026');
    expect(text).toContain('abgelaufen');
    expect(text).toContain('3 Sack');
    expect(text).toContain('TLFA 4000 · G3: 1 Sack');
    expect(text).toContain('Feuerwehrhaus · Lager: 2 Sack');
    expect(text).toContain('Lieferung März');
    expect(text).toContain('15.11.2026');
    expect(text).toContain('läuft bald ab');
    expect(text).toContain('1,5');
    expect(text).toContain('https://karte.example.at/geraete');
  });

  it('maskiert HTML in Bezeichnungen und baut eine Tabelle mit Link', () => {
    const { html } = buildAblaufEmail({ ...base, items: [abgelaufen] });
    expect(html).toContain('Bindemittel &lt;Öl&gt;');
    expect(html).not.toContain('<Öl>');
    expect(html).toContain('<table');
    expect(html).toContain('>LOT</th>');
    expect(html).toContain('href="https://karte.example.at/geraete"');
  });

  it('enthält Text- und HTML-Teil und Cc', () => {
    const { raw } = buildAblaufEmail({ ...base, cc: ['kdt@example.at'], items: [bald] });
    expect(raw).toContain('To: zeugwart@example.at');
    expect(raw).toContain('Cc: kdt@example.at');
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"');
  });
});
