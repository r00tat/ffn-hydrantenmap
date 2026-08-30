'use client';

import { useCallback, useMemo, useState } from 'react';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { FuellungInput } from '../../common/atemschutz';
import { KOSTENERSATZ_GROUP } from '../../common/kostenersatz';
import useAtemschutzFuellungen from '../../hooks/useAtemschutzFuellungen';
import useAtemschutzGeraete from '../../hooks/useAtemschutzGeraete';
import useFahrtenbuchFirecalls from '../../hooks/useFahrtenbuchFirecalls';
import useFahrtenbuchGroup from '../../hooks/useFahrtenbuchGroup';
import useFahrtenbuchPersons from '../../hooks/useFahrtenbuchPersons';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useGroupFeuerwehrName from '../../hooks/useGroupFeuerwehrName';
import {
  addFuellung,
  deleteFuellung,
  updateFuellung,
  type AtemschutzActor,
} from './atemschutzStore';
import { buildFuellungDocument } from './fuellungErfassung';
import FuellprotokollTab from './FuellprotokollTab';

/** Werte des Einsatz-Filters, die keine Einsatz-ID sind. */
const FILTER_ALLE = 'alle';
const FILTER_OHNE = 'ohne';

const STORAGE_KEY = 'atemschutz.fuellstation';

export default function FuellprotokollPage() {
  const t = useTranslations('atemschutz');
  const router = useRouter();
  const searchParams = useSearchParams();
  // `groups` heißt hier bereits die Gruppenauswahl des Umschalters — die
  // Freigaben des Benutzers brauchen deshalb einen eigenen Namen.
  const { email, displayName, uid, groups: freigaben } = useFirebaseLogin();

  const { groups, groupId, setGroupId } = useFahrtenbuchGroup();
  const eigeneFeuerwehr = useGroupFeuerwehrName(groupId);
  const { flaschen, fuellstationen, feuerwehren } = useAtemschutzGeraete(groupId);
  const firecalls = useFahrtenbuchFirecalls(groupId);

  // Filter in der URL und nicht im State: Sonst landet die Zurück-Taste auf
  // der vorigen Seite statt auf dem vorigen Filter, und ein Neuladen fällt
  // auf „Alle" zurück. Dasselbe Muster wie `?tab=` am Sammelplatz.
  const einsatzFilter = searchParams.get('einsatz') ?? FILTER_ALLE;
  const nurVerrechnen = searchParams.get('verrechnen') === '1';

  const setParam = useCallback(
    (key: string, value?: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const firecallId =
    einsatzFilter === FILTER_ALLE
      ? undefined
      : einsatzFilter === FILTER_OHNE
        ? ''
        : einsatzFilter;

  const { fuellungen, flaschenGesamt } = useAtemschutzFuellungen(groupId, {
    firecallId,
  });

  // Der Verrechnen-Filter läuft clientseitig: Als zweite Gleichheitsbedingung
  // bräuchte er je Kombination einen weiteren zusammengesetzten Index, und die
  // Liste ist durch `limit` ohnehin beschränkt.
  const sichtbar = useMemo(
    () => (nurVerrechnen ? fuellungen.filter((f) => f.verrechnen) : fuellungen),
    [fuellungen, nurVerrechnen],
  );

  const [letzteStation, setLetzteStation] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
  });

  const merkeStation = useCallback((id: string) => {
    setLetzteStation(id);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  // Bewusst `useFahrtenbuchPersons` und **nicht**
  // `useAtemschutzPersonSuggestions`: Letzteres zieht `useCrewAssignments`
  // mit, das ohne Guard auf `call/{firecallId}/crew` abonniert und bei
  // fehlendem Einsatz auf die Platzhalter-ID `unknown` läuft — ein sicheres
  // permission-denied. Die Einsatzmannschaft hat an der Füllstation ohnehin
  // nichts zu suchen; die gepflegten Personen der Gruppe sind hier die
  // richtige Quelle.
  const { activePersons } = useFahrtenbuchPersons(groupId);
  const suggestions = useMemo(
    () =>
      [
        ...new Set(
          (activePersons ?? [])
            .map((p) => p.name?.trim())
            .filter((n): n is string => !!n),
        ),
      ].sort((a, b) => a.localeCompare(b, 'de')),
    [activePersons],
  );

  const actor: AtemschutzActor = useMemo(
    () => ({ userId: uid ?? '', now: new Date().toISOString() }),
    [uid],
  );

  // Neue Füllungen übernehmen den aktiven Filter. Steht er auf „Alle" oder
  // „Ohne Einsatz", entsteht eine Stationsfüllung — das ist der Regelfall
  // dieser Seite.
  const neuerEinsatz = firecallId ? firecallId : '';
  const neuerEinsatzName = firecalls.find((f) => f.id === neuerEinsatz)?.name;

  const handleSave = useCallback(
    async (input: FuellungInput, id?: string) => {
      if (!groupId) return;
      const now = new Date().toISOString();
      const data = buildFuellungDocument(input, {
        firecallId: neuerEinsatz,
        firecallName: neuerEinsatzName,
        now,
      });
      const stamp: AtemschutzActor = { userId: actor.userId, now };
      if (id) await updateFuellung(groupId, id, data, stamp);
      else await addFuellung(groupId, data, stamp);
    },
    [actor.userId, groupId, neuerEinsatz, neuerEinsatzName],
  );

  const handleDelete = useCallback(
    (id: string) => deleteFuellung(groupId ?? '', id),
    [groupId],
  );

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 1, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {t('fuellprotokoll.title')}
        </Typography>
        {/* Die Verrechnung steht hier und nicht im Menü: Sie ist die
            Fortsetzung derselben Arbeit — was gefüllt wurde, wird
            abgerechnet — und unter „Fahrzeuge" war sie nicht zu finden.
            Sichtbar nur mit der Kostenersatz-Freischaltung, derselben
            Bedingung wie auf der Zielseite. */}
        {freigaben?.includes(KOSTENERSATZ_GROUP) && (
          <Button
            component={Link}
            href="/atemschutz/verrechnung"
            startIcon={<ReceiptLongIcon />}
          >
            {t('rechnung.title')}
          </Button>
        )}
      </Stack>

      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }}
      >
        {groups.length > 1 && (
          <TextField
            select
            size="small"
            label={t('fuellprotokoll.group')}
            value={groupId ?? ''}
            onChange={(e) => setGroupId(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            {groups.map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {g.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          select
          size="small"
          label={t('filter.einsatz')}
          value={einsatzFilter}
          onChange={(e) =>
            setParam(
              'einsatz',
              e.target.value === FILTER_ALLE ? undefined : e.target.value,
            )
          }
          sx={{ minWidth: 220 }}
        >
          <MenuItem value={FILTER_ALLE}>{t('filter.alle')}</MenuItem>
          <MenuItem value={FILTER_OHNE}>{t('filter.ohneEinsatz')}</MenuItem>
          {firecalls.map((f) => (
            <MenuItem key={f.id} value={f.id}>
              {f.name}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={
            <Switch
              checked={nurVerrechnen}
              onChange={(e) =>
                setParam('verrechnen', e.target.checked ? '1' : undefined)
              }
            />
          }
          label={t('verrechnen.nurZuVerrechnende')}
        />
      </Stack>

      <FuellprotokollTab
        groupId={groupId ?? ''}
        fuellungen={sichtbar}
        flaschenGesamt={flaschenGesamt}
        flaschen={flaschen}
        fuellstationen={fuellstationen}
        letzteFuellstationId={letzteStation}
        onFuellstationChange={merkeStation}
        firecallId={neuerEinsatz}
        eigeneFeuerwehr={eigeneFeuerwehr}
        zeigeHerkunft
        feuerwehren={feuerwehren}
        personSuggestions={suggestions}
        defaultGefuelltVon={displayName ?? email ?? ''}
        canWrite={!!groupId}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </Container>
  );
}
