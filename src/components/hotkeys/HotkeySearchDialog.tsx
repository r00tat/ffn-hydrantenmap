'use client';

import DescriptionIcon from '@mui/icons-material/Description';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PlaceIcon from '@mui/icons-material/Place';
import RoomIcon from '@mui/icons-material/Room';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  NAVIGATION_HOTKEY_TARGETS,
  SEARCH_PAGE_TARGETS,
  isMapPath,
  navigationHref,
} from '../../common/hotkeyNavigation';
import {
  documentSearchEntries,
  itemSearchEntries,
  locationSearchEntries,
  rankSearchEntries,
  type SearchEntry,
} from '../../common/hotkeySearch';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirecallLocations from '../../hooks/useFirecallLocations';
import useFirecallNavigate from '../../hooks/useFirecallNavigate';
import { fcItemNames } from '../FirecallItems/elements';
import type { FirecallItem } from '../firebase/firestore';
import { useFirecallItems } from '../firebase/firestoreHooks';
import {
  documentHighlightRequests,
  mapFocusRequests,
} from './pendingRequest';

type ResultEntry = SearchEntry & {
  href?: string;
  item?: FirecallItem;
};

const KIND_ICONS = {
  page: <DescriptionIcon />,
  item: <RoomIcon />,
  location: <PlaceIcon />,
  diary: <LibraryBooksIcon />,
  gb: <MenuBookIcon />,
  address: <SearchIcon />,
} as const;

/**
 * Globale Suche (Kürzel `/`): Elemente der Karte, Einsatzorte, Einträge in
 * Einsatztagebuch und Geschäftsbuch sowie die wichtigsten Seiten. Pfeiltasten
 * und Enter wählen, Maus und Touch ebenso. Die Reihung steht in
 * `common/hotkeySearch.ts`.
 */
export default function HotkeySearchDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('hotkeys.search');
  const tDrawer = useTranslations('drawer');
  const firecallId = useFirecallId();
  const hasFirecall = !!firecallId && firecallId !== 'unknown';
  const items = useFirecallItems();
  const { locations } = useFirecallLocations();
  const pathname = usePathname();
  const navigate = useFirecallNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const entries = useMemo<ResultEntry[]>(() => {
    const pages: ResultEntry[] = SEARCH_PAGE_TARGETS.map((target) => ({
      key: `page:${target.labelKey}`,
      kind: 'page',
      title: tDrawer(target.labelKey as 'map'),
      subtitle: t('page'),
      href: navigationHref(target, firecallId),
    }));
    if (!hasFirecall) return pages;
    const typeLabel = (type: string) => fcItemNames[type] ?? type;
    return [
      ...pages,
      ...itemSearchEntries(items, typeLabel),
      ...locationSearchEntries(locations, tDrawer('locations')).map(
        ({ location, ...entry }) => ({
          ...entry,
          item: { ...location, type: 'location' } as unknown as FirecallItem,
        }),
      ),
      ...documentSearchEntries(items, 'diary'),
      ...documentSearchEntries(items, 'gb'),
    ];
  }, [items, locations, firecallId, hasFirecall, t, tDrawer]);

  const results = useMemo(() => rankSearchEntries(entries, query), [entries, query]);
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Tagebuch- und GB-Einträge tragen ihr Buch in der zweiten Zeile, sonst
  // wären sie mit gleicher Nummer nicht zu unterscheiden.
  const secondaryText = (entry: ResultEntry): string | undefined => {
    if (entry.kind !== 'diary' && entry.kind !== 'gb') return entry.subtitle;
    const book = tDrawer(entry.kind === 'diary' ? 'diary' : 'geschaeftsbuch');
    return [book, entry.subtitle].filter(Boolean).join(' · ');
  };

  const select = (entry: ResultEntry) => {
    onClose();
    const mapHref = navigationHref(NAVIGATION_HOTKEY_TARGETS['navigation.map'], firecallId);
    switch (entry.kind) {
      case 'page':
        if (entry.href && entry.href !== pathname) navigate(entry.href);
        return;
      case 'item':
      case 'location':
        if (entry.item) mapFocusRequests.request(entry.item);
        if (!isMapPath(pathname)) navigate(mapHref);
        return;
      case 'diary':
      case 'gb': {
        if (!entry.item?.id) return;
        documentHighlightRequests.request({ kind: entry.kind, id: entry.item.id });
        const href = navigationHref(
          entry.kind === 'diary'
            ? NAVIGATION_HOTKEY_TARGETS['navigation.diary']
            : NAVIGATION_HOTKEY_TARGETS['navigation.geschaeftsbuch'],
          firecallId,
        );
        if (href !== pathname) navigate(href);
        return;
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(Math.min(activeIndex + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = results[activeIndex];
      if (entry) select(entry);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' } }}
      slotProps={{ paper: { sx: { mt: { xs: 2, sm: 8 } } } }}
    >
      <DialogContent sx={{ p: 1.5 }}>
        <TextField
          autoFocus
          fullWidth
          placeholder={hasFirecall ? t('placeholder') : t('placeholderNoFirecall')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            },
            htmlInput: {
              'aria-label': t('label'),
              'aria-controls': 'hotkey-search-results',
              'aria-activedescendant': results[activeIndex]
                ? `hotkey-search-${activeIndex}`
                : undefined,
              role: 'combobox',
              'aria-expanded': true,
            },
          }}
        />
        <Box sx={{ maxHeight: '60vh', overflowY: 'auto', mt: 1 }}>
          {results.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              {t('noResults')}
            </Typography>
          ) : (
            <List dense id="hotkey-search-results" role="listbox" ref={listRef}>
              {results.map((entry, index) => (
                <ListItemButton
                  key={entry.key}
                  id={`hotkey-search-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === activeIndex}
                  selected={index === activeIndex}
                  onMouseMove={() => {
                    if (index !== activeIndex) setActive(index);
                  }}
                  onClick={() => select(entry)}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{KIND_ICONS[entry.kind]}</ListItemIcon>
                  <ListItemText
                    primary={entry.title}
                    secondary={secondaryText(entry)}
                    slotProps={{
                      primary: { noWrap: true },
                      secondary: { noWrap: true },
                    }}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
          {t('hint')}
        </Typography>
      </DialogContent>
    </Dialog>
  );
}
