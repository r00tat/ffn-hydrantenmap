import { useEffect, useRef, useState } from 'react';

export interface PullToRefreshOptions {
  onRefresh: () => void;
  threshold?: number; // px
  enabled?: boolean;
}

export interface PullToRefreshState {
  pulling: boolean;
  distance: number;
}

/**
 * Dead-zone bevor der Indikator erscheint. Vermeidet, dass der Indikator schon
 * bei winzigen Abwärts-Bewegungen aufblitzt, die nichts mit Pull-to-refresh zu
 * tun haben (z.B. kurzer Touch-Drift vor einem Tap).
 */
const PULL_DEAD_ZONE_PX = 30;

/**
 * Findet den nächsten scrollbaren Vorfahren eines Touch-Targets. Wichtig, weil
 * das App-Layout den Content in einem inneren `<Box overflow="auto">` scrollt —
 * nicht über das Dokument. `document.documentElement.scrollTop` wäre damit
 * immer 0 und würde PTR auch mitten auf der Seite auslösen.
 */
function nearestScrollableAncestor(el: Element | null): Element | null {
  let cur: Element | null = el;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const style = window.getComputedStyle(cur);
    const oy = style.overflowY;
    if (
      (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
      cur.scrollHeight > cur.clientHeight
    ) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

function scrollContainerAtTop(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  const scrollable = nearestScrollableAncestor(el);
  if (scrollable) return scrollable.scrollTop <= 0;
  return (document.documentElement.scrollTop || window.scrollY) <= 0;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  enabled = true,
}: PullToRefreshOptions): PullToRefreshState {
  const [state, setState] = useState<PullToRefreshState>({
    pulling: false,
    distance: 0,
  });
  const startY = useRef<number | null>(null);
  const distanceRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const onStart = (e: Event) => {
      const t = (e as TouchEvent).touches?.[0];
      if (!t) return;
      if (!scrollContainerAtTop(e.target)) return;
      startY.current = t.clientY;
      distanceRef.current = 0;
    };

    const onMove = (e: Event) => {
      if (startY.current === null) return;
      const t = (e as TouchEvent).touches?.[0];
      if (!t) return;
      const dy = t.clientY - startY.current;
      if (dy <= PULL_DEAD_ZONE_PX) {
        // Dead zone: startY behalten, aber noch keinen pulling-State setzen.
        distanceRef.current = 0;
        setState((prev) => (prev.pulling ? { pulling: false, distance: 0 } : prev));
        return;
      }
      const effectiveDy = dy - PULL_DEAD_ZONE_PX;
      distanceRef.current = effectiveDy;
      setState({ pulling: true, distance: effectiveDy });
    };

    const onEnd = () => {
      if (startY.current === null) {
        return;
      }
      const endDistance = distanceRef.current;
      startY.current = null;
      distanceRef.current = 0;
      setState({ pulling: false, distance: 0 });
      if (endDistance >= threshold) onRefresh();
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled, onRefresh, threshold]);

  return state;
}
