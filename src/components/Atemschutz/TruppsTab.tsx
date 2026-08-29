'use client';

import { useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Fab from '@mui/material/Fab';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import {
  type AtemschutzTrupp,
  type TruppGruppen,
  type TruppInput,
  type TruppPatch,
} from '../../common/atemschutz';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import TruppCard from './TruppCard';
import TruppDialog from './TruppDialog';
import TruppZeitDialog, { type TruppZeitModus } from './TruppZeitDialog';

export interface TruppsTabProps {
  trupps: TruppGruppen;
  feuerwehren: string[];
  personSuggestions: string[];
  /** Fahrzeuge des Einsatzes und Gruppenkommandanten — für „Entsendet an". */
  entsendetAnVorschlaege: string[];
  canWrite: boolean;
  onSave: (input: TruppInput, trupp?: AtemschutzTrupp) => Promise<void>;
  onPatch: (trupp: AtemschutzTrupp, patch: TruppPatch) => Promise<void>;
  onWiederBereit: (trupp: AtemschutzTrupp) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

type Abschnitt = 'bereit' | 'imEinsatz' | 'zurueck';
const ABSCHNITTE: Abschnitt[] = ['bereit', 'imEinsatz', 'zurueck'];

export default function TruppsTab({
  trupps,
  feuerwehren,
  personSuggestions,
  entsendetAnVorschlaege,
  canWrite,
  onSave,
  onPatch,
  onWiederBereit,
  onDelete,
}: TruppsTabProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [edit, setEdit] = useState<AtemschutzTrupp | undefined>();
  const [zeitDialog, setZeitDialog] = useState<{
    trupp: AtemschutzTrupp;
    modus: TruppZeitModus;
  }>();
  const [loeschKandidat, setLoeschKandidat] = useState<AtemschutzTrupp>();
  const [abmeldeKandidat, setAbmeldeKandidat] = useState<AtemschutzTrupp>();

  const neu = () => {
    setEdit(undefined);
    setDialogOpen(true);
  };

  // Nur an der jüngsten Bereitstellung eines Trupps darf der Zustand noch
  // geändert werden — im Protokoll stehen auch ältere Zeilen desselben Trupps.
  const aktuellIds = new Set(trupps.aktuell.map((t) => t.id));

  const karte = (trupp: AtemschutzTrupp) => (
    <TruppCard
      key={trupp.id}
      trupp={trupp}
      canWrite={canWrite}
      istAktuell={aktuellIds.has(trupp.id)}
      onEntsenden={() => setZeitDialog({ trupp, modus: 'entsenden' })}
      onRueckkehr={() => setZeitDialog({ trupp, modus: 'rueckkehr' })}
      onWiederBereit={() => void onWiederBereit(trupp)}
      onAbmelden={() => setAbmeldeKandidat(trupp)}
      onEdit={() => {
        setEdit(trupp);
        setDialogOpen(true);
      }}
      onDelete={() => setLoeschKandidat(trupp)}
    />
  );

  return (
    <Box sx={{ pb: 10 }}>
      {/* Zusätzlich zum Fab unten rechts: Am Rechner zielt niemand in die
          Ecke des Fensters, auf dem Handy bleibt der Fab der schnellere
          Griff. */}
      {canWrite && (
        <Stack direction="row" sx={{ mb: 2, justifyContent: 'flex-end' }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={neu}>
            {t('trupp.add')}
          </Button>
        </Stack>
      )}

      {ABSCHNITTE.map((abschnitt) => (
        <Box key={abschnitt} sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            {t(`trupp.sections.${abschnitt}`)}
            {trupps[abschnitt].length > 0 && ` (${trupps[abschnitt].length})`}
          </Typography>
          {trupps[abschnitt].length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t(`trupp.empty.${abschnitt}`)}
            </Typography>
          ) : (
            <Stack spacing={1}>{trupps[abschnitt].map(karte)}</Stack>
          )}
        </Box>
      ))}

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" gutterBottom>
        {t('trupp.sections.protokoll')}
      </Typography>
      {trupps.protokoll.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('trupp.empty.protokoll')}
        </Typography>
      ) : (
        // Das Protokoll zeigt *alle* Zeilen, auch die oben schon sichtbaren:
        // Es ist der Nachweis über den ganzen Einsatz, nicht der Rest.
        <Stack spacing={1}>{trupps.protokoll.map(karte)}</Stack>
      )}

      {canWrite && (
        <Fab
          color="primary"
          sx={{ position: 'fixed', bottom: 24, right: 24 }}
          aria-label={t('trupp.add')}
          onClick={neu}
        >
          <AddIcon />
        </Fab>
      )}

      {dialogOpen && (
        <TruppDialog
          key={edit?.id ?? 'new'}
          open
          trupp={edit}
          feuerwehren={feuerwehren}
          personSuggestions={personSuggestions}
          onClose={() => setDialogOpen(false)}
          onSave={(input) => onSave(input, edit)}
        />
      )}

      {zeitDialog && (
        <TruppZeitDialog
          key={`${zeitDialog.trupp.id}-${zeitDialog.modus}`}
          open
          modus={zeitDialog.modus}
          entsendetAnVorschlag={zeitDialog.trupp.entsendetAn}
          entsendetAnVorschlaege={entsendetAnVorschlaege}
          onClose={() => setZeitDialog(undefined)}
          onConfirm={(patch) => onPatch(zeitDialog.trupp, patch)}
        />
      )}

      {/* `ConfirmDialog` hält sein `open` in eigenem State, der nur beim ersten
          Rendern gesetzt wird — deshalb bedingt gemountet statt dauerhaft mit
          `open={...}`. */}
      {loeschKandidat && (
        <ConfirmDialog
          title={tCommon('confirmTitle')}
          text={t('trupp.deleteConfirm')}
          yes={tCommon('yes')}
          no={tCommon('no')}
          onConfirm={async (confirmed) => {
            if (confirmed && loeschKandidat.id) {
              await onDelete(loeschKandidat.id);
            }
            setLoeschKandidat(undefined);
          }}
        />
      )}

      {abmeldeKandidat && (
        <ConfirmDialog
          title={tCommon('confirmTitle')}
          text={t('trupp.abmeldenConfirm')}
          yes={tCommon('yes')}
          no={tCommon('no')}
          onConfirm={async (confirmed) => {
            if (confirmed) {
              await onPatch(abmeldeKandidat, { status: 'abgemeldet' });
            }
            setAbmeldeKandidat(undefined);
          }}
        />
      )}
    </Box>
  );
}
