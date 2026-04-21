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
      if ((document.documentElement.scrollTop ?? window.scrollY) > 0) return;
      startY.current = t.clientY;
      distanceRef.current = 0;
    };

    const onMove = (e: Event) => {
      if (startY.current === null) return;
      const t = (e as TouchEvent).touches?.[0];
      if (!t) return;
      const dy = t.clientY - startY.current;
      if (dy <= 0) return;
      distanceRef.current = dy;
      setState({ pulling: true, distance: dy });
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
