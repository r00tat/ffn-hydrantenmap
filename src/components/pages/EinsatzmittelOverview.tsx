'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useContext, useMemo } from 'react';
import { FirecallContext } from '../../hooks/useFirecall';
import { AssignableUnit, FirecallItem, FirecallLocation } from '../firebase/firestore';
import LocationSelect from './LocationSelect';
import { locationLabel } from './location-assignment';
import {
  DeploymentStatus,
  OverviewEntry,
  deploymentStatus,
  groupByLocation,
} from './einsatzmittel-overview';
import { StrengthRow, calculateStrength } from './fahrzeuge-utils';

/** Ohne `onAssign` bleibt die Übersicht reine Anzeige. */
type OnAssign = (item: FirecallItem, locationId: string) => void;

interface Assigning {
  locations: FirecallLocation[];
  onAssign: OnAssign;
}

const STATUS_COLOR: Record<DeploymentStatus, 'warning' | 'success' | 'default'> = {
  alerted: 'warning',
  arrived: 'success',
  departed: 'default',
};

function ItemLine({
  item,
  row,
  nested = false,
  assigning,
}: {
  item: FirecallItem;
  row?: StrengthRow;
  nested?: boolean;
  assigning?: Assigning;
}) {
  const t = useTranslations('einsatzmittel.overview');
  // Fahrzeug und Einheit tragen beide Zeiten und Feuerwehr.
  const unit = item as AssignableUnit;
  const status = deploymentStatus(unit);
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1,
        pl: nested ? 3 : 0,
        py: 0.25,
      }}
    >
      <Typography
        variant="body2"
        sx={{ fontWeight: nested ? 'normal' : 'bold', flexGrow: 1 }}
        component="div"
      >
        {item.name}
        {unit.fw && (
          <Typography variant="caption" color="text.secondary" component="span">
            {' '}
            {unit.fw}
          </Typography>
        )}
      </Typography>
      {status && (
        <Chip size="small" color={STATUS_COLOR[status]} label={t(`status.${status}`)} />
      )}
      {row && (
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 24, textAlign: 'right' }}>
          {row.mann}
        </Typography>
      )}
      {assigning && item.id && (
        <LocationSelect
          item={item}
          locations={assigning.locations}
          onAssign={(locationId) => assigning.onAssign(item, locationId)}
        />
      )}
    </Box>
  );
}

function Entry({
  entry,
  rows,
  assigning,
}: {
  entry: OverviewEntry;
  rows: Map<string | undefined, StrengthRow>;
  assigning?: Assigning;
}) {
  return (
    <Box sx={{ mb: 0.5 }}>
      <ItemLine item={entry.item} row={rows.get(entry.item.id)} assigning={assigning} />
      {entry.children.map((child) => (
        <ItemLine
          key={child.id}
          item={child}
          row={rows.get(child.id)}
          nested
          assigning={assigning}
        />
      ))}
    </Box>
  );
}

/**
 * Was wo steht: je Einsatzort eine Karte mit den taktischen Einheiten, ihren
 * Fahrzeugen darunter, dem Stand (alarmiert, eingetroffen, abgerückt) und der
 * Stärke. Die Tabelle beantwortet „wie viele", diese Ansicht „wo".
 */
export default function EinsatzmittelOverview({
  items,
  locations,
  onAssign,
}: {
  items: FirecallItem[];
  locations: FirecallLocation[];
  /** Versetzt ein Einsatzmittel; eine Einheit nimmt ihre Fahrzeuge mit. */
  onAssign?: OnAssign;
}) {
  const t = useTranslations('einsatzmittel.overview');
  const assigning = useMemo(
    () => (onAssign ? { locations, onAssign } : undefined),
    [locations, onAssign],
  );
  const { crewAssignments } = useContext(FirecallContext);
  const groups = useMemo(() => groupByLocation(items, locations), [items, locations]);
  const rows = useMemo(
    () =>
      new Map(
        calculateStrength(items, crewAssignments ?? []).rows.map((r) => [r.id, r]),
      ),
    [items, crewAssignments],
  );

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {groups.map((group) => {
        const title = group.location ? locationLabel(group.location) : t('unassigned');
        const ids = group.entries.flatMap((e) => [e.item, ...e.children]).map((i) => i.id);
        // Wie in der Tabelle: Eine Einheit mit Fahrzeugen zählt nicht selbst,
        // sonst stünde jede Person zweimal in der Summe.
        const mann = ids
          .map((id) => rows.get(id))
          .filter((r): r is StrengthRow => !!r && !r.childCount)
          .reduce((sum, r) => sum + r.mann, 0);
        return (
          <Grid key={group.location?.id ?? 'unassigned'} size={{ xs: 12, md: 6, lg: 4 }}>
            <Paper component="section" sx={{ p: 2, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
                <Typography variant="h6" component="h3" sx={{ flexGrow: 1 }}>
                  {title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('strength', { count: mann })}
                </Typography>
              </Box>
              {group.entries.map((entry) => (
                <Entry key={entry.item.id} entry={entry} rows={rows} assigning={assigning} />
              ))}
            </Paper>
          </Grid>
        );
      })}
    </Grid>
  );
}
