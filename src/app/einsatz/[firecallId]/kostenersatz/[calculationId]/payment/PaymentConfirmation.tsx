'use client';

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { formatCurrency } from '../../../../../../common/kostenersatz';
import {
  verifyPaymentAndComplete,
  PaymentVerificationResult,
} from '../../../../../../components/Kostenersatz/verifyPaymentAction';

interface PaymentConfirmationProps {
  firecallId: string;
  calculationId: string;
  token: string;
  smpStatus?: string;
  smpTxCode?: string;
}

export default function PaymentConfirmation({
  firecallId,
  calculationId,
  token,
  smpStatus,
  smpTxCode,
}: PaymentConfirmationProps) {
  const [result, setResult] = useState<PaymentVerificationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    verifyPaymentAndComplete(firecallId, calculationId, token, smpStatus, smpTxCode)
      .then(setResult)
      .catch(() => setResult({ success: false, error: 'Ein Fehler ist aufgetreten' }))
      .finally(() => setLoading(false));
  }, [firecallId, calculationId, token]);

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CircularProgress size={48} />
          <Typography variant="h6">Zahlung wird überprüft...</Typography>
        </Box>
      </Container>
    );
  }

  if (!result || !result.success) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <ErrorIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Zahlungsbestätigung
          </Typography>
          <Alert severity="error" sx={{ mt: 2 }}>
            {result?.error || 'Ein Fehler ist aufgetreten'}
          </Alert>
        </Paper>
      </Container>
    );
  }

  const pdfUrl = `/api/kostenersatz/pdf/${calculationId}?token=${encodeURIComponent(token)}&firecallId=${encodeURIComponent(firecallId)}`;

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
        <Typography variant="h4" gutterBottom>
          Zahlung erfolgreich
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Vielen Dank für Ihre Zahlung.
        </Typography>

        <Box sx={{ bgcolor: 'grey.50', borderRadius: 1, p: 3, mb: 3, textAlign: 'left' }}>
          {result.recipientName && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Name:</Typography>
              <Typography variant="body2" fontWeight="medium">{result.recipientName}</Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">Betrag:</Typography>
            <Typography variant="body2" fontWeight="medium">{formatCurrency(result.amount || 0)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">Referenz:</Typography>
            <Typography variant="body2" fontWeight="medium">{result.reference}</Typography>
          </Box>
        </Box>

        <Button
          variant="outlined"
          startIcon={<PictureAsPdfIcon />}
          href={pdfUrl}
          target="_blank"
          fullWidth
        >
          Rechnung herunterladen (PDF)
        </Button>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 3, display: 'block' }}>
          Freiwillige Feuerwehr Neusiedl am See
        </Typography>
      </Paper>
    </Container>
  );
}
