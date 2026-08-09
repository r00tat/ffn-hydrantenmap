'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import type { Mangel } from '../../common/mangel';
import { mangelStatusColor } from './mangelStatus';

export interface MangelListProps {
  mangel: Mangel[];
  /** Blendet die Fahrzeugspalte aus — in einer auf ein Fahrzeug gefilterten Sicht. */
  hideVehicle?: boolean;
  /** Nur Admins dürfen löschen; ohne Handler entfällt der Button. */
  onDelete?: (mangel: Mangel) => void;
  onEdit: (mangel: Mangel) => void;
}

/**
 * Die Mängeltabelle. Bewusst ohne eigene Filter: Die Filter gehören auf die
 * Seite, damit dieselbe Tabelle auch in einer schon gefilterten Sicht steht,
 * ohne zwei konkurrierende Filterzustände zu haben.
 */
export default function MangelList({
  mangel,
  hideVehicle,
  onDelete,
  onEdit,
}: MangelListProps) {
  const t = useTranslations('fahrtenbuch.maengel');
  const format = useFormatter();

  const tightCell = { width: '1%', whiteSpace: 'nowrap' } as const;

  const dateText = (iso?: string) => {
    if (!iso) return '';
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ''
      : format.dateTime(date, { dateStyle: 'short', timeStyle: 'short' });
  };

  if (mangel.length === 0) {
    return <Typography color="text.secondary">{t('noMangel')}</Typography>;
  }

  return (
    <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={tightCell}>{t('status')}</TableCell>
            {!hideVehicle && (
              <TableCell sx={tightCell}>{t('vehicle')}</TableCell>
            )}
            {/* Die Beschreibung bekommt den ganzen Rest der Breite — dieselbe
                Aufteilung wie in der Fahrtenliste. */}
            <TableCell sx={{ width: '99%' }}>{t('description')}</TableCell>
            <TableCell sx={tightCell}>{t('reportedAt')}</TableCell>
            <TableCell sx={tightCell}>{t('resolvedAt')}</TableCell>
            <TableCell sx={tightCell}>{t('notes')}</TableCell>
            <TableCell sx={tightCell} />
          </TableRow>
        </TableHead>
        <TableBody>
          {mangel.map((item) => (
            <TableRow key={item.id}>
              <TableCell sx={tightCell}>
                <Chip
                  size="small"
                  color={mangelStatusColor(item.status)}
                  label={t(`statuses.${item.status}` as 'statuses.open')}
                />
              </TableCell>
              {!hideVehicle && (
                <TableCell sx={tightCell}>{item.vehicleName}</TableCell>
              )}
              <TableCell>
                <Typography variant="body2">{item.description}</Typography>
                {item.entryId && (
                  <Typography variant="caption" color="text.secondary">
                    {t('fromEntry')}
                  </Typography>
                )}
              </TableCell>
              <TableCell sx={tightCell}>
                <Box>{dateText(item.reportedAt)}</Box>
                <Typography variant="caption" color="text.secondary">
                  {item.reportedByName}
                </Typography>
              </TableCell>
              <TableCell sx={tightCell}>{dateText(item.resolvedAt)}</TableCell>
              <TableCell sx={tightCell}>
                {t('noteCount', { count: item.notes?.length ?? 0 })}
              </TableCell>
              <TableCell align="right" sx={tightCell}>
                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{ justifyContent: 'flex-end' }}
                >
                  {/* `aria-label` zusätzlich zum Tooltip: Dessen `title`
                      landet am `span`-Wrapper, der Knopf selbst bliebe ohne
                      Beschriftung — für Screenreader wäre er dann namenlos. */}
                  <Tooltip title={t('editMangel')}>
                    <span>
                      <IconButton
                        size="small"
                        aria-label={t('editMangel')}
                        onClick={() => onEdit(item)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  {onDelete && (
                    <Tooltip title={t('delete')}>
                      <span>
                        <IconButton
                          size="small"
                          aria-label={t('delete')}
                          onClick={() => onDelete(item)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
