import { describe, expect, it } from 'vitest';
import { Content } from 'firebase/ai';
import { stripInlineDataParts } from './chatHistory';

describe('stripInlineDataParts', () => {
  it('ersetzt Audio-Teile durch einen Platzhalter', () => {
    const contents: Content[] = [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'audio/webm', data: 'AAAABBBB' } },
          { text: 'Aktueller Map-Kontext: {}' },
        ],
      },
      { role: 'model', parts: [{ text: 'Verstanden' }] },
    ];

    const stripped = stripInlineDataParts(contents);

    expect(stripped[0].parts).toEqual([
      { text: '[Sprachbefehl]' },
      { text: 'Aktueller Map-Kontext: {}' },
    ]);
    expect(stripped[1]).toEqual(contents[1]);
  });

  it('lässt die übergebene Historie unverändert', () => {
    const contents: Content[] = [
      { role: 'user', parts: [{ inlineData: { mimeType: 'audio/webm', data: 'AAAA' } }] },
    ];

    stripInlineDataParts(contents);

    expect(contents[0].parts[0]).toEqual({
      inlineData: { mimeType: 'audio/webm', data: 'AAAA' },
    });
  });

  it('gibt Historie ohne Anhänge unverändert zurück', () => {
    const contents: Content[] = [
      { role: 'user', parts: [{ text: 'Fahrzeug eintragen' }] },
      { role: 'function', parts: [{ functionResponse: { name: 'createVehicle', response: {} } }] },
    ];

    expect(stripInlineDataParts(contents)).toEqual(contents);
  });
});
