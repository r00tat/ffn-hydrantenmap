'use client';

import MapIcon from '@mui/icons-material/Map';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { LatLngPosition } from '../../common/geo';
import type { GeoJsonFeatureColleaction } from '../../server/geojson';
import { buildLagekarteFile } from '../../common/lagekarte/toLagekarte';
import { useSnackbar } from '../providers/SnackbarProvider';
import { downloadText } from './download';
import { loadLagekarteGis } from './lagekarteGisAction';
import { loadLagekarteSource } from './lagekarteSource';

export interface LagekarteExportProps {
  firecallId: string;
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-z0-9äöüß _-]/gi, '_').trim() || 'einsatz';
}

export default function LagekarteExport({ firecallId }: LagekarteExportProps) {
  const t = useTranslations('lagekarte');
  const showSnackbar = useSnackbar();
  const [busy, setBusy] = useState(false);

  const handleExport = useCallback(async () => {
    setBusy(true);
    try {
      const source = await loadLagekarteSource(firecallId);

      const positions = source.items
        .filter((i) => typeof i.lat === 'number' && typeof i.lng === 'number')
        .map((i) => [i.lat as number, i.lng as number] as LatLngPosition);

      // Ohne GIS-Daten ist der Export weniger wert, aber immer noch brauchbar —
      // ein Ausfall darf ihn deshalb nicht verhindern.
      let gis: GeoJsonFeatureColleaction | undefined;
      try {
        gis = await loadLagekarteGis({ firecallId, positions });
      } catch (err) {
        console.error('lagekarte gis failed', err);
        showSnackbar(t('gisFailed'), 'warning');
      }

      const file = buildLagekarteFile({ ...source, gis });
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadText(
        JSON.stringify(file),
        `lagekarte-${sanitizeFilename(source.firecall.name)}-${stamp}.json`,
        'application/json',
      );
    } catch (err) {
      console.error('lagekarte export failed', err);
      showSnackbar(t('exportFailed'), 'error');
    }
    setBusy(false);
  }, [firecallId, showSnackbar, t]);

  return (
    <Tooltip title={t('exportTooltip')}>
      <span>
        <IconButton
          size="small"
          onClick={handleExport}
          disabled={busy}
          aria-label={t('exportTooltip')}
        >
          {busy ? <CircularProgress size={18} /> : <MapIcon />}
        </IconButton>
      </span>
    </Tooltip>
  );
}
