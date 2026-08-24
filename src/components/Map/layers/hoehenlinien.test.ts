// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  contourCasingColor,
  contourCasingWeight,
  contourColor,
  contourLabelColor,
  contourLabelText,
  contourRampCss,
  contourWeight,
  EQUIDISTANCE_CHOICES,
  EQUIDISTANCE_STORAGE_KEY,
  equidistanceForZoom,
  indexInterval,
  isIndexContour,
  labelAnchors,
  readEquidistanceChoice,
  resolveEquidistance,
  thinLabels,
} from './hoehenlinien';

describe('equidistanceForZoom', () => {
  it('folgt der Staffel', () => {
    expect(equidistanceForZoom(19)).toBe(0.5);
    expect(equidistanceForZoom(18)).toBe(0.5);
    expect(equidistanceForZoom(17)).toBe(1);
    expect(equidistanceForZoom(16)).toBe(2);
    expect(equidistanceForZoom(15)).toBe(5);
    expect(equidistanceForZoom(14)).toBe(10);
    expect(equidistanceForZoom(9)).toBe(10);
  });

  it('wird mit dem Hinauszoomen gröber, nie feiner', () => {
    for (let zoom = 10; zoom < 19; zoom += 1) {
      expect(equidistanceForZoom(zoom)).toBeLessThanOrEqual(
        equidistanceForZoom(zoom - 1)
      );
    }
  });
});

describe('resolveEquidistance', () => {
  it('nimmt bei auto die Zoomstufe', () => {
    expect(resolveEquidistance('auto', 17)).toBe(1);
  });

  it('übersteuert die Zoomstufe bei manueller Wahl', () => {
    expect(resolveEquidistance('0.5', 14)).toBe(0.5);
    expect(resolveEquidistance('10', 19)).toBe(10);
  });
});

describe('readEquidistanceChoice', () => {
  afterEach(() => {
    window.localStorage.removeItem(EQUIDISTANCE_STORAGE_KEY);
  });

  it('gibt ohne gespeicherte Wahl auto', () => {
    expect(readEquidistanceChoice()).toBe('auto');
  });

  it('gibt die gespeicherte Wahl zurück', () => {
    window.localStorage.setItem(EQUIDISTANCE_STORAGE_KEY, '2');
    expect(readEquidistanceChoice()).toBe('2');
  });

  it('verwirft unbrauchbaren Inhalt statt ihn weiterzugeben', () => {
    // Sonst landet ein `Number('vielleicht')` als NaN in der Anfrage.
    window.localStorage.setItem(EQUIDISTANCE_STORAGE_KEY, 'vielleicht');
    expect(readEquidistanceChoice()).toBe('auto');
  });

  it('kennt jede angebotene Wahl', () => {
    for (const choice of EQUIDISTANCE_CHOICES) {
      window.localStorage.setItem(EQUIDISTANCE_STORAGE_KEY, choice);
      expect(readEquidistanceChoice()).toBe(choice);
    }
  });
});

describe('indexInterval', () => {
  it('lässt auf jede Zähllinie mehrere Zwischenlinien folgen', () => {
    for (const equidistanceM of [0.5, 1, 2, 5, 10]) {
      const dazwischen = indexInterval(equidistanceM) / equidistanceM;
      expect(dazwischen).toBeGreaterThanOrEqual(3);
      expect(dazwischen).toBeLessThanOrEqual(5);
    }
  });

  it('bleibt bei runden Höhen, die sich beschriften lassen', () => {
    expect(indexInterval(0.5)).toBe(2);
    expect(indexInterval(1)).toBe(5);
    expect(indexInterval(2)).toBe(10);
    expect(indexInterval(5)).toBe(25);
    expect(indexInterval(10)).toBe(50);
  });
});

describe('isIndexContour', () => {
  it('hängt an der Äquidistanz, nicht am ganzen Meter', () => {
    // Der eigentliche Fehler der alten Regel: bei 10 m Äquidistanz ist jede
    // Höhe ein ganzer Meter, also wäre jede Linie eine Zähllinie — und jede
    // bekäme eine Beschriftung.
    expect(isIndexContour(100, 10)).toBe(true);
    expect(isIndexContour(120, 10)).toBe(false);
    expect(isIndexContour(150, 10)).toBe(true);
  });

  it('nimmt bei feiner Äquidistanz jede vierte Linie', () => {
    expect(isIndexContour(118, 0.5)).toBe(true);
    expect(isIndexContour(118.5, 0.5)).toBe(false);
    expect(isIndexContour(119, 0.5)).toBe(false);
    expect(isIndexContour(120, 0.5)).toBe(true);
  });

  it('verträgt die Rundungsfehler der Schwellenrechnung', () => {
    // `contourThresholds` liefert Werte wie 120.00000000000001.
    expect(isIndexContour(120.000000001, 1)).toBe(true);
    expect(isIndexContour(121.000000001, 1)).toBe(false);
  });
});

describe('contourWeight', () => {
  it('zeichnet Zähllinien stärker als Zwischenlinien', () => {
    expect(contourWeight(120, 0.5)).toBeGreaterThan(contourWeight(120.5, 0.5));
    expect(contourWeight(150, 10)).toBeGreaterThan(contourWeight(140, 10));
  });
});

/** Relative Helligkeit nach WCAG. */
const luminance = (hex: string): number => {
  const channel = (offset: number) => {
    const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};

describe('contourCasingWeight', () => {
  it('ist breiter als die Linie, die darauf liegt', () => {
    // Sonst ist die Kontur unter der Linie nicht zu sehen.
    expect(contourCasingWeight(120, 0.5)).toBeGreaterThan(
      contourWeight(120, 0.5)
    );
  });
});

describe('contourCasingColor', () => {
  it('ist in beiden Themes dunkel und durchscheinend', () => {
    // Deckend gezeichnet würde sie die Karte darunter verdecken; die Kontur
    // soll den Kontrast bringen, nicht die Karte ersetzen.
    for (const dark of [false, true]) {
      expect(contourCasingColor(dark)).toMatch(/^rgba\(0, 0, 0, 0\.\d+\)$/);
    }
  });
});

describe('contourLabelColor', () => {
  it('ist auf hellem Grund deutlich dunkler als die Linie', () => {
    // Die Linienfarben sind hell gewählt, damit sie über dem Luftbild stehen.
    // Als Text auf hellem Grund wäre dasselbe Bernstein nicht zu entziffern.
    for (const height of [118, 120, 122, 124]) {
      const linie = luminance(contourColor(height, 118, 124, false));
      const text = luminance(contourLabelColor(height, 118, 124, false));
      // Ein Ton, der schon dunkel genug ist — das Rot am oberen Ende —, bleibt
      // wie er ist; abgedunkelt wird nur, was zu hell wäre.
      expect(text).toBeLessThanOrEqual(linie);
      expect(text).toBeLessThanOrEqual(0.23);
    }
  });

  it('ist auf dunklem Grund hell genug', () => {
    for (const height of [118, 120, 122, 124]) {
      expect(
        luminance(contourLabelColor(height, 118, 124, true))
      ).toBeGreaterThanOrEqual(0.45);
    }
  });

  it('behält die Ordnung der Rampe', () => {
    // Die Beschriftung soll noch zu ihrer Linie gehören: gleiche Höhe,
    // gleicher Farbton.
    expect(contourLabelColor(118, 118, 124, false)).not.toBe(
      contourLabelColor(124, 118, 124, false)
    );
  });
});

describe('contourColor', () => {
  it('gibt tiefen und hohen Linien verschiedene Farben', () => {
    expect(contourColor(118, 118, 124, false)).not.toBe(
      contourColor(124, 118, 124, false)
    );
  });

  it('dehnt die Rampe auf den Ausschnitt', () => {
    // Sechs Meter Spanne im Seewinkel müssen dieselbe Farbfolge ergeben wie
    // sechzig am Hang — sonst bleibt das flache Gelände einfarbig.
    expect(contourColor(118, 118, 124, false)).toBe(
      contourColor(112, 112, 172, false)
    );
    expect(contourColor(124, 118, 124, false)).toBe(
      contourColor(172, 112, 172, false)
    );
  });

  it('bleibt bei einer einzigen Höhe im Ausschnitt gültig', () => {
    // Ein Ausschnitt ohne Höhenunterschied darf keine Division durch Null in
    // die Farbe schreiben.
    expect(contourColor(120, 120, 120, false)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('bleibt innerhalb der Rampe, auch außerhalb der Spanne', () => {
    expect(contourColor(90, 118, 124, false)).toBe(
      contourColor(118, 118, 124, false)
    );
    expect(contourColor(900, 118, 124, false)).toBe(
      contourColor(124, 118, 124, false)
    );
  });

  it('hat für das dunkle Theme eigene Werte', () => {
    expect(contourColor(120, 118, 124, true)).not.toBe(
      contourColor(120, 118, 124, false)
    );
  });
});

describe('contourRampCss', () => {
  it('beschreibt dieselbe Rampe wie die Linienfarbe', () => {
    const css = contourRampCss(false);
    expect(css).toContain('linear-gradient');
    // Die Enden der Legende müssen die Farben der tiefsten und höchsten Linie
    // sein, sonst zeigt sie etwas anderes als die Karte.
    expect(css).toContain(contourColor(0, 0, 1, false));
    expect(css).toContain(contourColor(1, 0, 1, false));
  });
});

describe('contourLabelText', () => {
  it('schreibt ganze Meter ohne Nachkommastelle', () => {
    expect(contourLabelText(120)).toBe('120');
    expect(contourLabelText(120.000000001)).toBe('120');
  });

  it('schreibt halbe Meter mit Komma', () => {
    expect(contourLabelText(120.5)).toBe('120,5');
  });
});

/** Eine waagrechte Linie von `länge` Pixeln, in Schritten von 10 px. */
const waagrecht = (laenge: number, y = 50) =>
  Array.from({ length: laenge / 10 + 1 }, (_, i) => ({ x: i * 10, y }));

describe('labelAnchors', () => {
  it('beschriftet eine kurze Linie gar nicht', () => {
    // Eine Beschriftung ist rund 30 px breit. Auf einem Stummel steht sie
    // über beide Enden hinaus und zeigt auf nichts.
    expect(labelAnchors(waagrecht(40), 400, 120)).toHaveLength(0);
  });

  it('setzt auf eine mittellange Linie genau eine Beschriftung', () => {
    const anchors = labelAnchors(waagrecht(300), 400, 120);
    expect(anchors).toHaveLength(1);
    // In der Mitte, nicht am Rand: dort läuft sie sonst aus dem Bild.
    expect(anchors[0].x).toBeCloseTo(150, 0);
    expect(anchors[0].y).toBeCloseTo(50, 0);
  });

  it('wiederholt die Beschriftung auf langen Linien', () => {
    const anchors = labelAnchors(waagrecht(2000), 400, 120);
    expect(anchors.length).toBeGreaterThan(1);
    // Kein Anker liegt außerhalb der Linie.
    for (const anchor of anchors) {
      expect(anchor.x).toBeGreaterThanOrEqual(0);
      expect(anchor.x).toBeLessThanOrEqual(2000);
    }
  });

  it('legt die Beschriftung in die Richtung der Linie', () => {
    const schraeg = [
      { x: 0, y: 0 },
      { x: 200, y: 200 },
    ];
    expect(labelAnchors(schraeg, 400, 120)[0].angleDeg).toBeCloseTo(45, 0);
  });

  it('dreht Beschriftungen nie auf den Kopf', () => {
    // Eine Linie, die nach links läuft, hätte 180° — der Text stünde
    // spiegelverkehrt auf der Karte.
    const nachLinks = [
      { x: 300, y: 50 },
      { x: 0, y: 50 },
    ];
    for (const anchor of labelAnchors(nachLinks, 400, 120)) {
      expect(Math.abs(anchor.angleDeg)).toBeLessThanOrEqual(90);
    }
  });

  it('verträgt entartete Linien ohne Länge', () => {
    const aufDerStelle = [
      { x: 10, y: 10 },
      { x: 10, y: 10 },
    ];
    expect(labelAnchors(aufDerStelle, 400, 120)).toHaveLength(0);
  });
});

describe('thinLabels', () => {
  it('behält von dicht beieinander liegenden Beschriftungen nur eine', () => {
    const labels = [
      { x: 100, y: 100, angleDeg: 0 },
      { x: 104, y: 102, angleDeg: 0 },
      { x: 400, y: 100, angleDeg: 0 },
    ];
    const behalten = thinLabels(labels, 110);
    expect(behalten).toHaveLength(2);
    expect(behalten[0]).toBe(labels[0]);
  });

  it('lässt weit auseinander liegende Beschriftungen stehen', () => {
    const labels = Array.from({ length: 5 }, (_, i) => ({
      x: i * 300,
      y: 50,
      angleDeg: 0,
    }));
    expect(thinLabels(labels, 110)).toHaveLength(5);
  });
});
