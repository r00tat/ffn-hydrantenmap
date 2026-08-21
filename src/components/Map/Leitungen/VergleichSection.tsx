'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import type { FoerderungView } from '../../FirecallItems/elements/connection/foerderung/foerderung';
import type { PendelView } from '../../FirecallItems/elements/connection/pendel/pendelverkehr';
import type {
  Vergleich,
  VergleichAnnahmen,
  VergleichSeite,
} from '../../FirecallItems/elements/connection/pendel/versorgungVergleich';
import { parseNumber, round } from './panelNumbers';

/**
 * „Leitung legen oder pendeln?" — die Gegenüberstellung mit der Empfehlung
 * obenan.
 *
 * Die Empfehlung steht über der Tabelle und nicht darunter: Sie ist die Antwort
 * auf die Frage, mit der man den Vergleich aufschlägt. Die Tabelle darunter ist
 * die Begründung, die Annahmen liegen im Aufklapper.
 */

export interface VergleichSectionProps {
  vergleich: Vergleich;
  foerderung?: FoerderungView;
  pendel?: PendelView;
  annahmen: Partial<VergleichAnnahmen>;
  onAnnahmeChange: <K extends keyof VergleichAnnahmen>(
    key: K,
    value: number
  ) => void;
}

export default function VergleichSection({
  vergleich,
  foerderung,
  pendel,
  annahmen,
  onAnnahmeChange,
}: VergleichSectionProps) {
  const t = useTranslations('loeschwasserfoerderung');

  const flow = (seite: VergleichSeite) =>
    seite.menge !== undefined
      ? t('flowValue', { value: Math.round(seite.menge) })
      : t('notAvailable');

  const setup = (seite: VergleichSeite) =>
    seite.aufbauzeit !== undefined
      ? `${round(seite.aufbauzeit)} ${t('minute')}`
      : t('notAvailable');

  const vehicles = (seite: VergleichSeite) =>
    seite.fahrzeuge !== undefined ? `${seite.fahrzeuge}` : t('notAvailable');

  // Woran die Variante als erstes scheitert. Nicht „Risiken" im Allgemeinen —
  // die Karte kennt keine, aber sie kennt die Engstelle, die die Rechnung
  // gefunden hat.
  const pendelBottleneck = pendel?.result?.begrenztDurchFuellstelle
    ? t('bottleneckFillStation')
    : pendel?.result?.faltbehaelter
      ? t('bottleneckBuffer')
      : pendel?.streckeSource === 'detour'
        ? t('bottleneckEstimatedDistance')
        : t('bottleneckNone');

  const foerderungBottleneck =
    foerderung?.result && !foerderung.result.darstellbar
      ? t('bottleneckNotFeasible')
      : foerderung
        ? t('bottleneckCouplings', { count: foerderung.hoseCount })
        : t('notAvailable');

  return (
    <>
      <Alert
        severity={
          vergleich.empfehlung === 'keine'
            ? 'error'
            : vergleich.empfehlung === 'unklar'
              ? 'info'
              : 'success'
        }
        sx={{ mt: 1.5 }}
      >
        {vergleich.empfehlung === 'pendel' && t('recommendShuttle')}
        {vergleich.empfehlung === 'foerderung' && t('recommendRelay')}
        {vergleich.empfehlung === 'keine' &&
          t('recommendNone', { required: Math.round(vergleich.sollMenge) })}
        {vergleich.empfehlung === 'unklar' && t('recommendUnclear')}
      </Alert>

      {vergleich.kipppunkt !== undefined && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 1 }}
        >
          {t('tippingHint', { metres: Math.round(vergleich.kipppunkt) })}
        </Typography>
      )}

      <Box sx={{ overflowX: 'auto', mt: 1.5 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell align="right">{t('columnShuttle')}</TableCell>
              <TableCell align="right">{t('columnRelay')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>{t('rowFlow')}</TableCell>
              <TableCell align="right">{flow(vergleich.pendel)}</TableCell>
              <TableCell align="right">{flow(vergleich.foerderung)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{t('rowSetupTime')}</TableCell>
              <TableCell align="right">{setup(vergleich.pendel)}</TableCell>
              <TableCell align="right">{setup(vergleich.foerderung)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{t('rowVehicles')}</TableCell>
              <TableCell align="right">{vehicles(vergleich.pendel)}</TableCell>
              <TableCell align="right">
                {vehicles(vergleich.foerderung)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{t('rowBottleneck')}</TableCell>
              <TableCell align="right">{pendelBottleneck}</TableCell>
              <TableCell align="right">{foerderungBottleneck}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Box>

      <Accordion disableGutters elevation={0} sx={{ mt: 1.5 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">{t('assumptions')}</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {/* Ausdrücklich als Planungswerte gekennzeichnet: Anders als die
              Reibungsverluste stehen sie in keiner Unterlage. */}
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('assumptionsHint')}
          </Alert>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <TextField
                size="small"
                type="number"
                fullWidth
                label={t('layingRate')}
                value={annahmen.verlegeleistung ?? vergleich.annahmen.verlegeleistung}
                onChange={(event) =>
                  onAnnahmeChange(
                    'verlegeleistung',
                    parseNumber(
                      event.target.value,
                      vergleich.annahmen.verlegeleistung
                    )
                  )
                }
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                size="small"
                type="number"
                fullWidth
                label={`${t('pumpSetupTime')} (${t('minute')})`}
                value={
                  annahmen.pumpenRuestzeit ?? vergleich.annahmen.pumpenRuestzeit
                }
                onChange={(event) =>
                  onAnnahmeChange(
                    'pumpenRuestzeit',
                    parseNumber(
                      event.target.value,
                      vergleich.annahmen.pumpenRuestzeit
                    )
                  )
                }
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>
    </>
  );
}
