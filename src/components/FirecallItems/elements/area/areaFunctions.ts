import { doc, setDoc } from 'firebase/firestore';
import L from 'leaflet';
import { LatLngPosition } from '../../../../common/geo';

import { firestore } from '../../../firebase/firebase';
import {
  Area,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
} from '../../../firebase/firestore';
import {
  calculateDistance,
  getConnectionPositions,
} from '../connection/distance';

export async function updateFirecallPositions(
  firecallId: string,
  newPos: L.LatLng,
  fcItem: Area,
  index: number
) {
  // console.info(`drag end on ${JSON.stringify(gisObject)}: ${newPos}`);
  if (fcItem.id && newPos && fcItem.positions) {
    const positions: LatLngPosition[] = getConnectionPositions(fcItem);
    positions.splice(index, 1, [newPos.lat, newPos.lng]);
    await updateConnectionInFirestore(firecallId, fcItem, positions);
  }
}

export async function deleteFirecallPosition(
  firecallId: string,
  fcItem: Area,
  index: number
) {
  // console.info(`drag end on ${JSON.stringify(gisObject)}: ${newPos}`);
  if (fcItem.id && fcItem.positions) {
    const positions: LatLngPosition[] = getConnectionPositions(fcItem);
    positions.splice(index, 1);
    await updateConnectionInFirestore(firecallId, fcItem, positions);
  }
}

const updateConnectionInFirestore = async (
  firecallId: string,
  fcItem: Area,
  positions: LatLngPosition[]
) => {
  if (fcItem.id)
    return await setDoc(
      doc(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_ITEMS_COLLECTION_ID,
        fcItem.id
      ),
      {
        positions: JSON.stringify(positions),
        distance: Math.round(calculateDistance(positions)),
      },
      {
        merge: true,
      }
    );
};
