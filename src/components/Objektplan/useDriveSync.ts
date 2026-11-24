'use client';

import { useEffect, useState } from 'react';
import { parseDriveLink } from '../../common/objektplan/driveSync';
import type { ObjektArt } from '../../common/objektplan/objektArt';
import useOnline from '../../hooks/useOnline';
import type { DriveSyncResult } from '../../server/objektplan/driveSyncRunner';
import { syncObjektDokumenteFromDrive } from './objektplanActions';

export interface DriveSyncState {
  running: boolean;
  result?: DriveSyncResult;
  error?: boolean;
}

interface Finished {
  key: string;
  result?: DriveSyncResult;
  error?: boolean;
}

/**
 * Gleicht beim Öffnen einmal mit dem Drive-Link des Objekts ab. Neue
 * Dokumente kommen über den Firestore-Listener herein, nicht über das
 * Ergebnis. Offline unterbleibt der Abgleich; die zwischengespeicherten
 * Pläne bleiben, wie sie sind.
 */
export function useDriveSync(
  art: ObjektArt,
  objektId: string | undefined,
  link: string | undefined,
  active: boolean,
): DriveSyncState {
  const online = useOnline();
  const [finished, setFinished] = useState<Finished | null>(null);
  const key = active && online && objektId && parseDriveLink(link) ? `${art}/${objektId}` : undefined;

  useEffect(() => {
    if (!key || !objektId) return;
    let cancelled = false;
    syncObjektDokumenteFromDrive(art, objektId)
      .then((result) => {
        if (!cancelled) setFinished({ key, result });
      })
      .catch((err) => {
        console.error('Drive-Abgleich fehlgeschlagen', err);
        if (!cancelled) setFinished({ key, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [key, art, objektId]);

  if (!key) return { running: false };
  // Läuft, solange für diesen Schlüssel kein Ergebnis da ist. Wird der Dialog
  // geschlossen und wieder geöffnet, gilt das alte Ergebnis bis zum neuen.
  if (finished?.key !== key) return { running: true };
  return { running: false, result: finished.result, error: finished.error };
}
