'use client';

import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { SimpleMap } from '../../common/types';
import { formatTimestamp } from '../../common/time-format';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useVehicles from '../../hooks/useVehicles';
import { useFirecallLayers } from '../../hooks/useFirecallLayers';
import { FirecallItem, Fzg } from '../firebase/firestore';
import { downloadRowsAsCsv } from '../firebase/download';
import { DownloadButton } from '../inputs/DownloadButton';
import FirecallItemUpdateDialog from '../FirecallItems/FirecallItemUpdateDialog';
import { getItemInstance } from '../FirecallItems/elements';

function downloadVehicles(vehicles: Fzg[]) {
  downloadRowsAsCsv(
    [
      [
        'Bezeichnung',
        'Feuerwehr',
        'Besatzung',
        'ATS',
        'Beschreibung',
        'Alarmierung',
        'Eintreffen',
        'Abrücken',
      ],
      ...vehicles.map((v) => [
        v.name,
        v.fw,
        v.besatzung ? Number.parseInt(v.besatzung, 10) + 1 : 1,
        v.ats,
        v.beschreibung,
        v.alarmierung ? formatTimestamp(v.alarmierung) : '',
        v.eintreffen ? formatTimestamp(v.eintreffen) : '',
        v.abruecken ? formatTimestamp(v.abruecken) : '',
      ]),
    ],
    'Fahrzeuge.csv',
  );
}

function CompactItemCard({
  item,
  onEdit,
}: {
  item: FirecallItem;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const instance = useMemo(() => getItemInstance(item), [item]);
  const iconUrl = useMemo(() => {
    try {
      return instance.icon()?.options?.iconUrl;
    } catch {
      return undefined;
    }
  }, [instance]);

  return (
    <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3, xl: 2 }}>
      <Card>
        <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, cursor: 'pointer' }}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {iconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={iconUrl}
                alt=""
                style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }}
              />
            )}
            <Typography
              variant="body1"
              component="div"
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {instance.title()}
            </Typography>
            {!iconUrl && (
              <Chip
                label={instance.markerName()}
                size="small"
                variant="outlined"
                sx={{ flexShrink: 0 }}
              />
            )}
            <IconButton
              size="small"
              sx={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              <ExpandMoreIcon fontSize="small" />
            </IconButton>
          </Box>
          <Collapse in={expanded}>
            <Box sx={{ mt: 1 }}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                aria-label="edit"
                sx={{ float: 'right', ml: 0.5 }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
              <Typography color="text.secondary" variant="body2">
                {instance.info()}
              </Typography>
              <Typography variant="body2">{instance.body()}</Typography>
            </Box>
          </Collapse>
        </CardContent>
      </Card>
    </Grid>
  );
}

function LayerGroup({
  layerName,
  items,
  defaultExpanded,
}: {
  layerName: string;
  items: FirecallItem[];
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editItem, setEditItem] = useState<FirecallItem | null>(null);

  return (
    <Box sx={{ mb: 2 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          py: 0.5,
          '&:hover': { bgcolor: 'action.hover' },
          borderRadius: 1,
        }}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <IconButton
          size="small"
          sx={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            mr: 1,
          }}
        >
          <ExpandMoreIcon />
        </IconButton>
        <Typography variant="h6" sx={{ flex: 1 }}>
          {layerName}
        </Typography>
        <Chip label={items.length} size="small" sx={{ mr: 1 }} />
      </Box>
      <Collapse in={expanded} timeout={300}>
        <Grid container spacing={1} sx={{ mt: 0.5 }}>
          {items.map((item) => (
            <CompactItemCard
              key={item.id}
              item={item}
              onEdit={() => setEditItem(item)}
            />
          ))}
        </Grid>
      </Collapse>
      {editItem && (
        <FirecallItemUpdateDialog
          item={editItem}
          callback={() => setEditItem(null)}
        />
      )}
    </Box>
  );
}

export default function Fahrzeuge() {
  const { isAuthorized } = useFirebaseLogin();
  const { vehicles, displayItems } = useVehicles();
  const layers = useFirecallLayers();

  const groupedByLayer = useMemo(() => {
    const groups: SimpleMap<FirecallItem[]> = {};

    for (const key of Object.keys(layers)) {
      groups[key] = [];
    }
    groups['default'] = [];

    for (const item of displayItems) {
      if (item.type === 'layer' || item.type === 'diary') continue;
      const layerId = item.layer;
      if (layerId && groups[layerId]) {
        groups[layerId].push(item);
      } else {
        groups['default'].push(item);
      }
    }

    // Sort items within each group by datum
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => a.datum?.localeCompare(b.datum || '') || 0);
    }

    return groups;
  }, [displayItems, layers]);

  const totalItems = useMemo(
    () => Object.values(groupedByLayer).reduce((sum, items) => sum + items.length, 0),
    [groupedByLayer]
  );

  if (!isAuthorized) {
    return <></>;
  }

  return (
    <Box sx={{ p: 2, m: 2 }}>
      <Typography variant="h3" gutterBottom>
        {totalItems} Einsatzmittel ({vehicles.length} Fahrzeuge){' '}
        <DownloadButton
          tooltip="Fahrzeuge als CSV herunterladen"
          onClick={() => downloadVehicles(vehicles)}
        />
      </Typography>

      {Object.entries(layers).map(([layerId, layer]) => {
        const items = groupedByLayer[layerId] || [];
        if (items.length === 0) return null;
        return (
          <LayerGroup
            key={layerId}
            layerName={layer.name}
            items={items}
            defaultExpanded={true}
          />
        );
      })}

      {groupedByLayer['default'] && groupedByLayer['default'].length > 0 && (
        <LayerGroup
          layerName="Nicht zugeordnet"
          items={groupedByLayer['default']}
          defaultExpanded={true}
        />
      )}
    </Box>
  );
}
