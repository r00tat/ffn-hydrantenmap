'use client';

import AddIcon from '@mui/icons-material/Add';
import CircleIcon from '@mui/icons-material/Circle';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import L from 'leaflet';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Marker, Polygon, Popup } from 'react-leaflet';
import { LatLngPosition, latLngPosition } from '../../../../common/geo';
import { defaultPosition } from '../../../../hooks/constants';
import { useFirecallId } from '../../../../hooks/useFirecall';
import useFirebaseLogin from '../../../../hooks/useFirebaseLogin';
import { useMapEditable } from '../../../../hooks/useMapEditor';
import { FirecallItem } from '../../../firebase/firestore';
import type { LeafletMouseEvent } from 'leaflet';
import { leafletIcons } from '../../icons';
import { PopupNavigateButton } from '../FirecallItemBase';
import { FirecallArea } from '../FirecallArea';
import PointContextMenu from '../PointContextMenu';
import { nearestInsertIndex } from '../connection/pointGeometry';
import { useStickyPointMarkers } from '../connection/useStickyPointMarkers';
import {
  addFirecallPosition,
  deleteFirecallPosition,
  insertedPointPosition,
  updateFirecallPositions,
} from '../connection/positions';

export interface AreaMarkerProps {
  record: FirecallArea;
  selectItem: (item: FirecallItem) => void;
  pane?: string;
  onContextMenu?: (item: FirecallItem, event: LeafletMouseEvent) => void;
}

export default function AreaMarker({
  record,
  selectItem,
  pane,
  onContextMenu,
}: AreaMarkerProps) {
  const t = useTranslations('firecallElements');
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();
  const stickyMarkers = useStickyPointMarkers();
  const [point, setPoint] = useState(defaultPosition);
  const [pointIndex, setPointIndex] = useState(-1);
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
      {(record.alwaysShowMarker === 'true' || stickyMarkers.visible) &&
        positions.map((p, index) => (
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
                  email,
                );
              },
              // Closing a popup no longer hides the points (see
              // useStickyPointMarkers), so a point stays put when its popup
              // opens and the polygon popup closes.
              popupopen: stickyMarkers.show,
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
                {editable && (
                  <>
                    <Tooltip title={t('editElement')}>
                      <IconButton
                        // sx={{ marginLeft: 'auto', float: 'right' }}
                        onClick={() => selectItem(record)}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('deletePoint')}>
                      <IconButton
                        // sx={{ marginLeft: 'auto', float: 'right' }}
                        onClick={() =>
                          deleteFirecallPosition(
                            firecallId,
                            record.data(),
                            index,
                            email,
                          )
                        }
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
                <PopupNavigateButton lat={p[0]} lng={p[1]} />
              </div>
              <div>
                <strong>
                  {t('pointOfArea', {
                    number: index + 1,
                  })}
                </strong>
              </div>
              {record.popupFn()}
            </Popup>
          </Marker>
        ))}
      <Polygon
        positions={positions}
        {...(pane ? { pane } : {})}
        pathOptions={{
          color: record.color || '#0000ff',
          opacity: 0.8,
          fillOpacity: ((record as any)?.opacity || 50.0) / 100,
        }}
        eventHandlers={{
          click: (event) => {
            stickyMarkers.markOwnClick(event);
            // nearestInsertIndex also handles clicks on the area fill (not just
            // exactly on an edge), so a new point can be added anywhere on the
            // Fläche via left-click.
            const index = nearestInsertIndex(
              positions,
              [event.latlng.lat, event.latlng.lng],
              true,
            );
            setPoint(event.latlng);
            setPointIndex(index);
          },
          popupopen: stickyMarkers.show,
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
          <div>
            {editable && pointIndex >= 0 && (
              <Tooltip title={t('addPointHere')}>
                <IconButton
                  color="primary"
                  aria-label={t('addPointHere')}
                  onClick={() =>
                    addFirecallPosition(
                      firecallId,
                      point,
                      record,
                      pointIndex,
                      email,
                    )
                  }
                >
                  <AddIcon fontSize="small" />
                  <CircleIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
            )}
            {editable && (
              <Tooltip title={t('editElement')}>
                <IconButton onClick={() => selectItem(record)}>
                  <EditIcon />
                </IconButton>
              </Tooltip>
            )}
            <PopupNavigateButton lat={record.lat} lng={record.lng} />
          </div>

          {record.popupFn()}
        </Popup>
      </Polygon>
      {editable && (
        <PointContextMenu
          anchorPosition={
            pointMenu ? { top: pointMenu.top, left: pointMenu.left } : undefined
          }
          pointIndex={pointMenu?.index ?? -1}
          pointCount={positions.length}
          minPoints={3}
          onClose={() => setPointMenu(undefined)}
          onInsert={() => {
            if (!pointMenu) return;
            const pos = insertedPointPosition(positions, pointMenu.index, true);
            addFirecallPosition(
              firecallId,
              { lat: pos[0], lng: pos[1] },
              record.data(),
              pointMenu.index + 1,
              email,
            );
          }}
          onDelete={() => {
            if (pointMenu) {
              deleteFirecallPosition(
                firecallId,
                record.data(),
                pointMenu.index,
                email,
              );
            }
          }}
          onEdit={() => selectItem(record)}
        />
      )}
    </>
  );
}
