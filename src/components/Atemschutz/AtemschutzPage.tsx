'use client';

import { useCallback, useMemo } from 'react';
import Alert from '@mui/material/Alert';
import Container from '@mui/material/Container';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { doc } from 'firebase/firestore';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  canTransition,
  geraetLabel,
  newTruppKey,
  nextBereitstellung,
  sanitizeMitglieder,
  truppLabel,
  type AtemschutzFuellung,
  type AtemschutzGeraet,
  type AtemschutzTrupp,
  type FuellungInput,
  type TruppInput,
  type TruppPatch,
} from '../../common/atemschutz';
import { isFirecallGuest } from '../../common/firecallGuest';
import useAtemschutzEinsatzdaten from '../../hooks/useAtemschutzEinsatzdaten';
import useAtemschutzFuellungen from '../../hooks/useAtemschutzFuellungen';
import useAtemschutzGeraete from '../../hooks/useAtemschutzGeraete';
import useAtemschutzPersonSuggestions from '../../hooks/useAtemschutzPersonSuggestions';
import useFahrtenbuchMangel from '../../hooks/useFahrtenbuchMangel';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useGroupFeuerwehrName from '../../hooks/useGroupFeuerwehrName';
import useFirecall, { useFirecallId } from '../../hooks/useFirecall';
import useFirecallWriteAccess from '../../hooks/useFirecallWriteAccess';
import useVehicles from '../../hooks/useVehicles';
import { updateDoc } from '../../lib/firestoreClient';
import { firestore } from '../firebase/firebase';
import { FIRECALL_COLLECTION_ID } from '../firebase/firestore';
import AtemschutzHeader from './AtemschutzHeader';
import {
  ATEMSCHUTZ_TABS,
  tabFromParam,
  type AtemschutzTabKey,
} from './atemschutzTabs';
import {
  addAusgabe,
  addFuellung,
  addTrupp,
  deleteFuellung,
  deleteTrupp,
  updateAusgabe,
  updateFuellung,
  updateTrupp,
  type AtemschutzActor,
} from './atemschutzStore';
import type { AusgabePatch } from './AusgabeDialog';
import { buildFuellungDocument } from './fuellungErfassung';
import AusruestungTab from './AusruestungTab';
import FuellprotokollTab from './FuellprotokollTab';
import TruppsTab from './TruppsTab';

export default function AtemschutzPage() {
  const t = useTranslations('atemschutz');
  const firecallId = useFirecallId();
  const firecall = useFirecall();
  const canWrite = useFirecallWriteAccess();
  const {
    email,
    displayName,
    uid,
    firecall: gastFirecall,
  } = useFirebaseLogin();
  // Ein Einsatz-Gast ist kein Gruppenmitglied und darf das Füllprotokoll unter
  // der Gruppe weder lesen noch schreiben — auch dann nicht, wenn sein Token
  // Schreibrecht am Einsatz trägt. Deshalb `isFirecallGuest` und nicht
  // `useIsReadOnlyFirecallGuest`.
  const istGast = isFirecallGuest({ firecall: gastFirecall });

  const router = useRouter();
  const searchParams = useSearchParams();
  // Der aktive Reiter steht in der URL, nicht im State: Sonst landet die
  // Zurück-Taste auf der vorigen Seite statt auf dem vorigen Reiter, und ein
  // Neuladen fällt auf den ersten Reiter zurück.
  const tab = tabFromParam(searchParams.get('tab'));

  const setTab = useCallback(
    (next: AtemschutzTabKey) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', next);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const groupId = firecall?.group;
  const { flaschen, activeGeraete, fuellstationen, feuerwehren } =
    useAtemschutzGeraete(groupId);
  const { trupps, ausgabeByGeraet } = useAtemschutzEinsatzdaten(firecallId);
  // Das Füllprotokoll liegt unter der Gruppe; hier wird es auf diesen Einsatz
  // eingeschränkt.
  const { fuellungen, flaschenGesamt } = useAtemschutzFuellungen(groupId, {
    firecallId,
  });
  const eigeneFeuerwehr = useGroupFeuerwehrName(groupId);

  // Nur die Ausrüstungsmängel: Fahrzeugmängel gehören nicht an diese Liste.
  const { openCountByGeraet } = useFahrtenbuchMangel(groupId, {
    itemType: 'atemschutz',
  });

  const empfaengerVorschlaege = useMemo(() => {
    const namen = new Set<string>();
    for (const t of trupps.protokoll) {
      const label = truppLabel(t);
      if (label) namen.add(label);
      if (t.feuerwehr?.trim()) namen.add(t.feuerwehr.trim());
    }
    for (const fw of feuerwehren) namen.add(fw);
    return [...namen].sort((a, b) => a.localeCompare(b, 'de'));
  }, [trupps.protokoll, feuerwehren]);

  const { vehicles, tacticalUnits } = useVehicles();

  const suggestions = useAtemschutzPersonSuggestions(groupId, {
    trupps: trupps.protokoll,
    asspLeiter: firecall?.asspLeiter,
    asspFuellpersonal: firecall?.asspFuellpersonal,
  });

  /**
   * Wohin ein Trupp entsendet wird: an ein Fahrzeug oder an eine taktische
   * Einheit des Einsatzes.
   *
   * Bewusst **keine Personen**. Ein Trupp wird einer Einheit unterstellt, nicht
   * einem Menschen — wer die Einheit gerade führt, steht an der Einheit und
   * kann wechseln, während der Trupp draußen ist. Ein Personenname im
   * Protokoll wäre dann falsch, ohne dass es jemandem auffällt.
   */
  const entsendetAnVorschlaege = useMemo(() => {
    const namen: string[] = [];
    const gesehen = new Set<string>();
    const add = (value?: string) => {
      const v = value?.trim();
      if (!v || gesehen.has(v.toLowerCase())) return;
      gesehen.add(v.toLowerCase());
      namen.push(v);
    };
    for (const fzg of vehicles) add(fzg.name);
    for (const einheit of tacticalUnits) add(einheit.name);
    return namen;
  }, [vehicles, tacticalUnits]);

  const actor: AtemschutzActor = useMemo(
    () => ({ userId: uid ?? '', now: new Date().toISOString() }),
    [uid],
  );

  const benutzerName = displayName ?? email ?? '';

  const handleSaveLeitung = useCallback(
    async (leiter: string, fuellpersonal: string[]) => {
      if (!firecallId || firecallId === 'unknown') return;
      await updateDoc(doc(firestore, FIRECALL_COLLECTION_ID, firecallId), {
        asspLeiter: leiter,
        asspFuellpersonal: fuellpersonal,
      });
    },
    [firecallId],
  );

  const handleSaveFuellung = useCallback(
    async (input: FuellungInput, bestehende?: AtemschutzFuellung) => {
      if (!groupId) return;
      const now = new Date().toISOString();
      const data = buildFuellungDocument(input, {
        firecallId,
        firecallName: firecall?.name,
        now,
      });
      const stamp: AtemschutzActor = { userId: actor.userId, now };
      if (bestehende?.id) {
        await updateFuellung(groupId, bestehende.id, data, stamp);
      } else {
        await addFuellung(groupId, data, stamp);
      }
    },
    [actor.userId, firecall?.name, firecallId, groupId],
  );

  const handleDeleteFuellung = useCallback(
    (fuellung: AtemschutzFuellung) =>
      deleteFuellung(groupId ?? '', fuellung.id ?? ''),
    [groupId],
  );

  const handleSaveTrupp = useCallback(
    async (input: TruppInput, trupp?: AtemschutzTrupp) => {
      const now = new Date().toISOString();
      const stamp: AtemschutzActor = { userId: actor.userId, now };
      const basis = {
        feuerwehr: input.feuerwehr.trim(),
        mitglieder: sanitizeMitglieder(input.mitglieder),
        ...(input.truppName?.trim()
          ? { truppName: input.truppName.trim() }
          : {}),
        ...(input.bemerkung?.trim()
          ? { bemerkung: input.bemerkung.trim() }
          : {}),
      };

      if (trupp?.id) {
        await updateTrupp(firecallId, trupp.id, basis, stamp);
        return;
      }
      await addTrupp(
        firecallId,
        {
          ...basis,
          truppKey: newTruppKey(),
          laufendeNummer: 1,
          status: 'bereit',
          bereitSeit: now,
        },
        stamp,
      );
    },
    [actor.userId, firecallId],
  );

  const handlePatchTrupp = useCallback(
    async (trupp: AtemschutzTrupp, patch: TruppPatch) => {
      // Die Schranke hier und nicht nur in der Oberfläche: Zwei Leute am
      // Sammelplatz sehen dieselbe Karte, und wer sie eine Sekunde später
      // drückt, arbeitet auf einem überholten Zustand.
      if (!trupp.id || !canTransition(trupp.status, patch.status)) return;
      await updateTrupp(firecallId, trupp.id, patch, {
        userId: actor.userId,
        now: new Date().toISOString(),
      });
    },
    [actor.userId, firecallId],
  );

  const handleWiederBereit = useCallback(
    async (trupp: AtemschutzTrupp) => {
      const now = new Date().toISOString();
      // Eine *neue* Zeile: Die alte bleibt als Nachweis unverändert stehen.
      await addTrupp(firecallId, nextBereitstellung(trupp, now), {
        userId: actor.userId,
        now,
      });
    },
    [actor.userId, firecallId],
  );

  const handleDeleteTrupp = useCallback(
    (id: string) => deleteTrupp(firecallId, id),
    [firecallId],
  );

  const handleAusgabePatch = useCallback(
    async (geraet: AtemschutzGeraet, patch: AusgabePatch) => {
      const now = new Date().toISOString();
      const stamp: AtemschutzActor = { userId: actor.userId, now };
      const vorhanden = ausgabeByGeraet.get(geraet.id as string);
      if (vorhanden?.id) {
        await updateAusgabe(firecallId, vorhanden.id, patch, stamp);
        return;
      }
      // Erst beim ersten Anfassen entsteht ein Dokument — sonst müsste zu
      // jedem Einsatz der ganze Bestand angelegt werden.
      await addAusgabe(
        firecallId,
        {
          geraetId: geraet.id as string,
          geraetName: geraetLabel(geraet),
          ...patch,
        },
        stamp,
      );
    },
    [actor.userId, ausgabeByGeraet, firecallId],
  );

  const handleMangelGemeldet = useCallback(
    async (geraet: AtemschutzGeraet, mangelId: string) => {
      const now = new Date().toISOString();
      const stamp: AtemschutzActor = { userId: actor.userId, now };
      const vorhanden = ausgabeByGeraet.get(geraet.id as string);
      const patch = { sichtkontrolle: 'mangel' as const, mangelId };
      if (vorhanden?.id) {
        await updateAusgabe(firecallId, vorhanden.id, patch, stamp);
        return;
      }
      await addAusgabe(
        firecallId,
        {
          geraetId: geraet.id as string,
          geraetName: geraetLabel(geraet),
          status: 'amPlatz',
          ...patch,
        },
        stamp,
      );
    },
    [actor.userId, ausgabeByGeraet, firecallId],
  );

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h4" gutterBottom>
        {t('title')}
      </Typography>

      {!canWrite && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('readOnly')}
        </Alert>
      )}

      <AtemschutzHeader
        leiter={firecall?.asspLeiter}
        fuellpersonal={firecall?.asspFuellpersonal}
        suggestions={suggestions}
        canWrite={canWrite}
        onSave={handleSaveLeitung}
      />

      <Tabs
        value={tab}
        onChange={(_, next: AtemschutzTabKey) => setTab(next)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {ATEMSCHUTZ_TABS.map((key) => (
          <Tab key={key} value={key} label={t(`tabs.${key}`)} />
        ))}
      </Tabs>

      {tab === 'fuellprotokoll' &&
        (istGast ? (
          // Statt eines fehlenden Reiters ein Hinweis: Ein verschwundener
          // Reiter würde als Fehler gelesen.
          <Alert severity="info">{t('fuellprotokoll.gastHinweis')}</Alert>
        ) : (
          <FuellprotokollTab
            groupId={groupId ?? ''}
            fuellungen={fuellungen}
            flaschenGesamt={flaschenGesamt}
            flaschen={flaschen}
            fuellstationen={fuellstationen}
            firecallId={firecallId}
            // Ohne `firecalls`, also ohne Auswahl: Am Sammelplatz gehört jede
            // Füllung zu *diesem* Einsatz. Der Name steht trotzdem im Dialog —
            // wer erfasst, soll sehen, wohin die Zeile geht.
            firecallName={firecall?.name}
            eigeneFeuerwehr={eigeneFeuerwehr}
            feuerwehren={feuerwehren}
            personSuggestions={suggestions}
            defaultGefuelltVon={benutzerName}
            canWrite={canWrite}
            uid={uid}
            // Bewusst **ohne** `istGruppenAdmin`, obwohl die Rolle hier
            // bekannt wäre: Eine fremde Zeile zu ändern geht nur über eine
            // Server Action (die Firestore-Regel sieht die Rolle nicht), und
            // eine Server Action scheitert an der schlechten Verbindung am
            // Sammelplatz — genau dem Grund, aus dem hier der Client schreibt.
            // Korrigiert wird am Schreibtisch, auf /atemschutz/fuellprotokoll.
            onSave={handleSaveFuellung}
            onDelete={handleDeleteFuellung}
          />
        ))}

      {tab === 'trupps' && (
        <TruppsTab
          trupps={trupps}
          feuerwehren={feuerwehren}
          personSuggestions={suggestions}
          entsendetAnVorschlaege={entsendetAnVorschlaege}
          canWrite={canWrite}
          onSave={handleSaveTrupp}
          onPatch={handlePatchTrupp}
          onWiederBereit={handleWiederBereit}
          onDelete={handleDeleteTrupp}
        />
      )}
      {tab === 'ausruestung' && (
        <AusruestungTab
          groupId={groupId ?? ''}
          geraete={activeGeraete}
          ausgabeByGeraet={ausgabeByGeraet}
          empfaengerVorschlaege={empfaengerVorschlaege}
          openMangelByGeraet={openCountByGeraet}
          canWrite={canWrite}
          onPatch={handleAusgabePatch}
          onMangelGemeldet={handleMangelGemeldet}
        />
      )}
    </Container>
  );
}
