// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFirebaseDebugging } from './useDebugging';

describe('useFirebaseDebugging console capture', () => {
  const nativeConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    console.log = nativeConsole.log;
    console.info = nativeConsole.info;
    console.warn = nativeConsole.warn;
    console.error = nativeConsole.error;
  });

  it('gibt console.* wieder frei, wenn die Anzeige abgeschaltet wird', () => {
    const { result } = renderHook(() => useFirebaseDebugging());

    act(() => result.current.setDisplayMessages(true));
    expect(console.info).not.toBe(nativeConsole.info);

    act(() => result.current.setDisplayMessages(false));
    expect(console.info).toBe(nativeConsole.info);
  });

  it('gibt console.* auch frei, wenn zwei Instanzen einander überlappen', () => {
    // Genau das passiert, wenn der Provider neu einhängt, während die
    // Umleitung aktiv ist: die zweite Instanz merkt sich die bereits
    // umgeleiteten Funktionen als "Original".
    const first = renderHook(() => useFirebaseDebugging());
    act(() => first.result.current.setDisplayMessages(true));

    const second = renderHook(() => useFirebaseDebugging());
    act(() => second.result.current.setDisplayMessages(true));

    // Die erste Instanz verschwindet, die zweite bleibt.
    first.unmount();
    act(() => second.result.current.setDisplayMessages(false));

    expect(console.info).toBe(nativeConsole.info);
    expect(console.warn).toBe(nativeConsole.warn);
    expect(console.error).toBe(nativeConsole.error);
  });

  it('zeichnet nach dem Abschalten nichts mehr auf', () => {
    const { result } = renderHook(() => useFirebaseDebugging());

    act(() => result.current.setDisplayMessages(true));
    act(() => console.info('waehrend an'));
    const whileOn = result.current.messages.length;
    expect(whileOn).toBeGreaterThan(0);

    act(() => result.current.setDisplayMessages(false));
    act(() => console.info('nach dem abschalten'));

    expect(result.current.messages.length).toBe(whileOn);
  });
});
