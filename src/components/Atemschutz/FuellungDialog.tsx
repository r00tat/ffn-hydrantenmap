'use client';

import { useMemo, useState } from 'react';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import {
  DEFAULT_ENDDRUCK,
  DEFAULT_SICHTKONTROLLE,
  findByCode,
  geraetKennung,
  geraetLabel,
  SICHTKONTROLLE_WERTE,
  type AtemschutzFuellung,
  type AtemschutzGeraet,
  type FuellungInput,
  type Sichtkontrolle,
  validateFuellungInput,
  verrechnenVorgabe,
  waehleFuellstation,
} from '../../common/atemschutz';
import BarcodeScannerDialog from './BarcodeScannerDialog';
import GeraetAutocomplete from './GeraetAutocomplete';
import GeraetBestaetigung from './GeraetBestaetigung';
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
  /** Die aktiven Füllstationen der Gruppe. Leer = kein Feld im Dialog. */
  fuellstationen: AtemschutzGeraet[];
  /** Zuletzt gewählte Station, aus dem localStorage. */
  letzteFuellstationId?: string;
  /** `''` = an der Station. Bestimmt die Vorbelegung von `verrechnen`. */
  firecallId: string;
  /** Name der eigenen Feuerwehr, für dieselbe Vorbelegung. */
  eigeneFeuerwehr?: string;
  /** Meldet die gewählte Station zurück, damit sie gemerkt werden kann. */
  onFuellstationChange?: (id: string) => void;
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
  fuellstationId?: string;
  verrechnen: boolean;
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
  fuellstationen,
  letzteFuellstationId,
  firecallId,
  eigeneFeuerwehr,
  onFuellstationChange,
  onClose,
  onSave,
}: FuellungDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  const auswahl = useMemo(
    () => waehleFuellstation(fuellstationen, letzteFuellstationId),
    [fuellstationen, letzteFuellstationId],
  );

  const [form, setForm] = useState<FormState>(() => ({
    geraetId: fuellung?.geraetId,
    flaschenNummer: fuellung?.flaschenNummer ?? '',
    feuerwehr: fuellung?.feuerwehr ?? '',
    anzahl: String(fuellung?.anzahl ?? 1),
    startdruck: fuellung?.startdruck != null ? String(fuellung.startdruck) : '',
    enddruck: String(fuellung?.enddruck ?? DEFAULT_ENDDRUCK),
    gefuelltVon: fuellung?.gefuelltVon ?? defaultGefuelltVon,
    sichtkontrolle: fuellung?.sichtkontrolle ?? DEFAULT_SICHTKONTROLLE,
    bemerkung: fuellung?.bemerkung ?? '',
    fuellstationId: fuellung?.fuellstationId ?? auswahl.station?.id,
    verrechnen:
      fuellung?.verrechnen ??
      verrechnenVorgabe({
        feuerwehr: fuellung?.feuerwehr,
        firecallId,
        eigeneFeuerwehr,
      }),
  }));
  // Ob der Benutzer den Schalter selbst angefasst hat. Solange nicht, zieht die
  // Vorbelegung nach: Das Feuerwehr-Feld ist beim Öffnen leer und wird meist
  // erst danach ausgefüllt — ohne Nachziehen bliebe das Flag immer aus.
  // Beim Bearbeiten einer gespeicherten Füllung gilt sie als angefasst: Das
  // gespeicherte Flag ist eine getroffene Entscheidung.
  const [verrechnenBeruehrt, setVerrechnenBeruehrt] = useState(!!fuellung);
  const [mangel, setMangel] = useState<MangelEingabe>(LEERE_MANGEL_EINGABE);
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [fehlermeldung, setFehlermeldung] = useState<string>();
  const fehlerText = useMangelFehlerText();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setFeuerwehr = (next: string) =>
    setForm((prev) => ({
      ...prev,
      feuerwehr: next,
      ...(verrechnenBeruehrt
        ? {}
        : {
            verrechnen: verrechnenVorgabe({
              feuerwehr: next,
              firecallId,
              eigeneFeuerwehr,
            }),
          }),
    }));

  // Die gewählte Flasche, sofern es zu ihr einen Stammdatensatz gibt.
  const gewaehlt = form.geraetId
    ? flaschen.find((f) => f.id === form.geraetId)
    : undefined;
  // Die Anzahl ist die Sammelerfassung für Flaschen ohne Nummer. Sobald eine
  // Nummer dasteht — getippt oder aus dem Bestand gewählt —, ist es genau eine
  // Flasche, und das Feld wäre nur eine Gelegenheit für einen Zahlendreher.
  const hatFlaschennummer = form.flaschenNummer.trim().length > 0;
  const istMangel = form.sichtkontrolle === 'mangel';
  // Beim Bearbeiten einer Zeile, die schon einen Mangel trägt, wird kein
  // zweiter angelegt — sonst entstünde bei jedem Öffnen ein weiterer Eintrag
  // in der Mängelliste.
  const bereitsGemeldet = !!fuellung?.mangelId;
  // Ein Mangel hängt an einem Gerät. Zu einer frei getippten Fremdflasche gibt
  // es keins — dort bleibt nur die Bemerkung.
  const mangelGeraet = istMangel && !bereitsGemeldet ? gewaehlt : undefined;

  const gewaehlteStation = auswahl.optionen.find(
    (s) => s.id === form.fuellstationId,
  );

  const input: FuellungInput = {
    geraetId: form.geraetId,
    flaschenNummer: form.flaschenNummer,
    feuerwehr: form.feuerwehr,
    anzahl: hatFlaschennummer ? 1 : Number(form.anzahl) || 0,
    startdruck: toNumber(form.startdruck),
    enddruck: toNumber(form.enddruck) ?? 0,
    gefuelltVon: form.gefuelltVon,
    sichtkontrolle: form.sichtkontrolle,
    bemerkung: form.bemerkung,
    fuellstationId: gewaehlteStation?.id,
    fuellstationName: gewaehlteStation
      ? geraetLabel(gewaehlteStation)
      : undefined,
    verrechnen: form.verrechnen,
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
    setForm((prev) => {
      const feuerwehr = treffer.feuerwehr || prev.feuerwehr;
      return {
        ...prev,
        // Die führende Kennung und nicht die Bezeichnung: Sonst stünde bei einer
        // Flasche ohne eigene Nummer „Atemluftflasche CFK 6,8 l" im Feld — im
        // Protokoll später nicht von der Nachbarflasche zu unterscheiden.
        flaschenNummer: geraetKennung(treffer) ?? treffer.bezeichnung,
        geraetId: treffer.id,
        feuerwehr,
        enddruck: treffer.nenndruck ? String(treffer.nenndruck) : prev.enddruck,
        // Dieselbe Regel wie beim getippten Feuerwehr-Feld: Die Flasche einer
        // fremden Wehr zu scannen ist der häufigste Weg zu einer zu
        // verrechnenden Füllung.
        ...(verrechnenBeruehrt
          ? {}
          : {
              verrechnen: verrechnenVorgabe({
                feuerwehr,
                firecallId,
                eigeneFeuerwehr,
              }),
            }),
      };
    });
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
                // Ein externer Handscanner tippt den Code und schickt ein
                // Enter hinterher. Nur ein *exakter* Treffer wird übernommen:
                // Ein Mensch, der hier eine Fremdflasche einträgt, soll seinen
                // Text behalten, auch wenn er zufällig einen Vorschlag anreißt.
                onSubmit={(value) => {
                  const exakt = findByCode(flaschen, value);
                  if (exakt.length === 1) uebernehmeFlasche(exakt[0]);
                }}
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
          {gewaehlt && (
            <Grid size={12}>
              <GeraetBestaetigung bestaetigt geraet={gewaehlt} />
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: hatFlaschennummer ? 12 : 8 }}>
            <Autocomplete
              freeSolo
              fullWidth
              options={feuerwehren}
              value={form.feuerwehr}
              onInputChange={(_, next) => setFeuerwehr(next ?? '')}
              onChange={(_, next) =>
                setFeuerwehr(typeof next === 'string' ? next : '')
              }
              renderInput={(params) => (
                <TextField {...params} label={t('fuellung.feuerwehr')} />
              )}
            />
          </Grid>
          {!hatFlaschennummer && (
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                type="number"
                label={t('fuellung.anzahl')}
                value={form.anzahl}
                helperText={t('fuellung.anzahlHint')}
                slotProps={{
                  htmlInput: { min: 1, max: 99, inputMode: 'numeric' },
                }}
                onChange={(e) => set('anzahl', e.target.value)}
              />
            </Grid>
          )}
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
          {auswahl.modus === 'auswahl' && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                fullWidth
                label={t('fuellung.fuellstation')}
                value={form.fuellstationId ?? ''}
                onChange={(e) => {
                  set('fuellstationId', e.target.value);
                  onFuellstationChange?.(e.target.value);
                }}
              >
                {auswahl.optionen.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {geraetLabel(s)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          )}
          {/* Bei genau einer Station steht der Wert fest — ein Auswahlfeld mit
              einem Eintrag wäre nur eine Klickfalle. Die Prüfung auf
              `auswahl.station` steht hier statt eines `!`, weil das Feld
              optional getypt ist. */}
          {auswahl.modus === 'fest' && auswahl.station && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                {t('fuellung.fuellstation')}: {geraetLabel(auswahl.station)}
              </Typography>
            </Grid>
          )}
          <Grid size={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.verrechnen}
                  onChange={(e) => {
                    setVerrechnenBeruehrt(true);
                    set('verrechnen', e.target.checked);
                  }}
                />
              }
              label={t('fuellung.verrechnen')}
            />
          </Grid>
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
