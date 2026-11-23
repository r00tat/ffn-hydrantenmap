'use server';

import { actionUserRequired } from '../../app/auth';
import { ApiException } from '../../app/api/errors';
import {
  canSeeObjektPlans,
  objektGroups,
  storageGroupsMetadata,
} from '../../common/objektplan/risikoobjektAccess';
import { driveSyncDeps } from '../../server/objektplan/driveSyncDeps';
import { runDriveSync, type DriveSyncResult } from '../../server/objektplan/driveSyncRunner';
import { loadRisikoObjekt } from '../../server/objektplan/risikoobjektStore';

/**
 * Unterlagen eines Risikoobjekts mit seinem Drive-Link abgleichen. Läuft beim
 * Öffnen der Pläne, für jeden, der sie sehen darf (`groups` am Objekt): Die
 * Quelle steht am Objekt und ist nicht wählbar, der Aufruf spiegelt nur, was
 * dort hinterlegt ist. Die Dateien bekommen die Freigabe als Metadatum.
 * Hintergrund: docs/objektplaene.md.
 */
export async function syncObjektDokumenteFromDrive(objektId: string): Promise<DriveSyncResult> {
  const session = await actionUserRequired();
  if (!/^[A-Za-z0-9_-]+$/.test(objektId)) return { status: 'keinDriveLink' };
  const objekt = await loadRisikoObjekt(objektId);
  if (!objekt) return { status: 'keinDriveLink' };
  if (!canSeeObjektPlans(session.user, objekt)) {
    throw new ApiException(`objekt ${objektId} not shared with user`, { status: 403 });
  }
  return runDriveSync(
    objektId,
    objekt.link,
    driveSyncDeps(storageGroupsMetadata(objektGroups(objekt))),
  );
}
