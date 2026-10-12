'use client';

import AddIcon from '@mui/icons-material/Add';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { Fragment, useMemo, useState } from 'react';
import {
  normalizeCharge,
  normalizeGroesse,
  normalizeTagNummer,
  totalWaschgaenge,
  waschLimitState,
  type BekleidungKategorie,
  type BekleidungStatus,
  type BekleidungStueck,
} from '../../common/bekleidung';
import OnlineOnly from '../site/OnlineOnly';
import BekleidungScanDialog from './BekleidungScanDialog';
import ExpandToggle, { toggleKey } from './ExpandToggle';
import { findStueckByCode, type BekleidungView } from './bekleidungUi';
import StueckDetailDialog from './StueckDetailDialog';
import StueckEditDialog from './StueckEditDialog';

const PAGE_SIZE = 100;
const STATUSES: BekleidungStatus[] = ['lager', 'ausgegeben', 'ausgeschieden', 'nicht_auffindbar'];
const collator = new Intl.Collator('de', { numeric: true });

export interface StueckFilter {
  kategorie: '' | BekleidungKategorie;
  artikelId: string;
  groesse: string;
  status: '' | BekleidungStatus;
  personId: string;
  search: string;
}

export const EMPTY_STUECK_FILTER: StueckFilter = {
  kategorie: '',
  artikelId: '',
  groesse: '',
  status: '',
  personId: '',
  search: '',
};

export function filterStuecke(view: BekleidungView, filter: StueckFilter): BekleidungStueck[] {
  const search = normalizeTagNummer(filter.search)?.toLowerCase();
  return view.stuecke
    .filter((s) => {
      const artikel = view.artikelById.get(s.artikelId);
      if (filter.kategorie && artikel?.kategorie !== filter.kategorie) return false;
      if (filter.artikelId && s.artikelId !== filter.artikelId) return false;
      if (filter.groesse && normalizeGroesse(s.groesse) !== filter.groesse) return false;
      if (filter.status && s.status !== filter.status) return false;
      if (filter.personId && s.personId !== filter.personId) return false;
      if (search && !(s.tagNummer ?? '').toLowerCase().includes(search)) return false;
      return true;
    })
    .sort(
      (a, b) =>
        collator.compare(
          view.artikelById.get(a.artikelId)?.bezeichnung ?? '',
          view.artikelById.get(b.artikelId)?.bezeichnung ?? '',
        ) ||
        collator.compare(a.groesse, b.groesse) ||
        collator.compare(a.tagNummer ?? '', b.tagNummer ?? ''),
    );
}

/** Die gefilterten Stücke je Artikel, in der Sortierung von `filterStuecke`. */
function groupByArtikel(stuecke: BekleidungStueck[]) {
  const groups = new Map<string, BekleidungStueck[]>();
  for (const s of stuecke) {
    const list = groups.get(s.artikelId);
    if (list) list.push(s);
    else groups.set(s.artikelId, [s]);
  }
  return [...groups].map(([artikelId, list]) => ({ artikelId, stuecke: list }));
}

/**
 * Alle Einzelstücke mit Filtern, Suche nach Tag-Nummer und Scan. Je Artikel
 * eine Zeile mit den Zahlen, aufgeklappt die Stücke — nach dem Import hat ein
 * Artikel schnell hundert Stücke. Engt die Suche, ein Artikel oder eine
 * Person die Liste ein, sind die Treffer gleich aufgeklappt.
 */
export default function StueckeTab({ view }: { view: BekleidungView }) {
  const t = useTranslations('bekleidung');
  const [filter, setFilter] = useState<StueckFilter>(EMPTY_STUECK_FILTER);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [detailId, setDetailId] = useState<string>();
  const [edit, setEdit] = useState<{ stueck?: BekleidungStueck }>();
  const [scanOpen, setScanOpen] = useState(false);
  const [notFound, setNotFound] = useState<string>();

  const filtered = useMemo(() => filterStuecke(view, filter), [view, filter]);
  const groups = useMemo(() => groupByArtikel(filtered), [filtered]);
  const autoExpand = !!(filter.search.trim() || filter.artikelId || filter.personId);
  const sizes = useMemo(
    () => [...new Set(view.stuecke.map((s) => normalizeGroesse(s.groesse)))].sort(collator.compare),
    [view.stuecke],
  );
  const persons = useMemo(() => {
    const ids = new Set(view.stuecke.map((s) => s.personId).filter(Boolean));
    return view.persons.filter((p) => p.id && ids.has(p.id));
  }, [view.stuecke, view.persons]);
  const artikelOptions = view.artikel.filter(
    (a) => a.fuehrung === 'einzeln' && (!filter.kategorie || a.kategorie === filter.kategorie),
  );

  const update = (patch: Partial<StueckFilter>) => {
    setFilter((prev) => ({ ...prev, ...patch }));
    setLimits({});
  };

  const handleCode = (code: string) => {
    const stueck = findStueckByCode(view.stuecke, code);
    if (stueck?.id) {
      setNotFound(undefined);
      setDetailId(stueck.id);
    } else {
      setNotFound(code);
    }
  };

  const select = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: { value: string; label: string }[],
  ) => (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{ minWidth: 150 }}
    >
      <MenuItem value="">{t('filters.all')}</MenuItem>
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );

  return (
    <>
      <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          type="search"
          label={t('filters.search')}
          value={filter.search}
          onChange={(e) => update({ search: e.target.value })}
          sx={{ minWidth: 180, flexGrow: 1 }}
        />
        <Button
          variant="outlined"
          startIcon={<QrCodeScannerIcon />}
          onClick={() => setScanOpen(true)}
        >
          {t('actions.scan')}
        </Button>
        <OnlineOnly>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEdit({})}>
            {t('actions.newStueck')}
          </Button>
        </OnlineOnly>
      </Stack>
      <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 2, flexWrap: 'wrap' }}>
        {select(
          t('fields.kategorie'),
          filter.kategorie,
          (v) => update({ kategorie: v as StueckFilter['kategorie'], artikelId: '' }),
          (['einsatz', 'dienst'] as const).map((k) => ({ value: k, label: t(`kategorie.${k}`) })),
        )}
        {select(
          t('fields.artikel'),
          filter.artikelId,
          (v) => update({ artikelId: v }),
          artikelOptions.map((a) => ({ value: a.id ?? '', label: a.bezeichnung })),
        )}
        {select(
          t('fields.groesse'),
          filter.groesse,
          (v) => update({ groesse: v }),
          sizes.map((s) => ({ value: s, label: s })),
        )}
        {select(
          t('fields.status'),
          filter.status,
          (v) => update({ status: v as StueckFilter['status'] }),
          STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
        )}
        {select(
          t('fields.person'),
          filter.personId,
          (v) => update({ personId: v }),
          persons.map((p) => ({ value: p.id ?? '', label: p.name })),
        )}
      </Stack>
      {notFound && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setNotFound(undefined)}>
          {t('stuecke.notFound', { code: notFound })}
        </Alert>
      )}

      {filtered.length === 0 ? (
        <Typography color="text.secondary">{t('stuecke.empty')}</Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('fields.tagNummer')}</TableCell>
                <TableCell>{t('fields.groesse')}</TableCell>
                <TableCell>{t('fields.status')}</TableCell>
                <TableCell>{t('fields.person')}</TableCell>
                <TableCell align="right">{t('fields.waschgaenge')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map((group) => {
                const artikel = view.artikelById.get(group.artikelId);
                const name = artikel?.bezeichnung ?? group.artikelId;
                const open = autoExpand || expanded.has(group.artikelId);
                const toggle = () => setExpanded((prev) => toggleKey(prev, group.artikelId));
                const limit = limits[group.artikelId] ?? PAGE_SIZE;
                const count = (status: BekleidungStatus) =>
                  group.stuecke.filter((s) => s.status === status).length;
                return (
                  <Fragment key={group.artikelId}>
                    <TableRow
                      hover
                      sx={{ cursor: autoExpand ? undefined : 'pointer', bgcolor: 'action.hover' }}
                      onClick={autoExpand ? undefined : toggle}
                    >
                      <TableCell sx={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {!autoExpand && (
                          <ExpandToggle name={name} expanded={open} onToggle={toggle} />
                        )}
                        {name}
                      </TableCell>
                      <TableCell colSpan={4} sx={{ color: 'text.secondary' }}>
                        {t('stuecke.groupSummary', {
                          count: group.stuecke.length,
                          lager: count('lager'),
                          ausgegeben: count('ausgegeben'),
                        })}
                      </TableCell>
                    </TableRow>
                    {open &&
                      group.stuecke.slice(0, limit).map((s) => {
                        const limitState = waschLimitState(s, artikel);
                        return (
                          <TableRow
                            key={s.id}
                            hover
                            sx={{ cursor: 'pointer' }}
                            onClick={() => setDetailId(s.id)}
                          >
                            <TableCell sx={{ pl: 6 }}>
                              {s.tagNummer ?? <em>{t('stuecke.noTag')}</em>}
                              {s.eigentum === 'privat' && (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  sx={{ ml: 1 }}
                                  label={t('eigentum.privat')}
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              {[s.groesse, normalizeCharge(s.charge)].filter(Boolean).join(' · ')}
                            </TableCell>
                            <TableCell>{t(`status.${s.status}`)}</TableCell>
                            <TableCell>
                              {(s.personId && view.personById.get(s.personId)?.name) ?? ''}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                color:
                                  limitState === 'reached'
                                    ? 'error.main'
                                    : limitState === 'near'
                                      ? 'warning.main'
                                      : undefined,
                              }}
                            >
                              {totalWaschgaenge(s)}
                              {artikel?.maxWaschgaenge ? ` / ${artikel.maxWaschgaenge}` : ''}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    {open && group.stuecke.length > limit && (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          <Button
                            onClick={() =>
                              setLimits((prev) => ({
                                ...prev,
                                [group.artikelId]: limit + PAGE_SIZE,
                              }))
                            }
                          >
                            {t('actions.showMore', { count: group.stuecke.length - limit })}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      {detailId && (
        <StueckDetailDialog
          open
          view={view}
          stueckId={detailId}
          onClose={() => setDetailId(undefined)}
          onEdit={() => setEdit({ stueck: view.stueckById.get(detailId) })}
        />
      )}
      {edit && (
        <StueckEditDialog
          open
          view={view}
          stueck={edit.stueck}
          onClose={() => setEdit(undefined)}
        />
      )}
      <BekleidungScanDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onCode={handleCode}
      />
    </>
  );
}
