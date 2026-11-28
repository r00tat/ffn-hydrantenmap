'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  NAVIGATION_HOTKEY_TARGETS,
  navigationHref,
  type NavigationHotkeyId,
} from '../../common/hotkeyNavigation';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirecallNavigate from '../../hooks/useFirecallNavigate';
import { useMapEditorCanEdit } from '../../hooks/useMapEditor';
import { useHotkey } from './HotkeyProvider';

// Erst beim ersten Öffnen geladen: Die Suche zieht Elementklassen und Leaflet
// nach, die Dokument-Dialoge den ganzen Elementdialog.
const HotkeySearchDialog = dynamic(() => import('./HotkeySearchDialog'), {
  ssr: false,
});
const HotkeyHelpDialog = dynamic(() => import('./HotkeyHelpDialog'), {
  ssr: false,
});
const GlobalDocumentEntryDialog = dynamic(
  () => import('./GlobalDocumentEntryDialog'),
  { ssr: false },
);

type OpenDialog = 'search' | 'help' | 'diary' | 'gb' | undefined;

function useNavigationHotkey(id: NavigationHotkeyId) {
  const firecallId = useFirecallId();
  const pathname = usePathname();
  const navigate = useFirecallNavigate();
  useHotkey(id, () => {
    const href = navigationHref(NAVIGATION_HOTKEY_TARGETS[id], firecallId);
    if (href !== pathname) navigate(href);
  });
}

/**
 * Kürzel, die überall gelten: Suche, Hilfe, Navigation und neue Einträge in
 * Einsatztagebuch und Geschäftsbuch. Die Seiten können einzelne davon für
 * sich übernehmen — der zuletzt angemeldete Handler gewinnt (siehe
 * `HotkeyProvider`). Sitzt innerhalb der Einsatz- und Editor-Provider.
 */
export default function GlobalHotkeys() {
  const [open, setOpen] = useState<OpenDialog>();
  const firecallId = useFirecallId();
  const canEdit = useMapEditorCanEdit();
  const canWriteDocuments = !!firecallId && firecallId !== 'unknown' && canEdit;
  const close = () => setOpen(undefined);

  useHotkey('general.search', () => setOpen('search'));
  useHotkey('general.help', () => setOpen('help'));
  useHotkey('documents.diary', () => setOpen('diary'), canWriteDocuments);
  useHotkey('documents.geschaeftsbuch', () => setOpen('gb'), canWriteDocuments);

  useNavigationHotkey('navigation.map');
  useNavigationHotkey('navigation.diary');
  useNavigationHotkey('navigation.geschaeftsbuch');
  useNavigationHotkey('navigation.einsatzmittel');
  useNavigationHotkey('navigation.einsatzorte');
  useNavigationHotkey('navigation.ebenen');
  useNavigationHotkey('navigation.einsaetze');

  if (open === 'search') return <HotkeySearchDialog onClose={close} />;
  if (open === 'help') return <HotkeyHelpDialog onClose={close} />;
  if (open === 'diary' || open === 'gb') {
    return <GlobalDocumentEntryDialog kind={open} onClose={close} />;
  }
  return null;
}
