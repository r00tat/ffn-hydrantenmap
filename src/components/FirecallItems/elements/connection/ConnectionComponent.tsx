import AddIcon from '@mui/icons-material/Add';
import StraightenIcon from '@mui/icons-material/Straighten';
import FoundationIcon from '@mui/icons-material/Foundation';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
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
import useFirecallItemUpdate from '../../../../hooks/useFirecallItemUpdate';
import useFirebaseLogin from '../../../../hooks/useFirebaseLogin';
import { useMapEditable } from '../../../../hooks/useMapEditor';
import {
  Connection,
  FirecallItem,
  Line,
  MultiPointItem,
} from '../../../firebase/firestore';
import type { LeafletMouseEvent } from 'leaflet';
import { leafletIcons } from '../../icons';
import { PopupNavigateButton } from '../FirecallItemBase';
import { FirecallMultiPoint } from '../FirecallMultiPoint';
import PointContextMenu from '../PointContextMenu';
// Statisch importiert, nicht über `next/dynamic`: Ein lazy geladenes Modul
// suspendiert beim ersten Rendern, und ohne eigene Suspense-Grenze steigt die
// Suspension bis zur Route. React verwirft dann den Teilbaum samt
// `MapContainer`, der beim Wiederaufbau auf seinen DOM-Container mit der alten
// Leaflet-Instanz trifft — „Map container is being reused by another instance",
// gefolgt von einem TileLayer ohne Pane. Der Importzyklus, für den der
// dynamische Import gedacht war, ist stattdessen in `useFirecallItemUpdate`
// aufgelöst.
import LoeschwasserfoerderungPanel from '../../../Map/Leitungen/LoeschwasserfoerderungPanel';
// Aus demselben Grund statisch importiert wie das Panel darüber.
import DammbauPanel from '../../../Map/Damm/DammbauPanel';
import { foerderungView } from './foerderung/foerderung';
import HoseLengthOverlay from './HoseLengthOverlay';
import { versorgungsart } from './pendel/pendelRoute';
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
  const tf = useTranslations('loeschwasserfoerderung');
  const td = useTranslations('dammbau');
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
  /**
   * Die Punktfolge, solange ein Punkt gezogen wird.
   *
   * Nur lokal: Der Schreibvorgang bleibt bei `dragend`, ein `drag` schreibt
   * nichts. Ohne diesen Zustand stünde am Etikett schon die neue Länge, während
   * die Linie noch die alte Form zeigt — schlechter als kein Etikett.
   */
  const [dragPositions, setDragPositions] = useState<LatLngPosition[]>();
  const [foerderungOpen, setFoerderungOpen] = useState(false);
  const [dammbauOpen, setDammbauOpen] = useState(false);
  const editable = useMapEditable();
  const updateItem = useFirecallItemUpdate();
  const showLength = record.get<string>('showLength') === 'true';

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

  // Die gezeichnete Linie ist nicht immer die Reihe der Punkte: Eine Leitung mit
  // Straßen-Routing folgt dem gespeicherten Straßenverlauf. Die Punktmarker
  // bleiben dagegen an den gesetzten Punkten — sie sind über ihren Index
  // verschiebbar und löschbar.
  //
  // `record` ist bei jedem Render eine neue Instanz (siehe `FirecallElement`),
  // taugt also nicht als Abhängigkeit. Stattdessen die Felder, aus denen
  // `displayPositions()` seine Antwort bildet.
  const streetRouting = record.get<string>('streetRouting');
  const routedFor = record.get<string>('routedFor');
  const routedPositions = record.get<string>('routedPositions');
  const linePositions: LatLngPosition[] = useMemo(
    () => record.displayPositions(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [positions, streetRouting, routedFor, routedPositions]
  );

  // Die Pumpenstandorte sind berechnet und werden gezeichnet, nicht
  // gespeichert: Sie wandern damit bei jeder Änderung mit, ohne dass ungefragt
  // Elemente in der Ebene entstehen, die vielleicht schon besetzte Standorte
  // behaupten. Abgelegt werden sie auf Knopfdruck im Dialog. Nur das
  // Höhenprofil liegt am Element — siehe docs/loeschwasserfoerderung.md.
  //
  // `record` ist bei jedem Render eine neue Instanz und taugt nicht als
  // Abhängigkeit; stattdessen die Felder, aus denen sich das Ergebnis ergibt.
  const foerderung = record.get<string>('foerderung');
  const foerderungUmgekehrt = record.get<string>('foerderungUmgekehrt');
  const foerderMenge = record.get<number>('foerderMenge');
  const zielDruck = record.get<number>('zielDruck');
  const pumpenAusgangsdruck = record.get<number>('pumpenAusgangsdruck');
  const pumpenEingangsdruck = record.get<number>('pumpenEingangsdruck');
  const paralleleLeitungen = record.get<number>('paralleleLeitungen');
  const elevationFor = record.get<string>('elevationFor');
  const elevationProfileField = record.get<string>('elevationProfile');
  const mode = versorgungsart(record.data() as Connection);
  const foerderungResult = useMemo(
    () =>
      foerderung === 'true'
        ? foerderungView(record.data() as Connection)
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      positions,
      streetRouting,
      routedFor,
      routedPositions,
      foerderung,
      foerderungUmgekehrt,
      foerderMenge,
      zielDruck,
      pumpenAusgangsdruck,
      pumpenEingangsdruck,
      paralleleLeitungen,
      elevationFor,
      elevationProfileField,
    ]
  );

  // Keine zweite Linie mehr für den Pendelverkehr: Die Fahrstrecke **ist** diese
  // Leitung, mit dem Routing-Profil `drive` über alle Punkte. Siehe
  // docs/pendelverkehr.md.

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
                  // `drag` und nicht erst `dragend`: Länge und Schlauchzahl
                  // sollen beim Ziehen mitlaufen. Geschrieben wird trotzdem
                  // erst am Ende.
                  drag: (event) => {
                    const moved = (event.target as L.Marker)?.getLatLng();
                    setDragPositions(
                      positions.map((p, i) =>
                        i === index
                          ? ([moved.lat, moved.lng] as LatLngPosition)
                          : p
                      )
                    );
                  },
                  dragend: (event) => {
                    setDragPositions(undefined);
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
        positions={(dragPositions ?? linePositions).filter(
          ([pLat, pLng]) => pLat && pLng
        )}
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
          {/* Der Sandsackrechner hängt an der Linie und nicht an der Leitung:
              Eine Dammlinie führt kein Wasser. Siehe
              docs/dammbau-sandsaecke.md. */}
          {record.type === 'line' && (
            <Tooltip title={td('openCalculator')}>
              <IconButton
                sx={{ marginLeft: 'auto', float: 'right' }}
                aria-label={td('openCalculator')}
                onClick={() => setDammbauOpen(true)}
              >
                <FoundationIcon />
              </IconButton>
            </Tooltip>
          )}
          {/* Der Schalter sitzt im Popup und nicht im Rechner-Panel: Er gilt
              auch für Linien, und dort gibt es kein Panel. */}
          {editable && (
            <Tooltip
              title={
                showLength ? tf('showLengthOff') : tf('showLengthOn')
              }
            >
              <IconButton
                sx={{ marginLeft: 'auto', float: 'right' }}
                aria-label={
                  showLength ? tf('showLengthOff') : tf('showLengthOn')
                }
                color={showLength ? 'primary' : 'default'}
                onClick={() =>
                  void updateItem({
                    ...record.data(),
                    showLength: showLength ? 'false' : 'true',
                  } as MultiPointItem)
                }
              >
                <StraightenIcon />
              </IconButton>
            </Tooltip>
          )}
          {record.type === 'connection' && (
            <Tooltip title={tf('openCalculator')}>
              <IconButton
                sx={{ marginLeft: 'auto', float: 'right' }}
                aria-label={tf('openCalculator')}
                onClick={() => setFoerderungOpen(true)}
              >
                <WaterDropIcon />
              </IconButton>
            </Tooltip>
          )}
          {record.popupFn()}
        </Popup>
      </Polyline>

      {/* Beim Ziehen immer, sonst nur wenn eingeschaltet: Wer einen Punkt
          verschiebt, will die neue Länge sehen, ohne vorher einen Schalter zu
          suchen. */}
      {(showLength || dragPositions) && (
        <HoseLengthOverlay
          positions={dragPositions ?? linePositions}
          dimension={
            record.type === 'connection'
              ? record.get<string>('dimension') || 'B'
              : undefined
          }
          hoseLengthM={record.get<number>('oneHozeLength') || 20}
          color={record.color}
          fromEnd={foerderungUmgekehrt === 'true'}
          {...(pane ? { pane } : {})}
        />
      )}

      {/* Berechnet, nicht gespeichert: Die Standorte wandern mit der Leitung.
          Im reinen Pendelverkehr weichen sie — dort wird keine Leitung gelegt. */}
      {mode !== 'pendel' &&
        foerderungResult?.pumps.map((pump, index) => (
        <Marker
          key={`pumpe-${index}`}
          position={pump.position}
          icon={leafletIcons().pumpe}
          title={
            index === 0
              ? tf('sourcePump')
              : tf('pumpPopupTitle', { number: index })
          }
          {...(pane ? { pane } : {})}
        >
          <Popup>
            <div>
              <strong>
                {index === 0
                  ? tf('sourcePump')
                  : tf('pumpPopupTitle', { number: index })}
              </strong>
            </div>
            {tf('pumpPopupDistance')}: {Math.round(pump.distance)} m
            {pump.eingangsdruck !== undefined && (
              <>
                <br />
                {tf('pumpPopupInlet')}: {Math.round(pump.eingangsdruck * 10) / 10}{' '}
                bar
              </>
            )}
            <br />
            {tf('pumpPopupOutlet')}: {Math.round(pump.ausgangsdruck * 10) / 10} bar
            <br />
            <PopupNavigateButton lat={pump.position[0]} lng={pump.position[1]} />
          </Popup>
        </Marker>
        ))}

      {foerderungOpen && (
        <LoeschwasserfoerderungPanel
          item={record.data() as Connection}
          open={foerderungOpen}
          onClose={() => setFoerderungOpen(false)}
        />
      )}
      {dammbauOpen && (
        <DammbauPanel
          item={record.data() as unknown as Line}
          open={dammbauOpen}
          onClose={() => setDammbauOpen(false)}
        />
      )}
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
