import {
  getBugReportConfigAction,
  listBugReportsAction,
} from '../bugReportAdminActions';
import BugReportListClient from '../BugReportListClient';

/**
 * Direkt-Link aus der Benachrichtigungsmail (`buildBugReportEmail.ts`): die
 * Liste mit dem Report im geöffneten Detaildialog.
 */
export default async function BugReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [reports, config] = await Promise.all([
    listBugReportsAction(),
    getBugReportConfigAction(),
  ]);

  return (
    <BugReportListClient
      initialReports={reports}
      initialConfig={config}
      initialSelectedId={decodeURIComponent(id)}
    />
  );
}
