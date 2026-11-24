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
  type RisikoObjektInput,
  type RisikoObjektInputError,
} from '../../common/objektplan/risikoobjektAccess';
import { objektDokumentKind, wantsOcr, type ObjektDokumentIndexStatus } from '../../common/objektplan/objektDokument';
import { withOcrIndex } from '../../common/objektplan/ocrIndex';
import { isTenantGroupId } from '../../common/tenantGroups';
import { ocrStoragePdf } from '../../server/objektplan/ocrDokument';
import { reindexDeps } from '../../server/objektplan/reindexDeps';
import { reindexDokument } from '../../server/objektplan/reindexRunner';
import {
  deleteObjektDokumentCompletely,
  deleteRisikoObjektCompletely,
  loadAllRisikoObjekte,
  loadObjektDokument,
  loadObjektDokumentSummaries,
  loadRisikoObjekt,
  newRisikoObjektId,
  saveRisikoObjekt,
  writeObjektDokument,
  writeStorageGroups,
} from '../../server/objektplan/risikoobjektStore';

/**
 * Risikoobjekte anlegen und pflegen, Freigabe an Gruppen. Geprüft wird das
 * Recht `risikoobjekte.manage` in einer der freigegebenen Gruppen; der
 * globale Admin darf alles. Hintergrund: docs/objektplaene.md.
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
  objektId: string;
  objektName: string;
  dokumentId: string;
  name: string;
  indexStatus: ObjektDokumentIndexStatus;
  melder: number;
  ocr: boolean;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

function sortedGroups(groups: string[]): string[] {
  return [...new Set(groups)].sort();
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
  await saveRisikoObjekt(id, {
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
 * Link — er führt zu den Plänen und kommt nicht aus dem GIS.
 */
export async function updateRisikoObjekt(
  id: string,
  input: Partial<RisikoObjektInput>,
): Promise<RisikoObjektActionResult> {
  const session = await actionUserRequired();
  if (!ID_PATTERN.test(id)) return { ok: false, error: 'notFound' };
  const objekt = await loadRisikoObjekt(id);
  if (!objekt) return { ok: false, error: 'notFound' };
  if (!canManageRisikoObjekt(session.user, objekt)) return { ok: false, error: 'forbidden' };

  if (objekt.quelle !== 'app' && !session.user.isAdmin) {
    const checked = normalizeRisikoObjektInput({ ...objekt, link: input.link });
    if (!checked.ok) return checked;
    await saveRisikoObjekt(id, { link: checked.value.link });
    return { ok: true, id };
  }

  const checked = normalizeRisikoObjektInput(input);
  if (!checked.ok) return checked;
  await saveRisikoObjekt(id, checked.value);
  return { ok: true, id };
}

/** Nur in der App angelegte Objekte; die aus dem GIS brächte der Import zurück. */
export async function deleteRisikoObjekt(id: string): Promise<RisikoObjektActionResult> {
  const session = await actionUserRequired();
  if (!ID_PATTERN.test(id)) return { ok: false, error: 'notFound' };
  const objekt = await loadRisikoObjekt(id);
  if (!objekt) return { ok: false, error: 'notFound' };
  if (!canManageRisikoObjekt(session.user, objekt)) return { ok: false, error: 'forbidden' };
  if (objekt.quelle !== 'app') return { ok: false, error: 'notApp' };
  await deleteRisikoObjektCompletely(objekt);
  return { ok: true, id };
}

export async function setRisikoObjektGroups(
  id: string,
  groups: string[],
): Promise<RisikoObjektActionResult> {
  const session = await actionUserRequired();
  if (!ID_PATTERN.test(id) || !Array.isArray(groups)) return { ok: false, error: 'notFound' };
  const objekt = await loadRisikoObjekt(id);
  if (!objekt) return { ok: false, error: 'notFound' };
  if (!canManageRisikoObjekt(session.user, objekt)) return { ok: false, error: 'forbidden' };

  const next = sortedGroups(groups.map(String));
  const check = checkGroupsChange(session.user, objektGroups(objekt), next);
  if (check !== 'ok') return { ok: false, error: check };

  await saveRisikoObjekt(id, { groups: next });
  await writeStorageGroups(id, next);
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
  for (const objekt of await loadAllRisikoObjekte()) {
    if (objektGroups(objekt).length > 0) continue;
    await saveRisikoObjekt(objekt.id, { groups } satisfies Partial<RisikoObjekt>);
    await writeStorageGroups(objekt.id, groups);
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
  objektId: string,
  dokumentId: string,
): Promise<RisikoObjektActionResult> {
  const session = await actionUserRequired();
  if (!ID_PATTERN.test(objektId) || !ID_PATTERN.test(dokumentId)) {
    return { ok: false, error: 'notFound' };
  }
  const objekt = await loadRisikoObjekt(objektId);
  if (!objekt) return { ok: false, error: 'notFound' };
  if (!canManageRisikoObjekt(session.user, objekt)) return { ok: false, error: 'forbidden' };
  const dokument = await loadObjektDokument(objektId, dokumentId);
  if (!dokument) return { ok: false, error: 'notFound' };
  if (dokument.quelle === 'drive') return { ok: false, error: 'forbidden' };
  await deleteObjektDokumentCompletely(objektId, dokument);
  return { ok: true, id: dokumentId };
}

/**
 * Texterkennung für einen gescannten Plan (PDF ohne Textebene) oder einen
 * Plan, dessen Textebene keinen Melder enthält (siehe `wantsOcr`): nach dem
 * Upload aus dem Dialog und nachträglich für ältere Unterlagen. Einmal je
 * Dokument — `ocr` vermerkt den Versuch, auch wenn kein Text herauskam.
 */
export async function ocrObjektDokumentAction(
  objektId: string,
  dokumentId: string,
): Promise<OcrActionResult> {
  const session = await actionUserRequired();
  if (!ID_PATTERN.test(objektId) || !ID_PATTERN.test(dokumentId)) {
    return { ok: false, error: 'notFound' };
  }
  const objekt = await loadRisikoObjekt(objektId);
  if (!objekt) return { ok: false, error: 'notFound' };
  if (!canManageRisikoObjekt(session.user, objekt)) return { ok: false, error: 'forbidden' };
  const dokument = await loadObjektDokument(objektId, dokumentId);
  if (!dokument) return { ok: false, error: 'notFound' };
  if (!wantsOcr(dokument)) return { ok: false, error: 'notScan' };
  try {
    const index = await ocrStoragePdf(dokument.storagePath, `${objektId}_${dokumentId}`);
    const result = withOcrIndex(dokument, index);
    await writeObjektDokument(objektId, result);
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
  objektId: string,
  dokumentId: string,
): Promise<ReindexActionResult> {
  const session = await actionUserRequired();
  if (!ID_PATTERN.test(objektId) || !ID_PATTERN.test(dokumentId)) {
    return { ok: false, error: 'notFound' };
  }
  const objekt = await loadRisikoObjekt(objektId);
  if (!objekt) return { ok: false, error: 'notFound' };
  if (!canManageRisikoObjekt(session.user, objekt)) return { ok: false, error: 'forbidden' };
  const dokument = await loadObjektDokument(objektId, dokumentId);
  if (!dokument) return { ok: false, error: 'notFound' };
  try {
    const result = await reindexDokument(dokument, reindexDeps(`${objektId}_${dokumentId}`));
    await writeObjektDokument(objektId, result);
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
 * Alle PDFs aller Risikoobjekte für das Neu-Einlesen unter Admin Actions.
 * Die ohne Melder zuerst — bei ihnen lohnt es am ehesten.
 */
export async function listObjektDokumenteForReindex(): Promise<ReindexCandidate[]> {
  await actionAdminRequired();
  const result: ReindexCandidate[] = [];
  for (const objekt of await loadAllRisikoObjekte()) {
    for (const d of await loadObjektDokumentSummaries(objekt.id)) {
      if (objektDokumentKind(d.contentType) !== 'pdf') continue;
      result.push({
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
