import { describe, expect, it } from 'vitest';
import { isUsableAudio, MIN_AUDIO_BYTES } from './audioInput';

describe('isUsableAudio', () => {
  it('weist eine leere Aufnahme ab', () => {
    expect(isUsableAudio('')).toBe(false);
  });

  it('weist eine Aufnahme ab, die nur aus dem Containerkopf besteht', () => {
    // Ein WebM-Kopf ohne Tonspur ist wenige hundert Byte groß; Gemini lehnt
    // ihn mit „invalid argument" ab.
    expect(isUsableAudio('A'.repeat(600))).toBe(false);
  });

  it('lässt eine kurze, aber echte Aufnahme durch', () => {
    const base64Length = Math.ceil((MIN_AUDIO_BYTES * 4) / 3) + 100;
    expect(isUsableAudio('A'.repeat(base64Length))).toBe(true);
  });
});
