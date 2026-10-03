'use client';

import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';
import { cloneElement, isValidElement, ReactElement } from 'react';
import useOnline from '../../hooks/useOnline';

/**
 * Für Funktionen, die nur mit dem Server gehen: KI-Assistent, Verrechnung
 * (`runTransaction`), Blaulicht-SMS-Import, Mail-Versand, PDF über den
 * Server. Offline sollen sie erkennbar deaktiviert sein, statt mit einem
 * Fehler abzubrechen.
 *
 * `useOnlineOnly()` liefert Zustand und Hinweistext für eigene Fälle,
 * `<OnlineOnly>` deaktiviert einen Knopf offline und legt den Hinweis als
 * Tooltip darüber — samt `<span>`, weil ein deaktivierter Knopf keine Events
 * an den Tooltip gibt (siehe CLAUDE.md).
 */
export function useOnlineOnly(): { offline: boolean; hint: string } {
  const online = useOnline();
  const t = useTranslations('networkStatus');
  return { offline: !online, hint: t('onlineOnly') };
}

export interface OnlineOnlyProps {
  /** Ein Element mit `disabled`-Prop, typischerweise ein Button. */
  children: ReactElement<{ disabled?: boolean }>;
  /** Eigener Hinweistext statt „Nur mit Internetverbindung verfügbar". */
  hint?: string;
}

export default function OnlineOnly({ children, hint }: OnlineOnlyProps) {
  const { offline, hint: defaultHint } = useOnlineOnly();
  if (!offline || !isValidElement(children)) return children;
  return (
    <Tooltip title={hint ?? defaultHint}>
      <span>{cloneElement(children, { disabled: true })}</span>
    </Tooltip>
  );
}
