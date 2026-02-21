'use client';

import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  IconButton,
  Snackbar,
  Tooltip,
  Typography,
} from '@mui/material';
import Paper from '@mui/material/Paper';
import { styled } from '@mui/material/styles';
import Image from 'next/image';
import React from 'react';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import useMapEditor from '../../hooks/useMapEditor';
import NavigateButton from '../common/NavigateButton';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { FirecallItem } from '../firebase/firestore';
import { getItemInstance } from '../FirecallItems/elements';
import { FirecallItemBase } from '../FirecallItems/elements/FirecallItemBase';
import FirecallItemFields from '../FirecallItems/FirecallItemFields';
import FirecallItemUpdateDialog from '../FirecallItems/FirecallItemUpdateDialog';
import SidebarAddItemPanel from './SidebarAddItemPanel';
import SidebarDiaryPreview from './SidebarDiaryPreview';
import SidebarFirecallSummary from './SidebarFirecallSummary';

const SidebarBox = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isEditable',
})<{ isEditable?: boolean }>(({ theme }) => ({
  [theme.breakpoints.down('md')]: {
    width: '0%',
    display: 'none',
  },
  [theme.breakpoints.up('md')]: {
    width: '20%',
    minWidth: 280,
  },
  height: '100%',
  bgcolor: 'background.paper',
  borderLeft: 1,
  borderColor: 'divider',
  overflowY: 'auto',
  overflowX: 'hidden',
}));

function FirecallItemDisplay({ item }: { item: FirecallItem }) {
  const itemInstance = getItemInstance(item);
  const { editable, selectFirecallItem } = useMapEditor();
  const [displayUpdateDialog, setDisplayUpdateDialog] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const updateItem = useFirecallItemUpdate();

  // Inline editing state
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedItem, setEditedItem] = React.useState<FirecallItemBase | null>(null);
  const [snackbarOpen, setSnackbarOpen] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);

  const icon = itemInstance.icon();
  const isApiIcon = icon.options.iconUrl.indexOf('/api') > -1;

  const setItemField = (field: string, value: string | number | boolean) => {
    setEditedItem((prev) => prev ? prev.copy().set(field, value) : null);
  };

  const enterEditMode = () => {
    if (editable && item.editable !== false) {
      setEditedItem(getItemInstance(item.original || item));
      setIsEditing(true);
    }
  };

  const exitEditMode = (save: boolean) => {
    if (save && editedItem) {
      updateItem(editedItem.filteredData());
      selectFirecallItem(editedItem.filteredData());
      setSnackbarOpen(true);
    }
    setIsEditing(false);
    setEditedItem(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      // Don't save on Enter in textarea fields
      const target = event.target as HTMLElement;
      if (target.tagName === 'TEXTAREA') return;
      event.preventDefault();
      exitEditMode(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      exitEditMode(false);
    }
  };

  // Click outside handler
  React.useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Check if click is inside the card
      if (cardRef.current && cardRef.current.contains(target)) {
        return;
      }
      // Check if click is inside a MUI popover/menu (Select dropdowns render in portals)
      if (target.closest('.MuiPopover-root') || target.closest('.MuiModal-root')) {
        return;
      }
      // Cancel editing without saving
      setIsEditing(false);
      setEditedItem(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing]);

  const handleDelete = (confirmed: boolean) => {
    setConfirmDelete(false);
    if (confirmed) {
      updateItem({ ...item, deleted: true });
      selectFirecallItem(undefined);
      if (isEditing) {
        setIsEditing(false);
        setEditedItem(null);
      }
    }
  };

  return (
    <>
      <Card
        ref={cardRef}
        variant="outlined"
        onClick={!isEditing ? enterEditMode : undefined}
        onKeyDown={isEditing ? handleKeyDown : undefined}
        sx={{
          cursor: !isEditing && editable && item.editable !== false ? 'pointer' : 'default',
          borderColor: isEditing ? 'primary.main' : undefined,
          '&:hover': !isEditing && editable && item.editable !== false ? {
            borderColor: 'primary.light',
          } : {},
        }}
      >
        <CardHeader
          avatar={
            <Box
              sx={{
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {!isApiIcon && (
                <Image
                  src={icon.options.iconUrl}
                  alt={item.type || 'marker'}
                  width={24}
                  height={24}
                />
              )}
              {isApiIcon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={icon.options.iconUrl}
                  alt={item.type || 'marker'}
                  width={24}
                />
              )}
            </Box>
          }
          action={
            <Tooltip title="Schließen">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isEditing) {
                    exitEditMode(false);
                  }
                  selectFirecallItem(undefined);
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          }
          title={isEditing && editedItem ? editedItem.title() : itemInstance.title()}
          titleTypographyProps={{ variant: 'subtitle1', noWrap: true }}
          subheader={itemInstance.markerName()}
          subheaderTypographyProps={{ variant: 'caption' }}
          sx={{ pb: 0 }}
        />
        <CardContent sx={{ pt: 1, pb: 1 }}>
          {!isEditing && (
            <>
              {item.beschreibung && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {item.beschreibung}
                </Typography>
              )}
              {item.lat && item.lng && (
                <Typography variant="caption" color="text.secondary">
                  {Number.parseFloat('' + item.lat).toFixed(5)},{' '}
                  {Number.parseFloat('' + item.lng).toFixed(5)}
                </Typography>
              )}
            </>
          )}
          {isEditing && editedItem && (
            <Box onClick={(e) => e.stopPropagation()}>
              <FirecallItemFields
                item={editedItem}
                setItemField={setItemField}
                showLatLng={false}
                autoFocus
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 2, textAlign: 'center' }}
              >
                Enter = Speichern · Escape = Abbrechen
              </Typography>
            </Box>
          )}
        </CardContent>
        {editable && item.editable !== false && !isEditing && (
          <CardActions sx={{ pt: 0 }}>
            <Tooltip title="Bearbeiten">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  enterEditMode();
                }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Löschen">
              <IconButton
                size="small"
                color="error"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <NavigateButton lat={item.lat} lng={item.lng} />
          </CardActions>
        )}
        {!editable && !isEditing && item.lat && item.lng && (
          <CardActions sx={{ pt: 0 }}>
            <NavigateButton lat={item.lat} lng={item.lng} />
          </CardActions>
        )}
        {isEditing && (
          <CardActions sx={{ pt: 0 }}>
            <Tooltip title="Löschen">
              <IconButton
                size="small"
                color="error"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <NavigateButton lat={item.lat} lng={item.lng} />
          </CardActions>
        )}
        {displayUpdateDialog && (
          <FirecallItemUpdateDialog
            item={item.original || item}
            allowTypeChange={false}
            callback={(newItem) => {
              setDisplayUpdateDialog(false);
              if (newItem) {
                selectFirecallItem(newItem);
              }
            }}
          />
        )}
        {confirmDelete && (
          <ConfirmDialog
            title={`${itemInstance.title()} löschen`}
            text={`${itemInstance.markerName()} "${itemInstance.title()}" wirklich löschen?`}
            onConfirm={handleDelete}
          />
        )}
      </Card>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message="Gespeichert"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      />
    </>
  );
}

export default function MapSidebar() {
  const { editable, setEditable, selectedFirecallItem, historyModeActive } =
    useMapEditor();

  return (
    <SidebarBox isEditable={editable}>
      <Paper elevation={0} sx={{ px: 1.5, py: 1, height: '100%' }}>
        {!editable && !selectedFirecallItem && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Klicke auf ein Element auf der Karte, um Details anzuzeigen.
              Aktiviere den Bearbeitungsmodus, um Elemente hinzuzufügen.
            </Typography>
            {!historyModeActive && (
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => setEditable(true)}
                fullWidth
              >
                Bearbeiten aktivieren
              </Button>
            )}
          </Box>
        )}
        {selectedFirecallItem && (
          <FirecallItemDisplay item={selectedFirecallItem} />
        )}
        <SidebarAddItemPanel />
        <SidebarFirecallSummary />
        <SidebarDiaryPreview />
      </Paper>
    </SidebarBox>
  );
}
