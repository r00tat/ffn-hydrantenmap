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
  FUELLUNG_ZWECKE,
  geraetKennung,
  geraetLabel,
  SICHTKONTROLLE_WERTE,
  type AtemschutzFuellung,
  type AtemschutzGeraet,
  type FuellungInput,
  type FuellungZweck,
  type Sichtkontrolle,
  validateFuellungInput,
  verrechnenVorgabe,
  waehleFuellstation,
  zweckOf,
  zweckVorgabe,
} from '../../common/atemschutz';
import type { BarcodeScanEvent } from '../../hooks/useBarcodeScanner';
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

/** Ein Einsatz, wie ihn der Dialog zur Wahl stellt. */
export interface FuellungEinsatz {
  id: string;
  name: string;
}

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
  /**
   * Die Einsätze zur Auswahl. Leer oder fehlend heißt: Der Einsatz steht fest
   * und wird nur angezeigt — so am Sammelplatz, wo alles zu *diesem* Einsatz
   * gehört und eine Auswahl nur eine Gelegenheit zum Verklicken wäre.
   */
  firecalls?: FuellungEinsatz[];
  /**
   * Name des feststehenden Einsatzes — nur zur Anzeige, wenn der Dialog keine
   * Auswahl anbietet. Ohne ihn stünde am Sammelplatz beim Anlegen gar kein
   * Einsatz im Formular: Der Name steht dort erst am gespeicherten Dokument,
   * und wer eine Füllung erfasst, soll sehen, welchem Einsatz sie zugeht.
   */
  firecallName?: string;
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
  zweck: FuellungZweck;
  firecallId: string;
  /** Wie `<input type="datetime-local">` ihn führt: `2026-09-02T16:35`. */
  zeitpunkt: string;
}

function toNumber(value: string): number | undefined {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function zweiStellig(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Ein Zeitpunkt für `<input type="datetime-local">`: Ortszeit ohne Zone.
 *
 * `toISOString().slice(0, 16)` wäre UTC und zeigte im Sommer eine um zwei
 * Stunden falsche Uhrzeit an.
 */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return [
    `${d.getFullYear()}-${zweiStellig(d.getMonth() + 1)}-${zweiStellig(d.getDate())}`,
    `${zweiStellig(d.getHours())}:${zweiStellig(d.getMinutes())}`,
  ].join('T');
}

/** Die Rückrichtung: `new Date(...)` liest den Wert als Ortszeit. */
function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
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
  firecalls,
  firecallName,
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

  // Der Einsatz einer bestehenden Zeile steht am Dokument; beim Anlegen gilt
  // der Kontext (Sammelplatz) bzw. der aktive Filter (zentrale Seite).
  const einsatzVorgabe = fuellung?.firecallId ?? firecallId;

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
        firecallId: einsatzVorgabe,
        eigeneFeuerwehr,
      }),
    zweck: fuellung ? zweckOf(fuellung) : zweckVorgabe(einsatzVorgabe),
    firecallId: einsatzVorgabe,
    // Beim Anlegen leer: Der Zeitpunkt ist dann „jetzt", und den setzt der
    // Aufrufer beim Speichern. Ein vorbelegtes Feld wäre in dem Moment schon
    // wieder veraltet — am Sammelplatz vergehen zwischen Öffnen und Speichern
    // Minuten.
    zeitpunkt: fuellung ? toLocalInput(fuellung.zeitpunkt) : '',
  }));
  // Ob der Benutzer den Schalter selbst angefasst hat. Solange nicht, zieht die
  // Vorbelegung nach: Das Feuerwehr-Feld ist beim Öffnen leer und wird meist
  // erst danach ausgefüllt — ohne Nachziehen bliebe das Flag immer aus.
  // Beim Bearbeiten einer gespeicherten Füllung gilt sie als angefasst: Das
  // gespeicherte Flag ist eine getroffene Entscheidung.
  const [verrechnenBeruehrt, setVerrechnenBeruehrt] = useState(!!fuellung);
  // Dieselbe Regel für den Zweck: Solange niemand ihn selbst gesetzt hat,
  // folgt er dem gewählten Einsatz.
  const [zweckBeruehrt, setZweckBeruehrt] = useState(!!fuellung);
  const [mangel, setMangel] = useState<MangelEingabe>(LEERE_MANGEL_EINGABE);
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  // Die Rohlesung des Scans, der die Flasche gesetzt hat. Wird bei jeder
  // Neuwahl mitgesetzt — auch auf `undefined`, sonst bliebe sie an einem Gerät
  // stehen, das gar nicht mehr gescannt wurde.
  const [scan, setScan] = useState<BarcodeScanEvent>();
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
              firecallId: prev.firecallId,
              eigeneFeuerwehr,
            }),
          }),
    }));

  /**
   * Der Einsatz zieht beides nach: „im Einsatz" heißt weder verrechnen noch
   * „Sonstiges". Wer eines von beiden selbst angefasst hat, behält es.
   */
  const setEinsatz = (next: string) =>
    setForm((prev) => ({
      ...prev,
      firecallId: next,
      ...(verrechnenBeruehrt
        ? {}
        : {
            verrechnen: verrechnenVorgabe({
              feuerwehr: prev.feuerwehr,
              firecallId: next,
              eigeneFeuerwehr,
            }),
          }),
      ...(zweckBeruehrt ? {} : { zweck: zweckVorgabe(next) }),
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

  const einsatzWaehlbar = (firecalls?.length ?? 0) > 0;
  const gewaehlterEinsatz = firecalls?.find((f) => f.id === form.firecallId);
  // Die Namenskopie bleibt erhalten, wenn der Einsatz nicht in der Liste steht
  // — etwa ein abgeschlossener, den die Auswahl nicht mehr führt. Ohne das
  // verlöre die Zeile beim Speichern ihren Einsatznamen.
  const einsatzName =
    gewaehlterEinsatz?.name ??
    (form.firecallId && form.firecallId === fuellung?.firecallId
      ? fuellung.firecallName
      : undefined);

  /**
   * Der Einsatz, wenn der Dialog ihn nur anzeigt.
   *
   * Beim Bearbeiten der Einsatz *der Zeile*, beim Anlegen der des Kontexts:
   * Am Sammelplatz gehört jede neue Füllung zum laufenden Einsatz, und dessen
   * Name steht erst am gespeicherten Dokument. Ohne den Rückfall stünde beim
   * Erfassen kein Einsatz im Formular.
   */
  const angezeigterEinsatz = fuellung ? fuellung.firecallName : firecallName;

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
    zweck: form.zweck,
    // Nur mitschicken, wenn der Dialog den Einsatz überhaupt zur Wahl gestellt
    // hat oder eine bestehende Zeile bearbeitet wird — sonst bleibt der
    // Kontext des Aufrufers maßgeblich (`buildFuellungDocument`).
    ...(einsatzWaehlbar || fuellung
      ? { firecallId: form.firecallId, firecallName: einsatzName }
      : {}),
    ...(fromLocalInput(form.zeitpunkt)
      ? { zeitpunkt: fromLocalInput(form.zeitpunkt) }
      : {}),
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
  const uebernehmeFlasche = (
    treffer: AtemschutzGeraet,
    scanEvent?: BarcodeScanEvent,
  ) => {
    setScan(scanEvent);
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
                firecallId: prev.firecallId,
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
        {/* `mt` wie im Gerätedialog: ohne oberes Padding beschneidet der
            Scroll-Container das Label der ersten Zeile. */}
        <Grid container spacing={2} sx={{ mt: 1 }}>
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
              <GeraetBestaetigung bestaetigt geraet={gewaehlt} scan={scan} />
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
          {/* Der Zeitpunkt steht nur beim Bearbeiten im Formular: Beim Anlegen
              ist er „jetzt" und ein vorbelegtes Feld wäre am Sammelplatz beim
              Speichern schon veraltet. Beim Korrigieren ist er dagegen genau
              das, was oft falsch ist — und ohne das Feld setzte ein Speichern
              die Zeile stillschweigend auf die aktuelle Uhrzeit. */}
          {fuellung && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="datetime-local"
                label={t('fuellung.zeitpunkt')}
                value={form.zeitpunkt}
                onChange={(e) => set('zeitpunkt', e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
          )}
          {/* „Zu verrechnen" steht neben der Füllstation, Zweck und Einsatz
              stehen in der Zeile darunter beieinander: Beide beantworten
              denselben Punkt — wozu gefüllt wurde —, und nebeneinander gelesen
              fällt ein Widerspruch auf („Übung" an einem Einsatz). */}
          <Grid size={{ xs: 12, sm: 6 }}>
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
          {/* Eine eigene Zeile mit eigenem Raster statt zweier Halbfelder im
              äußeren: Über diesem Block stehen je nach Lage null, ein oder zwei
              Felder — Füllstation nur, wenn eine gepflegt ist, Zeitpunkt nur
              beim Bearbeiten. Als gewöhnliche Halbfelder würden Zweck und
              Einsatz dann bei jeder zweiten Kombination auseinandergerissen. */}
          <Grid size={12}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  select
                  fullWidth
                  label={t('fuellung.zweck')}
                  value={form.zweck}
                  onChange={(e) => {
                    setZweckBeruehrt(true);
                    set('zweck', e.target.value as FuellungZweck);
                  }}
                >
                  {FUELLUNG_ZWECKE.map((wert) => (
                    <MenuItem key={wert} value={wert}>
                      {t(`zweck.${wert}`)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              {einsatzWaehlbar ? (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    select
                    fullWidth
                    label={t('filter.einsatz')}
                    value={form.firecallId}
                    onChange={(e) => setEinsatz(e.target.value)}
                  >
                    <MenuItem value="">{t('filter.ohneEinsatz')}</MenuItem>
                    {/* Ein Einsatz, der nicht mehr in der Liste steht — etwa
                        ein abgeschlossener —, bekommt seinen eigenen Eintrag:
                        Sonst stünde das Feld leer und ein Speichern nähme der
                        Zeile den Einsatz. */}
                    {!!form.firecallId &&
                      !gewaehlterEinsatz &&
                      einsatzName !== undefined && (
                        <MenuItem value={form.firecallId}>
                          {einsatzName}
                        </MenuItem>
                      )}
                    {firecalls?.map((f) => (
                      <MenuItem key={f.id} value={f.id}>
                        {f.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              ) : (
                !!angezeigterEinsatz && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 2 }}
                    >
                      {t('filter.einsatz')}: {angezeigterEinsatz}
                    </Typography>
                  </Grid>
                )
              )}
            </Grid>
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
          onPicked={(code, treffer, scanEvent) => {
            if (treffer) {
              uebernehmeFlasche(treffer, scanEvent);
              return;
            }
            setScan(scanEvent);
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
