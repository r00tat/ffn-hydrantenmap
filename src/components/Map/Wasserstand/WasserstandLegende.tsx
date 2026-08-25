'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import {
  GRADIENT_WARN_AXIS_M,
  wasserstandStale,
} from '../../../common/terrain/wasserstand';
import type { Wasserstand } from '../../firebase/firestore';
import { BAND_LABEL_KEYS, WASSERSTAND_BANDS } from './wasserstandFarben';

/**
 * Was die gezeichnete Fläche bedeutet — und was sie **nicht** ist.
 *
 * Pflichtteil, nicht Beiwerk: eine Fläche ohne Rasterweite, Wasserstand und
 * Quellenangabe ist im Führungsvorgang wertlos, und ohne den Hinweis auf die
 * Abschätzung wird sie als Tatsache gelesen. Derselbe Maßstab wie beim
 * Sandsackrechner.
 */
export interface WasserstandLegendeProps {
  item: Wasserstand;
  /** Wasserstand in müA, wenn die Umrechnung verfügbar war. */
  adriaM?: number;
}

export default function WasserstandLegende({
  item,
  adriaM,
}: WasserstandLegendeProps) {
  const t = useTranslations('wasserstand');
  const stufe = item.wasserStufe === 'detail' ? 1 : 10;
  const hektar = (item.wasserFlaecheM2 ?? 0) / 10000;

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        px: 1,
        py: 0.5,
        borderRadius: 1,
        boxShadow: 2,
        maxWidth: 320,
      }}
    >
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
        {t('layerName')}
        {adriaM !== undefined &&
          ` · ${t('waterLevelAdria', { value: adriaM.toFixed(2) })}`}
      </Typography>

      {WASSERSTAND_BANDS.map((band) => (
        <Box
          key={band.tiefeM}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
        >
          <Box
            sx={{
              width: 14,
              height: 10,
              borderRadius: 0.25,
              bgcolor: band.farbe,
              flexShrink: 0,
            }}
          />
          <Typography variant="caption" color="text.secondary">
            {t(BAND_LABEL_KEYS[band.tiefeM] as 'band0')}
          </Typography>
        </Box>
      ))}

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block' }}
      >
        {t('resultArea', { value: hektar.toFixed(1) })} ·{' '}
        {t('resultGrid', { value: stufe })}
      </Typography>
      {stufe === 10 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block' }}
        >
          {t('gridCoarseHint')}
        </Typography>
      )}

      {wasserstandStale(item) && (
        <Typography variant="caption" color="error" sx={{ display: 'block' }}>
          {t('staleShort')}
        </Typography>
      )}
      {item.wasserAbbruch === 'budget' && (
        <Typography variant="caption" color="error" sx={{ display: 'block' }}>
          {t('warnBudget')}
        </Typography>
      )}
      {(item.wasserKachelnFehlend ?? 0) > 0 && (
        <Typography variant="caption" color="error" sx={{ display: 'block' }}>
          {t('warnMissingTiles', { count: item.wasserKachelnFehlend ?? 0 })}
        </Typography>
      )}
      {(item.wasserRandModell ?? 0) > 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block' }}
        >
          {t('warnEdge')}
        </Typography>
      )}
      {(item.wasserInselnVerworfen ?? 0) > 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block' }}
        >
          {t('warnIslands', { count: item.wasserInselnVerworfen ?? 0 })}
        </Typography>
      )}
      {(item.wasserVereinfachungM ?? 0) > 1 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block' }}
        >
          {t('warnTolerance', { value: item.wasserVereinfachungM ?? 0 })}
        </Typography>
      )}
      {(item.wasserLaengsteAchse ?? 0) > GRADIENT_WARN_AXIS_M && (
        <Typography variant="caption" color="error" sx={{ display: 'block' }}>
          {t('warnGradient', {
            value: ((item.wasserLaengsteAchse ?? 0) / 1000).toFixed(1),
          })}
        </Typography>
      )}

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block' }}
      >
        {t('disclaimer')}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block' }}
      >
        {t('attribution')}
      </Typography>
    </Box>
  );
}
