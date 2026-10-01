// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useBarcodeScanner, {
  createScanConfirmation,
  normalizeFormatName,
  toScanEvent,
  type BarcodeScanEvent,
} from './useBarcodeScanner';

const reading = (value: string, format = 'code_128'): BarcodeScanEvent => ({
  value,
  results: [{ rawValue: value, format }],
  engine: 'native',
});

function mockMediaDevices(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis as object, 'BarcodeDetector');
  Reflect.deleteProperty(globalThis.navigator as object, 'mediaDevices');
});

describe('useBarcodeScanner', () => {
  it('bleibt untätig, solange active false ist', () => {
    mockMediaDevices(vi.fn());
    const { result } = renderHook(() =>
      useBarcodeScanner({ active: false, onDetected: vi.fn() }),
    );
    expect(result.current.status).toBe('idle');
  });

  it('meldet unsupported ohne mediaDevices', async () => {
    Reflect.deleteProperty(globalThis.navigator as object, 'mediaDevices');
    const { result } = renderHook(() =>
      useBarcodeScanner({ active: true, onDetected: vi.fn() }),
    );
    await waitFor(() => expect(result.current.status).toBe('unsupported'));
  });

  it('meldet denied, wenn der Benutzer die Kamera ablehnt', async () => {
    const err = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    mockMediaDevices(() => Promise.reject(err));
    const { result } = renderHook(() =>
      useBarcodeScanner({ active: true, onDetected: vi.fn() }),
    );
    await waitFor(() => expect(result.current.status).toBe('denied'));
  });

  it('meldet error bei jedem anderen Kamerafehler', async () => {
    mockMediaDevices(() =>
      Promise.reject(Object.assign(new Error('kaputt'), { name: 'NotReadableError' })),
    );
    const { result } = renderHook(() =>
      useBarcodeScanner({ active: true, onDetected: vi.fn() }),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('kaputt');
  });

  it('stoppt alle Tracks beim Aufräumen', async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    mockMediaDevices(() => Promise.resolve(stream));
    const { unmount, result } = renderHook(() =>
      useBarcodeScanner({ active: true, onDetected: vi.fn() }),
    );
    await waitFor(() => expect(result.current.status).not.toBe('idle'));
    unmount();
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });
});

describe('normalizeFormatName', () => {
  it('übersetzt den ZXing-Enumnamen in die Schreibweise des nativen Detektors', () => {
    expect(normalizeFormatName('CODE_128')).toBe('code_128');
    expect(normalizeFormatName('QR_CODE')).toBe('qr_code');
  });

  it('liefert undefined, wenn kein Name herauskam', () => {
    // Fällt der Rücklookup des Enums aus, steht dort eine Zahl — dann lieber
    // gar kein Format als eine Zahl, mit der am Sammelplatz niemand etwas
    // anfangen kann.
    expect(normalizeFormatName(4)).toBeUndefined();
    expect(normalizeFormatName(undefined)).toBeUndefined();
    expect(normalizeFormatName('')).toBeUndefined();
  });
});

describe('toScanEvent', () => {
  it('übernimmt den ersten Rohtreffer und behält alle', () => {
    const scan = toScanEvent(
      [
        { rawValue: ' *2N16Q19* ', format: 'code_39' },
        { rawValue: '2016-MU-046', format: 'code_128' },
      ],
      'zxing',
    );
    expect(scan).toEqual({
      value: '*2N16Q19*',
      engine: 'zxing',
      results: [
        { rawValue: ' *2N16Q19* ', format: 'code_39' },
        { rawValue: '2016-MU-046', format: 'code_128' },
      ],
    });
  });

  it('meldet nichts, wenn das Bild nichts Brauchbares hergab', () => {
    expect(toScanEvent([], 'native')).toBeUndefined();
    expect(toScanEvent([{ rawValue: '   ' }], 'native')).toBeUndefined();
  });
});

describe('createScanConfirmation', () => {
  it('bestätigt erst die dritte gleiche Lesung', () => {
    const b = createScanConfirmation({ required: 3, windowMs: 2000 });
    expect(b.push(reading('2016-FL-045'), 0)).toEqual({ confirmed: false, hits: 1 });
    expect(b.push(reading('2016-FL-045'), 100)).toEqual({ confirmed: false, hits: 2 });
    expect(b.push(reading('2016-FL-045'), 200)).toEqual({ confirmed: true, hits: 3 });
  });

  it('lässt ein einzelnes Fehllesen zwischen richtigen Lesungen nie durch', () => {
    // Der Fall aus dem Einsatz: Ein Etikett „2016-FL-045" kam einmal als
    // „1016-FL-045" heraus — mit gültiger Prüfsumme. Wiederholt hat sich das
    // Fehllesen nicht, die richtige Lesung schon.
    const b = createScanConfirmation({ required: 3, windowMs: 2000 });
    const sequence = ['2016-FL-045', '1016-FL-045', '2016-FL-045', '2016-FL-045'];
    const outcomes = sequence.map((v, i) => b.push(reading(v), i * 100));
    expect(outcomes.map((e) => e.confirmed)).toEqual([false, false, false, true]);
  });

  it('zählt gleichen Text in anderer Symbologie nicht mit', () => {
    const b = createScanConfirmation({ required: 2, windowMs: 2000 });
    b.push(reading('2016', 'code_39'), 0);
    expect(b.push(reading('2016', 'code_128'), 100).confirmed).toBe(false);
  });

  it('vergisst Lesungen, die älter als das Fenster sind', () => {
    const b = createScanConfirmation({ required: 2, windowMs: 1000 });
    b.push(reading('2016-FL-062'), 0);
    expect(b.push(reading('2016-FL-062'), 1500)).toEqual({ confirmed: false, hits: 1 });
    expect(b.push(reading('2016-FL-062'), 1600).confirmed).toBe(true);
  });

  it('übernimmt mit required 1 sofort', () => {
    const b = createScanConfirmation({ required: 1, windowMs: 1000 });
    expect(b.push(reading('X'), 0).confirmed).toBe(true);
  });
});
