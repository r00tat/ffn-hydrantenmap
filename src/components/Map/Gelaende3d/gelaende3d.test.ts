import { describe, expect, it } from 'vitest';
import {
  cameraFraming,
  chooseExaggeration,
  EXAGGERATION_MAX,
  EXAGGERATION_MIN,
  markerLiftM,
  meshBudget,
  START_PITCH_DEG,
  texturePx,
} from './gelaende3d';

describe('chooseExaggeration', () => {
  it('hebt flaches Gelände deutlich an', () => {
    // Seewinkel: 5,7 m Relief auf 1 km.
    expect(chooseExaggeration(5.7, 1000)).toBe(EXAGGERATION_MAX);
  });

  it('lässt bewegtes Gelände nahezu unverändert', () => {
    // Wagram: 58,7 m auf 1 km — Faktor 1,7, gerundet 1,5.
    expect(chooseExaggeration(58.7, 1000)).toBe(1.5);
  });

  it('fällt ohne Relief auf 1 zurück', () => {
    expect(chooseExaggeration(0, 1000)).toBe(EXAGGERATION_MIN);
    expect(chooseExaggeration(10, 0)).toBe(EXAGGERATION_MIN);
  });
});

describe('markerLiftM', () => {
  it('wächst mit dem Ausschnitt, bleibt aber sichtbar', () => {
    expect(markerLiftM(10_000)).toBe(150);
    expect(markerLiftM(100)).toBe(8);
  });
});

describe('Budget kleiner Bildschirme', () => {
  it('senkt Vertices und Texturkante auf dem Handy', () => {
    expect(meshBudget(390)).toBeLessThan(meshBudget(1280));
    expect(texturePx(390)).toBe(1024);
  });

  it('lässt Tablet und Desktop beim vollen Budget', () => {
    expect(meshBudget(820)).toBe(65_536);
    expect(texturePx(820)).toBe(2048);
  });
});

describe('cameraFraming', () => {
  const fov = 50;
  const aspect = 16 / 9;

  it('hält die Kamera über dem Gelände, nicht darin', () => {
    // Ein weit hineingezoomter Ausschnitt: 150 m breit, Gelände auf 120–180 m.
    const frame = cameraFraming(150, 150, 120, 180, 1, fov, aspect);
    const pitch = (START_PITCH_DEG * Math.PI) / 180;
    const cameraY = frame.centerY + Math.sin(pitch) * frame.distance;
    // Aus der absoluten Höhe allein gerechnet stünde die Kamera bei 180 m und
    // damit im Gelände — das Bild wäre schwarz.
    expect(cameraY).toBeGreaterThan(180);
  });

  it('rechnet die Überhöhung mit', () => {
    const flat = cameraFraming(1000, 1000, 100, 160, 1, fov, aspect);
    const steep = cameraFraming(1000, 1000, 100, 160, 6, fov, aspect);
    expect(steep.distance).toBeGreaterThan(flat.distance);
    expect(steep.centerY).toBeCloseTo(flat.centerY * 6, 6);
  });

  it('rückt für einen größeren Ausschnitt weiter weg', () => {
    const near = cameraFraming(200, 200, 100, 110, 1, fov, aspect);
    const far = cameraFraming(4000, 4000, 100, 110, 1, fov, aspect);
    expect(far.distance).toBeGreaterThan(near.distance * 10);
  });

  it('nimmt bei schmalem Fenster den waagrechten Öffnungswinkel', () => {
    // Hochkant: der waagrechte Winkel ist der engere und bestimmt den Abstand.
    const wide = cameraFraming(1000, 1000, 100, 110, 1, fov, 2);
    const narrow = cameraFraming(1000, 1000, 100, 110, 1, fov, 0.5);
    expect(narrow.distance).toBeGreaterThan(wide.distance);
  });

  it('hält Nah- und Fernebene um den Ausschnitt herum', () => {
    const frame = cameraFraming(3000, 2000, 100, 300, 3, fov, aspect);
    expect(frame.near).toBeGreaterThan(0);
    expect(frame.near).toBeLessThan(frame.distance / 100);
    expect(frame.far).toBeGreaterThan(frame.distance * 2);
  });
});
