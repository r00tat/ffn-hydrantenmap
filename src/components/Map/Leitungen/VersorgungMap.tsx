'use client';

import Box from '@mui/material/Box';
import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import {
  LayersControl,
  MapContainer,
  ScaleControl,
  TileLayer,
  WMSTileLayer,
  useMap,
} from 'react-leaflet';
import { defaultPosition } from '../../../hooks/constants';
import type { Connection } from '../../firebase/firestore';
import { getConnectionPositions } from '../../FirecallItems/elements/connection/distance';
import { availableLayers } from '../tiles';
import LeitungenDraw from './Draw';
import VersorgungLeitungenLayer from './VersorgungLeitungenLayer';

/**
 * Die Karte der Seite „Löschwasserversorgung".
 *
 * **Nicht** die Einsatzkarte. Sie trägt Grundkarten, die Leitungen und das
 * Zeichenwerkzeug — keine Hydranten-Cluster, keine Fahrzeuge, keine
 * Wetterstationen, keine Kartenleiste. Das ist Absicht: Auf einer Rechenseite
 * ist alles andere Beiwerk, und jede Ebene mehr ist ein Firestore-Listener und
 * eine weitere Stelle, an der eine zweite Leaflet-Instanz stolpern kann.
 *
 * Wer die volle Karte braucht, hat sie eine Menüzeile weiter oben.
 */

export interface VersorgungMapProps {
  connections: Connection[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

/**
 * Rückt die Karte auf die Leitungen, sobald es welche gibt.
 *
 * Nur beim ersten Mal je Anzahl: Ein Nachrücken bei jeder Änderung riss die
 * Karte unter der Hand weg, während man einen Punkt betrachtet.
 */
function FitToConnections({ connections }: { connections: Connection[] }) {
  const map = useMap();
  const bounds = useMemo(() => {
    const points = connections.flatMap((connection) =>
      getConnectionPositions(connection).filter(
        ([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)
      )
    );
    return points.length > 0 ? L.latLngBounds(points) : undefined;
  }, [connections]);

  useEffect(() => {
    if (bounds?.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    }
    // Absichtlich nur an der Anzahl: siehe oben.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, connections.length]);

  return null;
}

export default function VersorgungMap({
  connections,
  selectedId,
  onSelect,
}: VersorgungMapProps) {
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
        <FitToConnections connections={connections} />
        <VersorgungLeitungenLayer
          connections={connections}
          selectedId={selectedId}
          onSelect={onSelect}
        />
        {/* Das Zeichenwerkzeug der Karte, unverändert: Es nimmt seinen Zustand
            aus dem `LeitungsProvider`, den die Seite über Karte und Spalte
            legt — damit kann der Knopf neben der Liste das Zeichnen starten. */}
        <LeitungenDraw />
      </MapContainer>
    </Box>
  );
}
