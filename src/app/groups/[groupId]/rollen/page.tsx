import { redirect } from 'next/navigation';

/**
 * Frühere Adresse von „Mitglieder und Rollen". Die Matrix steht jetzt auf der
 * Detailseite der Gruppe; Lesezeichen und alte Links landen dort.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  redirect(`/groups/${encodeURIComponent(groupId)}`);
}
