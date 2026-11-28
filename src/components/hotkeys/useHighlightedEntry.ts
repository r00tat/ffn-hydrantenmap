'use client';

import { useEffect, useState } from 'react';
import {
  documentHighlightRequests,
  usePendingRequest,
} from './pendingRequest';

const HIGHLIGHT_MS = 4000;

/**
 * Holt einen Auftrag der Suche ab („diesen Eintrag zeigen"), scrollt zur
 * Zeile mit der ID `<kind>-<id>` und liefert die ID einige Sekunden lang als
 * hervorgehoben. `ready` erst setzen, wenn die Einträge gerendert sind;
 * `onRequest` läuft beim Eintreffen des Auftrags, etwa um auf den Reiter mit
 * allen Einträgen zu wechseln.
 */
export default function useHighlightedEntry(
  kind: 'diary' | 'gb',
  ready: boolean,
  onRequest?: () => void,
): string | undefined {
  const [requested, setRequested] = useState<string>();
  const [highlighted, setHighlighted] = useState<string>();

  usePendingRequest(documentHighlightRequests, (request) => {
    if (request.kind !== kind) return;
    onRequest?.();
    setRequested(request.id);
  });

  useEffect(() => {
    if (!requested || !ready) return;
    document
      .getElementById(`${kind}-${requested}`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    (async () => {
      setHighlighted(requested);
      setRequested(undefined);
    })();
  }, [kind, requested, ready]);

  useEffect(() => {
    if (!highlighted) return;
    const timer = setTimeout(() => setHighlighted(undefined), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlighted]);

  return highlighted;
}
