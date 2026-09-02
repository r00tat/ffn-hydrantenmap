'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { truppLabel, type AtemschutzTrupp } from '../../common/atemschutz';

export interface TruppCardProps {
  trupp: AtemschutzTrupp;
  canWrite: boolean;
  /**
   * Ob dies die jüngste Bereitstellung dieses Trupps ist.
   *
   * Nur dort darf der Zustand geändert werden. Eine ältere Zeile im Protokoll
   * bot sonst weiterhin „Abmelden" an, obwohl der Trupp längst abgemeldet ist
   * — und ein Klick darauf öffnete eine zweite Wahrheit über denselben Trupp.
   */
  istAktuell: boolean;
  onEntsenden: () => void;
  onRueckkehr: () => void;
  onWiederBereit: () => void;
  onAbmelden: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const STATUS_FARBE: Record<
  AtemschutzTrupp['status'],
  'success' | 'warning' | 'info' | 'default'
> = {
  bereit: 'success',
  imEinsatz: 'warning',
  zurueck: 'info',
  abgemeldet: 'default',
};

export default function TruppCard({
  trupp,
  canWrite,
  istAktuell,
  onEntsenden,
  onRueckkehr,
  onWiederBereit,
  onAbmelden,
  onEdit,
  onDelete,
}: TruppCardProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');
  const format = useFormatter();

  const uhrzeit = (iso?: string) =>
    iso
      ? format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit' })
      : '';

  return (
    <Card variant="outlined">
      <CardContent sx={{ pb: 1 }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {truppLabel(trupp)}
          </Typography>
          <Chip
            size="small"
            color={STATUS_FARBE[trupp.status]}
            label={t(`trupp.status.${trupp.status}`)}
          />
          {trupp.laufendeNummer > 1 && (
            <Chip
              size="small"
              variant="outlined"
              label={t('trupp.laufendeNummer', { n: trupp.laufendeNummer })}
            />
          )}
          {trupp.ueberwachungBis && (
            // Die Gegenseite der Übergabe: Der Gruppenkommandant hat die
            // Zeitkontrolle beendet, der Trupp ist wieder Sache des
            // Sammelplatzes — Regeneration, Flaschen, neu ausrüsten. Eine
            // Übergabe, die nur der Übergebende sieht, ist keine.
            <Chip
              size="small"
              variant="outlined"
              color="info"
              label={t('trupp.vonUeberwachung', {
                zeit: uhrzeit(trupp.ueberwachungBis),
              })}
            />
          )}
          <Box sx={{ flexGrow: 1 }} />
          {canWrite && (
            <>
              <IconButton size="small" aria-label={tCommon('edit')} onClick={onEdit}>
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                color="warning"
                aria-label={t('trupp.delete')}
                onClick={onDelete}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </>
          )}
        </Stack>

        <Typography variant="body2">{trupp.mitglieder.join(' · ')}</Typography>

        <Typography variant="body2" color="text.secondary" component="div">
          {trupp.status === 'bereit' &&
            t('trupp.seit', { zeit: uhrzeit(trupp.bereitSeit) })}
          {trupp.status === 'imEinsatz' && (
            <>
              {t('trupp.entsendetAn')}: {trupp.entsendetAn} ·{' '}
              {t('trupp.abmarschZeit')} {uhrzeit(trupp.abmarschZeit)}
              {trupp.druckAbmarsch != null && ` · ${trupp.druckAbmarsch} bar`}
            </>
          )}
          {(trupp.status === 'zurueck' || trupp.status === 'abgemeldet') && (
            <>
              {trupp.abmarschZeit && (
                <>
                  {uhrzeit(trupp.abmarschZeit)}
                  {trupp.druckAbmarsch != null && ` (${trupp.druckAbmarsch} bar)`}
                  {' → '}
                </>
              )}
              {trupp.rueckkehrZeit && (
                <>
                  {uhrzeit(trupp.rueckkehrZeit)}
                  {trupp.druckRueckkehr != null &&
                    ` (${trupp.druckRueckkehr} bar)`}
                </>
              )}
              {trupp.entsendetAn && ` · ${trupp.entsendetAn}`}
            </>
          )}
        </Typography>

        {trupp.bemerkung && (
          <Typography variant="body2" color="text.secondary">
            {trupp.bemerkung}
          </Typography>
        )}
      </CardContent>

      {canWrite && istAktuell && trupp.status !== 'abgemeldet' && (
        <CardActions>
          {trupp.status === 'bereit' && (
            <>
              <Button size="small" variant="contained" onClick={onEntsenden}>
                {t('trupp.actions.entsenden')}
              </Button>
              <Button size="small" onClick={onAbmelden}>
                {t('trupp.actions.abmelden')}
              </Button>
            </>
          )}
          {trupp.status === 'imEinsatz' && (
            <Button size="small" variant="contained" onClick={onRueckkehr}>
              {t('trupp.actions.rueckkehr')}
            </Button>
          )}
          {trupp.status === 'zurueck' && (
            <>
              <Button size="small" variant="contained" onClick={onWiederBereit}>
                {t('trupp.actions.wiederBereit')}
              </Button>
              <Button size="small" onClick={onAbmelden}>
                {t('trupp.actions.abmelden')}
              </Button>
            </>
          )}
        </CardActions>
      )}
    </Card>
  );
}
