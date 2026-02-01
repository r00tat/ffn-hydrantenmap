'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KostenersatzCalculation } from '../../common/kostenersatz';
import { useFirecallKostenersatz } from '../../hooks/useKostenersatz';
import {
  useKostenersatzDelete,
  useKostenersatzDuplicate,
} from '../../hooks/useKostenersatzMutations';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useFirecall from '../../hooks/useFirecall';
import KostenersatzCard from './KostenersatzCard';
import KostenersatzEmailDialog from './KostenersatzEmailDialog';
import ConfirmDialog from '../dialogs/ConfirmDialog';

export interface KostenersatzListProps {
  firecallId: string;
}

export default function KostenersatzList({
  firecallId,
}: KostenersatzListProps) {
  const router = useRouter();
  const firecall = useFirecall();
  const { calculations, loading, error } = useFirecallKostenersatz(firecallId);
  const deleteCalculation = useKostenersatzDelete(firecallId);
  const duplicateCalculation = useKostenersatzDuplicate(firecallId);
  const { idToken } = useFirebaseLogin();

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [calculationToDelete, setCalculationToDelete] =
    useState<KostenersatzCalculation | null>(null);

  // Email dialog state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [calculationToEmail, setCalculationToEmail] =
    useState<KostenersatzCalculation | null>(null);
  const [emailSuccessMessage, setEmailSuccessMessage] = useState<string | null>(null);

  const handleOpenNew = () => {
    router.push(`/einsatz/${firecallId}/kostenersatz/neu`);
  };

  const handleEdit = (calculation: KostenersatzCalculation) => {
    router.push(`/einsatz/${firecallId}/kostenersatz/${calculation.id}`);
  };

  const handleDuplicate = async (calculation: KostenersatzCalculation) => {
    try {
      await duplicateCalculation(calculation);
    } catch (err) {
      console.error('Error duplicating calculation:', err);
    }
  };

  const handleDeleteClick = (calculation: KostenersatzCalculation) => {
    setCalculationToDelete(calculation);
    setDeleteConfirmOpen(true);
  };

  const handleGeneratePdf = async (calculation: KostenersatzCalculation) => {
    if (!calculation.id || !idToken) return;

    try {
      const url = `/api/kostenersatz/pdf?firecallId=${firecallId}&calculationId=${calculation.id}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      // Create blob and download
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `Kostenersatz_${calculation.recipient.name || 'Berechnung'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Error generating PDF:', err);
    }
  };

  const handleDeleteConfirm = async (confirmed: boolean) => {
    if (confirmed && calculationToDelete?.id) {
      try {
        await deleteCalculation(calculationToDelete.id);
      } catch (err) {
        console.error('Error deleting calculation:', err);
      }
    }
    setDeleteConfirmOpen(false);
    setCalculationToDelete(null);
  };

  // Email handlers
  const handleSendEmail = useCallback((calculation: KostenersatzCalculation) => {
    setCalculationToEmail(calculation);
    setEmailDialogOpen(true);
  }, []);

  const handleEmailDialogClose = useCallback(() => {
    setEmailDialogOpen(false);
    setCalculationToEmail(null);
  }, []);

  const handleEmailSuccess = useCallback(() => {
    setEmailSuccessMessage('E-Mail wurde erfolgreich gesendet');
  }, []);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          py: 4,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ py: 2 }}>
        <Typography color="error">
          Fehler beim Laden der Berechnungen: {error.message}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Typography variant="h6">Kostenersatz-Berechnungen</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenNew}
        >
          Neue Berechnung
        </Button>
      </Box>

      {calculations.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center',
            py: 6,
            px: 2,
            backgroundColor: 'action.hover',
            borderRadius: 2,
          }}
        >
          <ReceiptLongIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Noch keine Berechnungen
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Erstellen Sie eine neue Kostenersatz-Berechnung für diesen Einsatz.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleOpenNew}
          >
            Erste Berechnung erstellen
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {calculations.map((calculation) => (
            <KostenersatzCard
              key={calculation.id}
              calculation={calculation}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={handleDeleteClick}
              onGeneratePdf={handleGeneratePdf}
              onSendEmail={handleSendEmail}
            />
          ))}
        </Box>
      )}

      {deleteConfirmOpen && (
        <ConfirmDialog
          open={deleteConfirmOpen}
          title="Berechnung löschen"
          text={`Möchten Sie die Berechnung für "${calculationToDelete?.recipient.name || 'Unbenannt'}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
          onConfirm={handleDeleteConfirm}
          yes="Löschen"
          no="Abbrechen"
        />
      )}

      {/* Email Dialog */}
      {calculationToEmail && (
        <KostenersatzEmailDialog
          open={emailDialogOpen}
          onClose={handleEmailDialogClose}
          onSuccess={handleEmailSuccess}
          calculation={calculationToEmail}
          firecall={firecall}
          firecallId={firecallId}
        />
      )}

      {/* Success Snackbar */}
      <Snackbar
        open={!!emailSuccessMessage}
        autoHideDuration={4000}
        onClose={() => setEmailSuccessMessage(null)}
        message={emailSuccessMessage}
      />
    </Box>
  );
}
