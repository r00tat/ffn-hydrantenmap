'use client';

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
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
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
  type GeraetSet,
} from '../../../common/geraet';
import {
  expandSetForEinsatz,
  findByCode,
  searchSets,
  type EinsatzPick,
} from '../../../common/geraetSet';
import GeraetSteckbrief from '../GeraetSteckbrief';
import GeraetScanDialog from './GeraetScanDialog';
import GeraetSetPreview, { type SetPreviewField, type SetPreviewGroup } from './GeraetSetPreview';
import {
  buildGeraetEinsatzData,
  buildGeraetEinsatzUpdate,
  einsatzArtFor,
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
  /**
   * Sets der Gruppe. Einsatz-Gäste dürfen sie nicht lesen und bekommen
   * keine — dann bietet die Suche nur Artikel an.
   */
  sets?: GeraetSet[];
}

const EMPTY_BESTAENDE: GeraetBestand[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_SETS: GeraetSet[] = [];

type RowValues = Record<SetPreviewField, string>;

function pickKey(pick: EinsatzPick): string {
  return pick.kind === 'set' ? `set:${pick.set.id}` : `geraet:${pick.geraet.id}`;
}

function pickLabel(pick: EinsatzPick): string {
  return pick.kind === 'set' ? pick.set.name : geraetOptionLabel(pick.geraet);
}

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
 * Beim Erfassen lassen sich mehrere Artikel nacheinander anklicken, die Liste
 * bleibt dafür offen. Ein einzelner Artikel zeigt Lagerort, Menge und
 * Stunden; mehrere werden mit den Vorgaben erfasst — Menge 1, Verbrauch vom
 * vorbelegten Lagerort — und bei Bedarf danach je Eintrag ergänzt. Im Einsatz
 * zählt, dass alles schnell drin ist.
 *
 * Ein Set schlägt seine Einträge vor: Die Vorschau zeigt sie je Zeile
 * änderbar, gespeichert wird je Eintrag mit `setZuordnungId` — so lässt sich
 * das Set in der Liste zusammen anzeigen und wieder entfernen.
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
  sets = EMPTY_SETS,
}: GeraetEinsatzDialogProps) {
  const t = useTranslations('geraetEinsatz.dialog');
  const editing = !!entry;

  // Beim Bearbeiten gilt die Art des Eintrags, nicht der heutige Stand des
  // Artikels (`geraetForEntry`).
  const [picks, setPicks] = useState<EinsatzPick[]>(() => {
    if (!entry) return [];
    const current = geraete.find((g) => g.id === entry.geraetId);
    return [
      {
        kind: 'geraet',
        geraet: current ? geraetForEntry(current, entry) : placeholderGeraet(entry),
      },
    ];
  });
  const selected = useMemo(
    () => picks.flatMap((p) => (p.kind === 'geraet' ? [p.geraet] : [])),
    [picks],
  );
  const selectedSets = useMemo(
    () => picks.flatMap((p) => (p.kind === 'set' ? [p.set] : [])),
    [picks],
  );
  const withSets = selectedSets.length > 0;
  const geraet = !withSets && selected.length === 1 ? selected[0] : null;
  const many = !withSets && selected.length > 1;
  const [inputValue, setInputValue] = useState('');
  const [bestandId, setBestandId] = useState(entry?.bestandId ?? '');
  const [menge, setMenge] = useState(() => (entry ? formatNumber(entry.menge) : ''));
  const [stunden, setStunden] = useState(() => formatNumber(entry?.stunden));
  const [bemerkung, setBemerkung] = useState(entry?.bemerkung ?? '');
  const [error, setError] = useState<GeraetEinsatzValidationError | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  // Geänderte Werte und Fehler der Vorschau, je Zeile (`SetPreviewRow.key`).
  const [rowEdits, setRowEdits] = useState<Record<string, Partial<RowValues>>>({});
  const [rowErrors, setRowErrors] = useState<
    Record<string, GeraetEinsatzValidationError | undefined>
  >({});

  const geraetById = useMemo(() => new Map(geraete.map((g) => [g.id, g])), [geraete]);
  const optionByKey = useMemo(() => {
    const map = new Map<string, EinsatzPick>();
    for (const g of geraete) map.set(`geraet:${g.id}`, { kind: 'geraet', geraet: g });
    for (const s of sets) map.set(`set:${s.id}`, { kind: 'set', set: s });
    return map;
  }, [geraete, sets]);
  const options = useMemo(() => [...optionByKey.values()], [optionByKey]);

  const bestaende = geraet
    ? (bestaendeByGeraet.get(geraet.id) ?? EMPTY_BESTAENDE)
    : EMPTY_BESTAENDE;
  const hours = geraet ? usesHours(geraet) : false;
  const einheit = geraet?.einheit;

  const sortedBestaende = useMemo(
    () =>
      [...bestaende].sort((a, b) =>
        formatLagerort(a.lagerort).localeCompare(formatLagerort(b.lagerort), 'de'),
      ),
    [bestaende],
  );

  const defaultBestandOf = (g: Geraet): GeraetBestand | undefined =>
    g.verbrauchsmaterial
      ? pickDefaultBestand(bestaendeByGeraet.get(g.id) ?? [], vehicleNames, assignedIds)
      : undefined;

  // Die Vorschau, sobald ein Set gewählt ist: je Set seine Einträge, darunter
  // die einzeln gewählten Artikel mit denselben Vorgaben wie bei „mehrere".
  const previewGroups = useMemo((): SetPreviewGroup[] => {
    if (!withSets) return [];
    const values = (key: string, base: RowValues): RowValues => ({ ...base, ...rowEdits[key] });
    const groups: SetPreviewGroup[] = selectedSets.map((set) => {
      const groupKey = `set:${set.id}`;
      const { rows, skipped } = expandSetForEinsatz(set, {
        geraetById,
        bestaendeByGeraet,
        vehicleNames,
        containerIds: assignedIds,
      });
      return {
        key: groupKey,
        title: t('setPreviewTitle', { name: set.name }),
        skipped,
        rows: rows.map((r) => {
          const key = `${groupKey}:${r.geraet.id}`;
          return {
            key,
            geraet: r.geraet,
            fromSetArtikel: r.fromSetArtikel,
            error: rowErrors[key],
            ...values(key, {
              menge: formatNumber(r.menge),
              stunden: '',
              bestandId: r.bestandId ?? '',
            }),
          };
        }),
      };
    });
    if (selected.length > 0) {
      groups.push({
        key: 'single',
        title: t('setPreviewSingles'),
        skipped: [],
        rows: selected.map((g) => {
          const key = `single:${g.id}`;
          const bestand =
            einsatzArtFor(g) === 'verbraucht'
              ? pickDefaultBestand(bestaendeByGeraet.get(g.id) ?? [], vehicleNames, assignedIds)
              : undefined;
          return {
            key,
            geraet: g,
            fromSetArtikel: false,
            error: rowErrors[key],
            ...values(key, {
              menge: usesHours(g) ? '' : '1',
              stunden: '',
              bestandId: bestand?.id ?? '',
            }),
          };
        }),
      });
    }
    return groups;
  }, [
    withSets,
    selectedSets,
    selected,
    rowEdits,
    rowErrors,
    geraetById,
    bestaendeByGeraet,
    vehicleNames,
    assignedIds,
    t,
  ]);
  const previewCount = previewGroups.reduce((sum, g) => sum + g.rows.length, 0);

  const select = (next: EinsatzPick[]) => {
    setPicks(next);
    setError(null);
    setRowErrors({});
    setScanMessage(null);
    if (next.length !== 1 || next[0].kind !== 'geraet') return;
    const single = next[0].geraet;
    setBestandId(defaultBestandOf(single)?.id ?? '');
    if (!usesHours(single) && !menge) setMenge('1');
  };

  const handleCode = (code: string) => {
    // „Set gewinnt": Der Code eines gebundenen Set-Artikels liefert das Set.
    const matches = findByCode(code, { geraete, sets });
    if (matches.length === 1) {
      const [match] = matches;
      const key = pickKey(match);
      select(picks.some((p) => pickKey(p) === key) ? picks : [...picks, match]);
      setInputValue('');
      if (match.kind === 'set') setScanMessage(t('setCodeFound', { name: match.set.name }));
      return;
    }
    // Mehrere oder keiner: Der Code bleibt im Suchfeld stehen, die Auswahl
    // trifft der Benutzer.
    setInputValue(code);
    setScanMessage(
      matches.length === 0 ? t('codeNotFound', { code }) : t('codeMultiple', { code }),
    );
  };

  const handleRowChange = (rowKey: string, field: SetPreviewField, value: string) => {
    setRowEdits((prev) => ({ ...prev, [rowKey]: { ...prev[rowKey], [field]: value } }));
    setRowErrors((prev) => ({ ...prev, [rowKey]: undefined }));
  };

  const saveWithSets = () => {
    const errors: Record<string, GeraetEinsatzValidationError> = {};
    const prepared = previewGroups.map((group) => ({
      set: selectedSets.find((s) => `set:${s.id}` === group.key),
      inputs: group.rows.map((row) => {
        const hours = usesHours(row.geraet);
        const input = {
          geraet: row.geraet,
          bestandId: row.bestandId || undefined,
          menge: hours ? undefined : parseNumber(row.menge),
          stunden: hours ? parseNumber(row.stunden) : undefined,
          bemerkung,
        };
        const validation = validateGeraetEinsatzInput(
          input,
          (bestaendeByGeraet.get(row.geraet.id) ?? EMPTY_BESTAENDE).length,
        );
        if (validation) errors[row.key] = validation;
        return input;
      }),
    }));
    if (Object.keys(errors).length > 0) {
      setRowErrors(errors);
      return;
    }
    const nowIso = new Date().toISOString();
    for (const { set, inputs } of prepared) {
      // Eine Kennung je Zuordnung: Dasselbe Set zweimal im Einsatz bleibt in
      // der Liste getrennt.
      const setFields = set
        ? { setId: set.id, setName: set.name, setZuordnungId: crypto.randomUUID() }
        : {};
      for (const input of inputs) {
        addGeraetEinsatz(firecallId, {
          ...buildGeraetEinsatzData({ ...input, groupId, nowIso, createdBy }),
          ...setFields,
        });
      }
    }
    onClose();
  };

  const handleSave = () => {
    if (withSets) {
      saveWithSets();
      return;
    }
    if (many) {
      const nowIso = new Date().toISOString();
      for (const g of selected) {
        addGeraetEinsatz(
          firecallId,
          buildGeraetEinsatzData({
            geraet: g,
            bestandId: defaultBestandOf(g)?.id,
            menge: usesHours(g) ? undefined : 1,
            bemerkung,
            groupId,
            nowIso,
            createdBy,
          }),
        );
      }
      onClose();
      return;
    }
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
            {geraete.length === 0 && !editing && <Alert severity="info">{t('noArticles')}</Alert>}
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              {editing ? (
                <TextField
                  fullWidth
                  disabled
                  label={t('article')}
                  value={geraet ? geraetOptionLabel(geraet) : ''}
                />
              ) : (
                <Autocomplete<EinsatzPick, true>
                  fullWidth
                  multiple
                  disableCloseOnSelect
                  options={options}
                  value={picks}
                  inputValue={inputValue}
                  onInputChange={(_e, value, reason) => {
                    // Nach einer Auswahl bleibt der Suchbegriff stehen — so
                    // lassen sich mehrere Treffer nacheinander anklicken. MUI
                    // leert ihn bei `multiple` mit `selectOption`.
                    if (reason !== 'reset' && reason !== 'selectOption') setInputValue(value);
                  }}
                  onChange={(_e, value) => select(value)}
                  // Sets stehen unter den Artikel-Treffern.
                  filterOptions={(_options, state) => [
                    ...searchGeraete(geraete, state.inputValue).flatMap(
                      (g) => optionByKey.get(`geraet:${g.id}`) ?? [],
                    ),
                    ...searchSets(sets, state.inputValue).flatMap(
                      (s) => optionByKey.get(`set:${s.id}`) ?? [],
                    ),
                  ]}
                  getOptionLabel={pickLabel}
                  // Ohne Inventar-Nr. tragen gleichnamige Artikel dasselbe
                  // Label — der Schlüssel muss die ID sein.
                  getOptionKey={pickKey}
                  isOptionEqualToValue={(a, b) => pickKey(a) === pickKey(b)}
                  noOptionsText={t('noOptions')}
                  renderOption={(props, pick) => {
                    const { key, ...rest } = props;
                    if (pick.kind === 'set') {
                      return (
                        <li key={key} {...rest}>
                          <Box>
                            <Typography variant="body2" component="div">
                              {pick.set.name}{' '}
                              <Chip size="small" variant="outlined" label={t('setChip')} />
                            </Typography>
                            <Typography variant="caption" color="text.secondary" component="div">
                              {t('setItems', { count: pick.set.inhalt?.length ?? 0 })}
                            </Typography>
                          </Box>
                        </li>
                      );
                    }
                    const option = pick.geraet;
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
                            {assignedIds.includes(option.id) ? ` · ${t('alreadyAssigned')}` : ''}
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
              )}
              {!editing && (
                <Tooltip title={t('scan')}>
                  <IconButton aria-label={t('scan')} onClick={() => setScanOpen(true)}>
                    <QrCodeScannerIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>

            {scanMessage && <Alert severity="info">{scanMessage}</Alert>}

            {many && (
              <>
                <Alert severity="info">{t('manyInfo', { count: selected.length })}</Alert>
                <List dense disablePadding>
                  {selected.map((g) => {
                    const b = defaultBestandOf(g);
                    return (
                      <ListItem key={g.id} disableGutters>
                        <ListItemText
                          primary={geraetOptionLabel(g)}
                          secondary={
                            g.verbrauchsmaterial
                              ? b
                                ? t('manyConsumable', {
                                    einheit: g.einheit ?? t('pieces'),
                                    lagerort: formatLagerort(b.lagerort),
                                  })
                                : t('manyConsumableNoBestand', {
                                    einheit: g.einheit ?? t('pieces'),
                                  })
                              : t('optionDevice')
                          }
                        />
                      </ListItem>
                    );
                  })}
                </List>
              </>
            )}

            {withSets && (
              <GeraetSetPreview
                groups={previewGroups}
                bestaendeByGeraet={bestaendeByGeraet}
                vehicleNames={vehicleNames}
                assignedIds={assignedIds}
                onChange={handleRowChange}
              />
            )}

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
            {withSets
              ? t('saveMany', { count: previewCount })
              : many
                ? t('saveMany', { count: selected.length })
                : t('save')}
          </Button>
        </DialogActions>
      </Dialog>
      <GeraetScanDialog open={scanOpen} onClose={() => setScanOpen(false)} onCode={handleCode} />
    </>
  );
}
