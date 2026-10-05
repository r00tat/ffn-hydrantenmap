'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  formatLagerort,
  GERAET_EINSATZ_COLLECTION,
  type GeraetEinsatz,
} from '../../../common/geraet';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import useFirecall from '../../../hooks/useFirecall';
import useFirecallWriteAccess from '../../../hooks/useFirecallWriteAccess';
import useGeraete from '../../../hooks/useGeraete';
import usePendingDocIds from '../../../hooks/usePendingDocIds';
import useVehicles from '../../../hooks/useVehicles';
import { isOffline, onReconnect } from '../../../lib/connectivity';
import ConfirmDialog from '../../dialogs/ConfirmDialog';
import { FIRECALL_COLLECTION_ID } from '../../firebase/firestore';
import OfflineListHint from '../../site/OfflineListHint';
import PendingSyncIcon from '../../site/PendingSyncIcon';
import GeraetEinsatzDialog from './GeraetEinsatzDialog';
import { isPendingBooking } from './geraetEinsatzLogic';
import { deleteGeraetEinsatz, resyncPendingBooking } from './geraetEinsatzWrites';
import useGeraetEinsatz from './useGeraetEinsatz';

type DialogState = { mode: 'add' } | { mode: 'edit'; entry: GeraetEinsatz } | null;

/**
 * Abschnitt `/einsatz/{id}/geraete`: Geräte, die im Einsatz verwendet wurden,
 * und verbrauchtes Material. Die Section-Registry lädt ohne Props, der
 * Einsatz kommt aus dem Context.
 *
 * Geräte werden nur zugeordnet; Verbrauchsmaterial bucht vom gewählten
 * Lagerort ab. Die Liste kommt aus dem lokalen Cache und ist offline
 * vollständig, soweit sie auf diesem Gerät geschrieben wurde.
 *
 * `embedded`: als Abschnitt der Einsatz-Detailseite — ohne Seitenrahmen,
 * Überschrift und Einleitung, die trägt dort der aufklappbare Abschnitt.
 */
export default function GeraeteEinsatzSection({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations('geraetEinsatz');
  const format = useFormatter();
  const firecall = useFirecall();
  const firecallId = firecall.id && firecall.id !== 'unknown' ? firecall.id : undefined;
  const groupId = firecall.group;
  const { email, uid, groups } = useFirebaseLogin();
  const canWrite = useFirecallWriteAccess();
  // Den Abgleich darf nur ein Mitglied der Gruppe anstoßen (der Server prüft
  // es) — Einsatz-Gäste sehen die Artikel nicht und buchen nie ab.
  const isGroupMember = !!groupId && (groups ?? []).includes(groupId);

  const {
    geraete,
    bestaendeByGeraet,
    bestandById,
    fromCache: geraeteFromCache,
  } = useGeraete(groupId);
  const { entries, fromCache } = useGeraetEinsatz(firecallId);
  const { vehicles } = useVehicles();
  const pendingIds = usePendingDocIds(
    firecallId ? [FIRECALL_COLLECTION_ID, firecallId, GERAET_EINSATZ_COLLECTION] : null,
  );

  const [dialog, setDialog] = useState<DialogState>(null);
  const [toDelete, setToDelete] = useState<GeraetEinsatz | null>(null);

  const vehicleNames = useMemo(
    () => vehicles.map((v) => v.name).filter((name): name is string => !!name),
    [vehicles],
  );

  const assignedIds = useMemo(() => entries.map((e) => e.geraetId), [entries]);

  const geraetById = useMemo(() => new Map(geraete.map((g) => [g.id, g])), [geraete]);

  // Sicherheitsnetz: Ein Verbrauch, der „noch nicht gebucht" ist und keinen
  // offenen Schreibvorgang mehr hat, wird einmal je Aufruf der Seite und je
  // Reconnect erneut abgeglichen. Sonst bliebe er hängen, wenn die App
  // zwischen dem lokalen Schreiben und dem Anstoßen geschlossen wurde.
  const [reconnects, setReconnects] = useState(0);
  useEffect(() => onReconnect(() => setReconnects((n) => n + 1)), []);
  const resynced = useRef({ round: -1, ids: new Set<string>() });
  useEffect(() => {
    if (!firecallId || !canWrite || !isGroupMember || isOffline()) return;
    if (resynced.current.round !== reconnects) {
      resynced.current = { round: reconnects, ids: new Set() };
    }
    const done = resynced.current.ids;
    for (const entry of entries) {
      if (!isPendingBooking(entry) || pendingIds.has(entry.id) || done.has(entry.id)) continue;
      done.add(entry.id);
      resyncPendingBooking(firecallId, entry);
    }
  }, [entries, pendingIds, firecallId, canWrite, isGroupMember, reconnects]);

  if (!firecallId) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Alert severity="info">{t('noFirecall')}</Alert>
      </Container>
    );
  }

  const amountText = (entry: GeraetEinsatz): string | undefined => {
    if (typeof entry.stunden === 'number') {
      return t('amountHours', { count: entry.stunden });
    }
    if (typeof entry.menge === 'number') {
      const einheit = geraetById.get(entry.geraetId)?.einheit ?? t('pieces');
      return t('amountPieces', { count: entry.menge, einheit });
    }
    return undefined;
  };

  const lagerortText = (entry: GeraetEinsatz): string | undefined => {
    if (entry.art !== 'verbraucht') return undefined;
    const b = entry.bestandId ? bestandById.get(entry.bestandId) : undefined;
    return b ? formatLagerort(b.lagerort) : t('lagerortUnknown');
  };

  const Frame = embedded ? EmbeddedFrame : PageFrame;

  return (
    <Frame>
      <Stack
        direction="row"
        spacing={2}
        sx={{
          mb: 1,
          alignItems: 'center',
          justifyContent: embedded ? 'flex-end' : 'space-between',
        }}
      >
        {!embedded && <Typography variant="h4">{t('title')}</Typography>}
        {canWrite && groupId && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialog({ mode: 'add' })}
          >
            {t('add')}
          </Button>
        )}
      </Stack>
      {!embedded && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('intro')}
        </Typography>
      )}

      {!groupId && <Alert severity="info">{t('noGroup')}</Alert>}
      {!canWrite && <Alert severity="info">{t('readOnly')}</Alert>}

      <OfflineListHint fromCache={fromCache || geraeteFromCache} empty={entries.length === 0} />

      {entries.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t('empty')}
        </Typography>
      ) : (
        <List>
          {entries.map((entry) => {
            const amount = amountText(entry);
            const lagerort = lagerortText(entry);
            const secondary = [
              amount,
              lagerort,
              entry.zeitpunkt
                ? format.dateTime(new Date(entry.zeitpunkt), {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })
                : undefined,
              entry.bemerkung,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <ListItem
                key={entry.id}
                divider
                secondaryAction={
                  canWrite && (
                    <Box>
                      <Tooltip title={t('edit')}>
                        <IconButton
                          aria-label={t('edit')}
                          onClick={() => setDialog({ mode: 'edit', entry })}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('delete')}>
                        <IconButton aria-label={t('delete')} onClick={() => setToDelete(entry)}>
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )
                }
                sx={{ pr: canWrite ? 12 : 2 }}
              >
                <ListItemText
                  primary={
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <span>{entry.geraetName}</span>
                      <Chip
                        size="small"
                        color={entry.art === 'verbraucht' ? 'warning' : 'default'}
                        label={
                          entry.art === 'verbraucht' ? t('artVerbraucht') : t('artZugeordnet')
                        }
                      />
                      {isPendingBooking(entry) && (
                        <Tooltip title={t('notBookedHint')}>
                          <Chip
                            size="small"
                            variant="outlined"
                            icon={<HourglassEmptyIcon />}
                            label={t('notBooked')}
                          />
                        </Tooltip>
                      )}
                      {pendingIds.has(entry.id) && <PendingSyncIcon />}
                    </Stack>
                  }
                  secondary={secondary}
                  slotProps={{ primary: { component: 'div' } }}
                />
              </ListItem>
            );
          })}
        </List>
      )}

      {dialog && groupId && (
        <GeraetEinsatzDialog
          onClose={() => setDialog(null)}
          firecallId={firecallId}
          groupId={groupId}
          geraete={geraete}
          bestaendeByGeraet={bestaendeByGeraet}
          vehicleNames={vehicleNames}
          assignedIds={assignedIds}
          createdBy={email ?? uid ?? ''}
          entry={dialog.mode === 'edit' ? dialog.entry : undefined}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title={t('deleteTitle')}
          text={t(toDelete.art === 'verbraucht' ? 'deleteTextVerbraucht' : 'deleteText', {
            name: toDelete.geraetName,
          })}
          yes={t('delete')}
          no={t('cancel')}
          onConfirm={(confirmed) => {
            if (confirmed) deleteGeraetEinsatz(firecallId, toDelete);
            setToDelete(null);
          }}
        />
      )}
    </Frame>
  );
}

function PageFrame({ children }: { children: ReactNode }) {
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {children}
    </Container>
  );
}

function EmbeddedFrame({ children }: { children: ReactNode }) {
  return <Box>{children}</Box>;
}
