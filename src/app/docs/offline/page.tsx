import { getLocale } from 'next-intl/server';
import DocsMarkdown from '../../../components/docs/DocsMarkdown';
import { loadDocsContent } from '../../../components/docs/loadDocsContent';

export default async function OfflineDocsPage() {
  const locale = await getLocale();
  const markdown = await loadDocsContent('offline', locale);
  return <DocsMarkdown markdown={markdown} />;
}
