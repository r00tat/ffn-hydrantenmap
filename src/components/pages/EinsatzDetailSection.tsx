'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { ReactNode } from 'react';

export interface EinsatzDetailSectionProps {
  /** Zugleich die Anker-id des Abschnitts, damit man ihn anspringen kann. */
  sectionId: string;
  title: string;
  /** Kurze Angabe neben dem Titel, meist eine Anzahl. */
  subtitle?: string;
  expanded: boolean;
  onToggle: (sectionId: string, expanded: boolean) => void;
  children: ReactNode;
}

/**
 * Ein aufklappbarer Abschnitt der Einsatz-Detailseite.
 *
 * Gesteuert von außen: Nur so kann die Seite einen Abschnitt selbst öffnen —
 * der Knopf „Zu Kostenersatz springen" klappt auf und scrollt hin.
 *
 * `unmountOnExit` ist der eigentliche Gewinn: Fast jeder Abschnitt hängt an
 * einer eigenen Firestore-Abfrage (Einsatzorte, Tagebuch, Besatzung,
 * Fahrtenbuch, Kostenersatz, Drive-Fotos). Zugeklappt fragt keiner davon ab,
 * und die Seite lädt nur noch, was man wirklich aufmacht.
 */
export default function EinsatzDetailSection({
  sectionId,
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}: EinsatzDetailSectionProps) {
  return (
    <Accordion
      id={sectionId}
      expanded={expanded}
      onChange={(_event, isExpanded) => onToggle(sectionId, isExpanded)}
      slotProps={{ transition: { unmountOnExit: true } }}
      // Die Abschnitte sollen als Liste lesbar bleiben, nicht als Stapel
      // zusammengeschobener Karten.
      sx={{ '&:before': { display: 'none' }, mb: 1 }}
      variant="outlined"
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          {title}
        </Typography>
        {subtitle && (
          <Chip
            size="small"
            label={subtitle}
            sx={{ mr: 1, alignSelf: 'center' }}
          />
        )}
      </AccordionSummary>
      <AccordionDetails>{children}</AccordionDetails>
    </Accordion>
  );
}
