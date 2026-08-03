import FahrtenbuchVehiclePage from '../../../../components/Fahrtenbuch/FahrtenbuchVehiclePage';

export default async function Page({
  params,
}: {
  params: Promise<{ groupId: string; vehicleId: string }>;
}) {
  const { groupId, vehicleId } = await params;
  return <FahrtenbuchVehiclePage groupId={groupId} vehicleId={vehicleId} />;
}
