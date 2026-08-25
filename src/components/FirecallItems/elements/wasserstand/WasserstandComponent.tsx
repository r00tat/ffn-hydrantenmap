'use client';

import WaterDropIcon from '@mui/icons-material/WaterDrop';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import L from 'leaflet';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Marker, Polygon, Popup } from 'react-leaflet';
import type { LatLngPosition } from '../../../../common/geo';
import { terrainClient } from '../../../../common/terrain/terrainClient';
import {
  parseWasserBaender,
  wasserstandLevelM,
  wasserstandStale,
} from '../../../../common/terrain/wasserstand';
import { defaultPosition } from '../../../../hooks/constants';
import useFirecallItemUpdate from '../../../../hooks/useFirecallItemUpdate';
import { useMapEditable } from '../../../../hooks/useMapEditor';
import { FirecallItem } from '../../../firebase/firestore';
import {
  BAND_LABEL_KEYS,
  bandColor,
  bandForDepth,
} from '../../../Map/Wasserstand/wasserstandFarben';
import {
  istFrischAngelegt,
  vergissFrischAngelegt,
  wasserstandBasis,
} from '../../../Map/Wasserstand/wasserstandAnlegen';
import WasserstandPanel from '../../../Map/Wasserstand/WasserstandPanel';
import { leafletIcons } from '../../icons';
import { FirecallItemPopup } from '../FirecallItemBase';
import type { FirecallWasserstand } from '../FirecallWasserstand';

/**
 * Ein Wasserausbreitungs-Szenario: Marker am Saatpunkt, dazu die
 * gespeicherten Tiefenstufen als Polygone.
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
  /**
   * `pane` **nur setzen, wenn es eines gibt.**
   *
   * `L.setOptions` kopiert jede eigene Eigenschaft, auch eine mit dem Wert
   * `undefined` — ein `pane={undefined}` überschreibt damit die Vorbelegung
   * (`markerPane` bzw. `overlayPane`) und `map.getPane(undefined)` gibt
   * `undefined` zurück. Leaflet stirbt dann in `appendChild`. Getroffen hat es
   * die Vorschau beim Setzen des Punktes, die ohne `pane` zeichnet.
   */
  const paneProps = pane ? { pane } : {};
  const t = useTranslations('wasserstand');
  const editable = useMapEditable();
  const updateItem = useFirecallItemUpdate();
  /**
   * Gerade angelegt heißt: Rechner auf und rechnen.
   *
   * Ohne das muss man den eben gesetzten Marker erst anklicken und dann im
   * Popup das Symbol treffen — drei Klicks für etwas, das man mit dem Setzen
   * des Punktes schon verlangt hat.
   *
   * Die Frage steckt im **Anfangswert** eines Zustands und nicht in einem
   * Effekt: ein `setState` im Effekt löst eine zweite Renderrunde aus. Sie
   * verbraucht dabei nichts — abgeräumt wird unten im Effekt, damit ein
   * doppelt aufgerufenes Rendern zweimal dieselbe Antwort bekommt.
   */
  const [frisch] = useState(() => istFrischAngelegt(record.id));
  const [panelOpen, setPanelOpen] = useState(frisch);
  const [depth, setDepth] = useState<number>();

  useEffect(() => {
    if (record.id) vergissFrischAngelegt(record.id);
  }, [record.id]);

  const item = useMemo(() => record.data(), [record]);
  /**
   * Beim Setzen eines neuen Elements zeichnet `AddFirecallItem` eine Vorschau,
   * die noch keine Koordinaten trägt. Derselbe Rückfall wie im Standardmarker
   * (`FirecallItemDefault`) — ohne ihn bekäme Leaflet `undefined` als
   * Koordinate.
   */
  const position: LatLngPosition = [
    record.lat ?? defaultPosition.lat,
    record.lng ?? defaultPosition.lng,
  ];
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
            {...paneProps}
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
              {/* Die Stufe kommt aus der **gemessenen** Tiefe, wenn eine
                  vorliegt, und nur sonst aus dem angeklickten Polygon.
                  Andernfalls widersprechen sich die beiden Zeilen: die
                  Polygone sind ausgedünnt und kleine Ringe der tieferen
                  Stufen fallen weg, der angeklickte Ring ist dann der einer
                  flacheren Stufe als die Tiefe an der Stelle.

                  Der Schlüssel kommt aus der Tabelle und wird **nicht**
                  zusammengesetzt: next-intl typisiert die Schlüssel statisch,
                  ein zusammengesetzter ist damit kein Schlüssel. Dieselbe
                  Regel wie bei den Bauweisen im Sandsackrechner. */}
              {t(
                BAND_LABEL_KEYS[
                  (depth !== undefined ? bandForDepth(depth)?.tiefeM : undefined) ??
                    band.tiefeM
                ] as 'band0'
              )}
              {depth !== undefined && bandForDepth(depth) !== undefined && (
                <>
                  <br />
                  {t('exactDepth', { value: depth.toFixed(2) })}
                </>
              )}
            </Popup>
          </Polygon>
        )
      )}

      <Marker
        position={position}
        icon={leafletIcons().wasserstand}
        title={record.titleFn()}
        {...paneProps}
        draggable={editable}
        autoPan={false}
        eventHandlers={{
          ...record.eventHandlers,
          // Verschieben ändert die Basishöhe. Neu abgetastet und geschrieben
          // wird sie hier; das Ergebnis gilt damit als veraltet (die Signatur
          // trägt die Basishöhe) und wird als solches gekennzeichnet — nicht
          // stillschweigend nachgerechnet.
          dragend: async (event) => {
            const moved = (event.target as L.Marker).getLatLng();
            const basis = await wasserstandBasis([moved.lat, moved.lng]);
            await updateItem({
              ...item,
              lat: moved.lat,
              lng: moved.lng,
              ...(basis ?? {}),
            });
          },
        }}
      >
        {/* `FirecallItemPopup` und nicht ein blankes `Popup`: daran hängt der
            Bearbeiten-Knopf, und über den Dialog wird auch gelöscht. Ohne ihn
            war das Element weder zu bearbeiten noch zu löschen. */}
        <FirecallItemPopup
          onClick={() => selectItem(item)}
          lat={position[0]}
          lng={position[1]}
        >
          <Tooltip title={t('openPanel')}>
            <IconButton
              sx={{ marginLeft: 'auto', float: 'right' }}
              onClick={() => setPanelOpen(true)}
            >
              <WaterDropIcon />
            </IconButton>
          </Tooltip>
          <b>{record.name || t('layerName')}</b>
          <br />
          {record.info()}
          {stale && (
            <>
              <br />
              <i>{t('staleShort')}</i>
            </>
          )}
        </FirecallItemPopup>
      </Marker>

      <WasserstandPanel
        item={item}
        open={panelOpen}
        autoStart={frisch}
        onClose={() => setPanelOpen(false)}
      />
    </>
  );
}
