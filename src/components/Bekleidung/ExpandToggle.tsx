'use client';

import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import IconButton from '@mui/material/IconButton';
import { useTranslations } from 'next-intl';

/** Auf-/Zuklappen einer Artikelzeile in Lagerstand und Stückliste. */
export default function ExpandToggle({
  name,
  expanded,
  onToggle,
}: {
  name: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('bekleidung');
  return (
    <IconButton
      size="small"
      aria-label={t('actions.details', { name })}
      aria-expanded={expanded}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      sx={{ mr: 0.5 }}
    >
      {expanded ? (
        <KeyboardArrowDownIcon fontSize="small" />
      ) : (
        <KeyboardArrowRightIcon fontSize="small" />
      )}
    </IconButton>
  );
}

/** Menge der aufgeklappten Schlüssel, mit Umschalten. */
export function toggleKey(prev: Set<string>, key: string): Set<string> {
  const next = new Set(prev);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
