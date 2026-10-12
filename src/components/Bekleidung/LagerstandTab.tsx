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
import { computeLagerstand } from '../../common/bekleidungLagerstand';
import OnlineOnly from '../site/OnlineOnly';
import BestandAdjustDialog from './BestandAdjustDialog';
import type { BekleidungView } from './bekleidungUi';

const KATEGORIEN: BekleidungKategorie[] = ['einsatz', 'dienst'];

type AdjustTarget = { artikelId?: string; groesse?: string; charge?: string };

/**
 * Lagerstand je Artikel und Größe, getrennt nach Einsatz- und
 * Dienstbekleidung. Kommen Chargen vor, folgt je Charge eine eingerückte
 * Zeile. Bei Mengenartikeln gibt es Zugang und Korrektur — mit Chargen je
 * Charge, weil jede ihren eigenen Bestand hat.
 */
export default function LagerstandTab({ view }: { view: BekleidungView }) {
  const t = useTranslations('bekleidung');
  const [adjust, setAdjust] = useState<AdjustTarget>();
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
        const own = rows.filter((r) => view.artikelById.get(r.artikelId)?.kategorie === kategorie);
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
                {own.map((row) => {
                  const artikel = view.artikelById.get(row.artikelId);
                  const isMenge = artikel?.fuehrung === 'menge';
                  const adjustButton = (target: AdjustTarget) => (
                    <OnlineOnly>
                      <Button size="small" onClick={() => setAdjust(target)}>
                        {t('lagerstand.adjust')}
                      </Button>
                    </OnlineOnly>
                  );
                  return (
                    <Fragment key={`${row.artikelId}|${row.groesse}`}>
                      <TableRow>
                        <TableCell>{artikel?.bezeichnung ?? row.artikelId}</TableCell>
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
