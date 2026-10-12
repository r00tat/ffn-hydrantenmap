'use client';

import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { Fragment, useMemo, useState } from 'react';
import type { BekleidungKategorie } from '../../common/bekleidung';
import { computeLagerstand, type LagerstandRow } from '../../common/bekleidungLagerstand';
import OnlineOnly from '../site/OnlineOnly';
import BestandAdjustDialog from './BestandAdjustDialog';
import type { BekleidungView } from './bekleidungUi';
import ExpandToggle, { toggleKey } from './ExpandToggle';

const KATEGORIEN: BekleidungKategorie[] = ['einsatz', 'dienst'];

type AdjustTarget = { artikelId?: string; groesse?: string; charge?: string };

/** Die Größenzeilen eines Artikels, in der Reihenfolge von `computeLagerstand`. */
function groupByArtikel(rows: LagerstandRow[]): { artikelId: string; rows: LagerstandRow[] }[] {
  const groups = new Map<string, LagerstandRow[]>();
  for (const row of rows) {
    const list = groups.get(row.artikelId);
    if (list) list.push(row);
    else groups.set(row.artikelId, [row]);
  }
  return [...groups].map(([artikelId, list]) => ({ artikelId, rows: list }));
}

const sum = (rows: LagerstandRow[], key: 'imLager' | 'ausgegeben') =>
  rows.reduce((total, r) => total + r[key], 0);

/**
 * Lagerstand je Artikel, getrennt nach Einsatz- und Dienstbekleidung. Je
 * Artikel eine Zeile mit den Summen; aufgeklappt folgen die Größen und, wenn
 * Chargen vorkommen, je Charge eine eingerückte Zeile — ein Artikel wie die
 * Bootshose hat sonst ein Dutzend Zeilen. Bei Mengenartikeln gibt es Zugang
 * und Korrektur — mit Chargen je Charge, weil jede ihren eigenen Bestand hat.
 */
export default function LagerstandTab({ view }: { view: BekleidungView }) {
  const t = useTranslations('bekleidung');
  const [adjust, setAdjust] = useState<AdjustTarget>();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const rows = useMemo(
    () => computeLagerstand(view.artikel, view.stuecke, view.bestand, view.ausgaben),
    [view.artikel, view.stuecke, view.bestand, view.ausgaben],
  );
  const hasMenge = view.artikel.some((a) => a.fuehrung === 'menge');

  return (
    <>
      {hasMenge && (
        <Box sx={{ mb: 2 }}>
          <OnlineOnly>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAdjust({})}>
              {t('lagerstand.newSize')}
            </Button>
          </OnlineOnly>
        </Box>
      )}
      {rows.length === 0 && <Typography color="text.secondary">{t('lagerstand.empty')}</Typography>}
      {KATEGORIEN.map((kategorie) => {
        const own = groupByArtikel(
          rows.filter((r) => view.artikelById.get(r.artikelId)?.kategorie === kategorie),
        );
        if (own.length === 0) return null;
        return (
          <Box key={kategorie} sx={{ mb: 3, overflowX: 'auto' }}>
            <Typography variant="h6">{t(`kategorie.${kategorie}`)}</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('fields.artikel')}</TableCell>
                  <TableCell>{t('fields.groesse')}</TableCell>
                  <TableCell align="right">{t('lagerstand.imLager')}</TableCell>
                  <TableCell align="right">{t('lagerstand.ausgegeben')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {own.map((group) => {
                  const artikel = view.artikelById.get(group.artikelId);
                  const name = artikel?.bezeichnung ?? group.artikelId;
                  const isMenge = artikel?.fuehrung === 'menge';
                  const open = expanded.has(group.artikelId);
                  const adjustButton = (target: AdjustTarget) => (
                    <OnlineOnly>
                      <Button size="small" onClick={() => setAdjust(target)}>
                        {t('lagerstand.adjust')}
                      </Button>
                    </OnlineOnly>
                  );
                  return (
                    <Fragment key={group.artikelId}>
                      <TableRow
                        hover
                        sx={{ cursor: 'pointer', '& > td': { fontWeight: 500 } }}
                        onClick={() => setExpanded((prev) => toggleKey(prev, group.artikelId))}
                      >
                        <TableCell>
                          <ExpandToggle
                            name={name}
                            expanded={open}
                            onToggle={() => setExpanded((prev) => toggleKey(prev, group.artikelId))}
                          />
                          {name}
                        </TableCell>
                        <TableCell>
                          {t('lagerstand.sizeCount', { count: group.rows.length })}
                        </TableCell>
                        <TableCell align="right">{sum(group.rows, 'imLager')}</TableCell>
                        <TableCell align="right">{sum(group.rows, 'ausgegeben')}</TableCell>
                        <TableCell />
                      </TableRow>
                      {open &&
                        group.rows.map((row) => (
                          <Fragment key={row.groesse}>
                            <TableRow>
                              <TableCell />
                              <TableCell>{row.groesse}</TableCell>
                              <TableCell align="right">{row.imLager}</TableCell>
                              <TableCell align="right">{row.ausgegeben}</TableCell>
                              <TableCell align="right">
                                {isMenge &&
                                  !row.chargen &&
                                  adjustButton({ artikelId: row.artikelId, groesse: row.groesse })}
                              </TableCell>
                            </TableRow>
                            {row.chargen?.map((c) => (
                              <TableRow key={c.charge ?? ''}>
                                <TableCell />
                                <TableCell sx={{ pl: 4, color: 'text.secondary' }}>
                                  {c.charge
                                    ? t('lagerstand.chargeRow', { charge: c.charge })
                                    : t('lagerstand.noCharge')}
                                </TableCell>
                                <TableCell align="right">{c.imLager}</TableCell>
                                <TableCell align="right">{c.ausgegeben}</TableCell>
                                <TableCell align="right">
                                  {isMenge &&
                                    adjustButton({
                                      artikelId: row.artikelId,
                                      groesse: row.groesse,
                                      charge: c.charge ?? '',
                                    })}
                                </TableCell>
                              </TableRow>
                            ))}
                          </Fragment>
                        ))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        );
      })}
      {adjust && (
        <BestandAdjustDialog
          open
          view={view}
          artikelId={adjust.artikelId}
          groesse={adjust.groesse}
          charge={adjust.charge}
          onClose={() => setAdjust(undefined)}
        />
      )}
    </>
  );
}
