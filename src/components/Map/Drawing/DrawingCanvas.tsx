'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Polyline, useMap } from 'react-leaflet';
import simplify from 'simplify-js';
import { useDrawing } from './DrawingContext';

const THROTTLE_MS = 50;
const RDP_TOLERANCE = 0.00003; // ~3 metres

export default function DrawingCanvas() {
  const map = useMap();
  const drawing = useDrawing();
  const rawPointsRef = useRef<[number, number][]>([]);
  const isPointerDownRef = useRef(false);
  const lastCaptureRef = useRef(0);
  const [previewPoints, setPreviewPoints] = useState<[number, number][]>([]);

  // Disable map dragging only while in drawing mode
  useEffect(() => {
    if (!drawing.isDrawing) return;
    map.dragging.disable();
    map.scrollWheelZoom.disable();
    return () => {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
    };
  }, [map, drawing.isDrawing]);

  const getLatLng = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const rect = map.getContainer().getBoundingClientRect();
      const latlng = map.containerPointToLatLng([
        clientX - rect.left,
        clientY - rect.top,
      ]);
      return [latlng.lat, latlng.lng];
    },
    [map]
  );

  const commitCurrentStroke = useCallback(() => {
    const raw = rawPointsRef.current;
    if (raw.length < 2) {
      rawPointsRef.current = [];
      setPreviewPoints([]);
      return;
    }
    const simplified = simplify(
      raw.map(([x, y]) => ({ x, y })),
      RDP_TOLERANCE,
      true
    ).map(({ x, y }) => [x, y] as [number, number]);

    drawing.commitStroke(simplified);
    rawPointsRef.current = [];
    setPreviewPoints([]);
  }, [drawing]);

  useEffect(() => {
    if (!drawing.isDrawing) return;
    const container = map.getContainer();

    const handleDown = (clientX: number, clientY: number) => {
      isPointerDownRef.current = true;
      rawPointsRef.current = [];
      const pt = getLatLng(clientX, clientY);
      rawPointsRef.current.push(pt);
      setPreviewPoints([pt]);
    };

    const handleMove = (clientX: number, clientY: number) => {
      if (!isPointerDownRef.current) return;
      const now = Date.now();
      if (now - lastCaptureRef.current < THROTTLE_MS) return;
      lastCaptureRef.current = now;
      const pt = getLatLng(clientX, clientY);
      rawPointsRef.current.push(pt);
      setPreviewPoints((prev) => [...prev, pt]);
    };

    const handleUp = () => {
      if (!isPointerDownRef.current) return;
      isPointerDownRef.current = false;
      commitCurrentStroke();
    };

    const onMouseDown = (e: MouseEvent) => handleDown(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onMouseUp = () => handleUp();

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      handleDown(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      handleUp();
    };

    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, [map, drawing.isDrawing, getLatLng, commitCurrentStroke]);

  if (!drawing.isDrawing) return null;

  return (
    <>
      {/* Live preview of stroke in progress */}
      {previewPoints.length > 1 && (
        <Polyline
          positions={previewPoints}
          pathOptions={{
            color: drawing.activeColor,
            weight: drawing.activeWidth,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}
      {/* Preview of committed (unsaved) strokes */}
      {drawing.strokes.map((stroke, idx) => (
        <Polyline
          key={idx}
          positions={stroke.points as [number, number][]}
          pathOptions={{
            color: stroke.color,
            weight: stroke.width,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      ))}
    </>
  );
}
