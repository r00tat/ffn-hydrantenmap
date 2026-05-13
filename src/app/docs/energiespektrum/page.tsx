import { getLocale } from 'next-intl/server';
import DocsMarkdown from '../../../components/docs/DocsMarkdown';
import { loadDocsContent } from '../../../components/docs/loadDocsContent';

export default async function EnergiespektrumDocsPage() {
  const locale = await getLocale();
  const markdown = await loadDocsContent('energiespektrum', locale);
  return <DocsMarkdown markdown={markdown} />;
}
