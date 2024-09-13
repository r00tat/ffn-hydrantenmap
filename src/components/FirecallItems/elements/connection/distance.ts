import { latLngPosition, LatLngPosition } from '../../../../common/geo';
import { toLatLng } from '../../../../hooks/leafletFunctions';
import { Connection } from '../../../firebase/firestore';

export const getConnectionPositions = (
  record: Connection
): LatLngPosition[] => {
  let p: LatLngPosition[] = [
    latLngPosition(record.lat, record.lng),
    [record.destLat, record.destLng],
  ];

  try {
    if (record.positions) {
      p = JSON.parse(record.positions);
    }
  } catch (err) {
    console.warn(`unable to parse positions ${err} ${record.positions}`);
  }
  return p;
};

export const calculateDistance = (positions: LatLngPosition[]): number => {
  let distance = 0;
  positions.forEach((p, index) => {
    if (index > 0) {
      distance += toLatLng(p[0], p[1]).distanceTo(
        toLatLng(positions[index - 1][0], positions[index - 1][1])
      );
    }
  });
  return distance;
};

export const calculateDistanceForConnection = (record: Connection) =>
  Math.round(calculateDistance(getConnectionPositions(record)));
