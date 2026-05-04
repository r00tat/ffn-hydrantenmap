'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import React, { useState } from 'react';
import {
  AppPermissions,
  PermissionType,
} from '../../lib/permissions';

export type StepResult = 'granted' | 'denied' | 'skipped';

interface Props {
  type: PermissionType;
  icon: React.ReactNode;
  title: string;
  description: string;
  onResult: (result: StepResult) => void;
}

export default function PermissionStep({
  type,
  icon,
  title,
  description,
  onResult,
}: Props) {
  const [busy, setBusy] = useState(false);

  const handleAllow = async () => {
    setBusy(true);
    try {
      const { state } = await AppPermissions.requestPermission({ type });
      onResult(state === 'granted' ? 'granted' : 'denied');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={3} sx={{ p: 3, textAlign: 'center', alignItems: 'center' }}>
      <Box sx={{ fontSize: 96, color: 'primary.main' }}>{icon}</Box>
      <Typography variant="h5">{title}</Typography>
      <Typography>{description}</Typography>
      <Stack direction="row" spacing={2}>
        <Button
          variant="text"
          onClick={() => onResult('skipped')}
          disabled={busy}
        >
          Später
        </Button>
        <Button variant="contained" onClick={handleAllow} disabled={busy}>
          Erlauben
        </Button>
      </Stack>
    </Stack>
  );
}
