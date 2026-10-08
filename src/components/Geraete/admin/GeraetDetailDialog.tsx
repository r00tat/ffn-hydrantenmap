'use client';

import AddIcon from '@mui/icons-material/Add';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlined';
import ArchiveIcon from '@mui/icons-material/Archive';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import {
  formatCharge,
  formatLagerort,
  GERAET_ABLAUF_VORLAUF_TAGE,
  GERAET_CHARGE_MAX_TEXT,
  isBelowMinimum,
  type Geraet,
  type GeraetBestand,
  type GeraetCharge,
} from '../../../common/geraet';
import {
  activeChargen,
  chargePots,
  chargeTotals,
  expiryStatus,
  sortFefo,
} from '../../../common/geraetCharge';
import ConfirmDialog from '../../dialogs/ConfirmDialog';
import GeraetSteckbrief from '../GeraetSteckbrief';
import {
  archiveGeraetCharge,
  ausbuchenGeraetCharge,
  deleteGeraetBestand,
  saveGeraet,
} from '../geraeteActions';
import { callAction } from './actionResult';
import BestandBookingDialog, { type BestandBookingMode } from './BestandBookingDialog';
import ChargeDialog from './ChargeDialog';
import { expiryColor, formatIsoDate, localTodayIso } from './chargeFormat';
import ChargeSplitDialog from './ChargeSplitDialog';
import LagerortDialog from './LagerortDialog';

export interface GeraetDetailDialogProps {
  open: boolean;
  groupId: string;
  geraet: Geraet;
  /** Die Lagerorte dieses Artikels. */
  bestaende: GeraetBestand[];
  /** Alle Bestände der Gruppe (Vorschläge im Lagerort-Dialog). */
  allBestaende: GeraetBestand[];
  /** Die Container der Gruppe — wählbar als Lagerort. */
  containers: Geraet[];
  /** Gruppen-Admin oder Gerätemeister — sonst nur lesen. */
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
}

/**
 * Ein Artikel mit seinem Bestand je Lagerort. Mitglieder sehen, wo was liegt;
 * Gruppen-Admin und Gerätemeister buchen hier Zugang, Umbuchung und Inventur
 * und legen Lagerorte an, ändern und löschen sie. Ob der Artikel
 * Verbrauchsmaterial ist, schalten sie direkt hier um — der Sybos-Export sagt
 * das nicht, also ist es nach dem Import für jeden Artikel einzeln zu setzen.
 */
export default function GeraetDetailDialog({
  open,
  groupId,
  geraet,
  bestaende,
  allBestaende,
  containers,
  canManage,
  onClose,
  onEdit,
}: GeraetDetailDialogProps) {
  const t = useTranslations('geraete');
  const tCommon = useTranslations('common');
  const format = useFormatter();

  const [booking, setBooking] = useState<{
    mode: BestandBookingMode;
    bestand: GeraetBestand;
  }>();
  /** `null`: neuer Lagerort; ein Bestand: diesen bearbeiten. */
  const [lagerortDialog, setLagerortDialog] = useState<GeraetBestand | null>();
  const [toDelete, setToDelete] = useState<GeraetBestand>();
  const [error, setError] = useState<string>();
  const [savingConsumable, setSavingConsumable] = useState(false);
  /** `null`: neue Charge; eine Charge: diese bearbeiten. */
  const [chargeDialog, setChargeDialog] = useState<GeraetCharge | null>();
  const [toAusbuchen, setToAusbuchen] = useState<GeraetCharge>();
  const [ausbuchenNote, setAusbuchenNote] = useState('');
  const [splitBestand, setSplitBestand] = useState<GeraetBestand>();
  const [showArchived, setShowArchived] = useState(false);
  const [chargeBusy, setChargeBusy] = useState(false);

  const consumable = !!geraet.verbrauchsmaterial;
  const allChargen = useMemo(() => sortFefo(geraet.chargen ?? []), [geraet.chargen]);
  const hasArchived = allChargen.some((c) => c.archiviert);
  const shownChargen = showArchived ? allChargen : activeChargen({ chargen: allChargen });
  const totals = useMemo(() => chargeTotals(geraet, bestaende), [geraet, bestaende]);
  const today = localTodayIso();
  const vorlauf = geraet.ablaufVorlaufTage ?? GERAET_ABLAUF_VORLAUF_TAGE;
  const canSplit = consumable && activeChargen(geraet).length > 0;

  const handleArchive = async (charge: GeraetCharge) => {
    setError(undefined);
    setChargeBusy(true);
    const outcome = await callAction(() => archiveGeraetCharge(groupId, geraet.id, charge.id));
    setChargeBusy(false);
    if (!outcome.ok) setError(t('chargen.errors.archiveFailed', { error: outcome.error }));
  };

  const handleAusbuchen = async (charge: GeraetCharge, note: string) => {
    setError(undefined);
    setChargeBusy(true);
    const outcome = await callAction(() =>
      ausbuchenGeraetCharge(groupId, geraet.id, charge.id, note.trim() || undefined),
    );
    setChargeBusy(false);
    if (!outcome.ok) setError(t('chargen.errors.ausbuchenFailed', { error: outcome.error }));
  };

  const handleConsumable = async (verbrauchsmaterial: boolean) => {
    setError(undefined);
    setSavingConsumable(true);
    // Wie im Bearbeiten-Dialog: Ein Mindestbestand gilt nur für Verbrauchsmaterial.
    const outcome = await callAction(() =>
      saveGeraet(groupId, {
        id: geraet.id,
        verbrauchsmaterial,
        ...(verbrauchsmaterial ? {} : { mindestbestand: null }),
      }),
    );
    setSavingConsumable(false);
    if (!outcome.ok) setError(t('errors.saveFailed', { error: outcome.error }));
  };

  const handleDelete = async (bestand: GeraetBestand) => {
    setError(undefined);
    const outcome = await callAction(() => deleteGeraetBestand(groupId, bestand.id));
    if (!outcome.ok) setError(t('errors.deleteFailed', { error: outcome.error }));
  };

  const rows = useMemo(
    () =>
      [...bestaende].sort((a, b) =>
        formatLagerort(a.lagerort).localeCompare(formatLagerort(b.lagerort), 'de'),
      ),
    [bestaende],
  );

  const einheit = geraet.einheit ?? '';

  const actionButton = (
    mode: BestandBookingMode,
    bestand: GeraetBestand,
    icon: ReactNode,
  ) => (
    <Tooltip title={t(`booking.title.${mode}`)}>
      <IconButton
        size="small"
        aria-label={t(`booking.title.${mode}`)}
        onClick={() => setBooking({ mode, bestand })}
      >
        {icon}
      </IconButton>
    </Tooltip>
  );

  /**
   * Die Töpfe eines Lagerorts als Chips — nur, wenn der Artikel Chargen hat
   * oder der Lagerort schon aufgeteilt ist. Ein negativer Topf ist ein
   * Hinweis auf eine Inventur oder Aufteilung.
   */
  const renderPots = (b: GeraetBestand) => {
    if (!consumable) return null;
    const hasMap = Object.keys(b.chargen ?? {}).length > 0;
    if (allChargen.length === 0 && !hasMap) return null;
    const byId = new Map(allChargen.map((c) => [c.id, c]));
    const pots = chargePots(b, allChargen);
    const negative = pots.some((p) => p.menge < 0);
    return (
      <>
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>
          {pots.map((p) => {
            const charge = p.chargeId ? byId.get(p.chargeId) : undefined;
            const label = charge
              ? t('chargen.chip', { label: formatCharge(charge), menge: p.menge })
              : t('chargen.ohneCharge', { menge: p.menge });
            return (
              <Chip
                key={p.chargeId ?? ''}
                size="small"
                variant="outlined"
                color={p.menge < 0 ? 'error' : 'default'}
                label={label}
              />
            );
          })}
        </Stack>
        {negative && (
          <Typography variant="caption" color="error" component="div">
            {t('chargen.negative')}
          </Typography>
        )}
      </>
    );
  };

  const renderChargen = () => (
    <Box sx={{ mt: 3 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {t('chargen.title')}
        </Typography>
        {hasArchived && (
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
            }
            label={t('chargen.showArchived')}
          />
        )}
        {canManage && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => setChargeDialog(null)}>
            {t('chargen.new')}
          </Button>
        )}
      </Stack>
      {shownChargen.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('chargen.empty')}
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('chargen.columns.charge')}</TableCell>
              <TableCell>{t('chargen.columns.los')}</TableCell>
              <TableCell>{t('chargen.columns.ablauf')}</TableCell>
              <TableCell align="right">{t('chargen.columns.menge')}</TableCell>
              {canManage && <TableCell align="right">{tCommon('actions')}</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {shownChargen.map((c) => {
              const total = totals.get(c.id) ?? 0;
              const status = expiryStatus(c, today, vorlauf);
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    {formatCharge(c)}
                    {c.archiviert && (
                      <Chip size="small" label={t('chargen.archived')} sx={{ ml: 1 }} />
                    )}
                    {c.kommentar && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        {c.kommentar}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{c.losNummer ?? ''}</TableCell>
                  <TableCell sx={{ color: expiryColor(status), whiteSpace: 'nowrap' }}>
                    {formatIsoDate(format, c.ablaufDatum)}
                    {status !== 'ok' && !c.archiviert && (
                      <Chip
                        size="small"
                        color={status === 'abgelaufen' ? 'error' : 'warning'}
                        label={t(`chargen.status.${status}`)}
                        sx={{ ml: 1 }}
                      />
                    )}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={total < 0 ? { color: 'error.main' } : undefined}
                  >
                    {total}
                  </TableCell>
                  {canManage && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {!c.archiviert && (
                        <>
                          <Tooltip title={t('chargen.edit')}>
                            <IconButton
                              size="small"
                              aria-label={t('chargen.edit')}
                              onClick={() => setChargeDialog(c)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('chargen.ausbuchen')}>
                            <span>
                              <IconButton
                                size="small"
                                aria-label={t('chargen.ausbuchen')}
                                disabled={chargeBusy}
                                onClick={() => {
                                  setAusbuchenNote('');
                                  setToAusbuchen(c);
                                }}
                              >
                                <RemoveCircleOutlineIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip
                            title={
                              total === 0 ? t('chargen.archivieren') : t('chargen.archiveOnlyEmpty')
                            }
                          >
                            <span>
                              <IconButton
                                size="small"
                                aria-label={t('chargen.archivieren')}
                                disabled={chargeBusy || total !== 0}
                                onClick={() => handleArchive(c)}
                              >
                                <ArchiveIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{geraet.bezeichnung}</DialogTitle>
      <DialogContent>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }}
        >
          {canManage ? (
            <FormControlLabel
              control={
                <Switch
                  checked={!!geraet.verbrauchsmaterial}
                  disabled={savingConsumable}
                  onChange={(e) => handleConsumable(e.target.checked)}
                />
              }
              label={t('fields.verbrauchsmaterial')}
            />
          ) : (
            geraet.verbrauchsmaterial && (
              <Chip size="small" color="primary" label={t('list.consumable')} />
            )
          )}
          {!geraet.active && <Chip size="small" label={t('list.inactive')} />}
          {isBelowMinimum(geraet) && (
            <Chip size="small" color="warning" label={t('list.belowMinimum')} />
          )}
        </Stack>

        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          <strong>{t('detail.bestandGesamt')}:</strong>{' '}
          {t('list.stock', { anzahl: geraet.bestandGesamt ?? 0, einheit })}
          {geraet.mindestbestand != null && (
            <>
              {' · '}
              <strong>{t('fields.mindestbestand')}:</strong> {geraet.mindestbestand}
            </>
          )}
          {geraet.nachbestellenSeit && (
            <>
              <br />
              {t('detail.nachbestellenSeit', {
                date: format.dateTime(new Date(geraet.nachbestellenSeit), {
                  dateStyle: 'medium',
                }),
              })}
            </>
          )}
        </Typography>

        <Box sx={{ mb: 2 }}>
          <GeraetSteckbrief geraet={geraet} />
        </Box>

        <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t('detail.bestand')}
          </Typography>
          {canManage && (
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setLagerortDialog(null)}
            >
              {t('detail.newLagerort')}
            </Button>
          )}
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(undefined)}>
            {error}
          </Alert>
        )}

        {rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('detail.noBestand')}
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('detail.lagerort')}</TableCell>
                <TableCell align="right">{t('detail.anzahl')}</TableCell>
                {canManage && (
                  <TableCell align="right">{tCommon('actions')}</TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    {formatLagerort(b.lagerort) || b.lagerortKey}
                    {b.lagerort.bemerkung && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        {b.lagerort.bemerkung}
                      </Typography>
                    )}
                    {renderPots(b)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={b.anzahl < 0 ? { color: 'error.main' } : undefined}
                  >
                    {b.anzahl}
                  </TableCell>
                  {canManage && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {actionButton('zugang', b, <AddCircleOutlineIcon fontSize="small" />)}
                      {actionButton('umbuchung', b, <SwapHorizIcon fontSize="small" />)}
                      {actionButton('inventur', b, <FactCheckIcon fontSize="small" />)}
                      {canSplit && (
                        <Tooltip title={t('chargen.aufteilen')}>
                          <IconButton
                            size="small"
                            aria-label={t('chargen.aufteilen')}
                            onClick={() => setSplitBestand(b)}
                          >
                            <CallSplitIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title={t('detail.editLagerort')}>
                        <IconButton
                          size="small"
                          aria-label={t('detail.editLagerort')}
                          onClick={() => setLagerortDialog(b)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('detail.deleteLagerort')}>
                        <IconButton
                          size="small"
                          aria-label={t('detail.deleteLagerort')}
                          onClick={() => setToDelete(b)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {consumable && renderChargen()}
      </DialogContent>
      <DialogActions>
        {canManage && (
          <Button onClick={onEdit} sx={{ mr: 'auto' }}>
            {tCommon('edit')}
          </Button>
        )}
        <Button onClick={onClose}>{tCommon('close')}</Button>
      </DialogActions>

      {booking && (
        <BestandBookingDialog
          open
          groupId={groupId}
          geraet={geraet}
          bestand={booking.bestand}
          bestaende={bestaende}
          mode={booking.mode}
          onClose={() => setBooking(undefined)}
        />
      )}
      {lagerortDialog !== undefined && (
        <LagerortDialog
          open
          groupId={groupId}
          geraet={geraet}
          bestand={lagerortDialog ?? undefined}
          existing={bestaende}
          allBestaende={allBestaende}
          containers={containers}
          onClose={() => setLagerortDialog(undefined)}
        />
      )}
      {chargeDialog !== undefined && (
        <ChargeDialog
          open
          groupId={groupId}
          geraetId={geraet.id}
          charge={chargeDialog ?? undefined}
          onClose={() => setChargeDialog(undefined)}
        />
      )}
      {splitBestand && (
        <ChargeSplitDialog
          open
          groupId={groupId}
          geraet={geraet}
          bestand={splitBestand}
          onClose={() => setSplitBestand(undefined)}
        />
      )}
      {toAusbuchen && (
        <Dialog
          open
          onClose={() => setToAusbuchen(undefined)}
          aria-labelledby="charge-ausbuchen-title"
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle id="charge-ausbuchen-title">{t('chargen.ausbuchenTitle')}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {t('chargen.ausbuchenText', {
                charge: formatCharge(toAusbuchen),
                menge: totals.get(toAusbuchen.id) ?? 0,
                einheit,
              })}
            </Typography>
            <TextField
              label={t('fields.bemerkung')}
              value={ausbuchenNote}
              onChange={(e) => setAusbuchenNote(e.target.value)}
              slotProps={{ htmlInput: { maxLength: GERAET_CHARGE_MAX_TEXT } }}
              fullWidth
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setToAusbuchen(undefined)}>{tCommon('cancel')}</Button>
            <Button
              variant="contained"
              color="warning"
              onClick={() => {
                handleAusbuchen(toAusbuchen, ausbuchenNote);
                setToAusbuchen(undefined);
              }}
            >
              {t('chargen.ausbuchen')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
      {toDelete && (
        <ConfirmDialog
          title={t('detail.deleteLagerortTitle')}
          text={[
            t('detail.deleteLagerortText', {
              lagerort: formatLagerort(toDelete.lagerort) || toDelete.lagerortKey,
            }),
            toDelete.anzahl !== 0
              ? t('detail.deleteLagerortRest', { anzahl: toDelete.anzahl, einheit })
              : undefined,
            t('detail.deleteLagerortArchived'),
          ]
            .filter(Boolean)
            .join(' ')}
          yes={tCommon('delete')}
          no={tCommon('cancel')}
          onConfirm={(confirmed) => {
            if (confirmed) handleDelete(toDelete);
            setToDelete(undefined);
          }}
        />
      )}
    </Dialog>
  );
}
