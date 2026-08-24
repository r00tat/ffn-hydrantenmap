'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { terrainClient } from '../../common/terrain/terrainClient';

/**
 * Das Höhenmodell für den Einsatz ohne Netz vorladen.
 *
 * Nur die **Übersichtsstufe**: sie deckt das ganze Burgenland ab und ist klein
 * genug, um sie auf ein Tablet zu legen. Die Detailstufe wäre über ein
 * Gigabyte und wird bei Bedarf blockweise geholt.
 *
 * Bewusst eine Schaltfläche und **nicht** im Precache des Service Workers:
 * zwanzig Megabyte bei jeder Installation wären niemandem zumutbar, der die
 * Höhenlinien nie einschaltet.
 */

/**
 * Geschätzte Größe eines Übersichtsblocks.
 *
 * 1000 × 1000 Zellen in 10 m Raster; die Entropiemessung der Kodierung ergab
 * für diese Stufe etwa 1,6 bit je Zelle. Eine Schätzung, keine Messung an
 * fertigen Kacheln — deshalb steht im Text „rund".
 */
const ESTIMATED_BLOCK_MB = 0.2;

/** Blöcke je Anfrage. Klein genug für sichtbaren Fortschritt. */
const CHUNK = 25;

type Phase = 'idle' | 'listing' | 'loading' | 'done' | 'failed';

export default function HoehenmodellOffline() {
  const t = useTranslations('hoehenlinien');
  const [phase, setPhase] = useState<Phase>('idle');
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState(0);

  const start = useCallback(async () => {
    setPhase('listing');
    setLoaded(0);
    setFailed(0);
    try {
      const client = terrainClient();
      const blockIds = await client.blocks('overview');
      setTotal(blockIds.length);
      if (blockIds.length === 0) {
        setPhase('done');
        return;
      }

      setPhase('loading');
      // In Stücken, damit der Fortschritt sichtbar wird und nicht eine einzige
      // Anfrage minutenlang stillsteht.
      for (let at = 0; at < blockIds.length; at += CHUNK) {
        const result = await client.prefetch(
          'overview',
          blockIds.slice(at, at + CHUNK)
        );
        setLoaded((value) => value + result.loaded);
        setFailed((value) => value + result.failed);
      }
      setPhase('done');
    } catch (err) {
      console.error('Höhenmodell konnte nicht vorgeladen werden', err);
      setPhase('failed');
    }
  }, []);

  const busy = phase === 'listing' || phase === 'loading';

  return (
    <Box>
      <Typography variant="subtitle2">{t('offlineTitle')}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t('offlineDescription', {
          size: Math.max(1, Math.round(
            (total || 110) * ESTIMATED_BLOCK_MB
          )),
        })}
      </Typography>

      <Button
        variant="outlined"
        size="small"
        sx={{ mt: 1 }}
        disabled={busy}
        onClick={() => void start()}
      >
        {t('offlineStart')}
      </Button>

      {busy && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {t('offlineProgress', { loaded: loaded + failed, total })}
          </Typography>
          <LinearProgress
            variant={total > 0 ? 'determinate' : 'indeterminate'}
            value={total > 0 ? ((loaded + failed) / total) * 100 : undefined}
          />
        </Box>
      )}

      {phase === 'done' && total === 0 && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          {t('offlineUnavailable')}
        </Typography>
      )}
      {phase === 'done' && total > 0 && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          {t('offlineDone', { loaded, failed })}
        </Typography>
      )}
      {phase === 'failed' && (
        <Typography
          variant="caption"
          color="error"
          sx={{ display: 'block', mt: 1 }}
        >
          {t('offlineFailed')}
        </Typography>
      )}
    </Box>
  );
}
