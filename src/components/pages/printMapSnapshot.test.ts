// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  createMapSnapshotImage,
  fitMapSnapshot,
  PRINT_CONTENT_WIDTH_MM,
  PRINT_CONTENT_WIDTH_PX,
  PRINT_MAP_HEIGHT_PX,
  PRINT_MAP_MAX_HEIGHT_MM,
  PRINT_MAP_SNAPSHOT_CLASS,
  PX_PER_MM,
} from './printMapSnapshot';

const mmValue = (value: string) => Number.parseFloat(value.replace('mm', ''));

describe('fitMapSnapshot', () => {
  it('behält das Seitenverhältnis der Aufnahme bei', () => {
    // Aufnahme des Kartenelements mit scale 2: 1210x800 CSS-Pixel
    const { widthMm, heightMm } = fitMapSnapshot({ width: 2420, height: 1600 });

    expect(widthMm / heightMm).toBeCloseTo(2420 / 1600, 5);
  });

  it('nutzt die volle Satzspiegelbreite, solange die Höhe passt', () => {
    const { widthMm, heightMm } = fitMapSnapshot({ width: 2420, height: 1600 });

    expect(widthMm).toBeCloseTo(PRINT_CONTENT_WIDTH_MM, 5);
    expect(heightMm).toBeLessThanOrEqual(PRINT_MAP_MAX_HEIGHT_MM);
  });

  it('begrenzt hochformatige Aufnahmen auf die Seitenhöhe, ohne sie zu stauchen', () => {
    const { widthMm, heightMm } = fitMapSnapshot({ width: 800, height: 3000 });

    expect(heightMm).toBeCloseTo(PRINT_MAP_MAX_HEIGHT_MM, 5);
    expect(widthMm).toBeLessThanOrEqual(PRINT_CONTENT_WIDTH_MM);
    expect(widthMm / heightMm).toBeCloseTo(800 / 3000, 5);
  });

  it('bleibt bei entarteten Maßen innerhalb des Satzspiegels', () => {
    const { widthMm, heightMm } = fitMapSnapshot({ width: 0, height: 0 });

    expect(widthMm).toBeLessThanOrEqual(PRINT_CONTENT_WIDTH_MM);
    expect(heightMm).toBeLessThanOrEqual(PRINT_MAP_MAX_HEIGHT_MM);
  });
});

describe('createMapSnapshotImage', () => {
  const source = { width: 2420, height: 1600 };

  it('legt Breite und Höhe absolut in mm fest', () => {
    const img = createMapSnapshotImage(document, 'data:image/jpeg;base64,xxx', source);

    // Der gemeldete Fehler: eine relative Breite plus eine Pixelhöhe vom
    // Bildschirm. html2pdf legt den Klon in einem 190mm breiten Container neu
    // um — die Prozentbreite schrumpft dabei, die Pixelhöhe nicht.
    expect(img.style.width).toMatch(/mm$/);
    expect(img.style.height).toMatch(/mm$/);
    expect(img.style.width).not.toMatch(/%|auto|px/);
    expect(img.style.height).not.toMatch(/%|auto|px/);

    expect(mmValue(img.style.width) / mmValue(img.style.height)).toBeCloseTo(
      source.width / source.height,
      3
    );
  });

  it('verhindert einen Seitenumbruch mitten in der Karte', () => {
    const img = createMapSnapshotImage(document, 'data:image/jpeg;base64,xxx', source);

    expect(img.classList.contains(PRINT_MAP_SNAPSHOT_CLASS)).toBe(true);
    expect(img.style.breakInside).toBe('avoid');
  });

  it('setzt die Aufnahme als eigenen Block, nicht als Flex-Kind der Karte', () => {
    const img = createMapSnapshotImage(document, 'data:image/jpeg;base64,xxx', source);

    expect(img.style.display).toBe('block');
    expect(img.style.flexShrink).toBe('0');
    expect(img.src).toBe('data:image/jpeg;base64,xxx');
  });
});

describe('Satzspiegel in CSS-Pixeln', () => {
  it('rechnet mit 96 CSS-Pixeln je Zoll', () => {
    // Im Druck ist das CSS-Pixel über 1in = 96px definiert — nur deshalb
    // lässt sich die Seitenbreite überhaupt in Pixeln treffen.
    expect(PX_PER_MM * 25.4).toBeCloseTo(96, 10);
  });

  it('entspricht der Satzspiegelbreite von A4', () => {
    expect(PRINT_CONTENT_WIDTH_PX).toBe(
      Math.round(PRINT_CONTENT_WIDTH_MM * PX_PER_MM)
    );
    // 210mm Papier minus 2x10mm Rand
    expect(PRINT_CONTENT_WIDTH_PX).toBe(718);
  });

  it('lässt die Karte auf eine Seite passen', () => {
    // Satzspiegelhöhe A4 bei 15mm Rand oben und unten
    const contentHeightPx = (297 - 2 * 15) * PX_PER_MM;

    expect(PRINT_MAP_HEIGHT_PX).toBeLessThan(contentHeightPx);
  });
});
