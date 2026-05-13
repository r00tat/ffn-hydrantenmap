import { getLocale } from 'next-intl/server';
import DocsMarkdown from '../../../components/docs/DocsMarkdown';
import { loadDocsContent } from '../../../components/docs/loadDocsContent';

export default async function ChatDocsPage() {
  const locale = await getLocale();
  const markdown = await loadDocsContent('chat', locale);
  return <DocsMarkdown markdown={markdown} />;
}
