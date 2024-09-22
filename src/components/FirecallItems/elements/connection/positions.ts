import { doc, setDoc } from 'firebase/firestore';
import L from 'leaflet';
import GeometryUtil from 'leaflet-geometryutil';
import { GeoPositionObject, LatLngPosition } from '../../../../common/geo';
import { firestore } from '../../../firebase/firebase';
import { Connection, MultiPointItem } from '../../../firebase/firestore';
import { calculateDistance, getConnectionPositions } from './distance';

export async function updateFirecallPositions(
  firecallId: string,
  newPos: GeoPositionObject,
  fcItem: MultiPointItem,
  index: number
) {
  // console.info(`drag end on ${JSON.stringify(gisObject)}: ${newPos}`);
  if (fcItem.id && newPos && fcItem.positions) {
    const positions: LatLngPosition[] = getConnectionPositions(fcItem);
    positions.splice(index, 1, [newPos.lat, newPos.lng]);
    await updateConnectionInFirestore(firecallId, fcItem, positions);
  }
}
export async function addFirecallPosition(
  firecallId: string,
  newPos: GeoPositionObject,
  fcItem: MultiPointItem,
  index: number
) {
  // console.info(`drag end on ${JSON.stringify(gisObject)}: ${newPos}`);
  if (fcItem.id && newPos && fcItem.positions) {
    const positions: LatLngPosition[] = getConnectionPositions(fcItem);
    positions.splice(index, 0, [newPos.lat, newPos.lng]);
    await updateConnectionInFirestore(firecallId, fcItem, positions);
  }
}

export async function deleteFirecallPosition(
  firecallId: string,
  fcItem: MultiPointItem,
  index: number
) {
  // console.info(`drag end on ${JSON.stringify(gisObject)}: ${newPos}`);
  if (fcItem.id && fcItem.positions) {
    const positions: LatLngPosition[] = getConnectionPositions(fcItem);
    positions.splice(index, 1);
    await updateConnectionInFirestore(firecallId, fcItem, positions);
  }
}

export function findSectionOnPolyline(
  positions: LatLngPosition[],
  point: L.LatLng
) {
  for (let i = 1; i < positions.length; i++) {
    const belongsToSection = GeometryUtil.belongsSegment(
      point,
      new L.LatLng(positions[i - 1][0], positions[i - 1][1]),
      new L.LatLng(positions[i][0], positions[i][1])
    );
    if (belongsToSection) {
      console.info(
        `click point ${point} belongs to section ${positions[i - 1]}-${
          positions[i]
        } ${i - 1}-${i}`
      );
      return i;
    }
  }

  return -1;
}

const updateConnectionInFirestore = async (
  firecallId: string,
  fcItem: MultiPointItem,
  positions: LatLngPosition[]
) => {
  if (fcItem.id)
    return await setDoc(
      doc(firestore, 'call', firecallId, 'item', fcItem.id),
      {
        positions: JSON.stringify(positions),
        distance: Math.round(calculateDistance(positions)),
      },
      {
        merge: true,
      }
    );
};
