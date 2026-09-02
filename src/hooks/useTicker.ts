'use client';

import { useEffect, useState } from 'react';

/** Alle zehn Sekunden — fein genug für eine Anzeige in Minuten. */
export const TICKER_INTERVALL_MS = 10_000;

/**
 * Die laufende Uhr für Anzeigen, die sich ohne Zutun fortschreiben müssen —
 * die Restzeit eines Atemschutztrupps etwa.
 *
 * Dieselbe Bauweise wie `useNow` in `RadiacodeLiveWidget` und `useTickingNow`
 * in `FirecallShareLinkList`: Der Startwert kommt aus einer lazy
 * Initialisierung, gesetzt wird nur im Intervall. Ein `setJetzt` im Rumpf des
 * Effekts wäre ein zweiter Render je Mount — und `react-hooks/set-state-in-effect`
 * lehnt es zu Recht ab.
 */
export default function useTicker(
  intervallMs: number = TICKER_INTERVALL_MS,
): Date {
  const [jetzt, setJetzt] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setJetzt(new Date()), intervallMs);
    return () => clearInterval(timer);
  }, [intervallMs]);

  return jetzt;
}
