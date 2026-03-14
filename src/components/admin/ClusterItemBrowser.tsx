'use client';

import { useState, useCallback, useMemo } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { WgsObject } from '../../common/gis-objects';
import {
  ClusterCollectionType,
  collectionConfigs,
  getCollectionConfig,
  getTableColumns,
} from './clusterItemConfig';
import { deleteClusterItem } from '../../app/admin/ClusterItemAdminAction';
import ClusterItemEditDialog from './ClusterItemEditDialog';

export default function ClusterItemBrowser() {
  const [selectedTab, setSelectedTab] = useState(0);
  const selectedCollection: ClusterCollectionType = collectionConfigs[selectedTab].collection;
  const config = getCollectionConfig(selectedCollection);
  const tableColumns = getTableColumns(config);

  const items = useFirebaseCollection<WgsObject>({
    collectionName: selectedCollection,
  });

  const [searchText, setSearchText] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, string>>({});

  const handleSort = useCallback(
    (key: string) => {
      setSortDir((prev) => (sortKey === key && prev === 'asc' ? 'desc' : 'asc'));
      setSortKey(key);
    },
    [sortKey]
  );

  const filteredItems = useMemo(() => {
    if (!searchText.trim()) return items;
    const lower = searchText.toLowerCase();
    return items.filter((item) => {
      const searchable = [
        item.name,
        (item as Record<string, unknown>).ortschaft,
        (item as Record<string, unknown>).bezeichnung,
        (item as Record<string, unknown>).adresse,
        (item as Record<string, unknown>).bezeichnung_adresse,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(lower);
    });
  }, [items, searchText]);

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      const aVal = String((a as Record<string, unknown>)[sortKey] ?? '');
      const bVal = String((b as Record<string, unknown>)[sortKey] ?? '');
      const cmp = aVal.localeCompare(bVal, 'de', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredItems, sortKey, sortDir]);

  const paginatedItems = useMemo(() => {
    return sortedItems.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
  }, [sortedItems, page, rowsPerPage]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue);
    setSearchText('');
    setPage(0);
    setSortKey('name');
    setSortDir('asc');
  };

  const itemToFormData = (item: WgsObject): Record<string, string> => {
    const data: Record<string, string> = {};
    for (const field of config.fields) {
      data[field.key] = String((item as Record<string, unknown>)[field.key] ?? '');
    }
    data.lat = String(item.lat ?? '');
    data.lng = String(item.lng ?? '');
    return data;
  };

  const handleAdd = () => {
    setEditingId(null);
    const data: Record<string, string> = {};
    for (const field of config.fields) {
      data[field.key] = '';
    }
    data.lat = '';
    data.lng = '';
    setEditFormData(data);
    setDialogOpen(true);
  };

  const handleEdit = (item: WgsObject) => {
    setEditingId(item.id || null);
    setEditFormData(itemToFormData(item));
    setDialogOpen(true);
  };

  const handleDelete = async (item: WgsObject) => {
    if (!item.id) return;
    if (!confirm(`"${item.name}" wirklich löschen?`)) return;

    try {
      await deleteClusterItem(selectedCollection, item.id);
    } catch (error) {
      console.error('Delete failed:', error);
      alert(
        `Löschen fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingId(null);
    setEditFormData({});
  };

  return (
    <Box>
      <Tabs
        value={selectedTab}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2 }}
      >
        {collectionConfigs.map((c) => (
          <Tab key={c.collection} label={c.displayName} />
        ))}
      </Tabs>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <TextField
          placeholder="Suchen..."
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setPage(0);
          }}
          size="small"
          sx={{ minWidth: 300 }}
        />
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
          Hinzufügen
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ maxHeight: 'calc(100vh - 500px)' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {tableColumns.map((col) => (
                <TableCell key={col.key} sortDirection={sortKey === col.key ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === col.key}
                    direction={sortKey === col.key ? sortDir : 'asc'}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell sortDirection={sortKey === 'lat' ? sortDir : false}>
                <TableSortLabel
                  active={sortKey === 'lat'}
                  direction={sortKey === 'lat' ? sortDir : 'asc'}
                  onClick={() => handleSort('lat')}
                >
                  Lat
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortKey === 'lng' ? sortDir : false}>
                <TableSortLabel
                  active={sortKey === 'lng'}
                  direction={sortKey === 'lng' ? sortDir : 'asc'}
                  onClick={() => handleSort('lng')}
                >
                  Lng
                </TableSortLabel>
              </TableCell>
              <TableCell>Aktionen</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={tableColumns.length + 3} align="center">
                  <Typography variant="body2" sx={{ py: 2 }}>
                    {items.length === 0
                      ? 'Keine Einträge vorhanden.'
                      : 'Keine Ergebnisse für die Suche.'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map((item) => (
                <TableRow key={item.id} hover>
                  {tableColumns.map((col) => (
                    <TableCell key={col.key}>
                      {String((item as Record<string, unknown>)[col.key] ?? '-')}
                    </TableCell>
                  ))}
                  <TableCell>{typeof item.lat === 'number' ? item.lat.toFixed(4) : '-'}</TableCell>
                  <TableCell>{typeof item.lng === 'number' ? item.lng.toFixed(4) : '-'}</TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => handleEdit(item)} title="Bearbeiten">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(item)} title="Löschen">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                    {typeof (item as Record<string, unknown>).link === 'string' &&
                      (item as Record<string, string>).link !== '' && (
                        <IconButton
                          size="small"
                          title="Link öffnen"
                          onClick={() =>
                            window.open(
                              (item as Record<string, string>).link,
                              '_blank',
                              'noopener,noreferrer'
                            )
                          }
                        >
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={filteredItems.length}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[25, 50, 100]}
        labelDisplayedRows={({ from, to, count }) => `${from}-${to} von ${count}`}
        labelRowsPerPage="Zeilen pro Seite:"
      />

      {dialogOpen && (
        <ClusterItemEditDialog
          open={dialogOpen}
          onClose={handleDialogClose}
          config={config}
          editingId={editingId}
          initialData={editFormData}
        />
      )}
    </Box>
  );
}
