'use client';

import { useTranslations } from 'next-intl';
import React, { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { getGroupsWithOebfvConfig } from './configActions';
import { queryKennzeichen } from './queryActions';
// Type-only imports MUST use `import type` — these modules pull in
// server-only code / are pure types that must never enter the client bundle.
import type { KennzeichenQueryResult } from './queryActions';
import type { KennzeichenSystem } from './logEntry';
import type { Vehicle } from './parseVehicleData';
import useFirecall from '../../hooks/useFirecall';

const KennzeichenPage = () => {
  const t = useTranslations('kennzeichen');
  const firecall = useFirecall();

  const [groupId, setGroupId] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [system, setSystem] = useState<KennzeichenSystem>('einsatz');
  const [platePrefix, setPlatePrefix] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [querying, setQuerying] = useState(false);
  const [result, setResult] = useState<KennzeichenQueryResult | null>(null);

  useEffect(() => {
    getGroupsWithOebfvConfig()
      .then((groups) => {
        if (groups.length === 0) {
          setGroupId(null);
        } else if (firecall?.group && groups.includes(firecall.group)) {
          setGroupId(firecall.group);
        } else {
          setGroupId(groups[0]);
        }
      })
      .catch((err) => {
        console.error('Failed to load ÖBFV groups:', err);
        setGroupId(null);
      })
      .finally(() => setConfigLoading(false));
  }, [firecall?.group]);

  const handleSearch = async () => {
    if (!groupId) return;
    setQuerying(true);
    setResult(null);
    try {
      const res = await queryKennzeichen({
        groupId,
        platePrefix,
        plateNumber,
        system,
      });
      setResult(res);
    } catch (err) {
      console.error('Query failed:', err);
      setResult({ vehicles: [], noResult: true, system, error: 'upstream' });
    } finally {
      setQuerying(false);
    }
  };

  const fieldRows: { label: string; key: keyof Vehicle }[] = [
    { label: t('fieldAntrieb'), key: 'antrieb' },
    { label: t('fieldMarke'), key: 'marke' },
    { label: t('fieldName'), key: 'name' },
    { label: t('fieldType'), key: 'type' },
    { label: t('fieldMasse'), key: 'hoechstMasse' },
    { label: t('fieldErstzulassung'), key: 'erstzulassung' },
    { label: t('fieldFin'), key: 'fin' },
    { label: t('fieldVariante'), key: 'variante' },
    { label: t('fieldVersion'), key: 'version' },
  ];

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('title')}
      </Typography>

      {configLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      ) : !groupId ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          {t('noConfig')}
        </Alert>
      ) : (
        <>
          <ToggleButtonGroup
            color="primary"
            exclusive
            value={system}
            onChange={(_e, v) => v && setSystem(v)}
            sx={{ mb: 2 }}
          >
            <ToggleButton value="einsatz">{t('systemEinsatz')}</ToggleButton>
            <ToggleButton value="uebung">{t('systemUebung')}</ToggleButton>
          </ToggleButtonGroup>

          {system === 'einsatz' ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {t('warningEinsatz')}
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {t('infoUebung')}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label={t('authorityLabel')}
              value={platePrefix}
              onChange={(e) =>
                setPlatePrefix(e.target.value.toUpperCase().slice(0, 2))
              }
              slotProps={{ htmlInput: { maxLength: 2 } }}
              sx={{ flex: '0 0 30%' }}
            />
            <TextField
              label={t('plateLabel')}
              value={plateNumber}
              onChange={(e) =>
                setPlateNumber(e.target.value.toUpperCase().slice(0, 10))
              }
              slotProps={{ htmlInput: { maxLength: 10 } }}
              sx={{ flex: 1 }}
            />
          </Box>

          <Button
            variant="contained"
            color="success"
            fullWidth
            disabled={querying || !platePrefix || !plateNumber}
            onClick={handleSearch}
          >
            {querying ? <CircularProgress size={24} /> : t('searchButton')}
          </Button>

          {result && (
            <Box sx={{ mt: 4 }}>
              {result.error === 'no-token' && (
                <Alert severity="warning">{t('noConfig')}</Alert>
              )}
              {result.error === 'not-authorized' && (
                <Alert severity="error">{t('errorNotAuthorized')}</Alert>
              )}
              {result.error === 'upstream' && (
                <Alert severity="error">{t('errorGeneric')}</Alert>
              )}
              {!result.error && result.noResult && (
                <Alert severity="info">{t('noResult')}</Alert>
              )}
              {!result.error &&
                result.vehicles.map((vehicle, idx) => (
                  <Box key={idx} sx={{ mb: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      {result.vehicles.length > 1
                        ? t('vehicleHeading', { n: idx + 1 })
                        : t('resultTitle')}
                    </Typography>
                    <Table size="small">
                      <TableBody>
                        {fieldRows.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell sx={{ fontWeight: 'bold', width: '40%' }}>
                              {row.label}
                            </TableCell>
                            <TableCell>{vehicle[row.key]}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                ))}
            </Box>
          )}
        </>
      )}
    </Container>
  );
};

export default KennzeichenPage;
