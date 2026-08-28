'use client';

import { collection, doc } from 'firebase/firestore';
import { useCallback, useMemo } from 'react';
import {
  FirecallMapLayer,
  FIRECALL_MAP_LAYERS_COLLECTION_ID,
  normalizeMapLayer,
  sortMapLayers,
} from '../common/mapLayers';
import { firestore } from '../components/firebase/firebase';
import { FIRECALL_COLLECTION_ID } from '../components/firebase/firestore';
import { useSnackbar } from '../components/providers/SnackbarProvider';
import { addDoc, deleteDoc, setDoc } from '../lib/firestoreClient';
import { useAuditLog } from './useAuditLog';
import useFirebaseCollection from './useFirebaseCollection';
import useFirebaseLogin from './useFirebaseLogin';
import { useFirecallId } from './useFirecall';

/**
 * Die eigenen Kartenebenen eines Einsatzes, von unten nach oben gestapelt.
 *
 * Bewusst **ohne** die Historien-Pfadsegmente: eine Kartenebene ist keine
 * Lageinformation, sondern eine Einstellung der Darstellung. Beim Blick in
 * einen früheren Stand sollen dieselben Hintergrundkarten verfügbar sein wie
 * jetzt — der Stand der Lage kommt aus den Elementen, nicht aus dem WMS des
 * Nachbarbezirks.
 */
export function useFirecallMapLayers(): FirecallMapLayer[] {
  const firecallId = useFirecallId();
  const layers = useFirebaseCollection<FirecallMapLayer>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [firecallId, FIRECALL_MAP_LAYERS_COLLECTION_ID],
    filterFn: (layer) => layer.deleted !== true,
  });

  return useMemo(() => sortMapLayers(layers), [layers]);
}

export interface MapLayerActions {
  addMapLayer: (layer: Partial<FirecallMapLayer>) => Promise<void>;
  updateMapLayer: (layer: FirecallMapLayer) => Promise<void>;
  deleteMapLayer: (layer: FirecallMapLayer) => Promise<void>;
}

/**
 * Anlegen, Ändern und Löschen einer eigenen Kartenebene.
 *
 * Gelöscht wird endgültig und nicht über ein `deleted`-Flag: für Kartenebenen
 * gibt es — anders als für Einsatzelemente — keine Wiederherstellung unter
 * `/admin/deleted-items`, eine stillgelegte Ebene bliebe also für immer als
 * unerreichbares Dokument liegen. Das Audit-Log hält den Vorgang fest.
 */
export function useFirecallMapLayerActions(): MapLayerActions {
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();
  const logChange = useAuditLog();
  const showSnackbar = useSnackbar();

  const mapLayerCollection = useCallback(
    () =>
      collection(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_MAP_LAYERS_COLLECTION_ID
      ),
    [firecallId]
  );

  const reportFailure = useCallback(
    (err: unknown) => {
      console.error('Kartenebene konnte nicht gespeichert werden', err);
      showSnackbar(
        'Kartenebene konnte nicht gespeichert werden. Bitte Verbindung prüfen und erneut versuchen.',
        'error'
      );
    },
    [showSnackbar]
  );

  const addMapLayer = useCallback(
    async (layer: Partial<FirecallMapLayer>) => {
      const data = {
        ...normalizeMapLayer(layer),
        created: new Date().toISOString(),
        creator: email,
      };
      try {
        const docRef = await addDoc(mapLayerCollection(), data);
        logChange({
          action: 'create',
          elementType: 'mapLayer',
          elementId: docRef.id,
          elementName: data.name,
          newValue: data as unknown as Record<string, unknown>,
        });
      } catch (err) {
        reportFailure(err);
        throw err;
      }
    },
    [email, logChange, mapLayerCollection, reportFailure]
  );

  const updateMapLayer = useCallback(
    async (layer: FirecallMapLayer) => {
      if (!layer.id) return;
      const data = {
        ...normalizeMapLayer(layer),
        ...(layer.created ? { created: layer.created } : {}),
        ...(layer.creator ? { creator: layer.creator } : {}),
        updatedAt: new Date().toISOString(),
        updatedBy: email,
      };
      try {
        await setDoc(doc(mapLayerCollection(), layer.id), data);
        logChange({
          action: 'update',
          elementType: 'mapLayer',
          elementId: layer.id,
          elementName: data.name,
          previousValue: layer as unknown as Record<string, unknown>,
          newValue: data as unknown as Record<string, unknown>,
        });
      } catch (err) {
        reportFailure(err);
        throw err;
      }
    },
    [email, logChange, mapLayerCollection, reportFailure]
  );

  const deleteMapLayer = useCallback(
    async (layer: FirecallMapLayer) => {
      if (!layer.id) return;
      try {
        await deleteDoc(doc(mapLayerCollection(), layer.id));
        logChange({
          action: 'delete',
          elementType: 'mapLayer',
          elementId: layer.id,
          elementName: layer.name,
          previousValue: layer as unknown as Record<string, unknown>,
        });
      } catch (err) {
        reportFailure(err);
        throw err;
      }
    },
    [logChange, mapLayerCollection, reportFailure]
  );

  return { addMapLayer, updateMapLayer, deleteMapLayer };
}
