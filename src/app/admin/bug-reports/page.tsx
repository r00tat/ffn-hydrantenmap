import {
  getBugReportConfigAction,
  listBugReportsAction,
} from './bugReportAdminActions';
import BugReportListClient from './BugReportListClient';

export default async function BugReportsAdminPage() {
  const [reports, config] = await Promise.all([
    listBugReportsAction(),
    getBugReportConfigAction(),
  ]);

  return (
    <BugReportListClient initialReports={reports} initialConfig={config} />
  );
}
