'use client';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import useFahrtenbuchGroup from '../../../hooks/useFahrtenbuchGroup';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import FahrtenbuchAdminGuard from './FahrtenbuchAdminGuard';
import FahrtenbuchImport from './FahrtenbuchImport';
import GeraetemeisterSettings from './GeraetemeisterSettings';
import GroupSettings from './GroupSettings';
import MangelMigration from './MangelMigration';
import MangelNotificationSettings from './MangelNotificationSettings';
import PersonAdmin from './PersonAdmin';
import ShareLinkSection from './ShareLinkSection';
import VehicleAdmin from './VehicleAdmin';
import WeeklyReportSendSection from './WeeklyReportSendSection';

type AdminTabKey =
  | 'vehicles'
  | 'persons'
  | 'settings'
  | 'shareLink'
  | 'pdfImport';

/**
 * Nur Admins sehen alle Reiter. Ein Gerätemeister pflegt Fahrzeuge und
 * Personen; Einstellungen, Share-Links und PDF-Import bleiben admin-only.
 */
const MANAGER_TABS: AdminTabKey[] = ['vehicles', 'persons'];
const ADMIN_TABS: AdminTabKey[] = [
  'vehicles',
  'persons',
  'settings',
  'shareLink',
  'pdfImport',
];

const TAB_LABEL_KEYS = {
  vehicles: 'admin.vehicles',
  persons: 'admin.persons',
  settings: 'admin.settings',
  shareLink: 'shareLink.heading',
  pdfImport: 'admin.pdfImport.tab',
} as const;

/**
 * Klammer über die Stammdaten: Gruppenauswahl plus Tabs für Fahrzeuge und
 * Personen. Die Gruppen kommen aus `useFahrtenbuchGroup`, damit hier dieselben
 * Ausschlüsse gelten wie in den Regeln und den Server Actions.
 */
export default function FahrtenbuchAdmin() {
  const t = useTranslations('fahrtenbuch');
  const { groups: allGroups, groupId, setGroupId } = useFahrtenbuchGroup();
  const { isAdmin, fahrtenbuchGeraetemeister } = useFirebaseLogin();
  // Ein Gerätemeister verwaltet nur die Gruppen, in denen er eingetragen ist.
  // Das ist keine Sicherheitsgrenze — die ist
  // `actionFahrtenbuchManagerRequired` in den Server Actions.
  const groups = useMemo(
    () =>
      isAdmin
        ? allGroups
        : allGroups.filter((g) => fahrtenbuchGeraetemeister?.includes(g.id)),
    [allGroups, isAdmin, fahrtenbuchGeraetemeister],
  );
  const tabs = isAdmin ? ADMIN_TABS : MANAGER_TABS;
  const [tab, setTab] = useState<AdminTabKey>('vehicles');
  // Fällt eine Gruppe aus den Claims, ohne dass die Auswahl nachzieht, ist die
  // ID immer noch besser als ein leerer Name.
  const groupName = groups.find((g) => g.id === groupId)?.name ?? groupId ?? '';

  return (
    <FahrtenbuchAdminGuard>
      {/* `xl` statt `lg`: Bei 1200px Inhaltsbreite bleiben auf einem großen
          Display zwei Spalten und breite leere Ränder. Die Fahrzeug- und
          Personentabellen gewinnen durch die Breite ebenso. */}
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Typography variant="h4" sx={{ flexGrow: 1 }}>
            {t('admin.title')}
          </Typography>
          <TextField
            select
            size="small"
            label={t('group')}
            value={groupId ?? ''}
            onChange={(e) => setGroupId(e.target.value)}
            disabled={groups.length === 0}
            sx={{ minWidth: 200 }}
          >
            {groups.map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {g.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        {groups.length === 0 ||
        !groupId ||
        !groups.some((g) => g.id === groupId) ? (
          <Typography color="text.secondary">{t('admin.noGroups')}</Typography>
        ) : (
          <>
            <Tabs
              value={tab}
              onChange={(_, value: AdminTabKey) => setTab(value)}
              sx={{ mb: 2 }}
            >
              {tabs.map((key) => (
                <Tab key={key} value={key} label={t(TAB_LABEL_KEYS[key])} />
              ))}
            </Tabs>

            {/* `key` verwirft Dialog- und Meldungszustand beim Gruppenwechsel,
                damit keine Meldung der vorigen Gruppe stehen bleibt. */}
            {tab === 'vehicles' && (
              <VehicleAdmin
                key={groupId}
                groupId={groupId}
                groupName={groupName}
              />
            )}
            {tab === 'persons' && (
              <PersonAdmin
                key={groupId}
                groupId={groupId}
                groupName={groupName}
              />
            )}
            {/* Der Einstellungen-Tab setzt die Abschnitte nur zusammen; jeder
                pflegt seinen eigenen Teil der Gruppenkonfiguration und lädt
                ihn selbst. `key` erneuert alle beim Gruppenwechsel.

                Die Breite steuert dieser Container und nicht die Karte: So
                füllen sie ihre Spalte, statt in ihr zu schwimmen. */}
            {tab === 'settings' && (
              <Box
                key={groupId}
                sx={{
                  display: 'grid',
                  gap: 3,
                  // Die Spaltenzahl wächst so, dass eine Spalte nie unter etwa
                  // 420px fällt: Die Abschnitte sind Formulare mit Hilfetexten
                  // und Chips, enge Spalten lesen sich schlechter als wenige
                  // breite. Bei `md` bleiben rund 430px je Spalte, bei `xl`
                  // rund 480 — die Breite, für die die Karten gebaut sind. Eine
                  // einzelne Spalte bleibt darauf begrenzt, damit ein Formular
                  // auf dem Tablet nicht über die halbe Seite läuft.
                  //
                  // `minmax(0, …)` statt `1fr`: Ein `1fr` ist `minmax(auto,
                  // 1fr)` und wächst über seinen Anteil hinaus, sobald ein
                  // Inhalt nicht umbricht — etwa eine lange Empfängeradresse.
                  gridTemplateColumns: {
                    xs: 'minmax(0, 480px)',
                    md: 'repeat(2, minmax(0, 1fr))',
                    xl: 'repeat(3, minmax(0, 1fr))',
                  },
                  // Jede Karte behält ihre natürliche Höhe, statt auf die
                  // höchste ihrer Zeile gestreckt zu werden.
                  alignItems: 'start',
                }}
              >
                <GroupSettings groupId={groupId} />
                <MangelNotificationSettings groupId={groupId} />
                <GeraetemeisterSettings groupId={groupId} />
                {/* Folgt den Empfängern, weil der Versand sie vorbelegt: Die
                    Nachbarschaft macht den Unterschied zwischen einmaliger
                    Überschreibung und dauerhafter Pflege sichtbar. */}
                <WeeklyReportSendSection groupId={groupId} />
                <MangelMigration groupId={groupId} />
              </Box>
            )}
            {tab === 'shareLink' && (
              <ShareLinkSection
                key={groupId}
                groupId={groupId}
                groupName={groupName}
              />
            )}
            {tab === 'pdfImport' && (
              <FahrtenbuchImport
                key={groupId}
                groupId={groupId}
                groupName={groupName}
              />
            )}
          </>
        )}
      </Container>
    </FahrtenbuchAdminGuard>
  );
}
