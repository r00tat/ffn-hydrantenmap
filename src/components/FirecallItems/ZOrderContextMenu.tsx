import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';
import VerticalAlignTopIcon from '@mui/icons-material/VerticalAlignTop';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { FirecallItem } from '../firebase/firestore';
import useZOrderActions from '../../hooks/useZOrderActions';

export interface ZOrderContextMenuProps {
  item: FirecallItem | undefined;
  siblings: FirecallItem[];
  anchorPosition: { top: number; left: number } | undefined;
  onClose: () => void;
  onEdit?: (item: FirecallItem) => void;
  onDelete?: (item: FirecallItem) => void;
}

export default function ZOrderContextMenu({
  item,
  siblings,
  anchorPosition,
  onClose,
  onEdit,
  onDelete,
}: ZOrderContextMenuProps) {
  const { handleBringToFront, handleSendToBack, handleBringForward, handleSendBackward } =
    useZOrderActions(item, siblings);

  const handle = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <Menu
      open={!!anchorPosition}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition}
      slotProps={{ list: { dense: true } }}
    >
      {onEdit && item && (
        <MenuItem onClick={() => { onEdit(item); onClose(); }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Bearbeiten</ListItemText>
        </MenuItem>
      )}
      {onDelete && item && (
        <MenuItem onClick={() => { onDelete(item); onClose(); }}>
          <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Löschen</ListItemText>
        </MenuItem>
      )}
      {(onEdit || onDelete) && <Divider />}
      <MenuItem onClick={() => handle(handleBringToFront)}>
        <ListItemIcon><VerticalAlignTopIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Ganz nach vorne</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => handle(handleBringForward)}>
        <ListItemIcon><ArrowUpwardIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Nach vorne</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => handle(handleSendBackward)}>
        <ListItemIcon><ArrowDownwardIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Nach hinten</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => handle(handleSendToBack)}>
        <ListItemIcon><VerticalAlignBottomIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Ganz nach hinten</ListItemText>
      </MenuItem>
    </Menu>
  );
}
