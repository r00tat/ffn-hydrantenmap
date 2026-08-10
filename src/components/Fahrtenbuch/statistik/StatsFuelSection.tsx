'use client';

import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { FUEL_TYPES } from '../../../common/fahrtenbuch';
import type {
  FuelStats,
  StatsSeries,
} from '../../../common/fahrtenbuchStatsSeries';
import StatsBarChart from './StatsBarChart';

export interface StatsFuelSectionProps {
  series: StatsSeries;
  fuelStats: FuelStats;
  bucketLabelOf: (key: string) => string;
  onBucketClick?: (bucketKey: string) => void;
}

/**
 * Betriebsmittel: getankte Mengen über die Zeit und der genäherte Verbrauch je
 * Fahrzeug.
 *
 * Der Verbrauch steht nur als Summe über den ganzen Zeitraum, nicht als
 * Zeitreihe: Eine Tankung füllt den Tank für Fahrten, die teils außerhalb des
 * Abschnitts liegen. Ein Monatswert l/100 km schwankte dadurch zwischen null
 * und dem Doppelten und wäre keine Auskunft, sondern ein Zufall.
 */
export default function StatsFuelSection({
  series,
  fuelStats,
  bucketLabelOf,
  onBucketClick,
}: StatsFuelSectionProps) {
  const t = useTranslations('fahrtenbuch');
  const format = useFormatter();

  const liters = (value: number | null) =>
    value === null
      ? ''
      : `${format.number(value, { maximumFractionDigits: 1 })} ${t('fuelUnit')}`;

  const usedFuels = FUEL_TYPES.filter(
    (fuel) => (fuelStats.totals[fuel] ?? 0) > 0,
  );

  if (usedFuels.length === 0) {
    return (
      <Typography color="text.secondary">{t('stats.fuel.none')}</Typography>
    );
  }

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, lg: 7 }}>
        <StatsBarChart
          series={series}
          labelOf={bucketLabelOf}
          stackLabelOf={(key) => t(`fuel.${key}` as 'fuel.diesel')}
          stackBy="fuel"
          valueFormatter={liters}
          yAxisLabel={t('fuelUnit')}
          onBucketClick={onBucketClick}
        />
      </Grid>
      <Grid size={{ xs: 12, lg: 5 }}>
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('vehicle')}</TableCell>
                {usedFuels.map((fuel) => (
                  <TableCell align="right" key={fuel}>
                    {t(`fuel.${fuel}` as 'fuel.diesel')}
                  </TableCell>
                ))}
                <TableCell align="right">km</TableCell>
                <TableCell align="right">{t('stats.consumptionUnit')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {fuelStats.perVehicle.map((stat) => (
                <TableRow key={stat.vehicleId}>
                  <TableCell>{stat.name}</TableCell>
                  {usedFuels.map((fuel) => (
                    <TableCell align="right" key={fuel}>
                      {stat.liters[fuel] === undefined
                        ? '–'
                        : format.number(stat.liters[fuel] as number, {
                            maximumFractionDigits: 1,
                          })}
                    </TableCell>
                  ))}
                  <TableCell align="right">
                    {stat.distanceKm > 0
                      ? format.number(stat.distanceKm, {
                          maximumFractionDigits: 0,
                        })
                      : '–'}
                  </TableCell>
                  <TableCell align="right">
                    {stat.consumptionPer100Km === undefined
                      ? '–'
                      : format.number(stat.consumptionPer100Km, {
                          maximumFractionDigits: 1,
                        })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Alert severity="info" sx={{ mt: 1 }}>
          {t('stats.consumptionHint')}
        </Alert>
      </Grid>
    </Grid>
  );
}
