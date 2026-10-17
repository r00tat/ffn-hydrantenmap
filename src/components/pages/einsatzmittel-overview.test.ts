import { describe, expect, it } from 'vitest';
import { FirecallItem, FirecallLocation } from '../firebase/firestore';
import { deploymentStatus, groupByLocation } from './einsatzmittel-overview';

function loc(id: string, vehicles: Record<string, string>): FirecallLocation {
  return {
    id,
    name: `Ort ${id}`,
    street: '',
    number: '',
    city: '',
    description: '',
    info: '',
    status: 'offen',
    vehicles,
    created: '',
    creator: '',
  };
}

const zug = { id: 'u1', name: 'Zug Nord', type: 'tacticalUnit' } as FirecallItem;
const tlf = { id: 'v1', name: 'TLF', type: 'vehicle', tacticalUnitId: 'u1' } as FirecallItem;
const klf = { id: 'v2', name: 'KLF', type: 'vehicle', tacticalUnitId: 'u1' } as FirecallItem;
const rlf = { id: 'v3', name: 'RLF', type: 'vehicle' } as FirecallItem;
const marker = { id: 'm1', name: 'Hydrant', type: 'marker' } as FirecallItem;

describe('groupByLocation', () => {
  it('gruppiert Einheiten mit ihren Fahrzeugen je Einsatzort', () => {
    const groups = groupByLocation(
      [zug, tlf, klf, rlf, marker],
      [loc('a', { u1: 'Zug Nord', v1: 'TLF', v2: 'KLF' }), loc('b', {})],
    );
    expect(groups.map((g) => g.location?.id)).toEqual(['a', undefined]);
    expect(groups[0].entries.map((e) => e.item.id)).toEqual(['u1']);
    expect(groups[0].entries[0].children.map((c) => c.id)).toEqual(['v1', 'v2']);
    expect(groups[1].entries.map((e) => e.item.id)).toEqual(['v3']);
  });

  it('zeigt ein Fahrzeug an seinem eigenen Einsatzort, wenn die Einheit woanders steht', () => {
    const groups = groupByLocation(
      [zug, tlf],
      [loc('a', { u1: 'Zug Nord' }), loc('b', { v1: 'TLF' })],
    );
    expect(groups[0].entries[0].children).toEqual([]);
    expect(groups[1].location?.id).toBe('b');
    expect(groups[1].entries.map((e) => e.item.id)).toEqual(['v1']);
  });

  it('lässt Einsatzorte ohne Einsatzmittel weg', () => {
    expect(groupByLocation([], [loc('a', {})])).toEqual([]);
  });
});

describe('deploymentStatus', () => {
  it('nimmt den spätesten erreichten Schritt', () => {
    expect(deploymentStatus({})).toBeUndefined();
    expect(deploymentStatus({ alarmierung: 'x' })).toBe('alerted');
    expect(deploymentStatus({ alarmierung: 'x', eintreffen: 'y' })).toBe('arrived');
    expect(
      deploymentStatus({ alarmierung: 'x', eintreffen: 'y', abruecken: 'z' }),
    ).toBe('departed');
  });
});
