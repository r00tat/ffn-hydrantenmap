import 'leaflet-rotatedmarker';
import { forwardRef, useEffect, useRef } from 'react';
import { Marker, MarkerProps } from 'react-leaflet';
export interface RotatedMarkerProps extends MarkerProps {
  rotationAngle?: number;
  rotationOrigin?: string;
}
export const RotatedMarker = forwardRef<L.Marker, RotatedMarkerProps>(
  ({ children, rotationAngle, rotationOrigin, ...props }, forwardRef) => {
    const markerRef = useRef<L.Marker>(undefined);

    useEffect(() => {
      const marker = markerRef.current;
      if (marker) {
        (marker as any).setRotationAngle(rotationAngle);
        (marker as any).setRotationOrigin(rotationOrigin);
      }
    }, [rotationAngle, rotationOrigin]);

    return (
      <Marker
        ref={(ref) => {
          if (ref) {
            markerRef.current = ref;
            // if (forwardRef) {
            //   forwardRef.current = ref;
            // }
          }
        }}
        {...props}
      >
        {children}
      </Marker>
    );
  }
);

RotatedMarker.displayName = 'RotatedMarker';
