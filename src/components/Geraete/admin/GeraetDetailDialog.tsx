'use client';

import AddIcon from '@mui/icons-material/Add';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlined';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import {
  formatLagerort,
  isBelowMinimum,
  type Geraet,
  type GeraetBestand,
} from '../../../common/geraet';
import BestandBookingDialog, { type BestandBookingMode } from './BestandBookingDialog';
import LagerortDialog from './LagerortDialog';

export interface GeraetDetailDialogProps {
  open: boolean;
  groupId: string;
  geraet: Geraet;
  /** Die Lagerorte dieses Artikels. */
  bestaende: GeraetBestand[];
  /** Alle Bestände der Gruppe (Vorschläge im Lagerort-Dialog). */
  allBestaende: GeraetBestand[];
  /** Gruppen-Admin oder Gerätemeister — sonst nur lesen. */
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
}

/**
 * Ein Artikel mit seinem Bestand je Lagerort. Mitglieder sehen, wo was liegt;
 * Gruppen-Admin und Gerätemeister buchen hier Zugang, Umbuchung und Inventur
 * und legen weitere Lagerorte an.
 */
export default function GeraetDetailDialog({
  open,
  groupId,
  geraet,
  bestaende,
  allBestaende,
  canManage,
  onClose,
  onEdit,
}: GeraetDetailDialogProps) {
  const t = useTranslations('geraete');
  const tCommon = useTranslations('common');
  const format = useFormatter();

  const [booking, setBooking] = useState<{
    mode: BestandBookingMode;
    bestand: GeraetBestand;
  }>();
  const [lagerortOpen, setLagerortOpen] = useState(false);

  const rows = useMemo(
    () =>
      [...bestaende].sort((a, b) =>
        formatLagerort(a.lagerort).localeCompare(formatLagerort(b.lagerort), 'de'),
      ),
    [bestaende],
  );

  const details: [string, string | undefined][] = [
    [t('fields.inventarNr'), geraet.inventarNr],
    [t('fields.zusatzInventarNr'), geraet.zusatzInventarNr],
    [
      t('fields.klasse'),
      [geraet.klasse1, geraet.klasse2, geraet.klasse3].filter(Boolean).join(' / '),
    ],
    [t('fields.materialTyp'), geraet.materialTyp],
    [
      t('fields.hersteller'),
      [geraet.hersteller, geraet.herstellerTyp].filter(Boolean).join(' · '),
    ],
    [t('fields.seriennummer'), geraet.seriennummer],
    [t('fields.baujahr'), geraet.baujahr != null ? String(geraet.baujahr) : undefined],
    [t('fields.besitzer'), geraet.besitzer],
    [t('fields.kostenersatzRateId'), geraet.kostenersatzRateId],
    [t('fields.bemerkung'), geraet.bemerkung],
  ];

  const einheit = geraet.einheit ?? '';

  const actionButton = (
    mode: BestandBookingMode,
    bestand: GeraetBestand,
    icon: ReactNode,
  ) => (
    <Tooltip title={t(`booking.title.${mode}`)}>
      <IconButton
        size="small"
        aria-label={t(`booking.title.${mode}`)}
        onClick={() => setBooking({ mode, bestand })}
      >
        {icon}
      </IconButton>
    </Tooltip>
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{geraet.bezeichnung}</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 2, flexWrap: 'wrap' }}>
          {geraet.verbrauchsmaterial && (
            <Chip size="small" color="primary" label={t('list.consumable')} />
          )}
          {!geraet.active && <Chip size="small" label={t('list.inactive')} />}
          {isBelowMinimum(geraet) && (
            <Chip size="small" color="warning" label={t('list.belowMinimum')} />
          )}
        </Stack>

        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          <strong>{t('detail.bestandGesamt')}:</strong>{' '}
          {t('list.stock', { anzahl: geraet.bestandGesamt ?? 0, einheit })}
          {geraet.mindestbestand != null && (
            <>
              {' · '}
              <strong>{t('fields.mindestbestand')}:</strong> {geraet.mindestbestand}
            </>
          )}
          {geraet.nachbestellenSeit && (
            <>
              <br />
              {t('detail.nachbestellenSeit', {
                date: format.dateTime(new Date(geraet.nachbestellenSeit), {
                  dateStyle: 'medium',
                }),
              })}
            </>
          )}
        </Typography>

        <Stack spacing={0.5} sx={{ mb: 2 }}>
          {details
            .filter(([, value]) => !!value)
            .map(([label, value]) => (
              <Typography key={label} variant="body2">
                <Typography component="span" variant="body2" color="text.secondary">
                  {label}:
                </Typography>{' '}
                {value}
              </Typography>
            ))}
        </Stack>

        <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t('detail.bestand')}
          </Typography>
          {canManage && (
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setLagerortOpen(true)}
            >
              {t('detail.newLagerort')}
            </Button>
          )}
        </Stack>

        {rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('detail.noBestand')}
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('detail.lagerort')}</TableCell>
                <TableCell align="right">{t('detail.anzahl')}</TableCell>
                {canManage && (
                  <TableCell align="right">{tCommon('actions')}</TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    {formatLagerort(b.lagerort) || b.lagerortKey}
                    {b.lagerort.bemerkung && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        {b.lagerort.bemerkung}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={b.anzahl < 0 ? { color: 'error.main' } : undefined}
                  >
                    {b.anzahl}
                  </TableCell>
                  {canManage && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {actionButton('zugang', b, <AddCircleOutlineIcon fontSize="small" />)}
                      {actionButton('umbuchung', b, <SwapHorizIcon fontSize="small" />)}
                      {actionButton('inventur', b, <FactCheckIcon fontSize="small" />)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        {canManage && (
          <Button onClick={onEdit} sx={{ mr: 'auto' }}>
            {tCommon('edit')}
          </Button>
        )}
        <Button onClick={onClose}>{tCommon('close')}</Button>
      </DialogActions>

      {booking && (
        <BestandBookingDialog
          open
          groupId={groupId}
          geraet={geraet}
          bestand={booking.bestand}
          bestaende={bestaende}
          mode={booking.mode}
          onClose={() => setBooking(undefined)}
        />
      )}
      {lagerortOpen && (
        <LagerortDialog
          open
          groupId={groupId}
          geraet={geraet}
          existing={bestaende}
          allBestaende={allBestaende}
          onClose={() => setLagerortOpen(false)}
        />
      )}
    </Dialog>
  );
}
