import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import ErrorIcon from '@mui/icons-material/Error';
import PaymentConfirmation from './PaymentConfirmation';

interface PaymentPageProps {
  params: Promise<{ firecallId: string; calculationId: string }>;
  searchParams: Promise<{
    token?: string;
    'smp-status'?: string;
    'smp-tx-code'?: string;
  }>;
}

export default async function PaymentPage({ params, searchParams }: PaymentPageProps) {
  const { firecallId, calculationId } = await params;
  const resolvedSearchParams = await searchParams;
  const token = resolvedSearchParams.token;
  const smpStatus = resolvedSearchParams['smp-status'];
  const smpTxCode = resolvedSearchParams['smp-tx-code'];

  if (!token) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <ErrorIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Ungültiger Link
          </Typography>
          <Typography color="text.secondary">
            Dieser Zahlungslink ist ungültig. Bitte überprüfen Sie den Link.
          </Typography>
        </Paper>
      </Container>
    );
  }

  return (
    <PaymentConfirmation
      firecallId={firecallId}
      calculationId={calculationId}
      token={token}
      smpStatus={smpStatus}
      smpTxCode={smpTxCode}
    />
  );
}
