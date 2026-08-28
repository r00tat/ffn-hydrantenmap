'use client';

import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import ThreeDRotationIcon from '@mui/icons-material/ThreeDRotation';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import L from 'leaflet';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useFirecallLayers } from '../../hooks/useFirecallLayers';
import useMapEditor, { useMapEditorCanEdit } from '../../hooks/useMapEditor';
import LiveLocationFab from '../LiveLocation/LiveLocationFab';
import { useFirecallItems } from '../firebase/firestoreHooks';
import AddFirecallItem from './AddFirecallItem';
import AiAssistantButton from './AiAssistantButton';
import RecordButton from './RecordButton';
import SearchButton from './SearchButton';
import {
  equidistanceForZoom,
  HOEHENLINIEN_LAYER_NAME,
} from './layers/hoehenlinien';
import { useFirecallMapLayers } from '../../hooks/useFirecallMapLayers';
import { availableLayers, mapLayerTileConfigs } from './tiles';
import {
  isOverlayVisible,
  visibleItems,
  type OverlayStates,
} from './Gelaende3d/visibleItems';

/**
 * Dynamisch geladen: `three` und die Szene liegen damit in einem eigenen
 * Chunk. Eine gewöhnliche Kartensitzung, die die Ansicht nie öffnet, lädt
 * nichts davon.
 */
const Gelaende3dDialog = dynamic(() => import('./Gelaende3d/Gelaende3dDialog'), {
  ssr: false,
});

export interface MapActionButtonsOptions {
  map: L.Map;
}

export interface ThreeDFabPosition {
  editable: boolean;
  canEdit: boolean;
  historyId?: string;
}

/**
 * Der Abstand des 3D-Knopfs vom unteren Rand.
 *
 * Die Knöpfe der rechten Spalte setzen ihre Höhe jeweils selbst, und die
 * meisten davon gibt es nur im Bearbeiten-Modus: Suche (120), Aufzeichnung
 * (160) und Assistent (172). Ein fester Wert über dem Assistenten ließe den
 * 3D-Knopf außerhalb des Bearbeitens über einer Lücke hängen. Er rückt deshalb
 * auf das nach, was tatsächlich unter ihm steht.
 */
export function threeDFabBottom({
  editable,
  canEdit,
  historyId,
}: ThreeDFabPosition): number {
  if (editable) return 224;
  // Die Gruppe ganz unten ist leer, wenn ein Nur-Lese-Gast ohne Verlauf
  // zusieht — dann rückt der Knopf ganz nach unten.
  const hasPrimaryRow = historyId !== undefined || canEdit;
  return hasPrimaryRow ? 120 : 64;
}

export default function MapActionButtons({ map }: MapActionButtonsOptions) {
  const t = useTranslations('mapUi');
  const t3d = useTranslations('gelaende3d');
  const {
    editable,
    setEditable,
    historyId,
    selectHistory,
    openFirecallItemDialog,
  } = useMapEditor();
  const canEdit = useMapEditorCanEdit();
  const firecallItems = useFirecallItems();
  const firecallLayers = useFirecallLayers();
  const [show3d, setShow3d] = useState(false);
  const [baseLayerName, setBaseLayerName] = useState(
    Object.values(availableLayers)[0]?.name
  );
  const [overlays, setOverlays] = useState<OverlayStates>({});

  // Grundlayer und Überlagerungen stehen nur an Leaflets Layer-Steuerung. Die
  // 3D-Ansicht braucht den Grundlayer für die Textur und die Überlagerungen,
  // um dieselbe Lage zu zeigen wie die Karte — sonst wären es zwei Lagebilder.
  useEffect(() => {
    const onBaseLayer = (event: L.LayersControlEvent) =>
      setBaseLayerName(event.name);
    const onOverlay = (visible: boolean) => (event: L.LayersControlEvent) =>
      setOverlays((prev) => ({ ...prev, [event.name]: visible }));
    const onAdd = onOverlay(true);
    const onRemove = onOverlay(false);
    map.on('baselayerchange', onBaseLayer as L.LeafletEventHandlerFn);
    map.on('overlayadd', onAdd as L.LeafletEventHandlerFn);
    map.on('overlayremove', onRemove as L.LeafletEventHandlerFn);
    return () => {
      map.off('baselayerchange', onBaseLayer as L.LeafletEventHandlerFn);
      map.off('overlayadd', onAdd as L.LeafletEventHandlerFn);
      map.off('overlayremove', onRemove as L.LeafletEventHandlerFn);
    };
  }, [map]);

  const items3d = useMemo(
    () => visibleItems(firecallItems, firecallLayers, overlays),
    [firecallItems, firecallLayers, overlays]
  );

  // Die eigenen Kartenebenen gehören in die Textur der 3D-Ansicht, sonst zeigt
  // sie eine andere Lage als die Karte daneben.
  const mapLayers = useFirecallMapLayers();
  const customOverlays = useMemo(
    () => mapLayerTileConfigs(mapLayers),
    [mapLayers]
  );

  return (
    <>
      <LiveLocationFab />
      <Box
        sx={{
          // '& > :not(style)': { m: 1 },
          position: 'absolute',
          bottom: 64,
          right: 16,
        }}
      >
        {editable && (
          <Tooltip title={t('addElement')}>
            <Fab
              color="primary"
              aria-label="add"
              size="medium"
              onClick={(event) => {
                event.preventDefault();
                openFirecallItemDialog();
              }}
            >
              <AddIcon />
            </Fab>
          </Tooltip>
        )}

        {/* Ohne Schreibrecht bliebe der Umschalter wirkungslos: der Provider
            erzwingt für Nur-Lese-Gäste `editable: false`. */}
        {historyId === undefined && canEdit && (
          <Tooltip title={editable ? t('disableEdit') : t('editMap')}>
            <Fab
              color={editable ? 'default' : 'primary'}
              aria-label="edit"
              size="medium"
              style={{ marginLeft: 8 }}
              onClick={(event) => {
                event.preventDefault();
                setEditable((prev) => !prev);
              }}
            >
              {!editable && <EditIcon />}
              {editable && <VisibilityIcon />}
            </Fab>
          </Tooltip>
        )}

        {historyId && (
          <Tooltip title={t('historyLockedEdit')}>
            <Fab
              color="error"
              aria-label="edit"
              size="medium"
              style={{ marginLeft: 8 }}
              onClick={() => selectHistory()}
            >
              <HistoryIcon />
            </Fab>
          </Tooltip>
        )}
      </Box>
      {editable && (
        <>
          <RecordButton />
          <SearchButton />
        </>
      )}
      <AddFirecallItem />
      {editable && <AiAssistantButton firecallItems={firecallItems} />}

      {/* Eigener Platz über dem Assistenten und nicht in der Gruppe unten
          rechts: dort stehen die primären Funktionen — Anlegen, Bearbeiten,
          Verlauf. Die 3D-Ansicht ist eine Sicht auf die Lage, keine Arbeit an
          ihr, und ein gleich großer Knopf daneben stellte sie auf eine Stufe
          damit. */}
      <Box
        sx={{
          position: 'absolute',
          bottom: threeDFabBottom({ editable, canEdit, historyId }),
          right: 16,
        }}
      >
        <Tooltip title={t3d('open')}>
          <Fab
            color="default"
            aria-label="3d"
            size="small"
            onClick={() => setShow3d(true)}
          >
            <ThreeDRotationIcon />
          </Fab>
        </Tooltip>
      </Box>

      {show3d && (
        <Gelaende3dDialog
          open={show3d}
          onClose={() => setShow3d(false)}
          bounds={{
            south: map.getBounds().getSouth(),
            west: map.getBounds().getWest(),
            north: map.getBounds().getNorth(),
            east: map.getBounds().getEast(),
          }}
          zoom={map.getZoom()}
          baseLayerName={baseLayerName}
          overlays={overlays}
          customOverlays={customOverlays}
          items={items3d}
          equidistanceM={equidistanceForZoom(map.getZoom())}
          showContours={isOverlayVisible(
            HOEHENLINIEN_LAYER_NAME,
            overlays,
            // Standardmäßig an: in der Karte sind die Höhenlinien eine Zugabe,
            // in der 3D-Ansicht sind sie der halbe Inhalt. Wer sie in der
            // Karte ausdrücklich abschaltet, bekommt sie hier trotzdem nicht.
            true
          )}
        />
      )}
    </>
  );
}
