'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import useDammLinien from '../../../hooks/useDammLinien';
import useFirecallItemAdd from '../../../hooks/useFirecallItemAdd';
import useFirecallItemUpdate from '../../../hooks/useFirecallItemUpdate';
import type { Line } from '../../firebase/firestore';
import { dammSumme } from '../../FirecallItems/elements/damm/dammSumme';
import { buildDammbauDiaryEntry } from '../../FirecallItems/elements/damm/dammbauDiaryEntry';
import {
  DAMM_BAUWEISEN,
  SACK_FORMAT_KEYS,
  dammbauParams,
  dammbauView,
  nachTabelle,
  type DammBauweise,
  type DammVorgabe,
  type DammbauParams,
} from '../../FirecallItems/elements/damm/sandsack';
import { useSnackbar } from '../../providers/SnackbarProvider';
import { parseNumber, round } from '../panelNumbers';
import DammQuerschnittChart from './DammQuerschnittChart';
import SandsackErgebnis from './SandsackErgebnis';

/**
 * Der Rechner für den Sandsackbedarf einer Dammlinie.
 *
 * Enthält den ganzen Zustand, aber **keinen eigenen Rahmen** — den gibt
 * `DammbauPanel` über der Karte. Gleiche Aufteilung wie beim
 * `VersorgungRechner`: eine Spalte, deren Inhalt scrollt und deren Fußzeile
 * stehenbleibt.
 *
 * Jede Änderung rechnet sofort neu, ohne zu speichern. Am Regler wird probiert;
 * gespeichert wird mit „Übernehmen", und ins Einsatztagebuch geht nur die
 * Materialanforderung, die tatsächlich abgesetzt wurde.
 */

const HOEHE_MIN = 0.2;
const HOEHE_MAX = 2;
const HOEHE_STEP = 0.1;

/**
 * Die Aufschriften stehen als Paare und nicht als `t(`method${value}`)`:
 * next-intl typisiert die Schlüssel statisch, ein zusammengesetzter Schlüssel
 * ist damit kein Schlüssel. Gleiches gilt für die Sackformate.
 */
const BAUWEISE_LABELS: Record<
  DammBauweise,
  | 'methodPyramide'
  | 'methodNotdamm'
  | 'methodEinfach'
  | 'methodDammbalken'
> = {
  pyramide: 'methodPyramide',
  notdamm: 'methodNotdamm',
  einfach: 'methodEinfach',
  dammbalken: 'methodDammbalken',
};

const FORMAT_LABELS: Record<
  string,
  'bagFormat_30x60' | 'bagFormat_40x70'
> = {
  '30x60': 'bagFormat_30x60',
  '40x70': 'bagFormat_40x70',
};

/** Welches von Personal und Zeit eingegeben wird — das andere wird gerechnet. */
const VORGABEN: {
  value: DammVorgabe;
  label: 'givenPersonnel' | 'givenTime';
}[] = [
  { value: 'personal', label: 'givenPersonnel' },
  { value: 'zeit', label: 'givenTime' },
];

/**
 * Die Reglerwerte als Felder am Element.
 *
 * Zwei Übersetzungen stecken darin: Die Schalter liegen im Firestore als
 * `'true'`/`'false'` und nicht als Wahrheitswerte — so wie alle anderen
 * Schalter an einem Element auch. Und die Handeingaben, die nicht gesetzt sind,
 * werden zu `undefined`: Ein geschriebener Wert wäre eine Handeingabe und
 * schaltete den Rechner von der Tabelle auf die Geometrie um.
 */
function gespeichert(params: DammbauParams, enabled: boolean): Partial<Line> {
  const {
    fuellTrichter,
    saeckeRoedeln,
    dammBoeschung,
    fuellLeistung,
    transportLeistung,
    verbauLeistung,
    ...rest
  } = params;
  return {
    ...rest,
    dammbau: enabled ? 'true' : 'false',
    fuellTrichter: fuellTrichter ? 'true' : 'false',
    saeckeRoedeln: saeckeRoedeln ? 'true' : 'false',
    dammBoeschung,
    fuellLeistung,
    transportLeistung,
    verbauLeistung,
  };
}

export interface SandsackRechnerProps {
  item: Line;
  /**
   * Ob der Schalter „Diese Linie als Dammlinie rechnen" mitgezeichnet wird.
   * Über der Karte steht er im Rechner selbst.
   */
  showEnableSwitch?: boolean;
}

export default function SandsackRechner({
  item,
  showEnableSwitch = true,
}: SandsackRechnerProps) {
  const t = useTranslations('dammbau');
  const updateItem = useFirecallItemUpdate();
  const addItem = useFirecallItemAdd();
  const showSnackbar = useSnackbar();
  const linien = useDammLinien();

  // Eingeschaltet, sobald der Rechner geöffnet wird: Wer ihn aufruft, will das
  // Ergebnis sehen und nicht erst einen Schalter finden. Der Schalter bleibt für
  // den umgekehrten Weg — die Linie wieder zu einer gewöhnlichen zu machen.
  const [enabled, setEnabled] = useState(true);
  const [params, setParams] = useState<DammbauParams>(() =>
    dammbauParams(item)
  );
  const [requested, setRequested] = useState(false);

  const draft = useMemo(
    () =>
      ({ ...item, dammbau: enabled ? 'true' : 'false' }) as unknown as Line,
    [item, enabled]
  );
  const view = useMemo(() => dammbauView(draft, params), [draft, params]);

  // Die Summe rechnet mit dem **gespeicherten** Stand der anderen Abschnitte,
  // aber mit den Reglerwerten dieses hier: Sonst zeigte die Gesamtmenge etwas
  // anderes als die Zeilen darüber.
  const summe = useMemo(() => {
    const andere = linien.filter((linie) => linie.id !== item.id);
    return dammSumme([...andere, { ...item, ...gespeichert(params, enabled) }]);
  }, [linien, item, enabled, params]);

  const set = <K extends keyof DammbauParams>(
    key: K,
    value: DammbauParams[K]
  ) => setParams((previous) => ({ ...previous, [key]: value }));

  const persist = async () => {
    await updateItem({ ...item, ...gespeichert(params, enabled) });
  };

  const handleApply = async () => {
    await persist();
    showSnackbar(t('savedMessage'), 'success');
  };

  const handleRequestMaterial = async () => {
    if (!view) return;
    await addItem(
      buildDammbauDiaryEntry({
        dammName: item.name,
        view,
        timestamp: new Date().toISOString(),
        bauweiseLabel: t(BAUWEISE_LABELS[params.dammBauweise]),
        formatLabel: t(FORMAT_LABELS[params.sackFormat] ?? 'bagFormat_30x60'),
        summe,
        labels: {
          title: (name) => t('diaryTitle', { name }),
          section: (metres, height, method) =>
            t('diarySection', { metres, height, method }),
          bags: (order, needed, reserve) =>
            t('diaryBags', { order, needed, reserve }),
          sand: (tons, cubic) => t('diarySand', { tons, cubic }),
          pallets: (count) => t('diaryPallets', { count }),
          trucksBags: (count) => t('diaryTrucksBags', { count }),
          trucksSand: (count) => t('diaryTrucksSand', { count }),
          foil: (area) => t('diaryFoil', { area }),
          bagFormat: (format, fillLevel, weightWet) =>
            t('diaryBagFormat', { format, fillLevel, weightWet }),
          tools: (shovels, funnels) =>
            t('diaryTools', { shovels, funnels }),
          waterLevel: (level, freeboard) =>
            t('diaryWaterLevel', { level, freeboard }),
          crossSection: (base, crown, layers) =>
            t('diaryCrossSection', { base, crown, layers }),
          split: (fill, transport, lay) =>
            t('diarySplit', { fill, transport, lay }),
          carry: (metres, helpers) => t('diaryCarry', { metres, helpers }),
          source:
            view.bedarf.saeckeSource === 'tabelle'
              ? t('diarySourceTable')
              : t('diarySourceGeometry'),
          funnel: t('diaryFunnel'),
          tie: t('diaryTie'),
          work: (hours, personal) => t('diaryWork', { hours, personal }),
          totalTitle: (count) => t('diaryTotalTitle', { count }),
          totalBags: (count) => t('diaryTotalBags', { count }),
          totalSand: (tons) => t('diaryTotalSand', { tons }),
          totalTrucks: (count) => t('diaryTotalTrucks', { count }),
          totalPersonnel: (count, hours) =>
            t('diaryTotalPersonnel', { count, hours }),
        },
      })
    );
    await persist();
    setRequested(true);
    showSnackbar(t('requestedMessage'), 'success');
  };

  /**
   * Ein Zahlenfeld für einen der Parameter. `hint` hängt einen Tooltip an — für
   * die Werte, deren Aufschrift allein nicht sagt, was sie bedeuten.
   */
  const zahl = (
    key: keyof DammbauParams,
    label: string,
    step = 1,
    unit?: string,
    hint?: string,
    /**
     * Ob ein leeres Feld erlaubt ist. Bei den Handeingaben ist es der
     * Normalfall — leer heißt „aus der Tabelle rechnen".
     */
    optional = false
  ) => {
    const wert = params[key] as number | undefined;
    const feld = (
      <TextField
        size="small"
        type="number"
        fullWidth
        label={unit ? `${label} (${unit})` : label}
        value={wert ?? ''}
        slotProps={{ htmlInput: { step } }}
        onChange={(event) => {
          const eingabe = event.target.value;
          if (optional && eingabe.trim() === '') {
            set(key, undefined as DammbauParams[typeof key]);
            return;
          }
          set(
            key,
            parseNumber(eingabe, wert ?? 0) as DammbauParams[typeof key]
          );
        }}
      />
    );
    return (
      <Grid size={{ xs: 6 }}>
        {hint ? <Tooltip title={hint}>{feld}</Tooltip> : feld}
      </Grid>
    );
  };

  /** Ein Schalter für einen der Wahrheitswert-Parameter. */
  const schalter = (
    key: 'fuellTrichter' | 'saeckeRoedeln',
    label: string,
    hint: string
  ) => (
    <Grid size={{ xs: 12 }}>
      <Tooltip title={hint}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={params[key]}
              slotProps={{ input: { 'aria-label': label } }}
              onChange={(event) => set(key, event.target.checked)}
            />
          }
          label={<Typography variant="body2">{label}</Typography>}
        />
      </Tooltip>
    </Grid>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ p: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {showEnableSwitch && (
          <Tooltip title={t('enableHint')}>
            <FormControlLabel
              sx={{ mb: 1 }}
              control={
                <Switch
                  size="small"
                  checked={enabled}
                  slotProps={{ input: { 'aria-label': t('enable') } }}
                  onChange={(event) => setEnabled(event.target.checked)}
                />
              }
              label={<Typography variant="body2">{t('enable')}</Typography>}
            />
          </Tooltip>
        )}

        {!view && (
          <Typography variant="body2" color="text.secondary">
            {t('enableHint')}
          </Typography>
        )}

        {view && (
          <>
            <Typography variant="caption" color="text.secondary">
              {t('length')}
            </Typography>
            <Typography variant="body1">
              {Math.round(view.laenge)} {t('unitM')}
            </Typography>

            {/* Die Bauweise steht über den Zahlen: Sie entscheidet über den
                Querschnitt und damit über alles, was danach kommt. */}
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={params.dammBauweise}
              onChange={(_event, value) =>
                value !== null && set('dammBauweise', value as DammBauweise)
              }
              sx={{ my: 1.5 }}
            >
              {DAMM_BAUWEISEN.map((bauweise) => (
                <ToggleButton key={bauweise} value={bauweise}>
                  {t(BAUWEISE_LABELS[bauweise])}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Typography variant="caption" color="text.secondary">
              {t('height')} ({t('unitM')})
            </Typography>
            <Grid container spacing={2} sx={{ alignItems: 'center' }}>
              <Grid size={{ xs: 7 }}>
                <Slider
                  value={params.dammHoehe}
                  min={HOEHE_MIN}
                  max={HOEHE_MAX}
                  step={HOEHE_STEP}
                  marks={[
                    { value: 0.5, label: '0,5' },
                    { value: 1, label: '1,0' },
                    { value: 1.5, label: '1,5' },
                  ]}
                  valueLabelDisplay="auto"
                  aria-label={t('height')}
                  onChange={(_event, value) =>
                    set('dammHoehe', value as number)
                  }
                />
              </Grid>
              <Grid size={{ xs: 5 }}>
                <TextField
                  size="small"
                  type="number"
                  fullWidth
                  label={t('height')}
                  value={params.dammHoehe}
                  slotProps={{ htmlInput: { step: 0.1 } }}
                  onChange={(event) =>
                    set(
                      'dammHoehe',
                      parseNumber(event.target.value, params.dammHoehe)
                    )
                  }
                />
              </Grid>
            </Grid>

            {/* Das Freibord sagt, welcher Wasserstand mit dieser Höhe noch
                gehalten wird. Die Dammhöhe bleibt die Eingabe: Sonst gäbe es
                zwei Wahrheiten für dieselbe Höhe. */}
            <Grid container spacing={2} sx={{ mt: 0.5, alignItems: 'center' }}>
              {zahl('freibord', t('freeboard'), 0.05, t('unitM'))}
              <Grid size={{ xs: 6 }}>
                <Tooltip title={t('heightHint')}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {t('waterLevel')}
                    </Typography>
                    <Typography variant="body1">
                      {round(view.bedarf.wasserstand, 2)} {t('unitM')}
                    </Typography>
                  </Box>
                </Tooltip>
              </Grid>
              {nachTabelle(params.dammBauweise) &&
                zahl(
                  'dammBoeschung',
                  t('slope'),
                  0.5,
                  t('unitTimesHeight'),
                  t('slopeHint'),
                  true
                )}
              <Grid size={{ xs: 6 }}>
                <TextField
                  select
                  size="small"
                  fullWidth
                  label={t('bagFormat')}
                  value={params.sackFormat}
                  onChange={(event) => set('sackFormat', event.target.value)}
                >
                  {SACK_FORMAT_KEYS.map((key) => (
                    <MenuItem key={key} value={key}>
                      {t(FORMAT_LABELS[key])}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              {zahl('sackFuellgrad', t('fillLevel'), 1, t('unitPercent'))}
              {zahl(
                'transportWeite',
                t('carryDistance'),
                5,
                t('unitM'),
                t('carryDistanceHint')
              )}
              {zahl('lkwNutzlast', t('truckPayload'), 1, t('unitT'))}
              {schalter('fuellTrichter', t('funnel'), t('funnelHint'))}
              {schalter('saeckeRoedeln', t('tie'), t('tieHint'))}

              {/* Zuletzt, weil es aus allem darüber folgt: Trageweite,
                  Füllhilfe und Zubinden bestimmen die Leistungswerte, und aus
                  denen ergibt sich, wie lange es mit den Kräften dauert — oder
                  wie viele Kräfte für die Zeit nötig sind.

                  Genau eines von beiden: Beides einzugeben hieße, dieselbe
                  Rechnung zweimal in verschiedene Richtungen zu führen. */}
              <Grid size={{ xs: 6 }}>
                <Tooltip title={t('givenHint')}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {t('given')}
                    </Typography>
                    <ToggleButtonGroup
                      exclusive
                      fullWidth
                      size="small"
                      value={params.dammVorgabe}
                      onChange={(_event, value) =>
                        value !== null &&
                        set('dammVorgabe', value as DammVorgabe)
                      }
                    >
                      {VORGABEN.map(({ value, label }) => (
                        <ToggleButton key={value} value={value}>
                          {t(label)}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </Box>
                </Tooltip>
              </Grid>
              {params.dammVorgabe === 'personal'
                ? zahl('dammPersonal', t('personnel'), 1)
                : zahl('dammZielzeit', t('targetTime'), 0.5, t('unitH'))}
            </Grid>

            {/* Das Bild steht **vor** den Zahlen: Es beantwortet, was
                Bauweise und Basisbreite geometrisch bedeuten — und diese Frage
                kommt vor der Sackzahl. */}
            <Typography
              variant="subtitle2"
              sx={{ mt: 2, mb: 0.5 }}
              color="text.secondary"
            >
              {t('crossSectionChart')}
            </Typography>
            <DammQuerschnittChart view={view} />

            <SandsackErgebnis view={view} summe={summe} />

            {/* Eingeklappt: Das sind die Annahmen hinter den Zahlen, keine
                Bedienung. Wer sie ändern muss, findet sie; wer nur den Bedarf
                will, stolpert nicht darüber. */}
            <Accordion disableGutters elevation={0} sx={{ mt: 2 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2" color="text.secondary">
                  {t('sectionAssumptions')}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t('sourceHint')}
                    </Typography>
                  </Grid>
                  {/* Leer heißt: aus den Tabellen der Lehrunterlage rechnen.
                      Ein eingetragener Wert schlägt sie — für die Füllanlage,
                      die die Unterlage nicht kennt. */}
                  {zahl(
                    'fuellLeistung',
                    t('fillRate'),
                    5,
                    t('unitBagsPerHour'),
                    undefined,
                    true
                  )}
                  {zahl(
                    'transportLeistung',
                    t('transportRate'),
                    5,
                    t('unitBagsPerHour'),
                    undefined,
                    true
                  )}
                  {zahl(
                    'verbauLeistung',
                    t('layRate'),
                    5,
                    t('unitBagsPerHour'),
                    undefined,
                    true
                  )}
                  {zahl('sandDichte', t('sandDensity'), 0.1, t('unitTPerM3'))}
                  {zahl('dammReserve', t('reserve'), 5, t('unitPercent'))}
                </Grid>
              </AccordionDetails>
            </Accordion>
          </>
        )}
      </Box>

      <Divider />
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          p: 1,
          flexShrink: 0,
          justifyContent: 'flex-end',
        }}
      >
        {/* Ein disabled Button braucht im Tooltip einen span-Wrapper, sonst
            feuert er keine Events und MUI warnt. */}
        <Tooltip title={t('requestMaterialHint')}>
          <span>
            <Button
              size="small"
              onClick={handleRequestMaterial}
              disabled={!view || view.bedarf.saecke <= 0 || requested}
            >
              {requested ? t('requestMaterialDone') : t('requestMaterial')}
            </Button>
          </span>
        </Tooltip>
        <Button size="small" onClick={handleApply} variant="contained">
          {t('save')}
        </Button>
      </Box>
    </Box>
  );
}
