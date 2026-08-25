'use client';

import WaterDropIcon from '@mui/icons-material/WaterDrop';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import L from 'leaflet';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Marker, Polygon, Popup } from 'react-leaflet';
import { terrainClient } from '../../../../common/terrain/terrainClient';
import {
  parseWasserBaender,
  wasserstandLevelM,
  wasserstandStale,
} from '../../../../common/terrain/wasserstand';
import useFirecallItemUpdate from '../../../../hooks/useFirecallItemUpdate';
import { useMapEditable } from '../../../../hooks/useMapEditor';
import { FirecallItem } from '../../../firebase/firestore';
import {
  BAND_LABEL_KEYS,
  bandColor,
  bandForDepth,
} from '../../../Map/Wasserstand/wasserstandFarben';
import WasserstandPanel from '../../../Map/Wasserstand/WasserstandPanel';
import { leafletIcons } from '../../icons';
import { PopupNavigateButton } from '../FirecallItemBase';
import type { FirecallWasserstand } from '../FirecallWasserstand';

/**
 * Ein Wasserstands-Szenario: Marker am Saatpunkt, dazu die gespeicherten
 * Tiefenstufen als Polygone.
 *
 * **Je Band ein Polygon mit allen seinen Ringen und `fillRule: 'evenodd'`.**
 * Damit sind trockene Inseln — Gebäude, Anhöhen — von selbst Löcher, ohne die
 * Ringe in Außen und Innen zu sortieren. Das ist keine Bequemlichkeit:
 * `chainSegments` verkettet ab einem beliebigen Segment und in beide
 * Richtungen, die Umlaufrichtung ist also nicht garantiert und als Kriterium
 * für „innen" nicht zu gebrauchen. Der Wert wird ausdrücklich gesetzt und
 * nicht der Leaflet-Vorbelegung überlassen.
 *
 * Gezeichnet wird über den normalen Element-Weg und **nicht** als eigenes
 * Canvas-Overlay: nur so liegt das Szenario im Einsatz-Layer und ist mit ihm
 * ein- und ausblendbar.
 */

export interface WasserstandComponentProps {
  record: FirecallWasserstand;
  selectItem: (item: FirecallItem) => void;
  pane?: string;
}

export default function WasserstandComponent({
  record,
  selectItem,
  pane,
}: WasserstandComponentProps) {
  const t = useTranslations('wasserstand');
  const editable = useMapEditable();
  const updateItem = useFirecallItemUpdate();
  const [panelOpen, setPanelOpen] = useState(false);
  const [depth, setDepth] = useState<number>();

  const item = useMemo(() => record.data(), [record]);
  const baender = useMemo(() => parseWasserBaender(item), [item]);
  const levelM = wasserstandLevelM(item);
  const stale = wasserstandStale(item);
  const opacity = (record.opacity ?? 45) / 100;

  /**
   * Die genaue Tiefe am angeklickten Punkt, aus einer **einzelnen**
   * Höhenabfrage. Schlägt sie fehl — offline, keine Kachel —, bleibt die Stufe
   * aus dem Polygon stehen; das ist mehr als „keine Angabe".
   */
  const readDepth = async (lat: number, lng: number) => {
    if (levelM === undefined) return;
    try {
      const [sample] = await terrainClient().sample([[lat, lng]]);
      setDepth(sample ? levelM - sample.heightM : undefined);
    } catch {
      setDepth(undefined);
    }
  };

  return (
    <>
      {baender.map((band) =>
        band.ringe.length === 0 ? null : (
          <Polygon
            key={`band-${band.tiefeM}`}
            positions={band.ringe}
            pane={pane}
            pathOptions={{
              color: bandColor(band.tiefeM),
              fillColor: bandColor(band.tiefeM),
              fillOpacity: opacity,
              weight: band.tiefeM === 0 ? 2 : 0,
              // Siehe oben: ohne evenodd wären Inseln keine Löcher.
              fillRule: 'evenodd',
            }}
            eventHandlers={{
              click: (event) => {
                setDepth(undefined);
                void readDepth(event.latlng.lat, event.latlng.lng);
              },
            }}
          >
            <Popup>
              <b>{t('bandPopupTitle', { name: record.name || '' })}</b>
              <br />
              {/* Der Schlüssel kommt aus der Tabelle und wird **nicht**
                  zusammengesetzt: next-intl typisiert die Schlüssel statisch,
                  ein zusammengesetzter ist damit kein Schlüssel. Dieselbe
                  Regel wie bei den Bauweisen im Sandsackrechner. */}
              {t(BAND_LABEL_KEYS[band.tiefeM] as 'band0')}
              <br />
              {depth !== undefined &&
                bandForDepth(depth) !== undefined &&
                t('exactDepth', { value: depth.toFixed(2) })}
            </Popup>
          </Polygon>
        )
      )}

      <Marker
        position={[record.lat, record.lng]}
        icon={leafletIcons().wasserstand}
        title={record.titleFn()}
        pane={pane}
        draggable={editable}
        autoPan={false}
        eventHandlers={{
          ...record.eventHandlers,
          // Verschieben ändert die Basishöhe. Neu abgetastet und geschrieben
          // wird sie hier; das Ergebnis gilt damit als veraltet (die Signatur
          // trägt die Basishöhe) und wird als solches gekennzeichnet — nicht
          // stillschweigend nachgerechnet.
          dragend: async (event) => {
            const position = (event.target as L.Marker).getLatLng();
            let basis: { heightM: number; level: string } | undefined;
            try {
              const [sample] = await terrainClient().sample([
                [position.lat, position.lng],
              ]);
              if (sample) {
                basis = { heightM: sample.heightM, level: sample.level };
              }
            } catch {
              basis = undefined;
            }
            await updateItem({
              ...item,
              lat: position.lat,
              lng: position.lng,
              ...(basis
                ? {
                    wasserBasisHoehe: basis.heightM,
                    wasserBasisStufe: basis.level,
                  }
                : {}),
            });
          },
        }}
      >
        <Popup>
          <PopupNavigateButton lat={record.lat} lng={record.lng} />
          <Tooltip title={t('openPanel')}>
            <IconButton
              sx={{ marginLeft: 'auto', float: 'right' }}
              onClick={() => setPanelOpen(true)}
            >
              <WaterDropIcon />
            </IconButton>
          </Tooltip>
          <b onDoubleClick={() => selectItem(item)}>
            {record.name || t('layerName')}
          </b>
          <br />
          {record.info()}
          {stale && (
            <>
              <br />
              <i>{t('staleShort')}</i>
            </>
          )}
        </Popup>
      </Marker>

      <WasserstandPanel
        item={item}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
      />
    </>
  );
}
