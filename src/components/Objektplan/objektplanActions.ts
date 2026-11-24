'use server';

import { actionUserRequired } from '../../app/auth';
import { ApiException } from '../../app/api/errors';
import {
  canSeeObjektPlans,
  objektGroups,
  storageGroupsMetadata,
} from '../../common/objektplan/risikoobjektAccess';
import { isObjektArt, isObjektId, type ObjektArt } from '../../common/objektplan/objektArt';
import { driveSyncDeps } from '../../server/objektplan/driveSyncDeps';
import { runDriveSync, type DriveSyncResult } from '../../server/objektplan/driveSyncRunner';
import { loadPlanObjekt } from '../../server/objektplan/risikoobjektStore';

/**
 * Unterlagen eines Risikoobjekts oder gefährdeten Objekts mit seinem
 * Drive-Link abgleichen. Läuft beim
 * Öffnen der Pläne, für jeden, der sie sehen darf (`groups` am Objekt): Die
 * Quelle steht am Objekt und ist nicht wählbar, der Aufruf spiegelt nur, was
 * dort hinterlegt ist. Die Dateien bekommen die Freigabe als Metadatum.
 * Hintergrund: docs/objektplaene.md.
 */
export async function syncObjektDokumenteFromDrive(
  art: ObjektArt,
  objektId: string,
): Promise<DriveSyncResult> {
  const session = await actionUserRequired();
  if (!isObjektArt(art) || !isObjektId(objektId)) return { status: 'keinDriveLink' };
  const objekt = await loadPlanObjekt(art, objektId);
  if (!objekt) return { status: 'keinDriveLink' };
  if (!canSeeObjektPlans(session.user, objekt)) {
    throw new ApiException(`objekt ${art}/${objektId} not shared with user`, { status: 403 });
  }
  return runDriveSync(
    { art, id: objektId },
    objekt.link,
    driveSyncDeps(storageGroupsMetadata(objektGroups(objekt))),
  );
}
