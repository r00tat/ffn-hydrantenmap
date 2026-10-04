'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { canNavigateInPlace } from '../common/firecallNavigation';

/**
 * Wechselt ohne Router, wenn Ausgangs- und Zielseite eine Einsatzseite sind
 * (siehe `common/firecallNavigation.ts`). Gibt zurück, ob es so geschah.
 */
export function navigateInPlace(pathname: string, href: string): boolean {
  if (!canNavigateInPlace(pathname, href, window.location.origin)) return false;
  window.history.pushState(null, '', href);
  window.scrollTo(0, 0);
  return true;
}

/** `router.push` für Knöpfe, mit dem Wechsel ohne Router, wo er geht. */
export default function useFirecallNavigate(): (href: string) => void {
  const pathname = usePathname();
  const router = useRouter();
  return useCallback(
    (href: string) => {
      if (!navigateInPlace(pathname, href)) router.push(href);
    },
    [pathname, router],
  );
}
