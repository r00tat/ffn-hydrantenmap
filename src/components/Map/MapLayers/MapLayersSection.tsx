'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import LayersIcon from '@mui/icons-material/Layers';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { FirecallMapLayer } from '../../../common/mapLayers';
import {
  useFirecallMapLayerActions,
  useFirecallMapLayers,
} from '../../../hooks/useFirecallMapLayers';
import ConfirmDialog from '../../dialogs/ConfirmDialog';
import MapLayerDialog from './MapLayerDialog';

function MapLayerCard({
  layer,
  canEdit,
  onEdit,
  onDelete,
}: {
  layer: FirecallMapLayer;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('mapLayers');
  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <LayersIcon color="action" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" component="div">
              {layer.name}
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}
            >
              <Chip size="small" label={t(`types.${layer.overlayType}`)} />
              {layer.wmsLayers && (
                <Chip size="small" variant="outlined" label={layer.wmsLayers} />
              )}
              <Chip
                size="small"
                variant="outlined"
                label={`${t('fields.opacity')} ${Math.round(
                  (layer.opacity ?? 1) * 100
                )} %`}
              />
              {layer.enabled && (
                <Chip size="small" color="primary" label={t('defaultOn')} />
              )}
            </Stack>
            <Typography
              variant="caption"
              component="div"
              color="text.secondary"
              sx={{ mt: 0.5, wordBreak: 'break-all' }}
            >
              {layer.url}
            </Typography>
            {layer.beschreibung && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {layer.beschreibung}
              </Typography>
            )}
          </Box>
          {canEdit && (
            <Box sx={{ display: 'flex' }}>
              <Tooltip title={t('editTitle')}>
                <IconButton size="small" onClick={onEdit}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('deleteTitle')}>
                <IconButton size="small" color="error" onClick={onDelete}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

/**
 * Verwaltung der eigenen Kartenebenen eines Einsatzes.
 *
 * Steht auf der Seite „Ebenen" als eigener Abschnitt neben den Einsatz-Ebenen.
 * Die beiden sind verschiedene Dinge — eine Ebene bündelt Einsatzelemente, eine
 * Kartenebene ist ein externer Kartendienst — und die Überschriften sagen das.
 */
export default function MapLayersSection({
  canEdit = false,
}: {
  canEdit?: boolean;
}) {
  const t = useTranslations('mapLayers');
  const layers = useFirecallMapLayers();
  const { addMapLayer, updateMapLayer, deleteMapLayer } =
    useFirecallMapLayerActions();
  const [editing, setEditing] = useState<FirecallMapLayer | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<FirecallMapLayer | undefined>();

  const onDialogClose = useCallback(
    async (layer?: FirecallMapLayer) => {
      setDialogOpen(false);
      setEditing(undefined);
      if (!layer) return;
      if (layer.id) {
        await updateMapLayer(layer);
      } else {
        await addMapLayer(layer);
      }
    },
    [addMapLayer, updateMapLayer]
  );

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {t('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {t('intro')}
      </Typography>

      <Stack spacing={1} sx={{ mt: 1 }}>
        {layers.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('empty')}
          </Typography>
        )}
        {layers.map((layer) => (
          <MapLayerCard
            key={layer.id}
            layer={layer}
            canEdit={canEdit}
            onEdit={() => {
              setEditing(layer);
              setDialogOpen(true);
            }}
            onDelete={() => setDeleting(layer)}
          />
        ))}
      </Stack>

      {canEdit && (
        <Button
          sx={{ mt: 1 }}
          startIcon={<AddIcon />}
          onClick={() => {
            setEditing(undefined);
            setDialogOpen(true);
          }}
        >
          {t('add')}
        </Button>
      )}

      {dialogOpen && (
        <MapLayerDialog layer={editing} onClose={onDialogClose} />
      )}
      {deleting && (
        <ConfirmDialog
          title={t('deleteTitle')}
          text={t('deleteConfirm', { name: deleting.name })}
          onConfirm={async (confirmed) => {
            const layer = deleting;
            setDeleting(undefined);
            if (confirmed && layer) await deleteMapLayer(layer);
          }}
        />
      )}
    </Box>
  );
}
