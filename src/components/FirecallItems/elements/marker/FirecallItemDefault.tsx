import { doc } from 'firebase/firestore';
import { setDoc } from '../../../../lib/firestoreClient';
import L from 'leaflet';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { defaultPosition } from '../../../../hooks/constants';
import { useFirecallId } from '../../../../hooks/useFirecall';
import useFirebaseLogin from '../../../../hooks/useFirebaseLogin';
import useMapEditor from '../../../../hooks/useMapEditor';
import { RotatedMarker } from '../../../Map/markers/RotatedMarker';
import RotationHandle from '../../../Map/markers/RotationHandle';
import { normalizeRotation } from '../../../Map/markers/rotationGeometry';
import { firestore } from '../../../firebase/firebase';
import {
  DataSchemaField,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
} from '../../../firebase/firestore';
import { logAuditChange } from '../../../../hooks/useAuditLog';
import { FirecallItemBase } from '../FirecallItemBase';

export interface MarkerRenderOptions {
  /* do not show the popup */
  hidePopup?: boolean;
  /* disable click handler (used for preview markers during placement) */
  disableClick?: boolean;
  /* override marker color from heatmap computation */
  heatmapColor?: string;
  /* data schema for rendering fieldData in popup */
  dataSchema?: DataSchemaField[];
  /** Layer-level label visibility setting */
  layerShowLabels?: boolean;
  pane?: string;
  /* callback for right-click context menu */
  onContextMenu?: (item: FirecallItem, event: L.LeafletMouseEvent) => void;
}

export interface FirecallItemMarkerProps {
  record: FirecallItemBase;
  selectItem: (item: FirecallItem) => void;
  options?: MarkerRenderOptions;
  children?: React.ReactNode;
}

async function updateFircallItemPos(
  firecallId: string,
  event: L.DragEndEvent,
  fcItem: FirecallItem,
  email?: string
) {
  const newPos = (event.target as L.Marker)?.getLatLng();
  if (fcItem.id && newPos) {
    const updatePos = {
      lat: newPos.lat,
      lng: newPos.lng,
    };

    await setDoc(
      doc(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_ITEMS_COLLECTION_ID,
        fcItem.id
      ),
      updatePos,
      {
        merge: true,
      }
    );

    if (email) {
      logAuditChange(firecallId, email, {
        action: 'update',
        elementType: fcItem.type,
        elementId: fcItem.id,
        elementName: fcItem.name || '',
        previousValue: { lat: fcItem.lat, lng: fcItem.lng },
        newValue: updatePos,
      });
    }
  }
}

async function updateFirecallItemRotation(
  firecallId: string,
  fcItem: FirecallItem,
  rotation: number,
  email?: string
) {
  if (!fcItem.id) return;
  // Die Drehung liegt als String im Dokument, weil das Dialogfeld einen String
  // liefert. Gespeichert wird auf ganze Grad gerundet.
  const newRotation = String(Math.round(rotation) % 360);

  await setDoc(
    doc(
      firestore,
      FIRECALL_COLLECTION_ID,
      firecallId,
      FIRECALL_ITEMS_COLLECTION_ID,
      fcItem.id
    ),
    { rotation: newRotation },
    { merge: true }
  );

  if (email) {
    logAuditChange(firecallId, email, {
      action: 'update',
      elementType: fcItem.type,
      elementId: fcItem.id,
      elementName: fcItem.name || '',
      previousValue: { rotation: fcItem.rotation },
      newValue: { rotation: newRotation },
    });
  }
}

export function FirecallItemMarkerDefault({
  record,
  selectItem,
  options: { hidePopup, disableClick, heatmapColor, onContextMenu } = {},
  children,
}: FirecallItemMarkerProps) {
  /**
   * Memoisiert, weil die Vorschau der Drehung diese Komponente im Takt der
   * Zeigerbewegung neu rendert: `record.icon()` baut beim Fahrzeug jedes Mal
   * eine neue SVG-Data-URL, und ein neues Icon-Objekt lässt react-leaflet
   * `setIcon` rufen — das Marker-Element würde 60-mal pro Sekunde ersetzt.
   */
  const icon = useMemo(() => record.icon(heatmapColor), [record, heatmapColor]);
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();
  const [startPos, setStartPos] = useState<L.LatLng>(
    L.latLng(
      record.lat || defaultPosition.lat,
      record.lng || defaultPosition.lng
    )
  );
  const { editable, selectFirecallItem, selectedFirecallItem } =
    useMapEditor();

  useEffect(() => {
    if (record.lat && record.lng) {
      (async () => {
        setStartPos(L.latLng(record.lat, record.lng));
      })();
    }
  }, [record.lat, record.lng]);

  /**
   * Die gezogene beziehungsweise gerade gespeicherte Drehung, zusammen mit dem
   * Wert, den das Dokument zu Beginn des Zuges führte.
   *
   * Sie gilt nur so lange, wie `record.rotation` noch diesen Ausgangswert
   * zeigt. Damit ist die Lücke zwischen Schreibvorgang und Firestore-Abo
   * überbrückt — ohne sie springt der Marker nach dem Loslassen kurz auf die
   * alte Drehung zurück. Führt das Dokument einen anderen Wert, ist der
   * Schreibvorgang angekommen oder die Drehung wurde woanders geändert: dann
   * gilt wieder das Dokument. Deshalb wird hier nichts zurückgesetzt, sondern
   * beim Rendern verglichen.
   */
  const [pendingRotation, setPendingRotation] = useState<{
    angle: number;
    from: number;
  }>();
  const savedRotation = normalizeRotation(record.rotation);
  const rotationAngle =
    pendingRotation && pendingRotation.from === savedRotation
      ? pendingRotation.angle
      : savedRotation;

  // Während des Zuges wird nicht geschrieben, `savedRotation` steht also still
  // und ist der richtige Ausgangswert.
  const handleRotationPreview = useCallback(
    (degrees: number) => {
      setPendingRotation({ angle: degrees, from: savedRotation });
    },
    [savedRotation]
  );

  const handleRotationCommit = useCallback(
    (degrees: number) => {
      const rounded = Math.round(degrees) % 360;
      setPendingRotation({ angle: rounded, from: savedRotation });
      updateFirecallItemRotation(firecallId, record, rounded, email).catch(
        (err) => {
          console.error('failed to save rotation', err);
          setPendingRotation(undefined);
        }
      );
    },
    [firecallId, record, email, savedRotation]
  );

  /**
   * `!!record.id` ist kein Zierrat: die Vorschau-Marker beim Platzieren
   * (`AddFirecallItem`) haben keine id, und `undefined === undefined` wäre
   * wahr — der Griff hinge am Vorschau-Element.
   */
  const showRotationHandle =
    editable &&
    record.isRotatable() &&
    !!record.id &&
    selectedFirecallItem?.id === record.id;

  return (
    <>
      <RotatedMarker
        position={startPos}
        title={record.titleFn()}
        icon={icon}
        draggable={editable && record.draggable}
        autoPan={false}
        eventHandlers={{
          ...record.eventHandlers,
          dragend: (event) => {
            setStartPos((event.target as L.Marker)?.getLatLng());
            updateFircallItemPos(firecallId, event, record, email);
          },
          ...(disableClick
            ? {}
            : {
                click: () => {
                  selectFirecallItem(record);
                },
              }),
          ...(onContextMenu
            ? {
                contextmenu: (e: L.LeafletMouseEvent) => {
                  e.originalEvent.preventDefault();
                  onContextMenu(record, e);
                },
              }
            : {}),
        }}
        rotationAngle={rotationAngle}
        rotationOrigin="center"
      >
        {!hidePopup && record.renderPopup(selectItem)}
        {children}
      </RotatedMarker>
      {showRotationHandle && (
        <RotationHandle
          position={startPos}
          iconOptions={icon.options}
          rotation={rotationAngle}
          onPreview={handleRotationPreview}
          onCommit={handleRotationCommit}
        />
      )}
    </>
  );
}
