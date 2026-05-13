'use client';

import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import useHazmatDb from '../../hooks/useHazmatDb';

export default function Schadstoffdatenbank() {
  const t = useTranslations('hazmatDb');
  const [unNumber, setUnNumber] = useState('');
  const [materialName, setMaterialName] = useState('');
  const [hazmatRecords, isInProgress] = useHazmatDb(unNumber, materialName);

  const openEricards = useCallback((num: string, nam: string) => {
    let form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://www.ericards.net/psp/ericards.psp_search_result';
    form.target = '_blank';

    const fields = {
      unnumber: num,
      substance: nam,
      operators: 'OR',
    };

    Object.entries(fields).forEach(([key, value]) => {
      const element = document.createElement('input');
      element.name = key;
      element.value = value;
      form.appendChild(element);
    });

    document.body.appendChild(form);
    form.submit();
    form.parentNode?.removeChild(form);
  }, []);

  return (
    <>
      <Typography variant="h5" gutterBottom>
        {t('title')}
      </Typography>
      <TextField
        autoFocus
        margin="dense"
        id="unNumber"
        label={t('unNumberLabel')}
        type="text"
        fullWidth
        variant="standard"
        slotProps={{ htmlInput: { tabIndex: 1 } }}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          setUnNumber(event.target.value);
        }}
        value={unNumber}
      />
      <TextField
        margin="dense"
        id="materialName"
        label={t('materialNameLabel')}
        type="text"
        fullWidth
        variant="standard"
        slotProps={{ htmlInput: { tabIndex: 2 } }}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          setMaterialName(event.target.value);
        }}
        value={materialName}
      />
      {isInProgress && <CircularProgress />}
      <Button
        variant="contained"
        color="primary"
        onClick={() => {
          openEricards(unNumber, materialName);
        }}
      >
        {t('searchEricards')}
      </Button>
      {unNumber === '' && materialName === '' && (
        <Typography variant="body1">{t('instructions')}</Typography>
      )}
      {(unNumber !== '' || materialName !== '') && (
        <>
          {hazmatRecords.map((r) => (
            <Card key={r.unNumber} variant="outlined">
              <CardContent>
                <Typography color="text.secondary">{r.unNumber}</Typography>
                <Typography>{r.name}</Typography>
                <Typography variant="caption">{t('suitParameters')}</Typography>
                <Typography variant="body2">
                  {t('resistanceClass', { value: r.resistanceTemperature ?? '' })}
                  <br />
                  {t('resistanceTime', { value: r.resistanceTime ?? '' })}
                  <br />
                  {t('damage', { value: r.damage ?? '' })}
                </Typography>
              </CardContent>
              <CardActions>
                <Button
                  size="small"
                  onClick={() => {
                    openEricards(r.unNumber, '');
                  }}
                >
                  {t('ericards')}
                </Button>
              </CardActions>
            </Card>
          ))}
        </>
      )}
    </>
  );
}
