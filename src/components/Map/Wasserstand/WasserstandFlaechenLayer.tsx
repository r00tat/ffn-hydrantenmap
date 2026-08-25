'use client';

import { Fragment, useMemo } from 'react';
import { Marker, Polygon } from 'react-leaflet';
import type { LatLngPosition } from '../../../common/geo';
import { parseWasserBaender } from '../../../common/terrain/wasserstand';
import type { Wasserstand } from '../../firebase/firestore';
import { leafletIcons } from '../../FirecallItems/icons';
import { bandColor } from './wasserstandFarben';

/**
 * Die Szenarien auf der schmalen Rechnerkarte.
 *
 * Bewusst **nicht** `WasserstandComponent`: das dortige Popup öffnet das
 * schwebende Panel über der Einsatzkarte, und auf der Rechnerseite steht der
 * Rechner schon daneben. Hier zählt nur: Fläche zeigen, Szenario wählen.
 */
export interface WasserstandFlaechenLayerProps {
  szenarien: Wasserstand[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export default function WasserstandFlaechenLayer({
  szenarien,
  selectedId,
  onSelect,
}: WasserstandFlaechenLayerProps) {
  // `lat`/`lng` sind an `FirecallItem` optional. Ein Szenario ohne Saatpunkt
  // hat keinen Ort und wird übersprungen, statt Leaflet ein `undefined` als
  // Koordinate zu geben.
  const prepared = useMemo(
    () =>
      szenarien
        .filter(
          (item) =>
            Number.isFinite(item.lat) && Number.isFinite(item.lng)
        )
        .map((item) => ({
          item,
          position: [item.lat as number, item.lng as number] as LatLngPosition,
          baender: parseWasserBaender(item),
        })),
    [szenarien]
  );

  return (
    <>
      {prepared.map(({ item, position, baender }) => (
        <Fragment key={item.id}>
          {baender.map((band) =>
            band.ringe.length === 0 ? null : (
              <Polygon
                key={`${item.id}-${band.tiefeM}`}
                positions={band.ringe}
                pathOptions={{
                  color: bandColor(band.tiefeM),
                  fillColor: bandColor(band.tiefeM),
                  fillOpacity:
                    ((item.opacity ?? 45) / 100) *
                    (selectedId && selectedId !== item.id ? 0.4 : 1),
                  weight: band.tiefeM === 0 ? 2 : 0,
                  fillRule: 'evenodd',
                }}
                eventHandlers={{ click: () => onSelect(item.id || '') }}
              />
            )
          )}
          <Marker
            position={position}
            icon={leafletIcons().wasserstand}
            title={item.name}
            eventHandlers={{ click: () => onSelect(item.id || '') }}
          />
        </Fragment>
      ))}
    </>
  );
}
