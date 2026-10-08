'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  formatCharge,
  formatLagerort,
  GERAET_CHARGE_MAX_TEXT,
  parseMenge,
  type Geraet,
  type GeraetBestand,
  type GeraetCharge,
} from '../../../common/geraet';
import { clean } from '../../../common/geraetBestandLogic';
import { activeChargen, restOhneCharge, sortFefo } from '../../../common/geraetCharge';
import { bookGeraetBestand, type GeraetChargeInput } from '../geraeteActions';
import { callAction } from './actionResult';
import { formatIsoDate } from './chargeFormat';

/** Auswahlwert „neue Charge anlegen" im Zugang. */
const NEW_CHARGE = '__new__';

/** Ein Zählfeld der Inventur je Charge: eine Charge oder (`null`) ohne Charge. */
interface CountField {
  chargeId: string | null;
  label: string;
}

export type BestandBookingMode = 'zugang' | 'umbuchung' | 'inventur';

export interface BestandBookingDialogProps {
  open: boolean;
  groupId: string;
  geraet: Geraet;
  /** Der Lagerort, an dem gebucht wird (bei Umbuchung: die Quelle). */
  bestand: GeraetBestand;
  /** Alle Lagerorte des Artikels — die Ziele einer Umbuchung. */
  bestaende: GeraetBestand[];
  mode: BestandBookingMode;
  onClose: () => void;
}

/**
 * Eine Buchung an einem Lagerort: Zugang (Lieferung), Umbuchung (z. B.
 * Lager → SRF) oder Inventur (Ist-Wert setzen). Bestand, Gesamtbestand und
 * Nachbestellmarke rechnet der Server in einer Transaktion nach.
 */
export default function BestandBookingDialog({
  open,
  groupId,
  geraet,
  bestand,
  bestaende,
  mode,
  onClose,
}: BestandBookingDialogProps) {
  const t = useTranslations('geraete');
  const tCommon = useTranslations('common');
  const format = useFormatter();

  const targets = bestaende.filter((b) => b.id !== bestand.id);
  const [menge, setMenge] = useState('');
  const [istWert, setIstWert] = useState(String(bestand.anzahl));
  const [zielBestandId, setZielBestandId] = useState(targets[0]?.id ?? '');
  const [bemerkung, setBemerkung] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Chargen gibt es nur bei Verbrauchsmaterial.
  const consumable = !!geraet.verbrauchsmaterial;
  const active = useMemo(() => sortFefo(activeChargen(geraet)), [geraet]);
  const hasMap = Object.keys(bestand.chargen ?? {}).length > 0;
  const showZugangCharge = consumable && mode === 'zugang';
  const showUmbuchungCharge = consumable && mode === 'umbuchung' && active.length > 0;
  const canCountPerCharge =
    consumable && mode === 'inventur' && ((geraet.chargen?.length ?? 0) > 0 || hasMap);

  /** Zugang/Umbuchung: `''` ohne Charge bzw. automatisch, sonst ID oder NEW_CHARGE. */
  const [chargeChoice, setChargeChoice] = useState('');
  const [neueCharge, setNeueCharge] = useState({
    bezeichnung: '',
    produktionsNummer: '',
    ablaufDatum: '',
  });
  const [perCharge, setPerCharge] = useState(false);

  /**
   * Zählfelder der Inventur: die aktiven Chargen und jede (auch archivierte)
   * mit Bestand an diesem Lagerort, in FEFO-Reihenfolge, zuletzt ohne Charge.
   */
  const countFields = useMemo<CountField[]>(() => {
    const map = bestand.chargen ?? {};
    const chargen = sortFefo(geraet.chargen ?? []).filter(
      (c) => !c.archiviert || Object.hasOwn(map, c.id),
    );
    return [
      ...chargen.map((c) => ({ chargeId: c.id, label: formatCharge(c) })),
      { chargeId: null, label: t('chargen.booking.none') },
    ];
  }, [bestand.chargen, geraet.chargen, t]);
  const [counts, setCounts] = useState<Record<string, string>>(() => {
    const map = bestand.chargen ?? {};
    const initial: Record<string, string> = {};
    // Negative Töpfe beginnen bei 0 — sonst ließe sich die Zählung nicht speichern.
    for (const c of geraet.chargen ?? []) initial[c.id] = String(Math.max(0, map[c.id] ?? 0));
    initial[''] = String(Math.max(0, restOhneCharge(bestand)));
    return initial;
  });

  const chargeLabel = (c: GeraetCharge) =>
    c.ablaufDatum
      ? `${formatCharge(c)} · ${t('chargen.booking.ablauf', {
          datum: formatIsoDate(format, c.ablaufDatum),
        })}`
      : formatCharge(c);

  const einheit = geraet.einheit ?? '';

  const handleSave = async () => {
    setError(undefined);
    const note = bemerkung.trim() || undefined;
    let input: Parameters<typeof bookGeraetBestand>[1];
    if (mode === 'inventur' && perCharge) {
      const jeCharge: Record<string, number> = {};
      let ohne = 0;
      for (const f of countFields) {
        const value = parseMenge(counts[f.chargeId ?? ''] ?? '');
        if (value === undefined || value < 0) {
          setError(t('errors.countInvalid'));
          return;
        }
        if (f.chargeId === null) ohne = value;
        else if (value > 0) jeCharge[f.chargeId] = value;
      }
      const sum = clean(Object.values(jeCharge).reduce((a, b) => a + b, ohne));
      input = {
        art: 'inventur',
        bestandId: bestand.id,
        istWert: sum,
        bemerkung: note,
        istWertJeCharge: jeCharge,
        istWertOhneCharge: ohne,
      };
    } else if (mode === 'inventur') {
      const ist = parseMenge(istWert);
      if (ist === undefined || ist < 0) {
        setError(t('errors.countInvalid'));
        return;
      }
      input = { art: 'inventur', bestandId: bestand.id, istWert: ist, bemerkung: note };
    } else {
      const m = parseMenge(menge);
      if (m === undefined || m <= 0) {
        setError(t('errors.mengeInvalid'));
        return;
      }
      if (mode === 'umbuchung') {
        if (!zielBestandId) {
          setError(t('errors.zielRequired'));
          return;
        }
        input = {
          art: 'umbuchung',
          bestandId: bestand.id,
          zielBestandId,
          menge: m,
          bemerkung: note,
          ...(showUmbuchungCharge && chargeChoice ? { chargeId: chargeChoice } : {}),
        };
      } else {
        input = { art: 'zugang', bestandId: bestand.id, menge: m, bemerkung: note };
        if (showZugangCharge && chargeChoice === NEW_CHARGE) {
          // Leere Felder fallen weg; eine ganz leere Charge ist erlaubt.
          const charge: GeraetChargeInput = {};
          for (const [key, value] of Object.entries(neueCharge) as [
            keyof typeof neueCharge,
            string,
          ][]) {
            if (value.trim()) charge[key] = value.trim();
          }
          input.neueCharge = charge;
        } else if (showZugangCharge && chargeChoice) {
          input.chargeId = chargeChoice;
        }
      }
    }

    setBusy(true);
    const outcome = await callAction(() => bookGeraetBestand(groupId, input));
    setBusy(false);
    if (!outcome.ok) {
      setError(t('errors.saveFailed', { error: outcome.error }));
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t(`booking.title.${mode}`)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2">
            {geraet.bezeichnung}
            <br />
            {t('booking.at', {
              lagerort: formatLagerort(bestand.lagerort),
              anzahl: bestand.anzahl,
              einheit,
            })}
          </Typography>

          {mode === 'umbuchung' && targets.length === 0 && (
            <Alert severity="info">{t('booking.noTargets')}</Alert>
          )}
          {mode === 'umbuchung' && targets.length > 0 && (
            <TextField
              select
              label={t('booking.ziel')}
              value={zielBestandId}
              onChange={(e) => setZielBestandId(e.target.value)}
              fullWidth
            >
              {targets.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {formatLagerort(b.lagerort)} ({b.anzahl})
                </MenuItem>
              ))}
            </TextField>
          )}

          {showZugangCharge && (
            <TextField
              select
              label={t('chargen.booking.charge')}
              value={chargeChoice}
              onChange={(e) => setChargeChoice(e.target.value)}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              fullWidth
            >
              <MenuItem value="">{t('chargen.booking.none')}</MenuItem>
              {active.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {chargeLabel(c)}
                </MenuItem>
              ))}
              <MenuItem value={NEW_CHARGE}>{t('chargen.booking.neu')}</MenuItem>
            </TextField>
          )}
          {showZugangCharge && chargeChoice === NEW_CHARGE && (
            <>
              {(['bezeichnung', 'produktionsNummer', 'ablaufDatum'] as const).map((name) => (
                <TextField
                  key={name}
                  label={t(`chargen.fields.${name}`)}
                  value={neueCharge[name]}
                  onChange={(e) =>
                    setNeueCharge((prev) => ({ ...prev, [name]: e.target.value }))
                  }
                  type={name === 'ablaufDatum' ? 'date' : undefined}
                  slotProps={
                    name === 'ablaufDatum'
                      ? { inputLabel: { shrink: true } }
                      : { htmlInput: { maxLength: GERAET_CHARGE_MAX_TEXT } }
                  }
                  fullWidth
                />
              ))}
            </>
          )}
          {showUmbuchungCharge && (
            <TextField
              select
              label={t('chargen.booking.charge')}
              value={chargeChoice}
              onChange={(e) => setChargeChoice(e.target.value)}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              fullWidth
            >
              <MenuItem value="">{t('chargen.booking.auto')}</MenuItem>
              {active.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {chargeLabel(c)}
                  {bestand.chargen?.[c.id] ? ` (${bestand.chargen[c.id]})` : ''}
                </MenuItem>
              ))}
            </TextField>
          )}
          {canCountPerCharge && (
            <FormControlLabel
              control={
                <Switch checked={perCharge} onChange={(e) => setPerCharge(e.target.checked)} />
              }
              label={t('chargen.booking.jeCharge')}
            />
          )}

          {mode === 'inventur' && perCharge ? (
            countFields.map((f) => (
              <TextField
                key={f.chargeId ?? ''}
                label={f.label}
                value={counts[f.chargeId ?? ''] ?? ''}
                onChange={(e) =>
                  setCounts((prev) => ({ ...prev, [f.chargeId ?? '']: e.target.value }))
                }
                type="number"
                slotProps={{ htmlInput: { min: 0, step: 'any', inputMode: 'decimal' } }}
                fullWidth
              />
            ))
          ) : mode === 'inventur' ? (
            <TextField
              label={t('booking.istWert')}
              value={istWert}
              onChange={(e) => setIstWert(e.target.value)}
              type="number"
              slotProps={{ htmlInput: { min: 0, step: 'any', inputMode: 'decimal' } }}
              autoFocus
              fullWidth
            />
          ) : (
            <TextField
              label={t('booking.menge')}
              value={menge}
              onChange={(e) => setMenge(e.target.value)}
              type="number"
              slotProps={{ htmlInput: { min: 0, step: 'any', inputMode: 'decimal' } }}
              autoFocus
              fullWidth
            />
          )}

          <TextField
            label={t('fields.bemerkung')}
            value={bemerkung}
            onChange={(e) => setBemerkung(e.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {tCommon('cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={busy || (mode === 'umbuchung' && targets.length === 0)}
        >
          {t('booking.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
