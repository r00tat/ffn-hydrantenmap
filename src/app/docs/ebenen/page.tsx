import { getLocale } from 'next-intl/server';
import DocsMarkdown from '../../../components/docs/DocsMarkdown';
import { loadDocsContent } from '../../../components/docs/loadDocsContent';

export default async function EbenenDocsPage() {
  const locale = await getLocale();
  const markdown = await loadDocsContent('ebenen', locale);
  return <DocsMarkdown markdown={markdown} />;
}
