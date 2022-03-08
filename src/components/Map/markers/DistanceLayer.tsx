import { Circle, LayerGroup, Popup } from 'react-leaflet';
import { usePositionContext } from '../Position';

export const distanceColors: { [key: number]: string } = {
  50: 'red',
  100: 'orange',
  150: 'yellow',
  200: 'green',
  250: 'blue',
};
export const distances: number[] = Object.keys(distanceColors).map((key) =>
  Number.parseInt(key, 10)
);
export const colors: string[] = Object.values(distanceColors);

export function DistanceLayer() {
  const [position, gotPosition] = usePositionContext();

  return (
    <LayerGroup>
      {gotPosition &&
        distances.map((distance, i) => (
          <Circle
            color={colors[i]}
            radius={distance}
            center={position}
            opacity={0.5}
            fill={false}
            key={i}
          >
            <Popup>Entfernung: {distance}m</Popup>
          </Circle>
        ))}
    </LayerGroup>
  );
}
