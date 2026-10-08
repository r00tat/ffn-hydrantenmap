'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  formatCharge,
  formatLagerort,
  GERAET_EINSATZ_COLLECTION,
  type GeraetEinsatz,
} from '../../../common/geraet';
import { groupEntriesBySet, type EinsatzListItem } from '../../../common/geraetSet';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import useFirecall from '../../../hooks/useFirecall';
import useFirecallWriteAccess from '../../../hooks/useFirecallWriteAccess';
import useGeraete from '../../../hooks/useGeraete';
import useGeraetSets from '../../../hooks/useGeraetSets';
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
type SetGroup = Extract<EinsatzListItem, { kind: 'set' }>;

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
  // Sets lesen nur Gruppenmitglieder (Firestore-Regel) — Gäste erfassen
  // einzelne Artikel.
  const { sets } = useGeraetSets(isGroupMember ? groupId : undefined);
  const { entries, fromCache } = useGeraetEinsatz(firecallId);
  const { vehicles } = useVehicles();
  const pendingIds = usePendingDocIds(
    firecallId ? [FIRECALL_COLLECTION_ID, firecallId, GERAET_EINSATZ_COLLECTION] : null,
  );

  const [dialog, setDialog] = useState<DialogState>(null);
  const [toDelete, setToDelete] = useState<GeraetEinsatz | null>(null);
  const [setToRemove, setSetToRemove] = useState<SetGroup | null>(null);
  const [setMenu, setSetMenu] = useState<{ anchor: HTMLElement; group: SetGroup } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const vehicleNames = useMemo(
    () => vehicles.map((v) => v.name).filter((name): name is string => !!name),
    [vehicles],
  );

  const assignedIds = useMemo(() => entries.map((e) => e.geraetId), [entries]);

  const geraetById = useMemo(() => new Map(geraete.map((g) => [g.id, g])), [geraete]);

  const listItems = useMemo(() => groupEntriesBySet(entries), [entries]);

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

  // Die gebuchten Chargen, z. B. „Los 4711: 2, ohne Charge: 1". Auch
  // archivierte Chargen stehen am Artikel; eine unbekannte zeigt ihre ID.
  const chargenText = (entry: GeraetEinsatz): string | undefined => {
    if (entry.art !== 'verbraucht' || !entry.chargen?.length) return undefined;
    const chargen = geraetById.get(entry.geraetId)?.chargen ?? [];
    return entry.chargen
      .map((teil) => {
        const charge =
          teil.chargeId === null ? undefined : chargen.find((c) => c.id === teil.chargeId);
        const label =
          teil.chargeId === null
            ? t('chargeNone')
            : charge
              ? formatCharge(charge)
              : teil.chargeId;
        return t('chargePart', { label, menge: teil.menge });
      })
      .join(', ');
  };

  const renderEntry = (entry: GeraetEinsatz, nested = false) => {
    const amount = amountText(entry);
    const lagerort = lagerortText(entry);
    const secondary = [
      amount,
      lagerort,
      chargenText(entry),
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
        sx={{ pr: canWrite ? 12 : 2, pl: nested ? 4 : undefined }}
      >
        <ListItemText
          primary={
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span>{entry.geraetName}</span>
              <Chip
                size="small"
                color={entry.art === 'verbraucht' ? 'warning' : 'default'}
                label={entry.art === 'verbraucht' ? t('artVerbraucht') : t('artZugeordnet')}
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
              {entry.art === 'verbraucht' && entry.chargenGeprueft === false && (
                <Tooltip title={t('chargeCheckHint')} describeChild>
                  {canWrite ? (
                    <Chip
                      size="small"
                      color="warning"
                      label={t('chargeCheck')}
                      onClick={() => setDialog({ mode: 'edit', entry })}
                    />
                  ) : (
                    <Chip size="small" color="warning" label={t('chargeCheck')} />
                  )}
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
  };

  const renderSetGroup = (group: SetGroup) => {
    const open = !collapsed.has(group.zuordnungId);
    const title = t('setGroup.title', { name: group.name });
    const toggle = () =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (open) next.add(group.zuordnungId);
        else next.delete(group.zuordnungId);
        return next;
      });
    return [
      <ListItem
        key={`set:${group.zuordnungId}`}
        aria-label={title}
        divider
        secondaryAction={
          <Box>
            <Tooltip title={open ? t('setGroup.collapse') : t('setGroup.expand')}>
              <IconButton
                aria-label={open ? t('setGroup.collapse') : t('setGroup.expand')}
                onClick={toggle}
              >
                {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Tooltip>
            {canWrite && (
              <Tooltip title={t('setGroup.menu')}>
                <IconButton
                  aria-label={t('setGroup.menu')}
                  onClick={(e) => setSetMenu({ anchor: e.currentTarget, group })}
                >
                  <MoreVertIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        }
        sx={{ pr: canWrite ? 12 : 7 }}
      >
        <ListItemText
          primary={
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="subtitle2" component="span">
                {title}
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                label={t('setGroup.count', { count: group.entries.length })}
              />
            </Stack>
          }
          slotProps={{ primary: { component: 'div' } }}
        />
      </ListItem>,
      ...(open ? group.entries.map((entry) => renderEntry(entry, true)) : []),
    ];
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
          {listItems.map((item) =>
            item.kind === 'entry' ? renderEntry(item.entry) : renderSetGroup(item),
          )}
        </List>
      )}

      {dialog && groupId && (
        <GeraetEinsatzDialog
          onClose={() => setDialog(null)}
          firecallId={firecallId}
          groupId={groupId}
          geraete={geraete}
          bestaendeByGeraet={bestaendeByGeraet}
          bestandById={bestandById}
          vehicleNames={vehicleNames}
          assignedIds={assignedIds}
          createdBy={email ?? uid ?? ''}
          entry={dialog.mode === 'edit' ? dialog.entry : undefined}
          sets={sets}
        />
      )}

      <Menu anchorEl={setMenu?.anchor} open={!!setMenu} onClose={() => setSetMenu(null)}>
        <MenuItem
          onClick={() => {
            setSetToRemove(setMenu?.group ?? null);
            setSetMenu(null);
          }}
        >
          {t('setGroup.removeAll')}
        </MenuItem>
      </Menu>

      {setToRemove && (
        <ConfirmDialog
          title={t('setGroup.removeTitle')}
          text={t('setGroup.removeText', {
            count: setToRemove.entries.length,
            name: setToRemove.name,
          })}
          yes={t('delete')}
          no={t('cancel')}
          onConfirm={(confirmed) => {
            // Je Eintrag gelöscht: Ein Verbrauch wird dabei wie beim
            // Einzellöschen zurückgebucht.
            if (confirmed) {
              for (const entry of setToRemove.entries) deleteGeraetEinsatz(firecallId, entry);
            }
            setSetToRemove(null);
          }}
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
