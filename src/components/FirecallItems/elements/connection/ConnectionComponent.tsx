import AddIcon from '@mui/icons-material/Add';
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
import {
  addFirecallPosition,
  deleteFirecallPosition,
  findSectionOnPolyline,
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
                }}
              >
                <Popup>
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
                  <br />
                  Punkt {index + 1} von {positions.length}
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
            const index = findSectionOnPolyline(positions, event.latlng);
            // console.info(
            //   `clicked on polyline ${event.latlng} index in points: ${index}`
            // );
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
            <Tooltip title={t('addPoint')}>
              <IconButton
                color="primary"
                aria-label="add a point on the line"
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
                <AddIcon />
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
    </>
  );
}
