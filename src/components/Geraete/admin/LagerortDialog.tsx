'use client';

import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  lagerortKey,
  parseMenge,
  type Geraet,
  type GeraetBestand,
  type GeraetLagerort,
} from '../../../common/geraet';
import { createGeraetBestand } from '../geraeteActions';
import { callAction } from './actionResult';

export interface LagerortDialogProps {
  open: boolean;
  groupId: string;
  geraet: Geraet;
  /** Die Lagerorte dieses Artikels — ein vorhandener darf nicht doppelt entstehen. */
  existing: GeraetBestand[];
  /** Alle Bestände der Gruppe, als Vorschläge für Fahrzeug und Standort. */
  allBestaende: GeraetBestand[];
  /** Die Container der Gruppe (Artikel der Kategorie „Container"). */
  containers: Geraet[];
  onClose: () => void;
}

type Art = 'fahrzeug' | 'raum' | 'container';

function distinct(values: (string | undefined)[]): string[] {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))].sort(
    (a, b) => a.localeCompare(b, 'de'),
  );
}

/**
 * Einen weiteren Lagerort für einen Artikel anlegen, optional mit
 * Anfangsbestand (als Zugang gebucht). Fahrzeug und Standort schlagen die
 * Namen vor, die es in der Gruppe schon gibt — sonst entstehen aus „SRF" und
 * „S R F" zwei Lagerorte. Ein Container wird aus den Container-Artikeln
 * gewählt und nicht getippt: Er ist in Sybos ein Artikel, kein Fahrzeug.
 */
export default function LagerortDialog({
  open,
  groupId,
  geraet,
  existing,
  allBestaende,
  containers,
  onClose,
}: LagerortDialogProps) {
  const t = useTranslations('geraete');
  const tCommon = useTranslations('common');

  const [art, setArt] = useState<Art>('raum');
  const [fahrzeug, setFahrzeug] = useState('');
  const [laderaum, setLaderaum] = useState('');
  const [standort, setStandort] = useState('');
  const [raum, setRaum] = useState('');
  const [container, setContainer] = useState<Geraet | null>(null);
  const [bemerkung, setBemerkung] = useState('');
  const [anzahl, setAnzahl] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const fahrzeugOptions = useMemo(
    () => distinct(allBestaende.map((b) => b.lagerort.fahrzeug)),
    [allBestaende],
  );
  const containerOptions = useMemo(
    () => containers.filter((c) => c.active !== false && c.id !== geraet.id),
    [containers, geraet.id],
  );
  const standortOptions = useMemo(
    () => distinct(allBestaende.map((b) => b.lagerort.standort)),
    [allBestaende],
  );

  const handleSave = async () => {
    setError(undefined);
    const lagerort: GeraetLagerort =
      art === 'fahrzeug'
        ? { art, fahrzeug: fahrzeug.trim(), laderaum: laderaum.trim() || undefined }
        : art === 'container'
          ? { art, containerId: container?.id, container: container?.bezeichnung }
          : { art, standort: standort.trim(), raum: raum.trim() || undefined };
    if (bemerkung.trim()) lagerort.bemerkung = bemerkung.trim();

    if (
      (art === 'fahrzeug' && !lagerort.fahrzeug) ||
      (art === 'raum' && !lagerort.standort) ||
      (art === 'container' && !lagerort.containerId)
    ) {
      setError(t('errors.lagerortRequired'));
      return;
    }
    const key = lagerortKey(lagerort);
    if (existing.some((b) => b.lagerortKey === key)) {
      setError(t('errors.lagerortExists'));
      return;
    }
    const count = anzahl.trim() ? parseMenge(anzahl) : 0;
    if (count === undefined) {
      setError(t('errors.countInvalid'));
      return;
    }

    setBusy(true);
    const outcome = await callAction(() =>
      createGeraetBestand(groupId, geraet.id, lagerort, count),
    );
    setBusy(false);
    if (!outcome.ok) {
      setError(t('errors.saveFailed', { error: outcome.error }));
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('lagerort.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            select
            label={t('lagerort.art')}
            value={art}
            onChange={(e) => setArt(e.target.value as Art)}
            fullWidth
          >
            <MenuItem value="raum">{t('lagerort.artRaum')}</MenuItem>
            <MenuItem value="fahrzeug">{t('lagerort.artFahrzeug')}</MenuItem>
            <MenuItem value="container">{t('lagerort.artContainer')}</MenuItem>
          </TextField>

          {art === 'container' ? (
            containerOptions.length === 0 ? (
              <Alert severity="info">{t('lagerort.noContainer')}</Alert>
            ) : (
              <Autocomplete<Geraet>
                options={containerOptions}
                value={container}
                onChange={(_, value) => setContainer(value)}
                getOptionLabel={(c) => c.bezeichnung}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderInput={(params) => (
                  <TextField {...params} label={t('lagerort.container')} required />
                )}
              />
            )
          ) : art === 'fahrzeug' ? (
            <>
              <Autocomplete
                freeSolo
                options={fahrzeugOptions}
                inputValue={fahrzeug}
                onInputChange={(_, value) => setFahrzeug(value)}
                renderInput={(params) => (
                  <TextField {...params} label={t('lagerort.fahrzeug')} required />
                )}
              />
              <TextField
                label={t('lagerort.laderaum')}
                value={laderaum}
                onChange={(e) => setLaderaum(e.target.value)}
                fullWidth
              />
            </>
          ) : (
            <>
              <Autocomplete
                freeSolo
                options={standortOptions}
                inputValue={standort}
                onInputChange={(_, value) => setStandort(value)}
                renderInput={(params) => (
                  <TextField {...params} label={t('lagerort.standort')} required />
                )}
              />
              <TextField
                label={t('lagerort.raum')}
                value={raum}
                onChange={(e) => setRaum(e.target.value)}
                fullWidth
              />
            </>
          )}

          <TextField
            label={t('lagerort.bemerkung')}
            value={bemerkung}
            onChange={(e) => setBemerkung(e.target.value)}
            fullWidth
          />
          <TextField
            label={t('lagerort.anzahl')}
            value={anzahl}
            onChange={(e) => setAnzahl(e.target.value)}
            type="number"
            slotProps={{ htmlInput: { min: 0, step: 'any', inputMode: 'decimal' } }}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {tCommon('cancel')}
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={busy}>
          {tCommon('create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
