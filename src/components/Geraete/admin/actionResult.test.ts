import { describe, expect, it } from 'vitest';
import { actionErrorOf, callAction } from './actionResult';

describe('actionErrorOf', () => {
  it('erkennt { success: false, error }', () => {
    expect(actionErrorOf({ success: false, error: 'kaputt' })).toBe('kaputt');
  });

  it('liefert einen Platzhalter, wenn der Fehlertext fehlt', () => {
    expect(actionErrorOf({ success: false })).toBe('unknown');
  });

  it('lässt Erfolge und andere Werte durch', () => {
    expect(actionErrorOf({ success: true })).toBeUndefined();
    expect(actionErrorOf({ id: 'x' })).toBeUndefined();
    expect(actionErrorOf(undefined)).toBeUndefined();
  });
});

describe('callAction', () => {
  it('reicht den Wert eines Erfolgs weiter', async () => {
    await expect(callAction(async () => ({ id: 'g1' }))).resolves.toEqual({
      ok: true,
      value: { id: 'g1' },
    });
  });

  it('fängt eine Ausnahme ab', async () => {
    await expect(
      callAction(async () => {
        throw new Error('nicht berechtigt');
      }),
    ).resolves.toEqual({ ok: false, error: 'nicht berechtigt' });
  });

  it('wertet { success: false } als Fehler', async () => {
    await expect(
      callAction(async () => ({ success: false, error: 'notInGroup' })),
    ).resolves.toEqual({ ok: false, error: 'notInGroup' });
  });
});
