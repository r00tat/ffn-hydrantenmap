import { useMemo, useSyncExternalStore } from 'react';
import { AssistantMemory, loadMemory, memoryVersion, subscribeMemory } from './assistantMemory';

const serverVersion = () => 0;

/**
 * Das Gedächtnis des Assistenten für einen Einsatz, als React-Zustand.
 *
 * Folgt jeder Änderung über `subscribeMemory`: Einzelaufruf, Live-Sitzung und
 * die Notizliste am Knopf lesen dieselben Daten, schreiben aber unabhängig
 * voneinander.
 */
export default function useAssistantMemory(firecallId: string | undefined): AssistantMemory | undefined {
  const version = useSyncExternalStore(subscribeMemory, memoryVersion, serverVersion);
  return useMemo(
    () => (firecallId ? loadMemory(firecallId) : undefined),
    // `version` ist der Auslöser, gelesen wird aus localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firecallId, version],
  );
}
