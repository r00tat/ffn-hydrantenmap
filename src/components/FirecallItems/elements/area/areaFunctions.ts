import { doc, setDoc } from 'firebase/firestore';
import L from 'leaflet';
import { LatLngPosition } from '../../../../common/geo';

import { firestore } from '../../../firebase/firebase';
import {
  Area,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
} from '../../../firebase/firestore';
import { logAuditChange } from '../../../../hooks/useAuditLog';
import {
  calculateDistance,
  getConnectionPositions,
} from '../connection/distance';

export async function updateFirecallPositions(
  firecallId: string,
  newPos: L.LatLng,
  fcItem: Area,
  index: number,
  email?: string
) {
  if (fcItem.id && newPos && fcItem.positions) {
    const positions: LatLngPosition[] = getConnectionPositions(fcItem);
    positions.splice(index, 1, [newPos.lat, newPos.lng]);
    await updateConnectionInFirestore(firecallId, fcItem, positions, email);
  }
}

export async function deleteFirecallPosition(
  firecallId: string,
  fcItem: Area,
  index: number,
  email?: string
) {
  if (fcItem.id && fcItem.positions) {
    const positions: LatLngPosition[] = getConnectionPositions(fcItem);
    positions.splice(index, 1);
    await updateConnectionInFirestore(firecallId, fcItem, positions, email);
  }
}

const updateConnectionInFirestore = async (
  firecallId: string,
  fcItem: Area,
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
        elementType: fcItem.type || 'area',
        elementId: fcItem.id,
        elementName: fcItem.name || '',
        newValue: { distance: newValue.distance },
      });
    }
  }
};
