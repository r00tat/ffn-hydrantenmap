'use client';

import { useEffect, useRef } from 'react';
import type { FirecallItem } from '../firebase/firestore';

/**
 * Ein Auftrag an eine Seite, die vielleicht erst noch geladen wird.
 *
 * Die Suche wählt ein Element aus und wechselt dann zur Karte; ob die Karte
 * schon da ist oder erst gemountet wird, weiß sie nicht. Der Auftrag bleibt
 * deshalb liegen, bis ihn jemand abholt — sofort, wenn die Seite schon
 * zuhört, sonst beim Mount. Bewusst nicht über die Adresse (`?highlight=`):
 * Die Einsatzseiten wechseln per `pushState` ohne Router, und eine Query
 * schlösse diesen Weg aus (`canNavigateInPlace`).
 */
export interface PendingRequest<T> {
  request: (value: T) => void;
  /** Holt den liegenden Auftrag ab; danach ist keiner mehr da. */
  take: () => T | undefined;
  subscribe: (listener: () => void) => () => void;
}

export function createPendingRequest<T>(): PendingRequest<T> {
  let pending: T | undefined;
  const listeners = new Set<() => void>();
  return {
    request(value) {
      pending = value;
      listeners.forEach((listener) => listener());
    },
    take() {
      const value = pending;
      pending = undefined;
      return value;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Holt Aufträge ab, solange die Komponente gemountet und `enabled` ist. */
export function usePendingRequest<T>(
  store: PendingRequest<T>,
  handler: (value: T) => void,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;
    const handle = () => {
      const value = store.take();
      if (value !== undefined) handlerRef.current(value);
    };
    handle();
    return store.subscribe(handle);
  }, [store, enabled]);
}

/** Kartenelement, das die Karte zeigen und auswählen soll. */
export const mapFocusRequests = createPendingRequest<FirecallItem>();

/** Eintrag, den das Einsatztagebuch bzw. Geschäftsbuch hervorheben soll. */
export const documentHighlightRequests = createPendingRequest<{
  kind: 'diary' | 'gb';
  id: string;
}>();

/**
 * Die Punkte, die die Karte für ein Element ins Bild holen soll: bei Linien
 * und Flächen alle Stützpunkte, sonst die Position.
 */
export function focusPoints(item: {
  lat?: number;
  lng?: number;
  destLat?: number;
  destLng?: number;
  positions?: string;
}): [number, number][] {
  if (item.positions) {
    try {
      const parsed = JSON.parse(item.positions) as unknown;
      if (Array.isArray(parsed)) {
        const points = parsed.filter(
          (p): p is [number, number] =>
            Array.isArray(p) &&
            Number.isFinite(p[0]) &&
            Number.isFinite(p[1]),
        );
        if (points.length > 0) return points;
      }
    } catch {
      // Unlesbare Stützpunkte: dann zählt die Position.
    }
  }
  const points: [number, number][] = [];
  if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) {
    points.push([item.lat as number, item.lng as number]);
  }
  if (Number.isFinite(item.destLat) && Number.isFinite(item.destLng)) {
    points.push([item.destLat as number, item.destLng as number]);
  }
  return points;
}
