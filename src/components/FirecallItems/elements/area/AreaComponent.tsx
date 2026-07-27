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

export default function AreaMarker({ record, selectItem, pane, onContextMenu }: AreaMarkerProps) {
  const t = useTranslations('firecallElements');
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();
  const [showMarkers, setShowMarkers] = useState(false);
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
      {(record.alwaysShowMarker === 'true' || showMarkers) &&
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
                  email
                );
              },
              // Keep the point markers visible while a point popup is open.
              // Opening a marker popup closes the polygon popup first; without
              // these handlers showMarkers would flip to false and unmount the
              // marker mid-tap, so on touch the tap fell through to the polygon
              // and its popup opened instead of the point's. React batches the
              // polygon-popupclose and this popupopen into one render.
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
                  {t('pointOfArea', {
                    number: index + 1,
                    name: record.name || '',
                  })}
                </strong>
              </div>
              <PopupNavigateButton lat={p[0]} lng={p[1]} />
              {editable && (
                <>
                  <IconButton
                    sx={{ marginLeft: 'auto', float: 'right' }}
                    onClick={() => selectItem(record)}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    sx={{ marginLeft: 'auto', float: 'right' }}
                    onClick={() =>
                      deleteFirecallPosition(firecallId, record.data(), index, email)
                    }
                  >
                    <DeleteIcon />
                  </IconButton>
                </>
              )}
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
            // nearestInsertIndex also handles clicks on the area fill (not just
            // exactly on an edge), so a new point can be added anywhere on the
            // Fläche via left-click.
            const index = nearestInsertIndex(
              positions,
              [event.latlng.lat, event.latlng.lng],
              true
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
                  addFirecallPosition(firecallId, point, record, pointIndex, email)
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
      </Polygon>
      {editable && (
        <PointContextMenu
          anchorPosition={
            pointMenu
              ? { top: pointMenu.top, left: pointMenu.left }
              : undefined
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
