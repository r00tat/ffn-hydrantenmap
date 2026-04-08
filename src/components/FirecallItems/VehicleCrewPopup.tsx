'use client';

import { useCrewForVehicle } from '../../hooks/useFirecall';
import { funktionAbkuerzung } from '../firebase/firestore';

export default function VehicleCrewPopup({
  vehicleId,
}: {
  vehicleId: string;
}) {
  const crew = useCrewForVehicle(vehicleId);

  if (crew.length === 0) return null;

  return (
    <>
      <br />
      <span
        style={{
          borderTop: '1px solid #ccc',
          display: 'block',
          marginTop: 4,
          paddingTop: 4,
        }}
      >
        {crew.map((c) => (
          <span key={c.id}>
            {c.name}
            {c.funktion !== 'Feuerwehrmann' &&
              ` (${funktionAbkuerzung(c.funktion)})`}
            <br />
          </span>
        ))}
      </span>
    </>
  );
}
