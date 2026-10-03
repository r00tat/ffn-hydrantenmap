'use client';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { doc } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { computeAllFields } from '../../../common/computeFieldValue';
import useFahrtenbuchEntries from '../../../hooks/useFahrtenbuchEntries';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import useFirecall, { FirecallContext } from '../../../hooks/useFirecall';
import { useFirecallLayersSorted } from '../../../hooks/useFirecallLayers';
import useFirecallLocations from '../../../hooks/useFirecallLocations';
import useFirecallWriteAccess from '../../../hooks/useFirecallWriteAccess';
import { useFirecallKostenersatz } from '../../../hooks/useKostenersatz';
import useVehicles from '../../../hooks/useVehicles';
import { setDoc } from '../../../lib/firestoreClient';
import { firestore } from '../../firebase/firebase';
import { downloadText } from '../../firebase/download';
import {
  FIRECALL_COLLECTION_ID,
  type Firecall,
  type FirecallItem,
  type FirecallLayer,
} from '../../firebase/firestore';
import { getItemInstance } from '../../FirecallItems/elements';
import DynamicMap from '../../Map/PositionedMap';
import { useSnackbar } from '../../providers/SnackbarProvider';
import DiaryTable from '../DiaryTable';
import { useDiaries } from '../EinsatzTagebuch';
import { useGeschaeftsbuchEintraege } from '../Geschaeftsbuch';
import {
  buildAiContext,
  buildBasisdaten,
  buildGeschaeftsbuchText,
  buildKraefte,
  buildMannschaftText,
  countMaterial,
  buildNotizenText,
  buildTagebuchText,
  sortCrew,
} from './sybosReport';
import {
  buildAtemschutzText,
  truppProtokollText,
  buildFahrtenRows,
  buildMeasurementTables,
  buildSpectrumRows,
  buildSpectrumText,
  collectAttachments,
  measurementCsv,
  measurementSummary,
  type MeasurementTable,
} from './sybosExtras';
import { AusgabeTable, GeraeteTable, TruppProtokollView } from './SybosAtemschutz';
import { AttachmentList, DriveFiles } from './SybosFiles';
import { generateSybosSummary } from './sybosSummary';
import { useAtemschutzReport, useFirecallAlarmText } from './useEinsatzReport';
import {
  CrewTable,
  FahrtenTable,
  MaterialTable,
  MeasurementTableView,
  SpectrumTable,
  StrengthRowsTable,
  TitledTable,
  TruppTable,
} from './SybosTables';

const overviewMapSx = {
  height: { xs: 350, md: 500 },
  display: 'flex',
  overflow: 'hidden',
  '& .map-area, & .map-area .leaflet-container': {
    width: '100%',
    height: '100%',
  },
  '& .map-sidebar': {
    display: 'none',
  },
};

function useCopy() {
  const t = useTranslations('sybos');
  const showSnackbar = useSnackbar();
  return useCallback(
    async (value: string) => {
      try {
        // Ohne Secure Context (etwa über die LAN-IP im Feuerwehrhaus) fehlt
        // `navigator.clipboard` ganz — das ist ein Fehler, kein stiller Erfolg.
        if (!navigator.clipboard) {
          throw new Error('clipboard API unavailable');
        }
        await navigator.clipboard.writeText(value);
        showSnackbar(t('copied'), 'success', undefined, 2000);
      } catch (err) {
        console.error('copy to clipboard failed', err);
        showSnackbar(t('copyFailed'), 'error');
      }
    },
    [showSnackbar, t],
  );
}

function CopyButton({ value }: { value: string }) {
  const t = useTranslations('sybos');
  const copy = useCopy();
  return (
    <Tooltip title={t('copy')}>
      <span>
        <IconButton
          size="small"
          edge="end"
          aria-label={t('copy')}
          disabled={!value}
          onClick={() => copy(value)}
        >
          <ContentCopyIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
}

/**
 * Ein Feld zum Abschreiben: der Wert so, wie er nach Sybos gehört, und ein
 * Knopf, der genau diesen Wert in die Zwischenablage legt.
 */
function CopyField({
  label,
  value,
  multiline,
  onChange,
  onBlur,
  placeholder,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}) {
  return (
    <TextField
      label={label}
      value={value}
      fullWidth
      size="small"
      multiline={multiline}
      minRows={multiline ? 2 : undefined}
      maxRows={multiline ? 20 : undefined}
      placeholder={placeholder}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      onBlur={onBlur}
      slotProps={{
        input: {
          readOnly: !onChange,
          endAdornment: (
            <InputAdornment
              position="end"
              sx={multiline ? { alignSelf: 'flex-start', mt: 1.5 } : undefined}
            >
              <CopyButton value={value} />
            </InputAdornment>
          ),
        },
        inputLabel: { shrink: true },
      }}
    />
  );
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: hint ? 0.5 : 2,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          {title}
        </Typography>
        {action}
      </Box>
      {hint && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {hint}
        </Typography>
      )}
      <Stack spacing={2}>{children}</Stack>
    </Paper>
  );
}

const euro = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });

/** Messreihe als CSV — zum Hochladen in Sybos oder zum Öffnen in Excel. */
function CsvButton({ table }: { table: MeasurementTable }) {
  const t = useTranslations('sybos');
  return (
    <Button
      size="small"
      startIcon={<DownloadIcon />}
      onClick={() =>
        // Mit BOM, sonst liest Excel die Umlaute und „µ" als Latin-1.
        downloadText(
          `\ufeff${measurementCsv(table)}`,
          `${table.layerName || 'messungen'}.csv`,
          'text/csv;charset=utf-8',
        )
      }
    >
      {t('csv')}
    </Button>
  );
}

/**
 * Berechnete Datenfelder je Element. Sie stehen nicht am Element, sondern
 * werden aus der Formel der Ebene gerechnet — asynchron, weil mathjs erst
 * nachgeladen wird.
 */
function useComputedFields(items: FirecallItem[], layers: FirecallLayer[]) {
  const [computed, setComputed] = useState<Record<string, Record<string, number>>>({});
  useEffect(() => {
    let active = true;
    (async () => {
      const result: Record<string, Record<string, number>> = {};
      for (const layer of layers) {
        const schema = layer.dataSchema ?? [];
        if (!schema.some((f) => f.type === 'computed')) continue;
        for (const item of items) {
          if (item.id && item.layer === layer.id && item.fieldData) {
            result[item.id] = await computeAllFields(item.fieldData, schema);
          }
        }
      }
      if (active) setComputed(result);
    })();
    return () => {
      active = false;
    };
  }, [items, layers]);
  return computed;
}

export default function SybosPage() {
  const t = useTranslations('sybos');
  const firecall = useFirecall();
  const { firecallItems } = useVehicles();
  const { locations } = useFirecallLocations();
  const { diaries } = useDiaries(true);
  const { eintraege } = useGeschaeftsbuchEintraege(true);
  const { crewAssignments } = useContext(FirecallContext);
  const { email } = useFirebaseLogin();
  const canWrite = useFirecallWriteAccess();
  const showSnackbar = useSnackbar();
  const copy = useCopy();
  const tKosten = useTranslations('kostenersatz.status');
  const layers = useFirecallLayersSorted();
  const { vorgabe, truppRows, truppsById, protokolle, geraeteRows, ausgabeRows } =
    useAtemschutzReport(firecall);
  const fahrtenbuch = useFahrtenbuchEntries(firecall.group, {
    firecallId: firecall.id,
  });
  const { calculations } = useFirecallKostenersatz(firecall.id);
  const alarmText = useFirecallAlarmText(firecall);
  const computed = useComputedFields(firecallItems, layers);

  const basis = useMemo(
    () => buildBasisdaten({ firecall, items: firecallItems, locations }),
    [firecall, firecallItems, locations],
  );
  const kraefte = useMemo(
    () => buildKraefte(firecallItems, crewAssignments),
    [firecallItems, crewAssignments],
  );
  const mannschaft = useMemo(() => buildMannschaftText(crewAssignments), [crewAssignments]);
  const crewSorted = useMemo(() => sortCrew(crewAssignments), [crewAssignments]);
  const materialCounts = useMemo(
    () => countMaterial(firecallItems, (item) => getItemInstance(item).markerName()),
    [firecallItems],
  );
  const material = useMemo(
    () => materialCounts.map(({ label, count }) => `${count}× ${label}`).join('\n'),
    [materialCounts],
  );
  const notizen = useMemo(() => buildNotizenText(locations), [locations]);
  const tagebuch = useMemo(() => buildTagebuchText(diaries), [diaries]);
  const geschaeftsbuch = useMemo(() => buildGeschaeftsbuchText(eintraege), [eintraege]);
  const atemschutz = useMemo(() => buildAtemschutzText(truppRows), [truppRows]);
  const protokolleText = useMemo(
    () => protokolle.map(truppProtokollText).join('\n\n'),
    [protokolle],
  );
  const geraete = useMemo(
    () =>
      geraeteRows
        .map((r) =>
          [r.trupp, r.person, r.typ, r.bezeichnung, r.kennung].filter(Boolean).join(' – '),
        )
        .join('\n'),
    [geraeteRows],
  );
  const assp = useMemo(
    () =>
      [
        firecall.asspLeiter ? `${t('asspLeiter')}: ${firecall.asspLeiter}` : '',
        firecall.asspFuellpersonal?.length
          ? `${t('asspFuellpersonal')}: ${firecall.asspFuellpersonal.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    [firecall.asspFuellpersonal, firecall.asspLeiter, t],
  );
  const spectrumRows = useMemo(() => buildSpectrumRows(firecallItems), [firecallItems]);
  const spectren = useMemo(() => buildSpectrumText(spectrumRows), [spectrumRows]);
  const measurementTables = useMemo(
    () => buildMeasurementTables(firecallItems, layers, computed),
    [computed, firecallItems, layers],
  );
  const messungen = useMemo(
    () => measurementTables.map(measurementSummary).join('\n'),
    [measurementTables],
  );
  const fahrtenRows = useMemo(() => buildFahrtenRows(fahrtenbuch), [fahrtenbuch]);
  const fahrten = useMemo(
    () =>
      fahrtenRows
        .map((r) =>
          [r.fahrzeug, r.fahrer, `${r.abfahrt}–${r.ankunft}`, r.km ? `${r.km} km` : '', r.ziel]
            .filter(Boolean)
            .join(', '),
        )
        .join('\n'),
    [fahrtenRows],
  );
  const attachments = useMemo(
    () => collectAttachments(firecall, firecallItems),
    [firecall, firecallItems],
  );

  // Die beiden Texte stehen am Einsatz, damit sie nicht bei jedem Öffnen neu
  // erzeugt werden müssen und Korrekturen von Hand erhalten bleiben.
  const storedAblauf: string = firecall.sybosEinsatzablauf || '';
  const storedTaetigkeit: string = firecall.sybosTaetigkeit || '';
  const [einsatzablauf, setEinsatzablauf] = useState(storedAblauf);
  const [taetigkeit, setTaetigkeit] = useState(storedTaetigkeit);
  useEffect(() => setEinsatzablauf(storedAblauf), [storedAblauf]);
  useEffect(() => setTaetigkeit(storedTaetigkeit), [storedTaetigkeit]);

  const [generating, setGenerating] = useState(false);

  const saveSummary = useCallback(
    async (fields: { sybosEinsatzablauf?: string; sybosTaetigkeit?: string }) => {
      if (!firecall.id || !canWrite) return;
      try {
        await setDoc(
          doc(firestore, FIRECALL_COLLECTION_ID, firecall.id),
          {
            ...fields,
            updatedAt: new Date().toISOString(),
            updatedBy: email,
          },
          { merge: true },
        );
      } catch (err) {
        console.error('failed to save sybos summary', err);
        showSnackbar(t('saveFailed'), 'error');
      }
    },
    [canWrite, email, firecall.id, showSnackbar, t],
  );

  const sections = useMemo(
    () => [
      {
        title: t('sectionBasis'),
        text: basis.map((b) => `${t(`basis.${b.key}`)}: ${b.value}`).join('\n'),
      },
      { title: t('eigeneKraefte'), text: kraefte.eigene },
      // Die Namen der Mannschaft gehen nicht an das Modell: Im Berichtstext
      // haben sie nichts verloren, und was nicht hinausgeht, kann auch nicht
      // dort auftauchen. Kopiert werden sie trotzdem mit.
      { title: t('mannschaft'), text: mannschaft, private: true },
      { title: t('sonstigeKraefte'), text: kraefte.fremde },
      { title: t('material'), text: material },
      // Fahrer stehen mit Namen darin, deshalb wie die Mannschaft privat.
      { title: t('fahrten'), text: fahrten, private: true },
      { title: t('alarmtext'), text: alarmText },
      // Die Zeilen zum Atemschutz nennen bewusst keine Geräteträger.
      { title: t('sectionAtemschutz'), text: atemschutz },
      { title: t('assp'), text: assp, private: true },
      // Protokolle und Geräte nennen Geräteträger beim Namen.
      { title: t('truppProtokolle'), text: protokolleText, private: true },
      { title: t('truppGeraete'), text: geraete, private: true },
      { title: t('spektren'), text: spectren },
      { title: t('sectionMessungen'), text: messungen },
      { title: t('einsatzorte'), text: notizen },
      { title: t('sectionTagebuch'), text: tagebuch },
      { title: t('geschaeftsbuch'), text: geschaeftsbuch },
    ],
    [
      alarmText,
      assp,
      atemschutz,
      basis,
      fahrten,
      geraete,
      geschaeftsbuch,
      kraefte,
      mannschaft,
      material,
      messungen,
      notizen,
      protokolleText,
      spectren,
      t,
      tagebuch,
    ],
  );

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const summary = await generateSybosSummary(
        buildAiContext(sections.filter((s) => !s.private)),
      );
      setEinsatzablauf(summary.einsatzablauf);
      setTaetigkeit(summary.taetigkeit);
      await saveSummary({
        sybosEinsatzablauf: summary.einsatzablauf,
        sybosTaetigkeit: summary.taetigkeit,
      });
    } catch (err) {
      console.error('sybos summary failed', err);
      showSnackbar(t('generateFailed'), 'error');
    } finally {
      setGenerating(false);
    }
  }, [saveSummary, sections, showSnackbar, t]);

  const copyAll = useCallback(() => {
    const all = buildAiContext([
      sections[0],
      { title: t('einsatzablauf'), text: einsatzablauf },
      { title: t('taetigkeit'), text: taetigkeit },
      ...sections.slice(1),
    ]);
    copy(all);
  }, [copy, einsatzablauf, sections, t, taetigkeit]);

  const hasSummary = einsatzablauf !== '' || taetigkeit !== '';

  return (
    <Box sx={{ p: 2, maxWidth: 1000, mx: 'auto' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mb: 1,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {t('title')}
        </Typography>
        <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={copyAll}>
          {t('copyAll')}
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('intro')}
      </Typography>

      <Stack spacing={2}>
        {/* Übersichtskarte wie auf der Druckseite — zum Nachsehen, nicht zum
            Kopieren. Ohne Seitenleiste und in voller Breite. */}
        <Paper variant="outlined" sx={overviewMapSx}>
          <DynamicMap />
        </Paper>

        {/* 1. Basisdaten */}
        <Section title={t('sectionBasis')}>
          {basis.length === 0 && <Typography color="text.secondary">{t('empty')}</Typography>}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 2,
            }}
          >
            {basis.map((b) => (
              <Box
                key={b.key}
                sx={
                  b.key === 'name' || b.key === 'einsatzort' || b.key === 'beschreibung'
                    ? { gridColumn: '1 / -1' }
                    : undefined
                }
              >
                <CopyField
                  label={t(`basis.${b.key}`)}
                  value={b.value}
                  multiline={b.key === 'beschreibung'}
                />
              </Box>
            ))}
          </Box>
          {alarmText && <CopyField label={t('alarmtext')} value={alarmText} multiline />}
        </Section>

        {/* 2. Einsatzablauf (Gemini) */}
        <Section
          title={t('sectionAblauf')}
          hint={t('ablaufHint')}
          // Nur mit Schreibrecht: Ein Gast mit reinem Lesezugriff könnte das
          // Ergebnis nicht speichern, der Aufruf kostete nur Kontingent.
          action={
            canWrite && (
              <Button
                variant="contained"
                startIcon={
                  generating ? <CircularProgress size={20} color="inherit" /> : <AutoAwesomeIcon />
                }
                onClick={generate}
                disabled={generating}
              >
                {generating ? t('generating') : hasSummary ? t('regenerate') : t('generate')}
              </Button>
            )
          }
        >
          {hasSummary && <Alert severity="info">{t('aiReview')}</Alert>}
          <CopyField
            label={t('einsatzablauf')}
            value={einsatzablauf}
            multiline
            placeholder={t('summaryPlaceholder')}
            onChange={canWrite ? setEinsatzablauf : undefined}
            onBlur={() =>
              einsatzablauf !== storedAblauf && saveSummary({ sybosEinsatzablauf: einsatzablauf })
            }
          />
          <CopyField
            label={t('taetigkeit')}
            value={taetigkeit}
            multiline
            placeholder={t('summaryPlaceholder')}
            onChange={canWrite ? setTaetigkeit : undefined}
            onBlur={() =>
              taetigkeit !== storedTaetigkeit && saveSummary({ sybosTaetigkeit: taetigkeit })
            }
          />
        </Section>

        {/* 3. Kräfte und Material */}
        <Section title={t('sectionKraefte')}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label={t('summeEigene', {
                units: kraefte.summe.eigeneEinheiten,
                persons: kraefte.summe.eigenePersonen,
              })}
            />
            {kraefte.summe.fremdeEinheiten > 0 && (
              <Chip
                label={t('summeFremde', {
                  units: kraefte.summe.fremdeEinheiten,
                  persons: kraefte.summe.fremdePersonen,
                })}
              />
            )}
            {kraefte.summe.ats > 0 && <Chip label={t('summeAts', { count: kraefte.summe.ats })} />}
          </Box>
          <StrengthRowsTable title={t('eigeneKraefte')} rows={kraefte.eigeneRows} />
          <CrewTable title={t('mannschaft')} crew={crewSorted} />
          <StrengthRowsTable title={t('sonstigeKraefte')} rows={kraefte.fremdeRows} />
          <MaterialTable title={t('material')} material={materialCounts} />
          <FahrtenTable title={t('fahrten')} rows={fahrtenRows} />
        </Section>

        {/* 4. Atemschutz */}
        {(truppRows.length > 0 || assp || ausgabeRows.length > 0) && (
          <Section
            title={t('sectionAtemschutz')}
            action={
              atemschutz ? (
                <Button
                  size="small"
                  startIcon={<ContentCopyIcon />}
                  onClick={() => copy(atemschutz)}
                >
                  {t('copy')}
                </Button>
              ) : undefined
            }
          >
            {assp && <CopyField label={t('assp')} value={assp} multiline />}
            <TruppTable title={t('trupps')} rows={truppRows} />
            <GeraeteTable title={t('truppGeraete')} rows={geraeteRows} />
            <AusgabeTable title={t('ausgaben')} rows={ausgabeRows} />
            {protokolle.length > 0 && <Typography variant="h6">{t('truppProtokolle')}</Typography>}
            {protokolle.map((pr) => {
              const trupp = truppsById.get(pr.id);
              return trupp ? (
                <TruppProtokollView
                  key={pr.id}
                  protokoll={pr}
                  trupp={trupp}
                  vorgabe={vorgabe}
                  onCopy={copy}
                />
              ) : null;
            })}
          </Section>
        )}

        {/* 5. Messungen */}
        {(spectrumRows.length > 0 || measurementTables.length > 0) && (
          <Section title={t('sectionMessungen')}>
            <SpectrumTable title={t('spektren')} rows={spectrumRows} />
            {measurementTables.map((table) => (
              <MeasurementTableView
                key={table.layerId}
                table={table}
                action={<CsvButton table={table} />}
              />
            ))}
          </Section>
        )}

        {/* 4. Sonstige Notizen */}
        {(notizen || geschaeftsbuch || calculations.length > 0) && (
          <Section title={t('sectionNotizen')}>
            {notizen && <CopyField label={t('einsatzorte')} value={notizen} multiline />}
            {geschaeftsbuch && (
              <CopyField label={t('geschaeftsbuch')} value={geschaeftsbuch} multiline />
            )}
            <TitledTable
              title={t('kostenersatz')}
              head={[t('cols.empfaenger'), t('cols.status'), t('cols.summe')]}
              rows={calculations.map((c) => [
                c.recipient?.name || '',
                tKosten(c.status),
                euro.format(c.totalSum ?? 0),
              ])}
            />
          </Section>
        )}

        {/* Anhänge und Fotos zum Hochladen in Sybos */}
        <Section title={t('sectionDateien')} hint={t('dateienHint')}>
          {attachments.length === 0 && !firecall.driveFolderId && (
            <Typography color="text.secondary">{t('empty')}</Typography>
          )}
          <AttachmentList attachments={attachments} />
          {firecall.id && firecall.driveFolderId && <DriveFiles firecallId={firecall.id} />}
        </Section>

        {/* 5. Einsatztagebuch */}
        {/* Zum Lesen dieselbe Tabelle wie auf der Druckseite, kopiert wird
            der Text mit einem Eintrag je Zeile. */}
        <Section
          title={t('sectionTagebuch')}
          action={
            tagebuch ? (
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => copy(tagebuch)}>
                {t('copy')}
              </Button>
            ) : undefined
          }
        >
          {diaries.length > 0 ? (
            <Box sx={{ overflowX: 'auto' }}>
              <DiaryTable diaries={diaries} />
            </Box>
          ) : (
            <Typography color="text.secondary">{t('empty')}</Typography>
          )}
        </Section>
      </Stack>
    </Box>
  );
}
