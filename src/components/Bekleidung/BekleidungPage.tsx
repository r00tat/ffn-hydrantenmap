'use client';

import LocalLaundryServiceIcon from '@mui/icons-material/LocalLaundryService';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { isBekleidungswart } from '../../common/bekleidungPermissions';
import { isGroupAdmin } from '../../common/groupPermissions';
import {
  useBekleidungArtikel,
  useBekleidungAusgaben,
  useBekleidungBestand,
  useBekleidungStuecke,
  useBekleidungWaeschen,
} from '../../hooks/useBekleidung';
import useFahrtenbuchGroup from '../../hooks/useFahrtenbuchGroup';
import useFahrtenbuchPersons from '../../hooks/useFahrtenbuchPersons';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import OfflineListHint from '../site/OfflineListHint';
import OnlineOnly from '../site/OnlineOnly';
import ArtikelTab from './ArtikelTab';
import AusgabeDialog from './AusgabeDialog';
import BekleidungswartSettings from './BekleidungswartSettings';
import { buildBekleidungView } from './bekleidungUi';
import LagerstandTab from './LagerstandTab';
import PersonenTab from './PersonenTab';
import RuecknahmeDialog from './RuecknahmeDialog';
import StueckeTab from './StueckeTab';
import WaescheDialog from './WaescheDialog';
import WaescheTab from './WaescheTab';

type TabKey = 'stuecke' | 'lagerstand' | 'personen' | 'waesche' | 'artikel' | 'settings';

type OpenDialog =
  | { kind: 'ausgabe'; personId?: string }
  | { kind: 'ruecknahme'; personId?: string }
  | { kind: 'waesche' };

/**
 * Seite „Bekleidung" einer Gruppe — nur für Bekleidungswart, Gruppen-Admin
 * und Admin. Die Abos starten erst mit der Berechtigung, sonst lehnen die
 * Firestore-Regeln sie ab. Die Grenze ziehen Regeln und Server Actions; die
 * Prüfung hier ist Bedienkomfort.
 */
export default function BekleidungPage() {
  const t = useTranslations('bekleidung');
  const { isAuthorized, isAdmin, groups: userGroups, groupAdmin, bekleidungswart } =
    useFirebaseLogin();
  const { groups, groupId, setGroupId } = useFahrtenbuchGroup();
  const user = { isAdmin, groups: userGroups, groupAdmin, bekleidungswart };
  const permitted = !!groupId && isBekleidungswart(groupId, user);
  const canSettings = !!groupId && isGroupAdmin(groupId, user);
  const dataGroupId = permitted ? groupId : undefined;

  const artikel = useBekleidungArtikel(dataGroupId);
  const stuecke = useBekleidungStuecke(dataGroupId);
  const bestand = useBekleidungBestand(dataGroupId);
  const ausgaben = useBekleidungAusgaben(dataGroupId);
  const waeschen = useBekleidungWaeschen(dataGroupId);
  const { persons } = useFahrtenbuchPersons(dataGroupId);

  const [tab, setTab] = useState<TabKey>('stuecke');
  const [dialog, setDialog] = useState<OpenDialog>();

  const view = useMemo(
    () =>
      buildBekleidungView({
        groupId: dataGroupId ?? '',
        artikel: artikel.records,
        stuecke: stuecke.records,
        bestand: bestand.records,
        ausgaben: ausgaben.records,
        waeschen: waeschen.records,
        persons,
      }),
    [
      dataGroupId,
      artikel.records,
      stuecke.records,
      bestand.records,
      ausgaben.records,
      waeschen.records,
      persons,
    ],
  );

  const message = (text: string) => (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography>{text}</Typography>
    </Container>
  );

  if (!isAuthorized) return message(t('loginRequired'));
  if (groups.length === 0 || !groupId) return message(t('noGroup'));

  const states = [artikel, stuecke, bestand, ausgaben, waeschen];
  const loading = states.some((s) => s.loading);
  const fromCache = states.some((s) => s.fromCache);
  const empty = artikel.records.length === 0 && stuecke.records.length === 0;
  const activeTab = tab === 'settings' && !canSettings ? 'stuecke' : tab;

  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ mb: 2, alignItems: { sm: 'center' } }}
      >
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4">{t('title')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('subtitle')}
          </Typography>
        </Box>
        {groups.length > 1 && (
          <TextField
            select
            size="small"
            label={t('group')}
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            sx={{ minWidth: 200 }}
          >
            {groups.map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {g.name}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>

      {!permitted ? (
        <Typography>{t('noPermission')}</Typography>
      ) : (
        <>
          <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 2, flexWrap: 'wrap' }}>
            <OnlineOnly>
              <Button
                variant="contained"
                startIcon={<LogoutIcon />}
                onClick={() => setDialog({ kind: 'ausgabe' })}
              >
                {t('actions.ausgeben')}
              </Button>
            </OnlineOnly>
            <OnlineOnly>
              <Button
                variant="outlined"
                startIcon={<LoginIcon />}
                onClick={() => setDialog({ kind: 'ruecknahme' })}
              >
                {t('actions.zuruecknehmen')}
              </Button>
            </OnlineOnly>
            <OnlineOnly>
              <Button
                variant="outlined"
                startIcon={<LocalLaundryServiceIcon />}
                onClick={() => setDialog({ kind: 'waesche' })}
              >
                {t('actions.waescheErfassen')}
              </Button>
            </OnlineOnly>
          </Stack>

          {loading && <LinearProgress sx={{ mb: 1 }} />}
          <OfflineListHint fromCache={fromCache} empty={empty} />

          <Tabs
            value={activeTab}
            onChange={(_, value: TabKey) => setTab(value)}
            variant="scrollable"
            allowScrollButtonsMobile
            sx={{ mb: 2 }}
          >
            <Tab value="stuecke" label={t('tabs.stuecke')} />
            <Tab value="lagerstand" label={t('tabs.lagerstand')} />
            <Tab value="personen" label={t('tabs.personen')} />
            <Tab value="waesche" label={t('tabs.waesche')} />
            <Tab value="artikel" label={t('tabs.artikel')} />
            {canSettings && <Tab value="settings" label={t('tabs.settings')} />}
          </Tabs>

          {activeTab === 'stuecke' && <StueckeTab view={view} />}
          {activeTab === 'lagerstand' && <LagerstandTab view={view} />}
          {activeTab === 'personen' && (
            <PersonenTab
              view={view}
              onIssue={(personId) => setDialog({ kind: 'ausgabe', personId })}
              onReturn={(personId) => setDialog({ kind: 'ruecknahme', personId })}
            />
          )}
          {activeTab === 'waesche' && <WaescheTab view={view} />}
          {activeTab === 'artikel' && <ArtikelTab view={view} />}
          {activeTab === 'settings' && canSettings && <BekleidungswartSettings groupId={groupId} />}

          {dialog?.kind === 'ausgabe' && (
            <AusgabeDialog
              open
              view={view}
              initialPersonId={dialog.personId}
              onClose={() => setDialog(undefined)}
            />
          )}
          {dialog?.kind === 'ruecknahme' && (
            <RuecknahmeDialog
              open
              view={view}
              initialPersonId={dialog.personId}
              onClose={() => setDialog(undefined)}
            />
          )}
          {dialog?.kind === 'waesche' && (
            <WaescheDialog open view={view} onClose={() => setDialog(undefined)} />
          )}
        </>
      )}
    </Container>
  );
}
