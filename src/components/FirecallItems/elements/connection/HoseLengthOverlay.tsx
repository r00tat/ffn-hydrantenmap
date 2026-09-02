'use client';

import { useState } from 'react';
import { CircleMarker, Polyline, Tooltip, useMap, useMapEvent } from 'react-leaflet';
import type { LatLngPosition } from '../../../../common/geo';
import { calculateDistance } from './distance';
import {
  hoseBoundaryTicks,
  hoseLabel,
  longestSegmentMidpoint,
} from '../../../../common/waterSupply';

/** Zielgröße eines Querstrichs auf dem Bildschirm. */
const TICK_HALF_PX = 8;

/**
 * Ab dieser Dichte werden die Striche weggelassen.
 *
 * 62 Striche im Abstand von 3 px sind ein Schmierstreifen und keine Auskunft;
 * zugleich ist das die Schranke gegen mehrere hundert Vektoren, wenn eine
 * 10-km-Leitung ganz aus der Karte gezoomt wird.
 */
const MIN_TICK_SPACING_PX = 6;

export interface HoseLengthOverlayProps {
  positions: LatLngPosition[];
  /**
   * Die Dimension der Leitung. Fehlt sie, nennt das Etikett nur die Länge —
   * eine Dammlinie hat keine Schläuche.
   */
  dimension?: string;
  hoseLengthM?: number;
  color?: string;
  /**
   * Von hinten zählen. Schläuche werden von der Entnahmestelle weg verlegt;
   * liegt sie bei umgekehrter Förderrichtung am letzten Punkt, hinge der kurze
   * Restschlauch sonst am falschen Ende.
   */
  fromEnd?: boolean;
  pane?: string;
}

/**
 * Länge und Schlaucheinteilung an einer Linie: ein Etikett am längsten
 * Teilstück und ein Querstrich je Schlauchgrenze.
 *
 * Berechnet und gezeichnet, **nicht gespeichert** — dasselbe Muster wie die
 * Pumpenstandorte. Damit wandert die Einteilung bei jeder Änderung mit, ohne
 * dass ungefragt Elemente entstehen.
 */
export default function HoseLengthOverlay({
  positions,
  dimension,
  hoseLengthM = 20,
  color,
  fromEnd,
  pane,
}: HoseLengthOverlayProps) {
  const map = useMap();
  // Der Maßstab hängt am Zoom; ohne dieses Nachziehen behielten die Striche
  // ihre Meterlänge und wüchsen beim Hineinzoomen zu Querstraßen.
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvent('zoomend', () => setZoom(map.getZoom()));

  const clean = positions.filter(([lat, lng]) => lat && lng);
  if (clean.length < 2) return null;

  const distance = calculateDistance(clean);
  if (distance <= 0) return null;

  // Meter je Bildschirmpixel an der aktuellen Stelle. Über die Karte gerechnet
  // statt über eine Zoomformel: Das trifft auch abseits des Äquators.
  const metresPerPixel =
    map.distance(
      map.containerPointToLatLng([0, 0]),
      map.containerPointToLatLng([100, 0])
    ) / 100;

  const showTicks =
    Boolean(dimension) &&
    hoseLengthM > 0 &&
    metresPerPixel > 0 &&
    hoseLengthM / metresPerPixel >= MIN_TICK_SPACING_PX;

  const ticks = showTicks
    ? hoseBoundaryTicks(
        clean,
        hoseLengthM,
        TICK_HALF_PX * metresPerPixel,
        fromEnd
      )
    : [];

  const stroke = color || '#0000ff';

  return (
    <>
      {ticks.map((tick, index) => (
        <Polyline
          key={`tick-${index}`}
          positions={tick}
          {...(pane ? { pane } : {})}
          pathOptions={{
            color: stroke,
            weight: 3,
            // Nicht anklickbar: Die Striche sind Beschriftung, und ein Treffer
            // auf ihnen fügte sonst statt eines Punktes nichts hinzu.
            interactive: false,
          }}
        />
      ))}
      {/* Unsichtbarer Träger, weil ein Tooltip an einem Layer hängen muss und
          hier nur seine Beschriftung erwünscht ist. */}
      <CircleMarker
        center={longestSegmentMidpoint(clean)}
        radius={1}
        {...(pane ? { pane } : {})}
        pathOptions={{ opacity: 0, fillOpacity: 0, interactive: false }}
      >
        <Tooltip permanent direction="center" offset={[0, 0]}>
          {hoseLabel(distance, dimension, hoseLengthM)}
        </Tooltip>
      </CircleMarker>
    </>
  );
}
