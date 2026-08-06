'use client';

import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import type { FahrtenbuchVehicle } from '../../common/fahrtenbuch';

export interface FahrtenbuchVehicleCardProps {
  groupId: string;
  vehicle: FahrtenbuchVehicle;
  /**
   * Fallback für Fahrzeuge, deren Cache älter ist als die Felder
   * `lastEntryHasDefect`/`lastDriverName` am Fahrzeugdokument. Wird nur
   * benutzt, wenn das Fahrzeug das jeweilige Feld nicht hat — der Cache am
   * Fahrzeug ist immer aktuell, die Ableitung aus dem geladenen
   * Eintragsfenster nicht.
   */
  lastEntryHasDefect?: boolean;
  /** Fallback für den Fahrer der letzten Fahrt, siehe oben. */
  lastDriverName?: string;
  onAddTrip: (vehicleId: string) => void;
}

/**
 * Übersichtskarte eines Fahrzeugs: Stammdaten, aktuelle Zählerstände, letzte
 * Fahrt und ein Direkt-Button zum Eintragen. Die Zähler kommen ausschließlich
 * aus den Definitionen des Fahrzeugs — ein Boot zeigt Betriebsstunden, ein
 * Anhänger gar nichts. Kilometer werden nirgends vorausgesetzt.
 */
export default function FahrtenbuchVehicleCard({
  groupId,
  vehicle,
  lastEntryHasDefect,
  lastDriverName,
  onAddTrip,
}: FahrtenbuchVehicleCardProps) {
  const t = useTranslations('fahrtenbuch');
  const format = useFormatter();

  const lastEntryDate = vehicle.lastEntryAt
    ? new Date(vehicle.lastEntryAt)
    : undefined;
  const lastEntryValid =
    lastEntryDate !== undefined && !Number.isNaN(lastEntryDate.getTime());

  // Der Cache am Fahrzeug gewinnt — er wird serverseitig nach jeder Fahrt
  // geschrieben und stammt garantiert von derselben Fahrt wie `lastEntryAt`.
  // `?? ` und nicht `||`: ein gecachtes `false` heißt „kein Defekt" und darf
  // nicht auf den abgeleiteten Wert zurückfallen.
  const hasDefect = vehicle.lastEntryHasDefect ?? lastEntryHasDefect;
  const driverName = vehicle.lastDriverName ?? lastDriverName;

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardActionArea
        component={Link}
        href={`/fahrtenbuch/${groupId}/${vehicle.id}`}
        sx={{ flexGrow: 1 }}
      >
        <CardContent>
          <Typography variant="h6">{vehicle.name}</Typography>
          {vehicle.kennzeichen && (
            <Typography variant="body2" color="text.secondary">
              {vehicle.kennzeichen}
            </Typography>
          )}
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ mt: 1, flexWrap: 'wrap' }}
          >
            {(vehicle.counters ?? []).map((def) => {
              const value = vehicle.lastCounters?.[def.id];
              if (value === undefined) return null;
              const label = def.labelKey
                ? t(def.labelKey as 'counters.km')
                : def.label;
              return (
                <Chip
                  key={def.id}
                  size="small"
                  label={`${label}: ${value} ${def.unit}`}
                />
              );
            })}
          </Stack>
          {lastEntryValid && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {`${t('lastEntry')}: ${format.dateTime(lastEntryDate, {
                dateStyle: 'short',
                timeStyle: 'short',
              })}${driverName ? ` — ${driverName}` : ''}`}
            </Typography>
          )}
          {hasDefect && (
            <Chip
              size="small"
              color="warning"
              icon={<WarningAmberIcon />}
              label={t('defectReported')}
              sx={{ mt: 1 }}
            />
          )}
        </CardContent>
      </CardActionArea>
      <CardActions>
        <Button size="small" onClick={() => onAddTrip(vehicle.id as string)}>
          {t('addTrip')}
        </Button>
      </CardActions>
    </Card>
  );
}
