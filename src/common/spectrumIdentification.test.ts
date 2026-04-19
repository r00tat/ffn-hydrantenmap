import { describe, it, expect } from 'vitest';
import { resolveSpectrumIdentification } from './spectrumIdentification';

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
