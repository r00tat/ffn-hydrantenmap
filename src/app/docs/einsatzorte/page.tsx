import { getLocale } from 'next-intl/server';
import DocsMarkdown from '../../../components/docs/DocsMarkdown';
import { loadDocsContent } from '../../../components/docs/loadDocsContent';

export default async function EinsatzorteDocsPage() {
  const locale = await getLocale();
  const markdown = await loadDocsContent('einsatzorte', locale);
  return <DocsMarkdown markdown={markdown} />;
}
