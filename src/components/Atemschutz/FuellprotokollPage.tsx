'use client';

import { useCallback, useMemo, useState } from 'react';
import PrintIcon from '@mui/icons-material/Print';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TableViewIcon from '@mui/icons-material/TableView';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Alert from '@mui/material/Alert';
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
import {
  FUELLUNG_ZWECKE,
  geraetKennung,
  zweckOf,
  type AtemschutzFuellung,
  type FuellungInput,
  type FuellungZweck,
} from '../../common/atemschutz';
import { buildFuellprotokollCsv, fuellungCsvZeile } from '../../common/fuellprotokollCsv';
import { isGroupAdmin } from '../../common/groupPermissions';
import { KOSTENERSATZ_GROUP } from '../../common/kostenersatz';
import useAtemschutzFuellungen from '../../hooks/useAtemschutzFuellungen';
import useAtemschutzGeraete from '../../hooks/useAtemschutzGeraete';
import useFahrtenbuchFirecalls from '../../hooks/useFahrtenbuchFirecalls';
import useFahrtenbuchGroup from '../../hooks/useFahrtenbuchGroup';
import useFahrtenbuchPersons from '../../hooks/useFahrtenbuchPersons';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useGroupFeuerwehrName from '../../hooks/useGroupFeuerwehrName';
import { downloadBlob, downloadText } from '../firebase/download';
import {
  addFuellung,
  deleteFuellung,
  updateFuellung,
  type AtemschutzActor,
} from './atemschutzStore';
import {
  deleteFremdeFuellung,
  exportFuellprotokollPdf,
  updateFremdeFuellung,
} from './fuellprotokollActions';
import FuellprotokollTab from './FuellprotokollTab';
import FuellungImportDialog from './FuellungImportDialog';
import { buildFuellungDocument } from './fuellungErfassung';

/** Werte des Einsatz-Filters, die keine Einsatz-ID sind. */
const FILTER_ALLE = 'alle';
const FILTER_OHNE = 'ohne';

const STORAGE_KEY = 'atemschutz.fuellstation';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fehlerschlüssel, für die es einen Text gibt. Alles andere kommt als
 * Rohmeldung des Servers durch — besser eine englische Zeile als ein
 * verschluckter Fehler.
 */
const BEKANNTE_FEHLER = [
  'exportRangeInvalid',
  'exportTooLarge',
  'fuellungGone',
  'fuellungVerrechnet',
  'notInGroup',
  'notGroupAdmin',
  'notLoggedIn',
  'saveFailed',
];

/** Ein Kalendertag als ISO-Zeitpunkt seiner ersten bzw. letzten Millisekunde,
 *  in der Zone des Browsers — dieselbe Zone, in der die Liste die Uhrzeiten
 *  anzeigt. */
function tagesGrenze(tag: string, ende: boolean): string | undefined {
  if (!DAY_RE.test(tag)) return undefined;
  const d = new Date(`${tag}T${ende ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** `2026-09-02T14:35:00Z` → `2026-09-02` in der Zone des Browsers. */
function alsTag(iso: string): string | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const zwei = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

export default function FuellprotokollPage() {
  const t = useTranslations('atemschutz');
  const router = useRouter();
  const searchParams = useSearchParams();
  // `groups` heißt hier bereits die Gruppenauswahl des Umschalters — die
  // Freigaben des Benutzers brauchen deshalb einen eigenen Namen.
  const { email, displayName, uid, isAdmin, groupAdmin, groups: freigaben } = useFirebaseLogin();

  const { groups, groupId, setGroupId } = useFahrtenbuchGroup();
  const eigeneFeuerwehr = useGroupFeuerwehrName(groupId);
  const { flaschen, fuellstationen, feuerwehren } = useAtemschutzGeraete(groupId);
  const firecalls = useFahrtenbuchFirecalls(groupId);

  const istGruppenAdmin = isGroupAdmin(groupId ?? '', {
    isAdmin,
    groups: freigaben,
    groupAdmin,
  });

  // Filter in der URL und nicht im State: Sonst landet die Zurück-Taste auf
  // der vorigen Seite statt auf dem vorigen Filter, und ein Neuladen fällt
  // auf „Alle" zurück. Dasselbe Muster wie `?tab=` am Sammelplatz.
  const einsatzFilter = searchParams.get('einsatz') ?? FILTER_ALLE;
  const nurVerrechnen = searchParams.get('verrechnen') === '1';
  const zweckFilter = FUELLUNG_ZWECKE.find((z) => z === searchParams.get('zweck'));
  const von = searchParams.get('von') ?? '';
  const bis = searchParams.get('bis') ?? '';

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
    einsatzFilter === FILTER_ALLE ? undefined : einsatzFilter === FILTER_OHNE ? '' : einsatzFilter;

  const { fuellungen, flaschenGesamt } = useAtemschutzFuellungen(groupId, {
    firecallId,
    von: tagesGrenze(von, false),
    bis: tagesGrenze(bis, true),
  });

  // Verrechnen und Zweck laufen clientseitig: Als weitere
  // Gleichheitsbedingungen bräuchten sie je Kombination einen eigenen
  // zusammengesetzten Index, und die Liste ist durch `limit` ohnehin
  // beschränkt. Der Zeitraum steht dagegen serverseitig — ein Bereich auf dem
  // Sortierfeld kostet keinen Index.
  const sichtbar = useMemo(
    () =>
      fuellungen
        .filter((f) => !nurVerrechnen || f.verrechnen)
        .filter((f) => !zweckFilter || zweckOf(f) === zweckFilter),
    [fuellungen, nurVerrechnen, zweckFilter],
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
          (activePersons ?? []).map((p) => p.name?.trim()).filter((n): n is string => !!n),
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

  const [fehler, setFehler] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [importOffen, setImportOffen] = useState(false);

  const fehlerText = useCallback(
    (key?: string) =>
      key && BEKANNTE_FEHLER.includes(key)
        ? t(`errors.${key}` as 'errors.saveFailed')
        : (key ?? t('errors.saveFailed')),
    [t],
  );

  const handleSave = useCallback(
    async (input: FuellungInput, bestehende?: AtemschutzFuellung) => {
      if (!groupId) return;
      setFehler(undefined);
      const now = new Date().toISOString();
      const data = buildFuellungDocument(input, {
        firecallId: neuerEinsatz,
        firecallName: neuerEinsatzName,
        now,
      });
      const stamp: AtemschutzActor = { userId: actor.userId, now };
      if (!bestehende?.id) {
        await addFuellung(groupId, data, stamp);
        return;
      }
      // Eine eigene Zeile schreibt der Client selbst — das hält den Weg
      // offlinefähig. Eine fremde Zeile darf der Gruppen-Admin ändern, aber
      // die Firestore-Regel kann seine Rolle nicht sehen: Dafür gibt es die
      // Server Action.
      if (bestehende.createdBy === actor.userId) {
        await updateFuellung(groupId, bestehende.id, data, stamp);
        return;
      }
      const result = await updateFremdeFuellung(groupId, bestehende.id, data);
      if (!result.success) setFehler(fehlerText(result.error));
    },
    [actor.userId, fehlerText, groupId, neuerEinsatz, neuerEinsatzName],
  );

  const handleDelete = useCallback(
    async (fuellung: AtemschutzFuellung) => {
      if (!groupId || !fuellung.id) return;
      setFehler(undefined);
      if (fuellung.createdBy === actor.userId) {
        await deleteFuellung(groupId, fuellung.id);
        return;
      }
      const result = await deleteFremdeFuellung(groupId, fuellung.id);
      if (!result.success) setFehler(fehlerText(result.error));
    },
    [actor.userId, fehlerText, groupId],
  );

  /**
   * Der zu druckende Zeitraum: der eingestellte, und ohne Einstellung der,
   * den die Liste gerade zeigt. So steht im Kopf des Ausdrucks, was auf dem
   * Blatt steht, und nicht ein erfundenes „seit Beginn der Aufzeichnung".
   */
  const zeitraum = useMemo(() => {
    const heute = alsTag(new Date().toISOString()) as string;
    if (DAY_RE.test(von) && DAY_RE.test(bis)) return { from: von, to: bis };
    const tage = sichtbar
      .map((f) => alsTag(f.zeitpunkt))
      .filter((d): d is string => !!d)
      .sort();
    return {
      from: (DAY_RE.test(von) ? von : tage[0]) ?? heute,
      to: (DAY_RE.test(bis) ? bis : tage[tage.length - 1]) ?? heute,
    };
  }, [bis, sichtbar, von]);

  const handlePdf = useCallback(async () => {
    if (!groupId) return;
    setBusy(true);
    setFehler(undefined);
    try {
      const result = await exportFuellprotokollPdf({
        groupId,
        from: zeitraum.from,
        to: zeitraum.to,
        firecallId,
        firecallName: firecalls.find((f) => f.id === firecallId)?.name,
        zweck: zweckFilter,
        nurVerrechnen,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!result.success || !result.pdfBase64 || !result.fileName) {
        setFehler(fehlerText(result.error));
        return;
      }
      const bytes = Uint8Array.from(atob(result.pdfBase64), (c) => c.charCodeAt(0));
      await downloadBlob(new Blob([bytes], { type: 'application/pdf' }), result.fileName);
    } finally {
      setBusy(false);
    }
  }, [fehlerText, firecallId, firecalls, groupId, nurVerrechnen, zeitraum, zweckFilter]);

  /**
   * Der CSV-Export läuft rein im Browser — anders als der Ausdruck.
   *
   * Er enthält genau die Zeilen, die auf dem Bildschirm stehen; sie sind
   * bereits geladen, und Datum und Uhrzeit gehören in die Ortszeit des
   * Benutzers. Ein Serverlauf müsste beides erneut beschaffen und liefe in UTC.
   */
  const handleCsv = useCallback(async () => {
    const kennungById = new Map(
      flaschen
        .filter((g) => g.id && geraetKennung(g))
        .map((g) => [g.id as string, geraetKennung(g) as string]),
    );
    const csv = buildFuellprotokollCsv(
      // Aufsteigend wie im Ausdruck: Eine Nachweisliste wird von vorn gelesen.
      [...sichtbar]
        .sort((a, b) => (a.zeitpunkt ?? '').localeCompare(b.zeitpunkt ?? ''))
        .map((f) =>
          fuellungCsvZeile(f, {
            kennung: f.geraetId ? kennungById.get(f.geraetId) : undefined,
          }),
        ),
    );
    await downloadText(
      csv,
      `fuellprotokoll_${zeitraum.from}_${zeitraum.to}.csv`,
      'text/csv;charset=utf-8',
    );
  }, [flaschen, sichtbar, zeitraum]);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {t('fuellprotokoll.title')}
        </Typography>
        {/* Die Verrechnung steht hier und nicht im Menü: Sie ist die
            Fortsetzung derselben Arbeit — was gefüllt wurde, wird
            abgerechnet — und unter „Fahrzeuge" war sie nicht zu finden.
            Sichtbar nur mit der Kostenersatz-Freischaltung, derselben
            Bedingung wie auf der Zielseite. */}
        {freigaben?.includes(KOSTENERSATZ_GROUP) && (
          <Button component={Link} href="/atemschutz/verrechnung" startIcon={<ReceiptLongIcon />}>
            {t('rechnung.title')}
          </Button>
        )}
      </Stack>

      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center', rowGap: 2 }}
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
            setParam('einsatz', e.target.value === FILTER_ALLE ? undefined : e.target.value)
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
        <TextField
          select
          size="small"
          label={t('fuellung.zweck')}
          value={zweckFilter ?? ''}
          onChange={(e) => setParam('zweck', e.target.value || undefined)}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">{t('filter.alle')}</MenuItem>
          {FUELLUNG_ZWECKE.map((z) => (
            <MenuItem key={z} value={z}>
              {t(`zweck.${z}`)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          type="date"
          label={t('filter.von')}
          value={von}
          onChange={(e) => setParam('von', e.target.value || undefined)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small"
          type="date"
          label={t('filter.bis')}
          value={bis}
          onChange={(e) => setParam('bis', e.target.value || undefined)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={nurVerrechnen}
              onChange={(e) => setParam('verrechnen', e.target.checked ? '1' : undefined)}
            />
          }
          label={t('verrechnen.nurZuVerrechnende')}
        />
      </Stack>

      {/* Ausdruck und Export beziehen sich auf genau das, was die Filter
          darüber übrig lassen — deshalb stehen sie direkt darunter. */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Button
          size="small"
          startIcon={<PrintIcon />}
          disabled={busy || !groupId}
          onClick={handlePdf}
        >
          {t('export.pdf')}
        </Button>
        <Button
          size="small"
          startIcon={<TableViewIcon />}
          disabled={busy || sichtbar.length === 0}
          onClick={handleCsv}
        >
          {t('export.csv')}
        </Button>
        {/* Nachtragen ist ein Verwaltungsakt und keine Protokollführung:
            derselbe Zuschnitt wie beim Geräteimport. */}
        {istGruppenAdmin && (
          <Button
            size="small"
            startIcon={<UploadFileIcon />}
            disabled={busy || !groupId}
            onClick={() => setImportOffen(true)}
          >
            {t('fuellprotokollImport.button')}
          </Button>
        )}
      </Stack>

      {fehler && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFehler(undefined)}>
          {fehler}
        </Alert>
      )}

      <FuellprotokollTab
        groupId={groupId ?? ''}
        fuellungen={sichtbar}
        flaschenGesamt={flaschenGesamt}
        flaschen={flaschen}
        fuellstationen={fuellstationen}
        letzteFuellstationId={letzteStation}
        onFuellstationChange={merkeStation}
        firecallId={neuerEinsatz}
        firecalls={firecalls}
        // Nur wirksam, solange die Gruppe noch keinen Einsatz hat und der
        // Dialog deshalb keine Auswahl anbietet.
        firecallName={neuerEinsatzName}
        eigeneFeuerwehr={eigeneFeuerwehr}
        zeigeHerkunft
        feuerwehren={feuerwehren}
        personSuggestions={suggestions}
        defaultGefuelltVon={displayName ?? email ?? ''}
        canWrite={!!groupId}
        uid={uid}
        istGruppenAdmin={istGruppenAdmin}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      {importOffen && groupId && (
        <FuellungImportDialog open groupId={groupId} onClose={() => setImportOffen(false)} />
      )}
    </Container>
  );
}
