'use client';

import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export interface AtemschutzZeileProps {
  /** Die Überschrift: Kennung des Stücks oder der Flasche. */
  titel: string;
  /** Chips neben der Überschrift — Zustand, Druck, offene Mängel. */
  chips?: ReactNode;
  /**
   * Die zweite Zeile. **Der Ortsname gehört an den Anfang**: Am Sammelplatz
   * stehen Stücke mehrerer Wehren durcheinander, und die Wehr ist das, wonach
   * beim Durchsehen gesucht wird.
   */
  info?: (string | false | undefined)[];
  /** Die dritte Zeile — Namen, Zeiten, Bemerkungen. */
  details?: (string | false | undefined)[];
}

function zusammen(teile?: (string | false | undefined)[]): string {
  return (teile ?? []).filter(Boolean).join(' · ');
}

/**
 * Eine Zeile in den Listen des Sammelplatzes — im Füllprotokoll und in der
 * Ausrüstung dieselbe.
 *
 * Als gemeinsames Bauteil, weil beide Listen dasselbe zeigen sollen und zuvor
 * auseinanderliefen: Die eine begann die zweite Zeile mit der Bezeichnung, die
 * andere mit der Wehr.
 *
 * Die Kennung steht eine Stufe über dem Fließtext und fett — genug, um sie
 * beim Überfliegen zu finden, ohne dass eine Liste mit dreißig Flaschen zur
 * Bildschirmseite je Eintrag wird.
 */
export default function AtemschutzZeile({
  titel,
  chips,
  info,
  details,
}: AtemschutzZeileProps) {
  const infoText = zusammen(info);
  const detailText = zusammen(details);

  return (
    <ListItemText
      disableTypography
      primary={
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.4 }}>
            {titel}
          </Typography>
          {chips}
        </Stack>
      }
      secondary={
        <Box>
          {infoText && <Typography variant="body2">{infoText}</Typography>}
          {detailText && (
            <Typography variant="body2" color="text.secondary">
              {detailText}
            </Typography>
          )}
        </Box>
      }
    />
  );
}
