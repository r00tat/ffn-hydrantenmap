import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import deMessages from '../../../messages/de.json';
import { FirecallItem } from '../firebase/firestore';
import { buildDiaries } from './diary-entries';

const t = createTranslator({
  locale: 'de',
  messages: deMessages,
  namespace: 'tagebuch',
}) as unknown as Parameters<typeof buildDiaries>[2];

describe('buildDiaries', () => {
  it('führt taktische Einheiten wie Fahrzeuge im Tagebuch', () => {
    const unit = {
      id: 'u1',
      type: 'tacticalUnit',
      name: '1. Zug',
      fw: 'Weiden am See',
      mann: 9,
      alarmierung: '2026-10-13T09:00:00.000Z',
      eintreffen: '2026-10-13T09:20:00.000Z',
    } as FirecallItem;
    const diaries = buildDiaries([unit], [], t, true);
    expect(diaries.map((d) => d.name)).toEqual([
      '1. Zug Weiden am See alarmiert',
      '1. Zug Weiden am See eingetroffen',
    ]);
    expect(diaries[0].beschreibung).toContain('9');
  });

  it('ordnet Einträge aus derselben Sekunde nach der Millisekunde', () => {
    const items = [
      {
        id: 'd2',
        type: 'diary',
        nummer: 6,
        datum: '2026-10-13T09:00:00.101Z',
        name: 'TLF zu Einsatzort Seestraße 5 zugeordnet',
      },
      {
        id: 'd1',
        type: 'diary',
        nummer: 5,
        datum: '2026-10-13T09:00:00.100Z',
        name: 'TLF von Einsatzort Keller abgezogen',
      },
    ] as unknown as FirecallItem[];
    expect(
      buildDiaries(items, [], t, true).map((d) => [d.nummer, d.name]),
    ).toEqual([
      [1, 'TLF von Einsatzort Keller abgezogen'],
      [2, 'TLF zu Einsatzort Seestraße 5 zugeordnet'],
    ]);
    expect(
      buildDiaries(items, [], t, false).map((d) => d.nummer),
    ).toEqual([2, 1]);
  });
});
