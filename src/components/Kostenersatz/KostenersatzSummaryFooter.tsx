'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { formatCurrency } from '../../common/kostenersatz';

export interface KostenersatzSummaryFooterProps {
  totalSum: number;
}

export default function KostenersatzSummaryFooter({
  totalSum,
}: KostenersatzSummaryFooterProps) {
  return (
    <Box
      sx={{
        borderTop: 2,
        borderColor: 'divider',
        px: 3,
        py: 2,
        backgroundColor: 'background.paper',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <Typography variant="h6" component="span">
        Gesamt
      </Typography>
      <Typography variant="h5" component="span" fontWeight="bold">
        {formatCurrency(totalSum)}
      </Typography>
    </Box>
  );
}
