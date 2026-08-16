import { Suspense } from 'react';
import FahrtenbuchVehiclePage from '../../../../components/Fahrtenbuch/FahrtenbuchVehiclePage';

export default async function Page({
  params,
}: {
  params: Promise<{ groupId: string; vehicleId: string }>;
}) {
  const { groupId, vehicleId } = await params;
  // Suspense-Grenze wegen `useSearchParams` in der Fahrtenliste — siehe
  // /fahrtenbuch/page.tsx.
  return (
    <Suspense>
      <FahrtenbuchVehiclePage groupId={groupId} vehicleId={vehicleId} />
    </Suspense>
  );
}
