'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  deviationKey,
  formatLagerort,
  type Geraet,
  type GeraetBestand,
} from '../../../common/geraet';
import { GERAET_IMPORT_MAX_BYTES, type GeraetImportPlan } from '../../../common/geraetImport';
import { importGeraete, previewGeraetImport } from '../geraeteActions';
import { callAction } from './actionResult';
import { fileToBase64 } from './fileToBase64';

export interface GeraeteImportDialogProps {
  open: boolean;
  groupId: string;
  /** Vorhandene Artikel — für die Namen in Änderungen und Abweichungen. */
  geraete: Geraet[];
  /** Vorhandene Bestände — für die Anzeige der Lagerorte. */
  bestaende: GeraetBestand[];
  onClose: () => void;
}

/** So viele Zeilen je Abschnitt; der Rest steht als „und N weitere" da. */
const PREVIEW_LIMIT = 100;

/**
 * Die Vorschau kommt als Plan — je nach Bauweise der Action direkt oder in
 * `{ success, plan }` verpackt. Beides wird hier angenommen.
 */
function unwrapPlan(result: unknown): GeraetImportPlan | undefined {
  if (!result || typeof result !== 'object') return undefined;
  if ('plan' in result) return (result as { plan?: GeraetImportPlan }).plan;
  if ('create' in result && 'deviations' in result) return result as GeraetImportPlan;
  return undefined;
}

/** Hinweise des Parsers (etwa doppelte Lagerorte), falls die Action sie mitgibt. */
function parseWarnings(result: unknown): string[] {
  if (!result || typeof result !== 'object' || !('errors' in result)) return [];
  const errors = (result as { errors?: unknown }).errors;
  return Array.isArray(errors) ? errors.filter((e): e is string => typeof e === 'string') : [];
}

/** Die Zahlen aus der Zusammenfassung des Imports, ohne Hilfsfelder. */
function summaryCounts(result: unknown): [string, number][] {
  if (!result || typeof result !== 'object') return [];
  const source =
    'summary' in result && typeof (result as { summary?: unknown }).summary === 'object'
      ? (result as { summary: object }).summary
      : result;
  return Object.entries(source).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  );
}

const SUMMARY_KEYS = [
  'created',
  'updated',
  'unchanged',
  'bestandCreated',
  'bestandUpdated',
  'inactive',
  'deviationsAccepted',
  'deviationsRejected',
  'bookings',
] as const;
type SummaryKey = (typeof SUMMARY_KEYS)[number];

function isSummaryKey(key: string): key is SummaryKey {
  return (SUMMARY_KEYS as readonly string[]).includes(key);
}

/**
 * Import des Sybos-Artikelexports (XLSX): Datei wählen, Vorschau des
 * Abgleichs, Abweichungen einzeln übernehmen, importieren.
 *
 * Abweichungen sind Lagerorte, an denen seit dem letzten Import gebucht wurde
 * und deren Anzahl nicht mehr zur Datei passt. Sie werden nie still
 * übernommen: Erst das Häkchen macht aus der Zahl der Datei eine Inventur.
 * Vorbelegt ist „nicht übernehmen" — die App kennt Verbräuche, die Sybos noch
 * nicht kennt.
 */
export default function GeraeteImportDialog({
  open,
  groupId,
  geraete,
  bestaende,
  onClose,
}: GeraeteImportDialogProps) {
  const t = useTranslations('geraete');
  const tCommon = useTranslations('common');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fileBase64, setFileBase64] = useState<string>();
  const [plan, setPlan] = useState<GeraetImportPlan>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<[string, number][]>();

  const geraeteById = useMemo(
    () => new Map(geraete.map((g) => [g.id, g])),
    [geraete],
  );
  const lagerortLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bestaende) {
      if (!map.has(b.lagerortKey)) map.set(b.lagerortKey, formatLagerort(b.lagerort));
    }
    for (const c of plan?.bestandCreate ?? []) {
      if (!map.has(c.lagerortKey)) map.set(c.lagerortKey, formatLagerort(c.lagerort));
    }
    return map;
  }, [bestaende, plan]);

  const nameOf = (geraetId: string) =>
    geraeteById.get(geraetId)?.bezeichnung ??
    plan?.create.find((c) => c.externeId === geraetId)?.stammdaten.bezeichnung ??
    geraetId;

  // Ohne bekannten Lagerort (neu an einem Artikel mit Buchungen) bleibt nur
  // der Schlüssel; sein erster Teil ist die Art und sagt dem Benutzer nichts.
  const lagerortOf = (key: string) =>
    lagerortLabelByKey.get(key) || key.split('|').slice(1).filter(Boolean).join(' · ') || key;

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(undefined);
    setDone(undefined);
    setPlan(undefined);
    setWarnings([]);
    if (file.size > GERAET_IMPORT_MAX_BYTES) {
      setError(t('import.fileTooLarge', { maxKb: Math.floor(GERAET_IMPORT_MAX_BYTES / 1000) }));
      setBusy(false);
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      const outcome = await callAction(() => previewGeraetImport(groupId, base64));
      if (!outcome.ok) {
        setError(t('import.previewFailed', { error: outcome.error }));
        return;
      }
      const next = unwrapPlan(outcome.value);
      if (!next) {
        setError(t('import.previewFailed', { error: 'no plan' }));
        return;
      }
      setFileBase64(base64);
      setPlan(next);
      setWarnings(parseWarnings(outcome.value));
      setAccepted(new Set());
    } catch (err) {
      setError(t('import.previewFailed', { error: String(err) }));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!plan || !fileBase64) return;
    setBusy(true);
    setError(undefined);
    const outcome = await callAction(() =>
      importGeraete(groupId, fileBase64, [...accepted]),
    );
    setBusy(false);
    if (!outcome.ok) {
      setError(t('import.importFailed', { error: outcome.error }));
      return;
    }
    setDone(summaryCounts(outcome.value));
    setWarnings(parseWarnings(outcome.value));
    setPlan(undefined);
    setFileBase64(undefined);
  };

  const toggle = (key: string) =>
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allDeviationKeys = plan?.deviations.map(deviationKey) ?? [];
  const allAccepted =
    allDeviationKeys.length > 0 && allDeviationKeys.every((k) => accepted.has(k));

  const more = (total: number) =>
    total > PREVIEW_LIMIT ? (
      <Typography variant="caption" color="text.secondary">
        {t('import.more', { count: total - PREVIEW_LIMIT })}
      </Typography>
    ) : null;

  const nothingToDo =
    !!plan &&
    plan.create.length === 0 &&
    plan.update.length === 0 &&
    plan.bestandCreate.length === 0 &&
    plan.bestandUpdate.length === 0 &&
    plan.inactive.length === 0 &&
    accepted.size === 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t('import.title')}</DialogTitle>
      <DialogContent>
        {busy && <LinearProgress sx={{ mb: 2 }} />}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {done && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {t('import.done')}
            {done.length > 0 && (
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {done.map(([key, value]) => (
                  <li key={key}>
                    {isSummaryKey(key) ? t(`import.summary.${key}`) : key}: {value}
                  </li>
                ))}
              </Box>
            )}
          </Alert>
        )}

        {warnings.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {warnings.slice(0, 10).map((w) => (
              <div key={w}>{w}</div>
            ))}
            {warnings.length > 10 && t('import.more', { count: warnings.length - 10 })}
          </Alert>
        )}

        {!plan && (
          <>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {t('import.hint')}
            </Typography>
            <Button variant="outlined" component="label" disabled={busy}>
              {t('import.chooseFile')}
              <input
                type="file"
                hidden
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                data-testid="geraete-import-file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Dieselbe Datei soll sich nach einem Fehler erneut wählen lassen.
                  e.target.value = '';
                  if (file) void handleFile(file);
                }}
              />
            </Button>
          </>
        )}

        {plan && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Chip size="small" label={t('import.counts.create', { count: plan.create.length })} />
              <Chip size="small" label={t('import.counts.update', { count: plan.update.length })} />
              <Chip
                size="small"
                label={t('import.counts.unchanged', { count: plan.unchanged.length })}
              />
              <Chip
                size="small"
                label={t('import.counts.bestandCreate', { count: plan.bestandCreate.length })}
              />
              <Chip
                size="small"
                label={t('import.counts.bestandUpdate', { count: plan.bestandUpdate.length })}
              />
              <Chip
                size="small"
                color={plan.deviations.length > 0 ? 'warning' : 'default'}
                label={t('import.counts.deviations', { count: plan.deviations.length })}
              />
              <Chip
                size="small"
                label={t('import.counts.inactive', { count: plan.inactive.length })}
              />
            </Stack>

            {plan.deviations.length > 0 && (
              <Box>
                <Typography variant="subtitle1">{t('import.deviationsTitle')}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('import.deviationsHint')}
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={allAccepted}
                      indeterminate={accepted.size > 0 && !allAccepted}
                      onChange={(e) =>
                        setAccepted(e.target.checked ? new Set(allDeviationKeys) : new Set())
                      }
                    />
                  }
                  label={t('import.acceptAll')}
                />
                <List dense sx={{ maxHeight: 320, overflow: 'auto' }}>
                  {plan.deviations.map((d) => {
                    const key = deviationKey(d);
                    return (
                      <ListItem key={key} disablePadding>
                        <ListItemIcon sx={{ minWidth: 40 }}>
                          <Checkbox
                            edge="start"
                            checked={accepted.has(key)}
                            onChange={() => toggle(key)}
                            slotProps={{
                              input: { 'aria-label': `${nameOf(d.geraetId)} ${lagerortOf(d.lagerortKey)}` },
                            }}
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={nameOf(d.geraetId)}
                          secondary={t('import.deviationLine', {
                            lagerort: lagerortOf(d.lagerortKey),
                            current: d.current,
                            imported: d.imported,
                            isNew: d.bestandId ? 'no' : 'yes',
                          })}
                        />
                      </ListItem>
                    );
                  })}
                </List>
              </Box>
            )}

            {plan.create.length > 0 && (
              <Box>
                <Typography variant="subtitle1">{t('import.createTitle')}</Typography>
                <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
                  {plan.create.slice(0, PREVIEW_LIMIT).map((c) => (
                    <ListItem key={c.externeId} disablePadding>
                      <ListItemText
                        primary={c.stammdaten.bezeichnung}
                        secondary={c.bestaende
                          .map((b) => `${formatLagerort(b.lagerort)}: ${b.anzahl}`)
                          .join(' · ')}
                      />
                    </ListItem>
                  ))}
                </List>
                {more(plan.create.length)}
              </Box>
            )}

            {plan.update.length > 0 && (
              <Box>
                <Typography variant="subtitle1">{t('import.updateTitle')}</Typography>
                <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
                  {plan.update.slice(0, PREVIEW_LIMIT).map((u) => (
                    <ListItem key={u.geraetId} disablePadding>
                      <ListItemText
                        primary={nameOf(u.geraetId)}
                        secondary={[...u.changedFields, ...u.removedFields].join(', ')}
                      />
                    </ListItem>
                  ))}
                </List>
                {more(plan.update.length)}
              </Box>
            )}

            {plan.bestandUpdate.length > 0 && (
              <Box>
                <Typography variant="subtitle1">{t('import.bestandUpdateTitle')}</Typography>
                <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
                  {plan.bestandUpdate.slice(0, PREVIEW_LIMIT).map((b) => (
                    <ListItem key={b.bestandId} disablePadding>
                      <ListItemText
                        primary={nameOf(b.geraetId)}
                        secondary={`${lagerortOf(b.lagerortKey)}: ${b.current} → ${b.imported}`}
                      />
                    </ListItem>
                  ))}
                </List>
                {more(plan.bestandUpdate.length)}
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('close')}</Button>
        {plan && (
          <Button
            onClick={() => {
              setPlan(undefined);
              setFileBase64(undefined);
            }}
            disabled={busy}
          >
            {t('import.otherFile')}
          </Button>
        )}
        <Button
          variant="contained"
          disabled={busy || !plan || nothingToDo}
          onClick={handleImport}
        >
          {t('import.button')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
