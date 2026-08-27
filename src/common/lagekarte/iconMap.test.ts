import { describe, expect, it } from 'vitest';
import { icons } from '../../components/FirecallItems/elements/icons';
import { TACTICAL_UNIT_TYPES } from '../../components/firebase/firestore';
import {
  ZEICHEN_ICON_MAP,
  iconUrlFor,
  itemIconTarget,
  lagekarteIconToItem,
  unitTypeIconTarget,
} from './iconMap';

const allZeichenKeys = Object.values(icons).flatMap((group) =>
  Object.keys(group),
);

describe('ZEICHEN_ICON_MAP', () => {
  it('deckt jedes taktische Zeichen aus icons.ts ab', () => {
    const missing = allZeichenKeys.filter((k) => !ZEICHEN_ICON_MAP[k]);
    expect(missing).toEqual([]);
  });

  it('enthält keine Schlüssel, die es in icons.ts nicht gibt', () => {
    const extra = Object.keys(ZEICHEN_ICON_MAP).filter(
      (k) => !allZeichenKeys.includes(k),
    );
    expect(extra).toEqual([]);
  });
});

describe('unitTypeIconTarget', () => {
  it('hat für jeden unitType ein Ziel', () => {
    for (const t of TACTICAL_UNIT_TYPES) {
      expect(unitTypeIconTarget(t)).toBeDefined();
    }
  });

  it('markiert die Formationen bis Zug als exakt', () => {
    expect(unitTypeIconTarget('gruppe')?.exact).toBe(true);
    expect(unitTypeIconTarget('zug')?.exact).toBe(true);
  });

  it('markiert die Ebenen über der Kompanie als Näherung', () => {
    for (const t of ['abschnitt', 'bezirk', 'lfv', 'oebfv'] as const) {
      expect(unitTypeIconTarget(t)?.exact).toBe(false);
    }
  });
});

describe('itemIconTarget', () => {
  it('wählt das Rohr-Symbol nach art', () => {
    expect(itemIconTarget({ type: 'rohr', art: 'C' } as never)?.file).toBe(
      'strahlrohr.svg',
    );
    expect(
      itemIconTarget({ type: 'rohr', art: 'Wasserwerfer' } as never)?.file,
    ).toBe('werfer.svg');
  });

  it('wählt das Hydranten-Symbol nach typ', () => {
    expect(
      itemIconTarget({ type: 'hydrant', typ: 'Unterflurhydrant' } as never)
        ?.file,
    ).toBe('unterflurhydrant.svg');
    expect(
      itemIconTarget({ type: 'hydrant', typ: 'Überflurhydrant' } as never)?.file,
    ).toBe('ueberflurhydrant.svg');
  });

  it('kennt assp und el', () => {
    expect(itemIconTarget({ type: 'assp' } as never)?.file).toBe(
      '4.2.1_atemschutzsammelplatz.svg',
    );
    expect(itemIconTarget({ type: 'el' } as never)?.file).toBe(
      '3.1_grundzeichen_befehls_fuehrungs_leitstellen.svg',
    );
  });

  it('nutzt bei einem marker das zeichen', () => {
    expect(
      itemIconTarget({ type: 'marker', zeichen: 'Brandgefahr' } as never)?.file,
    ).toBe('9.3_gefahr_brand.svg');
  });

  it('gibt für einen unbekannten Typ undefined zurück', () => {
    expect(itemIconTarget({ type: 'spectrum' } as never)).toBeUndefined();
  });
});

describe('iconUrlFor', () => {
  it('baut die absolute URL', () => {
    expect(
      iconUrlFor({ folder: 'oenorm', file: '9.3_gefahr_brand.svg', exact: true }),
    ).toBe('https://www.lagekarte.info/src/img/oenorm/9.3_gefahr_brand.svg');
  });
});

describe('lagekarteIconToItem', () => {
  it('ist für jeden exakten Eintrag invers', () => {
    for (const [zeichen, target] of Object.entries(ZEICHEN_ICON_MAP)) {
      if (!target.exact) continue;
      expect(
        lagekarteIconToItem(`../src/img/${target.folder}/${target.file}`),
      ).toEqual({ type: 'marker', zeichen });
    }
  });

  it('erkennt Geräte als eigene Typen', () => {
    expect(lagekarteIconToItem('../src/img/geraete/strahlrohr.svg')).toEqual({
      type: 'rohr',
    });
    expect(
      lagekarteIconToItem('../src/img/geraete/ueberflurhydrant.svg'),
    ).toEqual({ type: 'hydrant', typ: 'Überflurhydrant' });
  });

  it('erkennt den Atemschutzsammelplatz und die Einsatzleitung', () => {
    expect(
      lagekarteIconToItem('../src/img/oenorm/4.2.1_atemschutzsammelplatz.svg'),
    ).toEqual({ type: 'assp' });
    expect(
      lagekarteIconToItem(
        '../src/img/oenorm/3.1_grundzeichen_befehls_fuehrungs_leitstellen.svg',
      ),
    ).toEqual({ type: 'el' });
  });

  it('erkennt Fahrzeuge am oebfv-5.01-Präfix und am fahrzeuge-Ordner', () => {
    expect(
      lagekarteIconToItem('../src/img/oebfv/5.01.01_kommandofahrzeug_2.svg'),
    ).toEqual({ type: 'vehicle' });
    expect(lagekarteIconToItem('../src/img/fahrzeuge/1.4_drehleiter.svg')).toEqual(
      { type: 'vehicle' },
    );
  });

  it('gibt bei unbekanntem Symbol undefined zurück', () => {
    expect(lagekarteIconToItem('../src/img/jonask/irgendwas.svg')).toBeUndefined();
  });

  it('verträgt eine absolute URL statt des relativen Pfads', () => {
    expect(
      lagekarteIconToItem(
        'https://www.lagekarte.info/src/img/oenorm/9.3_gefahr_brand.svg',
      ),
    ).toEqual({ type: 'marker', zeichen: 'Brandgefahr' });
  });
});
