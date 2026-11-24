'use client';

import Chip from '@mui/material/Chip';
import { useTranslations } from 'next-intl';
import type { ObjektArt } from '../../common/objektplan/objektArt';

/** Rot für Risikoobjekte, orange für gefährdete Objekte. */
const ART_COLOR = {
  risikoobjekt: 'error',
  gefahrobjekt: 'warning',
} as const satisfies Record<ObjektArt, 'error' | 'warning'>;

export default function ObjektArtChip({ art }: { art: ObjektArt }) {
  const t = useTranslations('risikoobjekte');
  return (
    <Chip
      size="small"
      color={ART_COLOR[art]}
      label={art === 'gefahrobjekt' ? t('art.gefahrobjekt') : t('art.risikoobjekt')}
      component="span"
    />
  );
}
