'use client';

import AirIcon from '@mui/icons-material/Air';
import BuildIcon from '@mui/icons-material/Build';
import EditIcon from '@mui/icons-material/Edit';
import SpeedIcon from '@mui/icons-material/Speed';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import {
  truppGeraetLabel,
  truppLabel,
  type AtemschutzTrupp,
  type Geraetesatz,
} from '../../common/atemschutz';
import {
  RESERVEDRUCK_BAR,
  berechneStand,
  dringlichkeit,
  faelligeWarnungen,
  fortschrittProzent,
  sortierteAbfragen,
  type Dringlichkeit,
} from '../../common/atemschutzUeberwachung';

export interface UeberwachungCardProps {
  trupp: AtemschutzTrupp;
  /** Die laufende Uhr aus `useTicker` — die Anzeige schreibt sich damit fort. */
  jetzt: Date;
  vorgabe: Geraetesatz;
  canWrite: boolean;
  /** Nur an der jüngsten Bereitstellung darf der Zustand geändert werden. */
  istAktuell: boolean;
  onUebernehmen: () => void;
  onBearbeiten: () => void;
  onDruckabfrage: () => void;
  onGeraete: () => void;
  onAbmarsch: () => void;
  onRueckkehr: () => void;
}

const FARBE: Record<Dringlichkeit, 'success' | 'warning' | 'error'> = {
  ok: 'success',
  achtung: 'warning',
  kritisch: 'error',
  ueberschritten: 'error',
};

export default function UeberwachungCard({
  trupp,
  jetzt,
  vorgabe,
  canWrite,
  istAktuell,
  onUebernehmen,
  onBearbeiten,
  onDruckabfrage,
  onGeraete,
  onAbmarsch,
  onRueckkehr,
}: UeberwachungCardProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');
  const format = useFormatter();

  const uhrzeit = (iso?: string) =>
    iso
      ? format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit' })
      : '';
  /** Für die Anzeige gerundet — Zehntel bar oder Sekunden hilft hier niemandem. */
  const rund = (wert: number) => Math.round(wert);

  const stand = berechneStand(trupp, jetzt, { vorgabe });
  const imEinsatz = trupp.status === 'imEinsatz';
  const stufe = stand && imEinsatz ? dringlichkeit(stand) : 'ok';
  const warnungen = imEinsatz
    ? faelligeWarnungen(trupp, jetzt, { vorgabe })
    : [];
  const abfragen = sortierteAbfragen(trupp);
  const uebernommen = !!trupp.ueberwachungSeit;

  return (
    <Card
      variant="outlined"
      sx={
        imEinsatz && stufe !== 'ok'
          ? { borderColor: `${FARBE[stufe]}.main`, borderWidth: 2 }
          : undefined
      }
    >
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
            color={
              imEinsatz ? 'warning' : trupp.status === 'bereit' ? 'success' : 'info'
            }
            label={t(`trupp.status.${trupp.status}`)}
          />
          {trupp.laufendeNummer > 1 && (
            <Chip
              size="small"
              variant="outlined"
              label={t('trupp.laufendeNummer', { n: trupp.laufendeNummer })}
            />
          )}
          {!uebernommen && (
            // Der sichtbare Unterschied zwischen „steht in der Liste" und
            // „ich habe die Zeitkontrolle": Die Übergabe ist der Punkt, an dem
            // die Verantwortung wechselt, und sie soll nicht dadurch
            // stattfinden, dass jemand die Seite offen hat.
            <Chip
              size="small"
              variant="outlined"
              color="default"
              label={t('ueberwachung.nichtUebernommen')}
            />
          )}
          <Box sx={{ flexGrow: 1 }} />
          {canWrite && (
            <>
              <Tooltip title={t('ueberwachung.geraeteTitle')}>
                <span>
                  <IconButton
                    size="small"
                    aria-label={t('ueberwachung.geraeteTitle')}
                    onClick={onGeraete}
                  >
                    <BuildIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={t('ueberwachung.bearbeitenTitle')}>
                <span>
                  <IconButton
                    size="small"
                    aria-label={tCommon('edit')}
                    onClick={onBearbeiten}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )}
        </Stack>

        <Typography variant="body2">{trupp.mitglieder.join(' · ')}</Typography>

        <Typography variant="body2" color="text.secondary" component="div">
          {[
            trupp.entsendetAn && `${t('trupp.entsendetAn')}: ${trupp.entsendetAn}`,
            trupp.einsatzziel &&
              `${t('ueberwachung.einsatzziel')}: ${trupp.einsatzziel}`,
            trupp.ueberwachtVon &&
              `${t('ueberwachung.ueberwachtVon')}: ${trupp.ueberwachtVon}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Typography>

        {imEinsatz && stand && (
          <>
            {warnungen.map((w) => (
              <Alert
                key={w.key}
                severity={w.key === 'rueckzug' ? 'error' : 'warning'}
                sx={{ mt: 1 }}
              >
                {t(
                  `ueberwachung.warnungen.${w.key}` as 'ueberwachung.warnungen.drittel',
                  { zeit: uhrzeit(w.faelligSeit) },
                )}
              </Alert>
            ))}

            <Box sx={{ mt: 1.5 }}>
              <LinearProgress
                variant="determinate"
                color={FARBE[stufe]}
                value={fortschrittProzent(stand)}
                sx={{ height: 8, borderRadius: 1 }}
              />
            </Box>

            <Stack
              direction="row"
              spacing={2}
              sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('ueberwachung.vermuteterDruck')}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  <SpeedIcon
                    fontSize="small"
                    sx={{ verticalAlign: 'text-bottom', mr: 0.5 }}
                  />
                  {t('ueberwachung.bar', {
                    druck: rund(stand.vermuteterDruck),
                  })}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('ueberwachung.rueckzugUm')}
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 700 }}
                  color={`${FARBE[stufe]}.main`}
                >
                  {uhrzeit(stand.rueckzugZeit)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {stand.minutenBisRueckzug >= 0
                    ? t('ueberwachung.inMinuten', {
                        minuten: rund(stand.minutenBisRueckzug),
                      })
                    : t('ueberwachung.ueberfaelligSeit', {
                        minuten: rund(-stand.minutenBisRueckzug),
                      })}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('ueberwachung.restdruckWarnung', {
                    druck: RESERVEDRUCK_BAR,
                  })}
                </Typography>
                <Typography variant="body1">
                  {uhrzeit(stand.restdruckZeit)}
                </Typography>
              </Box>
            </Stack>

            <Stack
              direction="row"
              spacing={1}
              sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}
            >
              <Chip
                size="small"
                variant="outlined"
                color={FARBE[stufe]}
                label={t(
                  `ueberwachung.grund.${stand.rueckzugsGrund}` as 'ueberwachung.grund.restdruck',
                  { druck: rund(stand.rueckzugsDruck) },
                )}
              />
              <Chip
                size="small"
                variant="outlined"
                label={t(
                  `ueberwachung.verbrauch.${stand.verbrauch.quelle}` as 'ueberwachung.verbrauch.standard',
                  {
                    liter: Math.round(stand.verbrauch.literProMin),
                    bar: Math.round(stand.verbrauch.barProMin * 10) / 10,
                  },
                )}
              />
              <Chip
                size="small"
                variant="outlined"
                label={t('ueberwachung.geraetesatz', {
                  anzahl: stand.satz.flaschenAnzahl,
                  volumen: stand.satz.flaschenVolumen,
                  druck: stand.satz.fuellDruck,
                  dauer: rund(stand.erwarteteDauerMin),
                })}
              />
              {stand.startdruckGeschaetzt && (
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  label={t('ueberwachung.startdruckGeschaetzt')}
                />
              )}
              {stand.druckAmZiel == null && (
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  label={t('ueberwachung.zielMeldungFehlt')}
                />
              )}
            </Stack>
          </>
        )}

        {trupp.status === 'bereit' && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t('trupp.seit', { zeit: uhrzeit(trupp.bereitSeit) })}
          </Typography>
        )}

        {(trupp.abmarschZeit || abfragen.length > 0) && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" color="text.secondary">
              {t('ueberwachung.druckverlauf')}
            </Typography>
            <Typography variant="body2" component="div">
              {[
                trupp.abmarschZeit &&
                  `${uhrzeit(trupp.abmarschZeit)} ${
                    trupp.druckAbmarsch != null
                      ? t('ueberwachung.bar', { druck: trupp.druckAbmarsch })
                      : '–'
                  } (${t('trupp.actions.entsenden')})`,
                ...abfragen.map(
                  (a) =>
                    `${uhrzeit(a.zeitpunkt)} ${t('ueberwachung.bar', {
                      druck: a.druck,
                    })}${a.amZiel ? ` (${t('ueberwachung.amZielKurz')})` : ''}`,
                ),
                trupp.rueckkehrZeit &&
                  `${uhrzeit(trupp.rueckkehrZeit)} ${
                    trupp.druckRueckkehr != null
                      ? t('ueberwachung.bar', { druck: trupp.druckRueckkehr })
                      : '–'
                  } (${t('trupp.actions.rueckkehr')})`,
              ]
                .filter(Boolean)
                .join('  →  ')}
            </Typography>
          </>
        )}

        {trupp.truppGeraete && trupp.truppGeraete.length > 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            component="div"
            sx={{ mt: 1 }}
          >
            {trupp.truppGeraete
              .map(
                (g) =>
                  `${truppGeraetLabel(g)}${g.person ? ` — ${g.person}` : ''}`,
              )
              .join(' · ')}
          </Typography>
        )}

        {trupp.bemerkung && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {trupp.bemerkung}
          </Typography>
        )}
      </CardContent>

      {canWrite && istAktuell && trupp.status !== 'abgemeldet' && (
        <CardActions sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {!uebernommen && (
            <Button size="small" variant="contained" onClick={onUebernehmen}>
              {t('ueberwachung.actions.uebernehmen')}
            </Button>
          )}
          {trupp.status === 'bereit' && (
            <Button
              size="small"
              variant={uebernommen ? 'contained' : 'outlined'}
              onClick={onAbmarsch}
            >
              {t('ueberwachung.actions.abmarsch')}
            </Button>
          )}
          {imEinsatz && (
            <>
              <Button
                size="small"
                variant="contained"
                startIcon={<AirIcon />}
                onClick={onDruckabfrage}
              >
                {t('ueberwachung.actions.druckabfrage')}
              </Button>
              <Button size="small" onClick={onRueckkehr}>
                {t('trupp.actions.rueckkehr')}
              </Button>
            </>
          )}
        </CardActions>
      )}
    </Card>
  );
}
