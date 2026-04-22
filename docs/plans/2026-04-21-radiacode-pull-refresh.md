# Android Pull-to-Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auf Android (Capacitor) zieht der Nutzer die aktuelle Seite nach
unten, ein Spinner erscheint und nach Loslassen wird die Seite via
`window.location.reload()` komplett neu geladen. Auf Web-Browsern und iOS
ist das Feature deaktiviert (Browser hat eigenes PtR; iOS hat andere
UX-Erwartungen).

**Architecture:** Ein neuer Hook `usePullToRefresh` bindet Touch-Events am
`document.body`, misst den Overscroll bei `scrollTop === 0` und zeigt
einen MUI-`CircularProgress`-Spinner via einer kleinen Shell-Komponente
`PullToRefreshIndicator`. Beide werden im globalen App-Shell (Root-Layout)
eingebunden. Capacitor-Platform-Check sorgt dafür, dass das Feature nur
auf Android aktiv ist.

**Tech Stack:** TypeScript, React 19, `@capacitor/core` (für
`Capacitor.getPlatform()`), MUI.

**Kontext für Agent:**

- Worktree: `.worktrees/radiacode-pull-refresh`, Basis
  `feat/radiacode-via-bluetooth`.
- Vor Start: `cp .env.local .worktrees/radiacode-pull-refresh/`.
- Tests liegen **neben** der Source.

---

### Task 1: Test — Pull-to-Refresh-Hook

**Files:**

- Create: `src/hooks/usePullToRefresh.test.tsx`

**Step 1: Tests schreiben**

```tsx
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePullToRefresh } from './usePullToRefresh';

function fireTouch(type: string, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { touches: [{ clientY: y }], changedTouches: [{ clientY: y }] });
  document.dispatchEvent(event);
}

describe('usePullToRefresh', () => {
  it('ruft onRefresh, wenn Pull-Distanz > Schwelle', () => {
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh({ onRefresh, threshold: 80, enabled: true }));
    Object.defineProperty(document.documentElement, 'scrollTop', { value: 0, configurable: true });

    act(() => {
      fireTouch('touchstart', 100);
      fireTouch('touchmove', 220); // +120 px overscroll
      fireTouch('touchend', 220);
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('ruft onRefresh NICHT, wenn Distanz < Schwelle', () => {
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh({ onRefresh, threshold: 80, enabled: true }));
    act(() => {
      fireTouch('touchstart', 100);
      fireTouch('touchmove', 140);
      fireTouch('touchend', 140);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ruft onRefresh NICHT, wenn enabled=false', () => {
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh({ onRefresh, threshold: 80, enabled: false }));
    act(() => {
      fireTouch('touchstart', 100);
      fireTouch('touchmove', 250);
      fireTouch('touchend', 250);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
```

**Step 2: Test ausführen**

Run: `NO_COLOR=1 npx vitest run src/hooks/usePullToRefresh.test.tsx`
Expected: **FAIL** (Hook existiert nicht).

**Step 3: Commit**

```bash
git add src/hooks/usePullToRefresh.test.tsx
git commit -m "test(app): pull-to-refresh-hook"
```

---

### Task 2: Hook implementieren

**Files:**

- Create: `src/hooks/usePullToRefresh.ts`

**Step 1: Implementierung**

```ts
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

  useEffect(() => {
    if (!enabled) return;

    const onStart = (e: Event) => {
      const t = (e as TouchEvent).touches?.[0];
      if (!t) return;
      if ((document.documentElement.scrollTop ?? window.scrollY) > 0) return;
      startY.current = t.clientY;
    };

    const onMove = (e: Event) => {
      if (startY.current === null) return;
      const t = (e as TouchEvent).touches?.[0];
      if (!t) return;
      const dy = t.clientY - startY.current;
      if (dy <= 0) return;
      setState({ pulling: true, distance: dy });
    };

    const onEnd = () => {
      if (startY.current === null) {
        return;
      }
      const endDistance = state.distance;
      startY.current = null;
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
  }, [enabled, onRefresh, threshold, state.distance]);

  return state;
}
```

Falls der Test wegen des `state.distance`-Captures in `onEnd` instabil
ist: einen zweiten Ref `distanceRef` parallel zu `state.distance`
mitführen und in `onEnd` auslesen.

**Step 2: Tests grün**

Run: `NO_COLOR=1 npx vitest run src/hooks/usePullToRefresh.test.tsx`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/hooks/usePullToRefresh.ts
git commit -m "feat(app): usePullToRefresh-hook"
```

---

### Task 3: Shell-Komponente `PullToRefreshIndicator`

**Files:**

- Create: `src/components/PullToRefreshIndicator.tsx`

**Step 1: Komponente**

```tsx
'use client';

import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import { Capacitor } from '@capacitor/core';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

const THRESHOLD = 80;

export function PullToRefreshIndicator() {
  const isAndroid =
    typeof window !== 'undefined' &&
    Capacitor.getPlatform() === 'android';

  const { pulling, distance } = usePullToRefresh({
    onRefresh: () => window.location.reload(),
    threshold: THRESHOLD,
    enabled: isAndroid,
  });

  if (!isAndroid || !pulling) return null;

  const progress = Math.min(100, (distance / THRESHOLD) * 100);

  return (
    <Box
      sx={{
        position: 'fixed',
        top: Math.min(distance / 2, 60),
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1400,
        pointerEvents: 'none',
        transition: 'top 0.1s linear',
      }}
    >
      <CircularProgress
        variant="determinate"
        value={progress}
        size={36}
      />
    </Box>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/PullToRefreshIndicator.tsx
git commit -m "feat(app): pull-to-refresh-indicator"
```

---

### Task 4: Einhängen im App-Shell

**Files:**

- Modify: `src/app/layout.tsx` (oder existierende Shell-Komponente,
  z.B. `src/components/AppShell.tsx` — mit `grep -rn "RadiacodeProvider"
  src/app` die Root-Struktur finden).

**Step 1: Indicator einhängen**

```tsx
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator';
// ... im Root-Layout-JSX neben den Providern:
<PullToRefreshIndicator />
```

**Step 2: Vollchecks**

Run: `npm run check`
Expected: PASS.

**Step 3: Manuelle Verifikation auf Android**

Build + Capacitor-Sync + Install:

```bash
npm run build
npx cap sync android
npx cap run android
```

Seite runterziehen → Spinner → loslassen → Page reload.

**Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(app): pull-to-refresh indicator im app-shell"
```

---

### Task 5: Merge zurück

```bash
cd <repo-root>
git checkout feat/radiacode-via-bluetooth
git merge --no-ff .worktrees/radiacode-pull-refresh
git worktree remove .worktrees/radiacode-pull-refresh
```
