'use client';

import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import L from 'leaflet';
import { useTranslations } from 'next-intl';
import useMapEditor from '../../hooks/useMapEditor';
import LiveLocationFab from '../LiveLocation/LiveLocationFab';
import { useFirecallItems } from '../firebase/firestoreHooks';
import AddFirecallItem from './AddFirecallItem';
import AiAssistantButton from './AiAssistantButton';
import RecordButton from './RecordButton';
import SearchButton from './SearchButton';

export interface MapActionButtonsOptions {
  map: L.Map;
}

export default function MapActionButtons({ map }: MapActionButtonsOptions) {
  const t = useTranslations('mapUi');
  const {
    editable,
    setEditable,
    historyId,
    selectHistory,
    openFirecallItemDialog,
  } = useMapEditor();
  const firecallItems = useFirecallItems();
  return (
    <>
      <LiveLocationFab />
      <Box
        sx={{
          // '& > :not(style)': { m: 1 },
          position: 'absolute',
          bottom: 64,
          right: 16,
        }}
      >
        {editable && (
          <Tooltip title={t('addElement')}>
            <Fab
              color="primary"
              aria-label="add"
              size="medium"
              onClick={(event) => {
                event.preventDefault();
                openFirecallItemDialog();
              }}
            >
              <AddIcon />
            </Fab>
          </Tooltip>
        )}

        {historyId === undefined && (
          <Tooltip title={editable ? t('disableEdit') : t('editMap')}>
            <Fab
              color={editable ? 'default' : 'primary'}
              aria-label="edit"
              size="medium"
              style={{ marginLeft: 8 }}
              onClick={(event) => {
                event.preventDefault();
                setEditable((prev) => !prev);
              }}
            >
              {!editable && <EditIcon />}
              {editable && <VisibilityIcon />}
            </Fab>
          </Tooltip>
        )}

        {historyId && (
          <Tooltip title={t('historyLockedEdit')}>
            <Fab
              color="error"
              aria-label="edit"
              size="medium"
              style={{ marginLeft: 8 }}
              onClick={() => selectHistory()}
            >
              <HistoryIcon />
            </Fab>
          </Tooltip>
        )}
      </Box>
      {editable && (
        <>
          <RecordButton />
          <SearchButton />
        </>
      )}
      <AddFirecallItem />
      {editable && <AiAssistantButton firecallItems={firecallItems} />}
    </>
  );
}
