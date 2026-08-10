import Box from '@mui/material/Box';
import { getTranslations } from 'next-intl/server';
import { ReactNode } from 'react';
import DocsContent from '../../components/docs/DocsContent';
import DocsSidebar from '../../components/docs/DocsSidebar';
import RetryErrorBoundary from '../../components/errors/RetryErrorBoundary';

export default async function DocsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations('errors');

  return (
    <Box sx={{ display: 'flex', gap: 3, p: 2, minHeight: '100vh' }}>
      <DocsSidebar />
      <DocsContent>
        {/* Die Doku-Seiten laden ihr Markdown in Server Components. Scheitert das,
            bleibt dank retry() die Sidebar stehen und nur der Inhalt wird neu
            geholt — statt die ganze Route ueber error.tsx zu ersetzen. */}
        <RetryErrorBoundary title={t('docsTitle')}>
          {children}
        </RetryErrorBoundary>
      </DocsContent>
    </Box>
  );
}
