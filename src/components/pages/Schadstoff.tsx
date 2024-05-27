'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';
import useHazmatDb from '../../hooks/useHazmatDb';
import CircularProgress from '@mui/material/CircularProgress';

export default function SchadstoffPage() {
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
      <Box sx={{ p: 2, m: 2 }}>
        <Typography variant="h3" gutterBottom>
          Schadstoff
        </Typography>

        <TextField
          autoFocus
          margin="dense"
          id="unNumber"
          label="Stoffnummer (UN Nummer)"
          type="text"
          fullWidth
          variant="standard"
          inputProps={{ tabIndex: 1 }}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setUnNumber(event.target.value);
          }}
          value={unNumber}
        />
        <TextField
          margin="dense"
          id="materialName"
          label="Stoff Name"
          type="text"
          fullWidth
          variant="standard"
          inputProps={{ tabIndex: 2 }}
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
          Suche in den Ericards nach aktuellen Eingaben
        </Button>
        {unNumber === '' && materialName === '' && (
          <Typography variant="body1">
            Gib die Stoffnummer oder den Stoffnamen ein, um Informationen zu dem
            Stoff zu erhalten.
          </Typography>
        )}
        {(unNumber !== '' || materialName !== '') && (
          <>
            {/* <Typography variant="body1">
              Stoffe gefunden:
              {JSON.stringify(hazmatRecords)}
            </Typography> */}
            {hazmatRecords.map((r) => (
              <Card key={r.unNumber} variant="outlined">
                <CardContent>
                  <Typography color="text.secondary">{r.unNumber}</Typography>
                  <Typography>{r.name}</Typography>
                  <Typography variant="caption">
                    Schutzanzug Parameter
                  </Typography>
                  <Typography variant="body2">
                    Resistenzgrad: Klasse {r.resistanceTemperature}
                    <br />
                    Zeitliche Resistenz: {r.resistanceTime}
                    <br />
                    Beschädigung: {r.damage}
                  </Typography>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    onClick={() => {
                      openEricards(r.unNumber, '');
                    }}
                  >
                    Ericards
                  </Button>
                </CardActions>
              </Card>
            ))}
          </>
        )}
      </Box>
    </>
  );
}
