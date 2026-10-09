'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import NextLink from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatCharge,
  formatLagerort,
  GERAET_BUCHUNG_COLLECTION,
  isBestandBuchung,
  type Geraet,
  type GeraetBestand,
  type GeraetBuchung,
} from '../../../common/geraet';
import { firestore } from '../../firebase/firebase';
import { GROUP_COLLECTION_ID } from '../../firebase/firestore';

/** Einträge je Seite — „Mehr laden" holt die nächsten. */
export const HISTORY_PAGE_SIZE = 50;

const EMPTY = '—';

export interface GeraetHistoryProps {
  groupId: string;
  geraet: Geraet;
  /** Die Lagerorte des Artikels — für Einträge ohne festgehaltenen Lagerort. */
  bestaende: GeraetBestand[];
}

/**
 * Die Historie eines Artikels aus `geraetBuchung`: Mengenbuchungen und
 * Protokolleinträge, neueste zuerst. Zugeklappt lädt nichts — erst das erste
 * Aufklappen liest die erste Seite, „Mehr laden" blättert mit `startAfter`.
 */
export default function GeraetHistory({ groupId, geraet, bestaende }: GeraetHistoryProps) {
  const t = useTranslations('geraete.historie');
  const tArt = useTranslations('firecallArt');
  const format = useFormatter();

  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<GeraetBuchung[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot>();
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const bestandById = useMemo(() => new Map(bestaende.map((b) => [b.id, b])), [bestaende]);
  const chargeById = useMemo(
    () => new Map((geraet.chargen ?? []).map((c) => [c.id, c])),
    [geraet.chargen],
  );

  const loadPage = useCallback(
    async (after?: QueryDocumentSnapshot) => {
      setLoading(true);
      setError(undefined);
      try {
        const constraints = [
          where('geraetId', '==', geraet.id),
          orderBy('createdAt', 'desc'),
          ...(after ? [startAfter(after)] : []),
          limit(HISTORY_PAGE_SIZE),
        ];
        const snap = await getDocs(
          query(
            collection(firestore, GROUP_COLLECTION_ID, groupId, GERAET_BUCHUNG_COLLECTION),
            ...constraints,
          ),
        );
        const page = snap.docs.map((d) => ({ ...(d.data() as GeraetBuchung), id: d.id }));
        setEntries((prev) => (after ? [...prev, ...page] : page));
        setLastDoc(snap.docs[snap.docs.length - 1]);
        setHasMore(snap.docs.length === HISTORY_PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoaded(true);
        setLoading(false);
      }
    },
    [groupId, geraet.id],
  );

  useEffect(() => {
    if (expanded && !loaded && !loading) void loadPage();
  }, [expanded, loaded, loading, loadPage]);

  const lagerortOf = (bestandId?: string) => {
    const b = bestandId ? bestandById.get(bestandId) : undefined;
    return b ? formatLagerort(b.lagerort) || b.lagerortKey : undefined;
  };

  const feldLabel = (feld: string) => {
    const key = `felder.${feld}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : feld;
  };

  const renderEntry = (e: GeraetBuchung) => {
    const lagerort = e.lagerortText || lagerortOf(e.bestandId);
    const ziel = e.art === 'umbuchung' ? lagerortOf(e.zielBestandId) : undefined;
    const lagerortLine = ziel ? `${lagerort ?? EMPTY} → ${ziel}` : lagerort;
    const showMenge = isBestandBuchung(e.art) && e.menge !== 0;
    const menge = showMenge
      ? [`${e.menge > 0 ? '+' : ''}${e.menge}`, geraet.einheit].filter(Boolean).join(' ')
      : undefined;
    const charge = e.chargeId ? chargeById.get(e.chargeId) : undefined;
    const date = new Date(e.createdAt);

    return (
      <ListItem key={e.id} divider disableGutters sx={{ display: 'block', py: 1 }}>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
            {Number.isNaN(date.getTime())
              ? e.createdAt
              : format.dateTime(date, { dateStyle: 'short', timeStyle: 'short' })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {e.createdByName || t('unknownUser')}
          </Typography>
          <Chip size="small" label={t(`arten.${e.art}`)} />
          {menge && (
            <Typography
              variant="body2"
              sx={{ fontWeight: 500, color: e.menge < 0 ? 'error.main' : 'success.main' }}
            >
              {menge}
            </Typography>
          )}
        </Stack>
        <Box sx={{ mt: 0.5 }}>
          {lagerortLine && (
            <Typography variant="body2" color="text.secondary">
              {lagerortLine}
            </Typography>
          )}
          {charge && (
            <Typography variant="body2" color="text.secondary">
              {formatCharge(charge)}
            </Typography>
          )}
          {e.firecallId && (
            <Typography variant="body2" component="div">
              <Link component={NextLink} href={`/einsatz/${e.firecallId}`}>
                {e.firecallName || e.firecallId}
              </Link>
              {e.firecallArt && e.firecallArt !== 'einsatz' && (
                <Chip size="small" label={tArt(e.firecallArt)} sx={{ ml: 1 }} />
              )}
            </Typography>
          )}
          {e.bemerkung && <Typography variant="body2">{e.bemerkung}</Typography>}
          {e.aenderungen?.map((a, i) => (
            <Typography key={`${a.feld}-${i}`} variant="body2" color="text.secondary">
              {`${feldLabel(a.feld)}: ${a.vorher || EMPTY} → ${a.nachher || EMPTY}`}
            </Typography>
          ))}
        </Box>
      </ListItem>
    );
  };

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, open) => setExpanded(open)}
      disableGutters
      sx={{ mt: 3 }}
      slotProps={{ transition: { unmountOnExit: true } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6">{t('title')}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {t('error', { error })}
          </Alert>
        )}
        {loaded && !error && entries.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('empty')}
          </Typography>
        )}
        {entries.length > 0 && <List dense disablePadding>{entries.map(renderEntry)}</List>}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {hasMore && !loading && (
          <Button size="small" onClick={() => loadPage(lastDoc)} sx={{ mt: 1 }}>
            {t('loadMore')}
          </Button>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
