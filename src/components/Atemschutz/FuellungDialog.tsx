'use client';

import { useState } from 'react';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';
import {
  DEFAULT_ENDDRUCK,
  geraetDetails,
  geraetKennung,
  SICHTKONTROLLE_WERTE,
  type AtemschutzFuellung,
  type AtemschutzGeraet,
  type FuellungInput,
  type Sichtkontrolle,
  validateFuellungInput,
} from '../../common/atemschutz';
import BarcodeScannerDialog from './BarcodeScannerDialog';
import GeraetAutocomplete from './GeraetAutocomplete';
import MangelFelder from './MangelFelder';
import {
  hatMangelEingabe,
  LEERE_MANGEL_EINGABE,
  saveAtemschutzMangel,
  useMangelFehlerText,
  type MangelEingabe,
} from './mangelErfassung';
import PersonAutocomplete from './PersonAutocomplete';

export interface FuellungDialogProps {
  open: boolean;
  /** Für den Mangel, der aus der Sichtkontrolle entstehen kann. */
  groupId: string;
  /** Fehlt beim Anlegen. */
  fuellung?: AtemschutzFuellung;
  /** Die Flaschen der Gruppe, für Autovervollständigung und Nenndruck. */
  flaschen: AtemschutzGeraet[];
  feuerwehren: string[];
  personSuggestions: string[];
  /** Vorgabe für „Gefüllt von" — der angemeldete Benutzer. */
  defaultGefuelltVon: string;
  onClose: () => void;
  onSave: (input: FuellungInput) => Promise<void>;
}

interface FormState {
  geraetId?: string;
  flaschenNummer: string;
  feuerwehr: string;
  anzahl: string;
  startdruck: string;
  enddruck: string;
  gefuelltVon: string;
  sichtkontrolle: Sichtkontrolle;
  bemerkung: string;
}

function toNumber(value: string): number | undefined {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export default function FuellungDialog({
  open,
  groupId,
  fuellung,
  flaschen,
  feuerwehren,
  personSuggestions,
  defaultGefuelltVon,
  onClose,
  onSave,
}: FuellungDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  const [form, setForm] = useState<FormState>(() => ({
    geraetId: fuellung?.geraetId,
    flaschenNummer: fuellung?.flaschenNummer ?? '',
    feuerwehr: fuellung?.feuerwehr ?? '',
    anzahl: String(fuellung?.anzahl ?? 1),
    startdruck: fuellung?.startdruck != null ? String(fuellung.startdruck) : '',
    enddruck: String(fuellung?.enddruck ?? DEFAULT_ENDDRUCK),
    gefuelltVon: fuellung?.gefuelltVon ?? defaultGefuelltVon,
    sichtkontrolle: fuellung?.sichtkontrolle ?? 'offen',
    bemerkung: fuellung?.bemerkung ?? '',
  }));
  const [mangel, setMangel] = useState<MangelEingabe>(LEERE_MANGEL_EINGABE);
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [fehlermeldung, setFehlermeldung] = useState<string>();
  const fehlerText = useMangelFehlerText();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Die gewählte Flasche, sofern es zu ihr einen Stammdatensatz gibt.
  const gewaehlt = form.geraetId
    ? flaschen.find((f) => f.id === form.geraetId)
    : undefined;
  const istMangel = form.sichtkontrolle === 'mangel';
  // Beim Bearbeiten einer Zeile, die schon einen Mangel trägt, wird kein
  // zweiter angelegt — sonst entstünde bei jedem Öffnen ein weiterer Eintrag
  // in der Mängelliste.
  const bereitsGemeldet = !!fuellung?.mangelId;
  // Ein Mangel hängt an einem Gerät. Zu einer frei getippten Fremdflasche gibt
  // es keins — dort bleibt nur die Bemerkung.
  const mangelGeraet = istMangel && !bereitsGemeldet ? gewaehlt : undefined;

  const input: FuellungInput = {
    geraetId: form.geraetId,
    flaschenNummer: form.flaschenNummer,
    feuerwehr: form.feuerwehr,
    anzahl: Number(form.anzahl) || 0,
    startdruck: toNumber(form.startdruck),
    enddruck: toNumber(form.enddruck) ?? 0,
    gefuelltVon: form.gefuelltVon,
    sichtkontrolle: form.sichtkontrolle,
    bemerkung: form.bemerkung,
  };
  const fehler = validateFuellungInput(input);
  if (mangelGeraet && !hatMangelEingabe(mangel)) {
    fehler.push('descriptionMissing');
  }

  /**
   * Wird eine bekannte Flasche gewählt, folgen Nummer, Feuerwehr und Enddruck.
   * Bewusst nur beim Wählen und nicht als Effekt auf `flaschenNummer`: Sonst
   * überschriebe ein nachträglich getippter Enddruck sich beim nächsten Render
   * selbst.
   */
  const uebernehmeFlasche = (treffer: AtemschutzGeraet) => {
    setForm((prev) => ({
      ...prev,
      // Die führende Kennung und nicht die Bezeichnung: Sonst stünde bei einer
      // Flasche ohne eigene Nummer „Atemluftflasche CFK 6,8 l" im Feld — im
      // Protokoll später nicht von der Nachbarflasche zu unterscheiden.
      flaschenNummer: geraetKennung(treffer) ?? treffer.bezeichnung,
      geraetId: treffer.id,
      feuerwehr: treffer.feuerwehr || prev.feuerwehr,
      enddruck: treffer.nenndruck ? String(treffer.nenndruck) : prev.enddruck,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setFehlermeldung(undefined);
    try {
      // Der Mangel zuerst: Schlägt er fehl, soll im Protokoll nicht „Mangel"
      // stehen, ohne dass er in der Mängelliste angekommen ist.
      const mangelId = mangelGeraet
        ? await saveAtemschutzMangel(groupId, mangelGeraet.id as string, mangel)
        : undefined;
      await onSave(mangelId ? { ...input, mangelId } : input);
      onClose();
    } catch (err) {
      setFehlermeldung(fehlerText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {fuellung ? t('fuellung.dialogTitleEdit') : t('fuellung.dialogTitleNew')}
      </DialogTitle>
      <DialogContent>
        {saving && <LinearProgress sx={{ mb: 2 }} />}
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid size={12}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'flex-start' }}
            >
              <GeraetAutocomplete
                label={t('fuellung.flaschenNummer')}
                value={form.flaschenNummer}
                geraete={flaschen}
                // Zeigt unter dem Feld, *welche* Flasche gewählt ist: Die
                // Nummer allein sagt nicht, ob 6-l-Stahl oder 6,8-l-CFK.
                helperText={gewaehlt ? geraetDetails(gewaehlt) : undefined}
                onTextChange={(next) =>
                  // Freie Eingabe: Der Bezug auf ein Stammgerät ist damit
                  // aufgehoben — sonst hinge `geraetId` an einer Nummer, die
                  // gar nicht mehr dazu gehört.
                  setForm((prev) => ({
                    ...prev,
                    flaschenNummer: next,
                    geraetId: undefined,
                  }))
                }
                onGeraetChange={uebernehmeFlasche}
              />
              <Tooltip title={t('fuellung.scan')}>
                {/* span, weil ein disabled Button keine Events feuert —
                    siehe MUI-Regeln in CLAUDE.md. Hier nie disabled, aber
                    der Wrapper kostet nichts und hält das Muster gleich. */}
                <span>
                  <IconButton
                    aria-label={t('fuellung.scan')}
                    onClick={() => setScannerOpen(true)}
                    sx={{ mt: 1 }}
                  >
                    <QrCodeScannerIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, sm: 8 }}>
            <Autocomplete
              freeSolo
              fullWidth
              options={feuerwehren}
              value={form.feuerwehr}
              onInputChange={(_, next) => set('feuerwehr', next ?? '')}
              onChange={(_, next) =>
                set('feuerwehr', typeof next === 'string' ? next : '')
              }
              renderInput={(params) => (
                <TextField {...params} label={t('fuellung.feuerwehr')} />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              fullWidth
              type="number"
              label={t('fuellung.anzahl')}
              value={form.anzahl}
              helperText={t('fuellung.anzahlHint')}
              slotProps={{ htmlInput: { min: 1, max: 99, inputMode: 'numeric' } }}
              onChange={(e) => set('anzahl', e.target.value)}
            />
          </Grid>
          <Grid size={6}>
            <TextField
              fullWidth
              type="number"
              label={t('fuellung.startdruck')}
              value={form.startdruck}
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              onChange={(e) => set('startdruck', e.target.value)}
            />
          </Grid>
          <Grid size={6}>
            <TextField
              fullWidth
              required
              type="number"
              label={t('fuellung.enddruck')}
              value={form.enddruck}
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              onChange={(e) => set('enddruck', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 7 }}>
            <PersonAutocomplete
              label={t('fuellung.gefuelltVon')}
              value={form.gefuelltVon}
              options={personSuggestions}
              required
              onChange={(value) => set('gefuelltVon', value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 5 }}>
            <TextField
              select
              fullWidth
              label={t('fuellung.sichtkontrolle')}
              value={form.sichtkontrolle}
              onChange={(e) =>
                set('sichtkontrolle', e.target.value as Sichtkontrolle)
              }
            >
              {SICHTKONTROLLE_WERTE.map((wert) => (
                <MenuItem key={wert} value={wert}>
                  {t(`sichtkontrolle.${wert}`)}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          {istMangel && !bereitsGemeldet && (
            <Grid size={12}>
              {mangelGeraet ? (
                <MangelFelder
                  required
                  value={mangel}
                  helperText={t('ausruestung.mangelInlineHint')}
                  onChange={setMangel}
                />
              ) : (
                <Alert severity="info">{t('fuellung.mangelOhneGeraet')}</Alert>
              )}
            </Grid>
          )}
          {istMangel && bereitsGemeldet && (
            <Grid size={12}>
              <Alert severity="info">{t('fuellung.mangelBereitsGemeldet')}</Alert>
            </Grid>
          )}
          <Grid size={12}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              label={t('fuellung.bemerkung')}
              value={form.bemerkung}
              onChange={(e) => set('bemerkung', e.target.value)}
            />
          </Grid>
          {fehler.length > 0 && (
            <Grid size={12}>
              <Alert severity="warning">
                {fehler
                  .map((key) => t(`errors.${key}` as 'errors.saveFailed'))
                  .join(' · ')}
              </Alert>
            </Grid>
          )}
          {fehlermeldung && (
            <Grid size={12}>
              <Alert severity="error">{fehlermeldung}</Alert>
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button
          variant="contained"
          disabled={saving || fehler.length > 0}
          onClick={handleSave}
        >
          {tCommon('save')}
        </Button>
      </DialogActions>

      {scannerOpen && (
        <BarcodeScannerDialog
          open
          geraete={flaschen}
          onClose={() => setScannerOpen(false)}
          onPicked={(code, treffer) => {
            if (treffer) {
              uebernehmeFlasche(treffer);
              return;
            }
            // Kein Stammdatensatz: Der rohe Code wird die Flaschennummer.
            // Besser eine fremde Nummer im Protokoll als gar keine.
            setForm((prev) => ({
              ...prev,
              flaschenNummer: code,
              geraetId: undefined,
            }));
          }}
        />
      )}
    </Dialog>
  );
}
