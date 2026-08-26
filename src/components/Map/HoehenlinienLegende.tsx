'use client';

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import type { TerrainLevelId } from '../../common/terrain/terrainIndexTypes';
import { contourRampCss } from './layers/hoehenlinien';

/**
 * Was die gezeichneten Linien bedeuten.
 *
 * Die Farbrampe ist auf den sichtbaren Ausschnitt gedehnt — deshalb ist diese
 * Legende kein Beiwerk: ohne die beiden Höhen an ihren Enden ist die Farbe
 * eine Ordnung ohne Werte, und nach dem nächsten Verschieben der Karte steht
 * derselbe Ton für eine andere Höhe.
 *
 * Neben der Äquidistanz stehen Rasterweite und Stufe: eine Linie aus der
 * Übersichtsstufe sieht auf der Karte genauso genau aus wie eine aus der
 * Detailstufe, ist es aber nicht. Das Höhensystem gehört dazu, weil die
 * Pegelstände in müA geführt werden und die Linien in EVRF2000.
 *
 * Die Namensnennung des BEV ist **Lizenzbedingung** der CC BY 4.0, keine
 * Höflichkeit — sie darf nicht wegfallen, wenn der Platz knapp wird.
 */
export interface HoehenlinienLegendeProps {
  equidistanceM: number;
  level?: TerrainLevelId;
  resolutionM?: number;
  lineCount: number;
  /** Tiefste und höchste Höhe im Ausschnitt, die Enden der Farbrampe. */
  minM?: number;
  maxM?: number;
  status: 'loading' | 'ready' | 'empty' | 'failed';
  /**
   * Die Meldung des Fehlers, der zu `failed` geführt hat.
   *
   * Steht mit in der Legende, weil „konnten nicht berechnet werden" allein
   * keine Frage beantwortet: ein abgebrochener Worker, ein Zeitlimit und ein
   * Netzfehler sehen darin gleich aus, und die Unterscheidung war zuletzt nur
   * über die Konsole am Gerät zu bekommen.
   */
  errorMessage?: string;
}

export default function HoehenlinienLegende({
  equidistanceM,
  level,
  resolutionM,
  lineCount,
  minM,
  maxM,
  status,
  errorMessage,
}: HoehenlinienLegendeProps) {
  const t = useTranslations('hoehenlinien');
  const format = useFormatter();
  const theme = useTheme();

  const height = (value: number) =>
    format.number(value, { maximumFractionDigits: 1 });

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        px: 1,
        py: 0.5,
        borderRadius: 1,
        boxShadow: 2,
      }}
    >
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
        {t('layerName')} · {t('meters', { value: equidistanceM })}
      </Typography>

      {status === 'loading' && (
        <Typography variant="caption" sx={{ display: 'block' }}>
          {t('loading')}
        </Typography>
      )}
      {status === 'empty' && (
        <Typography variant="caption" sx={{ display: 'block' }}>
          {t('noData')}
        </Typography>
      )}
      {status === 'failed' && (
        <>
          <Typography
            variant="caption"
            color="error"
            sx={{ display: 'block' }}
          >
            {t('failed')}
          </Typography>
          {errorMessage && (
            <Typography
              variant="caption"
              color="error"
              sx={{ display: 'block', maxWidth: 240, opacity: 0.85 }}
            >
              {errorMessage}
            </Typography>
          )}
        </>
      )}

      {status === 'ready' && minM !== undefined && maxM !== undefined && (
        <Box sx={{ maxWidth: 200 }}>
          <Box
            sx={{
              height: 8,
              borderRadius: 0.5,
              border: `1px solid ${theme.palette.divider}`,
              background: contourRampCss(theme.palette.mode === 'dark'),
            }}
          />
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {t('meters', { value: height(minM) })}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('meters', { value: height(maxM) })}
            </Typography>
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block' }}
          >
            {t('rampCaption')}
          </Typography>
        </Box>
      )}

      {status === 'ready' && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block' }}
        >
          {t('lineCount', { count: lineCount })}
          {resolutionM !== undefined &&
            ` · ${t('grid', { value: resolutionM })}`}
          {level !== undefined &&
            ` · ${t('level', {
              level: t(level === 'detail' ? 'levelDetail' : 'levelOverview'),
            })}`}
        </Typography>
      )}

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block' }}
      >
        {t('heightDatum', { datum: 'EVRF2000' })}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', maxWidth: 320 }}
      >
        {t('attribution')}
      </Typography>
    </Box>
  );
}
