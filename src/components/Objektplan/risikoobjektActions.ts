'use server';

import {
  actionAdminRequired,
  actionPermissionRequired,
  actionUserRequired,
} from '../../app/auth';
import type { RisikoObjekt } from '../../common/gis-objects';
import {
  canManageRisikoObjekt,
  checkGroupsChange,
  normalizeRisikoObjektInput,
  objektGroups,
  RISIKOOBJEKT_MANAGE,
  storageGroupsMetadata,
  type RisikoObjektInput,
  type RisikoObjektInputError,
} from '../../common/objektplan/risikoobjektAccess';
import { objektDokumentKind, wantsOcr, type ObjektDokumentIndexStatus } from '../../common/objektplan/objektDokument';
import { parseDriveLink } from '../../common/objektplan/driveSync';
import {
  isObjektArt,
  isObjektId,
  isObjektRef,
  type ObjektArt,
  type ObjektRef,
} from '../../common/objektplan/objektArt';
import { withOcrIndex } from '../../common/objektplan/ocrIndex';
import { isTenantGroupId } from '../../common/tenantGroups';
import { driveSyncDeps } from '../../server/objektplan/driveSyncDeps';
import { runDriveSync, type DriveSyncResult } from '../../server/objektplan/driveSyncRunner';
import { ocrStoragePdf } from '../../server/objektplan/ocrDokument';
import { reindexDeps } from '../../server/objektplan/reindexDeps';
import { reindexDokument } from '../../server/objektplan/reindexRunner';
import {
  deleteObjektDokumentCompletely,
  deletePlanObjektCompletely,
  loadAllPlanObjekte,
  loadObjektDokument,
  loadObjektDokumentSummaries,
  loadPlanObjekt,
  newRisikoObjektId,
  savePlanObjekt,
  writeObjektDokument,
  writeStorageGroups,
  type PlanObjektWithId,
} from '../../server/objektplan/risikoobjektStore';

/**
 * Risikoobjekte und gefährdete Objekte pflegen, Freigabe an Gruppen. Geprüft
 * wird das Recht `risikoobjekte.manage` in einer der freigegebenen Gruppen;
 * der globale Admin darf alles. Die Objektart (`ObjektArt`) kommt vom Client
 * und wird Teil eines Pfads — sie wird deshalb vor jedem Zugriff geprüft.
 * Hintergrund: docs/objektplaene.md.
 */

export type RisikoObjektActionError =
  | RisikoObjektInputError
  | 'forbidden'
  | 'notFound'
  | 'empty'
  | 'notApp'
  | 'notScan'
  | 'ocrFailed'
  | 'reindexFailed';

export type RisikoObjektActionResult =
  | { ok: true; id: string }
  | { ok: false; error: RisikoObjektActionError };

/** Ergebnis der Texterkennung: ob Text gefunden wurde und wie viele Melder. */
export type OcrActionResult =
  | { ok: true; id: string; hasText: boolean; melder: number }
  | { ok: false; error: RisikoObjektActionError };

/** Ergebnis des Neu-Einlesens: Status, Zahl der Melder, ob die Texterkennung lief. */
export type ReindexActionResult =
  | { ok: true; id: string; indexStatus: ObjektDokumentIndexStatus; melder: number; ocr: boolean }
  | { ok: false; error: RisikoObjektActionError };

/** Eine Zeile der Admin-Übersicht zum Neu-Einlesen. */
export interface ReindexCandidate {
  art: ObjektArt;
  objektId: string;
  objektName: string;
  dokumentId: string;
  name: string;
  indexStatus: ObjektDokumentIndexStatus;
  melder: number;
  ocr: boolean;
}

function sortedGroups(groups: string[]): string[] {
  return [...new Set(groups)].sort();
}

type Session = Awaited<ReturnType<typeof actionUserRequired>>;

/** Lädt das Objekt, wenn Art und ID gültig sind und der Benutzer es pflegen darf. */
async function loadManagedObjekt(
  session: Session,
  art: unknown,
  id: unknown,
): Promise<{ ok: true; objekt: PlanObjektWithId } | { ok: false; error: 'notFound' | 'forbidden' }> {
  if (!isObjektArt(art) || !isObjektId(id)) return { ok: false, error: 'notFound' };
  const objekt = await loadPlanObjekt(art, id);
  if (!objekt) return { ok: false, error: 'notFound' };
  if (!canManageRisikoObjekt(session.user, objekt)) return { ok: false, error: 'forbidden' };
  return { ok: true, objekt };
}

export async function createRisikoObjekt(
  groupId: string,
  input: Partial<RisikoObjektInput>,
): Promise<RisikoObjektActionResult> {
  const session = await actionPermissionRequired(groupId, RISIKOOBJEKT_MANAGE);
  const checked = normalizeRisikoObjektInput(input);
  if (!checked.ok) return checked;
  const now = new Date().toISOString();
  const id = newRisikoObjektId();
  await savePlanObjekt('risikoobjekt', id, {
    ...checked.value,
    erfassungsdatum: now.slice(0, 10),
    groups: [groupId],
    quelle: 'app',
    createdBy: session.user.email ?? '',
    createdAt: now,
  });
  return { ok: true, id };
}

/**
 * Objekte aus dem GIS-Import gehören dem Import: Name, Lage und Adresse
 * überschriebe der nächste Lauf wieder. Gruppen-Admins ändern dort nur den
 * Link — er führt zu den Plänen und kommt nicht aus dem GIS. Gefährdete
 * Objekte stammen immer aus dem GIS.
 */
export async function updateRisikoObjekt(
  art: ObjektArt,
  id: string,
  input: Partial<RisikoObjektInput>,
): Promise<RisikoObjektActionResult> {
  const session = await actionUserRequired();
  const loaded = await loadManagedObjekt(session, art, id);
  if (!loaded.ok) return loaded;
  const { objekt } = loaded;

  if (objekt.quelle !== 'app' && !session.user.isAdmin) {
    const checked = normalizeRisikoObjektInput({ ...objekt, link: input.link });
    if (!checked.ok) return checked;
    await savePlanObjekt(objekt.art, id, { link: checked.value.link });
    return { ok: true, id };
  }

  const checked = normalizeRisikoObjektInput(input);
  if (!checked.ok) return checked;
  await savePlanObjekt(objekt.art, id, checked.value);
  return { ok: true, id };
}

/** Nur in der App angelegte Objekte; die aus dem GIS brächte der Import zurück. */
export async function deleteRisikoObjekt(
  art: ObjektArt,
  id: string,
): Promise<RisikoObjektActionResult> {
  const session = await actionUserRequired();
  const loaded = await loadManagedObjekt(session, art, id);
  if (!loaded.ok) return loaded;
  if (loaded.objekt.quelle !== 'app') return { ok: false, error: 'notApp' };
  await deletePlanObjektCompletely(loaded.objekt);
  return { ok: true, id };
}

export async function setRisikoObjektGroups(
  art: ObjektArt,
  id: string,
  groups: string[],
): Promise<RisikoObjektActionResult> {
  const session = await actionUserRequired();
  if (!Array.isArray(groups)) return { ok: false, error: 'notFound' };
  const loaded = await loadManagedObjekt(session, art, id);
  if (!loaded.ok) return loaded;
  const { objekt } = loaded;

  const next = sortedGroups(groups.map(String));
  const check = checkGroupsChange(session.user, objektGroups(objekt), next);
  if (check !== 'ok') return { ok: false, error: check };

  await savePlanObjekt(objekt.art, id, { groups: next });
  await writeStorageGroups(objekt.art, id, next);
  return { ok: true, id };
}

/**
 * Einmalig nach dem Einführen der Freigabe und nach jedem GIS-Import mit
 * neuen Objekten: Objekte ohne Freigabe sehen nur Admins.
 */
export async function shareUnsharedRisikoObjekte(
  groupIds: string[],
): Promise<{ ok: true; count: number } | { ok: false; error: 'empty' | 'forbidden' }> {
  await actionAdminRequired();
  const groups = sortedGroups((Array.isArray(groupIds) ? groupIds : []).map(String));
  if (groups.length === 0) return { ok: false, error: 'empty' };
  if (groups.some((g) => !isTenantGroupId(g))) return { ok: false, error: 'forbidden' };

  let count = 0;
  for (const objekt of await loadAllPlanObjekte()) {
    if (objektGroups(objekt).length > 0) continue;
    await savePlanObjekt(objekt.art, objekt.id, { groups } satisfies Partial<RisikoObjekt>);
    await writeStorageGroups(objekt.art, objekt.id, groups);
    count += 1;
  }
  return { ok: true, count };
}

/**
 * Löscht eine hochgeladene Unterlage samt Datei. Über den Server, weil die
 * Storage-Regel das Recht `risikoobjekte.manage` nicht kennt — es steht
 * nicht im Token. Unterlagen aus Drive löscht man im Drive.
 */
export async function deleteObjektDokumentAction(
  art: ObjektArt,
  objektId: string,
  dokumentId: string,
): Promise<RisikoObjektActionResult> {
  const session = await actionUserRequired();
  if (!isObjektId(dokumentId)) return { ok: false, error: 'notFound' };
  const loaded = await loadManagedObjekt(session, art, objektId);
  if (!loaded.ok) return loaded;
  const dokument = await loadObjektDokument(loaded.objekt.art, objektId, dokumentId);
  if (!dokument) return { ok: false, error: 'notFound' };
  if (dokument.quelle === 'drive') return { ok: false, error: 'forbidden' };
  await deleteObjektDokumentCompletely(loaded.objekt.art, objektId, dokument);
  return { ok: true, id: dokumentId };
}

/**
 * Texterkennung für einen gescannten Plan (PDF ohne Textebene) oder einen
 * Plan, dessen Textebene keinen Melder enthält (siehe `wantsOcr`): nach dem
 * Upload aus dem Dialog und nachträglich für ältere Unterlagen. Einmal je
 * Dokument — `ocr` vermerkt den Versuch, auch wenn kein Text herauskam.
 */
export async function ocrObjektDokumentAction(
  art: ObjektArt,
  objektId: string,
  dokumentId: string,
): Promise<OcrActionResult> {
  const session = await actionUserRequired();
  if (!isObjektId(dokumentId)) return { ok: false, error: 'notFound' };
  const loaded = await loadManagedObjekt(session, art, objektId);
  if (!loaded.ok) return loaded;
  const objektArt = loaded.objekt.art;
  const dokument = await loadObjektDokument(objektArt, objektId, dokumentId);
  if (!dokument) return { ok: false, error: 'notFound' };
  if (!wantsOcr(dokument)) return { ok: false, error: 'notScan' };
  try {
    const index = await ocrStoragePdf(
      dokument.storagePath,
      ocrKey(objektArt, objektId, dokumentId),
      dokument.seiten,
    );
    const result = withOcrIndex(dokument, index);
    await writeObjektDokument(objektArt, objektId, result);
    return {
      ok: true,
      id: dokumentId,
      hasText: result.indexStatus === 'ok',
      melder: result.melder?.length ?? 0,
    };
  } catch (err) {
    console.error('Texterkennung fehlgeschlagen', objektId, dokumentId, err);
    return { ok: false, error: 'ocrFailed' };
  }
}

/**
 * Liest eine Unterlage neu aus Storage ein — Index und, wo sie lohnt,
 * Texterkennung. Für Pläne, die vor einer Verbesserung der Erkennung
 * indiziert wurden. Hintergrund: docs/objektplaene.md, „Neu einlesen".
 */
export async function reindexObjektDokumentAction(
  art: ObjektArt,
  objektId: string,
  dokumentId: string,
): Promise<ReindexActionResult> {
  const session = await actionUserRequired();
  if (!isObjektId(dokumentId)) return { ok: false, error: 'notFound' };
  const loaded = await loadManagedObjekt(session, art, objektId);
  if (!loaded.ok) return loaded;
  const objektArt = loaded.objekt.art;
  const dokument = await loadObjektDokument(objektArt, objektId, dokumentId);
  if (!dokument) return { ok: false, error: 'notFound' };
  try {
    const result = await reindexDokument(
      dokument,
      reindexDeps(ocrKey(objektArt, objektId, dokumentId)),
    );
    await writeObjektDokument(objektArt, objektId, result);
    return {
      ok: true,
      id: dokumentId,
      indexStatus: result.indexStatus,
      melder: result.melder?.length ?? 0,
      ocr: result.ocr === true,
    };
  } catch (err) {
    console.error('Neu einlesen fehlgeschlagen', objektId, dokumentId, err);
    return { ok: false, error: 'reindexFailed' };
  }
}

/**
 * Alle PDFs aller Risikoobjekte und gefährdeten Objekte für das Neu-Einlesen
 * unter Admin Actions. Die ohne Melder zuerst — bei ihnen lohnt es am ehesten.
 */
export async function listObjektDokumenteForReindex(): Promise<ReindexCandidate[]> {
  await actionAdminRequired();
  const result: ReindexCandidate[] = [];
  for (const objekt of await loadAllPlanObjekte()) {
    for (const d of await loadObjektDokumentSummaries(objekt.art, objekt.id)) {
      if (objektDokumentKind(d.contentType) !== 'pdf') continue;
      result.push({
        art: objekt.art,
        objektId: objekt.id,
        objektName: objekt.name || objekt.id,
        dokumentId: d.id,
        name: d.name,
        indexStatus: d.indexStatus,
        melder: d.melder?.length ?? 0,
        ocr: d.ocr === true,
      });
    }
  }
  return result.sort(
    (a, b) =>
      Number(a.melder > 0) - Number(b.melder > 0) ||
      a.objektName.localeCompare(b.objektName, 'de') ||
      a.name.localeCompare(b.name, 'de'),
  );
}

/**
 * Alle Risikoobjekte und gefährdeten Objekte mit einem Drive-Link, für den
 * Abgleich aller Objekte unter Admin Actions. Der Browser schickt sie in
 * kleinen Blöcken an `syncPlanObjekteFromDrive`, damit kein Aufruf ins
 * Zeitlimit läuft.
 */
export async function listPlanObjekteWithDriveLink(): Promise<
  Array<ObjektRef & { name: string }>
> {
  await actionAdminRequired();
  return (await loadAllPlanObjekte())
    .filter((o) => parseDriveLink(o.link) !== null)
    .map((o) => ({ art: o.art, id: o.id, name: o.name || o.id }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Ergebnis des Abgleichs je Objekt: das Ergebnis oder die Fehlermeldung. */
export type DriveSyncBatchEntry = ObjektRef &
  ({ result: DriveSyncResult } | { error: string });

/**
 * Höchstzahl Objekte je Aufruf. Der Client schickt kleinere Blöcke; die
 * Grenze hält einen einzelnen Aufruf unter dem Zeitlimit und dem Speicher
 * des Dienstes (pdfjs hält jeden Plan beim Indizieren ganz im Speicher).
 */
const DRIVE_SYNC_MAX_BATCH = 8;

/**
 * Mehrere Objekte gleichzeitig mit Drive abgleichen — für „Sync all
 * from Drive" unter Admin Actions. Gleichzeitig nur hier im Server: Next.js
 * schickt Server Actions eines Clients nacheinander ab, ein `Promise.all` im
 * Browser liefe also doch seriell. Ein Fehler betrifft nur sein Objekt.
 * Hintergrund: docs/objektplaene.md, „Neu einlesen".
 */
export async function syncPlanObjekteFromDrive(refs: ObjektRef[]): Promise<DriveSyncBatchEntry[]> {
  await actionAdminRequired();
  if (!Array.isArray(refs) || refs.length > DRIVE_SYNC_MAX_BATCH) {
    throw new Error(`at most ${DRIVE_SYNC_MAX_BATCH} objects per call`);
  }
  return Promise.all(
    refs.map(async (ref): Promise<DriveSyncBatchEntry> => {
      if (!isObjektRef(ref)) {
        const id = String((ref as { id?: unknown } | null)?.id);
        return { art: 'risikoobjekt', id, result: { status: 'keinDriveLink' } };
      }
      const { art, id } = ref;
      try {
        const objekt = await loadPlanObjekt(art, id);
        if (!objekt) return { art, id, result: { status: 'keinDriveLink' } };
        const result = await runDriveSync(
          { art, id },
          objekt.link,
          driveSyncDeps(storageGroupsMetadata(objektGroups(objekt))),
        );
        return { art, id, result };
      } catch (err) {
        console.warn('Drive-Abgleich fehlgeschlagen', art, id, err);
        return { art, id, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
}

/**
 * Ablage der Vision-Ausgabe, je Dokument eindeutig. Risikoobjekte behalten
 * den bisherigen Schlüssel ohne Art.
 */
function ocrKey(art: ObjektArt, objektId: string, dokumentId: string): string {
  return art === 'risikoobjekt' ? `${objektId}_${dokumentId}` : `${art}_${objektId}_${dokumentId}`;
}
