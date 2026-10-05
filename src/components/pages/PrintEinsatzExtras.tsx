'use client';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useContext, useMemo } from 'react';
import useFahrtenbuchEntries from '../../hooks/useFahrtenbuchEntries';
import useFirecall, { FirecallContext } from '../../hooks/useFirecall';
import { AusgabeTable, GeraeteTable, TruppProtokollView } from './sybos/SybosAtemschutz';
import { buildFahrtenRows } from './sybos/sybosExtras';
import { sortCrew } from './sybos/sybosReport';
import { CrewTable, EinsatzGeraeteTable, FahrtenTable, TruppTable } from './sybos/SybosTables';
import {
  useAtemschutzReport,
  useEinsatzGeraetRows,
  useFirecallAlarmText,
} from './sybos/useEinsatzReport';

/**
 * Abschnitte der Druckseite, die aus der Sybos-Seite kommen: Sie lesen aus
 * eigenen Sammlungen (Fahrtenbuch, Atemschutz, Geräte, BlaulichtSMS) und verwenden
 * dieselben Tabellen, damit Ausdruck und Sybos-Übertrag übereinstimmen.
 */

const preLine = { whiteSpace: 'pre-line' } as const;

function TextBlock({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body1" sx={preLine}>
        {text}
      </Typography>
    </Box>
  );
}

/** Alarmierungstext und der Einsatzablauf, wie er für Sybos geschrieben wurde. */
export function PrintEinsatzablauf() {
  const t = useTranslations('print');
  const tSybos = useTranslations('sybos');
  const firecall = useFirecall();
  const alarmText = useFirecallAlarmText(firecall);
  const ablauf = firecall.sybosEinsatzablauf || '';
  const taetigkeit = firecall.sybosTaetigkeit || '';

  if (!alarmText && !ablauf && !taetigkeit) return null;
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" className="print-section">
        {t('sectionAblauf')}
      </Typography>
      <Stack spacing={2}>
        <TextBlock title={tSybos('alarmtext')} text={alarmText} />
        <TextBlock title={tSybos('einsatzablauf')} text={ablauf} />
        <TextBlock title={tSybos('taetigkeit')} text={taetigkeit} />
      </Stack>
    </Box>
  );
}

/** Namentliche Mannschaft und die Fahrten aus dem Fahrtenbuch. */
export function PrintMannschaft() {
  const t = useTranslations('print');
  const tSybos = useTranslations('sybos');
  const firecall = useFirecall();
  const { crewAssignments } = useContext(FirecallContext);
  const crew = useMemo(() => sortCrew(crewAssignments), [crewAssignments]);
  const fahrtenbuch = useFahrtenbuchEntries(firecall.group, { firecallId: firecall.id });
  const fahrten = useMemo(() => buildFahrtenRows(fahrtenbuch), [fahrtenbuch]);

  if (crew.length === 0 && fahrten.length === 0) return null;
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" className="print-section">
        {t('sectionMannschaft')}
      </Typography>
      <Stack spacing={2}>
        <CrewTable title={tSybos('mannschaft')} crew={crew} />
        <FahrtenTable title={tSybos('fahrten')} rows={fahrten} />
      </Stack>
    </Box>
  );
}

/** Geräte und Verbrauchsmaterial, eine Zeile je Artikel wie auf der Sybos-Seite. */
export function PrintGeraete() {
  const t = useTranslations('print');
  const tSybos = useTranslations('sybos');
  const firecall = useFirecall();
  const rows = useEinsatzGeraetRows(firecall);

  if (rows.length === 0) return null;
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" className="print-section">
        {t('sectionGeraete')}
      </Typography>
      <EinsatzGeraeteTable title={tSybos('geraete')} rows={rows} />
    </Box>
  );
}

/** Atemschutz: Sammelplatz, Trupps, Geräte, Ausgabe und das Protokoll je Trupp. */
export function PrintAtemschutz() {
  const t = useTranslations('print');
  const tSybos = useTranslations('sybos');
  const firecall = useFirecall();
  const { vorgabe, truppRows, truppsById, protokolle, geraeteRows, ausgabeRows } =
    useAtemschutzReport(firecall);
  const fuellpersonal = firecall.asspFuellpersonal ?? [];

  if (
    truppRows.length === 0 &&
    ausgabeRows.length === 0 &&
    !firecall.asspLeiter &&
    fuellpersonal.length === 0
  ) {
    return null;
  }
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" className="print-section">
        {t('sectionAtemschutz')}
      </Typography>
      <Stack spacing={2}>
        {(firecall.asspLeiter || fuellpersonal.length > 0) && (
          <Typography variant="body1" component="div">
            {firecall.asspLeiter && (
              <div>
                <b>{tSybos('asspLeiter')}:</b> {firecall.asspLeiter}
              </div>
            )}
            {fuellpersonal.length > 0 && (
              <div>
                <b>{tSybos('asspFuellpersonal')}:</b> {fuellpersonal.join(', ')}
              </div>
            )}
          </Typography>
        )}
        <TruppTable title={tSybos('trupps')} rows={truppRows} />
        <GeraeteTable title={tSybos('truppGeraete')} rows={geraeteRows} />
        <AusgabeTable title={tSybos('ausgaben')} rows={ausgabeRows} />
        {protokolle.length > 0 && <Typography variant="h6">{tSybos('truppProtokolle')}</Typography>}
        {protokolle.map((pr) => {
          const trupp = truppsById.get(pr.id);
          return trupp ? (
            <TruppProtokollView key={pr.id} protokoll={pr} trupp={trupp} vorgabe={vorgabe} />
          ) : null;
        })}
      </Stack>
    </Box>
  );
}
