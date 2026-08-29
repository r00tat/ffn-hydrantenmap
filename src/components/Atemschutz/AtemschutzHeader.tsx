'use client';

import { useState } from 'react';
import EditIcon from '@mui/icons-material/Edit';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import AsspLeitungDialog from './AsspLeitungDialog';

export interface AtemschutzHeaderProps {
  leiter?: string;
  fuellpersonal?: string[];
  suggestions: string[];
  canWrite: boolean;
  onSave: (leiter: string, fuellpersonal: string[]) => Promise<void>;
}

/**
 * ASSP-Leiter und Füllpersonal über den Reitern.
 *
 * Statt einer eigenen Übersichtsseite: Es sind zwei Angaben, die auf allen
 * drei Reitern gebraucht werden — eine vierte Registerkarte für zwei Zeilen
 * wäre ein Umweg.
 */
export default function AtemschutzHeader({
  leiter,
  fuellpersonal,
  suggestions,
  canWrite,
  onSave,
}: AtemschutzHeaderProps) {
  const t = useTranslations('atemschutz');
  const [open, setOpen] = useState(false);

  const personalText =
    fuellpersonal && fuellpersonal.length > 0
      ? fuellpersonal.join(', ')
      : t('header.niemand');

  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Typography variant="body2" sx={{ flexGrow: 1 }}>
            <strong>{t('header.leiter')}:</strong>{' '}
            {leiter || t('header.niemand')}
            {' · '}
            <strong>{t('header.fuellpersonal')}:</strong> {personalText}
          </Typography>
          {canWrite && (
            <Tooltip title={t('header.edit')}>
              <span>
                <IconButton size="small" onClick={() => setOpen(true)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Stack>
      </CardContent>

      {open && (
        <AsspLeitungDialog
          open
          leiter={leiter ?? ''}
          fuellpersonal={fuellpersonal ?? []}
          suggestions={suggestions}
          onClose={() => setOpen(false)}
          onSave={onSave}
        />
      )}
    </Card>
  );
}
