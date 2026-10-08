'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  formatLagerort,
  GERAET_CHARGE_MAX_TEXT,
  parseMenge,
  type GeraetBestand,
  type GeraetCharge,
} from '../../../common/geraet';
import {
  saveGeraetCharge,
  type GeraetChargeInput,
  type GeraetChargeZugang,
} from '../geraeteActions';
import { callAction } from './actionResult';

const FIELDS = [
  'bezeichnung',
  'produktionsNummer',
  'einkaufsDatum',
  'ablaufDatum',
  'kommentar',
] as const;

type ChargeField = (typeof FIELDS)[number];
type ChargeForm = Record<ChargeField, string>;

const DATE_FIELDS = new Set<ChargeField>(['einkaufsDatum', 'ablaufDatum']);

function initialForm(charge?: GeraetCharge): ChargeForm {
  return Object.fromEntries(FIELDS.map((f) => [f, charge?.[f] ?? ''])) as ChargeForm;
}

export interface ChargeDialogProps {
  open: boolean;
  groupId: string;
  geraetId: string;
  /** Ohne: neue Charge anlegen. */
  charge?: GeraetCharge;
  /** Die Lagerorte des Artikels — beim Anlegen je einer eine Zugangsmenge. */
  bestaende?: GeraetBestand[];
  einheit?: string;
  onClose: () => void;
}

/** Eine Zeile „Menge je Lagerort": `bestandId: null` = „ohne Lagerort" neu anlegen. */
interface ZugangRow {
  key: string;
  bestandId: string | null;
  label: string;
}

/**
 * Eine Charge anlegen oder bearbeiten. Alle Felder sind optional; angezeigt
 * wird die Charge über `formatCharge`. Beim Bearbeiten gehen alle Felder mit —
 * der Server ersetzt die ganze Charge, ein leeres Feld fällt weg.
 *
 * Beim Anlegen kann gleich die gelieferte Menge mit: je Lagerort ein Feld,
 * dazu „ohne Lagerort" für Ware, deren Platz noch offen ist. Jede Menge ist
 * ein Zugang — vorhandenen Bestand ordnet „Aufteilen" am Lagerort zu.
 */
export default function ChargeDialog({
  open,
  groupId,
  geraetId,
  charge,
  bestaende = [],
  einheit,
  onClose,
}: ChargeDialogProps) {
  const t = useTranslations('geraete');
  const tCommon = useTranslations('common');
  const [form, setForm] = useState<ChargeForm>(() => initialForm(charge));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [mengen, setMengen] = useState<Record<string, string>>({});

  const zugangRows = useMemo<ZugangRow[]>(() => {
    if (charge) return [];
    const active = bestaende.filter((b) => b.archiviert !== true);
    const label = (b: GeraetBestand) =>
      b.lagerort.art === 'unbestimmt'
        ? t('chargen.zugang.ohneLagerort')
        : formatLagerort(b.lagerort) || b.lagerortKey;
    const rows: ZugangRow[] = active
      .map((b) => ({ key: b.id, bestandId: b.id, label: label(b) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'de'));
    if (!active.some((b) => b.lagerort.art === 'unbestimmt')) {
      rows.push({ key: '', bestandId: null, label: t('chargen.zugang.ohneLagerort') });
    }
    return rows;
  }, [bestaende, charge, t]);

  const handleSave = async () => {
    setError(undefined);
    const input: GeraetChargeInput = {
      ...(charge ? { id: charge.id } : {}),
      ...Object.fromEntries(FIELDS.map((f) => [f, form[f].trim()])),
    };
    const zugaenge: GeraetChargeZugang[] = [];
    for (const row of zugangRows) {
      const text = (mengen[row.key] ?? '').trim();
      if (!text) continue;
      const menge = parseMenge(text);
      if (menge === undefined) {
        setError(t('errors.countInvalid'));
        return;
      }
      if (menge > 0) zugaenge.push({ bestandId: row.bestandId, menge });
    }
    setBusy(true);
    const outcome = await callAction(() =>
      charge
        ? saveGeraetCharge(groupId, geraetId, input)
        : saveGeraetCharge(groupId, geraetId, input, zugaenge),
    );
    setBusy(false);
    if (!outcome.ok) {
      setError(t('errors.saveFailed', { error: outcome.error }));
      return;
    }
    onClose();
  };

  const field = (name: ChargeField) => (
    <TextField
      key={name}
      label={t(`chargen.fields.${name}`)}
      value={form[name]}
      onChange={(e) => setForm((prev) => ({ ...prev, [name]: e.target.value }))}
      type={DATE_FIELDS.has(name) ? 'date' : undefined}
      multiline={name === 'kommentar'}
      minRows={name === 'kommentar' ? 2 : undefined}
      slotProps={
        DATE_FIELDS.has(name)
          ? { inputLabel: { shrink: true } }
          : { htmlInput: { maxLength: GERAET_CHARGE_MAX_TEXT } }
      }
      fullWidth
    />
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {charge ? t('chargen.dialogTitleEdit') : t('chargen.dialogTitleNew')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {FIELDS.map(field)}
          {zugangRows.length > 0 && (
            <>
              <Typography variant="subtitle2">{t('chargen.zugang.title')}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t('chargen.zugang.hint')}
              </Typography>
              {zugangRows.map((row) => (
                <TextField
                  key={row.key}
                  label={row.label}
                  value={mengen[row.key] ?? ''}
                  onChange={(e) =>
                    setMengen((prev) => ({ ...prev, [row.key]: e.target.value }))
                  }
                  slotProps={{
                    htmlInput: { inputMode: 'decimal' },
                    input: einheit
                      ? {
                          endAdornment: (
                            <InputAdornment position="end">{einheit}</InputAdornment>
                          ),
                        }
                      : undefined,
                  }}
                  size="small"
                  fullWidth
                />
              ))}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {tCommon('cancel')}
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={busy}>
          {tCommon('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
