'use client';

import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  formatCharge,
  lagerortKey,
  parseMenge,
  type Geraet,
  type GeraetBestand,
  type GeraetLagerort,
} from '../../../common/geraet';
import { activeChargen, restOhneCharge, sortFefo } from '../../../common/geraetCharge';
import {
  createGeraetBestand,
  korrigiereGeraetChargenBestand,
  updateGeraetBestand,
  type GeraetChargenKorrektur,
} from '../geraeteActions';
import { callAction } from './actionResult';

export interface LagerortDialogProps {
  open: boolean;
  groupId: string;
  geraet: Geraet;
  /**
   * Gesetzt: diesen Lagerort bearbeiten. Bei Verbrauchsmaterial mit Chargen
   * lässt sich dabei die gezählte Menge je Charge eintragen (Inventur).
   */
  bestand?: GeraetBestand;
  /** Die Lagerorte dieses Artikels — ein vorhandener darf nicht doppelt entstehen. */
  existing: GeraetBestand[];
  /** Alle Bestände der Gruppe, als Vorschläge für Fahrzeug und Standort. */
  allBestaende: GeraetBestand[];
  /** Die Container der Gruppe (Artikel der Kategorie „Container"). */
  containers: Geraet[];
  onClose: () => void;
}

type Art = 'fahrzeug' | 'raum' | 'container';

/** Ein Topf des Lagerorts: eine Charge oder (`chargeId: null`) der Rest ohne Charge. */
interface PotRow {
  key: string;
  chargeId: string | null;
  label: string;
  current: number;
}

function distinct(values: (string | undefined)[]): string[] {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))].sort(
    (a, b) => a.localeCompare(b, 'de'),
  );
}

/**
 * Einen weiteren Lagerort für einen Artikel anlegen, optional mit
 * Anfangsbestand (als Inventur gebucht), oder einen vorhandenen ändern. Fahrzeug und Standort schlagen die
 * Namen vor, die es in der Gruppe schon gibt — sonst entstehen aus „SRF" und
 * „S R F" zwei Lagerorte. Ein Container wird aus den Container-Artikeln
 * gewählt und nicht getippt: Er ist in Sybos ein Artikel, kein Fahrzeug.
 *
 * Beim Bearbeiten eines Verbrauchsartikels mit aktiven Chargen steht je Charge
 * und für den Rest ohne Charge die gespeicherte Menge da. Eine geänderte Zahl
 * ist der gezählte Ist-Bestand; die Differenz bucht
 * `korrigiereGeraetChargenBestand` als Inventur, nach dem Speichern des
 * Lagerorts. „Ohne Lagerort" lässt sich so korrigieren, ohne ihm einen Platz
 * zu geben: Bleiben die Felder des Platzes leer, bleibt er, wie er ist.
 */
export default function LagerortDialog({
  open,
  groupId,
  geraet,
  bestand,
  existing,
  allBestaende,
  containers,
  onClose,
}: LagerortDialogProps) {
  const t = useTranslations('geraete');
  const tCommon = useTranslations('common');

  const initial = bestand?.lagerort;
  // „ohne Lagerort" bearbeiten heißt, ihm einen echten Platz zu geben — der
  // Dialog beginnt dann wie bei einem neuen Lagerort mit „Raum".
  const [art, setArt] = useState<Art>(
    initial && initial.art !== 'set' && initial.art !== 'unbestimmt' ? initial.art : 'raum',
  );
  const [fahrzeug, setFahrzeug] = useState(initial?.fahrzeug ?? '');
  const [laderaum, setLaderaum] = useState(initial?.laderaum ?? '');
  const [standort, setStandort] = useState(initial?.standort ?? '');
  const [raum, setRaum] = useState(initial?.raum ?? '');
  const [container, setContainer] = useState<Geraet | null>(
    () => containers.find((c) => c.id === initial?.containerId) ?? null,
  );
  const [bemerkung, setBemerkung] = useState(initial?.bemerkung ?? '');
  const [anzahl, setAnzahl] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const potRows = useMemo<PotRow[]>(() => {
    if (!bestand || geraet.verbrauchsmaterial !== true) return [];
    const chargen = sortFefo(activeChargen(geraet));
    if (chargen.length === 0) return [];
    return [
      ...chargen.map((c) => ({
        key: c.id,
        chargeId: c.id,
        label: formatCharge(c),
        current: bestand.chargen?.[c.id] ?? 0,
      })),
      {
        key: '',
        chargeId: null,
        label: t('chargen.korrektur.ohneCharge'),
        current: restOhneCharge(bestand),
      },
    ];
  }, [bestand, geraet, t]);
  const [potMengen, setPotMengen] = useState<Record<string, string>>(() =>
    Object.fromEntries(potRows.map((row) => [row.key, String(row.current)])),
  );

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

    const korrekturen: GeraetChargenKorrektur[] = [];
    for (const row of potRows) {
      const text = (potMengen[row.key] ?? '').trim();
      // Unverändert bleibt unverändert — auch ein negativer Rest.
      if (!text || text === String(row.current)) continue;
      const menge = parseMenge(text);
      if (menge === undefined) {
        setError(t('errors.countInvalid'));
        return;
      }
      if (bestand && menge !== row.current) {
        korrekturen.push({ bestandId: bestand.id, chargeId: row.chargeId, menge });
      }
    }

    // „Ohne Lagerort" ohne Angaben zum Platz: nur die Chargen korrigieren.
    const keepUnbestimmt =
      bestand?.lagerort.art === 'unbestimmt' &&
      potRows.length > 0 &&
      ![fahrzeug, laderaum, standort, raum, bemerkung].some((v) => v.trim()) &&
      !container;

    if (
      !keepUnbestimmt &&
      ((art === 'fahrzeug' && !lagerort.fahrzeug) ||
      (art === 'raum' && !lagerort.standort) ||
      (art === 'container' && !lagerort.containerId))
    ) {
      setError(t('errors.lagerortRequired'));
      return;
    }
    const key = lagerortKey(lagerort);
    if (
      !keepUnbestimmt &&
      existing.some((b) => b.lagerortKey === key && b.id !== bestand?.id)
    ) {
      setError(t('errors.lagerortExists'));
      return;
    }
    const count = bestand ? 0 : anzahl.trim() ? parseMenge(anzahl) : 0;
    if (count === undefined) {
      setError(t('errors.countInvalid'));
      return;
    }

    setBusy(true);
    const outcome = keepUnbestimmt
      ? { ok: true as const, value: undefined }
      : await callAction(() =>
          bestand
            ? updateGeraetBestand(groupId, bestand.id, lagerort)
            : createGeraetBestand(groupId, geraet.id, lagerort, count),
        );
    const corrected =
      outcome.ok && korrekturen.length > 0
        ? await callAction(() =>
            korrigiereGeraetChargenBestand(
              groupId,
              geraet.id,
              korrekturen,
              'Korrektur Lagerort',
            ),
          )
        : outcome;
    setBusy(false);
    if (!corrected.ok) {
      setError(t('errors.saveFailed', { error: corrected.error }));
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t(bestand ? 'lagerort.editTitle' : 'lagerort.title')}</DialogTitle>
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
          {!bestand && (
            <TextField
              label={t('lagerort.anzahl')}
              value={anzahl}
              onChange={(e) => setAnzahl(e.target.value)}
              type="number"
              slotProps={{ htmlInput: { min: 0, step: 'any', inputMode: 'decimal' } }}
              fullWidth
            />
          )}
          {potRows.length > 0 && (
            <>
              <Typography variant="subtitle2">{t('chargen.korrektur.titleLagerort')}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t('chargen.korrektur.hint')}
              </Typography>
              {potRows.map((row) => (
                <TextField
                  key={row.key}
                  label={row.label}
                  value={potMengen[row.key] ?? ''}
                  onChange={(e) =>
                    setPotMengen((prev) => ({ ...prev, [row.key]: e.target.value }))
                  }
                  slotProps={{
                    htmlInput: { inputMode: 'decimal' },
                    input: geraet.einheit
                      ? {
                          endAdornment: (
                            <InputAdornment position="end">{geraet.einheit}</InputAdornment>
                          ),
                        }
                      : undefined,
                  }}
                  size="small"
                  fullWidth
                />
              ))}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {tCommon('cancel')}
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={busy}>
          {tCommon(bestand ? 'save' : 'create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
