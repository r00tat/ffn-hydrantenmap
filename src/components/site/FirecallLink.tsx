'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentProps, MouseEvent } from 'react';
import { navigateInPlace } from '../../hooks/useFirecallNavigate';

type FirecallLinkProps = ComponentProps<typeof Link>;

/**
 * `Link`, der zwischen den Einsatzseiten ohne Router wechselt
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
      typeof href !== 'string'
    ) {
      return;
    }
    if (navigateInPlace(pathname, href)) event.preventDefault();
  };

  return <Link href={href} onClick={handleClick} {...rest} />;
}
