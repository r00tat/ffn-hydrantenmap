'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { SyntheticEvent, useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import useHazmatDb from '../../hooks/useHazmatDb';
import CircularProgress from '@mui/material/CircularProgress';
import dynamic from 'next/dynamic';

const EnergySpectrum = dynamic(() => import('./EnergySpectrum'), {
  ssr: false,
  loading: () => null,
});
import Strahlenschutz from './Strahlenschutz';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`schadstoff-tabpanel-${index}`}
      aria-labelledby={`schadstoff-tab-${index}`}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `schadstoff-tab-${index}`,
    'aria-controls': `schadstoff-tabpanel-${index}`,
  };
}

const TAB_ROUTES = ['', 'strahlenschutz', 'energiespektrum'] as const;

function pathnameToTab(pathname: string): number {
  const segment = pathname.replace(/^\/schadstoff\/?/, '').replace(/\/$/, '');
  const idx = TAB_ROUTES.indexOf(segment as (typeof TAB_ROUTES)[number]);
  return idx >= 0 ? idx : 0;
}

export default function SchadstoffPage() {
  const pathname = usePathname();
  const router = useRouter();
  const tabValue = pathnameToTab(pathname);

  const [unNumber, setUnNumber] = useState('');
  const [materialName, setMaterialName] = useState('');
  const [hazmatRecords, isInProgress] = useHazmatDb(unNumber, materialName);

  const handleTabChange = useCallback(
    (_event: SyntheticEvent, newValue: number) => {
      const route = TAB_ROUTES[newValue];
      router.push(`/schadstoff${route ? `/${route}` : ''}`);
    },
    [router]
  );

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
        <Typography variant="h4" gutterBottom>
          Schadstoff
        </Typography>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="Schadstoff Tabs" variant="scrollable" scrollButtons="auto">
            <Tab label="Schadstoffdatenbank" {...a11yProps(0)} />
            <Tab label="Strahlenschutz" {...a11yProps(1)} />
            <Tab label="Energiespektrum" {...a11yProps(2)} />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
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
              Gib die Stoffnummer oder den Stoffnamen ein, um Informationen zu
              dem Stoff zu erhalten.
            </Typography>
          )}
          {(unNumber !== '' || materialName !== '') && (
            <>
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
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Strahlenschutz />
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <EnergySpectrum />
        </TabPanel>
      </Box>
    </>
  );
}
