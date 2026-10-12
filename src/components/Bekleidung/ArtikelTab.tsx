'use client';

import AddIcon from '@mui/icons-material/Add';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { BekleidungArtikel } from '../../common/bekleidung';
import OnlineOnly from '../site/OnlineOnly';
import ArtikelEditDialog from './ArtikelEditDialog';
import ArtikelMergeDialog, { artikelLabel } from './ArtikelMergeDialog';
import BekleidungImportDialog from './BekleidungImportDialog';
import type { BekleidungView } from './bekleidungUi';

const collator = new Intl.Collator('de', { numeric: true });

/**
 * Artikeltypen pflegen, inklusive inaktiver; Import aus dem Excel;
 * Schreibvarianten in einen gleichartigen Artikel zusammenführen.
 */
export default function ArtikelTab({ view }: { view: BekleidungView }) {
  const t = useTranslations('bekleidung');
  const [edit, setEdit] = useState<{ artikel?: BekleidungArtikel }>();
  const [importOpen, setImportOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState<BekleidungArtikel>();

  const sorted = useMemo(
    () =>
      [...view.artikel].sort(
        (a, b) =>
          Number(b.aktiv) - Number(a.aktiv) ||
          a.kategorie.localeCompare(b.kategorie) ||
          collator.compare(a.bezeichnung, b.bezeichnung),
      ),
    [view.artikel],
  );
  /** Gleichartig: dieselbe Kategorie und Führung — nur dorthin geht es. */
  const mergeTargets = (a: BekleidungArtikel) =>
    sorted.filter((b) => b.id !== a.id && b.kategorie === a.kategorie && b.fuehrung === a.fuehrung);
  const pieceCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of view.stuecke) counts.set(s.artikelId, (counts.get(s.artikelId) ?? 0) + 1);
    return counts;
  }, [view.stuecke]);

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <OnlineOnly>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEdit({})}>
            {t('actions.newArtikel')}
          </Button>
        </OnlineOnly>
        <OnlineOnly>
          <Button
            variant="outlined"
            startIcon={<UploadFileIcon />}
            onClick={() => setImportOpen(true)}
          >
            {t('actions.import')}
          </Button>
        </OnlineOnly>
      </Stack>
      {sorted.length === 0 ? (
        <Typography color="text.secondary">{t('artikel.empty')}</Typography>
      ) : (
        <List disablePadding>
          {sorted.map((a) => (
            <ListItem
              key={a.id}
              divider
              disablePadding
              secondaryAction={
                mergeTargets(a).length > 0 ? (
                  <OnlineOnly>
                    <Tooltip title={t('artikel.merge')}>
                      <IconButton
                        edge="end"
                        aria-label={t('artikel.mergeLabel', { name: artikelLabel(a) })}
                        onClick={() => setMergeSource(a)}
                      >
                        <MergeTypeIcon />
                      </IconButton>
                    </Tooltip>
                  </OnlineOnly>
                ) : undefined
              }
            >
              <ListItemButton onClick={() => setEdit({ artikel: a })}>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <span>{a.bezeichnung}</span>
                      {!a.aktiv && <Chip size="small" label={t('artikel.inactive')} />}
                    </Stack>
                  }
                  secondary={[
                    t(`kategorie.${a.kategorie}`),
                    a.hersteller,
                    t(`fuehrung.${a.fuehrung}`),
                    a.fuehrung === 'einzeln'
                      ? t('artikel.stueckCount', { count: pieceCount.get(a.id ?? '') ?? 0 })
                      : undefined,
                    a.maxWaschgaenge
                      ? `${t('fields.maxWaschgaenge')}: ${a.maxWaschgaenge}`
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  slotProps={{ primary: { component: 'div' } }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
      {edit && (
        <ArtikelEditDialog
          open
          groupId={view.groupId}
          artikel={edit.artikel}
          onClose={() => setEdit(undefined)}
        />
      )}
      {mergeSource && (
        <ArtikelMergeDialog
          open
          groupId={view.groupId}
          source={mergeSource}
          targets={mergeTargets(mergeSource)}
          onClose={() => setMergeSource(undefined)}
        />
      )}
      {importOpen && (
        <BekleidungImportDialog
          open
          groupId={view.groupId}
          persons={view.persons}
          onClose={() => setImportOpen(false)}
        />
      )}
    </>
  );
}
