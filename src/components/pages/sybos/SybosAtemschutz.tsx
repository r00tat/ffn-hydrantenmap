'use client';

import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { AtemschutzTrupp, Geraetesatz } from '../../../common/atemschutz';
import { berechneStand } from '../../../common/atemschutzUeberwachung';
import DruckVerlaufChart from '../../Atemschutz/DruckVerlaufChart';
import {
  truppProtokollText,
  type AusgabeRow,
  type GeraetRow,
  type TruppProtokoll,
} from './sybosExtras';
import { TitledTable } from './SybosTables';

/**
 * Das Protokoll einer Bereitstellung: Kopfdaten, alle Ereignisse mit Druck und
 * die Druckkurve der Überwachungsseite.
 *
 * Die Kurve wird bis zur Rückkehr gezeichnet, bei einem Trupp, der noch
 * draußen ist, bis zum Öffnen der Seite — die Sybos-Seite ist ein Rückblick und
 * tickt nicht mit.
 */
export function TruppProtokollView({
  protokoll,
  trupp,
  vorgabe,
  onCopy,
}: {
  protokoll: TruppProtokoll;
  trupp: AtemschutzTrupp;
  vorgabe: Geraetesatz;
  /** Ohne Kopier-Knopf, etwa auf der Druckseite. */
  onCopy?: (text: string) => void;
}) {
  const t = useTranslations('sybos');
  const [geoeffnet] = useState(() => new Date());
  const jetzt = useMemo(
    () => (trupp.rueckkehrZeit ? new Date(trupp.rueckkehrZeit) : geoeffnet),
    [geoeffnet, trupp.rueckkehrZeit],
  );
  const stand = useMemo(() => berechneStand(trupp, jetzt, { vorgabe }), [jetzt, trupp, vorgabe]);

  return (
    <Paper variant="outlined" sx={{ p: 1.5, breakInside: 'avoid-page' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1 }}>
          {protokoll.titel}
        </Typography>
        {onCopy && (
          <Button
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={() => onCopy(truppProtokollText(protokoll))}
          >
            {t('copy')}
          </Button>
        )}
      </Box>
      {protokoll.kopf.length > 0 && (
        <Table size="small" sx={{ mb: 1, width: 'auto' }}>
          <TableBody>
            {protokoll.kopf.map((k) => (
              <TableRow key={k.label}>
                <TableCell sx={{ fontWeight: 'bold', pl: 0 }}>{k.label}</TableCell>
                <TableCell>{k.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <TruppEreignisse protokoll={protokoll} />
      {stand && <DruckVerlaufChart trupp={trupp} stand={stand} jetzt={jetzt} />}
    </Paper>
  );
}

function TruppEreignisse({ protokoll }: { protokoll: TruppProtokoll }) {
  const t = useTranslations('sybos.cols');
  return (
    <TitledTable
      title=""
      head={[t('zeit'), t('ereignis'), t('druck'), t('bemerkung')]}
      rows={protokoll.ereignisse.map((e) => [e.zeit, e.ereignis, e.druck, e.bemerkung])}
    />
  );
}

export function GeraeteTable({ title, rows }: { title: string; rows: GeraetRow[] }) {
  const t = useTranslations('sybos.cols');
  return (
    <TitledTable
      title={title}
      head={[t('trupp'), t('traeger'), t('geraetTyp'), t('bezeichnung'), t('kennung')]}
      rows={rows.map((r) => [r.trupp, r.person, r.typ, r.bezeichnung, r.kennung])}
    />
  );
}

export function AusgabeTable({ title, rows }: { title: string; rows: AusgabeRow[] }) {
  const t = useTranslations('sybos.cols');
  return (
    <TitledTable
      title={title}
      head={[t('geraet'), t('ausgegebenAn'), t('status'), t('ausgabe'), t('ruecknahme')]}
      rows={rows.map((r) => [r.geraet, r.an, r.status, r.ausgabe, r.ruecknahme])}
    />
  );
}
