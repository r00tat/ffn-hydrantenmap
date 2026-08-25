'use client';

import L from 'leaflet';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Marker, useMap } from 'react-leaflet';
import { attachRotationDrag, RotationDragOptions } from './rotationDrag';
import { PivotIconOptions, rotationPivotOffset } from './rotationGeometry';

/** Rasterung, solange Shift gedrückt ist. */
const SNAP_DEGREES = 15;

export interface RotationHandleProps {
  /** Position des gedrehten Elements. */
  position: L.LatLng;
  /** Icon-Optionen des Elements — daraus folgt das Drehzentrum. */
  iconOptions: PivotIconOptions;
  /** Aktuell dargestellter Winkel in Grad. */
  rotation: number;
  onPreview: (degrees: number) => void;
  onCommit: (degrees: number) => void;
}

export default function RotationHandle({
  position,
  iconOptions,
  rotation,
  onPreview,
  onCommit,
}: RotationHandleProps) {
  const t = useTranslations('mapUi');
  const title = t('rotateHandle');
  const map = useMap();
  const [marker, setMarker] = useState<L.Marker | null>(null);
  const labelRef = useRef<HTMLElement | null>(null);
  const { x: pivotX, y: pivotY } = rotationPivotOffset(iconOptions);

  /**
   * Das Icon hängt nur an der Geometrie, nicht am Winkel: ein neues Icon würde
   * Leaflet das DOM-Element neu bauen lassen und mitten im Zug die Listener
   * abreißen. Gedreht wird darum unten per `style.transform`.
   */
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'ffn-rotate-handle',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        html:
          `<div class="ffn-rotate-pivot" style="left:${pivotX}px;top:${pivotY}px">` +
          `<div class="ffn-rotate-line"></div>` +
          `<div class="ffn-rotate-knob"></div>` +
          `</div>` +
          `<div class="ffn-rotate-label" style="left:${pivotX + 14}px;top:${pivotY + 30}px"></div>`,
      }),
    [pivotX, pivotY]
  );

  const handlePreview = useCallback(
    (degrees: number) => {
      if (labelRef.current) {
        labelRef.current.textContent = `${Math.round(degrees)}°`;
      }
      onPreview(degrees);
    },
    [onPreview]
  );

  const handleCommit = useCallback(
    (degrees: number) => {
      if (labelRef.current) labelRef.current.textContent = '';
      onCommit(degrees);
    },
    [onCommit]
  );

  /**
   * Die Optionen des Ziehens liegen in einer Ref, die nach jedem Rendern
   * nachgezogen wird. So hängen die Listener genau einmal und rechnen doch
   * immer mit der aktuellen Position — würden sie an jeder Änderung neu
   * gehängt, riss jeder Rendervorgang während des Zuges den Zug ab.
   */
  const options: RotationDragOptions = {
    map,
    position,
    iconOptions,
    snapDegrees: SNAP_DEGREES,
    onPreview: handlePreview,
    onCommit: handleCommit,
  };
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // Winkel anwenden: beim Aufbau und bei jeder Änderung, auch während des
  // Ziehens (die Vorschau des Elternteils kommt als `rotation` zurück).
  useEffect(() => {
    const pivot = marker
      ?.getElement()
      ?.querySelector<HTMLElement>('.ffn-rotate-pivot');
    if (pivot) pivot.style.transform = `rotate(${rotation}deg)`;
  }, [marker, icon, rotation]);

  // Ziehen anhängen — nur an `marker` und `icon`, weil Leaflet bei einem neuen
  // Icon das Element austauscht. Bewusst NICHT an den Callbacks oder an `title`:
  // die wechseln bei jedem Rendern und würden den Zug mitten drin abreißen.
  useEffect(() => {
    const element = marker?.getElement();
    labelRef.current =
      element?.querySelector<HTMLElement>('.ffn-rotate-label') ?? null;
    const knob = element?.querySelector<HTMLElement>('.ffn-rotate-knob');
    if (!knob) return;
    return attachRotationDrag(knob, () => optionsRef.current);
  }, [marker, icon]);

  // Die Beschriftung getrennt, damit ein Sprachwechsel den Zug nicht abreißt.
  useEffect(() => {
    const knob = marker
      ?.getElement()
      ?.querySelector<HTMLElement>('.ffn-rotate-knob');
    if (knob) knob.title = title;
  }, [marker, icon, title]);

  return (
    <Marker
      ref={setMarker}
      position={position}
      icon={icon}
      interactive={false}
      keyboard={false}
      zIndexOffset={1000}
    />
  );
}
