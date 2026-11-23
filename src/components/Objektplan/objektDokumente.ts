'use client';

/**
 * Unterlagen eines Risikoobjekts: hochladen samt Index, auflisten, löschen
 * und die Datei für den Viewer laden. Hintergrund: docs/objektplaene.md.
 *
 * Indiziert wird im Browser des Admins, bevor die Datei hinausgeht: pdfjs
 * steckt ohnehin im Client, und die Bytes müssen so nie über Cloud Run (32 MB
 * Request-Grenze, der größte Plan hat 55 MB). Die Firestore-Regel lässt das
 * Anlegen nur mit `risikoobjekte.manage` in einer freigegebenen Gruppe zu;
 * gelöscht wird über die Server Action `deleteObjektDokumentAction`.
 */
import { collection, doc, onSnapshot } from 'firebase/firestore';
import {
  getBlob,
  getStorage,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';
import {
  isAllowedObjektDokumentType,
  OBJEKT_DOKUMENT_MAX_MB,
  objektDokumentCollectionPath,
  objektDokumentStoragePath,
  type ObjektDokument,
} from '../../common/objektplan/objektDokument';
// Bewusst die wartenden Varianten, nicht `setDocLocal`: Hochladen und Löschen
// brauchen ohnehin Netz (Storage), und der Admin soll sehen, ob es geklappt hat.
import { setDoc } from '../../lib/firestoreClient';
import { storageGroupsMetadata } from '../../common/objektplan/risikoobjektAccess';
import { describeObjektDokument } from '../../common/objektplan/describeDokument';
import app, { firestore } from '../firebase/firebase';
import { indexPdf } from './pdfPlanIndex';

const storage = getStorage(app);

export type UploadRejection = 'type' | 'size';

/** Prüft eine Datei vor dem Upload; dieselben Schranken wie `storage.rules`. */
export function checkObjektDokumentFile(file: File): UploadRejection | null {
  if (!isAllowedObjektDokumentType(file.type)) return 'type';
  if (file.size >= OBJEKT_DOKUMENT_MAX_MB * 1024 * 1024) return 'size';
  return null;
}

export interface UploadAccess {
  /** Freigabe des Objekts — wird als Metadatum an die Datei geschrieben. */
  groups: string[];
  /** Gruppe, in der der Hochladende das Recht hat; leer beim Admin. */
  gruppe?: string;
}

export async function uploadObjektDokument(
  objektId: string,
  file: File,
  createdBy: string,
  access: UploadAccess,
  onProgress?: (fraction: number) => void,
): Promise<ObjektDokument> {
  const id = uuid();
  const data = new Uint8Array(await file.arrayBuffer());
  const storagePath = objektDokumentStoragePath(objektId, id, file.name);
  const dokument = await describeObjektDokument(
    {
      id,
      name: file.name,
      contentType: file.type,
      storagePath,
      size: file.size,
      createdAt: new Date().toISOString(),
      createdBy,
      ...(access.gruppe ? { gruppe: access.gruppe } : {}),
    },
    data,
    (d) => indexPdf(d),
  );

  // Die Storage-Regel liest die Freigabe aus dem Metadatum `groups`.
  const task = uploadBytesResumable(ref(storage, storagePath), data, {
    contentType: file.type,
    customMetadata: { groups: storageGroupsMetadata(access.groups) },
  });
  task.on('state_changed', (snap) => {
    if (snap.totalBytes > 0) onProgress?.(snap.bytesTransferred / snap.totalBytes);
  });
  await task;

  await setDoc(doc(firestore, objektDokumentCollectionPath(objektId), id), dokument);
  return dokument;
}

export interface ObjektDokumenteState {
  dokumente: ObjektDokument[];
  loading: boolean;
  fromCache: boolean;
}

export function useObjektDokumente(objektId: string | undefined): ObjektDokumenteState {
  const [state, setState] = useState<ObjektDokumenteState & { objektId?: string }>({
    dokumente: [],
    loading: true,
    fromCache: false,
  });

  useEffect(() => {
    if (!objektId) return;
    return onSnapshot(
      collection(firestore, objektDokumentCollectionPath(objektId)),
      { includeMetadataChanges: true },
      (snap) => {
        const dokumente = snap.docs
          .map((d) => ({ ...(d.data() as ObjektDokument), id: d.id }))
          .sort((a, b) => a.name.localeCompare(b.name, 'de'));
        setState({ objektId, dokumente, loading: false, fromCache: snap.metadata.fromCache });
      },
      (err) => {
        console.error('Unterlagen konnten nicht geladen werden', err);
        setState({ objektId, dokumente: [], loading: false, fromCache: false });
      },
    );
  }, [objektId]);

  // Ein Wechsel des Objekts zeigt nicht kurz die Liste des vorigen.
  if (!objektId || state.objektId !== objektId) {
    return { dokumente: [], loading: !!objektId, fromCache: false };
  }
  return state;
}

/** Eigener Cache, unabhängig vom Precache des Service Workers. */
const CACHE_NAME = 'objektplaene-v1';

function cacheKey(dokument: ObjektDokument): string {
  return `${self.location.origin}/__objektplan/${encodeURIComponent(
    dokument.storagePath,
  )}?v=${dokument.sha256}`;
}

async function openCache(): Promise<Cache | undefined> {
  try {
    return typeof caches === 'undefined' ? undefined : await caches.open(CACHE_NAME);
  } catch {
    return undefined;
  }
}

/**
 * Lädt die Datei, zuerst aus dem Zwischenspeicher. Einmal geöffnete
 * Unterlagen stehen so auch ohne Netz zur Verfügung; die SHA-256 im Schlüssel
 * sorgt dafür, dass ein ersetzter Plan neu geladen wird.
 */
export async function loadObjektDokumentBlob(dokument: ObjektDokument): Promise<Blob> {
  const cache = await openCache();
  const key = cacheKey(dokument);
  try {
    const hit = await cache?.match(key);
    if (hit) return await hit.blob();
  } catch {
    // Zwischenspeicher kaputt oder gesperrt: weiter übers Netz.
  }
  const blob = await getBlob(ref(storage, dokument.storagePath));
  try {
    await cache?.put(
      key,
      new Response(blob, { headers: { 'Content-Type': dokument.contentType } }),
    );
  } catch (err) {
    console.warn('Plan nicht zwischengespeichert', err);
  }
  return blob;
}
