'use client';

import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { deleteField } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  formatLagerort,
  type Geraet,
  type GeraetBestand,
  type GeraetEinsatz,
} from '../../../common/geraet';
import GeraetSteckbrief from '../GeraetSteckbrief';
import GeraetScanDialog from './GeraetScanDialog';
import {
  buildGeraetEinsatzData,
  buildGeraetEinsatzUpdate,
  findGeraetByCode,
  geraetForEntry,
  geraetOptionDetails,
  geraetOptionLabel,
  matchesFirecallVehicle,
  pickDefaultBestand,
  searchGeraete,
  usesHours,
  validateGeraetEinsatzInput,
  type GeraetEinsatzValidationError,
} from './geraetEinsatzLogic';
import { addGeraetEinsatz, updateGeraetEinsatz } from './geraetEinsatzWrites';

export interface GeraetEinsatzDialogProps {
  onClose: () => void;
  firecallId: string;
  groupId: string;
  geraete: Geraet[];
  bestaendeByGeraet: Map<string, GeraetBestand[]>;
  /** Namen der Einsatzmittel — für die Vorbelegung des Lagerorts. */
  vehicleNames: string[];
  /**
   * IDs der Artikel, die dem Einsatz schon zugeordnet sind. Ein Container
   * darunter macht seine Lagerorte zu solchen „im Einsatz".
   */
  assignedIds?: string[];
  createdBy: string;
  /** Gesetzt: Eintrag bearbeiten, der Artikel bleibt fest. */
  entry?: GeraetEinsatz;
}

const EMPTY_BESTAENDE: GeraetBestand[] = [];
const EMPTY_IDS: string[] = [];

function parseNumber(text: string): number | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : NaN;
}

function formatNumber(value?: number): string {
  return typeof value === 'number' ? String(value).replace('.', ',') : '';
}

/**
 * Ein bearbeiteter Eintrag, dessen Artikel es nicht mehr gibt (gelöscht oder
 * aus einer anderen Gruppe): Aus dem Eintrag selbst wird ein Platzhalter
 * gebaut, damit Menge und Bemerkung trotzdem änderbar bleiben.
 */
function placeholderGeraet(entry: GeraetEinsatz): Geraet {
  return {
    id: entry.geraetId,
    bezeichnung: entry.geraetName,
    verbrauchsmaterial: entry.art === 'verbraucht',
    einheitVerwendungsnachweis: typeof entry.stunden === 'number' ? 'h' : undefined,
    bestandGesamt: 0,
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
  };
}

/**
 * Gerät zuordnen oder Material verbrauchen.
 *
 * Gespeichert wird lokal (`addDocLocal`/`updateDocLocal`), der Dialog schließt
 * sofort — auch offline. Das Abbuchen vom Lager stößt `geraetEinsatzWrites`
 * an; bis der Server es bestätigt, zeigt die Liste „noch nicht gebucht".
 */
export default function GeraetEinsatzDialog({
  onClose,
  firecallId,
  groupId,
  geraete,
  bestaendeByGeraet,
  vehicleNames,
  assignedIds = EMPTY_IDS,
  createdBy,
  entry,
}: GeraetEinsatzDialogProps) {
  const t = useTranslations('geraetEinsatz.dialog');
  const editing = !!entry;

  // Beim Bearbeiten gilt die Art des Eintrags, nicht der heutige Stand des
  // Artikels (`geraetForEntry`).
  const [geraet, setGeraet] = useState<Geraet | null>(() => {
    if (!entry) return null;
    const current = geraete.find((g) => g.id === entry.geraetId);
    return current ? geraetForEntry(current, entry) : placeholderGeraet(entry);
  });
  const [inputValue, setInputValue] = useState(() => (geraet ? geraetOptionLabel(geraet) : ''));
  const [bestandId, setBestandId] = useState(entry?.bestandId ?? '');
  const [menge, setMenge] = useState(() => (entry ? formatNumber(entry.menge) : ''));
  const [stunden, setStunden] = useState(() => formatNumber(entry?.stunden));
  const [bemerkung, setBemerkung] = useState(entry?.bemerkung ?? '');
  const [error, setError] = useState<GeraetEinsatzValidationError | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const bestaende = geraet ? (bestaendeByGeraet.get(geraet.id) ?? EMPTY_BESTAENDE) : EMPTY_BESTAENDE;
  const hours = geraet ? usesHours(geraet) : false;
  const einheit = geraet?.einheit;

  const sortedBestaende = useMemo(
    () =>
      [...bestaende].sort((a, b) =>
        formatLagerort(a.lagerort).localeCompare(formatLagerort(b.lagerort), 'de'),
      ),
    [bestaende],
  );

  const selectGeraet = (next: Geraet | null) => {
    setGeraet(next);
    setError(null);
    setScanMessage(null);
    if (!next) {
      setBestandId('');
      return;
    }
    setInputValue(geraetOptionLabel(next));
    const defaultBestand = next.verbrauchsmaterial
      ? pickDefaultBestand(bestaendeByGeraet.get(next.id) ?? [], vehicleNames, assignedIds)
      : undefined;
    setBestandId(defaultBestand?.id ?? '');
    if (!usesHours(next) && !menge) setMenge('1');
  };

  const handleCode = (code: string) => {
    const matches = findGeraetByCode(geraete, code);
    if (matches.length === 1) {
      selectGeraet(matches[0]);
      return;
    }
    // Mehrere oder keiner: Der Code bleibt im Suchfeld stehen, die Auswahl
    // trifft der Benutzer.
    setGeraet(null);
    setInputValue(code);
    setScanMessage(
      matches.length === 0 ? t('codeNotFound', { code }) : t('codeMultiple', { code }),
    );
  };

  const handleSave = () => {
    const input = {
      geraet: geraet ?? undefined,
      bestandId: bestandId || undefined,
      menge: hours ? undefined : parseNumber(menge),
      stunden: hours ? parseNumber(stunden) : undefined,
      bemerkung,
    };
    const validation = validateGeraetEinsatzInput(input, bestaende.length);
    if (validation || !geraet) {
      setError(validation ?? 'noGeraet');
      return;
    }
    if (entry) {
      updateGeraetEinsatz(
        firecallId,
        entry,
        buildGeraetEinsatzUpdate({ ...input, geraet }, () => deleteField()),
      );
    } else {
      addGeraetEinsatz(
        firecallId,
        buildGeraetEinsatzData({
          ...input,
          geraet,
          groupId,
          nowIso: new Date().toISOString(),
          createdBy,
        }),
      );
    }
    onClose();
  };

  return (
    <>
      <Dialog open onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? t('titleEdit') : t('titleAdd')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {geraete.length === 0 && !editing && (
              <Alert severity="info">{t('noArticles')}</Alert>
            )}
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <Autocomplete<Geraet>
                fullWidth
                disabled={editing}
                options={geraete}
                value={geraet}
                inputValue={inputValue}
                onInputChange={(_e, value, reason) => {
                  // `reset` kommt beim Setzen des Werts — das Label setzt
                  // `selectGeraet` selbst.
                  if (reason !== 'reset') setInputValue(value);
                }}
                onChange={(_e, value) => selectGeraet(value)}
                filterOptions={(options, state) => searchGeraete(options, state.inputValue)}
                getOptionLabel={geraetOptionLabel}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                noOptionsText={t('noOptions')}
                renderOption={(props, option) => {
                  const { key, ...rest } = props;
                  const details = geraetOptionDetails(
                    option,
                    bestaendeByGeraet.get(option.id) ?? EMPTY_BESTAENDE,
                  );
                  return (
                    <li key={key} {...rest}>
                      <Box>
                        <Typography variant="body2">{geraetOptionLabel(option)}</Typography>
                        <Typography variant="caption" color="text.secondary" component="div">
                          {option.verbrauchsmaterial
                            ? t('optionConsumable', {
                                bestand: option.bestandGesamt ?? 0,
                                einheit: option.einheit ?? t('pieces'),
                              })
                            : t('optionDevice')}
                          {details ? ` · ${details}` : ''}
                        </Typography>
                      </Box>
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('article')}
                    helperText={t('articleHint')}
                    error={error === 'noGeraet'}
                  />
                )}
              />
              {!editing && (
                <Tooltip title={t('scan')}>
                  <IconButton aria-label={t('scan')} onClick={() => setScanOpen(true)}>
                    <QrCodeScannerIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>

            {scanMessage && <Alert severity="info">{scanMessage}</Alert>}

            {geraet && (
              <Alert severity={geraet.verbrauchsmaterial ? 'warning' : 'info'}>
                {geraet.verbrauchsmaterial ? t('consumableInfo') : t('deviceInfo')}
              </Alert>
            )}

            {geraet && <GeraetSteckbrief geraet={geraet} compact />}

            {geraet?.verbrauchsmaterial &&
              (sortedBestaende.length > 0 ? (
                <TextField
                  select
                  label={t('lagerort')}
                  value={bestandId}
                  onChange={(e) => setBestandId(e.target.value)}
                  error={error === 'noBestand'}
                  fullWidth
                >
                  {sortedBestaende.map((b) => (
                    <MenuItem key={b.id} value={b.id}>
                      {t('lagerortOption', {
                        lagerort: formatLagerort(b.lagerort),
                        anzahl: b.anzahl ?? 0,
                      })}
                      {matchesFirecallVehicle(b.lagerort, vehicleNames, assignedIds)
                        ? ` · ${t('onFirecallVehicle')}`
                        : ''}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <Alert severity="info">{t('noBestand')}</Alert>
              ))}

            {geraet &&
              (hours ? (
                <TextField
                  label={t('stunden')}
                  value={stunden}
                  onChange={(e) => setStunden(e.target.value)}
                  error={error === 'invalidStunden'}
                  slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                  fullWidth
                />
              ) : (
                <TextField
                  label={einheit ? t('mengeUnit', { einheit }) : t('menge')}
                  value={menge}
                  onChange={(e) => setMenge(e.target.value)}
                  error={error === 'invalidMenge'}
                  slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                  fullWidth
                />
              ))}

            <TextField
              label={t('bemerkung')}
              value={bemerkung}
              onChange={(e) => setBemerkung(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />

            {error && <Alert severity="error">{t(`errors.${error}`)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button variant="contained" onClick={handleSave}>
            {t('save')}
          </Button>
        </DialogActions>
      </Dialog>
      <GeraetScanDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onCode={handleCode}
      />
    </>
  );
}
