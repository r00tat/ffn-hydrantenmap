import { redirect } from 'next/navigation';

export default async function SchadstoffDefaultPage({
  params,
}: {
  params: Promise<{ firecallId: string }>;
}) {
  const { firecallId } = await params;
  redirect(`/einsatz/${firecallId}/schadstoff/datenbank`);
}
