import { describe, expect, it } from 'vitest';
import { FirecallItem } from '../../components/firebase/firestore';
import { OriginContext, resolveOriginFrom } from './resolveOrigin';

const tlfa = {
  id: 'tlfa',
  type: 'vehicle',
  name: 'TLFA 4000',
  lat: 47.95,
  lng: 16.85,
} as FirecallItem;
const tlf = {
  id: 'tlf',
  type: 'vehicle',
  name: 'TLF',
  fw: 'Parndorf',
  lat: 47.9,
  lng: 16.8,
} as FirecallItem;

const context: OriginContext = {
  fallback: { lat: 1, lng: 2, type: 'mapCenter', label: 'der Kartenmitte' },
  existingItems: [tlfa, tlf],
};

const meters = 111320;

describe('resolveOriginFrom — nearItem mit Richtung', () => {
  it('setzt links westlich und rechts östlich, auf gleicher Breite', async () => {
    const links = await resolveOriginFrom(
      { type: 'nearItem', itemName: 'TLFA', direction: 'left' },
      context,
    );
    const rechts = await resolveOriginFrom(
      { type: 'nearItem', itemName: 'TLFA', direction: 'right' },
      context,
    );
    expect(links.lat).toBeCloseTo(tlfa.lat!, 9);
    expect(rechts.lat).toBeCloseTo(tlfa.lat!, 9);
    expect(links.lng).toBeLessThan(tlfa.lng!);
    expect(rechts.lng).toBeGreaterThan(tlfa.lng!);
  });

  it('rechnet den Abstand in Metern, auch in Ost-West-Richtung', async () => {
    const rechts = await resolveOriginFrom(
      { type: 'nearItem', itemName: 'TLFA', direction: 'right', distance: 50 },
      context,
    );
    const cos = Math.cos((tlfa.lat! * Math.PI) / 180);
    expect((rechts.lng - tlfa.lng!) * meters * cos).toBeCloseTo(50, 6);
  });

  it('setzt oberhalb nördlich und unterhalb südlich', async () => {
    const oben = await resolveOriginFrom(
      { type: 'nearItem', itemName: 'TLFA', direction: 'above' },
      context,
    );
    const unten = await resolveOriginFrom(
      { type: 'nearItem', itemName: 'TLFA', direction: 'below' },
      context,
    );
    expect((oben.lat - tlfa.lat!) * meters).toBeCloseTo(20, 6);
    expect((unten.lat - tlfa.lat!) * meters).toBeCloseTo(-20, 6);
    expect(oben.lng).toBeCloseTo(tlfa.lng!, 9);
  });

  it('bleibt ohne Richtung schräg rechts oben, rund 20 m entfernt', async () => {
    const pos = await resolveOriginFrom(
      { type: 'nearItem', itemName: 'TLFA' },
      context,
    );
    expect(pos.lat).toBeGreaterThan(tlfa.lat!);
    expect(pos.lng).toBeGreaterThan(tlfa.lng!);
    const cos = Math.cos((tlfa.lat! * Math.PI) / 180);
    const north = (pos.lat - tlfa.lat!) * meters;
    const east = (pos.lng - tlfa.lng!) * meters * cos;
    expect(Math.hypot(north, east)).toBeCloseTo(20, 6);
  });

  it('nimmt das verschobene Element nicht als Bezug', async () => {
    // „neben das TLF" beim Verschieben eines TLF: ohne Ausschluss fände die
    // Suche das Fahrzeug selbst.
    const pos = await resolveOriginFrom(
      { type: 'nearItem', itemName: 'TLF', excludeItemId: 'tlfa' },
      context,
    );
    expect(pos.label).toBe('"TLF"');
    const ohneTlf = await resolveOriginFrom(
      { type: 'nearItem', itemName: 'TLFA', excludeItemId: 'tlfa' },
      context,
    );
    expect(ohneTlf.type).toBe('mapCenter');
  });
});
