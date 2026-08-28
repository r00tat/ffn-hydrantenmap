'use client';

import DescriptionIcon from '@mui/icons-material/Description';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import {
  formatRescueBuildYears,
  formatRescueSheetTitle,
  rescuePictureSrc,
} from '../../common/rescue/sheetView';
import { RescueSheetView } from '../../common/rescue/types';

export interface RescueSheetCardProps {
  sheet: RescueSheetView;
  /** Hebt den automatisch zugeordneten Treffer einer Abfrage hervor. */
  highlighted?: boolean;
}

/**
 * Ein Fahrzeug aus dem Euro-Rescue-Katalog mit den Links auf Rettungskarte
 * und Rescue Guide. Die PDFs liegen bei Euro NCAP und werden in einem neuen
 * Tab geöffnet — gespiegelt wird nichts.
 */
export default function RescueSheetCard({
  sheet,
  highlighted,
}: RescueSheetCardProps) {
  const t = useTranslations('rettungskarten');
  const years = formatRescueBuildYears(sheet);
  const pictureSrc = rescuePictureSrc(sheet);

  const details = [
    sheet.bodyType,
    sheet.doors ? t('doorsValue', { doors: sheet.doors }) : undefined,
    sheet.powertrain,
  ].filter(Boolean) as string[];

  return (
    <Card
      variant="outlined"
      sx={{
        mb: 2,
        borderColor: highlighted ? 'success.main' : undefined,
        borderWidth: highlighted ? 2 : undefined,
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          {pictureSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pictureSrc}
              alt={formatRescueSheetTitle(sheet)}
              width={120}
              style={{ maxWidth: '30%', height: 'auto', objectFit: 'contain' }}
            />
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" component="h3">
              {formatRescueSheetTitle(sheet)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {[years, ...details].filter(Boolean).join(' · ')}
            </Typography>

            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
              {sheet.sheetUrl ? (
                <Button
                  variant="contained"
                  color="error"
                  size="small"
                  startIcon={<DescriptionIcon />}
                  endIcon={<OpenInNewIcon />}
                  href={sheet.sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('openSheet', { language: sheet.sheetLanguage ?? '' })}
                </Button>
              ) : (
                <Chip size="small" label={t('noSheet')} />
              )}
              {sheet.guideUrl && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<MenuBookIcon />}
                  endIcon={<OpenInNewIcon />}
                  href={sheet.guideUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('openGuide')}
                </Button>
              )}
            </Stack>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
