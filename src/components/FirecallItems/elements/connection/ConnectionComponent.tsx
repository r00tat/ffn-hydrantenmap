import AddIcon from '@mui/icons-material/Add';
import CircleIcon from '@mui/icons-material/Circle';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import L from 'leaflet';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Marker, Polyline, Popup } from 'react-leaflet';
import { LatLngPosition, latLngPosition } from '../../../../common/geo';
import { defaultPosition } from '../../../../hooks/constants';
import { useFirecallId } from '../../../../hooks/useFirecall';
import useFirebaseLogin from '../../../../hooks/useFirebaseLogin';
import { useMapEditable } from '../../../../hooks/useMapEditor';
import { Connection, FirecallItem } from '../../../firebase/firestore';
import type { LeafletMouseEvent } from 'leaflet';
import { leafletIcons } from '../../icons';
import { PopupNavigateButton } from '../FirecallItemBase';
import { FirecallMultiPoint } from '../FirecallMultiPoint';
import PointContextMenu from '../PointContextMenu';
import { nearestInsertIndex } from './pointGeometry';
import {
  addFirecallPosition,
  deleteFirecallPosition,
  insertedPointPosition,
  updateFirecallPositions,
} from './positions';

export interface ConnectionMarkerProps {
  record: FirecallMultiPoint;
  selectItem: (item: FirecallItem) => void;
  pane?: string;
  onContextMenu?: (item: FirecallItem, event: LeafletMouseEvent) => void;
}

export default function ConnectionMarker({
  record,
  selectItem,
  pane,
  onContextMenu,
}: ConnectionMarkerProps) {
  const t = useTranslations('firecallElements');
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();
  const [point, setPoint] = useState(defaultPosition);
  const [pointIndex, setPointIndex] = useState(-1);
  const [showMarkers, setShowMarkers] = useState(false);
  const [pointMenu, setPointMenu] = useState<{
    index: number;
    top: number;
    left: number;
  }>();
  const editable = useMapEditable();

  const positions: LatLngPosition[] = useMemo(() => {
    let p: LatLngPosition[] = [
      latLngPosition(record.lat, record.lng),
      [record.destLat, record.destLng],
    ];

    try {
      if (record.positions) {
        p = JSON.parse(record.positions);
      }
    } catch (err) {
      console.warn(`unable to parse positions ${err} ${record.positions}`);
    }
    return p;
  }, [
    record.destLat,
    record.destLng,
    record.lat,
    record.lng,
    record.positions,
  ]);

  return (
    <>
      {positions
        .filter(([pLat, pLng]) => pLat && pLng)
        .map(
          (p, index) =>
            (record.alwaysShowMarker === 'true' ||
              showMarkers ||
              index === 0 ||
              index === positions.length - 1) && (
              <Marker
                key={index}
                position={p}
                title={record.titleFn()}
                icon={leafletIcons().circle}
                draggable={editable}
                autoPan={false}
                eventHandlers={{
                  dragend: (event) => {
                    updateFirecallPositions(
                      firecallId,
                      (event.target as L.Marker)?.getLatLng(),
                      record.data(),
                      index,
                      email
                    );
                  },
                  // Keep the point markers visible while a point popup is open
                  // (see AreaComponent for the detailed rationale) so tapping a
                  // point opens the point's popup instead of the line's.
                  popupopen: () => setShowMarkers(true),
                  popupclose: () => setShowMarkers(false),
                  ...(editable
                    ? {
                        contextmenu: (event: L.LeafletMouseEvent) => {
                          event.originalEvent.preventDefault();
                          setPointMenu({
                            index,
                            top: event.originalEvent.clientY,
                            left: event.originalEvent.clientX,
                          });
                        },
                      }
                    : {}),
                }}
              >
                <Popup>
                  <div>
                    <strong>
                      {t('pointOfLine', {
                        number: index + 1,
                      })}
                    </strong>
                  </div>
                  <PopupNavigateButton lat={p[0]} lng={p[1]} />
                  {editable && (
                    <>
                      <Tooltip title={t('editLine')}>
                        <IconButton
                          sx={{ marginLeft: 'auto', float: 'right' }}
                          onClick={() => selectItem(record)}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('removePoint')}>
                        <IconButton
                          sx={{ marginLeft: 'auto', float: 'right' }}
                          onClick={() =>
                            deleteFirecallPosition(
                              firecallId,
                              record as Connection,
                              index,
                              email
                            )
                          }
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                  {record.popupFn()}
                </Popup>
              </Marker>
            )
        )}
      <Polyline
        positions={positions.filter(([pLat, pLng]) => pLat && pLng)}
        {...(pane ? { pane } : {})}
        pathOptions={{
          color: record.color || '#0000ff',
          opacity: ((record as any)?.opacity || 100.0) / 100,
        }}
        eventHandlers={{
          click: (event) => {
            // nearestInsertIndex handles clicks anywhere near the line, so a new
            // point can be added via left-click without hitting a segment exactly.
            const index = nearestInsertIndex(
              positions,
              [event.latlng.lat, event.latlng.lng],
              false
            );
            setPoint(event.latlng);
            setPointIndex(index);
          },
          // mouseover: () => setShowMarkers(true),
          // mouseout: () => setShowMarkers(false),
          popupopen: () => setShowMarkers(true),
          popupclose: () => setShowMarkers(false),
          ...(onContextMenu
            ? {
                contextmenu: (e: L.LeafletMouseEvent) => {
                  e.originalEvent.preventDefault();
                  onContextMenu(record, e);
                },
              }
            : {}),
        }}
      >
        <Popup>
          <PopupNavigateButton lat={record.lat} lng={record.lng} />
          {editable && pointIndex >= 0 && (
            <Tooltip title={t('addPointHere')}>
              <IconButton
                size="small"
                color="primary"
                aria-label={t('addPointHere')}
                onClick={() =>
                  addFirecallPosition(
                    firecallId,
                    point,
                    record as Connection,
                    pointIndex,
                    email
                  )
                }
              >
                <AddIcon fontSize="small" />
                <CircleIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Tooltip>
          )}
          {editable && (
            <IconButton
              sx={{ marginLeft: 'auto', float: 'right' }}
              onClick={() => selectItem(record)}
            >
              <EditIcon />
            </IconButton>
          )}
          {record.popupFn()}
        </Popup>
      </Polyline>
      {editable && (
        <PointContextMenu
          anchorPosition={
            pointMenu
              ? { top: pointMenu.top, left: pointMenu.left }
              : undefined
          }
          pointIndex={pointMenu?.index ?? -1}
          pointCount={positions.length}
          minPoints={2}
          onClose={() => setPointMenu(undefined)}
          onInsert={() => {
            if (!pointMenu) return;
            const pos = insertedPointPosition(positions, pointMenu.index, false);
            addFirecallPosition(
              firecallId,
              { lat: pos[0], lng: pos[1] },
              record.data(),
              pointMenu.index + 1,
              email
            );
          }}
          onDelete={() => {
            if (pointMenu) {
              deleteFirecallPosition(
                firecallId,
                record.data(),
                pointMenu.index,
                email
              );
            }
          }}
          onEdit={() => selectItem(record)}
        />
      )}
    </>
  );
}
