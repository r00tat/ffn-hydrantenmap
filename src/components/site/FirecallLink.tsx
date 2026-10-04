'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentProps, MouseEvent } from 'react';
import { canNavigateInPlace } from '../../common/firecallNavigation';

type FirecallLinkProps = ComponentProps<typeof Link>;

/**
 * `Link`, der zwischen den Seiten desselben Einsatzes ohne Router wechselt
 * (siehe `common/firecallNavigation.ts`). Ein `preventDefault` im onClick
 * hält `next/link` von der Navigation ab; `pushState` aktualisiert
 * `usePathname`, ohne den Server zu fragen — auch offline.
 */
export default function FirecallLink({ href, onClick, ...rest }: FirecallLinkProps) {
  const pathname = usePathname();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      typeof href !== 'string' ||
      !canNavigateInPlace(pathname, href, window.location.origin)
    ) {
      return;
    }
    event.preventDefault();
    window.history.pushState(null, '', href);
    window.scrollTo(0, 0);
  };

  return <Link href={href} onClick={handleClick} {...rest} />;
}
