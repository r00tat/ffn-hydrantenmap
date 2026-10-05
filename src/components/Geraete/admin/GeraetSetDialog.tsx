'use client';

import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteIcon from '@mui/icons-material/Delete';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  formatLagerort,
  type Geraet,
  type GeraetBestand,
  type GeraetSet,
  type GeraetSetItem,
} from '../../../common/geraet';
import {
  normalizeSetCodes,
  SET_ARTIKEL_TYP,
  validateGeraetSet,
  type GeraetSetError,
  type GeraetSetInput,
} from '../../../common/geraetSet';
import ConfirmDialog from '../../dialogs/ConfirmDialog';
import OnlineOnly from '../../site/OnlineOnly';
import GeraetScanDialog from '../einsatz/GeraetScanDialog';
import {
  geraetCodesOf,
  geraetOptionLabel,
  searchGeraete,
  usesHours,
} from '../einsatz/geraetEinsatzLogic';
import { deleteGeraetSet, saveGeraetSet } from '../geraeteActions';
import { callAction } from './actionResult';

export interface GeraetSetDialogProps {
  open: boolean;
  groupId: string;
  /** Gesetzt: Set ändern, sonst neu anlegen. */
  set?: GeraetSet;
  geraete: Geraet[];
  bestaendeByGeraet: Map<string, GeraetBestand[]>;
  /** Alle Sets der Gruppe — für die Eindeutigkeit der Codes. */
  sets: GeraetSet[];
  onClose: () => void;
}

interface ItemRow {
  geraetId: string;
  menge: string;
  bestandId: string;
}

const EMPTY_BESTAENDE: GeraetBestand[] = [];
const NO_SELECTION: Geraet[] = [];

function formatNumber(value?: number): string {
  return typeof value === 'number' ? String(value).replace('.', ',') : '';
}

/** Leer heißt „Standard", ein ungültiger Text `NaN` — den meldet die Prüfung. */
function parseNumber(text: string): number | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : NaN;
}

function rowsOf(set?: GeraetSet): ItemRow[] {
  return (set?.inhalt ?? []).map((item) => ({
    geraetId: item.geraetId,
    menge: formatNumber(item.menge),
    bestandId: item.bestandId ?? '',
  }));
}

/**
 * Set anlegen oder ändern: Name, optional ein Sybos-Set-Artikel, eigene
 * Codes und die Inhalte mit Menge und — bei Verbrauchsmaterial — festem
 * Lagerort.
 *
 * Geprüft wird vorab mit `validateGeraetSet`, damit die Fehler am Feld
 * stehen; die Server Action prüft gegen den Stand der Gruppe noch einmal.
 * Gespeichert wird über die Server Action, deshalb nur online.
 */
export default function GeraetSetDialog({
  open,
  groupId,
  set,
  geraete,
  bestaendeByGeraet,
  sets,
  onClose,
}: GeraetSetDialogProps) {
  const t = useTranslations('geraete');
  const [name, setName] = useState(set?.name ?? '');
  const [bemerkung, setBemerkung] = useState(set?.bemerkung ?? '');
  const [active, setActive] = useState(set?.active ?? true);
  const [artikelId, setArtikelId] = useState(set?.sybosSetArtikelId ?? '');
  const [codes, setCodes] = useState<string[]>(set?.codes ?? []);
  const [rows, setRows] = useState<ItemRow[]>(() => rowsOf(set));
  const [itemInput, setItemInput] = useState('');
  const [errors, setErrors] = useState<GeraetSetError[]>([]);
  const [serverError, setServerError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const geraetById = useMemo(() => new Map(geraete.map((g) => [g.id, g])), [geraete]);
  const setArtikel = useMemo(
    () => geraete.filter((g) => g.materialTyp === SET_ARTIKEL_TYP && g.active !== false),
    [geraete],
  );
  const artikel = artikelId ? geraetById.get(artikelId) : undefined;
  const itemOptions = useMemo(() => geraete.filter((g) => g.active !== false), [geraete]);

  const addItems = (picked: Geraet[]) => {
    setRows((prev) => [
      ...prev,
      ...picked
        .filter((g) => !prev.some((r) => r.geraetId === g.id))
        .map((g) => ({ geraetId: g.id, menge: usesHours(g) ? '' : '1', bestandId: '' })),
    ]);
  };

  const updateRow = (index: number, patch: Partial<ItemRow>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const moveRow = (index: number, delta: number) =>
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(index + delta, 0, moved);
      return next;
    });

  const buildInput = (): GeraetSetInput => {
    const inhalt = rows.map((r): GeraetSetItem => {
      const item: GeraetSetItem = { geraetId: r.geraetId };
      const menge = parseNumber(r.menge);
      if (menge !== undefined) item.menge = menge;
      if (r.bestandId) item.bestandId = r.bestandId;
      return item;
    });
    const input: GeraetSetInput = {
      name: name.trim(),
      codes: normalizeSetCodes(codes),
      inhalt,
      active,
    };
    if (set) input.id = set.id;
    if (artikelId) input.sybosSetArtikelId = artikelId;
    if (bemerkung.trim()) input.bemerkung = bemerkung.trim();
    return input;
  };

  const handleSave = async () => {
    setServerError(undefined);
    const input = buildInput();
    const found = validateGeraetSet(input, {
      geraete,
      sets,
      bestaende: [...bestaendeByGeraet.values()].flat(),
    });
    setErrors(found);
    if (found.length > 0) return;
    setBusy(true);
    const outcome = await callAction(() => saveGeraetSet(groupId, input));
    setBusy(false);
    if (!outcome.ok) {
      setServerError(t('errors.saveFailed', { error: outcome.error }));
      return;
    }
    onClose();
  };

  const handleDelete = async () => {
    if (!set) return;
    setBusy(true);
    const outcome = await callAction(() => deleteGeraetSet(groupId, set.id));
    setBusy(false);
    if (!outcome.ok) {
      setServerError(t('errors.deleteFailed', { error: outcome.error }));
      return;
    }
    onClose();
  };

  const errorText = (e: GeraetSetError): string =>
    e.code === 'codeCollision'
      ? t(e.kind === 'set' ? 'sets.errors.codeCollisionSet' : 'sets.errors.codeCollision', {
          value: e.value,
          name: e.name,
        })
      : t(`sets.errors.${e.code}`);
  const has = (code: GeraetSetError['code']) => errors.some((e) => e.code === code);
  const rowErrors = (geraetId: string) =>
    errors.filter((e) => 'geraetId' in e && e.geraetId === geraetId);
  const codeErrors = errors.filter((e) => e.code === 'codeCollision');
  const generalErrors = errors.filter(
    (e) => e.code === 'noItems' || e.code === 'notSetArtikel',
  );
  // Zeilenfehler zu Artikeln, die nicht (mehr) als Zeile erscheinen.
  const orphanErrors = errors.filter(
    (e) => 'geraetId' in e && !rows.some((r) => r.geraetId === e.geraetId && geraetById.has(r.geraetId)),
  );

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
        <DialogTitle>{set ? t('sets.dialog.titleEdit') : t('sets.dialog.titleNew')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label={t('sets.dialog.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={has('nameMissing')}
              helperText={has('nameMissing') ? t('sets.errors.nameMissing') : undefined}
              fullWidth
            />
            <TextField
              label={t('sets.dialog.bemerkung')}
              value={bemerkung}
              onChange={(e) => setBemerkung(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
            <FormControlLabel
              control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />}
              label={t('sets.dialog.active')}
            />

            <Autocomplete<Geraet>
              options={setArtikel}
              value={artikel ?? null}
              onChange={(_e, value) => setArtikelId(value?.id ?? '')}
              getOptionLabel={(g) => g.bezeichnung}
              getOptionKey={(g) => g.id}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('sets.dialog.sybosArtikel')}
                  helperText={t('sets.dialog.sybosArtikelHint')}
                  error={has('notSetArtikel')}
                />
              )}
            />
            {artikel && geraetCodesOf(artikel).length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" component="div">
                  {t('sets.dialog.artikelCodes')}
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>
                  {/* Dieselben Kennungen wie `geraetCodesOf`, aber wie gepflegt geschrieben. */}
                  {[
                    ...(artikel.barcodes ?? []),
                    artikel.inventarNr,
                    artikel.zusatzInventarNr,
                    artikel.seriennummer,
                    artikel.externeId,
                  ]
                    .filter((c): c is string => !!c?.trim())
                    .map((c, i) => (
                      <Chip key={`${i}-${c}`} size="small" label={c} disabled />
                    ))}
                </Stack>
              </Box>
            )}

            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <Autocomplete<string, true, false, true>
                fullWidth
                multiple
                freeSolo
                options={[]}
                value={codes}
                onChange={(_e, value) => setCodes(normalizeSetCodes(value))}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('sets.dialog.codes')}
                    error={codeErrors.length > 0}
                    helperText={
                      codeErrors.length > 0
                        ? codeErrors.map(errorText).join(' ')
                        : t('sets.dialog.codesHint')
                    }
                  />
                )}
              />
              <Tooltip title={t('sets.dialog.scan')}>
                <IconButton aria-label={t('sets.dialog.scan')} onClick={() => setScanOpen(true)}>
                  <QrCodeScannerIcon />
                </IconButton>
              </Tooltip>
            </Stack>

            <Autocomplete<Geraet, true>
              multiple
              disableCloseOnSelect
              options={itemOptions}
              value={NO_SELECTION}
              inputValue={itemInput}
              onInputChange={(_e, value, reason) => {
                // Der Suchbegriff bleibt nach einer Auswahl stehen — so lassen
                // sich mehrere Treffer nacheinander anklicken.
                if (reason !== 'reset' && reason !== 'selectOption') setItemInput(value);
              }}
              onChange={(_e, value) => addItems(value)}
              filterOptions={(options, state) => searchGeraete(options, state.inputValue)}
              getOptionLabel={geraetOptionLabel}
              getOptionKey={(g) => g.id}
              getOptionDisabled={(g) =>
                g.id === artikelId || rows.some((r) => r.geraetId === g.id)
              }
              noOptionsText={t('sets.dialog.noOptions')}
              renderOption={(props, option) => {
                const { key, ...rest } = props;
                return (
                  <li key={key} {...rest}>
                    <Box>
                      <Typography variant="body2">{geraetOptionLabel(option)}</Typography>
                      <Typography variant="caption" color="text.secondary" component="div">
                        {option.verbrauchsmaterial
                          ? t('sets.dialog.consumable')
                          : t('sets.dialog.device')}
                      </Typography>
                    </Box>
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('sets.dialog.inhalt')}
                  helperText={t('sets.dialog.inhaltHint')}
                  error={has('noItems')}
                />
              )}
            />

            {rows.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('sets.dialog.inhaltEmpty')}
              </Typography>
            ) : (
              <List dense disablePadding>
                {rows.map((r, index) => {
                  const g = geraetById.get(r.geraetId);
                  const label = g?.bezeichnung ?? r.geraetId;
                  const bestaende = bestaendeByGeraet.get(r.geraetId) ?? EMPTY_BESTAENDE;
                  const mine = rowErrors(r.geraetId);
                  return (
                    <ListItem
                      key={r.geraetId}
                      aria-label={label}
                      divider
                      disableGutters
                      sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'flex-start' }}
                    >
                      <Box sx={{ flex: '1 1 200px', pt: 1 }}>
                        <Typography variant="body2">{label}</Typography>
                        {mine.map((e) => (
                          <Typography key={e.code} variant="caption" color="error" component="div">
                            {errorText(e)}
                          </Typography>
                        ))}
                      </Box>
                      {(!g || !usesHours(g)) && (
                        <TextField
                          size="small"
                          label={
                            g?.einheit
                              ? t('sets.dialog.mengeUnit', { einheit: g.einheit })
                              : t('sets.dialog.menge')
                          }
                          value={r.menge}
                          onChange={(e) => updateRow(index, { menge: e.target.value })}
                          error={mine.some((e) => e.code === 'invalidMenge')}
                          slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                          sx={{ width: 130 }}
                        />
                      )}
                      {g?.verbrauchsmaterial && (
                        <TextField
                          select
                          size="small"
                          label={t('sets.dialog.lagerort')}
                          value={r.bestandId}
                          onChange={(e) => updateRow(index, { bestandId: e.target.value })}
                          error={mine.some((e) => e.code === 'invalidBestand')}
                          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                          sx={{ minWidth: 220 }}
                        >
                          <MenuItem value="">{t('sets.dialog.lagerortDefault')}</MenuItem>
                          {bestaende.map((b) => (
                            <MenuItem key={b.id} value={b.id}>
                              {formatLagerort(b.lagerort)}
                            </MenuItem>
                          ))}
                        </TextField>
                      )}
                      <Box sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title={t('sets.dialog.moveUp')}>
                          <span>
                            <IconButton
                              aria-label={t('sets.dialog.moveUp')}
                              disabled={index === 0}
                              onClick={() => moveRow(index, -1)}
                            >
                              <ArrowUpwardIcon />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={t('sets.dialog.moveDown')}>
                          <span>
                            <IconButton
                              aria-label={t('sets.dialog.moveDown')}
                              disabled={index === rows.length - 1}
                              onClick={() => moveRow(index, 1)}
                            >
                              <ArrowDownwardIcon />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={t('sets.dialog.remove')}>
                          <IconButton
                            aria-label={t('sets.dialog.remove')}
                            onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </ListItem>
                  );
                })}
              </List>
            )}

            {[...generalErrors, ...orphanErrors].map((e) => (
              <Alert key={`${e.code}-${'geraetId' in e ? e.geraetId : ''}`} severity="error">
                {errorText(e)}
              </Alert>
            ))}
            {serverError && <Alert severity="error">{serverError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          {set && (
            <OnlineOnly>
              <Button color="error" disabled={busy} onClick={() => setConfirmDelete(true)}>
                {t('sets.dialog.delete')}
              </Button>
            </OnlineOnly>
          )}
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={onClose}>{t('sets.dialog.cancel')}</Button>
          <OnlineOnly>
            <Button variant="contained" disabled={busy} onClick={handleSave}>
              {t('sets.dialog.save')}
            </Button>
          </OnlineOnly>
        </DialogActions>
      </Dialog>
      <GeraetScanDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onCode={(code) => {
          setCodes((prev) => normalizeSetCodes([...prev, code]));
          setScanOpen(false);
        }}
      />
      {confirmDelete && set && (
        <ConfirmDialog
          title={t('sets.dialog.deleteTitle')}
          text={t('sets.dialog.deleteText', { name: set.name })}
          yes={t('sets.dialog.delete')}
          no={t('sets.dialog.cancel')}
          onConfirm={(confirmed) => {
            setConfirmDelete(false);
            if (confirmed) void handleDelete();
          }}
        />
      )}
    </>
  );
}
