import GroupDetailPage from '../../../components/groups/GroupDetailPage';

export default async function Page({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  // `key`: Beim Wechsel der Gruppe über den Umschalter beginnt die Ansicht
  // frisch, statt Meldungen und Auswahl der vorigen Gruppe zu zeigen.
  return <GroupDetailPage key={groupId} groupId={groupId} />;
}
