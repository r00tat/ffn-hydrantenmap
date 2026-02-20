import { doc, setDoc } from 'firebase/firestore';
import L from 'leaflet';
import GeometryUtil from 'leaflet-geometryutil';
import { GeoPositionObject, LatLngPosition } from '../../../../common/geo';
import { firestore } from '../../../firebase/firebase';
import {
  Connection,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  MultiPointItem,
} from '../../../firebase/firestore';
import { logAuditChange } from '../../../../hooks/useAuditLog';
import { calculateDistance, getConnectionPositions } from './distance';

export async function updateFirecallPositions(
  firecallId: string,
  newPos: GeoPositionObject,
  fcItem: MultiPointItem,
  index: number,
  email?: string
) {
  if (fcItem.id && newPos && fcItem.positions) {
    const positions: LatLngPosition[] = getConnectionPositions(fcItem);
    positions.splice(index, 1, [newPos.lat, newPos.lng]);
    await updateConnectionInFirestore(firecallId, fcItem, positions, email);
  }
}
export async function addFirecallPosition(
  firecallId: string,
  newPos: GeoPositionObject,
  fcItem: MultiPointItem,
  index: number,
  email?: string
) {
  if (fcItem.id && newPos && fcItem.positions) {
    const positions: LatLngPosition[] = getConnectionPositions(fcItem);
    positions.splice(index, 0, [newPos.lat, newPos.lng]);
    await updateConnectionInFirestore(firecallId, fcItem, positions, email);
  }
}

export async function deleteFirecallPosition(
  firecallId: string,
  fcItem: MultiPointItem,
  index: number,
  email?: string
) {
  if (fcItem.id && fcItem.positions) {
    const positions: LatLngPosition[] = getConnectionPositions(fcItem);
    positions.splice(index, 1);
    await updateConnectionInFirestore(firecallId, fcItem, positions, email);
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
  positions: LatLngPosition[],
  email?: string
) => {
  if (fcItem.id) {
    const newValue = {
      positions: JSON.stringify(positions),
      distance: Math.round(calculateDistance(positions)),
    };
    await setDoc(
      doc(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_ITEMS_COLLECTION_ID,
        fcItem.id
      ),
      newValue,
      {
        merge: true,
      }
    );

    if (email) {
      logAuditChange(firecallId, email, {
        action: 'update',
        elementType: fcItem.type || 'connection',
        elementId: fcItem.id,
        elementName: fcItem.name || '',
        newValue: { distance: newValue.distance },
      });
    }
  }
};
