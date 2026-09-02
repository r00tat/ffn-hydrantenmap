'use client';

import { Fragment } from 'react';
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
  gruppiereTruppGeraete,
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
import DruckVerlaufChart from './DruckVerlaufChart';
import { ASSP_EINHEIT, istEinheitName, zuordnungKey } from './einheiten';

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
  /** Zurückgekehrter Trupp geht erneut hinein — als neue Bereitstellung. */
  onErneutEinsatz: () => void;
  /** Zurückgekehrter Trupp geht zurück an den Sammelplatz. */
  onAnSammelplatz: () => void;
}

/** Eine Zeile des Druckverlaufs: Uhrzeit, Druck, wofür der Wert steht. */
interface VerlaufZeile {
  key: string;
  zeitpunkt: string;
  druck?: number;
  label: string;
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
  onErneutEinsatz,
  onAnSammelplatz,
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
  const geraeteGruppen = gruppiereTruppGeraete(trupp.truppGeraete);
  const uebernommen = !!trupp.ueberwachungSeit;
  const uebergeben = !!trupp.ueberwachungBis;

  const zuordnung = zuordnungKey(trupp);
  const zuordnungLabel = istEinheitName(zuordnung)
    ? zuordnung
    : t(
        `ueberwachung.zuordnung.${
          zuordnung === ASSP_EINHEIT ? 'assp' : 'keine'
        }` as 'ueberwachung.zuordnung.assp',
      );

  /**
   * Der Druckverlauf als Zeilen.
   *
   * Der Abmarsch steht nicht in `abfragen` (er ist `abmarschZeit` +
   * `druckAbmarsch`), die Rückkehr auch nicht — für die Anzeige gehören alle
   * drei in dieselbe Spalte.
   */
  const verlauf: VerlaufZeile[] = [
    ...(trupp.abmarschZeit
      ? [
          {
            key: 'abmarsch',
            zeitpunkt: trupp.abmarschZeit,
            druck: trupp.druckAbmarsch,
            label: t('ueberwachung.abmarschUm'),
          },
        ]
      : []),
    ...abfragen.map((a, i) => ({
      key: `abfrage-${i}-${a.zeitpunkt}`,
      zeitpunkt: a.zeitpunkt,
      druck: a.druck,
      // Eine gewöhnliche Zwischenabfrage bleibt unbeschriftet: Stünde an jeder
      // Zeile „Druckabfrage", fielen Ankunft, Rückzug und Rückkehr nicht mehr
      // auf.
      label: [
        a.amZiel && t('ueberwachung.amZielKurz'),
        a.rueckzug && t('ueberwachung.rueckzugKurz'),
      ]
        .filter(Boolean)
        .join(' · '),
    })),
    ...(trupp.rueckkehrZeit
      ? [
          {
            key: 'rueckkehr',
            zeitpunkt: trupp.rueckkehrZeit,
            druck: trupp.druckRueckkehr,
            label: t('trupp.actions.rueckkehr'),
          },
        ]
      : []),
  ];

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
          {uebergeben && (
            // Der Trupp ist regeneriert oder wird es gerade — er steht nicht
            // mehr unter dieser Zeitkontrolle. Ohne diesen Vermerk stünde am
            // Ende des Einsatzes an jedem Trupp ein Gruppenkommandant, der ihn
            // „überwacht".
            <Chip
              size="small"
              variant="outlined"
              color="info"
              label={t('ueberwachung.uebergeben', {
                zeit: uhrzeit(trupp.ueberwachungBis),
              })}
            />
          )}
          {!uebernommen && (
            // Der sichtbare Unterschied zwischen „steht in der Liste" und
            // „ich habe die Zeitkontrolle": Die Übergabe ist der Punkt, an dem
            // die Verantwortung wechselt, und sie soll nicht dadurch
            // stattfinden, dass jemand die Seite offen hat.
            <Tooltip title={t('ueberwachung.uebernehmenKurz')} describeChild>
              <Chip
                size="small"
                variant="outlined"
                color="default"
                label={t('ueberwachung.nichtUebernommen')}
              />
            </Tooltip>
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

        {/* Die Zuordnung steht in der Textzeile und nicht als Chip: Im Kopf
            stehen schon Zustand, Bereitstellung und die Vermerke der Übergabe —
            ein weiterer Chip macht die Karte nicht klarer, sondern voller.
            Genannt wird sie **immer**, auch ohne Einheit: Eine leere Stelle
            wäre nicht von „steht am Sammelplatz" zu unterscheiden. */}
        <Typography variant="body2" color="text.secondary" component="div">
          {[
            `${t('ueberwachung.einheitKurz')}: ${zuordnungLabel}`,
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
              {/* Links der Abmarsch: Jede Zahl rechts davon ist von diesem
                  Zeitpunkt aus gerechnet, und ohne ihn lässt sich nicht
                  einschätzen, wie belastbar die Schätzung ist. */}
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('ueberwachung.abmarschUm')}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {uhrzeit(trupp.abmarschZeit)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('ueberwachung.seitMinuten', {
                    minuten: rund(stand.einsatzMinuten),
                  })}
                </Typography>
              </Box>
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
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="div"
                >
                  {/* Woher der Wert fortgeschrieben ist — ein Wert, der auf
                      einer halben Stunde alten Ablesung beruht, ist etwas
                      anderes als einer von vor zwei Minuten. */}
                  {t('ueberwachung.standBasis', {
                    zeit: uhrzeit(stand.letzterPunkt.zeitpunkt),
                    druck: rund(stand.letzterPunkt.druck),
                  })}
                </Typography>
              </Box>
              {/* Nach der Rückzugsmeldung steht hier nicht mehr die Frist,
                  sondern der Rückweg: Die Prognose ist erfüllt, und „in −8 min"
                  wäre eine Mahnung an einen Trupp, der schon unterwegs ist. */}
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {stand.rueckzugSeit
                    ? t('ueberwachung.rueckzugSeit')
                    : t('ueberwachung.rueckzugUm')}
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 700 }}
                  color={`${FARBE[stufe]}.main`}
                >
                  {uhrzeit(stand.rueckzugSeit ?? stand.rueckzugZeit)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {stand.rueckzugSeit
                    ? t('ueberwachung.seitMinuten', {
                        minuten: rund(
                          (jetzt.getTime() -
                            new Date(stand.rueckzugSeit).getTime()) /
                            60_000,
                        ),
                      })
                    : stand.minutenBisRueckzug >= 0
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
            {/* Eine Zeile je Wert und keine Kette mit Pfeilen: Am
                Einsatzort wird das im Vorbeigehen gelesen, und drei
                Zeitangaben in einer umgebrochenen Zeile sind genau dann nicht
                zu erfassen. Drei Spalten, damit Uhrzeiten und Drücke
                untereinander stehen. */}
            <Box
              sx={{
                mt: 0.5,
                display: 'grid',
                gridTemplateColumns: 'auto auto 1fr',
                columnGap: 1.5,
                rowGap: 0.25,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {verlauf.map((zeile) => (
                <Fragment key={zeile.key}>
                  <Typography variant="body2" color="text.secondary">
                    {uhrzeit(zeile.zeitpunkt)}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, textAlign: 'right' }}
                  >
                    {zeile.druck != null
                      ? t('ueberwachung.bar', { druck: zeile.druck })
                      : '–'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {zeile.label}
                  </Typography>
                </Fragment>
              ))}
            </Box>
            {/* Die Kurve unter den Zeilen: Die Zeilen tragen die genauen
                Werte, die Kurve die Steigung — „wie schnell geht die Luft
                weg?" ist aus Zahlen nicht abzulesen. */}
            {stand && (
              <DruckVerlaufChart trupp={trupp} stand={stand} jetzt={jetzt} />
            )}
          </>
        )}

        {/* Eine Zeile je Träger und nicht eine Kette aus allem: Gefragt ist
            „was trägt Huber?", nicht „was wurde als Drittes gescannt". Bei
            einem Trupp zu drei Personen mit Flasche, Maske und Gerät stehen
            sonst neun Angaben mit angehängten Namen in einem Absatz. */}
        {geraeteGruppen.length > 0 && (
          <Box sx={{ mt: 1 }}>
            {geraeteGruppen.map((gruppe) => (
              <Typography
                key={gruppe.person ?? ''}
                variant="body2"
                color="text.secondary"
                component="div"
              >
                <Box component="span" sx={{ fontWeight: 600 }}>
                  {gruppe.person ?? t('ueberwachung.geraetPersonKeine')}
                </Box>
                {': '}
                {gruppe.geraete.map(truppGeraetLabel).join(' · ')}
              </Typography>
            ))}
          </Box>
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
            // Mit Erklärung: „Zeitkontrolle übernehmen" sagt nicht von selbst,
            // dass danach dieses Gerät die Warnungen bekommt.
            <Tooltip title={t('ueberwachung.uebernehmenKurz')} describeChild>
              <Button size="small" variant="contained" onClick={onUebernehmen}>
                {t('ueberwachung.actions.uebernehmen')}
              </Button>
            </Tooltip>
          )}
          {trupp.status === 'bereit' && (
            <Button
              size="small"
              variant={uebernommen ? 'contained' : 'outlined'}
              onClick={onAbmarsch}
            >
              {t('ueberwachung.actions.inDenEinsatz')}
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
          {trupp.status === 'zurueck' && !uebergeben && (
            <>
              {/* Der Trupp hat gefüllt und geht wieder hinein. Am Sammelplatz
                  führt der Weg über „wieder bereitstellen" — hier steht der
                  Gruppenkommandant selbst davor und schickt ihn direkt. */}
              <Button
                size="small"
                variant="contained"
                onClick={onErneutEinsatz}
              >
                {t('ueberwachung.actions.erneutInDenEinsatz')}
              </Button>
              {/* Oder eben nicht — dann ist der Trupp Sache des
                  Sammelplatzes, und die Zeitkontrolle ist hier zu Ende. */}
              <Button size="small" onClick={onAnSammelplatz}>
                {t('ueberwachung.actions.anSammelplatz')}
              </Button>
            </>
          )}
        </CardActions>
      )}
    </Card>
  );
}
