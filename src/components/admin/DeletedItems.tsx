'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
  getDeletedItems,
  restoreDeletedItems,
} from '../../app/admin/adminActions';
import { fcItemNames } from '../FirecallItems/elements';

export default function DeletedItems() {
  const firecallId = useFirecallId();
  const [items, setItems] = useState<DeletedItemInfo[]>([]);
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
    setItems(result);
    setSelected(new Set());
    setLoaded(true);
    setStatus(`Found ${result.length} deleted items.`);
  }, [firecallId]);

  const groupedByLayer = useMemo(() => {
    const groups = new Map<
      string,
      { layerName: string; items: DeletedItemInfo[] }
    >();
    for (const item of items) {
      const key = item.layer || '(no layer)';
      if (!groups.has(key)) {
        groups.set(key, {
          layerName: item.layerName || item.layer || '(no layer)',
          items: [],
        });
      }
      groups.get(key)!.items.push(item);
    }
    // Sort: items with a layer first (by count desc), "(no layer)" last
    return Array.from(groups.entries()).sort((a, b) => {
      const aNoLayer = a[0] === '(no layer)';
      const bNoLayer = b[0] === '(no layer)';
      if (aNoLayer !== bNoLayer) return aNoLayer ? 1 : -1;
      return b[1].items.length - a[1].items.length;
    });
  }, [items]);

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
    const restored = await restoreDeletedItems(
      firecallId,
      Array.from(selected)
    );
    setStatus(`Restored ${restored} items.`);
    const result = await getDeletedItems(firecallId);
    setItems(result);
    setSelected(new Set());
  }, [firecallId, selected]);

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
          const allSelected = group.items.every((i) => selected.has(i.id));
          const someSelected = group.items.some((i) => selected.has(i.id));
          return (
            <Accordion key={layerKey} disableGutters defaultExpanded={false}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  '& .MuiAccordionSummary-content': {
                    alignItems: 'center',
                    gap: 1,
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
                    />
                  }
                  label={
                    <Typography variant="subtitle2">
                      {group.layerName}
                    </Typography>
                  }
                  onClick={(e) => e.stopPropagation()}
                />
                <Chip label={group.items.length} size="small" />
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
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
                      const restored = await restoreDeletedItems(
                        firecallId,
                        layerSelected
                      );
                      setStatus(`Restored ${restored} items.`);
                      const result = await getDeletedItems(firecallId);
                      setItems(result);
                      setSelected(new Set());
                    }}
                  >
                    Restore selection
                  </Button>
                </Box>
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
              </AccordionDetails>
            </Accordion>
          );
        })}
    </Box>
  );
}
