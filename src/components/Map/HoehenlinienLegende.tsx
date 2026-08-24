'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import type { TerrainLevelId } from '../../common/terrain/terrainIndexTypes';

/**
 * Was die gezeichneten Linien bedeuten.
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
  status: 'loading' | 'ready' | 'empty' | 'failed';
}

export default function HoehenlinienLegende({
  equidistanceM,
  level,
  resolutionM,
  lineCount,
  status,
}: HoehenlinienLegendeProps) {
  const t = useTranslations('hoehenlinien');

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
        <Typography
          variant="caption"
          color="error"
          sx={{ display: 'block' }}
        >
          {t('failed')}
        </Typography>
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
