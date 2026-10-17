import { doc } from 'firebase/firestore';
import { setDocLocal } from '../../../../lib/firestoreClient';
import L from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  useIsItemSelected,
  useMapSelectionStore,
  useSelectionPreviewDelta,
} from '../../../Map/selection/MapSelectionContext';
import useMoveSelection from '../../../Map/selection/useMoveSelection';
import { withSelectedClass } from '../../../Map/selection/selectedIcon';

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
  /**
   * Speichert die neue Position nach dem Ziehen selbst. Ohne Angabe landet sie
   * im Element unter `call/{id}/item` — für alles, was dort nicht liegt (etwa
   * die Einsatzorte), muss der Aufrufer schreiben.
   */
  onDragEnd?: (item: FirecallItem, position: L.LatLng) => void;
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

    setDocLocal(
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

  setDocLocal(
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
  options: {
    hidePopup,
    disableClick,
    heatmapColor,
    onContextMenu,
    onDragEnd,
  } = {},
  children,
}: FirecallItemMarkerProps) {
  /**
   * Memoisiert, weil die Vorschau der Drehung diese Komponente im Takt der
   * Zeigerbewegung neu rendert: `record.icon()` baut beim Fahrzeug jedes Mal
   * eine neue SVG-Data-URL, und ein neues Icon-Objekt lässt react-leaflet
   * `setIcon` rufen — das Marker-Element würde 60-mal pro Sekunde ersetzt.
   */
  const baseIcon = useMemo(
    () => record.icon(heatmapColor),
    [record, heatmapColor]
  );
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

  /**
   * Mehrfachauswahl (docs/karte-mehrfachauswahl.md). Nur Elemente des Einsatzes
   * nehmen teil: Vorschau-Marker (`disableClick`) und Marker, die ihre Lage
   * selbst speichern (`onDragEnd`, etwa die Einsatzorte), bleiben außen vor.
   */
  const selectionStore = useMapSelectionStore();
  const takesPart =
    !!selectionStore && !!record.id && !disableClick && !onDragEnd;
  const isSelected = useIsItemSelected(takesPart ? record.id : undefined);
  const previewDelta = useSelectionPreviewDelta(record);
  const { previewMove, moveSelection } = useMoveSelection();
  const icon = useMemo(
    () => (isSelected ? withSelectedClass(baseIcon) : baseIcon),
    [isSelected, baseIcon]
  );
  /** Ausgangslage und Art des laufenden Zuges. */
  const dragRef = useRef<{ origin: L.LatLng; group: boolean }>(undefined);
  const dragFrame = useRef<number>(undefined);

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

  const shownPos = useMemo(
    () =>
      previewDelta
        ? L.latLng(
            startPos.lat + previewDelta.lat,
            startPos.lng + previewDelta.lng
          )
        : startPos,
    [startPos, previewDelta]
  );

  return (
    <>
      <RotatedMarker
        position={shownPos}
        title={record.titleFn()}
        icon={icon}
        draggable={editable && record.draggable}
        autoPan={false}
        eventHandlers={{
          ...record.eventHandlers,
          dragstart: (event) => {
            // Ist das gezogene Element Teil einer Mehrfachauswahl, geht die
            // ganze Auswahl mit.
            const state = selectionStore?.getState();
            dragRef.current = {
              origin: (event.target as L.Marker).getLatLng(),
              group:
                takesPart &&
                !!state &&
                !!record.id &&
                state.selectedIds.has(record.id) &&
                state.selectedIds.size > 1,
            };
          },
          drag: (event) => {
            const drag = dragRef.current;
            if (!drag?.group || !record.id) return;
            const moved = (event.target as L.Marker).getLatLng();
            if (dragFrame.current !== undefined) {
              cancelAnimationFrame(dragFrame.current);
            }
            const id = record.id;
            dragFrame.current = requestAnimationFrame(() => {
              dragFrame.current = undefined;
              previewMove(
                {
                  lat: moved.lat - drag.origin.lat,
                  lng: moved.lng - drag.origin.lng,
                },
                id
              );
            });
          },
          dragend: (event) => {
            const position = (event.target as L.Marker)?.getLatLng();
            setStartPos(position);
            const drag = dragRef.current;
            dragRef.current = undefined;
            if (dragFrame.current !== undefined) {
              cancelAnimationFrame(dragFrame.current);
              dragFrame.current = undefined;
            }
            if (drag?.group && record.id && position) {
              void moveSelection(
                {
                  lat: position.lat - drag.origin.lat,
                  lng: position.lng - drag.origin.lng,
                },
                record.id
              );
            } else if (onDragEnd) {
              if (position) onDragEnd(record.data(), position);
            } else {
              updateFircallItemPos(firecallId, event, record, email);
            }
          },
          ...(disableClick
            ? {}
            : {
                click: (event: L.LeafletMouseEvent) => {
                  // Umschalt-Klick (oder Tippen im Auswahlmodus) nimmt das
                  // Element in die Mehrfachauswahl auf oder heraus.
                  if (
                    editable &&
                    takesPart &&
                    record.id &&
                    (event.originalEvent?.shiftKey ||
                      selectionStore?.getState().boxMode)
                  ) {
                    selectionStore?.toggle(record.id);
                    const marker = event.target as L.Marker;
                    setTimeout(() => marker.closePopup(), 0);
                    return;
                  }
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
          position={shownPos}
          iconOptions={icon.options}
          rotation={rotationAngle}
          onPreview={handleRotationPreview}
          onCommit={handleRotationCommit}
        />
      )}
    </>
  );
}
