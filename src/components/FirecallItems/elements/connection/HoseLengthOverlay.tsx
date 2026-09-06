'use client';

import { memo, useState } from 'react';
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

/**
 * Dieselbe Schranke für die Einteilung, die **ungefragt** erscheint — also
 * überall dort, wo kein Etikett angefordert wurde.
 *
 * An einer fertig gezeichneten Leitung steht die Einteilung da, ohne dass sie
 * jemand eingeschaltet hat (siehe `ConnectionComponent`). Was man selbst
 * anfordert, darf eng werden — was von allein kommt, muss auf den ersten Blick
 * als Reihe einzelner Kupplungen lesbar sein und nicht als schraffiertes Band.
 *
 * 12 px gegen 3 px Strichstärke: Die Lücke ist viermal so breit wie der Strich.
 * Ein 20-m-B-Schlauch erreicht das ab etwa Zoom 16 — dem Maßstab, in dem man
 * ohnehin die Straße vor sich hat.
 */
const AUTO_MIN_TICK_SPACING_PX = 12;

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
  /**
   * Das Etikett „1240 m · 62 × B" zeichnen.
   *
   * Getrennt von den Querstrichen, weil die Einteilung an jeder Leitung von
   * selbst erscheinen soll, ein dauerhaftes Etikett an jeder aber nicht: Auf
   * einer Karte mit fünf Leitungen sind fünf Etiketten Beschriftungssalat, die
   * Kupplungen dagegen sind die Linie selbst.
   */
  label?: boolean;
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
/**
 * `memo`, weil das Overlay seit der ungefragten Einteilung an **jeder** Leitung
 * hängt: Die Elementliste baut bei jedem Firestore-Schnappschuss neue
 * `record`-Instanzen, und ohne die Sperre rechnete jede Leitung dabei Länge und
 * Kupplungsgrenzen neu, obwohl sich an ihr nichts geändert hat. Alle Angaben
 * sind einfache Werte oder schon gemerkte Punktfolgen, der Vergleich also
 * belastbar.
 */
function HoseLengthOverlay({
  positions,
  dimension,
  hoseLengthM = 20,
  color,
  fromEnd,
  label = true,
  pane,
}: HoseLengthOverlayProps) {
  const map = useMap();
  // Der Maßstab hängt am Zoom; ohne dieses Nachziehen behielten die Striche
  // ihre Meterlänge und wüchsen beim Hineinzoomen zu Querstraßen.
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvent('zoomend', () => setZoom(map.getZoom()));
  // Und am Ausschnitt, seit die Striche nur noch im Sichtfeld entstehen.
  const [, setMoved] = useState(0);
  useMapEvent('moveend', () => setMoved((count) => count + 1));

  const clean = positions.filter(([lat, lng]) => lat && lng);
  if (clean.length < 2) return null;

  const distance = calculateDistance(clean);
  if (distance <= 0) return null;

  // Der sichtbare Ausschnitt mit Rand.
  const visible = map.getBounds().pad(0.5);

  // Meter je Bildschirmpixel an der aktuellen Stelle. Über die Karte gerechnet
  // statt über eine Zoomformel: Das trifft auch abseits des Äquators.
  const metresPerPixel =
    map.distance(
      map.containerPointToLatLng([0, 0]),
      map.containerPointToLatLng([100, 0])
    ) / 100;

  // Angefordert darf die Einteilung eng werden, ungefragt nicht — die Schranke
  // folgt daher aus dem Etikett und ist kein zweiter Schalter. Zwei Regler für
  // eine Entscheidung ließen sich gegeneinander stellen: enge Striche ohne
  // Etikett wären genau das schraffierte Band, gegen das die strengere Schranke
  // eingeführt wurde.
  const minTickSpacingPx = label ? MIN_TICK_SPACING_PX : AUTO_MIN_TICK_SPACING_PX;

  const showTicks =
    Boolean(dimension) &&
    hoseLengthM > 0 &&
    metresPerPixel > 0 &&
    hoseLengthM / metresPerPixel >= minTickSpacingPx;

  const ticks = showTicks
    ? hoseBoundaryTicks(
        clean,
        hoseLengthM,
        TICK_HALF_PX * metresPerPixel,
        fromEnd
      )
        // Die Nummer der Kupplung wird mitgeführt, **bevor** gefiltert wird:
        // Sie ist der Schlüssel der Striche. Der Platz in der gefilterten Liste
        // taugt nicht dafür — er verschiebt sich bei jedem Schieben der Karte
        // um eins, und React zeichnete dann jeden sichtbaren Strich neu, statt
        // an den Rändern einen hinzuzunehmen und einen wegzulassen.
        .map((tick, index) => ({ tick, index }))
        // Nur, was im Ausschnitt liegt: Eine 10-km-Leitung hat bei Zoom 17
        // fünfhundert Grenzen, von denen keine fünfzig zu sehen sind. Seit die
        // Einteilung an *jeder* Leitung von selbst erscheint, ist das der
        // Unterschied zwischen einer Karte, die sich schieben lässt, und einer,
        // die ruckelt. Der Rand ist großzügig, damit beim Schieben nicht erst
        // nachwächst, was schon sichtbar sein müsste.
        .filter(
          ({ tick: [from, to] }) =>
            visible.contains(from) || visible.contains(to)
        )
    : [];

  const stroke = color || '#0000ff';

  return (
    <>
      {ticks.map(({ tick, index }) => (
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
      {label && (
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
      )}
    </>
  );
}

export default memo(HoseLengthOverlay);
