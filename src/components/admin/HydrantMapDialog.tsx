'use client';

import dynamic from 'next/dynamic';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ClientMatchResult } from '../../app/admin/hydrantenCsvImportAction';

// Leaflet must be loaded client-side only (no SSR)
const HydrantMapContent = dynamic(() => import('./HydrantMapContent'), { ssr: false });

interface HydrantMapDialogProps {
  open: boolean;
  onClose: () => void;
  result: ClientMatchResult | null;
}

export default function HydrantMapDialog({ open, onClose, result }: HydrantMapDialogProps) {
  if (!result) return null;

  const hasExisting = typeof result.existingLat === 'number' && typeof result.existingLng === 'number';
  const title = `${result.ortschaft} — ${result.hydranten_nummer}`;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'success.main' }} />
            <Typography variant="body2">Neu (CSV)</Typography>
          </Box>
          {hasExisting && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'info.main' }} />
              <Typography variant="body2">Bestehend</Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ height: 400, width: '100%' }}>
          <HydrantMapContent
            newLat={result.lat}
            newLng={result.lng}
            existingLat={result.existingLat}
            existingLng={result.existingLng}
          />
        </Box>
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Neu: {result.lat.toFixed(6)}, {result.lng.toFixed(6)}
            {hasExisting && (
              <> | Bestehend: {result.existingLat!.toFixed(6)}, {result.existingLng!.toFixed(6)}</>
            )}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Schließen</Button>
      </DialogActions>
    </Dialog>
  );
}
