'use client';

import Box from '@mui/material/Box';
import L from 'leaflet';
import { ReactNode, useEffect, useMemo } from 'react';
import {
  LayersControl,
  MapContainer,
  ScaleControl,
  TileLayer,
  WMSTileLayer,
  useMap,
} from 'react-leaflet';
import { defaultPosition } from '../../hooks/constants';
import type { MultiPointItem } from '../firebase/firestore';
import { getConnectionPositions } from '../FirecallItems/elements/connection/distance';
import LeitungenDraw from './Leitungen/Draw';
import { availableLayers } from './tiles';

/**
 * Die schmale Karte einer Rechenseite — geteilt von „Löschwasserversorgung"
 * (Leitungen) und „Dammbau" (Dammlinien).
 *
 * **Nicht** die Einsatzkarte. Sie trägt Grundkarten, das Zeichenwerkzeug und
 * das, was ihr als `children` gegeben wird — keine Hydranten-Cluster, keine
 * Fahrzeuge, keine Wetterstationen, keine Kartenleiste. Das ist Absicht: Auf
 * einer Rechenseite ist alles andere Beiwerk, und jede Ebene mehr ist ein
 * Firestore-Listener und eine weitere Stelle, an der eine zweite
 * Leaflet-Instanz stolpern kann.
 *
 * Wer die volle Karte braucht, hat sie eine Menüzeile weiter oben.
 *
 * Was gezeichnet wird, entscheidet die Seite über `children`; `items` bestimmt
 * nur, worauf die Karte anfangs rückt.
 */

export interface RechnerMapProps {
  /** Die Elemente, auf die die Karte einmal einrückt. */
  items: MultiPointItem[];
  children: ReactNode;
}

/**
 * Rückt die Karte auf die Elemente, sobald es welche gibt.
 *
 * Nur beim ersten Mal je Anzahl: Ein Nachrücken bei jeder Änderung riss die
 * Karte unter der Hand weg, während man einen Punkt betrachtet.
 */
function FitToItems({ items }: { items: MultiPointItem[] }) {
  const map = useMap();
  const bounds = useMemo(() => {
    const points = items.flatMap((item) =>
      getConnectionPositions(item).filter(
        ([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)
      )
    );
    return points.length > 0 ? L.latLngBounds(points) : undefined;
  }, [items]);

  useEffect(() => {
    if (bounds?.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    }
    // Absichtlich nur an der Anzahl: siehe oben.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, items.length]);

  return null;
}

export default function RechnerMap({ items, children }: RechnerMapProps) {
  useEffect(() => {
    delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)
      ._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: '/icons/leaflet/marker-icon-2x.png',
      iconUrl: '/icons/leaflet/marker-icon.png',
      shadowUrl: '/icons/leaflet/marker-shadow.png',
    });
  }, []);

  return (
    <Box sx={{ width: '100%', height: '100%', minHeight: 240 }}>
      <MapContainer
        center={defaultPosition}
        zoom={16}
        maxZoom={24}
        scrollWheelZoom
        style={{ width: '100%', height: '100%' }}
      >
        <LayersControl position="topright">
          {Object.entries(availableLayers).map(([key, layer], index) => (
            <LayersControl.BaseLayer
              checked={index === 0}
              name={layer.name}
              key={key}
            >
              {layer.type === 'WMS' ? (
                <WMSTileLayer
                  layers={layer.options.layers}
                  attribution={layer.options.attribution}
                  url={layer.url}
                  maxZoom={layer.options.maxZoom}
                  maxNativeZoom={layer.options.maxNativeZoom}
                  bounds={layer.options.bounds}
                  format={layer.options.format}
                  transparent={layer.options.transparent}
                />
              ) : (
                <TileLayer
                  attribution={layer.options.attribution}
                  url={layer.url}
                  maxZoom={layer.options.maxZoom}
                  maxNativeZoom={layer.options.maxNativeZoom}
                  bounds={layer.options.bounds}
                  subdomains={layer.options.subdomains}
                />
              )}
            </LayersControl.BaseLayer>
          ))}
        </LayersControl>
        <ScaleControl position="bottomright" metric imperial={false} />
        <FitToItems items={items} />
        {children}
        {/* Das Zeichenwerkzeug der Karte, unverändert: Es nimmt seinen Zustand
            aus dem `LeitungsProvider`, den die Seite über Karte und Spalte
            legt — damit kann der Knopf neben der Liste das Zeichnen starten.
            Was gezeichnet wird, steht in der Vorlage im Provider; für die
            Dammlinie ist das eine `line` statt einer `connection`. */}
        <LeitungenDraw />
      </MapContainer>
    </Box>
  );
}
