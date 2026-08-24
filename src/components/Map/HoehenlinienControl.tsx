'use client';

import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { useTranslations } from 'next-intl';
import {
  EQUIDISTANCE_CHOICES,
  type EquidistanceChoice,
} from './layers/hoehenlinien';

/**
 * Die Wahl der Äquidistanz.
 *
 * `auto` folgt der Zoomstufe und ist die Vorbelegung; die feste Wahl gibt es,
 * weil das Gelände über das Ausdrucken einer Karte hinaus entscheidet: für die
 * Wasserausbreitung im Flachland zählen halbe Meter, für einen Überblick über
 * das Hügelland nicht.
 */
export interface HoehenlinienControlProps {
  choice: EquidistanceChoice;
  /** Die tatsächlich verwendete Äquidistanz — bei `auto` aus der Zoomstufe. */
  effectiveM: number;
  onChange: (choice: EquidistanceChoice) => void;
}

export default function HoehenlinienControl({
  choice,
  effectiveM,
  onChange,
}: HoehenlinienControlProps) {
  const t = useTranslations('hoehenlinien');

  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {t('equidistance')}
        {choice === 'auto' && ` · ${t('meters', { value: effectiveM })}`}
      </Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={choice}
        aria-label={t('equidistance')}
        onChange={(_event, value) =>
          value !== null && onChange(value as EquidistanceChoice)
        }
        sx={{ display: 'flex', mt: 0.5 }}
      >
        {EQUIDISTANCE_CHOICES.map((value) => (
          <ToggleButton key={value} value={value} sx={{ px: 1, py: 0.25 }}>
            {value === 'auto'
              ? t('automatic')
              : t('meters', { value: Number(value) })}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
}
