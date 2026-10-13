import MemberRolesPage from '../../../../components/groups/MemberRolesPage';

export default async function Page({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  // `key`: Beim Wechsel der Gruppe über den Umschalter beginnt die Ansicht
  // frisch, statt Meldungen und Auswahl der vorigen Gruppe zu zeigen.
  return <MemberRolesPage key={groupId} groupId={groupId} />;
}
