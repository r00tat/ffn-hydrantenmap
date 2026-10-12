// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IntlWrapper } from '../../test-utils/intlRender';
import { parseBekleidungError, useBekleidungErrorText } from './bekleidungErrors';

describe('parseBekleidungError', () => {
  it('erkennt Codes mit Parametern', () => {
    expect(parseBekleidungError('alreadyIssued:s1')).toEqual({
      code: 'alreadyIssued',
      stueckId: 's1',
    });
    expect(parseBekleidungError('insufficientStock:polo:52/54 C')).toEqual({
      code: 'insufficientStock',
      artikelId: 'polo',
      groesse: '52/54 C',
    });
    expect(parseBekleidungError('tagExists:22081702')).toEqual({
      code: 'tagExists',
      tag: '22081702',
    });
    expect(parseBekleidungError('notEmpty')).toEqual({ code: 'notEmpty' });
    expect(parseBekleidungError('importRunning')).toEqual({ code: 'importRunning' });
    expect(parseBekleidungError('notAvailable:s1:nicht_auffindbar')).toEqual({
      code: 'notAvailable',
      stueckId: 's1',
      status: 'nicht_auffindbar',
    });
  });

  it('lässt Unbekanntes als Text stehen', () => {
    expect(parseBekleidungError('person p1 not found')).toEqual({
      code: 'unknown',
      message: 'person p1 not found',
    });
  });
});

describe('useBekleidungErrorText', () => {
  const { result } = renderHook(() => useBekleidungErrorText(), { wrapper: IntlWrapper });
  const text = result.current;

  it('übersetzt mit aufgelösten Namen', () => {
    expect(
      text('alreadyIssued:s1', { stueckLabel: () => 'Einsatzjacke · L · #1' }),
    ).toContain('Einsatzjacke · L · #1');
    expect(
      text('insufficientStock:polo:M', { artikelLabel: () => 'Poloshirt' }),
    ).toContain('Poloshirt');
    expect(text('tagExists:4711')).toContain('4711');
    expect(
      text('notAvailable:s1:ausgeschieden', { stueckLabel: () => 'Einsatzjacke · L · #1' }),
    ).toBe('Einsatzjacke · L · #1 kann nicht ausgegeben werden (Status: ausgeschieden).');
  });

  it('übersetzt einfache Codes', () => {
    expect(text('notEmpty')).toMatch(/leer/);
    expect(text('fuehrungLocked')).toMatch(/Führung/);
    expect(text('fileTooLarge')).toContain('700');
    expect(text('importRunning')).toMatch(/läuft gerade/);
  });

  it('zeigt Unbekanntes mit dem Originaltext', () => {
    expect(text('boom')).toContain('boom');
  });
});
