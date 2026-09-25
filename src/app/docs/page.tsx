import Box from '@mui/material/Box';
import { getLocale } from 'next-intl/server';
import Image from 'next/image';
import DocsMarkdown from '../../components/docs/DocsMarkdown';
import { loadDocsContent } from '../../components/docs/loadDocsContent';

export default async function DocsPage() {
  const locale = await getLocale();
  const markdown = await loadDocsContent('index', locale);
  return (
    <>
      {/* Rechts neben der Überschrift, der Text fließt darum herum. */}
      <Box sx={{ float: 'right', ml: 2, mb: 1 }}>
        <Image src="/brand/logo.png" alt="" width={120} height={120} priority />
      </Box>
      <DocsMarkdown markdown={markdown} />
    </>
  );
}
