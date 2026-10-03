'use client';

import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';

/**
 * Kleines Wolkensymbol an einem Eintrag, dessen Änderung erst auf dem Gerät
 * liegt und noch nicht beim Server ist (`usePendingDocIds`).
 */
export default function PendingSyncIcon() {
  const t = useTranslations('networkStatus');
  const label = t('pendingWrite');
  return (
    <Tooltip title={label}>
      <CloudUploadOutlinedIcon
        titleAccess={label}
        color="action"
        sx={{ fontSize: 16, verticalAlign: 'text-bottom', ml: 0.5 }}
      />
    </Tooltip>
  );
}
