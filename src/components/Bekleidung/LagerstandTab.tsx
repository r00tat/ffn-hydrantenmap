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
import { useMemo, useState } from 'react';
import type { BekleidungKategorie } from '../../common/bekleidung';
import { computeLagerstand } from '../../common/bekleidungLagerstand';
import OnlineOnly from '../site/OnlineOnly';
import BestandAdjustDialog from './BestandAdjustDialog';
import type { BekleidungView } from './bekleidungUi';

const KATEGORIEN: BekleidungKategorie[] = ['einsatz', 'dienst'];

/**
 * Lagerstand je Artikel und Größe, getrennt nach Einsatz- und
 * Dienstbekleidung. Bei Mengenartikeln gibt es Zugang und Korrektur.
 */
export default function LagerstandTab({ view }: { view: BekleidungView }) {
  const t = useTranslations('bekleidung');
  const [adjust, setAdjust] = useState<{ artikelId?: string; groesse?: string }>();
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
      {rows.length === 0 && (
        <Typography color="text.secondary">{t('lagerstand.empty')}</Typography>
      )}
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
                  return (
                    <TableRow key={`${row.artikelId}|${row.groesse}`}>
                      <TableCell>{artikel?.bezeichnung ?? row.artikelId}</TableCell>
                      <TableCell>{row.groesse}</TableCell>
                      <TableCell align="right">{row.imLager}</TableCell>
                      <TableCell align="right">{row.ausgegeben}</TableCell>
                      <TableCell align="right">
                        {artikel?.fuehrung === 'menge' && (
                          <OnlineOnly>
                            <Button
                              size="small"
                              onClick={() =>
                                setAdjust({ artikelId: row.artikelId, groesse: row.groesse })
                              }
                            >
                              {t('lagerstand.adjust')}
                            </Button>
                          </OnlineOnly>
                        )}
                      </TableCell>
                    </TableRow>
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
          onClose={() => setAdjust(undefined)}
        />
      )}
    </>
  );
}
