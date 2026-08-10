import FahrtenbuchStatistikPage from '../../../components/Fahrtenbuch/statistik/FahrtenbuchStatistikPage';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string }>;
}) {
  // `?vehicle=<id>` kommt vom Statistik-Button auf der Fahrzeugseite: Die
  // Auswertung startet dort mit diesem Fahrzeug als Filter.
  const { vehicle } = await searchParams;
  return <FahrtenbuchStatistikPage initialVehicleId={vehicle} />;
}
