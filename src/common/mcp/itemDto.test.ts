import { describe, expect, it } from 'vitest';
import { projectFirecall, projectFirecallItem } from './itemDto';
import type { FirecallItem } from '../../components/firebase/firestore';

function item(overrides: Record<string, unknown>): FirecallItem {
  return { id: 'i1', name: 'n', type: 'marker', ...overrides } as FirecallItem;
}

describe('projectFirecallItem', () => {
  it('lässt unbekannte Felder weg', () => {
    const projected = projectFirecallItem(
      item({
        type: 'marker',
        lat: 1,
        lng: 2,
        geometry: { riesig: true },
        fieldData: { a: 1 },
      }),
    );
    expect(projected).toEqual({
      id: 'i1',
      type: 'marker',
      name: 'n',
      lat: 1,
      lng: 2,
    });
  });

  it('nimmt bei Fahrzeugen die Einsatzmittel-Felder mit', () => {
    expect(
      projectFirecallItem(
        item({ type: 'vehicle', fw: 'FF N', besatzung: '1:8', ats: 2 }),
      ),
    ).toMatchObject({ fw: 'FF N', besatzung: '1:8', ats: 2 });
  });

  it('gibt den Tagebuchtext nur auf Anforderung heraus', () => {
    const entry = item({ type: 'diary', beschreibung: 'Text', von: 'EL' });
    expect(projectFirecallItem(entry).beschreibung).toBeUndefined();
    expect(
      projectFirecallItem(entry, { includeDescription: true }).beschreibung,
    ).toBe('Text');
  });

  it('gibt den Geschäftsbuchtext nur auf Anforderung heraus', () => {
    const entry = item({ type: 'gb', beschreibung: 'Text', ausgehend: true });
    expect(projectFirecallItem(entry).beschreibung).toBeUndefined();
    expect(
      projectFirecallItem(entry, { includeDescription: true }),
    ).toMatchObject({ beschreibung: 'Text', ausgehend: true });
  });

  it('gibt bei anderen Typen die Beschreibung immer mit', () => {
    expect(
      projectFirecallItem(item({ type: 'marker', beschreibung: 'Hinweis' })),
    ).toMatchObject({ beschreibung: 'Hinweis' });
  });
});

describe('projectFirecall', () => {
  it('lässt gecachte Routen und Alarm-IDs weg', () => {
    expect(
      projectFirecall({
        id: 'f1',
        name: 'Brand',
        group: 'ffnd',
        fahrtenbuchRoute: { outboundM: 1 },
        blaulichtSmsAlarmIds: ['a'],
      }),
    ).toEqual({
      id: 'f1',
      name: 'Brand',
      fw: undefined,
      date: undefined,
      description: undefined,
      group: 'ffnd',
      lat: undefined,
      lng: undefined,
      eintreffen: undefined,
      abruecken: undefined,
    });
  });

  it('markiert gelöschte Einsätze', () => {
    expect(projectFirecall({ id: 'f1', name: 'x', deleted: true })).toMatchObject(
      { deleted: true },
    );
  });
});
