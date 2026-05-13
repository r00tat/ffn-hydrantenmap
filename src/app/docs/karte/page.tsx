import { getLocale } from 'next-intl/server';
import DocsMarkdown from '../../../components/docs/DocsMarkdown';
import { loadDocsContent } from '../../../components/docs/loadDocsContent';

export default async function KarteDocsPage() {
  const locale = await getLocale();
  const markdown = await loadDocsContent('karte', locale);
  return <DocsMarkdown markdown={markdown} />;
}
