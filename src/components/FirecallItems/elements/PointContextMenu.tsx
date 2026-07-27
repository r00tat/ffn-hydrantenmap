'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useTranslations } from 'next-intl';

export interface PointContextMenuProps {
  /** Anchor position (viewport coordinates) or undefined when closed. */
  anchorPosition: { top: number; left: number } | undefined;
  /** Index of the point the menu operates on (-1 = none). */
  pointIndex: number;
  /** Total number of points of the element. */
  pointCount: number;
  /** Minimum number of points the element must keep (area: 3, line: 2). */
  minPoints: number;
  onClose: () => void;
  onInsert: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

/**
 * Right-click context menu for a single vertex of an area or line. Lets the
 * user insert a new point, delete the point or edit the whole element without
 * having to enable "Punkte immer anzeigen" first.
 */
export default function PointContextMenu({
  anchorPosition,
  pointIndex,
  pointCount,
  minPoints,
  onClose,
  onInsert,
  onDelete,
  onEdit,
}: PointContextMenuProps) {
  const t = useTranslations('firecallElements');
  const canDelete = pointCount > minPoints;

  const handle = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <Menu
      open={!!anchorPosition && pointIndex >= 0}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition}
      slotProps={{ list: { dense: true } }}
    >
      <MenuItem onClick={handle(onInsert)}>
        <ListItemIcon>
          <AddIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t('insertPoint')}</ListItemText>
      </MenuItem>
      <MenuItem onClick={handle(onDelete)} disabled={!canDelete}>
        <ListItemIcon>
          <DeleteIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t('deletePoint')}</ListItemText>
      </MenuItem>
      <Divider />
      <MenuItem onClick={handle(onEdit)}>
        <ListItemIcon>
          <EditIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t('editElement')}</ListItemText>
      </MenuItem>
    </Menu>
  );
}
