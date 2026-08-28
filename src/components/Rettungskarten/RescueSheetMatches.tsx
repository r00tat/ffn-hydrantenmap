'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { RescueSheetView } from '../../common/rescue/types';
import RescueSheetCard from './RescueSheetCard';

export interface RescueSheetMatchesProps {
  /** Treffer eines Fahrzeugs, absteigend nach Passgenauigkeit. */
  sheets: RescueSheetView[];
}

/**
 * Die Rettungskarten zu einem Fahrzeug der Kennzeichenabfrage: der beste
 * Treffer offen, die weiteren Varianten eingeklappt. Ohne Treffer bleibt ein
 * Hinweis mit dem Weg zur manuellen Suche.
 */
export default function RescueSheetMatches({ sheets }: RescueSheetMatchesProps) {
  const t = useTranslations('rettungskarten');

  if (sheets.length === 0) {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        {t.rich('noMatch', {
          link: (chunks) => <Link href="/rettungskarten">{chunks}</Link>,
        })}
      </Alert>
    );
  }

  const [best, ...others] = sheets;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        {t('matchHeading')}
      </Typography>
      <RescueSheetCard sheet={best} highlighted />
      {others.length > 0 && (
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2">
              {t('otherVariants', { count: others.length })}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {others.map((sheet) => (
              <RescueSheetCard key={sheet.id} sheet={sheet} />
            ))}
          </AccordionDetails>
        </Accordion>
      )}
    </Box>
  );
}
