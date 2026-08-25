import { describe, expect, it } from 'vitest';
import type { Wasserstand } from '../../components/firebase/firestore';
import {
  parseWasserBaender,
  RADIUS_MAX,
  RADIUS_MIN,
  serialiseWasserBaender,
  WASSERSTAND_DEFAULTS,
  WASSERSTAND_MODEL_VERSION,
  wasserstandFlaeche,
  wasserstandLevelM,
  wasserstandParams,
  wasserstandSignature,
  wasserstandStale,
} from './wasserstand';

const szenario = (overrides: Partial<Wasserstand> = {}): Wasserstand =>
  ({
    id: 'w1',
    type: 'wasserstand',
    name: 'Wulka Nord',
    lat: 47.9483,
    lng: 16.8482,
    wasserBasisHoehe: 115.8,
    wasserZuschlag: 0.5,
    wasserBasisStufe: 'detail',
    ...overrides,
  }) as Wasserstand;

describe('wasserstand', () => {
  it('rechnet den Wasserstand als Basis plus Zuschlag', () => {
    expect(wasserstandLevelM(szenario())).toBeCloseTo(116.3, 6);
  });

  it('nimmt die Vorbelegung, wenn kein Zuschlag gesetzt ist', () => {
    const params = wasserstandParams(szenario({ wasserZuschlag: undefined }));
    expect(params.zuschlag).toBe(WASSERSTAND_DEFAULTS.zuschlag);
  });

  it('begrenzt den Umkreis auf den Bereich des Reglers', () => {
    expect(wasserstandParams(szenario({ wasserRadius: undefined })).radiusM).toBe(
      WASSERSTAND_DEFAULTS.radiusM
    );
    expect(wasserstandParams(szenario({ wasserRadius: -5 })).radiusM).toBe(
      RADIUS_MIN
    );
    expect(wasserstandParams(szenario({ wasserRadius: 999_999 })).radiusM).toBe(
      RADIUS_MAX
    );
  });

  it('die Vorbelegung des Umkreises bleibt in der Nahumgebung', () => {
    // Nicht der Wert selbst ist die Aussage, sondern die Größenordnung: die
    // Vorbelegung darf nicht ungefragt Kacheln über Kilometer laden.
    expect(WASSERSTAND_DEFAULTS.radiusM).toBeGreaterThan(0);
    expect(WASSERSTAND_DEFAULTS.radiusM).toBeLessThanOrEqual(1000);
  });

  it('die Signatur schlägt bei jeder Eingabe um', () => {
    const base = wasserstandSignature(szenario(), 'detail');
    expect(wasserstandSignature(szenario({ lat: 47.9484 }), 'detail')).not.toBe(
      base
    );
    expect(wasserstandSignature(szenario({ lng: 16.8483 }), 'detail')).not.toBe(
      base
    );
    expect(
      wasserstandSignature(szenario({ wasserBasisHoehe: 115.9 }), 'detail')
    ).not.toBe(base);
    expect(
      wasserstandSignature(szenario({ wasserZuschlag: 0.6 }), 'detail')
    ).not.toBe(base);
    expect(wasserstandSignature(szenario(), 'overview')).not.toBe(base);
    expect(base).toContain(`v${WASSERSTAND_MODEL_VERSION}`);
  });

  it('erkennt ein veraltetes Ergebnis', () => {
    const item = szenario({
      wasserBaender: serialiseWasserBaender([
        {
          tiefeM: 0,
          ringe: [
            [
              [47.9, 16.8],
              [47.91, 16.8],
              [47.91, 16.81],
              [47.9, 16.8],
            ],
          ],
        },
      ]),
      wasserStufe: 'detail',
    });
    const gueltig = {
      ...item,
      wasserGerechnetFuer: wasserstandSignature(item, 'detail'),
    };
    expect(wasserstandStale(gueltig)).toBe(false);
    expect(wasserstandStale({ ...gueltig, wasserZuschlag: 1.2 })).toBe(true);
    expect(wasserstandStale({ ...item, wasserGerechnetFuer: undefined })).toBe(
      true
    );
  });

  it('kein Ergebnis heißt nicht veraltet, sondern nichts gerechnet', () => {
    expect(wasserstandStale(szenario())).toBe(false);
  });

  it('kodiert und liest die Bänder zurück', () => {
    const ring: [number, number][] = [
      [47.9, 16.8],
      [47.91, 16.8],
      [47.91, 16.81],
      [47.9, 16.8],
    ];
    const stored = serialiseWasserBaender([
      { tiefeM: 0, ringe: [ring] },
      { tiefeM: 0.3, ringe: [] },
    ]);
    const back = parseWasserBaender(szenario({ wasserBaender: stored }));
    expect(back).toHaveLength(2);
    expect(back[0].tiefeM).toBe(0);
    expect(back[0].ringe[0]).toHaveLength(4);
    expect(back[0].ringe[0][0][0]).toBeCloseTo(47.9, 5);
    expect(back[1].ringe).toEqual([]);
  });

  it('liest kaputte Bänder als leer statt zu werfen', () => {
    expect(parseWasserBaender(szenario({ wasserBaender: '{' }))).toEqual([]);
    expect(wasserstandFlaeche(szenario({ wasserBaender: '{' }))).toEqual([]);
  });

  it('wasserstandFlaeche liefert die Ringe der 0-m-Stufe', () => {
    const ring: [number, number][] = [
      [47.9, 16.8],
      [47.91, 16.8],
      [47.91, 16.81],
      [47.9, 16.8],
    ];
    const item = szenario({
      wasserBaender: serialiseWasserBaender([
        { tiefeM: 0, ringe: [ring] },
        { tiefeM: 0.3, ringe: [ring] },
      ]),
    });
    expect(wasserstandFlaeche(item)).toHaveLength(1);
  });
});
