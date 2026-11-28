'use client';

import { useSyncExternalStore } from 'react';
import { formatBinding, type HotkeyActionId } from '../../common/hotkeys';
import { useHotkeys } from './HotkeyProvider';

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const noSubscribe = () => () => {};

/** Mac-Tastatur? Beim Server-Rendering `false`. */
export function useIsMac(): boolean {
  return useSyncExternalStore(noSubscribe, detectMac, () => false);
}

/**
 * Das aktuelle Kürzel einer Aktion zur Anzeige („N", „⌥⇧B"), leer wenn es
 * abgeschaltet ist oder die Kürzel insgesamt aus sind.
 */
export function useHotkeyLabel(id: HotkeyActionId): string {
  const { bindings, enabled } = useHotkeys();
  const mac = useIsMac();
  if (!enabled) return '';
  return formatBinding(bindings[id], { mac });
}

/** „Titel (N)" bzw. nur „Titel" ohne Kürzel — für Tooltips. */
export function withHotkey(title: string, label: string): string {
  return label ? `${title} (${label})` : title;
}
