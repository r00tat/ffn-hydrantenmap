import { describe, it, expect } from 'vitest';
import {
  resolveSpectrumIdentification,
  runLiveIdentification,
} from './spectrumIdentification';

describe('resolveSpectrumIdentification', () => {
  it('returns source=none when nothing is identified', () => {
    expect(resolveSpectrumIdentification(undefined, undefined)).toEqual({
      displayName: null,
      source: 'none',
    });
  });

  it('returns the auto match when no manual assignment is present', () => {
    expect(
      resolveSpectrumIdentification(undefined, {
        name: 'Cs-137',
        confidence: 0.82,
      })
    ).toEqual({
      displayName: 'Cs-137',
      source: 'auto',
      confidence: 0.82,
    });
  });

  it('prefers the manual assignment over the auto match', () => {
    expect(
      resolveSpectrumIdentification('Co-60', {
        name: 'Cs-137',
        confidence: 0.4,
      })
    ).toEqual({
      displayName: 'Co-60',
      source: 'manual',
      autoAlt: { name: 'Cs-137', confidence: 0.4 },
    });
  });

  it('omits autoAlt when manual equals the auto match', () => {
    expect(
      resolveSpectrumIdentification('Cs-137', {
        name: 'Cs-137',
        confidence: 0.9,
      })
    ).toEqual({
      displayName: 'Cs-137',
      source: 'manual',
    });
  });

  it('omits autoAlt when manual is set but no auto match exists', () => {
    expect(resolveSpectrumIdentification('Sr-90', undefined)).toEqual({
      displayName: 'Sr-90',
      source: 'manual',
    });
  });

  it('treats an empty manual string as not set', () => {
    expect(
      resolveSpectrumIdentification('', {
        name: 'Cs-137',
        confidence: 0.5,
      })
    ).toEqual({
      displayName: 'Cs-137',
      source: 'auto',
      confidence: 0.5,
    });
  });
});

describe('runLiveIdentification', () => {
  it('returns insufficient when total counts < 1000', () => {
    const r = runLiveIdentification([0, 1, 2], [0, 2.5, 0]);
    expect(r.state).toBe('insufficient');
    expect(r.total).toBe(3);
  });

  it('returns none when no peak matches above 0.3 confidence', () => {
    const flat = new Array(1024).fill(5);
    const r = runLiveIdentification(flat, [0, 2.5, 0]);
    expect(r.state).toBe('none');
  });

  it('returns match with nuclide + confidence for a clear Cs-137 peak', () => {
    // Gaussian-shaped peak centred on channel 265 (≈ 662 keV at a1=2.5) so
    // findPeaks sees a strict local maximum instead of a flat plateau.
    const counts = new Array(1024).fill(0);
    const center = 265;
    const sigma = 10;
    for (let i = 0; i < counts.length; i++) {
      const d = i - center;
      counts[i] = Math.round(2000 * Math.exp(-(d * d) / (2 * sigma * sigma)));
    }
    const r = runLiveIdentification(counts, [0, 2.5, 0]);
    expect(r.state).toBe('match');
    if (r.state === 'match') {
      expect(r.nuclide).toContain('Cs');
      expect(r.confidence).toBeGreaterThan(0.3);
    }
  });
});
