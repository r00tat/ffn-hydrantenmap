import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import {
  FIRECALL_MAP_LAYERS_COLLECTION_ID,
  type FirecallMapLayer,
} from '../../common/mapLayers';
import type { LagekarteSource } from '../../common/lagekarte/types';
import { firestore } from './firebase';
import {
  DrawingStroke,
  Firecall,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FIRECALL_LAYERS_COLLECTION_ID,
  FirecallItem,
  FirecallLayer,
  filterActiveItems,
} from './firestore';

/**
 * Liest alles, was der Lagekarte-Export braucht — Einsatz, Items, Ebenen und
 * die Strokes der Zeichnungen.
 *
 * `exportFirecall` aus `useExport.ts` wäre die naheliegende Quelle, lädt aber
 * alle Anhänge als Base64 herunter. Für die Lagekarte-Datei trägt das nichts
 * bei und verlangsamt den Export deutlich.
 */
export async function loadLagekarteSource(
  firecallId: string,
): Promise<Omit<LagekarteSource, 'gis'>> {
  const firecallDoc = doc(firestore, FIRECALL_COLLECTION_ID, firecallId);
  const firecallSnap = await getDoc(firecallDoc);
  if (!firecallSnap.exists()) {
    throw new Error(`Einsatz ${firecallId} nicht gefunden`);
  }
  const firecall = { ...(firecallSnap.data() as Firecall), id: firecallId };

  const [itemsSnap, layersSnap, mapLayersSnap] = await Promise.all([
    getDocs(query(collection(firecallDoc, FIRECALL_ITEMS_COLLECTION_ID))),
    getDocs(query(collection(firecallDoc, FIRECALL_LAYERS_COLLECTION_ID))),
    getDocs(
      query(collection(firecallDoc, FIRECALL_MAP_LAYERS_COLLECTION_ID))
    ),
  ]);

  const items = itemsSnap.docs
    .map((d) => ({ ...d.data(), id: d.id }) as FirecallItem)
    .filter(filterActiveItems);

  const layers = layersSnap.docs
    .map((d) => ({ ...d.data(), id: d.id }) as FirecallLayer)
    .filter(filterActiveItems);

  const mapLayers = mapLayersSnap.docs
    .map((d) => ({ ...d.data(), id: d.id }) as FirecallMapLayer)
    .filter((l) => l.deleted !== true);

  const drawings = items.filter((i) => i.type === 'drawing' && i.id);
  const strokeLists = await Promise.all(
    drawings.map(async (item) => {
      const snapshot = await getDocs(
        query(
          collection(firecallDoc, FIRECALL_ITEMS_COLLECTION_ID, item.id!, 'stroke'),
          orderBy('order', 'asc'),
        ),
      );
      const strokes = snapshot.docs.map((d) => {
        const rawStroke = d.data() as Omit<DrawingStroke, 'points'> & {
          points: number[];
        };
        // Firestore speichert die Punkte flach: [lat, lng, lat, lng, …]
        const points: number[][] = [];
        for (let i = 0; i + 1 < rawStroke.points.length; i += 2) {
          points.push([rawStroke.points[i], rawStroke.points[i + 1]]);
        }
        return { ...rawStroke, points } as DrawingStroke;
      });
      return [item.id!, strokes] as const;
    }),
  );

  return {
    firecall,
    items,
    layers,
    mapLayers,
    strokes: Object.fromEntries(strokeLists),
  };
}
