'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { RisikoObjekt } from '../../common/gis-objects';
import {
  matchRisikoObjekte,
  type RisikoObjektMatchQuery,
} from '../../common/objektplan/risikoobjektMatch';
import { useFirebaseCollectionState } from '../../hooks/useFirebaseCollection';
import useFirecallLocations from '../../hooks/useFirecallLocations';
import type { Firecall, FirecallLocation } from '../firebase/firestore';
import ObjektplanDialog from './ObjektplanDialog';

/** Abfrage aus Einsatz und Einsatzorten: Lagen, Texte, Adressen. */
export function buildMatchQuery(
  firecall: Firecall,
  locations: Partial<FirecallLocation>[],
): RisikoObjektMatchQuery {
  const positions = [firecall, ...locations]
    .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
    .map((p) => ({ lat: p.lat as number, lng: p.lng as number }));
  const texts = [
    firecall.name,
    firecall.description,
    ...locations.flatMap((l) => [l.name, l.description]),
  ].filter((t): t is string => typeof t === 'string' && t.trim() !== '');
  const addresses = locations
    .filter((l) => l.street?.trim())
    .map((l) => ({ street: l.street as string, number: l.number }));
  const placeNames = [firecall.fw, ...locations.map((l) => l.city)].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== '',
  );
  return { positions, texts, addresses, placeNames };
}

/**
 * Mögliche Risikoobjekte zum Einsatz, gefunden über Lage, Adresse und Name.
 * Gelesen wird `risikoobjekt` direkt wie auf der Seite /risikoobjekte; der
 * Firestore-Cache hält die Liste auch offline. Ohne Treffer zeigt die
 * Komponente nichts. Hintergrund: docs/objektplaene.md.
 */
export default function RisikoobjektMatches({ firecall }: { firecall: Firecall }) {
  const t = useTranslations('risikoobjektMatch');
  const { records } = useFirebaseCollectionState<RisikoObjekt>({
    collectionName: 'risikoobjekt',
  });
  const { locations } = useFirecallLocations();
  const [selected, setSelected] = useState<RisikoObjekt | null>(null);

  const matches = useMemo(
    () => matchRisikoObjekte(records, buildMatchQuery(firecall, locations)),
    [records, firecall, locations],
  );

  if (matches.length === 0) return null;

  const distanceLabel = (m: number) =>
    m < 50
      ? t('distanceNear')
      : m < 1000
        ? t('distance', { meters: Math.round(m / 10) * 10 })
        : t('distanceKm', { km: (m / 1000).toFixed(1).replace('.', ',') });

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" component="h2">
        {t('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('hint')}
      </Typography>
      <List dense>
        {matches.map((m) => (
          <ListItemButton key={m.objekt.id} divider onClick={() => setSelected(m.objekt)}>
            <ListItemText
              primary={m.objekt.name}
              secondary={[m.objekt.adresse, m.objekt.risikogruppe].filter(Boolean).join(' · ')}
            />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: 'flex-end', ml: 1 }}>
              {m.address && (
                <Chip
                  size="small"
                  color={m.address === 'exact' ? 'primary' : 'default'}
                  label={m.address === 'exact' ? t('reasonAddress') : t('reasonStreet')}
                />
              )}
              {m.name && <Chip size="small" color="primary" label={t('reasonName')} />}
              {m.distanceM !== undefined && (
                <Chip size="small" variant="outlined" label={distanceLabel(m.distanceM)} />
              )}
            </Box>
          </ListItemButton>
        ))}
      </List>
      {selected && (
        <ObjektplanDialog open onClose={() => setSelected(null)} objekt={selected} />
      )}
    </Box>
  );
}
