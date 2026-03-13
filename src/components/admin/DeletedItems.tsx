'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useCallback, useMemo, useState } from 'react';
import { useFirecallId } from '../../hooks/useFirecall';
import {
  DeletedItemInfo,
  DeletedItemsResult,
  getDeletedItems,
  restoreDeletedItems,
  restoreLayer,
} from '../../app/admin/adminActions';
import { fcItemNames } from '../FirecallItems/elements';

interface LayerGroup {
  layerName: string;
  layerDeleted: boolean;
  items: DeletedItemInfo[];
}

export default function DeletedItems() {
  const firecallId = useFirecallId();
  const [items, setItems] = useState<DeletedItemInfo[]>([]);
  const [orphanedLayers, setOrphanedLayers] = useState<
    DeletedItemsResult['orphanedLayers']
  >([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (firecallId === 'unknown') {
      setStatus('No firecall selected.');
      return;
    }
    setStatus('Loading deleted items...');
    const result = await getDeletedItems(firecallId);
    setItems(result.items);
    setOrphanedLayers(result.orphanedLayers);
    setSelected(new Set());
    setLoaded(true);
    setStatus(`Found ${result.items.length} deleted items.`);
  }, [firecallId]);

  const groupedByLayer = useMemo(() => {
    const groups = new Map<string, LayerGroup>();
    for (const item of items) {
      const key = item.layer || '(no layer)';
      if (!groups.has(key)) {
        groups.set(key, {
          layerName: item.layerName || item.layer || '(no layer)',
          layerDeleted: item.layerDeleted ?? false,
          items: [],
        });
      }
      groups.get(key)!.items.push(item);
    }

    // Add orphaned layer groups (deleted layers with non-deleted items)
    for (const ol of orphanedLayers) {
      if (!groups.has(ol.id)) {
        groups.set(ol.id, {
          layerName: ol.name,
          layerDeleted: true,
          items: [],
        });
      }
    }

    // Sort: items with a layer first (by count desc), "(no layer)" last
    return Array.from(groups.entries()).sort((a, b) => {
      const aNoLayer = a[0] === '(no layer)';
      const bNoLayer = b[0] === '(no layer)';
      if (aNoLayer !== bNoLayer) return aNoLayer ? 1 : -1;
      return b[1].items.length - a[1].items.length;
    });
  }, [items, orphanedLayers]);

  const toggleItem = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleLayer = useCallback(
    (layerItems: DeletedItemInfo[]) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const allSelected = layerItems.every((i) => next.has(i.id));
        for (const item of layerItems) {
          if (allSelected) next.delete(item.id);
          else next.add(item.id);
        }
        return next;
      });
    },
    []
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(items.map((i) => i.id)));
  }, [items]);

  const selectNone = useCallback(() => {
    setSelected(new Set());
  }, []);

  const restoreSelected = useCallback(async () => {
    if (firecallId === 'unknown' || selected.size === 0) return;
    setStatus(`Restoring ${selected.size} items...`);
    const result = await restoreDeletedItems(
      firecallId,
      Array.from(selected)
    );
    setStatus(`Restored ${result.itemsRestored} items.`);
    await load();
  }, [firecallId, selected, load]);

  const handleRestoreLayer = useCallback(
    async (layerId: string, layerName: string) => {
      if (firecallId === 'unknown') return;
      setStatus(`Restoring layer "${layerName}"...`);
      const ok = await restoreLayer(firecallId, layerId);
      if (ok) {
        setStatus(`Restored layer "${layerName}".`);
      } else {
        setStatus(`Layer "${layerName}" was not found or not deleted.`);
      }
      await load();
    },
    [firecallId, load]
  );

  const handleRestoreLayerWithItems = useCallback(
    async (layerKey: string, group: LayerGroup) => {
      if (firecallId === 'unknown' || group.items.length === 0) return;
      const itemIds = group.items.map((i) => i.id);
      setStatus(
        `Restoring layer "${group.layerName}" and ${itemIds.length} items...`
      );
      const result = await restoreDeletedItems(firecallId, itemIds, true);
      setStatus(
        `Restored ${result.itemsRestored} items${result.layerRestored ? ` and layer "${group.layerName}"` : ''}.`
      );
      await load();
    },
    [firecallId, load]
  );

  if (firecallId === 'unknown') {
    return <Typography>No firecall selected.</Typography>;
  }

  return (
    <Box>
      <Typography variant="body1" sx={{ mb: 2 }}>
        {status}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Button onClick={load} variant="contained">
          {loaded ? 'Reload' : 'Load deleted items'}
        </Button>
        {loaded && items.length > 0 && (
          <>
            <Button onClick={selectAll} variant="outlined" size="small">
              Select all ({items.length})
            </Button>
            <Button onClick={selectNone} variant="outlined" size="small">
              Select none
            </Button>
            <Button
              onClick={restoreSelected}
              variant="contained"
              color="success"
              disabled={selected.size === 0}
            >
              Restore selected ({selected.size})
            </Button>
          </>
        )}
      </Box>

      {loaded &&
        groupedByLayer.map(([layerKey, group]) => {
          const allSelected =
            group.items.length > 0 &&
            group.items.every((i) => selected.has(i.id));
          const someSelected = group.items.some((i) => selected.has(i.id));
          const orphanedInfo = orphanedLayers.find((o) => o.id === layerKey);
          return (
            <Accordion key={layerKey} disableGutters defaultExpanded={false}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  '& .MuiAccordionSummary-content': {
                    alignItems: 'center',
                    gap: 1,
                    flexWrap: 'wrap',
                  },
                }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected && !allSelected}
                      onChange={() => toggleLayer(group.items)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={group.items.length === 0}
                    />
                  }
                  label={
                    <Typography variant="subtitle2">
                      {group.layerName}
                      {group.layerDeleted && (
                        <Chip
                          label="layer deleted"
                          size="small"
                          color="error"
                          variant="outlined"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </Typography>
                  }
                  onClick={(e) => e.stopPropagation()}
                />
                <Chip label={group.items.length} size="small" />
                {orphanedInfo && orphanedInfo.orphanedItemCount > 0 && (
                  <Chip
                    label={`${orphanedInfo.orphanedItemCount} orphaned`}
                    size="small"
                    color="warning"
                  />
                )}
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                {group.layerDeleted && layerKey !== '(no layer)' && (
                  <Box sx={{ px: 2, py: 1, display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="info"
                      onClick={() =>
                        handleRestoreLayer(layerKey, group.layerName)
                      }
                    >
                      Restore layer only
                    </Button>
                    {group.items.length > 0 && (
                      <Button
                        size="small"
                        variant="outlined"
                        color="success"
                        onClick={() =>
                          handleRestoreLayerWithItems(layerKey, group)
                        }
                      >
                        Restore layer + all items ({group.items.length})
                      </Button>
                    )}
                  </Box>
                )}
                {!group.layerDeleted && (
                  <Box sx={{ px: 2, py: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="success"
                      disabled={!someSelected}
                      onClick={async () => {
                        const layerSelected = group.items
                          .filter((i) => selected.has(i.id))
                          .map((i) => i.id);
                        if (layerSelected.length === 0) return;
                        setStatus(
                          `Restoring ${layerSelected.length} items from "${group.layerName}"...`
                        );
                        const result = await restoreDeletedItems(
                          firecallId,
                          layerSelected
                        );
                        setStatus(
                          `Restored ${result.itemsRestored} items.`
                        );
                        await load();
                      }}
                    >
                      Restore selection
                    </Button>
                  </Box>
                )}
                {orphanedInfo && orphanedInfo.orphanedItemCount > 0 && (
                  <Alert severity="warning" sx={{ mx: 2, mb: 1 }}>
                    {orphanedInfo.orphanedItemCount} items are still active but
                    belong to this deleted layer (orphaned).
                  </Alert>
                )}
                {group.items.length > 0 ? (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell padding="checkbox" />
                          <TableCell>Name</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Date</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {group.items.map((item) => (
                          <TableRow
                            key={item.id}
                            hover
                            onClick={() => toggleItem(item.id)}
                            sx={{ cursor: 'pointer' }}
                          >
                            <TableCell padding="checkbox">
                              <Checkbox checked={selected.has(item.id)} />
                            </TableCell>
                            <TableCell>{item.name}</TableCell>
                            <TableCell>
                              {fcItemNames[item.type] || item.type}
                            </TableCell>
                            <TableCell>{item.datum || ''}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography variant="body2" sx={{ px: 2, py: 1 }}>
                    No deleted items in this layer.
                  </Typography>
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
    </Box>
  );
}
