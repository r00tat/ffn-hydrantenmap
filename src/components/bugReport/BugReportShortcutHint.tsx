'use client';

import KeyboardIcon from '@mui/icons-material/Keyboard';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { formatBinding } from '../../common/hotkeys';
import { useHotkeys } from '../hotkeys/HotkeyProvider';

/** macOS, iPadOS und iOS zeigen Kürzel mit ⌥⇧⌘ statt Alt/Shift/Meta. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(`${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`);
}

/**
 * Nur Touch, keine Maus und (in aller Regel) keine Tastatur: Tablet oder
 * Handy. Dort hilft der Hinweis auf Tastenkürzel nicht.
 */
export function isTouchOnlyDevice(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

const noopSubscribe = () => () => {};

/**
 * „Tipp: ⌥B öffnet den Bug-Report auch über offenen Dialogen, ⌥⇧B wählt
 * direkt einen Bereich aus." — mit der eingestellten Belegung. Fehlt, wenn
 * Kürzel abgeschaltet sind oder das Gerät nur Touch kann.
 */
export default function BugReportShortcutHint() {
  const t = useTranslations('bugReport');
  const { enabled, bindings } = useHotkeys();
  const touchOnly = useSyncExternalStore(noopSubscribe, isTouchOnlyDevice, () => true);
  const mac = useSyncExternalStore(noopSubscribe, isApplePlatform, () => false);

  if (!enabled || touchOnly) return null;

  const openKey = formatBinding(bindings['bugReport.open'], { mac });
  const regionKey = formatBinding(bindings['bugReport.region'], { mac });
  const parts = [
    openKey ? t('shortcutHintOpen', { key: openKey }) : null,
    regionKey ? t('shortcutHintRegion', { key: regionKey }) : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;

  return (
    <Stack
      direction="row"
      spacing={1}
      data-testid="bug-report-shortcut-hint"
      sx={{ alignItems: 'center', color: 'text.secondary' }}
    >
      <KeyboardIcon fontSize="small" />
      <Typography variant="caption">{`${t('shortcutHintPrefix')} ${parts.join(', ')}.`}</Typography>
    </Stack>
  );
}
