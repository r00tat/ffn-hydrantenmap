import { getLocale } from 'next-intl/server';
import DocsMarkdown from '../../../components/docs/DocsMarkdown';
import { loadDocsContent } from '../../../components/docs/loadDocsContent';

export default async function TagebuchDocsPage() {
  const locale = await getLocale();
  const markdown = await loadDocsContent('tagebuch', locale);
  return <DocsMarkdown markdown={markdown} />;
}
