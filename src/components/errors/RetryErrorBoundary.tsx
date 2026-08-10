'use client';

import RefreshIcon from '@mui/icons-material/Refresh';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { catchError, type ErrorInfo } from 'next/error';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { recordError } from '../firebase/crashlytics';

export interface RetryErrorBoundaryProps {
  /** Ueberschrift im Fehlerfall. Default: uebersetzter Standardtext. */
  title?: string;
}

/**
 * Fallback-UI der Boundary. Als eigenstaendige Komponente exportiert, damit sie
 * ohne die App-Router-Umgebung getestet werden kann — `catchError` selbst
 * braucht den Router-Context.
 */
export function RetryErrorFallback({
  title,
  error,
  retry,
}: RetryErrorBoundaryProps & ErrorInfo) {
  const t = useTranslations('errors');
  const message = error instanceof Error ? error.message : String(error);
  const digest =
    error instanceof Error && 'digest' in error
      ? String((error as { digest?: unknown }).digest)
      : undefined;

  useEffect(() => {
    void recordError(error instanceof Error ? error : new Error(message), {
      source: 'retry-error-boundary',
      ...(digest ? { digest } : {}),
    });
  }, [error, message, digest]);

  return (
    <Alert
      severity="error"
      action={
        <Button
          color="inherit"
          size="small"
          startIcon={<RefreshIcon />}
          // retry() rendert im Unterschied zu reset() auch die fehlgeschlagenen
          // Server Components neu, holt die Daten also wirklich erneut.
          onClick={() => retry()}
        >
          {t('retry')}
        </Button>
      }
    >
      <AlertTitle>{title ?? t('title')}</AlertTitle>
      <Typography variant="body2">{message || t('unknown')}</Typography>
    </Alert>
  );
}

/**
 * Error Boundary auf Komponentenebene (Next.js 16.3, `catchError`). Anders als
 * eine `error.tsx` kann sie einen beliebigen Teil des Baums umschliessen, faengt
 * `notFound()` und `redirect()` nicht ab und stellt `retry()` bereit, das die
 * fehlgeschlagenen Server Components neu rendert.
 */
const RetryErrorBoundary = catchError<RetryErrorBoundaryProps>(
  (props, errorInfo) => <RetryErrorFallback {...props} {...errorInfo} />,
);

export default RetryErrorBoundary;
