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
import { type FuellungInput } from '../../common/atemschutz';
import useAtemschutzEinsatzdaten from '../../hooks/useAtemschutzEinsatzdaten';
import useAtemschutzGeraete from '../../hooks/useAtemschutzGeraete';
import useAtemschutzPersonSuggestions from '../../hooks/useAtemschutzPersonSuggestions';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useFirecall, { useFirecallId } from '../../hooks/useFirecall';
import useFirecallWriteAccess from '../../hooks/useFirecallWriteAccess';
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
  addFuellung,
  deleteFuellung,
  updateFuellung,
  type AtemschutzActor,
} from './atemschutzStore';
import FuellprotokollTab from './FuellprotokollTab';

export default function AtemschutzPage() {
  const t = useTranslations('atemschutz');
  const firecallId = useFirecallId();
  const firecall = useFirecall();
  const canWrite = useFirecallWriteAccess();
  const { email, displayName, uid } = useFirebaseLogin();

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
  const { flaschen, feuerwehren } = useAtemschutzGeraete(groupId);
  const { fuellungen, flaschenGesamt, trupps } =
    useAtemschutzEinsatzdaten(firecallId);

  const suggestions = useAtemschutzPersonSuggestions(groupId, {
    trupps: trupps.protokoll,
    asspLeiter: firecall?.asspLeiter,
    asspFuellpersonal: firecall?.asspFuellpersonal,
  });

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
    async (input: FuellungInput, id?: string) => {
      const now = new Date().toISOString();
      const data = {
        // Nur setzen, was einen Wert hat: Firestore lehnt `undefined` ab.
        ...(input.geraetId ? { geraetId: input.geraetId } : {}),
        ...(input.flaschenNummer?.trim()
          ? { flaschenNummer: input.flaschenNummer.trim() }
          : {}),
        ...(input.feuerwehr?.trim() ? { feuerwehr: input.feuerwehr.trim() } : {}),
        anzahl: input.anzahl,
        ...(typeof input.startdruck === 'number'
          ? { startdruck: input.startdruck }
          : {}),
        enddruck: input.enddruck,
        gefuelltVon: input.gefuelltVon.trim(),
        zeitpunkt: input.zeitpunkt ?? now,
        ...(input.sichtkontrolle ? { sichtkontrolle: input.sichtkontrolle } : {}),
        ...(input.bemerkung?.trim() ? { bemerkung: input.bemerkung.trim() } : {}),
      };
      const stamp: AtemschutzActor = { userId: actor.userId, now };
      if (id) {
        await updateFuellung(firecallId, id, data, stamp);
      } else {
        await addFuellung(firecallId, data, stamp);
      }
    },
    [actor.userId, firecallId],
  );

  const handleDeleteFuellung = useCallback(
    (id: string) => deleteFuellung(firecallId, id),
    [firecallId],
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
        suggestions={suggestions.alle}
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

      {tab === 'fuellprotokoll' && (
        <FuellprotokollTab
          fuellungen={fuellungen}
          flaschenGesamt={flaschenGesamt}
          flaschen={flaschen}
          feuerwehren={feuerwehren}
          personSuggestions={suggestions.alle}
          defaultGefuelltVon={benutzerName}
          canWrite={canWrite}
          onSave={handleSaveFuellung}
          onDelete={handleDeleteFuellung}
        />
      )}

      {/* Stufe 5 */}
      {tab === 'trupps' && <Typography color="text.secondary">—</Typography>}
      {/* Stufe 7 */}
      {tab === 'ausruestung' && (
        <Typography color="text.secondary">—</Typography>
      )}
    </Container>
  );
}
