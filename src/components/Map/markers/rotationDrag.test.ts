// @vitest-environment jsdom
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { attachRotationDrag, RotationDragOptions } from './rotationDrag';

/**
 * Eine Karte, die der Test steuert. Gebraucht wird nur ein umkehrbarer
 * Zusammenhang zwischen Koordinate und Pixel: die Position liegt auf (100, 100),
 * der Zeiger dort, wo der Test ihn hinsetzt.
 */
function fakeMap() {
  return {
    latLngToContainerPoint: vi.fn(() => ({ x: 100, y: 100 })),
    mouseEventToContainerPoint: vi.fn((event: MouseEvent) => ({
      x: event.clientX,
      y: event.clientY,
    })),
    dragging: { enable: vi.fn(), disable: vi.fn() },
  };
}

function pointerEvent(
  type: string,
  clientX: number,
  clientY: number,
  shiftKey = false
) {
  return new MouseEvent(type, { clientX, clientY, shiftKey, bubbles: true });
}

describe('attachRotationDrag', () => {
  let knob: HTMLElement;
  let map: ReturnType<typeof fakeMap>;
  let onPreview: Mock<(degrees: number) => void>;
  let onCommit: Mock<(degrees: number) => void>;
  let detach: () => void;

  beforeEach(() => {
    knob = document.createElement('div');
    document.body.appendChild(knob);
    map = fakeMap();
    onPreview = vi.fn<(degrees: number) => void>();
    onCommit = vi.fn<(degrees: number) => void>();

    const options: RotationDragOptions = {
      map,
      position: { lat: 47.95, lng: 16.84 },
      // Fahrzeug-Icon: Drehzentrum 2,5px rechts und 10px unter der Position,
      // also (102,5 | 110). Der Griff hängt darunter; ein Zeiger links davon
      // bedeutet 90°.
      iconOptions: { iconSize: [45, 20], iconAnchor: [20, 0] },
      snapDegrees: 15,
      onPreview,
      onCommit,
    };
    detach = attachRotationDrag(knob, () => options);
  });

  it('meldet während des Ziehens die Vorschau, ohne zu speichern', () => {
    knob.dispatchEvent(pointerEvent('pointerdown', 102.5, 210));
    knob.dispatchEvent(pointerEvent('pointermove', 2.5, 110));

    expect(onPreview).toHaveBeenLastCalledWith(90);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('schaltet das Verschieben der Karte für die Dauer des Zuges ab', () => {
    knob.dispatchEvent(pointerEvent('pointerdown', 102.5, 210));
    expect(map.dragging.disable).toHaveBeenCalledTimes(1);
    expect(map.dragging.enable).not.toHaveBeenCalled();

    knob.dispatchEvent(pointerEvent('pointerup', 2.5, 110));
    expect(map.dragging.enable).toHaveBeenCalledTimes(1);
  });

  it('speichert genau einmal beim Loslassen', () => {
    knob.dispatchEvent(pointerEvent('pointerdown', 102.5, 210));
    knob.dispatchEvent(pointerEvent('pointermove', 2.5, 110));
    knob.dispatchEvent(pointerEvent('pointerup', 2.5, 110));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(90);
  });

  it('rastet mit gedrückter Shift-Taste auf 15 Grad', () => {
    knob.dispatchEvent(pointerEvent('pointerdown', 102.5, 210, true));
    // Drehzentrum (102,5 | 110), Zeiger 40px links und 20px darunter
    // → 63,4°, auf 15er gerastet 60°
    knob.dispatchEvent(pointerEvent('pointermove', 62.5, 130, true));

    expect(onPreview).toHaveBeenLastCalledWith(60);
  });

  it('reagiert nicht auf Bewegungen ohne vorheriges pointerdown', () => {
    knob.dispatchEvent(pointerEvent('pointermove', 2.5, 110));
    expect(onPreview).not.toHaveBeenCalled();
  });

  it('bricht bei pointercancel ab, ohne zu speichern, und gibt die Karte frei', () => {
    knob.dispatchEvent(pointerEvent('pointerdown', 102.5, 210));
    knob.dispatchEvent(pointerEvent('pointercancel', 2.5, 110));

    expect(onCommit).not.toHaveBeenCalled();
    expect(map.dragging.enable).toHaveBeenCalledTimes(1);
  });

  it('gibt die Karte frei, wenn mitten im Zug abgeräumt wird', () => {
    knob.dispatchEvent(pointerEvent('pointerdown', 102.5, 210));
    detach();

    expect(map.dragging.enable).toHaveBeenCalledTimes(1);
    knob.dispatchEvent(pointerEvent('pointermove', 2.5, 110));
    expect(onPreview).toHaveBeenCalledTimes(1); // nur das pointerdown
  });
});
